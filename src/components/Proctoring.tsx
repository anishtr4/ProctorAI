import { useEffect, useRef, useState } from 'react';
import { logProctoringEvent } from '@/lib/supabase';

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
    const isPeerReadyRef = useRef(false); // Ref to track ready state without re-renders if needed? No, state is fine.

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
                // ... (Same analysis logic) ...
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
                if (frameCountRef.current % 30 === 0) recoverScore();
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
        if (sessionId) logProctoringEvent(sessionId, message, {});
    };

    const penalizeScore = (amount: number) => {
        scoreRef.current = Math.max(0, scoreRef.current - amount);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
    };

    const recoverScore = () => {
        scoreRef.current = Math.min(100, scoreRef.current + 1);
        setTrustScore(scoreRef.current);
        onTrustScoreChange?.(scoreRef.current);
    };

    const analyzeGaze = (landmarks: any[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        // ... (Copy existing logic) ...
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];
        const leftEyeInner = landmarks[133];
        const leftEyeOuter = landmarks[33];
        const rightEyeInner = landmarks[362];
        const rightEyeOuter = landmarks[263];
        const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
        const leftIrisOffset = (leftIris.x - leftEyeInner.x) / leftEyeWidth;
        const rightEyeWidth = Math.abs(rightEyeInner.x - rightEyeOuter.x);
        const rightIrisOffset = (rightIris.x - rightEyeOuter.x) / rightEyeWidth;
        const avgOffset = (leftIrisOffset + rightIrisOffset) / 2;
        const threshold = 0.35;
        let gaze = 'Center';
        if (avgOffset < 0.5 - threshold) {
            gaze = 'Right';
            throttledAlert('👁️ Looking Right');
            penalizeScore(1);
        } else if (avgOffset > 0.5 + threshold) {
            gaze = 'Left';
            throttledAlert('👁️ Looking Left');
            penalizeScore(1);
        }
        setGazeStatus(gaze);
        const drawPoint = (landmark: any, color: string) => {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        };
        drawPoint(leftIris, gaze === 'Center' ? '#22c55e' : '#ef4444');
        drawPoint(rightIris, gaze === 'Center' ? '#22c55e' : '#ef4444');
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

            {/* Stats (only for interviewer view) */}
            {isInterviewer && (
                <>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Trust Score</span>
                            <span className={`text-3xl font-extrabold ${scoreColor}`}>{trustScore}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {/* We don't have face count/gaze status from remote easily without data channel, 
                   but we can rely on alerts. For now show placeholders or last alert. */}
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                                <div className="text-xs text-slate-500">Last Status</div>
                                <div className="font-bold">{connectionStatus}</div>
                            </div>
                        </div>
                    </div>

                    {/* Alerts */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 max-h-64 overflow-y-auto">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Alerts</h4>
                        {alerts.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No alerts yet</p>
                        ) : (
                            <div className="space-y-2">
                                {alerts.map((alert, i) => (
                                    <div key={i} className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-3">
                                        <div className="font-semibold text-red-700 text-sm">{alert.message}</div>
                                        <div className="text-xs text-slate-500">{alert.time}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
