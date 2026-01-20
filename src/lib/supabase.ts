import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ftwghcaukzpxdsoyhnnm.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0d2doY2F1a3pweGRzb3lobm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY3MzAsImV4cCI6MjA4NDUwMjczMH0.QgvaMOOn6RNOGOndSxNpuG0slCDl5SnOucxLgRdblTE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Session Management
// Session Management
export async function createSession(code: string, userId?: string) {
    const payload: any = { code, status: 'waiting' };
    if (userId) payload.created_by = userId;

    const { data, error } = await supabase
        .from('sessions')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('Create session error:', error);
        return null;
    }
    return data;
}

export async function getInterviewerSessions(userId: string) {
    const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch sessions error:', error);
        return [];
    }
    return data;
}

export async function joinSession(code: string) {
    const { data, error } = await supabase
        .from('sessions')
        .select()
        .eq('code', code.toUpperCase())
        .single();

    if (error) {
        console.error('Join session error:', error);
        return null;
    }

    if (data) {
        await supabase
            .from('sessions')
            .update({ status: 'active' })
            .eq('id', data.id);
    }

    return data;
}

export async function updateSessionTimeLimit(sessionId: string, minutes: number) {
    const { error } = await supabase
        .from('sessions')
        .update({ time_limit_minutes: minutes })
        .eq('id', sessionId);

    return !error;
}

// Answer Management
export async function saveAnswer(sessionId: string, questionId: number, code: string) {
    const { data, error } = await supabase
        .from('answers')
        .upsert({
            session_id: sessionId,
            question_id: questionId,
            code
        }, { onConflict: 'session_id,question_id' })
        .select();

    if (error) console.error('Save answer error:', error);
    return data;
}

export async function getAnswers(sessionId: string) {
    const { data, error } = await supabase
        .from('answers')
        .select()
        .eq('session_id', sessionId);

    if (error) console.error('Get answers error:', error);
    return data || [];
}

// Proctoring Logs - Batched
let eventBatch: any[] = [];
let batchTimer: NodeJS.Timeout | null = null;
const BATCH_INTERVAL = 5000;

export function queueProctoringEvent(sessionId: string, eventType: string, details = {}) {
    eventBatch.push({
        session_id: sessionId,
        event_type: eventType,
        details,
        created_at: new Date().toISOString()
    });

    if (!batchTimer) {
        batchTimer = setTimeout(() => flushEvents(), BATCH_INTERVAL);
    }
}

export async function flushEvents() {
    if (eventBatch.length === 0) return;

    const eventsToSend = [...eventBatch];
    eventBatch = [];
    batchTimer = null;

    const { error } = await supabase
        .from('proctoring_logs')
        .insert(eventsToSend);

    if (error) console.error('Batch log error:', error);
}

export function logProctoringEvent(sessionId: string, eventType: string, details = {}) {
    // Immediate broadcast for critical alerts or peer signals
    if (eventType === 'PEER_CONNECT' || eventType.includes('⚠️') || eventType.includes('👁️')) {
        sendInstantSignal(sessionId, eventType, details);
        return;
    }

    queueProctoringEvent(sessionId, eventType, details);
}

// Sync trust score via Broadcast and Persist to DB
export async function updateTrustScore(sessionId: string, score: number) {
    sendInstantSignal(sessionId, 'TRUST_SCORE_UPDATE', { score });

    // Persist to session table so dashboard can show it easily
    const { error } = await supabase
        .from('sessions')
        .update({ trust_score: score })
        .eq('id', sessionId);

    if (error) console.error('Error persisting trust score:', error);
}

// Real-time Subscriptions (Shared Channels with Multiple Callbacks)
const activeChannels = new Map<string, any>();
const channelCallbacks = new Map<string, Set<(log: any) => void>>();

export function subscribeToProctoringLogs(sessionId: string, callback: (log: any) => void) {
    // 1. Initialize or get callback set
    if (!channelCallbacks.has(sessionId)) {
        channelCallbacks.set(sessionId, new Set());
    }
    channelCallbacks.get(sessionId)!.add(callback);

    const unsubscribe = () => {
        const callbacks = channelCallbacks.get(sessionId);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                const channel = activeChannels.get(sessionId);
                if (channel) {
                    supabase.removeChannel(channel);
                    activeChannels.delete(sessionId);
                }
                channelCallbacks.delete(sessionId);
            }
        }
    };

    // 2. Reuse or create channel
    if (activeChannels.has(sessionId)) {
        console.log(`[Realtime] Reusing exists channel and adding callback for ${sessionId}`);
        return { unsubscribe, channel: activeChannels.get(sessionId) };
    }

    console.log(`[Realtime] Creating new channel for ${sessionId}`);
    const channel = supabase.channel(`proctoring:${sessionId}`);
    activeChannels.set(sessionId, channel);

    const handleLog = (log: any) => {
        const callbacks = channelCallbacks.get(sessionId);
        if (callbacks) callbacks.forEach(cb => cb(log));
    };

    channel
        // Mode 1: Listen for DB Inserts
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'proctoring_logs',
            filter: `session_id=eq.${sessionId}`
        }, (payload) => handleLog(payload.new))
        // Mode 2: Listen for Broadcasts
        .on('broadcast', { event: 'signal' }, (payload) => {
            console.log('📡 [Broadcast] Received:', payload.payload.event_type);
            handleLog(payload.payload);
        })
        .subscribe((status: string) => {
            console.log(`[Realtime] Subscription status for ${sessionId}:`, status);
        });

    return { unsubscribe, channel };
}

// Helper to send instant signals via Broadcast
export async function sendInstantSignal(sessionId: string, type: string, details = {}) {
    const payload = {
        session_id: sessionId,
        event_type: type,
        details,
        created_at: new Date().toISOString()
    };

    console.log(`[Signal] Attempting to send ${type} to session ${sessionId}`, details);

    // 1. Log to DB (Persistent)
    const { error: dbError } = await supabase.from('proctoring_logs').insert(payload);
    if (dbError) console.error('[Signal] DB Log Error:', dbError);

    // 2. Broadcast to connected clients (Instant)
    let channel = activeChannels.get(sessionId);

    const broadcastMessage = async (chan: any) => {
        const resp = await chan.send({
            type: 'broadcast',
            event: 'signal',
            payload: payload
        });
        console.log(`[Signal] Broadcast ${type} sent status:`, resp);
    };

    if (!channel) {
        console.log(`[Signal] No active channel for ${sessionId}, creating temp one`);
        channel = supabase.channel(`proctoring:${sessionId}`);
        channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                await broadcastMessage(channel);
                // Don't kill it immediately, keep it for a bit in case of rapid signals
                if (!activeChannels.has(sessionId)) {
                    setTimeout(() => supabase.removeChannel(channel), 10000);
                }
            }
        });
    } else {
        // If channel exists but isn't subscribed yet, it might be in transition.
        // For simplicity, if it's already in our map, we assume it's being handled.
        await broadcastMessage(channel);
    }
}


