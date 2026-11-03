// Settings for flyers: cultists who propel themselves by firing sparkles out
// of their hands, and the sparkles they collect.
export const FLYER_CONFIG = {
    collectionRadius: 50,
    sparklesPerParticle: 15,
    wanderSpeed: 300,            // max flight speed, scaled by the speed upgrade
    wanderTargetChangeTime: 4.0,
    entryMargin: 60,             // new fans start this far past the left screen edge
    // Flyers share the firework band up to the venue's current burst ceiling,
    // where their palms cut out. Each takes its own slice of that height.
    entryHeight: [0.35, 0.75],   // share of the firework band they fly in at
    pullForce: 9000,
    arrivalThreshold: 5,
    maxCaptureTime: 1.0,
    scanInterval: 4,
    minParticleAge: 0.3,

    // Flight physics. Gravity always pulls; a pulse pushes along the arms'
    // reverse, then the fan free-falls until the next one.
    gravity: 380,
    drag: 0.35,                  // per second, so coasting slowly bleeds speed
    thrust: 1250,                // acceleration while a pulse is on, scaled with the speed upgrade
    approachGain: 0.7,           // desired velocity per unit of distance to the target
    steerGain: 2.2,              // how hard a pulse corrects toward the desired velocity
    pulseTrigger: 110,           // velocity error that starts a new pulse (going down never does)
    descendMargin: 80,           // this far above the target they hold their pulses and drop
    minAimBelowHorizontal: 0.25, // radians: palms always fire at least this far below level
    aimTime: 0.1,                // arms snap to the aim before the pulse fires
    aimTolerance: 0.3,           // radians: arms must be this close to the aim to fire
    maxAimTime: 0.3,             // fire anyway if the aim keeps moving this long past aimTime
    pulseDuration: [0.28, 0.5],
    minCoast: 0.12,
    armTurnRate: 16,             // radians per second while aiming or firing
    armRelaxRate: 5,             // radians per second when coasting
    lookFullSpeed: 120,          // speed at which the pupils reach the edge of the eye
    lookRate: 8,                 // how quickly the pupils follow a change of direction
    glowColor: [1, 0.88, 0.5],   // eye tint while pulsing, matching the cultist ritual climax
    glowEyeScale: 1.2,           // eyes widen a little while glowing
    glowInRate: 20,
    glowOutRate: 6,

    // Sparkles out of both palms while a pulse is on.
    sparkRate: 440,              // per second, both hands together
    sparkSpeed: [160, 300],
    sparkSpread: 0.6,            // radians either side of the arm
    sparkLifetime: [0.07, 0.16],
    sparkSize: [0.8, 1.4],
    sparkGravity: 200,
    flashCount: 28,             // extra burst the moment a pulse fires
    sparkColors: [[1, 0.86, 0.38], [1, 0.97, 0.82], [1, 0.72, 0.3], [0.86, 0.55, 1], [0.55, 0.9, 1]],
};
