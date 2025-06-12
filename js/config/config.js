// Game Configuration Constants

const FIREWORK_CONFIG = {
    maxParticles: 500000,
    trailMaxPoints: 10,
    trailDistBetweenPoints: 5,
    trailWidth: 2.0,
    baseSpeed: 150,
    baseFriction: 2.0,
    verticalFrictionMultiplier: .9,
    gravityMultiplier: 5,
    particleSize: 5.0,
    particleDensity: 100,
    ascentSpeed: 400,
    rocketTrailLength: 40,
    rocketSize: .7,
    rocketTrailSize: 1.5,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    autoLauncherMeshWidth: 30,
    autoLauncherMeshHeight: 50,
    autoLauncherMeshColor: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
    patternGravities: {
        spherical: 9.81,
        ring: 8.0,
        heart: 6.0,
        star: 7.0,
        burst: 9.81,
        palm: 5.0,
        willow: 7,
        helix: 3.0,
        brokenHeart: 6.0,
        christmasTree: 7.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const GAME_BOUNDS = {
    LAUNCHER_MIN_X: -100,
    LAUNCHER_MAX_X: 3000,
    LAUNCHER_Y_POSITION: 0, // Y position for the base of the launcher mesh
    OFFSET_MIN_Y: 5,
    OFFSET_MAX_Y: -50,
    SCROLL_MIN_X: -400,
    SCROLL_MAX_X: 3200,
    CROWD_RIGHT_X: -10,
    CROWD_LEFT_X: -60
};

export { FIREWORK_CONFIG, GAME_BOUNDS };
