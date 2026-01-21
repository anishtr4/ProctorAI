'use client';

import { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { joinSession, saveAnswer, getAnswers, logProctoringEvent, flushEvents, subscribeToProctoringLogs } from '@/lib/supabase';
import { questions } from '@/lib/questions';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const Proctoring = dynamic(() => import('@/components/Proctoring'), { ssr: false });

function AssessmentContent() {
    const searchParams = useSearchParams();
    const sessionCode = searchParams.get('session');

    const [sessionData, setSessionData] = useState<{ id: string } | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [isTerminated, setIsTerminated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timeRemaining, setTimeRemaining] = useState(15 * 60);
    const [code, setCode] = useState('');
    const [lastHint, setLastHint] = useState<{ type: 'hint' | 'warning'; message: string } | null>(null);
    const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const activeQuestions = questions.slice(0, 5);
    const currentQuestion = activeQuestions[currentQuestionIndex];

    const [realtimeStatus, setRealtimeStatus] = useState<'SUBSCRIBED' | 'CONNECTING' | 'ERROR'>('CONNECTING');
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        async function loadSession() {
            if (!sessionCode) {
                setIsExpired(true);
                setIsLoading(false);
                return;
            }

            const session = await joinSession(sessionCode);
            if (session) {
                setSessionData(session);

                // Fetch saved answers
                const savedAnswers = await getAnswers(session.id);
                const answerMap: Record<number, string> = {};
                savedAnswers.forEach((a: { question_id: number; code: string }) => { answerMap[a.question_id] = a.code; });
                setAnswers(answerMap);

                // Subscribe to Proctoring Events (Hints, Warnings, Actions)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { unsubscribe, channel } = subscribeToProctoringLogs(session.id, (log: any) => {
                    console.log('🔔 [Assessment] Received Realtime Log:', log);

                    if (log.event_type === 'HINT' || log.event_type === 'WARNING') {
                        // Clear existing timer to prevent premature closing
                        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);

                        const logEvent = log as { event_type: string; details: Record<string, unknown> };
                        const msg = (logEvent.details?.message as string) || (logEvent.event_type === 'HINT' ? 'New hint' : 'Warning');
                        setLastHint({ type: logEvent.event_type === 'HINT' ? 'hint' : 'warning', message: msg });

                        // Auto-hide after 8s
                        hintTimeoutRef.current = setTimeout(() => setLastHint(null), 8000);
                    }
                    else if (log.event_type === 'REFRESH') {
                        window.location.reload();
                    }
                    else if (log.event_type === 'TERMINATE') {
                        setIsTerminated(true);
                        flushEvents();
                    }
                });
                unsubscribeRef.current = unsubscribe;

                // Track status
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (channel as any).subscribe((status: string) => {
                    if (status === 'SUBSCRIBED') setRealtimeStatus('SUBSCRIBED');
                    else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('ERROR');
                });
            }
            setIsLoading(false);
        }
        loadSession();

        // Cleanup timer and subscription on unmount
        return () => {
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
            if (unsubscribeRef.current) unsubscribeRef.current();
        };
    }, [sessionCode]);

    // Auto-save code periodically (debounce)
    useEffect(() => {
        if (!sessionData || !currentQuestion || !code) return;

        const timeout = setTimeout(() => {
            saveAnswer(sessionData.id, currentQuestion.id, code);
        }, 3000); // Auto-save after 3s of inactivity

        return () => clearTimeout(timeout);
    }, [code, sessionData, currentQuestion]);

    useEffect(() => {
        if (currentQuestion) {
            setCode(answers[currentQuestion.id] || currentQuestion.starterCode);
        }
    }, [currentQuestionIndex, currentQuestion, answers]);

    const handleSubmit = useCallback(async () => {
        if (sessionData && currentQuestion) {
            await saveAnswer(sessionData.id, currentQuestion.id, code);
        }
        setAnswers(prev => ({ ...prev, [currentQuestion.id]: code }));

        if (currentQuestionIndex < activeQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setTimeRemaining(15 * 60);
        } else {
            flushEvents();
            alert('Assessment complete!');
        }
    }, [sessionData, currentQuestion, code, currentQuestionIndex, activeQuestions.length]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev <= 1) {
                    handleSubmit();
                    return 15 * 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [currentQuestionIndex, handleSubmit]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && sessionData) {
                logProctoringEvent(sessionData.id, '🚫 Tab switched', {});
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [sessionData]);
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (isTerminated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800 border border-slate-700 rounded-3xl p-12 max-w-lg text-center shadow-2xl">
                    <div className="text-6xl mb-6">🛑</div>
                    <h2 className="text-3xl font-extrabold text-red-500 mb-4">Session Terminated</h2>
                    <p className="text-slate-300 text-lg mb-8">The interviewer has ended your assessment session.</p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="px-8 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition w-full"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-lg text-slate-500">Loading assessment...</div>
            </div>
        );
    }

    if (isExpired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="bg-white border border-red-200 rounded-3xl p-12 max-w-md text-center">
                    <div className="text-6xl mb-4">⏰</div>
                    <h2 className="text-2xl font-extrabold text-red-600 mb-2">Session Expired</h2>
                    <p className="text-slate-500">This assessment link has expired or is invalid.</p>
                    <p className="text-sm text-slate-400 mt-4">Please contact your interviewer for a new link.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-slate-100 flex flex-col overflow-hidden">
            {/* Header */}
            {/* ... */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 flex items-center justify-between z-50 shadow-sm relative">
                <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
                    <span className="font-bold text-indigo-600 font-sans tracking-tight">ProctorAI</span>
                    <div className="flex items-center gap-2 ml-2">
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-extrabold uppercase tracking-widest">Candidate</span>
                        <div className={`w-2 h-2 rounded-full transition-all duration-500 shadow-sm ${realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 shadow-green-500/50' : realtimeStatus === 'CONNECTING' ? 'bg-amber-400 animate-pulse' : 'bg-red-500 shadow-red-500/50'}`}
                            title={`Realtime Feed: ${realtimeStatus}`}></div>
                    </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-slate-500 font-medium">Question {currentQuestionIndex + 1} of {activeQuestions.length}</span>
                    <span className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold border border-red-100 shadow-sm">⏱️ {formatTime(timeRemaining)}</span>
                </div>
            </header>

            {/* Hint/Warning Toast - Z-Index Boosted to 100 */}
            <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 transform ${lastHint ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
                {lastHint && (
                    <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 border ring-4 ring-black/5
                        ${lastHint.type === 'warning' ? 'bg-red-600 text-white border-red-500' : 'bg-[#1e1e1e] text-white border-slate-700'}`}>
                        <div className="text-3xl animate-bounce">
                            {lastHint.type === 'warning' ? '⚠️' : '💡'}
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-[10px] font-bold uppercase tracking-wider opacity-75 ${lastHint.type === 'warning' ? 'text-red-100' : 'text-indigo-200'}`}>
                                {lastHint.type === 'warning' ? 'Official Warning' : 'Hint from Interviewer'}
                            </span>
                            <span className="font-bold text-base md:text-lg max-w-md drop-shadow-md">{lastHint.message}</span>
                        </div>
                        <button onClick={() => setLastHint(null)} className="ml-4 p-2 hover:bg-white/20 rounded-full transition">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Main */}
            <main className="flex-1 grid grid-cols-[1fr_280px] gap-4 p-4 overflow-hidden relative">
                {/* Mini Video (Candidate) */}
                <div className="fixed top-20 right-6 w-40 z-50 rounded-xl overflow-hidden shadow-xl border-2 border-white">
                    <Proctoring sessionId={sessionData?.id} />
                </div>

                {/* Editor Panel - Left Side */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    {/* Question Header */}
                    <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center justify-between shrink-0">
                        <div>
                            <div className="flex gap-2 mb-2">
                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold">
                                    {currentQuestion?.language}
                                </span>
                                <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${currentQuestion?.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                    currentQuestion?.difficulty === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                        'bg-red-100 text-red-700'
                                    }`}>
                                    {currentQuestion?.difficulty}
                                </span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">{currentQuestion?.title}</h2>
                        </div>
                    </div>

                    {/* Description - Scrollable if needed */}
                    <div className="bg-white rounded-xl p-5 border border-slate-200 text-sm text-slate-600 leading-relaxed max-h-36 overflow-y-auto shrink-0 scrollbar-thin scrollbar-thumb-slate-300">
                        <div dangerouslySetInnerHTML={{
                            __html: currentQuestion?.description
                                .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
                                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                                .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-800 text-slate-200 p-4 rounded-lg my-2 overflow-auto">$1</pre>')
                                .replace(/\n/g, '<br>') || ''
                        }} />
                    </div>

                    {/* Editor - Takes Remaining Height */}
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden min-h-0 shadow-inner">
                        <MonacoEditor
                            height="100%"
                            language={currentQuestion?.language || 'javascript'}
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 13,
                                minimap: { enabled: false },
                                padding: { top: 16 },
                                scrollBeyondLastLine: false,
                                automaticLayout: true
                            }}
                        />
                    </div>

                    {/* Actions - Bottom */}
                    <div className="flex gap-3 shrink-0">
                        <button
                            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                            disabled={currentQuestionIndex === 0}
                            className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            ← Previous
                        </button>
                        <button className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition">
                            ▶ Run Code
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition"
                        >
                            Submit & Next →
                        </button>
                    </div>
                </div>

                {/* Side Panel - Right Side */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 sticky top-0 bg-white pb-2 border-b border-slate-50">Questions</h3>
                        <div className="space-y-2">
                            {activeQuestions.map((q, i) => (
                                <button
                                    key={q.id}
                                    onClick={() => setCurrentQuestionIndex(i)}
                                    className={`w-full text-left p-3 rounded-lg border-2 transition ${i === currentQuestionIndex
                                        ? 'border-indigo-600 bg-indigo-50'
                                        : answers[q.id]
                                            ? 'border-green-500 bg-green-50'
                                            : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="font-semibold text-sm text-slate-900">{i + 1}. {q.title}</div>
                                    <div className="text-xs text-slate-500">{q.language} • {q.difficulty}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            if (confirm('Finish assessment?')) {
                                flushEvents();
                                alert('Submitted!');
                            }
                        }}
                        className="px-6 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold hover:bg-red-100 transition shrink-0"
                    >
                        Finish Assessment
                    </button>
                </div>
            </main>
        </div>
    );
}

export default function AssessmentPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-lg text-slate-500">Loading...</div>
            </div>
        }>
            <AssessmentContent />
        </Suspense>
    );
}
