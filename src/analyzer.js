import { logProctoringEvent } from './supabase.js';

export class Analyzer {
    constructor(uiElements, sessionId = null) {
        this.ui = uiElements;
        this.sessionId = sessionId;
        this.trustScore = 100;
        this.warnings = [];
        this.suspicionThreshold = 8;
        this.gazeCounter = 0;
        this.lastAlertTime = 0;
        this.blinkThreshold = 0.08;
    }

    process(results) {
        const landmarks = results.multiFaceLandmarks;

        const faceCount = landmarks ? landmarks.length : 0;
        this.ui.faceCount.textContent = faceCount;

        if (faceCount === 0) {
            this.addWarning("⚠️ No face detected");
            this.penalizeScore(1);
            this.ui.gazeStatus.textContent = "-";
            return;
        }

        if (faceCount > 1) {
            this.addWarning("👥 Multiple faces detected");
            this.penalizeScore(5);
            this.ui.gazeStatus.textContent = "Multiple";
            return;
        }

        const face = landmarks[0];
        if (this.isBlinking(face)) {
            this.ui.gazeStatus.textContent = "Blink";
            return;
        }

        const gazeResult = this.estimateGaze(face);
        this.ui.gazeStatus.textContent = gazeResult.zone;

        if (gazeResult.zone !== "Screen") {
            this.gazeCounter++;
            if (this.gazeCounter > this.suspicionThreshold) {
                const icon = gazeResult.type === "iris" ? "👁️" : "🔄";
                this.addWarning(`${icon} ${gazeResult.zone}`);
                this.penalizeScore(3);
                this.gazeCounter = 0;
            }
        } else {
            this.gazeCounter = Math.max(0, this.gazeCounter - 1);
            this.recoverScore(0.1);
        }

        this.updateUI();
    }

    isBlinking(landmarks) {
        const leftTop = landmarks[159];
        const leftBottom = landmarks[145];
        const leftInner = landmarks[133];
        const leftOuter = landmarks[33];

        const rightTop = landmarks[386];
        const rightBottom = landmarks[374];
        const rightInner = landmarks[362];
        const rightOuter = landmarks[263];

        if (!leftTop || !rightTop) return false;

        const leftHeight = Math.abs(leftBottom.y - leftTop.y);
        const leftWidth = Math.abs(leftOuter.x - leftInner.x);
        const leftEAR = leftWidth > 0 ? leftHeight / leftWidth : 1;

        const rightHeight = Math.abs(rightBottom.y - rightTop.y);
        const rightWidth = Math.abs(rightOuter.x - rightInner.x);
        const rightEAR = rightWidth > 0 ? rightHeight / rightWidth : 1;

        const avgEAR = (leftEAR + rightEAR) / 2;
        return avgEAR < this.blinkThreshold;
    }

    estimateGaze(landmarks) {
        const irisResult = this.checkIris(landmarks);
        const headResult = this.checkHeadPose(landmarks);

        if (irisResult.outsideZone) {
            return {
                direction: irisResult.direction,
                type: "iris",
                zone: `Eye→${irisResult.direction}`
            };
        }

        if (headResult.outsideZone) {
            return {
                direction: headResult.direction,
                type: "head",
                zone: `Head→${headResult.direction}`
            };
        }

        return { direction: "Center", type: null, zone: "Screen" };
    }

    checkIris(landmarks) {
        const leftIris = landmarks[468];
        const rightIris = landmarks[473];

        const leftEyeInner = landmarks[133];
        const leftEyeOuter = landmarks[33];
        const leftEyeTop = landmarks[159];
        const leftEyeBottom = landmarks[145];

        const rightEyeInner = landmarks[362];
        const rightEyeOuter = landmarks[263];
        const rightEyeTop = landmarks[386];
        const rightEyeBottom = landmarks[374];

        if (!leftIris || !rightIris) {
            return { direction: "Center", outsideZone: false };
        }

        const leftEyeCenterX = (leftEyeInner.x + leftEyeOuter.x) / 2;
        const rightEyeCenterX = (rightEyeInner.x + rightEyeOuter.x) / 2;
        const leftEyeCenterY = (leftEyeTop.y + leftEyeBottom.y) / 2;
        const rightEyeCenterY = (rightEyeTop.y + rightEyeBottom.y) / 2;

        const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
        const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
        const leftEyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y);
        const rightEyeHeight = Math.abs(rightEyeBottom.y - rightEyeTop.y);

        if (leftEyeHeight < 0.003 || rightEyeHeight < 0.003) {
            return { direction: "Center", outsideZone: false };
        }

        const leftNormX = (leftIris.x - leftEyeCenterX) / (leftEyeWidth / 2);
        const rightNormX = (rightIris.x - rightEyeCenterX) / (rightEyeWidth / 2);
        const leftNormY = (leftIris.y - leftEyeCenterY) / (leftEyeHeight / 2);
        const rightNormY = (rightIris.y - rightEyeCenterY) / (rightEyeHeight / 2);

        const avgNormX = (leftNormX + rightNormX) / 2;
        const avgNormY = (leftNormY + rightNormY) / 2;

        // BALANCED - 30% toward edge
        const edgeThresholdX = 0.30;
        const edgeThresholdY = 0.35;

        let direction = "";
        let outsideZone = false;

        if (avgNormX < -edgeThresholdX) {
            direction = "Right";
            outsideZone = true;
        } else if (avgNormX > edgeThresholdX) {
            direction = "Left";
            outsideZone = true;
        }

        if (avgNormY < -edgeThresholdY) {
            direction = direction ? direction + "-Up" : "Up";
            outsideZone = true;
        } else if (avgNormY > edgeThresholdY) {
            direction = direction ? direction + "-Down" : "Down";
            outsideZone = true;
        }

        return { direction: direction || "Center", outsideZone };
    }

    checkHeadPose(landmarks) {
        const nose = landmarks[1];
        const leftCheek = landmarks[234];
        const rightCheek = landmarks[454];
        const forehead = landmarks[10];
        const chin = landmarks[152];

        const midPointX = (leftCheek.x + rightCheek.x) / 2;
        const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
        const xOffset = faceWidth > 0 ? (nose.x - midPointX) / (faceWidth / 2) : 0;

        const faceMidY = (forehead.y + chin.y) / 2;
        const faceHeight = Math.abs(chin.y - forehead.y);
        const yOffset = faceHeight > 0 ? (nose.y - faceMidY) / (faceHeight / 2) : 0;

        // BALANCED - 18% head turn
        const headThresholdX = 0.18;
        const headThresholdY = 0.22;

        let direction = "";
        let outsideZone = false;

        if (xOffset < -headThresholdX) {
            direction = "Right";
            outsideZone = true;
        } else if (xOffset > headThresholdX) {
            direction = "Left";
            outsideZone = true;
        }

        if (yOffset < -headThresholdY) {
            direction = direction ? direction + "-Up" : "Up";
            outsideZone = true;
        } else if (yOffset > headThresholdY) {
            direction = direction ? direction + "-Down" : "Down";
            outsideZone = true;
        }

        return { direction: direction || "Center", outsideZone };
    }

    penalizeScore(amount) {
        this.trustScore = Math.max(0, this.trustScore - amount);
        this.ui.trustScore.textContent = Math.floor(this.trustScore);
        this.updateScoreColor();
    }

    recoverScore(amount) {
        this.trustScore = Math.min(100, this.trustScore + amount);
        this.ui.trustScore.textContent = Math.floor(this.trustScore);
        this.updateScoreColor();
    }

    addWarning(msg) {
        const now = Date.now();
        if (now - this.lastAlertTime < 1500) return;

        this.lastAlertTime = now;
        const li = document.createElement("li");
        li.className = "log-item";
        li.innerHTML = `<span class="log-message">${msg}</span><span class="log-time">${new Date().toLocaleTimeString()}</span>`;
        this.ui.eventLog.prepend(li);

        // Log to Supabase for real-time sync
        if (this.sessionId) {
            logProctoringEvent(this.sessionId, msg, { trustScore: this.trustScore });
        }

        while (this.ui.eventLog.children.length > 10) {
            this.ui.eventLog.removeChild(this.ui.eventLog.lastChild);
        }
    }

    updateScoreColor() {
        const score = this.trustScore;
        const el = this.ui.trustScore;
        if (score > 80) {
            el.style.color = "#22c55e";
        } else if (score > 50) {
            el.style.color = "#f59e0b";
        } else {
            el.style.color = "#ef4444";
        }
    }

    updateUI() { }
}
