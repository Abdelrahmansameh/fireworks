export default class CinematicManager {
    constructor(game) {
        this.game = game;
        this.isPlaying = false;
        
        // Track async event resolvers
        this._eventResolvers = new Map();
        
        // Entity to trace camera against
        this.followedEntity = null;
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
     */
    async panCameraTo(targetX, maxDurationMs = 5000) {
        return new Promise(resolve => {
            this.game.setCameraTarget(targetX);

            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const distance = Math.abs(this.game.renderer2D.cameraX - targetX);
                const hasReached = (this.game.cameraTargetX === null || distance < 30.0);
                const isTimeout = (Date.now() - startTime) >= maxDurationMs;

                if (hasReached || isTimeout) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 50); // check 20 times a second
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
     * Must be called in FireworkGame's core loop
     */
    update(deltaTime) {
        if (!this.isPlaying) return;

        if (this.followedEntity) {
            // Instantly track target rather than smooth scroll if it's following closely, 
            // but we can just use setCameraTarget for smoothness
            this.game.setCameraTarget(this.followedEntity.x);
        }
    }
}
