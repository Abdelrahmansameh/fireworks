// Game Configuration Constants

const FIREWORK_CONFIG = {
    maxParticles: 500000,
    trailMaxPoints: 5,
    trailDistBetweenPoints: 5,
    trailWidth: 2.0,
    baseSpeed: 150,
    baseFriction: 2.0,
    verticalFrictionMultiplier: .9,
    gravityMultiplier: 15,
    particleSize: 5.0,
    particleDensity: 100,
    ascentSpeed: 400,
    rocketTrailLength: 30,
    rocketSize: 0.6,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    patternGravities: {
        spherical: 9.81,
        ring: 8.0,
        heart: 6.0,
        star: 7.0,
        burst: 9.81,
        palm: 5.0,
        willow: 0.5,
        helix: 3.0,
        brokenHeart: 6.0,
        christmasTree: 7.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const GAME_BOUNDS = {
    LAUNCHER_MIN_X: -400,
    LAUNCHER_MAX_X: 1200,
    OFFSET_MIN_Y: 5,
    OFFSET_MAX_Y: -50,
    SCROLL_MIN_X: -100,
    SCROLL_MAX_X: 1400,
    CROWD_RIGHT_X: -10,
    CROWD_LEFT_X: -60
};

export { FIREWORK_CONFIG, GAME_BOUNDS };
