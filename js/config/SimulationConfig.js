/**
 * SimulationConfig — tunable parameters for the headless economy simulation.
 *
 * Drone collection and crowd-catching income are *emergent* in the live game:
 * drones and crowd members physically vacuum up firework-explosion particles,
 * so there is no closed-form yield. For the headless simulator we replace that
 * physics with a coarse, fully data-driven flow estimate (no particle
 * positions — just "how many particles are emitted, and what fraction gets
 * caught"). Tune these knobs to make the estimate track the live game.
 *
 * Flow model (per second):
 *   particlesEmitted = (launcherFPS + clicksPerSec) * avgParticlesPerFirework
 *   dronesCaught     = particlesEmitted * droneCatchFraction(activeDrones)
 *   crowdCaught      = particlesEmitted * crowdCatchFraction(activeCatchers)
 *
 * The fraction functions saturate (you can't catch more than what's emitted),
 * controlled by the per-unit fraction and the total cap.
 */
export const SIMULATION_CONFIG = {
    // Estimated number of explosion particles produced per launched firework.
    // (A real recipe explodes into a few hundred; this is the average that
    // actually lingers long enough to be catchable.)
    avgParticlesPerFirework: 120,

    drone: {
        // Fraction of emitted particles a single active drone vacuums per second.
        // Tuned so a mid-size fleet (~25 drones) saturates near the cap — drones
        // are meant to reign minutes 10–15. A high per-drone fraction means even
        // a few hubs saturate quickly, giving a sharp reign spike right at unlock.
        catchFractionPerDrone: 0.2,
        // Hard cap on the combined fraction all drones can catch.
        maxCatchFractionTotal: 0.9,
    },

    crowd: {
        // How many crowd members each catapult keeps airborne (catching) at once.
        catchersPerCatapult: 4,
        // Fraction of emitted particles a single airborne catcher grabs per second.
        // Crowd-catching is the first emergent source (unlocks ~5 min) and should
        // leap to the top on unlock, then plateau (capped by catapult count) as
        // drones overtake it later.
        catchFractionPerCatcher: 0.1,
        // Hard cap on the combined fraction the crowd can catch.
        maxCatchFractionTotal: 0.6,
    },
};
