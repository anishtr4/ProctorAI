import { useEffect, useRef, useState } from 'react';
import { logProctoringEvent, updateTrustScore } from '@/lib/supabase';

interface ProctoringProps {
    sessionId?: string;
    isInterviewer?: boolean; // false = Candidate, true = Interviewer
    remotePeerId?: string | null;
    onTrustScoreChange?: (score: number) => void;
    onAlert?: (message: string) => void;
    onLog?: (log: any) => void; // Intercept logs for signaling
}

declare global {
    interface Window {
        FaceMesh: any;
        Camera: any;
    }
}

export default function Proctoring({
    sessionId,
    isInterviewer = false,
    remotePeerId,
    onTrustScoreChange,
    onAlert,
    onLog
}: ProctoringProps) {
    // Log every render to check props
    // console.log(`[Proctoring] Render. SessionId: ${sessionId}, RemoteID: ${remotePeerId}`);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [trustScore, setTrustScore] = useState(100);
    const [faceCount, setFaceCount] = useState(0);
    const [gazeStatus, setGazeStatus] = useState('Center');
    const [alerts, setAlerts] = useState<{ message: string; time: string }[]>([]);
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [isPeerReady, setIsPeerReady] = useState(false); // NEW: Track init state

    const scoreRef = useRef(100);
    const sessionIdRef = useRef(sessionId);

    // Keep ref in sync
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    // ...

    // PeerJS Signaling (Both)
    useEffect(() => {
        console.log(`[Proctoring] Init Effect. SessionId: ${sessionId}, PeerRef: ${!!peerRef.current}`);

        if (!sessionId) {
            console.log("[Proctoring] Skipping Init: No Session ID");
            return;
        }
        if (peerRef.current) {
            console.log("[Proctoring] Skipping Init: Peer already exists");
            return;
        }

        const initPeer = async () => {
            console.log("[Proctoring] Starting PeerJS Init. SessionId:", sessionId);
            // Load PeerJS from CDN if not available
            if (!(window as any).Peer) {
                console.log("[Proctoring] Loading PeerJS script...");
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
                    script.async = true;
                    script.onload = () => {
                        console.log("[Proctoring] PeerJS script loaded.");
                        resolve();
                    };
                    script.onerror = (e) => {
                        console.error("[Proctoring] PeerJS Load Failed", e);
                        reject(e);
                    };
                    document.head.appendChild(script);
                });
            } else {
                console.log("[Proctoring] PeerJS already on window.");
            }

            const Peer = (window as any).Peer;
            const peer = new Peer();
            peerRef.current = peer;
            console.log("[Proctoring] Peer instance created:", peer.id);

            peer.on('open', (id: string) => {
                console.log('My Peer ID:', id);
                setIsPeerReady(true); // Trigger re-render
            });

            peer.on('call', (call: any) => {
                // Candidate receives call -> Answer with stream
                if (!isInterviewer && streamRef.current) {
                    console.log('Answering incoming call');
                    call.answer(streamRef.current);
                    setConnectionStatus('Connected to Interviewer');
                } else {
                    console.warn('Cannot answer call: Stream not ready');
                }
            });

            // ...
        };

        initPeer().catch(err => console.error('PeerJS failed to load:', err));

    }, [sessionId, isInterviewer]);
    const frameCountRef = useRef(0);
    const alertThrottleRef = useRef<Record<string, number>>({});
    const peerRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const connectionRef = useRef<any>(null);

    // Initialize MediaPipe & Camera (Candidate Only)
    useEffect(() => {
        if (isInterviewer) return; // Interviewer doesn't run FaceMesh

        const loadScripts = async () => {
            // ... (CDN Load Logic) ...
            const loadScript = (src: string): Promise<void> => {
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.async = true;
                    script.onload = () => resolve();
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            };

            try {
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
                await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
                initializeMediaPipe();
            } catch (error) {
                console.error('Failed to load MediaPipe:', error);
            }
        };

        loadScripts();

        return () => {
            // Cleanup
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, [isInterviewer]);



    // Candidate: Announce ID only when Peer AND Stream are ready
    useEffect(() => {
        if (isInterviewer || !sessionId || !isReady || !peerRef.current || !peerRef.current.id) return;

        const announceId = () => {
            const id = peerRef.current.id;
            console.log('Announcing Peer ID (Stream Ready):', id);
            logProctoringEvent(sessionId, 'PEER_CONNECT', { peerId: id });
            setConnectionStatus('Waiting for interviewer...');
        };

        announceId();
    }, [isReady, sessionId, isInterviewer]);

    // Interviewer: Connect on remotePeerId change
    useEffect(() => {
        console.log("[Proctoring] Connection Effect Triggered. isInterviewer:", isInterviewer, "PeerReady:", !!peerRef.current, "RemoteID:", remotePeerId);

        if (!isInterviewer || !peerRef.current || !remotePeerId) {
            if (!peerRef.current) console.log("[Proctoring] Waiting for local PeerJS init...");
            return;
        }

        console.log('[Proctoring] Initiating connection to:', remotePeerId);
        setConnectionStatus('Connecting...');

        // Cleanup old connection
        if (connectionRef.current) {
            connectionRef.current.close();
            connectionRef.current = null;
        }
        // Cleanup old stream
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }

        // Connect
        const conn = peerRef.current.connect(remotePeerId);
        connectionRef.current = conn;

        conn.on('open', () => {
            console.log('Data connection opened to', remotePeerId);

            // Create dummy track to initiate call
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, 1, 1); }
            const dummyStream = canvas.captureStream(1);

            const call = peerRef.current!.call(remotePeerId, dummyStream);

            call.on('stream', (remoteStream: any) => {
                console.log('Received remote stream!', remoteStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = remoteStream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play().catch(e => console.error("Play failed:", e));
                    };
                    setIsReady(true);
                    setConnectionStatus('Live Feed');
                }
            });

            call.on('error', (err: any) => console.error('Call error:', err));
        });

        conn.on('error', (err: any) => console.error('Connection error:', err));

    }, [remotePeerId, isInterviewer, isPeerReady]);


    const initializeMediaPipe = async () => {
        if (!videoRef.current || !canvasRef.current || !window.FaceMesh || !window.Camera) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Get Stream Manually to share it
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            streamRef.current = stream;
            video.srcObject = stream;

            // FaceMesh Setup
            const faceMesh = new window.FaceMesh({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
            });

            faceMesh.setOptions({
                maxNumFaces: 2,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            faceMesh.onResults((results: any) => {
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const faces = results.multiFaceLandmarks?.length || 0;
                setFaceCount(faces);

                if (faces === 0) {
                    throttledAlert('⚠️ No face detected');
                    penalizeScore(2);
                    setGazeStatus('None');
                } else if (faces > 1) {
                    throttledAlert('⚠️ Multiple faces detected');
                    penalizeScore(5);
                    setGazeStatus('Multiple');
                } else if (results.multiFaceLandmarks?.[0]) {
                    const landmarks = results.multiFaceLandmarks[0];
                    analyzeGaze(landmarks, ctx, canvas);
                }

                frameCountRef.current++;
                if (frameCountRef.current % 30 === 0) {
                    // Only recover if everything is okay
                    if (faces === 1 && gazeStatus === 'Center') {
                        recoverScore();
                    }
                }
            });

            // Use requestAnimationFrame loop instead of Camera utils to support stream sharing better
            const processFrame = async () => {
                if (video.readyState >= 2) {
                    await faceMesh.send({ image: video });
                }
                requestAnimationFrame(processFrame);
            };

            video.onloadedmetadata = () => {
                video.play();
                processFrame();
                setIsReady(true);
            };

        } catch (err) {
            console.error('Camera error:', err);
        }
    };

    // ... (throttledAlert, penalizeScore, recoverScore, analyzeGaze methods SAME AS BEFORE) ...
    const throttledAlert = (message: string) => {
        const now = Date.now();
        if (alertThrottleRef.current[message] && now - alertThrottleRef.current[message] < 3000) return;
        alertThrottleRef.current[message] = now;
        const alertData = { message, time: new Date().toLocaleTimeString() };
        setAlerts(prev => [alertData, ...prev].slice(0, 10));
        onAlert?.(message);

        const sid = sessionIdRef.current;
        if (sid) {
            console.log(`[Proctoring] Broadcasting alert: ${message} to ${sid}`);
            logProctoringEvent(sid, message, {});
        } else {
            console.warn('[Proctoring] Cannot broadcast alert: sessionId is missing');
        }
    };

    const penalizeScore = (amount: number) => {
        scoreRef.current = Math.max(0, scoreRef.current - amount);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
        const sid = sessionIdRef.current;
        if (sid) updateTrustScore(sid, scoreRef.current);
    };

    const recoverScore = () => {
        if (scoreRef.current >= 100) return;
        scoreRef.current = Math.min(100, scoreRef.current + 1);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
        const sid = sessionIdRef.current;
        if (sid) updateTrustScore(sid, scoreRef.current);
    };

    const analyzeGaze = (landmarks: any[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        // 1. Iris Gaze (Relative to Eye corners)
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];
        const leftInner = landmarks[133];
        const leftOuter = landmarks[33];
        const rightInner = landmarks[362];
        const rightOuter = landmarks[263];
        const leftTop = landmarks[159];
        const leftBot = landmarks[145];

        // Horizontal Iris Offset (0.5 = Center)
        const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
        const lIrisX = (leftIris.x - Math.min(leftInner.x, leftOuter.x)) / leftEyeWidth;
        const rIrisX = (rightIris.x - Math.min(rightInner.x, rightOuter.x)) / Math.abs(rightOuter.x - rightInner.x);
        const avgIrisX = (lIrisX + rIrisX) / 2;

        // Vertical Iris Offset (0.5 = Center)
        const eyeHeight = Math.abs(leftTop.y - leftBot.y);
        const irisY = (leftIris.y - Math.min(leftTop.y, leftBot.y)) / eyeHeight;

        // 2. Head Pose estimation (Yaw & Pitch)
        // Using Nose to Eye ratio for Yaw
        const noseTip = landmarks[1];
        const distL = Math.sqrt(Math.pow(noseTip.x - leftInner.x, 2) + Math.pow(noseTip.y - leftInner.y, 2));
        const distR = Math.sqrt(Math.pow(noseTip.x - rightInner.x, 2) + Math.pow(noseTip.y - rightInner.y, 2));
        const yawRatio = distL / distR;

        // Using Nose to Mouth/Eyebrow for Pitch
        const mouthCenter = landmarks[13];
        const browCenter = landmarks[9];
        const distNoseMouth = Math.abs(noseTip.y - mouthCenter.y);
        const distNoseBrow = Math.abs(noseTip.y - browCenter.y);
        const pitchRatio = distNoseBrow / distNoseMouth;

        let status = 'Center';
        let alertMsg = '';

        // Yaw Check (Looking Left/Right)
        if (yawRatio > 2.0) { status = 'Side'; alertMsg = '⚠️ Head Turned (Left)'; }
        else if (yawRatio < 0.5) { status = 'Side'; alertMsg = '⚠️ Head Turned (Right)'; }
        // Pitch Check (Looking Up/Down)
        else if (pitchRatio > 2.5) { status = 'Away'; alertMsg = '⚠️ Looking Down'; }
        else if (pitchRatio < 0.4) { status = 'Away'; alertMsg = '⚠️ Looking Up'; }
        // Iris Gaze Check (Subtle eye movements)
        else if (avgIrisX < 0.15) { status = 'Side'; alertMsg = '👁️ Looking Away (Right)'; }
        else if (avgIrisX > 0.85) { status = 'Side'; alertMsg = '👁️ Looking Away (Left)'; }
        else if (irisY < 0.1) { status = 'Away'; alertMsg = '👁️ Looking Up'; }
        else if (irisY > 0.9) { status = 'Away'; alertMsg = '👁️ Looking Down'; }

        setGazeStatus(status);
        if (alertMsg) {
            throttledAlert(alertMsg);
            penalizeScore(status === 'Side' ? 1 : 2);
        }

        // --- Debug Visuals ---
        const drawPoint = (landmark: any, color: string, radius = 2) => {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, radius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        };

        // Draw Eye boundaries
        const eyeColor = status === 'Center' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        [leftInner, leftOuter, rightInner, rightOuter, leftTop, leftBot].forEach(p => drawPoint(p, eyeColor));

        // Draw Iris (larger)
        drawPoint(leftIris, status === 'Center' ? '#22c55e' : '#ef4444', 4);
        drawPoint(rightIris, status === 'Center' ? '#22c55e' : '#ef4444', 4);

        // Draw Head Axis (Nose center)
        drawPoint(noseTip, '#3b82f6', 5);
        ctx.beginPath();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.moveTo(noseTip.x * canvas.width, noseTip.y * canvas.height);
        // Draw a line indicating "direction"
        const lineLen = 30;
        const dx = (0.5 - (1 / (1 + yawRatio))) * 100;
        const dy = (pitchRatio - 1.2) * 50;
        ctx.lineTo(noseTip.x * canvas.width + dx, noseTip.y * canvas.height + dy);
        ctx.stroke();
    };

    const scoreColor = trustScore > 80 ? 'text-green-600' : trustScore > 50 ? 'text-amber-600' : 'text-red-600';




    return (
        <div className="space-y-4">
            {/* Video Feed */}
            <div className="relative bg-slate-800 rounded-2xl overflow-hidden aspect-video">
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover scale-x-[-1]"
                    playsInline
                    muted
                    autoPlay // Important to not have 'autoplay' attribute alone
                />
                {!isInterviewer && (
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full scale-x-[-1]"
                        width={640}
                        height={480}
                    />
                )}
                <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-full text-xs font-semibold">
                    <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
                    {isReady ? 'Live' : connectionStatus}
                </div>
            </div>

            {/* Stats removed - handled by parent Monitor UI */}
        </div>
    );
}
