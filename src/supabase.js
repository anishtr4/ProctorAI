import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ftwghcaukzpxdsoyhnnm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0d2doY2F1a3pweGRzb3lobm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjY3MzAsImV4cCI6MjA4NDUwMjczMH0.QgvaMOOn6RNOGOndSxNpuG0slCDl5SnOucxLgRdblTE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Session Management
export async function createSession(code) {
    const { data, error } = await supabase
        .from('sessions')
        .insert({ code, status: 'waiting' })
        .select()
        .single();

    if (error) {
        console.error('Create session error:', error);
        return null;
    }
    return data;
}

export async function joinSession(code) {
    const { data, error } = await supabase
        .from('sessions')
        .select()
        .eq('code', code.toUpperCase())
        .single();

    if (error) {
        console.error('Join session error:', error);
        return null;
    }

    // Update status to active
    if (data) {
        await supabase
            .from('sessions')
            .update({ status: 'active' })
            .eq('id', data.id);
    }

    return data;
}

export async function updateSessionTimeLimit(sessionId, minutes) {
    const { error } = await supabase
        .from('sessions')
        .update({ time_limit_minutes: minutes })
        .eq('id', sessionId);

    return !error;
}

// Answer Management
export async function saveAnswer(sessionId, questionId, code) {
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

export async function getAnswers(sessionId) {
    const { data, error } = await supabase
        .from('answers')
        .select()
        .eq('session_id', sessionId);

    if (error) console.error('Get answers error:', error);
    return data || [];
}

// Proctoring Logs - BATCHED for network optimization
let eventBatch = [];
let batchTimer = null;
const BATCH_INTERVAL = 5000; // Flush every 5 seconds

export function queueProctoringEvent(sessionId, eventType, details = {}) {
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

// Alias for backwards compatibility
export function logProctoringEvent(sessionId, eventType, details = {}) {
    queueProctoringEvent(sessionId, eventType, details);
}

// Real-time Subscriptions
export function subscribeToSession(sessionId, callback) {
    return supabase
        .channel(`session:${sessionId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'answers',
            filter: `session_id=eq.${sessionId}`
        }, callback)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'proctoring_logs',
            filter: `session_id=eq.${sessionId}`
        }, callback)
        .subscribe();
}

export function subscribeToProctoringLogs(sessionId, callback) {
    return supabase
        .channel(`proctoring:${sessionId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'proctoring_logs',
            filter: `session_id=eq.${sessionId}`
        }, (payload) => callback(payload.new))
        .subscribe();
}
