import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ftwghcaukzpxdsoyhnnm.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0d2doY2F1a3pweGRzb3lobm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY3MzAsImV4cCI6MjA4NDUwMjczMH0.QgvaMOOn6RNOGOndSxNpuG0slCDl5SnOucxLgRdblTE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Session Management
export async function createSession(code: string, userId?: string) {
    const payload: { code: string; status: string; created_by?: string } = { code, status: 'waiting' };
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
let eventBatch: {
    session_id: string;
    event_type: string;
    details: Record<string, unknown>;
    created_at: string;
}[] = [];
let batchTimer: NodeJS.Timeout | null = null;
const BATCH_INTERVAL = 5000;

export function queueProctoringEvent(sessionId: string, eventType: string, details: Record<string, unknown> = {}) {
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

export function logProctoringEvent(sessionId: string, eventType: string, details: Record<string, unknown> = {}) {
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
const activeChannels = new Map<string, unknown>();
const channelCallbacks = new Map<string, Set<(log: { event_type: string; details: Record<string, unknown>;[key: string]: unknown }) => void>>();

export function subscribeToProctoringLogs(sessionId: string, callback: (log: { event_type: string; details: Record<string, unknown>;[key: string]: unknown }) => void) {
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    supabase.removeChannel(channel as any);
                    activeChannels.delete(sessionId);
                }
                channelCallbacks.delete(sessionId);
            }
        }
    };

    // 2. Reuse or create channel
    if (activeChannels.has(sessionId)) {
        console.log(`[Realtime] Reusing existing channel and adding callback for ${sessionId}`);
        return { unsubscribe, channel: activeChannels.get(sessionId) };
    }

    console.log(`[Realtime] Creating new channel for ${sessionId}`);
    const channel = supabase.channel(`proctoring:${sessionId}`);
    activeChannels.set(sessionId, channel);

    const handleLog = (log: { event_type: string; details: Record<string, unknown>;[key: string]: unknown }) => {
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
        }, (payload) => handleLog(payload.new as { event_type: string; details: Record<string, unknown>;[key: string]: unknown }))
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
export async function sendInstantSignal(sessionId: string, type: string, details: Record<string, unknown> = {}) {
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
    const channel = activeChannels.get(sessionId);

    const broadcastMessage = async (chan: { send: (arg: unknown) => Promise<unknown> }) => {
        const resp = await chan.send({
            type: 'broadcast',
            event: 'signal',
            payload: payload
        });
        console.log(`[Signal] Broadcast ${type} sent status:`, resp);
    };

    if (!channel) {
        console.log(`[Signal] No active channel for ${sessionId}, creating temp one`);
        const tempChannel = supabase.channel(`proctoring:${sessionId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tempChannel as any).subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await broadcastMessage(tempChannel as any);
                // Don't kill it immediately, keep it for a bit in case of rapid signals
                if (!activeChannels.has(sessionId)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setTimeout(() => supabase.removeChannel(tempChannel as any), 10000);
                }
            }
        });
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await broadcastMessage(channel as any);
    }
}
