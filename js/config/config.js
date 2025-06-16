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
    ascentSpeed: 350,
    rocketTrailLength: 60,
    rocketSize: .5,
    rocketTrailSize: 1.2,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    autoLauncherMeshWidth: 30,
    autoLauncherMeshHeight: 50,
    autoLauncherMeshColor: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
    patternGravities: {
        spherical: 9.81,
        solidsphere: 20,
        ring: 8.0,
        heart: 1,
        star: 10,
        brocade: 10,
        burst: 9.81,
        palm: 5.0,
        willow: 0.2,
        christmasTree: 0.4,
        brokenHeart: 2,
        spinner: 2,
        spinningtails: 0.3,
        default: 0.7
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const DEFAULT_RECIPE_COMPONENTS = [{
    pattern: 'spherical',
    color: '#d07916',
    size: 0.5,
    lifetime: 3.7,
    shape: 'sphere',
    spread: 1.5,
    secondaryColor: '#00ff00',
    enableTrail: true,
    trailLength: 11,
    trailWidth: 2.6,}];

const GAME_BOUNDS = {
    LAUNCHER_MIN_X: 100,
    LAUNCHER_MAX_X: 4000,
    OFFSET_MIN_Y: 5,
    OFFSET_MAX_Y: -50,
    SCROLL_MIN_X: -1000,
    SCROLL_MAX_X: 4200,
    CROWD_RIGHT_X: -900,
    CROWD_LEFT_X: -100,
    CROWD_Y: -510
};

export { FIREWORK_CONFIG, GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS };
