export const DRONE_CONFIG = {
    // Soft cap on simultaneously-airborne drones. Kept deliberately low: with the
    // 30s-life / 60s-cycle hubs, a fresh hub averages ~0.5 drones and a maxed one
    // ~1, so a realistic late fleet is a handful of hubs → ~10-30 drones. The old
    // value (200) let the sky fill with a permanent swarm.
    maxDrones: 16,
    // Hard instance-buffer capacity for the drone system. Must be ≥ the largest
    // value maxDrones can reach via upgrades (base 16 + Drone Fleet 4×3 + Drone
    // Swarm Protocol 5×2 = 38). The GL buffer is sized to this so raising the soft
    // cap at runtime can never overflow it.
    maxDroneCapacity: 64,
    collectionRadius: 50,       // world-units radius to scan for particles
    defaultLifetime: 10,         // seconds a drone lives before despawning
    sparklesPerParticle: 3,      // sparkles awarded per collected particle (collectors are value-extractors)
    wanderSpeed: 300,            // world-units/sec target chase speed
    acceleration: 100,           // wu/s² ramp-up from standstill
    deceleration: 200,           // wu/s² braking when a sharp turn is detected
    turnThresholdDot: 0.75,      // dot(currentHeading, desiredDir) below this triggers braking (~70°)
    minTurnSpeed: 10,            // wu/s — floor drone slows to before turning hard
    steerRateHigh: 5.0,          // exponential steer constant at full speed (sluggish)
    steerRateLow: 2,          // exponential steer constant near-zero speed (nimble)
    visualTurnSpeed: 4.5,        // rad/s max rate for visual rotation to chase velocity angle
    wanderTargetChangeTime: 4.0, // seconds between wander target changes
    spawnLaunchAngleDeg: 30,     // degrees from vertical for initial hub-spawn launch direction
    pullForce: 9000,             // world-units/sec² acceleration toward drone
    arrivalThreshold: 25,        // world-units — particle "collected" within this dist
    maxCaptureTime: 1.0,         // seconds before a targeted particle is force-collected
    defaultScale: 20,            // render scale of the drone mesh (fallback / legacy)
    // Skeleton render scale, mirroring CROWD_CONFIG: each drone's scale is
    // baseScale + random·scaleVariance. Tune baseScale to resize the whole
    // drone skeleton; scaleVariance adds per-drone size variety (0 = uniform).
    scaling: {
        baseScale: 20,
        scaleVariance: 0,
    },
    scanInterval: 4,             // scan for particles once every N frames (1 = every frame)
    minParticleAge: 0.3,          // seconds a particle must have been alive before a drone can pull it
    color: { r: 0.4, g: 0.9, b: 1.0, a: 1.0 },  // default drone color (cyan-ish)

    oscillationAmplitude: 1100,    // wu/s — perpendicular speed added by the sine wave
    oscillationFrequency: 1.5,    // Hz — cycles per second of the side-to-side wave

    droneTrails: {
        enabled: false,
        spawnRate: 0.03,
        perBurst: 3,
        lifetime: 0.1,
        size: 2.0,
        speed: 0,
        coneAngle: 130,
        gravity: -800,
        friction: 4,
        alphaMultiplier: 1,
        shape: 'sphere',
        scale: 1.0,
        color: { r: .3, g: 0.3, b: 0.9, a: 1.0 } // orange
    },
};
