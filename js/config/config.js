// Game Configuration Constants

const FIREWORK_CONFIG = {
    baseSpeed: 10,
    gravity: 9.81,
    particleSize: 1.0,
    particleDensity: 100,
    ascentSpeed: 40,
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
        willow: 1.0,
        helix: 3.0,
        brokenHeart: 6.0,
        christmasTree: 7.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const GAME_BOUNDS = {
    // Auto launcher bounds 
    LAUNCHER_MIN_X: 0,
    LAUNCHER_MAX_X: 120,
    MIN_Y: -50,
    MAX_Y: 50,
    // Extended bounds for scrolling 
    SCROLL_MIN_X: -100,
    SCROLL_MAX_X: 200,
    // Crowd area bounds
    CROWD_RIGHT_X: -10,
    CROWD_LEFT_X: -60
};

export { FIREWORK_CONFIG, GAME_BOUNDS };
