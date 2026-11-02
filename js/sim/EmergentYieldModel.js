import { FLYER_CONFIG, CROWD_CATCHER_CONFIG } from '../config/config.js';
import { SIMULATION_CONFIG } from '../config/SimulationConfig.js';
import { portalFPS } from '../systems/ProductionRates.js';

/**
 * EmergentYieldModel — coarse, data-driven estimate of the two income sources
 * that are emergent (particle-physics-driven) in the live game: flyer
 * collection and crowd catching.
 *
 * Used ONLY in headless mode. The live game keeps its real particle physics
 * for these sources (per design decision) — this model exists so the simulator
 * can attribute income without simulating thousands of particles.
 *
 * All magic numbers live in SimulationConfig.js so balance can be tuned in data.
 */
export default class EmergentYieldModel {
    constructor(config = SIMULATION_CONFIG) {
        this.config = config;
    }

    /** Owned flyers each provide one permanent collector. */
    static estimateActiveFlyers(game) {
        return game.crowd?.flyerCount ?? game.flyerCount ?? 0;
    }

    /**
     * Sparkles/sec from flyers and crowd catching, given the current state.
     * @returns {{ flyers: number, crowdCatching: number, particlesPerSec: number }}
     */
    rates(game, clicksPerSec = 0) {
        const cfg = this.config;
        const fireworksPerSec = portalFPS(game) + clicksPerSec;
        const particlesPerSec = fireworksPerSec * cfg.avgParticlesPerFirework;

        // ── Flyers ──────────────────────────────────────────────────────────
        let flyers = 0;
        const activeFlyers = EmergentYieldModel.estimateActiveFlyers(game);
        if (activeFlyers > 0 && particlesPerSec > 0) {
            const frac = Math.min(
                cfg.flyer.maxCatchFractionTotal,
                activeFlyers * cfg.flyer.catchFractionPerFan
            );
            const caught = particlesPerSec * frac;
            flyers = caught
                * FLYER_CONFIG.sparklesPerParticle
                * (game.flyerStats?.sparklesPerParticleMultiplier ?? 1);
        }

        // ── Crowd catching ──────────────────────────────────────────────────
        let crowdCatching = 0;
        const catapults = game.buildingManager.getBuildingsByType('CATAPULT').length;
        if (game.crowdStats?.catchingEnabled && catapults > 0 && particlesPerSec > 0) {
            const crowdSize = game.crowd?.naturalCount ?? game.crowd?.people?.length ?? 0;
            const activeCatchers = Math.min(crowdSize, catapults * cfg.crowd.catchersPerCatapult);
            if (activeCatchers > 0) {
                const frac = Math.min(
                    cfg.crowd.maxCatchFractionTotal,
                    activeCatchers * cfg.crowd.catchFractionPerCatcher
                );
                const caught = particlesPerSec * frac;
                crowdCatching = caught
                    * CROWD_CATCHER_CONFIG.sparklesPerParticle
                    * (game.crowdStats?.sparklesPerParticleMultiplier ?? 1)
                    * (game.crowdStats?.collectionRadiusMultiplier ?? 1);
            }
        }

        return { flyers, crowdCatching, particlesPerSec };
    }

    /**
     * Apply one tick of emergent income to the game, routed through the same
     * addSparkles sinks (and metric sources) the live game uses.
     */
    applyTick(game, dt, clicksPerSec = 0) {
        const { flyers, crowdCatching } = this.rates(game, clicksPerSec);
        if (flyers > 0) {
            game.addSparkles(flyers * dt, 'flyer');
            game.statsTracker.recordFlyerParticle();
        }
        if (crowdCatching > 0) {
            game.addSparkles(crowdCatching * dt, 'crowd_catch');
            game.statsTracker.recordCrowdCatchParticle();
        }
    }
}
