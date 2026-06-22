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
        // Fraction of emitted particles a single active (airborne) drone vacuums
        // per second. With the intermittent 30s/60s hubs a realistic late fleet is
        // only a handful of simultaneously-airborne drones, so this is tuned so
        // income scales roughly linearly with that fleet (each hub you add is felt)
        // rather than slamming into the cap after the first couple of drones.
        catchFractionPerDrone: 0.11,
        // Hard cap on the combined fraction all drones can catch.
        maxCatchFractionTotal: 0.6,
    },

    crowd: {
        // How many crowd members each catapult keeps airborne (catching) at once.
        catchersPerCatapult: 4,
        // Fraction of emitted particles a single airborne catcher grabs per second.
        // Crowd-catching is the FIRST emergent source (unlocks ~9 min). The per-
        // catcher fraction is deliberately small so the source RAMPS IN gently as
        // the catapult fleet grows (1 catapult ≈ 12% of the sky, a full 4-catapult
        // fleet ≈ the cap) instead of leaping to dominate the instant the first
        // catapult lands. This removes the old onset cliff while preserving the
        // late-game plateau.
        catchFractionPerCatcher: 0.03,
        // Hard cap on the combined fraction the crowd can catch.
        maxCatchFractionTotal: 0.45,
    },
};
