import { GRAND_FINALE_CONFIG } from '../config/GrandFinaleConfig.js';
import { GAME_BOUNDS } from '../config/config.js';

/** Time-based live finale; the first completed show persists the festival finish. */
export default class GrandFinaleManager {
    constructor(game, config = GRAND_FINALE_CONFIG) {
        this.game = game;
        this.config = config;

        this.active = false;
        this.elapsed = 0;        // seconds since this finale started
        this.cooldown = 0;       // seconds remaining before it can fire again
        this.timesFired = 0;
        this._launchAccumulator = 0;
    }

    reset() {
        this.active = false;
        this.elapsed = 0;
        this.cooldown = 0;
        this.timesFired = 0;
        this._launchAccumulator = 0;
    }

    /** Whether a finale can start right now. */
    canTrigger() {
        return this.game.grandFinaleUnlocked
            && !this.active
            && this.cooldown <= 0
            && !this.game.cinematicManager?.isPlaying;
    }

    /** Start a finale (no-op if one is running, on cooldown, or still locked). */
    trigger() {
        if (!this.canTrigger()) return false;
        this.active = true;
        this.elapsed = 0;
        this._launchAccumulator = 0;
        this.timesFired++;
        const r = this.game.renderer2D;
        this._cameraStart = { x: r.cameraX, y: r.cameraY, zoom: r.cameraZoom };
        this.game.cameraTargetX = null;
        this.game.showNotification('🎆 GRAND FINALE! 🎆');
        return true;
    }

    update(deltaTime) {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - deltaTime);

        if (this.active) {
            this.elapsed += deltaTime;
            const r = this.game.renderer2D;
            const t = Math.min(1, this.elapsed / 2);
            const ease = t * t * (3 - 2 * t);
            const zoom = this._cameraStart.zoom + (0.75 - this._cameraStart.zoom) * ease;
            const targetX = (GAME_BOUNDS.LAUNCHER_MIN_X + GAME_BOUNDS.LAUNCHER_MAX_X) / 2;
            const targetY = GAME_BOUNDS.WORLD_GROUND_Y + r.virtualHeight / (2 * 0.75);
            r.setCamera({ x: this._cameraStart.x + (targetX - this._cameraStart.x) * ease,
                y: this._cameraStart.y + (targetY - this._cameraStart.y) * ease, zoom });
            this._spawnTowardTarget(deltaTime);
            if (this.elapsed >= this.config.durationSec) {
                this.active = false;
                this.cooldown = this.config.cooldownSec;
                if (!this.game.gameCompleted) {
                    this.game.gameCompleted = true;
                    this.game.saveProgress();
                    this.game.ui.renderUpgrades?.();
                    this.game.showNotification('🎆 What a show!');
                }
            }
            return;
        }

        // Start the first show automatically; encores are manual.
        if (this.config.autoTrigger && !this.game.gameCompleted && this.canTrigger()) {
            this.trigger();
        }
    }

    /** Refill the sky: spawn enough fireworks to reach this frame's particle target. */
    _spawnTowardTarget(deltaTime) {
        const ps = this.game.particleSystem;
        if (!ps) return;

        const ramp = Math.min(1, this.elapsed / Math.max(0.0001, this.config.rampUpSec));
        this._launchAccumulator += deltaTime * this.config.fireworksPerSecond * (0.25 + 0.75 * ramp);
        const n = Math.floor(this._launchAccumulator);
        this._launchAccumulator -= n;
        // Launch rate builds the show; the buffer cap is only a safety ceiling.
        if (ps.getTotalActiveParticles() >= this.config.maxActiveParticles) return;
        for (let i = 0; i < n; i++) this._launchOne();
    }

    /** Launch a single finale firework at a random spot across the launcher zone. */
    _launchOne() {
        const game = this.game;
        const minX = GAME_BOUNDS.LAUNCHER_MIN_X;
        const maxX = GAME_BOUNDS.LAUNCHER_MAX_X;
        const x = minX + Math.random() * (maxX - minX);
        const y = GAME_BOUNDS.WORLD_LAUNCHER_Y;

        // Explode high in the sky, spread across the vertical band.
        const lo = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y + 120;
        const hi = Math.max(GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y,
            game.renderer2D.getVisibleWorldBounds().top - 180);
        const targetY = lo + Math.random() * (hi - lo);

        // Pick a random known recipe so the finale is colourful and varied.
        let components = game.currentRecipeComponents;
        if (Array.isArray(game.recipes) && game.recipes.length > 0) {
            const r = game.recipes[(Math.random() * game.recipes.length) | 0];
            if (r?.components) components = r.components.map(c => ({ ...c }));
        }

        game.fireworkSystem.launch(x, y, components, targetY, null);
        // NOTE: deliberately does NOT increment fireworkSystem.fireworkCount — that
        // counter drives crowd-size scaling, and a finale spawns thousands of
        // fireworks, which would slam the crowd to its cap instantly. The finale is
        // a spectacle + income burst, not progression toward a bigger crowd.

        const yieldMulti = game.launcherStats?.sparkleYieldMultiplier ?? 1;
        const sparkles = game.baseSparkleMultiplier * yieldMulti * this.config.sparkleYieldFraction;
        game.addSparkles(sparkles, this.config.sparkleSource);
        game.statsTracker.recordFirework(this.config.sparkleSource);
    }
}
