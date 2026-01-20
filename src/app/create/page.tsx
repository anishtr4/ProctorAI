'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSession, supabase } from '@/lib/supabase';
import { questions, getQuestionsByLanguage } from '@/lib/questions';

type AssessmentConfig = {
    language: 'javascript' | 'python' | 'java' | 'all';
    questionCount: number;
    timePerQuestion: number;
};

export default function CreateAssessmentPage() {
    const router = useRouter();
    const [showSuccess, setShowSuccess] = useState(false);
    const [sessionUrl, setSessionUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [authChecked, setAuthChecked] = useState(false);

    const [config, setConfig] = useState<AssessmentConfig>({
        language: 'javascript',
        questionCount: 5,
        timePerQuestion: 15,
    });

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                const returnUrl = encodeURIComponent('/create');
                router.push(`/login?returnUrl=${returnUrl}`);
            } else {
                setUser(session.user);
                setAuthChecked(true);
            }
        });
    }, [router]);

    const generateSessionCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    const handleCreateAssessment = async () => {
        setIsLoading(true);
        const code = generateSessionCode();
        const session = await createSession(code, user?.id);

        if (session) {
            const url = `${window.location.origin}/assessment?session=${code}`;
            setSessionUrl(url);
            setShowSuccess(true);
        } else {
            alert('Failed to create session. Please try again.');
        }
        setIsLoading(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Copied!');
    };

    const shareViaEmail = () => {
        const subject = encodeURIComponent('Your ProctorAI Coding Assessment');
        const body = encodeURIComponent(`You have been invited to a coding assessment.\n\nClick to start:\n${sessionUrl}\n\n⏰ Expires in 24 hours.`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
    };

    if (!authChecked) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span className="text-slate-500 font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Authorizing...</span>
                </div>
            </div>
        );
    }

    if (showSuccess) {
        return (
            <main className="min-h-screen bg-white flex items-center justify-center p-6">
                <div className="bg-white border border-slate-200 rounded-[3rem] p-12 max-w-lg w-full shadow-2xl text-center animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-4xl mb-8 mx-auto border border-emerald-100 shadow-sm">✅</div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Assessment Ready</h2>
                    <p className="text-slate-500 mb-10 font-medium">Your unique interview link has been generated.</p>

                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={sessionUrl}
                            readOnly
                            className="flex-1 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700"
                        />
                        <button
                            onClick={() => copyToClipboard(sessionUrl)}
                            className="px-5 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition shadow-sm"
                        >
                            📋
                        </button>
                    </div>

                    <div className="inline-block px-4 py-2 bg-amber-50 text-amber-700 rounded-full font-black text-[10px] uppercase tracking-widest border border-amber-100 mb-10">
                        ⏰ Valid for 24 Hours
                    </div>

                    <div className="flex gap-3 justify-center mb-10">
                        <button onClick={shareViaEmail} className="px-5 py-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition border border-slate-100">📧 Email</button>
                        <button onClick={() => copyToClipboard(`ProctorAI Assessment\n${sessionUrl}`)} className="px-5 py-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition border border-slate-100">💬 Teams</button>
                        <button onClick={() => copyToClipboard(`ProctorAI Assessment\n${sessionUrl}`)} className="px-5 py-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition border border-slate-100">💬 Slack</button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="py-4 bg-white text-slate-600 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition shadow-sm"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => router.push(`/monitor?session=${sessionUrl.split('=')[1]}`)}
                            className="py-4 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20"
                        >
                            Start Monitor
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white border border-slate-200 rounded-[3rem] p-12 max-w-xl w-full shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="text-center mb-12">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl mb-6 mx-auto border border-indigo-100 shadow-sm">⚙️</div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Configure Session</h2>
                    <p className="text-slate-500 text-sm font-medium">Define the technical parameters for this assessment.</p>
                </div>

                {/* Language */}
                <div className="mb-10">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 text-center">Environment Stack</label>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { value: 'javascript', label: '🟨 JavaScript' },
                            { value: 'python', label: '🐍 Python' },
                            { value: 'java', label: '☕ Java' },
                            { value: 'all', label: '🌐 Full Access' },
                        ].map((lang) => (
                            <button
                                key={lang.value}
                                onClick={() => setConfig({ ...config, language: lang.value as any })}
                                className={`p-6 rounded-[2rem] border-2 font-black text-xs uppercase tracking-widest transition-all ${config.language === lang.value
                                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 shadow-lg shadow-indigo-500/10 scale-[1.02]'
                                    : 'border-slate-100 hover:border-indigo-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                            >
                                {lang.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-10 mb-12">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Total Questions</label>
                        <div className="flex gap-2">
                            {[3, 5, 8].map((num) => (
                                <button
                                    key={num}
                                    onClick={() => setConfig({ ...config, questionCount: num })}
                                    className={`flex-1 py-3 rounded-xl border-2 font-black text-[11px] transition-all ${config.questionCount === num
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                                        : 'border-slate-100 text-slate-400 hover:border-indigo-100'
                                        }`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Timer (Mins)</label>
                        <div className="flex gap-2">
                            {[15, 30, 45].map((time) => (
                                <button
                                    key={time}
                                    onClick={() => setConfig({ ...config, timePerQuestion: time })}
                                    className={`flex-1 py-3 rounded-xl border-2 font-black text-[11px] transition-all ${config.timePerQuestion === time
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                                        : 'border-slate-100 text-slate-400 hover:border-indigo-100'
                                        }`}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        onClick={() => router.back()}
                        className="px-8 py-5 border border-slate-200 rounded-[1.5rem] text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateAssessment}
                        disabled={isLoading}
                        className="flex-1 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 disabled:opacity-50 active:scale-95"
                    >
                        {isLoading ? 'GENERATING PROTOCOL...' : 'Launch Assessment →'}
                    </button>
                </div>
            </div>
        </main>
    );
}
