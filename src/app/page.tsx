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

export default function Home() {
  const router = useRouter();
  const [showConfig, setShowConfig] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  const [config, setConfig] = useState<AssessmentConfig>({
    language: 'javascript',
    questionCount: 5,
    timePerQuestion: 15,
  });

  const generateSessionCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateClick = () => {
    if (!user) {
      router.push('/login');
    } else {
      setShowConfig(true);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const handleCreateAssessment = async () => {
    setIsLoading(true);
    const code = generateSessionCode();
    const session = await createSession(code);

    if (session) {
      const url = `${window.location.origin}/assessment?session=${code}`;
      setSessionUrl(url);
      setShowConfig(false);
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

  // Landing Page
  if (!showConfig && !showSuccess) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 relative overflow-hidden">
        {/* Background Effects */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_-30%,rgba(99,102,241,0.08),transparent)]" />
          <div className="absolute w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[100px] -top-[20%] -right-[10%] animate-float" />
          <div className="absolute w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] top-[50%] -left-[5%] animate-float-delayed" />
        </div>

        {/* Nav */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-8 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3 text-indigo-600 font-bold text-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a2 2 0 0 0-2 2v2M5 7H2v5"></path></svg>
              ProctorAI
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex gap-8 text-sm font-medium text-slate-500">
                <a href="#features" className="hover:text-indigo-600 transition">Features</a>
                <a href="#how-it-works" className="hover:text-indigo-600 transition">How it Works</a>
              </div>
              {user && (
                <button
                  onClick={handleSignOut}
                  className="text-sm font-semibold text-slate-600 hover:text-red-500 transition"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-full text-indigo-600 text-sm font-semibold mb-8">
            <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse-dot" />
            AI-Powered Proctoring
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
            Secure <span className="gradient-text">Coding Assessments</span><br />Made Simple
          </h1>

          <p className="text-xl text-slate-500 max-w-2xl mb-10 leading-relaxed">
            Real-time face tracking, gaze detection, and instant cheating alerts.
            Create assessments in seconds and share with candidates.
          </p>

          <button
            onClick={handleCreateClick}
            className="inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-semibold text-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5"
          >
            {user ? 'Create New Assessment' : 'Login to Create Assessment'}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>

          <p className="mt-6 text-sm text-slate-400">Free • No signup required • Links expire in 24 hours</p>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: '👁️', title: 'Gaze Tracking', desc: 'AI detects when candidates look away from screen' },
              { icon: '👥', title: 'Face Detection', desc: 'Alerts for multiple faces or no face in frame' },
              { icon: '⚡', title: 'Real-time Sync', desc: 'See alerts instantly as they happen' },
              { icon: '🔗', title: 'Unique URLs', desc: 'Share secure links that expire in 24 hours' },
            ].map((f, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 text-center hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="w-16 h-16 bg-indigo-50 rounded-xl flex items-center justify-center text-3xl mx-auto mb-4">{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it Works */}
        <section id="how-it-works" className="max-w-4xl mx-auto px-6 pb-24">
          <div className="bg-slate-50 rounded-3xl p-12 text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-12">How it Works</h2>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              {[
                { num: '1', title: 'Create Assessment', desc: 'Configure language and questions' },
                { num: '2', title: 'Share Link', desc: 'Send URL to your candidate' },
                { num: '3', title: 'Monitor Live', desc: 'Watch progress and alerts in real-time' },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center max-w-xs">
                  <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30 mb-4">{s.num}</div>
                  <h4 className="font-bold text-slate-900 mb-1">{s.title}</h4>
                  <p className="text-sm text-slate-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Config Screen
  if (showConfig) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-lg w-full shadow-2xl">
          <h2 className="text-2xl font-extrabold text-center mb-2">⚙️ Configure Assessment</h2>
          <p className="text-slate-500 text-center mb-8">Set up the coding assessment for your candidate</p>

          {/* Language */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Programming Language</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'javascript', label: '🟨 JavaScript' },
                { value: 'python', label: '🐍 Python' },
                { value: 'java', label: '☕ Java' },
                { value: 'all', label: '🌐 All' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setConfig({ ...config, language: lang.value as any })}
                  className={`p-4 rounded-xl border-2 font-semibold transition ${config.language === lang.value
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 hover:border-indigo-300 text-slate-700'
                    }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question Count */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Number of Questions</label>
            <div className="flex gap-3">
              {[3, 5, 8].map((num) => (
                <button
                  key={num}
                  onClick={() => setConfig({ ...config, questionCount: num })}
                  className={`flex-1 p-4 rounded-xl border-2 font-bold transition ${config.questionCount === num
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 hover:border-indigo-300 text-slate-700'
                    }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Time per Question</label>
            <div className="grid grid-cols-4 gap-3">
              {[10, 15, 20, 30].map((time) => (
                <button
                  key={time}
                  onClick={() => setConfig({ ...config, timePerQuestion: time })}
                  className={`p-3 rounded-xl border-2 font-semibold text-sm transition ${config.timePerQuestion === time
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                    : 'border-slate-200 hover:border-indigo-300 text-slate-700'
                    }`}
                >
                  {time} min
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => setShowConfig(false)}
              className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition"
            >
              ← Back
            </button>
            <button
              onClick={handleCreateAssessment}
              disabled={isLoading}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Generate Link →'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Success Screen
  if (showSuccess) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center">
          <div className="text-6xl mb-6">✅</div>
          <h2 className="text-2xl font-extrabold mb-2">Assessment Created!</h2>
          <p className="text-slate-500 mb-6">Share this unique link with your candidate:</p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={sessionUrl}
              readOnly
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
            <button
              onClick={() => copyToClipboard(sessionUrl)}
              className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition"
            >
              📋
            </button>
          </div>

          <div className="inline-block px-4 py-2 bg-amber-50 text-amber-700 rounded-lg font-semibold text-sm mb-6">
            ⏰ Expires in 24 hours
          </div>

          <div className="flex gap-3 justify-center mb-8">
            <button onClick={shareViaEmail} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium hover:bg-slate-200 transition">📧 Email</button>
            <button onClick={() => copyToClipboard(`ProctorAI Assessment\n${sessionUrl}\n⏰ Expires in 24 hours`)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium hover:bg-slate-200 transition">💬 Teams</button>
            <button onClick={() => copyToClipboard(`ProctorAI Assessment\n${sessionUrl}`)} className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium hover:bg-slate-200 transition">💬 Slack</button>
          </div>

          <button
            onClick={() => router.push(`/monitor?session=${sessionUrl.split('=')[1]}`)}
            className="w-full px-6 py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition"
          >
            Start Monitoring →
          </button>
        </div>
      </main>
    );
  }

  return null;
}
