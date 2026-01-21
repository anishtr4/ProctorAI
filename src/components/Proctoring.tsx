import { useEffect, useRef, useState, useCallback } from 'react';
import { logProctoringEvent, updateTrustScore } from '@/lib/supabase';

interface ProctoringProps {
    sessionId?: string;
    isInterviewer?: boolean; // false = Candidate, true = Interviewer
    remotePeerId?: string | null;
    onTrustScoreChange?: (score: number) => void;
    onAlert?: (message: string) => void;
}

interface PeerInstance {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: (event: string, cb: (...args: any[]) => void) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connect: (id: string) => { on: (event: string, cb: (...args: any[]) => void) => void; close: () => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: (id: string, stream: MediaStream) => { on: (event: string, cb: (...args: any[]) => void) => void };
    destroy: () => void;
}

declare global {
    interface Window {
        FaceMesh: new (config: { locateFile: (file: string) => string }) => {
            setOptions: (options: { maxNumFaces: number; refineLandmarks: boolean; minDetectionConfidence: number; minTrackingConfidence: number }) => void;
            onResults: (callback: (results: { multiFaceLandmarks?: { x: number; y: number; z: number }[][] }) => void) => void;
            send: (data: { image: HTMLVideoElement }) => Promise<void>;
        };
        Camera: new (video: HTMLVideoElement, options: { onFrame: () => Promise<void>; width: number; height: number }) => {
            start: () => Promise<void>;
        };
        Peer: new () => PeerInstance;
    }
}

export default function Proctoring({
    sessionId,
    isInterviewer = false,
    remotePeerId,
    onTrustScoreChange,
    onAlert
}: ProctoringProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [trustScore, setTrustScore] = useState(100);
    const [gazeStatus, setGazeStatus] = useState('Center');
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [isPeerReady, setIsPeerReady] = useState(false);

    const scoreRef = useRef(100);
    const sessionIdRef = useRef(sessionId);
    const frameCountRef = useRef(0);
    const alertThrottleRef = useRef<Record<string, number>>({});
    const peerRef = useRef<PeerInstance | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const connectionRef = useRef<{ close: () => void; on: (event: string, cb: (...args: unknown[]) => void) => void } | null>(null);

    // Keep ref in sync
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    const throttledAlert = useCallback((message: string) => {
        const now = Date.now();
        if (alertThrottleRef.current[message] && now - alertThrottleRef.current[message] < 3000) return;
        alertThrottleRef.current[message] = now;
        onAlert?.(message);

        const sid = sessionIdRef.current;
        if (sid) {
            logProctoringEvent(sid, message, {});
        }
    }, [onAlert]);

    const penalizeScore = useCallback((amount: number) => {
        scoreRef.current = Math.max(0, scoreRef.current - amount);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
        const sid = sessionIdRef.current;
        if (sid) updateTrustScore(sid, scoreRef.current);
    }, [onTrustScoreChange]);

    const recoverScore = useCallback(() => {
        if (scoreRef.current >= 100) return;
        scoreRef.current = Math.min(100, scoreRef.current + 1);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
        const sid = sessionIdRef.current;
        if (sid) updateTrustScore(sid, scoreRef.current);
    }, [onTrustScoreChange]);

    const analyzeGaze = useCallback((landmarks: { x: number; y: number; z: number }[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];
        const leftInner = landmarks[133];
        const leftOuter = landmarks[33];
        const rightInner = landmarks[362];
        const rightOuter = landmarks[263];
        const leftTop = landmarks[159];
        const leftBot = landmarks[145];

        const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x);
        const lIrisX = (leftIris.x - Math.min(leftInner.x, leftOuter.x)) / leftEyeWidth;
        const rIrisX = (rightIris.x - Math.min(rightInner.x, rightOuter.x)) / Math.abs(rightOuter.x - rightInner.x);
        const avgIrisX = (lIrisX + rIrisX) / 2;

        const eyeHeight = Math.abs(leftTop.y - leftBot.y);
        const irisY = (leftIris.y - Math.min(leftTop.y, leftBot.y)) / eyeHeight;

        const noseTip = landmarks[1];
        const distL = Math.sqrt(Math.pow(noseTip.x - leftInner.x, 2) + Math.pow(noseTip.y - leftInner.y, 2));
        const distR = Math.sqrt(Math.pow(noseTip.x - rightInner.x, 2) + Math.pow(noseTip.y - rightInner.y, 2));
        const yawRatio = distL / distR;

        const mouthCenter = landmarks[13];
        const browCenter = landmarks[9];
        const distNoseMouth = Math.abs(noseTip.y - mouthCenter.y);
        const distNoseBrow = Math.abs(noseTip.y - browCenter.y);
        const pitchRatio = distNoseBrow / distNoseMouth;

        let status = 'Center';
        let alertMsg = '';

        if (yawRatio > 2.0) { status = 'Side'; alertMsg = '⚠️ Head Turned (Left)'; }
        else if (yawRatio < 0.5) { status = 'Side'; alertMsg = '⚠️ Head Turned (Right)'; }
        else if (pitchRatio > 2.5) { status = 'Away'; alertMsg = '⚠️ Looking Down'; }
        else if (pitchRatio < 0.4) { status = 'Away'; alertMsg = '⚠️ Looking Up'; }
        else if (avgIrisX < 0.15) { status = 'Side'; alertMsg = '👁️ Looking Away (Right)'; }
        else if (avgIrisX > 0.85) { status = 'Side'; alertMsg = '👁️ Looking Away (Left)'; }
        else if (irisY < 0.1) { status = 'Away'; alertMsg = '👁️ Looking Up'; }
        else if (irisY > 0.9) { status = 'Away'; alertMsg = '👁️ Looking Down'; }

        setGazeStatus(status);
        if (alertMsg) {
            throttledAlert(alertMsg);
            penalizeScore(status === 'Side' ? 1 : 2);
        }

        const drawPoint = (landmark: { x: number; y: number; z: number }, color: string, radius = 2) => {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, radius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        };

        const eyeColor = status === 'Center' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        [leftInner, leftOuter, rightInner, rightOuter, leftTop, leftBot].forEach(p => drawPoint(p, eyeColor));
        drawPoint(leftIris, status === 'Center' ? '#22c55e' : '#ef4444', 4);
        drawPoint(rightIris, status === 'Center' ? '#22c55e' : '#ef4444', 4);
        drawPoint(noseTip, '#3b82f6', 5);

        ctx.beginPath();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.moveTo(noseTip.x * canvas.width, noseTip.y * canvas.height);
        const dx = (0.5 - (1 / (1 + yawRatio))) * 100;
        const dy = (pitchRatio - 1.2) * 50;
        ctx.lineTo(noseTip.x * canvas.width + dx, noseTip.y * canvas.height + dy);
        ctx.stroke();
    }, [throttledAlert, penalizeScore]);

    const initializeMediaPipe = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !window.FaceMesh || !window.Camera) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            streamRef.current = stream;
            video.srcObject = stream;

            const faceMesh = new window.FaceMesh({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
            });

            faceMesh.setOptions({
                maxNumFaces: 2,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            faceMesh.onResults((results: { multiFaceLandmarks?: { x: number; y: number; z: number }[][] }) => {
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const faces = results.multiFaceLandmarks?.length || 0;

                if (faces === 0) {
                    throttledAlert('⚠️ No face detected');
                    penalizeScore(2);
                    setGazeStatus('None');
                } else if (faces > 1) {
                    throttledAlert('⚠️ Multiple faces detected');
                    penalizeScore(5);
                    setGazeStatus('Multiple');
                } else if (results.multiFaceLandmarks?.[0]) {
                    analyzeGaze(results.multiFaceLandmarks[0], ctx, canvas);
                }

                frameCountRef.current++;
                if (frameCountRef.current % 30 === 0) {
                    if (faces === 1 && gazeStatus === 'Center') {
                        recoverScore();
                    }
                }
            });

            const processFrame = async () => {
                if (video.readyState >= 2) {
                    await faceMesh.send({ image: video });
                }
                requestAnimationFrame(processFrame);
            };

            video.onloadedmetadata = () => {
                video.play().catch(e => console.error("Video play failed:", e));
                processFrame();
                setIsReady(true);
            };
        } catch (err) {
            console.error('Camera error:', err);
        }
    }, [analyzeGaze, throttledAlert, penalizeScore, recoverScore, gazeStatus]);

    useEffect(() => {
        if (!sessionId) return;
        if (peerRef.current) return;

        const initPeer = async () => {
            if (!window.Peer) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
                    script.async = true;
                    script.onload = () => resolve();
                    script.onerror = (e) => reject(e);
                    document.head.appendChild(script);
                });
            }

            const Peer = window.Peer;
            const peer = new Peer();
            peerRef.current = peer;

            peer.on('open', (id: string) => {
                console.log('My Peer ID:', id);
                setIsPeerReady(true);
            });

            peer.on('call', (call: { answer: (stream: MediaStream) => void; on: (event: string, cb: (data: unknown) => void) => void }) => {
                if (!isInterviewer && streamRef.current) {
                    call.answer(streamRef.current);
                    setConnectionStatus('Connected to Interviewer');
                }
            });
        };

        initPeer().catch(err => console.error('PeerJS failed to load:', err));
    }, [sessionId, isInterviewer]);

    useEffect(() => {
        if (isInterviewer) return;
        initializeMediaPipe();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, [isInterviewer, initializeMediaPipe]);

    useEffect(() => {
        if (isInterviewer || !sessionId || !isReady || !peerRef.current || !peerRef.current.id) return;
        const id = peerRef.current.id;
        logProctoringEvent(sessionId, 'PEER_CONNECT', { peerId: id });
        setConnectionStatus('Waiting for interviewer...');
    }, [isReady, sessionId, isInterviewer]);

    useEffect(() => {
        if (!isInterviewer || !peerRef.current || !remotePeerId || !isPeerReady) return;

        setConnectionStatus('Connecting...');
        if (connectionRef.current) {
            connectionRef.current.close();
        }

        const conn = peerRef.current.connect(remotePeerId);
        connectionRef.current = conn;

        conn.on('open', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1; canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.fillStyle = "black"; ctx.fillRect(0, 0, 1, 1); }
            const dummyStream = canvas.captureStream(1);

            const call = peerRef.current!.call(remotePeerId, dummyStream);
            call.on('stream', (remoteStream: MediaStream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = remoteStream;
                    videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(e => console.error("Play failed:", e));
                    setIsReady(true);
                    setConnectionStatus('Live Feed');
                }
            });
        });
    }, [remotePeerId, isInterviewer, isPeerReady]);

    return (
        <div className="relative bg-slate-800 rounded-2xl overflow-hidden aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted autoPlay />
            {!isInterviewer && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full scale-x-[-1]" width={640} height={480} />}
            <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 bg-white/90 rounded-full text-xs font-semibold">
                <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
                {isReady ? `Live (${trustScore}%)` : connectionStatus}
            </div>
        </div>
    );
}
