import { GRAND_FINALE_CONFIG } from '../config/GrandFinaleConfig.js';
import { GAME_BOUNDS } from '../config/config.js';

/**
 * GrandFinaleManager — the live-game climax event (unlocked ~15 min).
 *
 * While active it floods the sky with fireworks, refilling the particle count
 * each frame toward `targetFillFraction × maxParticles` and holding it there for
 * `durationSec`. Every finale firework pays out launcher sparkles (source
 * 'grand_finale'), so the launcher — the particle supply all game — gets a
 * spectacular income encore.
 *
 * Lives only in the live FireworkGame (it needs the particle system + Firework
 * entities). The headless simulator models the same income burst analytically
 * in GameCore.stepHeadless so balance stays honest.
 */
export default class GrandFinaleManager {
    constructor(game, config = GRAND_FINALE_CONFIG) {
        this.game = game;
        this.config = config;

        this.active = false;
        this.elapsed = 0;        // seconds since this finale started
        this.cooldown = 0;       // seconds remaining before it can fire again
        this.timesFired = 0;
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
        this.timesFired++;
        this.game.showNotification('🎆 GRAND FINALE! 🎆');
        return true;
    }

    update(deltaTime) {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - deltaTime);

        if (this.active) {
            this.elapsed += deltaTime;
            this._spawnTowardTarget(deltaTime);
            if (this.elapsed >= this.config.durationSec) {
                this.active = false;
                this.cooldown = this.config.cooldownSec;
            }
            return;
        }

        // Idle: auto-fire on cadence once unlocked.
        if (this.config.autoTrigger && this.canTrigger()) {
            this.trigger();
        }
    }

    /** Refill the sky: spawn enough fireworks to reach this frame's particle target. */
    _spawnTowardTarget(deltaTime) {
        const ps = this.game.particleSystem;
        if (!ps) return;

        const cap = ps.maxParticles * this.config.targetFillFraction;
        // Ease the target from 0 → cap over rampUpSec, then hold at cap.
        const ramp = Math.min(1, this.elapsed / Math.max(0.0001, this.config.rampUpSec));
        const target = cap * ramp;

        const current = ps.getTotalActiveParticles();
        const gap = target - current;
        if (gap <= 0) return;

        let n = Math.ceil(gap / this.config.avgParticlesPerFirework);
        n = Math.min(n, this.config.maxFireworksPerFrame);

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
        const lo = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y
        const hi = GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y ?? (lo - 1200);
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
