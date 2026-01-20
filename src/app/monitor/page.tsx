'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { joinSession, subscribeToProctoringLogs, supabase, sendInstantSignal } from '@/lib/supabase';

const Proctoring = dynamic(() => import('@/components/Proctoring'), { ssr: false });
// Use Monaco for read-only code view
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

function MonitorContent() {
    const searchParams = useSearchParams();
    const sessionCode = searchParams.get('session');
    const router = useRouter();

    const [sessionData, setSessionData] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [trustScore, setTrustScore] = useState(100);
    const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

    // Controls
    const [sendingAction, setSendingAction] = useState(false);
    const [hintMessage, setHintMessage] = useState('');
    const [showBriefing, setShowBriefing] = useState(true);
    const [showEndSummary, setShowEndSummary] = useState(false);

    // Code View
    const [candidateAnswers, setCandidateAnswers] = useState<any[]>([]);
    const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);

    // Initial Load & Auth
    useEffect(() => {
        async function loadSession() {
            if (!sessionCode) return;

            // Auth Check
            const { data: { session: authSession } } = await supabase.auth.getSession();
            if (!authSession?.user) {
                const returnUrl = encodeURIComponent(`/monitor?session=${sessionCode}`);
                router.push(`/login?returnUrl=${returnUrl}`);
                return;
            }

            const session = await joinSession(sessionCode);
            if (session) {
                setSessionData(session);

                // 1. Fetch Existing Peer
                const { data: existingLogs } = await supabase
                    .from('proctoring_logs')
                    .select('*')
                    .eq('session_id', session.id)
                    .eq('event_type', 'PEER_CONNECT')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (existingLogs?.[0]?.details?.peerId) {
                    setRemotePeerId(existingLogs[0].details.peerId);
                }

                // 2. Realtime Sub
                const { unsubscribe } = subscribeToProctoringLogs(session.id, (log) => {
                    console.log('📡 [Monitor] Received Signal:', log.event_type, log.details);
                    if (log.event_type === 'PEER_CONNECT') {
                        setRemotePeerId(log.details?.peerId);
                    } else if (log.event_type === 'TRUST_SCORE_UPDATE') {
                        setTrustScore(log.details?.score);
                    } else if (!log.event_type.startsWith('HINT')) {
                        // Don't show our own hints as alerts from remote
                        setAlerts((prev) => [log, ...prev].slice(0, 50));
                    }
                });

                return () => {
                    console.log(`[Realtime] Unsubscribing monitor from ${session.id}`);
                    unsubscribe();
                };
            }
        }

        // 3. Robust Polling
        const checkPeer = async () => {
            if (!sessionCode) return;
            const { data } = await supabase
                .from('proctoring_logs')
                .select('*')
                .eq('event_type', 'PEER_CONNECT')
                .order('created_at', { ascending: false })
                .limit(1);

            if (data?.[0]?.details?.peerId) {
                setRemotePeerId(prev => (prev !== data[0].details.peerId ? data[0].details.peerId : prev));
            }
        };
        const pollInterval = setInterval(checkPeer, 3000);

        const cleanup = loadSession();
        return () => {
            clearInterval(pollInterval);
            cleanup.then(c => c && c());
        };
    }, [sessionCode, router]);

    // Fetch Answers
    useEffect(() => {
        if (!sessionData?.id) return;
        async function fetchAnswers() {
            const { data } = await supabase
                .from('answers')
                .select('*')
                .eq('session_id', sessionData.id)
                .order('question_id', { ascending: true });

            if (data) {
                setCandidateAnswers(data);
                if (!activeQuestionId && data.length > 0) setActiveQuestionId(data[0].question_id);
            }
        }
        fetchAnswers();
        const interval = setInterval(fetchAnswers, 4000);
        return () => clearInterval(interval);
    }, [sessionData, activeQuestionId]);


    // --- Actions ---
    const sendAdminAction = async (type: 'WARNING' | 'TERMINATE' | 'REFRESH' | 'HINT', details: any = {}) => {
        if (!sessionData?.id) return;
        setSendingAction(true);

        try {
            await sendInstantSignal(sessionData.id, type, details);

            // Local feedback for the log list
            if (type === 'HINT') {
                setAlerts(prev => [{ event_type: `HINT SENT: ${details.message}`, created_at: new Date().toISOString() }, ...prev]);
                setHintMessage('');
            } else {
                setAlerts(prev => [{ event_type: `⚠️ ${type} SENT`, created_at: new Date().toISOString() }, ...prev]);
            }
        } catch (err) {
            console.error('Action failed:', err);
            alert('Failed to send action. Please check your connection.');
        }

        setTimeout(() => setSendingAction(false), 800);
    };

    const goToReport = () => {
        if (!sessionData?.id) return;
        router.push(`/report?session=${sessionCode}`);
    };

    const activeCode = candidateAnswers.find(a => a.question_id === activeQuestionId)?.code || '// No code written yet';
    // Expired if > 24 hours
    const isExpired = sessionData?.created_at && (new Date().getTime() - new Date(sessionData.created_at).getTime() > 24 * 60 * 60 * 1000);


    return (
        <div className="h-screen flex flex-col bg-white font-sans text-slate-900 overflow-hidden">
            <style jsx global>{`
                body {
                    background-color: #ffffff;
                }
            `}</style>

            {/* Enterprise Header - Compact */}
            <header className="bg-white border-b border-slate-100 px-6 py-3 shrink-0 flex items-center justify-between z-20 shadow-sm relative">
                <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-[14px] font-black leading-tight text-slate-900 flex items-center gap-2">
                            ProctorAI <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest pl-2 border-l border-slate-200">Monitor</span>
                        </h1>
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-0.5">
                            {isExpired ? (
                                <span className="text-rose-500">Session Expired • Read Only</span>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-emerald-600">Live Session: {sessionCode}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5 leading-none">Integrity Score</div>
                        <div key={trustScore} className={`text-xl font-black leading-none animate-[pulse_0.4s_ease-in-out] ${trustScore > 80 ? 'text-emerald-600' : trustScore > 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                            {trustScore}%
                        </div>
                    </div>
                    <div className="h-8 w-px bg-slate-100"></div>
                    <button className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-rose-700 transition shadow-lg shadow-rose-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => { if (confirm("Terminate Session?")) { sendAdminAction('TERMINATE'); setShowEndSummary(true); } }}
                        disabled={isExpired}
                    >
                        End Session
                    </button>
                    <button
                        className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
                        onClick={() => router.push('/dashboard')}
                    >
                        Dashboard
                    </button>
                </div>
            </header>

            {/* Resizable Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {/* HORIZONTAL: Sidebar | Code */}
                {/* Using pixel values (numbers) for Sidebar to prevent text shrinking behavior */}
                <Group orientation="horizontal">

                    {/* LEFT PANEL: Controls & Video */}
                    {/* defaultSize=380 (pixels), minSize=280 (pixels) */}
                    {/* LEFT PANEL: Sidebar */}
                    <Panel defaultSize={380} minSize={280} maxSize={600} className="flex flex-col bg-slate-50/50 border-r border-slate-100">

                        <Group orientation="vertical">
                            {/* TOP: Video Section */}
                            <Panel defaultSize="45" minSize="35" className="flex flex-col">
                                <div className="h-full flex flex-col p-3 pb-0">
                                    <div className="flex items-center justify-between pb-2 px-2">
                                        <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-[0.2em] flex items-center gap-2">
                                            Video Feed
                                        </h3>
                                        {!isExpired && <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/10"></span>}
                                    </div>

                                    {/* Video Card - Tightened for zero dead space */}
                                    <div className="flex-1 bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm flex flex-col ring-1 ring-slate-900/[0.02] p-1.5">

                                        {/* Video Area - Added thick black border/frame */}
                                        <div className="bg-[#020617] relative aspect-video shrink-0 flex items-center justify-center overflow-hidden rounded-[1.5rem]">
                                            <div className="w-full h-full relative overflow-hidden bg-black">
                                                {isExpired ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 italic">
                                                        <div className="text-3xl mb-2 opacity-50">📼</div>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Session Terminated</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <Proctoring
                                                            sessionId={sessionData?.id}
                                                            isInterviewer={true}
                                                            remotePeerId={remotePeerId}
                                                        />
                                                        {/* Overlay Badge */}
                                                        <div className="absolute top-3 left-3 z-10 bg-black/40 backdrop-blur-md text-white text-[9px] font-black px-2.5 py-1 rounded-full border border-white/10 flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
                                                            LIVE
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quick Actions - More compact */}
                                        <div className="p-2 grid grid-cols-2 gap-2 mt-auto">
                                            <button
                                                onClick={() => sendAdminAction('WARNING', { message: 'Focus!' })}
                                                disabled={sendingAction || isExpired}
                                                className="flex items-center justify-center gap-2 py-2.5 bg-white text-amber-600 border border-amber-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-50 transition shadow-sm disabled:opacity-50"
                                            >
                                                Warn
                                            </button>
                                            <button
                                                onClick={() => sendAdminAction('REFRESH')}
                                                disabled={sendingAction || isExpired}
                                                className="flex items-center justify-center gap-2 py-2.5 bg-white text-indigo-600 border border-indigo-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition shadow-sm disabled:opacity-50"
                                            >
                                                Sync
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </Panel>

                            {/* Separator - Integrated */}
                            <Separator className="h-4 bg-transparent cursor-row-resize flex items-center justify-center -my-2 z-10 hover:scale-110 transition">
                                <div className="w-10 h-1 bg-slate-200 rounded-full hover:bg-indigo-400 transition-colors"></div>
                            </Separator>

                            {/* BOTTOM: Logs Section */}
                            <Panel minSize="30" className="flex flex-col">
                                <div className="h-full flex flex-col p-3 pt-0 overflow-hidden">
                                    <div className="flex items-center justify-between pb-2 px-2">
                                        <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-[0.2em] flex items-center gap-2">
                                            Integrity Log
                                        </h3>
                                        <span className="bg-slate-100 text-slate-500 text-[8px] font-black px-2 py-0.5 rounded-full border border-slate-200">{alerts.length}</span>
                                    </div>

                                    <div className="flex-1 bg-white rounded-[2rem] border border-slate-100 flex flex-col overflow-hidden shadow-sm ring-1 ring-slate-900/[0.02]">
                                        <div className="flex-1 overflow-y-auto p-0 scroll-smooth bg-white">
                                            {alerts.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 p-8">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Monitoring Signal...</p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-slate-50">
                                                    {alerts.map((alert, i) => (
                                                        <div key={i} className={`px-4 py-3 text-xs transition-colors hover:bg-slate-50/80 ${alert.event_type.includes('HINT') ? 'bg-indigo-50/20 border-l-2 border-indigo-500' :
                                                            alert.event_type.includes('WARNING') ? 'bg-amber-50/20 border-l-2 border-amber-500' :
                                                                'border-l-2 border-transparent'
                                                            }`}>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex justify-between items-start">
                                                                    <span className={`font-bold text-[11px] ${alert.event_type.includes('HINT') ? 'text-indigo-600' :
                                                                        alert.event_type.includes('WARNING') ? 'text-amber-700' :
                                                                            'text-slate-700'
                                                                        }`}>
                                                                        {alert.event_type}
                                                                    </span>
                                                                    <span className="text-[9px] font-mono text-slate-400 font-bold">
                                                                        {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        </Group>
                    </Panel>

                    {/* Resize Handle */}
                    <Separator className="w-1.5 bg-slate-200 hover:bg-indigo-500 transition-colors cursor-col-resize flex items-center justify-center z-50">
                        <div className="h-8 w-1 rounded-full bg-slate-400"></div>
                    </Separator>

                    {/* RIGHT PANEL: Code Editor */}
                    <Panel minSize={300} className="flex flex-col bg-[#1e1e1e] relative">
                        <div className="h-10 border-b border-slate-700/50 flex items-center justify-between px-4 bg-[#252526] shrink-0">
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2">Submissions:</span>
                                {candidateAnswers.map((ans) => (
                                    <button
                                        key={ans.question_id}
                                        onClick={() => setActiveQuestionId(ans.question_id)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition whitespace-nowrap ${activeQuestionId === ans.question_id
                                            ? 'bg-[#37373d] text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#2a2d2e]'
                                            }`}
                                    >
                                        Q{ans.question_id}
                                    </button>
                                ))}
                                {candidateAnswers.length === 0 && <span className="px-2 text-xs text-slate-500 italic">...</span>}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">READ-ONLY</span>
                        </div>

                        <div className="flex-1 relative">
                            <MonacoEditor
                                height="100%"
                                language="javascript"
                                value={activeCode}
                                theme="vs-dark"
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: true },
                                    fontSize: 13,
                                    fontFamily: "'Fira Code', monospace",
                                    domReadOnly: true,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    padding: { top: 20 }
                                }}
                            />
                        </div>

                        {/* Floating Hint Input - Overlaid on Code Editor Bottom */}
                        {!isExpired && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-20">
                                <div className="bg-white p-2 rounded-2xl shadow-2xl border border-slate-200 flex items-center gap-3 ring-1 ring-slate-900/5">
                                    <div className="pl-3 text-indigo-500 font-black text-xs uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">Hint</div>
                                    <input
                                        type="text"
                                        value={hintMessage}
                                        onChange={(e) => setHintMessage(e.target.value)}
                                        placeholder="Direct corrective guidance..."
                                        className="flex-1 bg-transparent border-none text-slate-800 text-sm focus:ring-0 placeholder-slate-400 font-bold"
                                        onKeyDown={(e) => e.key === 'Enter' && sendAdminAction('HINT', { message: hintMessage })}
                                    />
                                    <button
                                        onClick={() => sendAdminAction('HINT', { message: hintMessage })}
                                        disabled={sendingAction || !hintMessage.trim()}
                                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                                    >
                                        {sendingAction ? '...' : 'Send'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </Panel>

                </Group>
            </div>

            {/* UPGRADE: Proctoring Briefing Modal */}
            {showBriefing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 overflow-y-auto">
                    <div className="bg-white rounded-[3rem] p-10 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-4xl mb-8 border border-indigo-100 shadow-sm">🛡️</div>
                        <h2 className="text-3xl font-black text-slate-900 mb-2 leading-tight">Security Protocol</h2>
                        <p className="text-slate-500 text-sm mb-10 font-medium">Real-time analytical monitoring is currently active for this session.</p>

                        <div className="space-y-4 mb-10 text-left">
                            <div className="flex gap-5 p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">👁️</div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest mb-1">Gaze Deviation</h4>
                                    <p className="text-[11px] text-slate-500 font-medium">Alerts if candidate looks away from screen or at external materials.</p>
                                </div>
                            </div>
                            <div className="flex gap-5 p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">👤</div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest mb-1">Pose Integrity</h4>
                                    <p className="text-[11px] text-slate-500 font-medium">Detects head turns or tilts suggesting secondary device usage.</p>
                                </div>
                            </div>
                            <div className="flex gap-5 p-5 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-sm">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-slate-200">👥</div>
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest mb-1">Identity Presence</h4>
                                    <p className="text-[11px] text-slate-500 font-medium">Flags if multiple people enter frame or if candidate disappears.</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowBriefing(false)}
                            className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[12px] uppercase tracking-[0.2em] hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 active:scale-95"
                        >
                            Confirm & Begin Monitor
                        </button>
                    </div>
                </div>
            )}

            {/* UPGRADE: Integrity Report Modal (Post-Session) */}
            {showEndSummary && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-xl p-6 overflow-y-auto">
                    <div className="bg-white rounded-[3rem] p-12 max-w-xl w-full shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-12 duration-500">
                        <div className="text-center mb-10">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl mb-6 mx-auto border border-slate-100 shadow-sm">📊</div>
                            <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Session Audit Concluded</h2>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Behavioral Signal Analysis</p>
                        </div>

                        <div className="flex items-center gap-6 p-8 rounded-[2.5rem] bg-slate-50 border border-slate-200 mb-10 shadow-sm">
                            <div className="flex-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Integrity Metric</p>
                                <div className={`text-5xl font-black ${trustScore > 80 ? 'text-emerald-600' : trustScore > 50 ? 'text-amber-500' : 'text-rose-600'}`}>
                                    {trustScore}%
                                </div>
                            </div>
                            <div className="h-16 w-px bg-slate-200"></div>
                            <div className="flex-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Classified Risk</p>
                                <div className={`text-base font-black ${trustScore > 80 ? 'text-emerald-600' : trustScore > 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                    {trustScore > 80 ? 'LOW RISK' : trustScore > 50 ? 'MODERATE' : 'HIGH RISK'}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 mb-12">
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Observed Signals</h4>
                            <div className="grid gap-3">
                                {alerts.length === 0 ? (
                                    <div className="p-5 rounded-2xl bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100 flex items-center gap-3">
                                        ✨ No notable behavioral violations detected.
                                    </div>
                                ) : (
                                    <>
                                        {alerts.filter(a => a.event_type.includes('👁️')).length > 5 && (
                                            <div className="p-5 rounded-2xl bg-amber-50 text-amber-800 text-[11px] border border-amber-100 flex gap-4 font-bold">
                                                <span className="shrink-0">🚩</span> <div><strong>Persistent Deviations:</strong> Candidate repeatedly shifted gaze away from assessment focal area.</div>
                                            </div>
                                        )}
                                        {alerts.filter(a => a.event_type.includes('👥')).length > 0 && (
                                            <div className="p-5 rounded-2xl bg-rose-50 text-rose-800 text-[11px] border border-rose-100 flex gap-4 font-black">
                                                <span className="shrink-0">🚫</span> <div><strong>Unauthorized Presence:</strong> Secondary individuals detected within the surveillance zone.</div>
                                            </div>
                                        )}
                                        {alerts.filter(a => a.event_type.includes('⚠️ Head')).length > 10 && (
                                            <div className="p-5 rounded-2xl bg-amber-50 text-amber-800 text-[11px] border border-amber-100 flex gap-4 font-bold">
                                                <span className="shrink-0">🚩</span> <div><strong>Structural Pose Flags:</strong> Detected frequent irregular head rotation.</div>
                                            </div>
                                        )}
                                        {alerts.length > 0 && (
                                            <div className="p-5 rounded-2xl bg-slate-50 text-slate-600 text-[11px] border border-slate-200 flex gap-4 font-bold">
                                                <span className="shrink-0 text-slate-400">ℹ️</span> <div><strong>Metric Overview:</strong> Analytical summary based on {alerts.length} total signals.</div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="flex-1 py-5 bg-white text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition shadow-sm"
                            >
                                Dashboard
                            </button>
                            <button
                                onClick={goToReport}
                                className="flex-1 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20"
                            >
                                Detailed Audit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function MonitorPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <MonitorContent />
        </Suspense>
    );
}
