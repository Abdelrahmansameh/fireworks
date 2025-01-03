// Game Configuration Constants

const FIREWORK_CONFIG = {
    baseSpeed: 50,
    baseFriction: 0.9,
    gravityMultiplier: 1.5,
    particleSize: 1.0,
    particleDensity: 100,
    ascentSpeed: 60,
    trailLength: 10,
    rocketSize: 0.25,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    patternGravities: {
        spherical: 9.81,
        ring: 8.0,
        heart: 6.0,
        star: 7.0,
        burst: 9.81,
        palm: 5.0,
        willow: 5.0,
        helix: 3.0,
        brokenHeart: 6.0,
        christmasTree: 7.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const GAME_BOUNDS = {
    LAUNCHER_MIN_X: 0,
    LAUNCHER_MAX_X: 120,
    MIN_Y: -50,
    MAX_Y: 50,
    SCROLL_MIN_X: -100,
    SCROLL_MAX_X: 200,
    CROWD_RIGHT_X: -10,
    CROWD_LEFT_X: -60
};

export { FIREWORK_CONFIG, GAME_BOUNDS };
