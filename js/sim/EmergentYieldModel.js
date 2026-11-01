import { JETPACK_CONFIG, CROWD_CATCHER_CONFIG } from '../config/config.js';
import { SIMULATION_CONFIG } from '../config/SimulationConfig.js';
import { launcherFPS } from '../systems/ProductionRates.js';

/**
 * EmergentYieldModel — coarse, data-driven estimate of the two income sources
 * that are emergent (particle-physics-driven) in the live game: jetpack
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

    /** Owned jetpacks each provide one permanent collector. */
    static estimateActiveJetpackFans(game) {
        return game.crowd?.jetpackCount ?? game.jetpackCount ?? 0;
    }

    /**
     * Sparkles/sec from jetpacks and crowd catching, given the current state.
     * @returns {{ jetpacks: number, crowdCatching: number, particlesPerSec: number }}
     */
    rates(game, clicksPerSec = 0) {
        const cfg = this.config;
        const fireworksPerSec = launcherFPS(game) + clicksPerSec;
        const particlesPerSec = fireworksPerSec * cfg.avgParticlesPerFirework;

        // ── Jetpack fans ──────────────────────────────────────────────────────────
        let jetpacks = 0;
        const activeJetpackFans = EmergentYieldModel.estimateActiveJetpackFans(game);
        if (activeJetpackFans > 0 && particlesPerSec > 0) {
            const frac = Math.min(
                cfg.jetpack.maxCatchFractionTotal,
                activeJetpackFans * cfg.jetpack.catchFractionPerFan
            );
            const caught = particlesPerSec * frac;
            jetpacks = caught
                * JETPACK_CONFIG.sparklesPerParticle
                * (game.jetpackStats?.sparklesPerParticleMultiplier ?? 1);
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

        return { jetpacks, crowdCatching, particlesPerSec };
    }

    /**
     * Apply one tick of emergent income to the game, routed through the same
     * addSparkles sinks (and metric sources) the live game uses.
     */
    applyTick(game, dt, clicksPerSec = 0) {
        const { jetpacks, crowdCatching } = this.rates(game, clicksPerSec);
        if (jetpacks > 0) {
            game.addSparkles(jetpacks * dt, 'jetpack');
            game.statsTracker.recordJetpackParticle();
        }
        if (crowdCatching > 0) {
            game.addSparkles(crowdCatching * dt, 'crowd_catch');
            game.statsTracker.recordCrowdCatchParticle();
        }
    }
}
