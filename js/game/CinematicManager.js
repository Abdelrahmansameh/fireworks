// --- Cinematic zoom configuration ---
export const CINEMATIC_CONFIG = {
    // First crowd cinematic zoom-in
    ZOOM_IN_DELAY_MS:    50,   // ms after crowd member appears before zoom starts
    ZOOM_IN_DURATION_MS: 600,  // ms for zoom-in animation
    ZOOM_IN_LEVEL:       1.5,   // how far in to zoom (1.0 = normal)
    ZOOM_Y_OFFSET:       315,    // world units above person.y to center the zoom on (shows body, not feet)
    FOLLOW_DELAY_MS:       1200,    // ms after zoom-in before camera starts following the person
    // Firework launched in front of the person before coin toss
    FIREWORK_SPAWN_DELAY_MS:  500,   // ms after arrival before the firework launches
    FIREWORK_OFFSET_X:        300,   // world units to the right of the person
    FIREWORK_OFFSET_Y:        -500,   // world units above the person (burst height)
    POST_EXPLOSION_DELAY_MS:  800,   // ms after explosion before coin toss

    // Beat between the person stopping at his spot and tossing the coin
    COIN_TOSS_DELAY_MS:  100,

    // First crowd cinematic zoom-out (after coin toss)
    ZOOM_OUT_DELAY_MS:    1500,  // ms after coin toss before zoom-out starts
    ZOOM_OUT_DURATION_MS: 900,  // ms for zoom-out animation

    // Mobile shots fit the fan and the burst into the actual CSS viewport.
    MOBILE: {
        MAX_ZOOM: 3.0,
        FRAME_PADDING_PX: 24,
        PERSON_HALF_WIDTH: 65,
        FEET_PADDING: 40,
        ARRIVAL_TOP_OFFSET: 150,
        FIREWORK_OFFSET_X: 110,
        FIREWORK_HEIGHT: 440,
        BURST_RADIUS: 200,
        SHOT_TRANSITION_MS: 500,
    },
};

export default class CinematicManager {
    constructor(game) {
        this.game = game;
        this.isPlaying = false;

        // Track async event resolvers
        this._eventResolvers = new Map();
        this._pendingWaits = [];

        // Entity to trace camera against
        this.followedEntity = null;

        // Active zoom tween state
        this._zoomTween = null;
        this._cameraFraming = null;
    }

    /**
     * Start playing an async cinematic sequence.
     * @param {Function} sequenceFn async function(game, cm)
     */
    async play(sequenceFn) {
        if (this.isPlaying) return;
        const r = this.game.renderer2D;
        const originalCamera = { x: r.cameraX, y: r.cameraY, zoom: r.cameraZoom };
        this.isPlaying = true;
        document.body.classList.add('cinematic-active');
        document.body.classList.toggle('mobile-cinematic', this.game.chrome?.mobile.matches
            ?? window.matchMedia('(max-width: 700px)').matches);
        
        // Disable game interactions and freeze UI
        this.game.ui.collapseForCinematic(true);
        this.game.isInputDisabled = true;
        this.game.hideFloatingSparkles = true;

        try {
            await sequenceFn(this.game, this);
        } catch(error) {
            console.error('Cinematic sequence failed:', error);
            const framing = this.game.chrome?.getCameraFraming() ?? originalCamera;
            r.setCamera({ x: originalCamera.x, y: framing.y, zoom: framing.zoom });
        } finally {
            // Release the camera at the sequence's final framing. Mobile chrome
            // shares that target, so it does not have to undo a desktop zoom.
            this.stopFollowing();
            this._zoomTween = null;
            this._eventResolvers.clear();
            this._pendingWaits.length = 0;
            this.isPlaying = false;
            this.game.isInputDisabled = false;
            this.game.hideFloatingSparkles = false;
            this.game.ui.collapseForCinematic(false);
            document.body.classList.remove('cinematic-active', 'mobile-cinematic');
        }
    }

    /**
     * Utility: Pause execution for N milliseconds
     */
    async wait(ms) {
        return this._waitUntil(() => false, ms);
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

            this._pendingWaits.push({ elapsed: 0, timeout: maxDurationMs,
                ready: () => this.game.cameraTargetX === null || Math.abs(this.game.renderer2D.cameraX - targetX) < 80,
                resolve: () => { this.game.cameraTransitionSpeed = prevSpeed; resolve(); } });
        });
    }

    /**
     * Utility: Make the camera update tick track an entity's X.
     */
    followEntity(entity) {
        this._cameraFraming = null;
        this.followedEntity = entity;
    }

    stopFollowing() {
        this.followedEntity = null;
        this._cameraFraming = null;
        this.game.cameraTargetX = null;
    }

    /** Tween into a responsive shot, then hold it until the next camera command. */
    frameCamera(getCamera, durationMs) {
        this.stopFollowing();
        const target = getCamera();
        const transition = this.zoomCamera(target.zoom, durationMs, target.x, target.y);
        this._cameraFraming = getCamera;
        return transition;
    }

    /** Keep the full fan, rocket ascent, and burst inside a phone-sized shot. */
    getMobileCrowdFrame(person, includeFirework = false) {
        const r = this.game.renderer2D;
        const config = CINEMATIC_CONFIG.MOBILE;
        const canvas = r.canvas.getBoundingClientRect();
        const left = person.x - (includeFirework
            ? Math.max(config.PERSON_HALF_WIDTH, config.BURST_RADIUS - config.FIREWORK_OFFSET_X)
            : config.PERSON_HALF_WIDTH);
        const right = person.x + (includeFirework
            ? config.FIREWORK_OFFSET_X + config.BURST_RADIUS : config.PERSON_HALF_WIDTH);
        const bottom = person.y - config.FEET_PADDING;
        const top = person.y + (includeFirework
            ? config.FIREWORK_HEIGHT + config.BURST_RADIUS : config.ARRIVAL_TOP_OFFSET);
        const unitsPerPixel = r.virtualHeight / Math.max(1, canvas.height);
        const usableWidth = Math.max(1, canvas.width - config.FRAME_PADDING_PX * 2) * unitsPerPixel;
        const usableHeight = Math.max(1, canvas.height - config.FRAME_PADDING_PX * 2) * unitsPerPixel;
        return {
            x: (left + right) / 2,
            y: (bottom + top) / 2,
            zoom: Math.min(config.MAX_ZOOM, usableWidth / (right - left), usableHeight / (top - bottom)),
        };
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
     * Utility: Resolves when the given Firework instance has exploded.
     */
    waitForExplosion(firework, timeoutMs = 10000) {
        return this._waitUntil(() => firework.exploded, timeoutMs);
    }

    _waitUntil(ready, timeout) {
        return new Promise(resolve => this._pendingWaits.push({ elapsed: 0, timeout, ready, resolve }));
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
        this._cameraFraming = null;
        return new Promise(resolve => {
            const r = this.game.renderer2D;
            this._zoomTween = {
                startZoom: r.cameraZoom,
                targetZoom,
                startX: r.cameraX,
                startY: r.cameraY,
                targetX: targetX ?? r.cameraX,
                targetY: targetY ?? r.cameraY,
                elapsed: 0,
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
        for (let i = this._pendingWaits.length - 1; i >= 0; i--) {
            const wait = this._pendingWaits[i];
            wait.elapsed += deltaTime * 1000;
            if (wait.elapsed >= wait.timeout || wait.ready()) {
                this._pendingWaits.splice(i, 1);
                wait.resolve();
            }
        }

        if (this.followedEntity && !this._zoomTween) {
            // Normal follow: smooth pan via game's camera system
            this.game.setCameraTarget(this.followedEntity.x);
        }

        if (this._zoomTween) {
            const { startZoom, startX, startY, durationMs, resolve } = this._zoomTween;
            const target = this._cameraFraming?.();
            const targetZoom = target?.zoom ?? this._zoomTween.targetZoom;
            const targetX = target?.x ?? this._zoomTween.targetX;
            const targetY = target?.y ?? this._zoomTween.targetY;
            this._zoomTween.elapsed += deltaTime * 1000;
            const elapsed = this._zoomTween.elapsed;
            const t = durationMs > 0 ? Math.min(elapsed / durationMs, 1.0) : 1;
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
        } else if (this._cameraFraming) {
            // Cinematic tracking deliberately bypasses normal scroll bounds:
            // the fan enters beyond the left edge of the playable camera area.
            this.game.cameraTargetX = null;
            this.game.renderer2D.setCamera(this._cameraFraming());
        }
    }
}
