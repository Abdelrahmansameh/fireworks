export const CROWD_CONFIG = {
    // Scaling
    scaling: {
        formula: 'power_fireworks',
        formulaA: 0.35,
        formulaExp: 0.4,
        formulaOffset: 200,
        formulaB: 0,
        minSize: 0.9,
        maxSize: 1.25,
        seed: 12345,
    },

    // Sprite geometry
    spriteWidth: 30,
    spriteHeight: 30,
    fallbackRadius: 10,
    fallbackSegments: 8,

    // Instanced-group limits
    // We max out at 15000 instances to accommodate ~1000 people * 11 shapes per person
    maxInstances: 15000,
    zIndex: 100,

    // Spawn / positioning
    minOverlapDistance: 50,          // world-units — min spacing between people
    maxPlacementAttempts: 10,
    ySpread: 70,                    // random Y offset below CROWD_Y
    baseScale: 8,
    scaleVariance: 0.4,             // scale = baseScale + random * scaleVariance
    spawnBias: 2,                   // >1 biases spawn positions toward the rightmost side

    // Physics
    gravity: 2200,                  // world-units / s²
    friction: 1.0,                  // air-resistance damping factor (v *= e^(-friction*dt))
    walkSpeed: 600,                 // world-units / s
    landingSnapDistance: 5,         // close-enough to resume cheering after fall
    walkArrivalDistance: 3,         // close-enough to stop walking

    // Grab / throw interaction
    pickRadius: 60,                 // world-units — max cursor-to-person dist for grab (slightly increased)
    cursorHistorySize: 6,           // samples kept for launch-velocity estimation
    minDtForVelocity: 0.005,       // seconds — ignore tiny dt to avoid div-by-zero
    maxThrowSpeedSquared: 2500 * 2500, // world-units²/s² — cap launch speed to prevent extreme throws
    wallBounce: 0.5,                // velocity retention when bouncing off world edges
    wallBounceBuffer: 500,          // world-units — invisible buffer beyond scroll bounds for wall bounces

    // Ground bouncing
    groundBounceCount: 3,           // number of bounces before the person lands on the next ground contact
    groundBounceDamping: 0.45,      // fraction of vertical speed retained on each ground bounce
};

export const CROWD_CATCHER_CONFIG = {
    collectionRadius: 60,     // world-units scan radius (slightly wider than drone's 50)
    pullForce: 7000,          // wu/s² — acceleration toward person
    arrivalThreshold: 10,     // wu — particle collected when closer than this
    maxCaptureTime: 5.5,      // s — force-collect after this long
    minParticleAge: 0.3,      // s — ignore freshly-spawned particles
    sparklesPerParticle: 1,   // base sparkle reward per collected particle
    scanInterval: 4,          // throttle: scan every N frames
};
