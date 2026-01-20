import './src/style.css';
import { Camera } from './src/camera.js';
import { VisionEngine } from './src/vision.js';
import { Analyzer } from './src/analyzer.js';
import { CodeEditor } from './src/editor.js';
import { questions, getQuestionsByLanguage } from './src/questions.js';
import {
    createSession,
    joinSession,
    saveAnswer,
    getAnswers,
    subscribeToProctoringLogs,
    updateSessionTimeLimit,
    flushEvents
} from './src/supabase.js';

let currentMode = null;
let sessionCode = null;
let sessionData = null;
let assessmentConfig = {
    language: 'javascript',
    questionCount: 5,
    timePerQuestion: 15
};
let filteredQuestions = [];

function generateSessionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

document.addEventListener('DOMContentLoaded', async () => {
    const landingPage = document.getElementById('landing-page');
    const assessmentConfigScreen = document.getElementById('assessment-config');
    const sessionCreated = document.getElementById('session-created');
    const sessionExpired = document.getElementById('session-expired');
    const mainApp = document.getElementById('main-app');

    // Check URL for session code (candidate access)
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('session');

    if (codeFromUrl) {
        await handleCandidateAccess(codeFromUrl);
    }

    // Create Assessment -> Show Config
    document.getElementById('create-assessment-btn')?.addEventListener('click', () => {
        landingPage.classList.add('hidden');
        assessmentConfigScreen.classList.remove('hidden');
    });

    // Config: Language Options
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            assessmentConfig.language = btn.dataset.lang;
        });
    });

    // Config: Question Count
    document.querySelectorAll('.q-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.q-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            assessmentConfig.questionCount = parseInt(btn.dataset.count) || questions.length;
        });
    });

    // Config: Time Options
    document.querySelectorAll('.time-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            assessmentConfig.timePerQuestion = parseInt(btn.dataset.time);
        });
    });

    // Back to Home
    document.getElementById('back-to-home-btn')?.addEventListener('click', () => {
        assessmentConfigScreen.classList.add('hidden');
        landingPage.classList.remove('hidden');
    });

    // Generate Link
    document.getElementById('generate-link-btn')?.addEventListener('click', async () => {
        sessionCode = generateSessionCode();
        sessionData = await createSession(sessionCode);

        if (!sessionData) {
            alert('Failed to create session. Please try again.');
            return;
        }

        // Filter questions based on config
        if (assessmentConfig.language === 'all') {
            filteredQuestions = [...questions];
        } else {
            filteredQuestions = getQuestionsByLanguage(assessmentConfig.language);
        }
        filteredQuestions = filteredQuestions.slice(0, assessmentConfig.questionCount);

        const sessionUrl = `${window.location.origin}?session=${sessionCode}`;
        document.getElementById('session-url').value = sessionUrl;

        assessmentConfigScreen.classList.add('hidden');
        sessionCreated.classList.remove('hidden');
    });

    // Copy URL
    document.getElementById('copy-url-btn')?.addEventListener('click', () => {
        const urlInput = document.getElementById('session-url');
        urlInput.select();
        navigator.clipboard.writeText(urlInput.value);
        alert('Link copied!');
    });

    // Share buttons
    document.getElementById('share-email-btn')?.addEventListener('click', () => {
        const url = document.getElementById('session-url').value;
        const subject = encodeURIComponent('Your ProctorAI Coding Assessment');
        const body = encodeURIComponent(`You have been invited to a coding assessment.\n\nClick to start:\n${url}\n\n⏰ Expires in 24 hours.`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
    });

    document.getElementById('share-teams-btn')?.addEventListener('click', () => {
        const url = document.getElementById('session-url').value;
        const text = encodeURIComponent(`ProctorAI Assessment\n${url}\n⏰ Expires in 24 hours`);
        window.open(`https://teams.microsoft.com/share?msgText=${text}`);
    });

    document.getElementById('share-slack-btn')?.addEventListener('click', () => {
        const url = document.getElementById('session-url').value;
        navigator.clipboard.writeText(`ProctorAI Assessment\n${url}\n⏰ Expires in 24 hours`);
        alert('Message copied! Paste in Slack.');
    });

    // Start Monitoring
    document.getElementById('start-monitoring-btn')?.addEventListener('click', () => {
        sessionCreated.classList.add('hidden');
        startApp('interviewer');
    });

    // Exit
    document.getElementById('exit-mode-btn')?.addEventListener('click', () => {
        if (confirm('Exit session?')) {
            flushEvents();
            location.href = '/';
        }
    });

    async function handleCandidateAccess(code) {
        sessionData = await joinSession(code);

        if (!sessionData) {
            landingPage.classList.add('hidden');
            sessionExpired.classList.remove('hidden');
            return;
        }

        if (sessionData.expires_at) {
            const expiryDate = new Date(sessionData.expires_at);
            if (new Date() > expiryDate) {
                landingPage.classList.add('hidden');
                sessionExpired.classList.remove('hidden');
                return;
            }
        }

        sessionCode = code;
        filteredQuestions = questions; // Candidate gets all questions for now
        landingPage.classList.add('hidden');
        startApp('candidate');
    }

    function startApp(mode) {
        currentMode = mode;
        mainApp.classList.remove('hidden');

        const modeBadge = document.getElementById('mode-badge');
        const appContainer = document.getElementById('app-container');
        const proctorPanel = document.getElementById('proctor-panel');
        const candidateMiniVideo = document.getElementById('candidate-video-mini');
        const interviewerControls = document.getElementById('interviewer-controls');

        if (mode === 'candidate') {
            modeBadge.textContent = 'Candidate';
            modeBadge.classList.add('candidate');
            appContainer.classList.add('candidate-mode');
            proctorPanel.classList.add('hidden');
            candidateMiniVideo.classList.remove('hidden');
            interviewerControls.classList.add('hidden');
        } else {
            modeBadge.textContent = 'Interviewer';
            if (sessionData) {
                subscribeToProctoringLogs(sessionData.id, (log) => {
                    const eventLog = document.getElementById('event-log');
                    const li = document.createElement('li');
                    li.className = 'log-item';
                    li.innerHTML = `<span class="log-message">${log.event_type}</span><span class="log-time">${new Date(log.created_at).toLocaleTimeString()}</span>`;
                    eventLog.prepend(li);
                });
            }
        }

        initializeApp();
    }

    async function initializeApp() {
        const ui = {
            video: document.getElementById('webcam'),
            canvas: document.getElementById('output_canvas'),
            statusDot: document.getElementById('system-status-dot'),
            trustScore: document.getElementById('trust-score'),
            faceCount: document.getElementById('face-count'),
            gazeStatus: document.getElementById('gaze-status'),
            eventLog: document.getElementById('event-log'),
            connectionStatus: document.getElementById('connection-status'),
        };

        if (currentMode === 'candidate') {
            ui.video = document.getElementById('webcam-mini') || ui.video;
            ui.canvas = document.getElementById('output_canvas_mini') || ui.canvas;
        }

        const questionUI = {
            progress: document.getElementById('question-progress'),
            timer: document.getElementById('timer'),
            title: document.getElementById('question-title'),
            language: document.getElementById('question-language'),
            difficulty: document.getElementById('question-difficulty'),
            description: document.getElementById('question-description'),
            list: document.getElementById('question-list'),
            prevBtn: document.getElementById('prev-btn'),
            runBtn: document.getElementById('run-btn'),
            submitBtn: document.getElementById('submit-btn'),
            finishBtn: document.getElementById('finish-btn'),
            timeInput: document.getElementById('time-input'),
            setTimeBtn: document.getElementById('set-time-btn')
        };

        let currentQuestionIndex = 0;
        let answers = {};
        let timerInterval = null;
        let timeRemaining = 0;
        let questionTimeLimit = assessmentConfig.timePerQuestion;

        // Use filtered questions
        const activeQuestions = filteredQuestions.length > 0 ? filteredQuestions : questions;

        if (sessionData) {
            const savedAnswers = await getAnswers(sessionData.id);
            savedAnswers.forEach(a => { answers[a.question_id] = a.code; });
        }

        const editor = new CodeEditor('monaco-editor');

        function renderQuestionList() {
            questionUI.list.innerHTML = activeQuestions.map((q, i) => `
        <div class="question-item ${i === currentQuestionIndex ? 'active' : ''} ${answers[q.id] ? 'completed' : ''}" data-index="${i}">
          <div class="q-title">${i + 1}. ${q.title}</div>
          <div class="q-meta">${q.language} • ${q.difficulty}</div>
        </div>
      `).join('');

            questionUI.list.querySelectorAll('.question-item').forEach(item => {
                item.addEventListener('click', () => loadQuestion(parseInt(item.dataset.index)));
            });
        }

        async function loadQuestion(index) {
            if (editor.editor && sessionData) {
                const code = editor.getCode();
                answers[activeQuestions[currentQuestionIndex].id] = code;
                saveAnswer(sessionData.id, activeQuestions[currentQuestionIndex].id, code);
            }

            currentQuestionIndex = index;
            const q = activeQuestions[index];

            questionUI.progress.textContent = `Question ${index + 1} of ${activeQuestions.length}`;
            questionUI.title.textContent = q.title;
            questionUI.language.textContent = q.language.charAt(0).toUpperCase() + q.language.slice(1);
            questionUI.difficulty.textContent = q.difficulty;
            questionUI.difficulty.className = `difficulty-badge ${q.difficulty.toLowerCase()}`;

            questionUI.description.innerHTML = q.description
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
                .replace(/\n/g, '<br>');

            const code = answers[q.id] || q.starterCode;

            if (!editor.editor) {
                editor.initialize(code, q.language);
            } else {
                editor.setCode(code, q.language);
            }

            questionUI.prevBtn.disabled = index === 0;
            startTimer(questionTimeLimit * 60);
            renderQuestionList();
        }

        function startTimer(seconds) {
            if (timerInterval) clearInterval(timerInterval);
            timeRemaining = seconds;
            updateTimerDisplay();
            timerInterval = setInterval(() => {
                timeRemaining--;
                updateTimerDisplay();
                if (timeRemaining <= 0) {
                    clearInterval(timerInterval);
                    handleSubmit();
                }
            }, 1000);
        }

        function updateTimerDisplay() {
            const mins = Math.floor(timeRemaining / 60);
            const secs = timeRemaining % 60;
            questionUI.timer.textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
        }

        async function handleSubmit() {
            if (sessionData) {
                await saveAnswer(sessionData.id, activeQuestions[currentQuestionIndex].id, editor.getCode());
            }
            answers[activeQuestions[currentQuestionIndex].id] = editor.getCode();

            if (currentQuestionIndex < activeQuestions.length - 1) {
                loadQuestion(currentQuestionIndex + 1);
            } else {
                flushEvents();
                alert('Assessment complete!');
            }
        }

        questionUI.prevBtn?.addEventListener('click', () => {
            if (currentQuestionIndex > 0) loadQuestion(currentQuestionIndex - 1);
        });
        questionUI.submitBtn?.addEventListener('click', handleSubmit);
        questionUI.runBtn?.addEventListener('click', () => alert('Code executed. Check console.'));
        questionUI.finishBtn?.addEventListener('click', async () => {
            if (confirm('Finish assessment?')) {
                if (sessionData) await saveAnswer(sessionData.id, activeQuestions[currentQuestionIndex].id, editor.getCode());
                flushEvents();
                alert('Submitted!');
            }
        });

        if (questionUI.setTimeBtn) {
            questionUI.setTimeBtn.addEventListener('click', async () => {
                const newTime = parseInt(questionUI.timeInput.value);
                if (newTime > 0 && newTime <= 60) {
                    questionTimeLimit = newTime;
                    if (sessionData) await updateSessionTimeLimit(sessionData.id, newTime);
                    startTimer(questionTimeLimit * 60);
                }
            });
        }

        const analyzer = new Analyzer(ui, sessionData?.id);
        const vision = new VisionEngine(ui.video, ui.canvas, (results) => analyzer.process(results));
        const camera = new Camera(ui.video);

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                analyzer.addWarning("🚫 Tab switched");
                analyzer.penalizeScore(10);
            }
        });

        try {
            ui.connectionStatus.textContent = "Camera...";
            const started = await camera.start();
            if (started) {
                ui.connectionStatus.textContent = "AI...";
                await vision.initialize();
                ui.connectionStatus.textContent = currentMode === 'interviewer' ? "Monitoring" : "Ready";
                if (ui.statusDot) ui.statusDot.style.backgroundColor = "#22c55e";
                vision.start();
            } else {
                ui.connectionStatus.textContent = "No Camera";
            }
        } catch (err) {
            console.error("Init Failed:", err);
            ui.connectionStatus.textContent = "Error";
        }

        renderQuestionList();
        loadQuestion(0);
    }
});
