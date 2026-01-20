'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { joinSession, saveAnswer, getAnswers, logProctoringEvent, flushEvents, subscribeToProctoringLogs } from '@/lib/supabase';
import { questions, getQuestionsByLanguage, Question } from '@/lib/questions';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const Proctoring = dynamic(() => import('@/components/Proctoring'), { ssr: false });

function AssessmentContent() {
    const searchParams = useSearchParams();
    const sessionCode = searchParams.get('session');

    const [sessionData, setSessionData] = useState<any>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timeRemaining, setTimeRemaining] = useState(15 * 60);
    const [code, setCode] = useState('');
    const [lastHint, setLastHint] = useState<string | null>(null);

    const activeQuestions = questions.slice(0, 5);
    const currentQuestion = activeQuestions[currentQuestionIndex];

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
                savedAnswers.forEach((a: any) => { answerMap[a.question_id] = a.code; });
                setAnswers(answerMap);

                // Subscribe to HINT events
                subscribeToProctoringLogs(session.id, (log) => {
                    if (log.event_type === 'HINT') {
                        const hintMsg = log.details?.message || 'New hint received';
                        setLastHint(hintMsg);
                        setTimeout(() => setLastHint(null), 10000); // Hide after 10s
                    }
                });
            }
            setIsLoading(false);
        }
        loadSession();
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
    }, [currentQuestionIndex]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && sessionData) {
                logProctoringEvent(sessionData.id, '🚫 Tab switched', {});
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [sessionData]);

    const handleSubmit = async () => {
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
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
                    <span className="font-bold text-indigo-600">ProctorAI</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Candidate</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                    <span className="text-slate-500">Question {currentQuestionIndex + 1} of {activeQuestions.length}</span>
                    <span className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-semibold">⏱️ {formatTime(timeRemaining)}</span>
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 grid grid-cols-[1fr_280px] gap-4 p-4 relative">
                {/* Mini Video (Candidate) */}
                <div className="fixed top-20 right-6 w-40 z-50 rounded-xl overflow-hidden shadow-xl border-2 border-white">
                    <Proctoring sessionId={sessionData?.id} />
                </div>

                {/* Hint Toast */}
                {lastHint && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce">
                        <span className="text-2xl">💡</span>
                        <div>
                            <div className="font-bold text-xs uppercase opacity-75">New Hint</div>
                            <div className="font-medium">{lastHint}</div>
                        </div>
                        <button onClick={() => setLastHint(null)} className="ml-2 opacity-50 hover:opacity-100">✕</button>
                    </div>
                )}

                {/* Editor Panel */}
                <div className="flex flex-col gap-4">
                    {/* Question Header */}
                    <div className="bg-white rounded-xl p-5 border border-slate-200 flex items-center justify-between">
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

                    {/* Description */}
                    <div className="bg-white rounded-xl p-5 border border-slate-200 text-sm text-slate-600 leading-relaxed max-h-36 overflow-y-auto">
                        <div dangerouslySetInnerHTML={{
                            __html: currentQuestion?.description
                                .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
                                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                                .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-800 text-slate-200 p-4 rounded-lg my-2 overflow-auto">$1</pre>')
                                .replace(/\n/g, '<br>') || ''
                        }} />
                    </div>

                    {/* Editor */}
                    <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[400px]">
                        <MonacoEditor
                            height="100%"
                            language={currentQuestion?.language || 'javascript'}
                            value={code}
                            onChange={(value) => setCode(value || '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 14,
                                minimap: { enabled: false },
                                padding: { top: 16 },
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
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

                {/* Side Panel */}
                <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Questions</h3>
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
                        className="px-6 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-semibold hover:bg-red-100 transition"
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
