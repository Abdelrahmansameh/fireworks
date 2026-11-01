// Settings for permanent jetpack fans and their sparkle collection.
export const JETPACK_CONFIG = {
    collectionRadius: 50,
    sparklesPerParticle: 1,
    wanderSpeed: 300,
    wanderTargetChangeTime: 4.0,
    entryMargin: 60,             // new fans start this far past the left screen edge
    entryHeight: [0.35, 0.75],   // share of the firework band they fly in at
    maxHeight: 1000,             // highest flight above the ground, capped by the widest view
    ceilingMargin: 60,           // keep fans this far below the top of that view
    pullForce: 9000,
    arrivalThreshold: 5,
    maxCaptureTime: 1.0,
    scanInterval: 4,
    minParticleAge: 0.3,
};
