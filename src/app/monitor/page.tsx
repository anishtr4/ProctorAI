'use client';

import { useRouter } from 'next/navigation'; // Added useRouter
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { joinSession, subscribeToProctoringLogs, supabase } from '@/lib/supabase';

const Proctoring = dynamic(() => import('@/components/Proctoring'), { ssr: false });

function MonitorContent() {
    const searchParams = useSearchParams();
    const sessionCode = searchParams.get('session');

    const [sessionData, setSessionData] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [trustScore, setTrustScore] = useState(100);
    const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

    const router = useRouter(); // Import at top

    useEffect(() => {
        async function loadSession() {
            if (!sessionCode) return;

            // Check Auth first
            const { data: { session: authSession } } = await supabase.auth.getSession();
            if (!authSession?.user) {
                // Store return URL
                const returnUrl = encodeURIComponent(`/monitor?session=${sessionCode}`);
                router.push(`/login?returnUrl=${returnUrl}`);
                return;
            }

            const session = await joinSession(sessionCode);
            if (session) {
                setSessionData(session);

                // 1. Fetch EXISTING connection signal (if candidate already joined)
                const { data: existingLogs } = await supabase
                    .from('proctoring_logs')
                    .select('*')
                    .eq('session_id', session.id)
                    .eq('event_type', 'PEER_CONNECT')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (existingLogs && existingLogs.length > 0) {
                    const lastLog = existingLogs[0];
                    if (lastLog.details?.peerId) {
                        console.log("Found existing peer:", lastLog.details.peerId);
                        setRemotePeerId(lastLog.details.peerId);
                    }
                }

                // 2. Subscribe to NEW signals
                const channel = subscribeToProctoringLogs(session.id, (log) => {
                    if (log.event_type === 'PEER_CONNECT') {
                        console.log("Received LIVE peer signal:", log.details?.peerId);
                        setRemotePeerId(log.details?.peerId);
                    } else {
                        setAlerts((prev) => [log, ...prev].slice(0, 20));
                        if (log.event_type.includes('Looking')) {
                            setTrustScore((prev) => Math.max(0, prev - 5));
                        }
                    }
                });

                // Cleanup
                return () => {
                    supabase.removeChannel(channel);
                };
            }
        }

        // 3. Fallback Polling (Robustness)
        const checkPeer = async () => {
            if (!sessionCode) return;
            const { data } = await supabase
                .from('proctoring_logs')
                .select('*')
                .eq('event_type', 'PEER_CONNECT')
                .order('created_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0 && data[0].details?.peerId) {
                // If we don't have a remote ID yet, or it's different, update
                setRemotePeerId(prev => {
                    if (prev !== data[0].details.peerId) {
                        console.log("Polling found NEW peerId:", data[0].details.peerId);
                        return data[0].details.peerId;
                    }
                    return prev;
                });
            }
        };

        const pollInterval = setInterval(checkPeer, 3000);

        // We can't easily return the cleanup from the async function to the effect
        // So we'll use a ref or separate the logic.
        // For simplicity, we'll let the subscription persist for the component lifecycle
        // But to be correct, better structure:
        let channel: any = null;

        loadSession().then(ch => { channel = ch; });

        return () => {
            clearInterval(pollInterval);
            if (channel) supabase.removeChannel(channel);
        };
    }, [sessionCode, router]);

    const [activeTab, setActiveTab] = useState<'alerts' | 'code'>('alerts');
    const [candidateAnswers, setCandidateAnswers] = useState<any[]>([]);
    const [hintMessage, setHintMessage] = useState('');
    const [sendingHint, setSendingHint] = useState(false);

    // Fetch answers periodically
    useEffect(() => {
        if (!sessionData?.id) return;

        async function fetchAnswers() {
            const { data } = await supabase
                .from('answers')
                .select('*')
                .eq('session_id', sessionData.id)
                .order('question_id', { ascending: true });

            if (data) setCandidateAnswers(data);
        }

        fetchAnswers();
        const interval = setInterval(fetchAnswers, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [sessionData]);

    const sendHint = async () => {
        if (!hintMessage.trim() || !sessionData?.id) return;
        setSendingHint(true);

        await supabase.from('proctoring_logs').insert({
            session_id: sessionData.id,
            event_type: 'HINT',
            details: { message: hintMessage },
            created_at: new Date().toISOString()
        });

        // Add to local alerts for visibility
        setAlerts(prev => [{ event_type: `HINT SENT: ${hintMessage}`, created_at: new Date().toISOString() }, ...prev]);
        setHintMessage('');
        setSendingHint(false);
    };

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
                    <span className="font-bold text-indigo-600">ProctorAI</span>
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">Interviewer</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">Session: {sessionCode}</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Monitoring</span>
                </div>
            </header>

            {/* Main */}
            <main className="max-w-7xl mx-auto p-6 grid grid-cols-[1fr_400px] gap-6">
                {/* Left Panel: Video + Hint Input */}
                <div className="space-y-6">
                    <Proctoring
                        sessionId={sessionData?.id}
                        isInterviewer={true}
                        remotePeerId={remotePeerId} // Changed from onLog hack
                        onTrustScoreChange={setTrustScore}
                        onAlert={(msg) => setAlerts(prev => [{ event_type: msg, created_at: new Date().toISOString() }, ...prev].slice(0, 20))}
                    />

                    {/* Hint Input */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Send Hint to Candidate</h3>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={hintMessage}
                                onChange={(e) => setHintMessage(e.target.value)}
                                placeholder="Type a helpful hint..."
                                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                onKeyDown={(e) => e.key === 'Enter' && sendHint()}
                            />
                            <button
                                onClick={sendHint}
                                disabled={sendingHint || !hintMessage.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Tabs (Alerts / Code) */}
                <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[calc(100vh-140px)]">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab('alerts')}
                            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'alerts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Alerts ({alerts.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'code' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            Submissions
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-0">
                        {activeTab === 'alerts' ? (
                            <div className="p-6">
                                {alerts.length === 0 ? (
                                    <div className="text-center text-slate-400 py-12">
                                        <div className="text-4xl mb-2">🔔</div>
                                        <p>No alerts yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {alerts.map((alert, i) => (
                                            <div key={i} className={`border-l-4 rounded-lg p-4 ${alert.event_type.startsWith('HINT') ? 'bg-indigo-50 border-indigo-500' : 'bg-red-50 border-red-500'}`}>
                                                <div className={`font-semibold ${alert.event_type.startsWith('HINT') ? 'text-indigo-700' : 'text-red-700'}`}>{alert.event_type}</div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    {new Date(alert.created_at).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-0">
                                {candidateAnswers.length === 0 ? (
                                    <div className="text-center text-slate-400 py-12">
                                        <div className="text-4xl mb-2">💻</div>
                                        <p>No code submitted yet</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {candidateAnswers.map((ans, i) => (
                                            <div key={i} className="p-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-bold text-slate-500 uppercase">Question {ans.question_id}</span>
                                                    <span className="text-xs text-slate-400">{new Date(ans.created_at).toLocaleTimeString()}</span>
                                                </div>
                                                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs overflow-x-auto font-mono">
                                                    {ans.code}
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function MonitorPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-lg text-slate-500">Loading monitor...</div>
            </div>
        }>
            <MonitorContent />
        </Suspense>
    );
}
