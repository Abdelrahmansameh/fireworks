const PARTICLE_TYPES = {
    DEFAULT: 0,
    FIREWORK_EXPLOSION: 1,
    TRAIL: 2,
    ROCKET_TRAIL: 3,
    UI_EFFECT: 4,
    RESOURCE_GENERATOR: 5,
};

const DRONE_CONFIG = {
    maxDrones: 20,
    collectionRadius: 100,       // world-units radius to scan for particles
    defaultLifetime: 10,         // seconds a drone lives before despawning
    sparklesPerParticle: 1,      // sparkles awarded per collected particle
    wanderSpeed: 220,            // world-units/sec target chase speed
    wanderTargetChangeTime: 3.0, // seconds between wander target changes
    pullForce: 2500,             // world-units/sec² acceleration toward drone
    arrivalThreshold: 10,        // world-units — particle "collected" within this dist
    maxCaptureTime: 1.2,         // seconds before a targeted particle is force-collected
    defaultScale: 14,            // render scale of the drone mesh
    glowStrength: 0.8,           // emissive glow intensity
    scanInterval: 4,             // scan for particles once every N frames (1 = every frame)
    color: { r: 0.4, g: 0.9, b: 1.0, a: 1.0 },  // default drone color (cyan-ish)
};

const FIREWORK_CONFIG = {
    maxParticles: 500000,
    baseSpeed: 800,
    baseFriction: 4.0,
    verticalFrictionMultiplier: .9,
    gravityMultiplier: 9,
    particleSize: 5.0,
    ascentSpeed: 500,
    rocketSize: 1.5,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    autoLauncherMeshWidth: 30,
    autoLauncherMeshHeight: 80,
    autoLauncherMeshColor: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
    autoLauncherTexture: 'assets/launcher.png',
    patternGravities: {
        default: 110,        
        helix: 80,
        willow: 60,
    },
    patternFriction: {
        spherical: 1.0,
        solidsphere: 1.5,
        ring: 2.0,
        heart: 2.0,
        star: 2.0,
        brocade: 2.0,
        burst: 1.0,
        palm: 5.0,
        willow: 2,
        christmasTree: 1.5,
        brokenHeart: 2.0,
        spinner: 0.0,
        helix: 0,
        default: 0.0
    },
    patternParticleCounts: {
        willow: 50,
        helix: 200,
        ring: 30,
        heart: 40,
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

const AUTO_LAUNCHER_COST_BASE = 10;
const AUTO_LAUNCHER_COST_RATIO = 1.2;
const AUTO_UPGRADE_COST_RATIO = 1.2;
const AUTO_SPAWN_INTERVAL_RATIO = 0.9;

const DEFAULT_RECIPE_COMPONENTS = [{
    pattern: 'spherical',
    color: '#4ba0d1',
    size: 0.3,
    lifetime: 3,
    shape: 'ring',
    spread: .7,
    secondaryColor: '#00ff00',
    glowStrength: 1.0,
    blurStrength: .7
}];

const GAME_BOUNDS = {
    LAUNCHER_MIN_X: 100,
    LAUNCHER_MAX_X: 4000,
    OFFSET_MIN_Y: 5,
    OFFSET_MAX_Y: -50,
    SCROLL_MIN_X: -1000,
    SCROLL_MAX_X: 4200,
    CROWD_RIGHT_X: -900,
    CROWD_LEFT_X: -100,
    CROWD_Y: -515,
    WORLD_GROUND_Y: -540,
    WORLD_MIN_EXPLOSION_Y: -105,
    WORLD_MAX_EXPLOSION_Y: 324,
    WORLD_LAUNCHER_Y: -535,
    IS_ZOOM_LOCKED: true,
    MAX_ZOOM: 5,
    MIN_ZOOM: 0.1
};

const GENERIC_RECIPE_NAMES = [
    'Boom', 'Starburst', 'Shooting Star', 'Rainbow Rocket',
    'Golden Shower', 'Silver Sparkle', 'Crimson Comet', 'Emerald',
    'Blaster', 'Pulse', 'Wonder', 'Pop',
    'Orb', 'Twinkle', 'Twink', 'Violet Vortex', 'Cyclone',
    'Yonder', 'Black Blast', 'Gay Glimmer', 'Brown Burst',
    'Nova', 'Pastel Paradise', 'Metallic Meteor', 'Glittering Galaxy',
    'Firefly Flicker', 'Twilight Twirl', 'Midnight Magic', 'Sunset Spark',
    'Dawn Dazzle', 'Aurora Arc', 'Starlight Stream',
    'Cosmic Cascade', 'Lunar Light', 'Solar Flare', 'Meteor Shower',
    'Comet Tail', 'Nebula Night', 'Galaxy Glow', 'Celestial Sphere',
    'Radiant Rain', 'Starlight Spark', 'Twinkling Tides', 'Eclipse Echo',
    'Phantom Flash', 'Mystic Mist', 'Enchanted Ember', 'Dreamy Drift',
    'Whimsical Whirl', 'Frosty Flicker', 'Iridescent Illusion', 'Sparkling Spectrum',
    'Electric Eruption', 'Crystal Cascade', 'Aurora Borealis', 'Stellar Storm',
    'Celestial Comet', 'Galactic Glow', 'Nebula Nova', 'Luminous Lagoon',
    'Radiant Ripple', 'Twilight Tangle', 'Midnight Mirage', 'Sunrise Sparkle',
    'Dusk Dazzle', 'Aurora Aura', 'Starlit Symphony', 'Wedding Beige', 'Quebec',
    'Wedding'
];

const BACKGROUND_IMAGES = [
    { name: 'Black Forest', path: 'assets/black-forest.png' },
    { name: 'Blank', path: 'assets/background.png' },
    { name: 'Black Town', path: 'assets/mountain-town.png' },
    { name: 'Black City', path: 'assets/black-city.png' },
    { name: 'Black Mountains', path: 'assets/black-mountains.png', skyPath: 'assets/black-mountains-sky.png' },
    { name: 'Black Ruins', path: 'assets/black-ruins.png' },
    { name: 'Forest', path: 'assets/darkened_forest.png' },
    { name: 'Town', path: 'assets/darkened_town.png' },
    { name: 'City', path: 'assets/darkened_city.png' },
    { name: 'Mountain', path: 'assets/mountains-loop.png' },
    { name: 'Ruins', path: 'assets/ruins.png' },
];

const COMPONENT_PROPERTY_RANGES = {
    size: { min: 0.1, max: 0.7, step: 0.05 },
    lifetime: { min: 1.5, max: 4, step: 0.1 },
    spread: { min: 0.4, max: 1, step: 0.1 },
    glowStrength: { min: 0, max: 1.25, step: 0.05 },
    blurStrength: { min: 0.2, max: 1, step: 0.05 },
};

const BUILDING_TYPES = {
    AUTO_LAUNCHER: {
        id: 'auto_launcher',
        name: 'Auto Launcher',
        description: 'Automatically launches fireworks',
        baseCost: 10,
        costRatio: 1.2,
        currency: 'sparkles',
        width: 25,
        height: 40,
        color: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
        texture: 'assets/launcher.png',
        textureKey: 'auto_launcher_texture',
        baseUpgradeCost: 15,
        upgradeCostRatio: 1.2,
        baseSpawnInterval: 5,
        spawnIntervalRatio: 0.9,
    },
    RESOURCE_GENERATOR: {
        id: 'resource_generator',
        name: 'Sparkle Generator',
        description: 'Passively generates sparkles over time',
        baseCost: 50,
        costRatio: 1.3,
        currency: 'gold',
        width: 25,
        height: 30,
        color: { r: 1, g: 0.84, b: 0, a: 1 },
        texture: null,
        textureKey: null,
        baseUpgradeCost: 25,
        upgradeCostRatio: 1.25,
        baseProductionRate: 0.5,
        productionRateRatio: 1.5,
        resourceType: 'sparkles',
    },
    EFFICIENCY_BOOSTER: {
        id: 'efficiency_booster',
        name: 'Efficiency Booster',
        description: 'Boosts production of nearby buildings',
        baseCost: 100,
        costRatio: 1.5,
        currency: 'gold',
        width: 50,
        height: 70,
        color: { r: 0.5, g: 0.2, b: 0.9, a: 1 },
        texture: null,
        textureKey: null,
        baseUpgradeCost: 50,
        upgradeCostRatio: 1.3,
        baseUpgradeCost: 50,
        upgradeCostRatio: 1.3,
        baseRadius: 200,
        radiusRatio: 1.1,
        baseMultiplier: 1.1,
        multiplierRatio: 1.05,
    }
};

export { FIREWORK_CONFIG, GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, BACKGROUND_IMAGES, AUTO_LAUNCHER_COST_BASE, AUTO_LAUNCHER_COST_RATIO, AUTO_UPGRADE_COST_RATIO, AUTO_SPAWN_INTERVAL_RATIO, COMPONENT_PROPERTY_RANGES, BUILDING_TYPES, PARTICLE_TYPES, DRONE_CONFIG };

