export const CROWD_CONFIG = {
    // Scaling
    scaling: {
        formulaA: 2.0,
        formulaB: 0.0,
        seed: 12345
    },

    // Sprite geometry
    spriteWidth: 30,
    spriteHeight: 30,
    fallbackRadius: 10,
    fallbackSegments: 8,

    // Instanced-group limits
    // We max out at 15000 instances to accommodate ~1000 people * 11 shapes per person
    maxInstances: 15000,
    zIndex: -10,

    // Procedural geometry shape sizes (relative to base person scale of 1.0)
    procedural: {
        bodyWidth: 10,
        bodyHeight: 10,
        armWidth: 2.5,
        armHeight: 6,
        legWidth: 3,
        legHeight: 6,
        footWidth: 4,
        footHeight: 2,
        eyeSize: 2.5,
        pupilSize: 1.0,

        // offsets from center (0,0 is center of the body)
        armOffsetY: 2.5,     // upper part of body
        armOffsetX: 5,       // right at the edge of the 10-wide body
        legOffsetY: -5,      // exactly at the bottom edge of the 10-tall body
        legOffsetX: 2,
        footOffsetY: -1,     // center of foot is bottom of leg (-footHeight / 2)
        footOffsetX: 0.5,
        eyeOffsetY: 1.5,     // upper half of the body
        eyeOffsetX: 2.5,     // spread horizontally
    },

    // Spawn / positioning
    minOverlapDistance: 10,          // world-units — min spacing between people
    maxPlacementAttempts: 20,
    ySpread: 100,                    // random Y offset below CROWD_Y
    baseScale: 2,
    scaleVariance: 0.4,             // scale = baseScale + random * scaleVariance

    // Physics
    gravity: 2200,                  // world-units / s²
    friction: 1.0,                  // air-resistance damping factor (v *= e^(-friction*dt))
    walkSpeed: 600,                 // world-units / s
    landingSnapDistance: 5,         // close-enough to resume cheering after fall
    walkArrivalDistance: 3,         // close-enough to stop walking

    // Grab / throw interaction
    pickRadius: 35,                 // world-units — max cursor-to-person dist for grab
    cursorHistorySize: 6,           // samples kept for launch-velocity estimation
    minDtForVelocity: 0.005,       // seconds — ignore tiny dt to avoid div-by-zero
    maxThrowSpeedX: 1800,            // world-units / s
    maxThrowSpeedY: 1800,            // world-units / s
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
