import { BUILDING_TYPES, DRONE_CONFIG, CROWD_CATCHER_CONFIG } from '../config/config.js';
import { SIMULATION_CONFIG } from '../config/SimulationConfig.js';
import { launcherFPS } from '../systems/ProductionRates.js';

/**
 * EmergentYieldModel — coarse, data-driven estimate of the two income sources
 * that are emergent (particle-physics-driven) in the live game: drone
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

    /** Estimated number of drones airborne given the current DRONE_HUBs. */
    static estimateActiveDrones(game) {
        const hubs = game.buildingManager.getBuildingsByType('DRONE_HUB').length;
        if (hubs === 0) return 0;
        const cfg = BUILDING_TYPES.DRONE_HUB;
        const interval = cfg.baseSpawnInterval * (game.droneHubStats?.spawnIntervalMultiplier ?? 1);
        const lifetime = cfg.baseDroneLifetime * (game.droneStats?.lifetimeMultiplier ?? 1);
        const maxDrones = game.droneStats?.maxDrones ?? DRONE_CONFIG.maxDrones;
        return Math.min(maxDrones, hubs * (lifetime / interval));
    }

    /**
     * Sparkles/sec from drones and crowd catching, given the current state.
     * @returns {{ drones: number, crowdCatching: number, particlesPerSec: number }}
     */
    rates(game, clicksPerSec = 0) {
        const cfg = this.config;
        const fireworksPerSec = launcherFPS(game) + clicksPerSec;
        const particlesPerSec = fireworksPerSec * cfg.avgParticlesPerFirework;

        // ── Drones ──────────────────────────────────────────────────────────
        let drones = 0;
        const activeDrones = EmergentYieldModel.estimateActiveDrones(game);
        if (activeDrones > 0 && particlesPerSec > 0) {
            const frac = Math.min(
                cfg.drone.maxCatchFractionTotal,
                activeDrones * cfg.drone.catchFractionPerDrone
            );
            const caught = particlesPerSec * frac;
            drones = caught
                * DRONE_CONFIG.sparklesPerParticle
                * (game.droneStats?.sparklesPerParticleMultiplier ?? 1);
        }

        // ── Crowd catching ──────────────────────────────────────────────────
        let crowdCatching = 0;
        const catapults = game.buildingManager.getBuildingsByType('CATAPULT').length;
        if (game.crowdStats?.catchingEnabled && catapults > 0 && particlesPerSec > 0) {
            const crowdSize = game.crowd?.people?.length ?? 0;
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

        return { drones, crowdCatching, particlesPerSec };
    }

    /**
     * Apply one tick of emergent income to the game, routed through the same
     * addSparkles sinks (and metric sources) the live game uses.
     */
    applyTick(game, dt, clicksPerSec = 0) {
        const { drones, crowdCatching } = this.rates(game, clicksPerSec);
        if (drones > 0) {
            game.addSparkles(drones * dt, 'drone');
            game.statsTracker.recordDroneParticle();
        }
        if (crowdCatching > 0) {
            game.addSparkles(crowdCatching * dt, 'crowd_catch');
            game.statsTracker.recordCrowdCatchParticle();
        }
    }
}
