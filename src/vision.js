import { FaceMesh, FACEMESH_TESSELATION, FACEMESH_RIGHT_EYE, FACEMESH_LEFT_EYE, FACEMESH_FACE_OVAL } from '@mediapipe/face_mesh';
import { Camera as MPCamera } from '@mediapipe/camera_utils';
import { drawConnectors } from '@mediapipe/drawing_utils';

export class VisionEngine {
    constructor(videoElement, canvasElement, onResultsCallback) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.onResultsCallback = onResultsCallback;
        this.faceMesh = null;
        this.camera = null;
    }

    async initialize() {
        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                // Load assets from remote CDN to avoid complex local asset management in pure Vite vanilla
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        this.faceMesh.setOptions({
            maxNumFaces: 2, // Detect up to 2 faces to identify unauthorized help
            refineLandmarks: true, // Critical for iris tracking
            minDetectionConfidence: 0.4, // Lowered for easier detection
            minTrackingConfidence: 0.4
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        // Initialize MediaPipe Camera Utils to handle frame processing loop
        this.camera = new MPCamera(this.videoElement, {
            onFrame: async () => {
                if (!this.videoElement || this.videoElement.readyState < 2) {
                    return; // Wait for video to be ready
                }
                try {
                    await this.faceMesh.send({ image: this.videoElement });
                } catch (err) {
                    console.error("FaceMesh Send Error:", err);
                }
            },
            width: 1280,
            height: 720
        });
    }

    start() {
        if (this.camera) {
            this.camera.start();
        }
    }

    onResults(results) {
        // Resize canvas to match video if needed
        if (this.canvasElement.width !== this.videoElement.videoWidth ||
            this.canvasElement.height !== this.videoElement.videoHeight) {
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
        }

        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        // Optional: Draw face mesh here if in debug mode
        if (results.multiFaceLandmarks) {
            for (const landmarks of results.multiFaceLandmarks) {
                drawConnectors(this.ctx, landmarks, FACEMESH_TESSELATION,
                    { color: '#C0C0C070', lineWidth: 1 });
                drawConnectors(this.ctx, landmarks, FACEMESH_FACE_OVAL,
                    { color: '#E0E0E0', lineWidth: 1 });

                // Draw Irises
                const leftIris = landmarks[468];
                const rightIris = landmarks[473];

                if (leftIris) {
                    this.ctx.beginPath();
                    this.ctx.arc(leftIris.x * this.canvasElement.width, leftIris.y * this.canvasElement.height, 4, 0, 2 * Math.PI);
                    this.ctx.fillStyle = "#00FF00"; // Green for Left (screen)
                    this.ctx.fill();
                }
                if (rightIris) {
                    this.ctx.beginPath();
                    this.ctx.arc(rightIris.x * this.canvasElement.width, rightIris.y * this.canvasElement.height, 4, 0, 2 * Math.PI);
                    this.ctx.fillStyle = "#FF0000"; // Red for Right (screen)
                    this.ctx.fill();
                }
            }
        }

        this.ctx.restore();

        // Pass results to the analyzer
        if (this.onResultsCallback) {
            this.onResultsCallback(results);
        }
    }
}
