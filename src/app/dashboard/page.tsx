'use client';

import { useEffect, useState } from 'react';
import { supabase, getInterviewerSessions } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import '../landing.css'; // Use premium landing styles

export default function DashboardPage() {
    const router = useRouter();
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        // Check auth
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.push('/login');
                return;
            }
            setUser(session.user);
            fetchSessions(session.user.id);
        });
    }, [router]);

    const fetchSessions = async (userId: string) => {
        try {
            const data = await getInterviewerSessions(userId);
            setSessions(data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getAIHighlight = (score: number) => {
        if (!score && score !== 0) return { text: "No Data", color: "text-slate-400", bg: "bg-slate-500/10", desc: "Assessment hasn't started or score pending." };
        if (score >= 90) return { text: "Protocol Compliant", color: "text-emerald-400", bg: "bg-emerald-500/10", desc: "Candidate maintained consistent focus and followed all protocols." };
        if (score >= 70) return { text: "Minor Deviations", color: "text-amber-400", bg: "bg-amber-500/10", desc: "A few gaze shifts or head movements detected. Manual review recommended." };
        return { text: "High Risk Flags", color: "text-rose-400", bg: "bg-rose-500/10", desc: "Significant proctoring alerts detected. Integrity may be compromised." };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span className="text-slate-500 font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Initializing Command Center...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
            <style jsx global>{`
                body {
                    background-color: #ffffff;
                }
            `}</style>

            {/* Nav */}
            <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/70 backdrop-blur-xl px-8 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <span className="text-xl">🛡️</span>
                        </div>
                        <div>
                            <div className="font-bold text-lg leading-tight text-slate-900">ProctorAI</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Command Center</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/create')}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/10 flex items-center gap-2"
                        >
                            <span>+</span> New Assessment
                        </button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-8 py-12">
                <div className="flex items-end justify-between mb-10">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 mb-2">Assessment Sessions</h1>
                        <p className="text-slate-500 font-medium text-sm">Monitor and review candidate integrity across all your interviews.</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-indigo-600">{sessions.length}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-tighter font-bold">Total Sessions</div>
                    </div>
                </div>

                {sessions.length === 0 ? (
                    <div className="py-32 flex flex-col items-center text-center bg-slate-50 border border-slate-100 rounded-[2.5rem] shadow-sm">
                        <div className="w-20 h-20 bg-white border border-slate-200 rounded-3xl flex items-center justify-center text-3xl mb-6 shadow-sm">
                            📂
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">No Sessions Found</h3>
                        <p className="text-slate-500 mb-8 max-w-sm font-medium">You haven't created any assessment sessions yet. Start by inviting a candidate.</p>
                        <button
                            onClick={() => router.push('/create')}
                            className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition active:scale-95 shadow-lg shadow-indigo-600/20"
                        >
                            Create First Assessment
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sessions.map((session) => {
                            const highlight = getAIHighlight(session.trust_score);
                            const isActive = session.status === 'active';

                            return (
                                <div
                                    key={session.id}
                                    className="bg-white border border-slate-200 rounded-3xl p-1 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all duration-300 flex flex-col h-full group"
                                >
                                    {/* Card Header */}
                                    <div className="p-6 border-b border-slate-100">
                                        <div className="flex justify-between items-start">
                                            <div className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                                {session.code}
                                            </div>
                                            {isActive ? (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 text-[10px] font-black uppercase tracking-wider">
                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                                    Live
                                                </div>
                                            ) : (
                                                <div className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full border border-slate-100 text-[10px] font-black uppercase tracking-wider">
                                                    Archive
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-6 flex-grow">
                                        <div className="mb-6 flex items-center justify-between">
                                            <div>
                                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Integrity Score</div>
                                                <div className={`text-4xl font-black ${session.trust_score < 70 ? 'text-rose-500' : 'text-slate-900'}`}>
                                                    {session.trust_score ?? '--'}
                                                    <span className="text-lg text-slate-400 font-bold ml-1">/100</span>
                                                </div>
                                            </div>
                                            <div className="w-12 h-12 rounded-full border border-slate-100 flex items-center justify-center text-xl shadow-sm bg-slate-50">
                                                {session.trust_score >= 90 ? '✅' : session.trust_score >= 70 ? '⚠️' : session.trust_score === null ? '⏳' : '🚫'}
                                            </div>
                                        </div>

                                        <div className={`p-4 rounded-2xl ${highlight.bg.replace('500/10', '50/50')} border border-slate-100 mb-4`}>
                                            <div className={`text-[10px] font-black uppercase tracking-[0.15em] ${highlight.color.replace('400', '600')} mb-1`}>
                                                AI Insight: {highlight.text}
                                            </div>
                                            <p className="text-xs text-slate-600 leading-relaxed font-bold">
                                                {highlight.desc}
                                            </p>
                                        </div>

                                        <div className="flex items-center text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                            <span className="flex-shrink-0">Started {formatDate(session.created_at)}</span>
                                            <div className="w-full h-px bg-slate-100 mx-3"></div>
                                        </div>
                                    </div>

                                    {/* Card Footer */}
                                    <div className="p-4 grid grid-cols-2 gap-3 mt-auto bg-slate-50/50 rounded-b-[22px] border-t border-slate-100">
                                        <button
                                            onClick={() => router.push(`/report?session=${session.code}`)}
                                            className="px-4 py-3 bg-white hover:bg-slate-50 text-slate-900 text-[11px] font-black uppercase tracking-tighter rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            View Report
                                        </button>
                                        <button
                                            onClick={() => router.push(`/monitor?session=${session.code}`)}
                                            className={`px-4 py-3 ${isActive ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/10' : 'bg-slate-200 text-slate-600'} text-[11px] font-black uppercase tracking-tighter rounded-xl transition-all flex items-center justify-center gap-2`}
                                        >
                                            {isActive ? 'Monitor' : 'Re-join'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
