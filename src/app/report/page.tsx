'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, joinSession } from '@/lib/supabase';

function ReportContent() {
    const searchParams = useSearchParams();
    const sessionCode = searchParams.get('session');
    const router = useRouter();

    const [sessionData, setSessionData] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [answers, setAnswers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            if (!sessionCode) return;

            const session = await joinSession(sessionCode);
            if (session) {
                setSessionData(session);

                // Fetch Logs
                const { data: logs } = await supabase
                    .from('proctoring_logs')
                    .select('*')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: false });

                // Fetch Answers
                const { data: ans } = await supabase
                    .from('answers')
                    .select('*')
                    .eq('session_id', session.id);

                setAlerts(logs || []);
                setAnswers(ans || []);
            }
            setLoading(false);
        }
        fetchData();
    }, [sessionCode]);

    if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500 font-bold animate-pulse">Analyzing Integrity Data...</div>;

    const trustScore = sessionData?.trust_score ?? 100;
    const eyeViolations = alerts.filter(a => a.event_type.includes('👁️')).length;
    const headViolations = alerts.filter(a => a.event_type.includes('⚠️ Head')).length;
    const faceViolations = alerts.filter(a => a.event_type.includes('👥')).length;

    return (
        <main className="min-h-screen bg-white text-slate-900 p-6 md:p-12 font-sans overflow-x-hidden">
            <style jsx global>{`
                body {
                    background-color: #ffffff;
                }
                @media print {
                    .no-print { display: none !important; }
                    main { padding: 0 !important; }
                    .bg-white { background: white !important; }
                    .shadow-sm, .shadow-lg, .shadow-xl { box-shadow: none !important; }
                    .border { border: 1px solid #e2e8f0 !important; }
                }
            `}</style>

            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600 text-[10px] font-black uppercase tracking-widest mb-4">
                            Audit Report
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-none">Post-Session Analysis</h1>
                        <p className="text-slate-500 mt-3 font-medium text-sm">
                            Session Code: <span className="text-indigo-600 font-mono font-bold">{sessionCode}</span> •
                            Completed {new Date(sessionData?.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex gap-3 no-print">
                        <button onClick={() => window.print()} className="px-6 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition shadow-sm">Export PDF</button>
                        <button onClick={() => router.push('/dashboard')} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20">Dashboard</button>
                    </div>
                </div>

                {/* Score Card */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    <div className="md:col-span-2 bg-slate-50 border border-slate-100 rounded-[2.5rem] p-10 flex items-center gap-10 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[60px] -mr-24 -mt-24"></div>
                        <div className="relative shrink-0">
                            <svg className="w-32 h-32 transform -rotate-90">
                                <circle cx="64" cy="64" r="58" stroke="#e2e8f0" strokeWidth="10" fill="transparent" />
                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="10" fill="transparent"
                                    strokeDasharray={364}
                                    strokeDashoffset={364 - (364 * trustScore) / 100}
                                    className={`${trustScore > 80 ? 'text-emerald-500' : trustScore > 50 ? 'text-amber-500' : 'text-rose-500'} transition-all duration-1000`}
                                />
                            </svg>
                            <div className={`absolute inset-0 flex items-center justify-center text-3xl font-black ${trustScore > 80 ? 'text-emerald-600' : trustScore > 50 ? 'text-amber-600' : 'text-rose-600'}`}>{trustScore}%</div>
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-2xl font-black mb-2 text-slate-900 tracking-tight">Integrity Score</h3>
                            <p className="text-slate-500 text-sm leading-relaxed max-w-sm font-medium">
                                {trustScore > 80 ? 'Candidate exhibited high integrity throughout the session with minimal deviations.' :
                                    trustScore > 50 ? 'Moderate deviations detected. Recommend reviewing specific behavioral logs before finalizing.' :
                                        'High-risk behavior detected. Integrity score fall below the recommended threshold.'}
                            </p>
                        </div>
                    </div>
                    <div className="bg-indigo-600 rounded-[2.5rem] p-10 flex flex-col justify-center text-white shadow-lg shadow-indigo-600/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Session Status</div>
                        <div className="text-3xl font-black mb-4">Completed</div>
                        <div className="flex items-center gap-2 text-indigo-100 text-[10px] font-black uppercase tracking-widest bg-indigo-500/50 self-start px-3 py-1.5 rounded-full border border-indigo-400/30">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                            Verified Audit
                        </div>
                    </div>
                </div>

                {/* Detailed Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                    {[
                        { label: 'Gaze Alerts', val: eyeViolations, icon: '👁️', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                        { label: 'Head Pose', val: headViolations, icon: '📐', color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Face Violations', val: faceViolations, icon: '👥', color: 'text-cyan-600', bg: 'bg-cyan-50' },
                        { label: 'Submissions', val: `${answers.length}/5`, icon: '📝', color: 'text-purple-600', bg: 'bg-purple-50' },
                    ].map((s, i) => (
                        <div key={i} className="bg-white border border-slate-100 rounded-3xl p-6 text-center shadow-sm">
                            <div className="text-3xl mb-3">{s.icon}</div>
                            <div className="text-2xl font-black text-slate-900">{s.val}</div>
                            <div className={`text-[9px] font-black uppercase tracking-widest mt-1 ${s.color}`}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Logs Viewer */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden mb-12 shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-black text-lg text-slate-900 tracking-tight">Behavioral Log Archive</h3>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{alerts.length} audit events</span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto p-4 bg-white">
                        <table className="w-full text-left">
                            <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                <tr>
                                    <th className="px-6 py-4">Timestamp</th>
                                    <th className="px-6 py-4">Audit Event</th>
                                    <th className="px-6 py-4">Severity</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm font-medium">
                                {alerts.map((a, i) => (
                                    <tr key={i} className="group hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 text-slate-400 font-mono text-xs">{new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                        <td className="px-6 py-4 text-slate-700 font-bold">{a.event_type}</td>
                                        <td className="px-6 py-4 text-slate-400">
                                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${a.event_type.includes('Warning') || a.event_type.includes('⚠️') ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                a.event_type.includes('PEER') ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                                                    'bg-slate-50 text-slate-500 border border-slate-200'
                                                }`}>
                                                {a.event_type.includes('⚠️') ? 'Moderate' : 'Info'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {alerts.length === 0 && <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No audit signals recorded for this session.</div>}
                    </div>
                </div>

                <div className="text-center pb-20 no-print">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.5em]">End of Official Audit Report • Verified via ProctorAI Secure Relay</p>
                </div>
            </div>
        </main>
    );
}

export default function ReportPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ReportContent />
        </Suspense>
    );
}
