export const FIREWORK_CONFIG = {
    maxParticles: 500000,
    baseSpeed: 800,
    baseFriction: 4.0,
    verticalFrictionMultiplier: .9,
    gravityMultiplier: 9,
    particleSize: 5.0,
    ascentSpeed: 570,
    rocketSize: 1.5,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    autoLauncherMeshWidth: 30,
    autoLauncherMeshHeight: 80,
    autoLauncherMeshColor: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
    autoLauncherTexture: 'assets/launcher.png',
    patternGravities: {
        default: 110,
        helix: 40,
        willow: 30,
        dragonsBreath: 70,
    },
    patternFriction: {
        spherical: 1.0,
        solidsphere: 1.5,
        burst: 1.0,
        palm: 5.0,
        christmasTree: 1.5,
        snowflake: 1.6,
        spinner: 1.0,
        helix: 0,
        dragonsBreath: 2.8,
        default: 2.0
    },
    patternParticleCounts: {
        willow: 50,
        helix: 200,
        ring: 30,
        heart: 40,
        snowflake: 200,
        dragonsBreath: 140,
        default: 100
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst', 'triangle'],

    trails: {
        enabled: true,
        spawnRate: 0.025,           // seconds between trail spawns
        lifetime: 1,             // trail particle lifetime
        size: 1.5,                 // size multiplier (relative to parent)
        gravity: 0,              // gravity for trail particles
        friction: 1,             // air resistance
        maxCount: 100,              // max trails per particle
        alphaMultiplier: .8,      // transparency of trails
        shape: 'sphere',           // shape for trail particles
        velocitySpread: 15       // random velocity spread (pixels/sec)
    },

    rocketTrails: {
        enabled: true,
        spawnRate: 0.015,           // seconds between trail spawns
        lifetime: 0.5,              // trail particle lifetime
        size: 1.2,                  // absolute size of trail particles
        gravity: 0,               // slight upward drift
        friction: 2,              // air resistance
        alphaMultiplier: 0.7,       // transparency of trails
        shape: 'sphere',            // shape for trail particles
        velocitySpread: 25,         // random velocity spread (pixels/sec)
        perBurst: 5               // trails to spawn per burst
    }
};
