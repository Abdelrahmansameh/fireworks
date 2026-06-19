// --- Cinematic zoom configuration ---
export const CINEMATIC_CONFIG = {
    // First crowd cinematic zoom-in
    ZOOM_IN_DELAY_MS:    50,   // ms after crowd member appears before zoom starts
    ZOOM_IN_DURATION_MS: 600,  // ms for zoom-in animation
    ZOOM_IN_LEVEL:       1.5,   // how far in to zoom (1.0 = normal)
    ZOOM_Y_OFFSET:       315,    // world units above person.y to center the zoom on (shows body, not feet)
    FOLLOW_DELAY_MS:       1200,    // ms after zoom-in before camera starts following the person
    // Beat between the person stopping at his spot and tossing the coin
    COIN_TOSS_DELAY_MS:  400,

    // First crowd cinematic zoom-out (after coin toss)
    ZOOM_OUT_DELAY_MS:    1500,  // ms after coin toss before zoom-out starts
    ZOOM_OUT_DURATION_MS: 900,  // ms for zoom-out animation
};

export default class CinematicManager {
    constructor(game) {
        this.game = game;
        this.isPlaying = false;

        // Track async event resolvers
        this._eventResolvers = new Map();

        // Entity to trace camera against
        this.followedEntity = null;

        // Active zoom tween state
        this._zoomTween = null;
    }

    /**
     * Start playing an async cinematic sequence.
     * @param {Function} sequenceFn async function(game, cm)
     */
    async play(sequenceFn) {
        this.isPlaying = true;
        
        // Disable game interactions and freeze UI
        this.game.ui.collapseForCinematic(true);
        this.game.isInputDisabled = true;
        this.game.hideFloatingSparkles = true;

        try {
            await sequenceFn(this.game, this);
        } catch(error) {
            console.error('Cinematic sequence failed:', error);
        }

        // Cleanup after sequence completes
        this.stopFollowing();
        this._zoomTween = null;
        this.game.renderer2D.cameraZoom = 1.0;
        this.game.renderer2D.setCamera({
            x: this.game.renderer2D.cameraX,
            y: this.game.renderer2D.cameraY,
            zoom: 1.0,
        });
        this.isPlaying = false;
        this.game.isInputDisabled = false;
        this.game.hideFloatingSparkles = false;
        this.game.ui.collapseForCinematic(false);
    }

    /**
     * Utility: Pause execution for N milliseconds
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Utility: Pan the camera to a specific X coordinate over time.
     * @param {number} panSpeed overrides cameraTransitionSpeed for this pan (higher = snappier)
     */
    async panCameraTo(targetX, maxDurationMs = 5000, panSpeed = null) {
        const prevSpeed = this.game.cameraTransitionSpeed;
        if (panSpeed !== null) this.game.cameraTransitionSpeed = panSpeed;

        return new Promise(resolve => {
            this.game.setCameraTarget(targetX);

            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const distance = Math.abs(this.game.renderer2D.cameraX - targetX);
                const hasReached = (this.game.cameraTargetX === null || distance < 80.0);
                const isTimeout = (Date.now() - startTime) >= maxDurationMs;

                if (hasReached || isTimeout) {
                    clearInterval(checkInterval);
                    this.game.cameraTransitionSpeed = prevSpeed;
                    resolve();
                }
            }, 200); // check 20 times a second
        });
    }

    /**
     * Utility: Make the camera update tick track an entity's X.
     */
    followEntity(entity) {
        this.followedEntity = entity;
    }

    stopFollowing() {
        this.followedEntity = null;
        this.game.cameraTargetX = null;
    }

    /**
     * Utility: Wait until some point in the code calls `resumeEvent("eventName")`.
     */
    async waitForEvent(eventName) {
        return new Promise(resolve => {
            this._eventResolvers.set(eventName, resolve);
        });
    }

    /**
     * Utility: Resolves an ongoing `waitForEvent` call.
     */
    resumeEvent(eventName) {
        if (this._eventResolvers.has(eventName)) {
            const resolve = this._eventResolvers.get(eventName);
            resolve();
            this._eventResolvers.delete(eventName);
        }
    }

    /**
     * Smoothly animate zoom from current to targetZoom over durationMs.
     * targetX/targetY: world position to center the zoom on. If null, keeps current position.
     */
    zoomCamera(targetZoom, durationMs, targetX = null, targetY = null) {
        return new Promise(resolve => {
            const r = this.game.renderer2D;
            this._zoomTween = {
                startZoom: r.cameraZoom,
                targetZoom,
                startX: r.cameraX,
                startY: r.cameraY,
                targetX: targetX ?? r.cameraX,
                targetY: targetY ?? r.cameraY,
                startTime: performance.now(),
                durationMs,
                resolve,
            };
        });
    }

    /**
     * Must be called in FireworkGame's core loop
     */
    update(deltaTime) {
        if (!this.isPlaying) return;

        if (this.followedEntity && !this._zoomTween) {
            // Normal follow: smooth pan via game's camera system
            this.game.setCameraTarget(this.followedEntity.x);
        }

        if (this._zoomTween) {
            const { startZoom, targetZoom, startX, startY, targetX, targetY, startTime, durationMs, resolve } = this._zoomTween;
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / durationMs, 1.0);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            const zoom = startZoom + (targetZoom - startZoom) * ease;
            // If following an entity, ease toward their live X so we don't snap from
            // the camera's current (lagged) position onto the entity. Otherwise
            // interpolate to the static targetX.
            const x = this.followedEntity
                ? startX + (this.followedEntity.x - startX) * ease
                : startX + (targetX - startX) * ease;
            const y = startY + (targetY - startY) * ease;

            // Take full control of camera — kill game-loop pan so nothing fights us
            this.game.cameraTargetX = null;
            this.game.renderer2D.cameraX = x;
            this.game.renderer2D.cameraY = y;
            this.game.renderer2D.cameraZoom = zoom;
            this.game.renderer2D.setCamera({ x, y, zoom });

            if (t >= 1.0) {
                this._zoomTween = null;
                resolve();
            }
        }
    }
}
