'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleCreateClick = () => {
    router.push('/create');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  // Landing Page
  return (
    <main className="min-h-screen bg-white text-slate-900 relative overflow-hidden font-sans">
      <link rel="stylesheet" href="/landing.css" />
      <style jsx global>{`
              body {
                  background-color: #ffffff;
              }
              .enterprise-gradient {
                  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
                  background-clip: text;
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
              }
          `}</style>

      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-50">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[120px] animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px] animate-float-delayed" />

        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center bg-white/70 backdrop-blur-md border border-slate-100 px-6 py-3 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 font-black text-2xl tracking-tighter cursor-pointer" onClick={() => router.push('/')}>
            <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-600/20 transition-transform hover:scale-105">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
            </div>
            <span className="text-slate-900">ProctorAI</span>
          </div>
          <div className="flex items-center gap-8">
            <div className="hidden md:flex gap-8 text-xs font-bold uppercase tracking-widest text-slate-500">
              <a href="#features" className="hover:text-indigo-600 transition-colors">Technology</a>
              <a href="#how" className="hover:text-indigo-600 transition-colors">Workflow</a>
              <a href="https://github.com/anishtr4/ProctorAI" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-slate-900 transition-colors">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                GitHub
              </a>
            </div>
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500 font-medium hidden sm:block">{user.email}</span>
                <button onClick={() => router.push('/dashboard')} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">Dashboard</button>
                <button onClick={handleSignOut} className="text-xs font-bold text-red-500 hover:text-red-600 transition">SIGN OUT</button>
              </div>
            ) : (
              <button onClick={() => router.push('/login')} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">Get Started</button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-48 pb-32 px-6 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8 shadow-2xl shadow-indigo-500/20">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          Empowering Integrity with Open Source Computer Vision
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-8 leading-[0.9] text-slate-900 max-w-5xl">
          The Gold Standard for <span className="enterprise-gradient">Remote Engineering</span> Assessments
        </h1>

        <p className="text-xl text-slate-500 max-w-2xl mb-12 leading-relaxed font-medium">
          Next-gen proctoring using MediaPipe AI. Track gaze, head-pose, and environment integrity in real-time, giving you 100% confidence in every hire.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleCreateClick}
            className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 hover:-translate-y-1 active:scale-95 flex items-center gap-3"
          >
            {user ? 'Go to Dashboard' : 'Start Secure Session'}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <button className="px-10 py-5 bg-white border border-slate-200 text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-50 transition shadow-sm">
            View Sample Report
          </button>
        </div>

        {/* Social Proof / Stats */}
        <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-12 text-center opacity-70">
          <div>
            <div className="text-3xl font-black text-slate-900">99.2%</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Detection Accuracy</div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">&lt;100ms</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Live Sync Latency</div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">100+</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Top Engineering Teams</div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">∞</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">Infinite Trust</div>
          </div>
        </div>
      </section>

      {/* Features Preview */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-sm font-black text-indigo-500 uppercase tracking-[0.3em] mb-4">Core Technology</h2>
          <p className="text-4xl font-black text-slate-900">Autonomous Integrity Shield</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: "👁️",
              title: "Ocular Vigilance",
              desc: "Sub-pixel iris tracking detects if the candidate is looking at second monitors, books, or hidden devices.",
              color: "bg-indigo-50 border-indigo-100 text-indigo-600"
            },
            {
              icon: "📐",
              title: "Head Pose Analysis",
              desc: "Sophisticated yaw and pitch estimation flags unnatural head movements suggesting external assistance.",
              color: "bg-blue-50 border-blue-100 text-blue-600"
            },
            {
              icon: "⚡",
              title: "Quantum Relay",
              desc: "P2P broadcast architecture ensures you see what they do instantly. No server delays, no missed alerts.",
              color: "bg-cyan-50 border-cyan-100 text-cyan-600"
            }
          ].map((f, i) => (
            <div key={i} className={`p-8 rounded-[2rem] border ${f.color} hover:shadow-xl transition-all group hover:-translate-y-2`}>
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform">{f.icon}</div>
              <h3 className="text-xl font-black text-slate-900 mb-4 tracking-tight">{f.title}</h3>
              <p className="text-slate-500 leading-relaxed text-sm font-medium">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how" className="relative z-10 max-w-5xl mx-auto px-6 py-32">
        <div className="bg-slate-50 border border-slate-100 rounded-[3rem] p-12 md:p-20 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] -mr-32 -mt-32"></div>

          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-slate-900 mb-4">Frictionless Workflow</h2>
            <p className="text-slate-500 text-sm font-medium">From setup to signature in less than 60 seconds.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 relative z-10">
            {[
              { n: "01", t: "Configure", d: "Tailor language, difficulty, and duration to your specific requirements." },
              { n: "02", t: "Deploy", d: "Share a secure, expiring link with a single click. No complex logins needed." },
              { n: "03", t: "Approve", d: "Review the Live Integrity Score and detailed behavioral logs for the hire." }
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-indigo-600 text-2xl font-black shadow-sm mb-6">{s.n}</div>
                <h4 className="text-lg font-black text-slate-900 mb-3">{s.t}</h4>
                <p className="text-slate-400 text-xs leading-relaxed font-bold uppercase tracking-tighter">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-6 border-t border-slate-100 text-center flex flex-col items-center gap-4 bg-slate-50/30">
        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em]">© 2026 ProctorAI • The Future of Engineering Integrity</p>
        <a href="https://github.com/anishtr4/ProctorAI" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-100 shadow-sm">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
          Fork on GitHub • MIT Licensed
        </a>
      </footer>
    </main>
  );
}
