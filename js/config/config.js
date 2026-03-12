const PARTICLE_TYPES = {
    DEFAULT: 0,
    FIREWORK_EXPLOSION: 1,
    TRAIL: 2,
    ROCKET_TRAIL: 3,
    UI_EFFECT: 4,
    RESOURCE_GENERATOR: 5,
};

const DRONE_CONFIG = {
    maxDrones: 200,
    collectionRadius: 50,       // world-units radius to scan for particles
    defaultLifetime: 10,         // seconds a drone lives before despawning
    sparklesPerParticle: 1,      // sparkles awarded per collected particle
    wanderSpeed: 300,            // world-units/sec target chase speed
    acceleration: 100,           // wu/s² ramp-up from standstill
    deceleration: 200,           // wu/s² braking when a sharp turn is detected
    turnThresholdDot: 0.75,      // dot(currentHeading, desiredDir) below this triggers braking (~70°)
    minTurnSpeed: 10,            // wu/s — floor drone slows to before turning hard
    steerRateHigh: 5.0,          // exponential steer constant at full speed (sluggish)
    steerRateLow: 2,          // exponential steer constant near-zero speed (nimble)
    visualTurnSpeed: 4.5,        // rad/s max rate for visual rotation to chase velocity angle
    wanderTargetChangeTime: 4.0, // seconds between wander target changes
    spawnLaunchAngleDeg: 30,     // degrees from vertical for initial hub-spawn launch direction
    pullForce: 9000,             // world-units/sec² acceleration toward drone
    arrivalThreshold: 25,        // world-units — particle "collected" within this dist
    maxCaptureTime: 1.0,         // seconds before a targeted particle is force-collected
    defaultScale: 14,            // render scale of the drone mesh
    glowStrength: 0.8,           // emissive glow intensity
    scanInterval: 4,             // scan for particles once every N frames (1 = every frame)
    minParticleAge: 0.3,          // seconds a particle must have been alive before a drone can pull it
    color: { r: 0.4, g: 0.9, b: 1.0, a: 1.0 },  // default drone color (cyan-ish)

    oscillationAmplitude: 1100,    // wu/s — perpendicular speed added by the sine wave
    oscillationFrequency: 1.5,    // Hz — cycles per second of the side-to-side wave

    droneTrails: {
        enabled: true,
        spawnRate: 0.03,        
        perBurst: 3,            
        lifetime: 0.15,         
        size: 3.0,              
        speed: 0,            
        coneAngle: 130,          
        gravity: -800,           
        friction: 4,           
        alphaMultiplier: 1,   
        shape: 'sphere',
        scale: 1.0,
        color: { r: .3, g: 0.3, b: 0.9, a: 1.0 } // orange
    },
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

const AUTO_LAUNCHER_COST_BASE = 10;
const AUTO_LAUNCHER_COST_RATIO = 1.2;
const AUTO_UPGRADE_COST_RATIO = 1.2;
const AUTO_SPAWN_INTERVAL_RATIO = 0.9;

// How long (seconds) the world-side colour-pulse highlight lasts when a
// launcher card is clicked from the buildings menu.
const LAUNCHER_WORLD_HIGHLIGHT_DURATION = 2.5;

// Fixed component properties used by AutoLaunchers before the recipes tab is unlocked.
// colorOverride and patternOverride are NOT affected by these defaults.
const PRE_RECIPE_COMPONENT_DEFAULTS = {
    size: 0.3,
    lifetime: 3,
    spread: .8,
    glowStrength: 1.0,
    blurStrength: 0.7,
    shape: 'ring',
    secondaryColor: '#00ff00',
};

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

const PROCEDURAL_BACKGROUND_CONFIG = {
    seed: 343597,
    bodyBackgroundColor: '#05070d',
    world: {
        xMin: GAME_BOUNDS.SCROLL_MIN_X - 1500,
        xMax: GAME_BOUNDS.SCROLL_MAX_X + 500,
        groundY: GAME_BOUNDS.WORLD_GROUND_Y,
        skyTopY: 760,
        groundDepth: 420,
        horizonY: GAME_BOUNDS.WORLD_GROUND_Y + 160,
    },
    zIndex: {
        sky: -2000,
        stars: -1995,
        treesFar: -1990,
        treesMid: -1985,
        treesNear: -1980,
        ground: -1970,
        groundRim: -1969,
    },
    sky: {
        gradientBands: 28,
        topColor: { r: 10 / 255, g: 18 / 255, b: 34 / 255, a: 1 },
        midColor: { r: 11 / 255, g: 16 / 255, b: 28 / 255, a: 1 },
        bottomColor: { r: 20 / 255, g: 20 / 255, b: 22 / 255, a: 1 },
        midStop: 0.58,
    },
    stars: {
        count: 400,
        distributionJitter: 10,
        minSize: 3,
        maxSize: 5,
        minAlpha: 0.2,
        maxAlpha: 0.82,
        minBrightness: .8,
        maxBrightness: 1,
        minYFromHorizon: 300,
        maxYFromSkyTop: 50,
        twinkleEnabled: true,
        twinkleMinSpeed: 0.35,
        twinkleMaxSpeed: 3.6,
        twinkleMinAmount: 0,
        twinkleMaxAmount: 2,
        twinkleAlphaInfluence: 1,
    },
    trees: {
        layers: [
            {
                treeCount: 200,
                baseY: GAME_BOUNDS.WORLD_GROUND_Y + 100,
                distributionJitter: 30,
                baseYJitter: 0,
                widthMin: 50,
                widthMax: 80,
                heightMin: 78,
                heightMax: 136,
                tierCountMin: 4,
                tierCountMax: 6,
                trunkHeightRatioMin: 0.1,
                trunkHeightRatioMax: 0.2,
                trunkWidthRatioMin: 0.12,
                trunkWidthRatioMax: 0.2,
                tierInnerRatioMin: 0.8,
                tierInnerRatioMax: 0.8,
                tierHeightJitterRatio: 0,
                tierWidthJitterRatio: 0,
                edgeJitter: 0,
                tipLeanRatioMin: 0,
                tipLeanRatioMax: 0,
                widthCurvePowerMin:1,
                widthCurvePowerMax: 1,
                color: { r: 7 / 255, g: 9 / 255, b: 12 / 255, a: 1 },
            }
        ],
    },
    ground: {
        color: { r: 10 / 255, g: 12 / 255, b: 18 / 255, a: 1 },
        rimColor: { r: 28 / 255, g: 30 / 255, b: 36 / 255, a: 1 },
        rimHeight: 100,
    },
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
    },
    DRONE_HUB: {
        id: 'drone_hub',
        name: 'Drone Hub',
        description: 'Periodically launches drones that collect firework particles',
        baseCost: 75,
        costRatio: 1.4,
        currency: 'gold',
        width: 40,
        height: 50,
        color: { r: 0.2, g: 0.7, b: 1.0, a: 1 },
        texture: null,
        textureKey: null,
        baseUpgradeCost: 40,
        upgradeCostRatio: 1.3,
        // Spawn interval (seconds) between drone launches
        baseSpawnInterval: 12,
        spawnIntervalRatio: 0.88,   // multiplied each level (shrinks interval)
        // Drone base stats (global upgrades apply multipliers on top of these)
        baseDroneLifetime: 10,
        baseDroneSpeed: 600,
        droneScale: 16,
        droneColor: { r:0.1, g: 0.65, b: 0.8, a: 1.0 }, 
    }
};

const CROWD_CONFIG = {
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
    maxInstances: 1000,
    zIndex: -10,

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

const CROWD_CATCHER_CONFIG = {
    collectionRadius: 60,     // world-units scan radius (slightly wider than drone's 50)
    pullForce: 7000,          // wu/s² — acceleration toward person
    arrivalThreshold: 10,     // wu — particle collected when closer than this
    maxCaptureTime: 5.5,      // s — force-collect after this long
    minParticleAge: 0.3,      // s — ignore freshly-spawned particles
    sparklesPerParticle: 1,   // base sparkle reward per collected particle
    scanInterval: 4,          // throttle: scan every N frames
};

/**
 * Stats / telemetry configuration.
 */
const STATS_CONFIG = {
    /**
     * Duration (in seconds) of the rolling-average window used for all
     * per-second rates in the stats tab (sparkles/s, gold/s, fireworks/s).
     */
    rollingWindowSeconds: 5,
};

export { FIREWORK_CONFIG, GAME_BOUNDS, PROCEDURAL_BACKGROUND_CONFIG, DEFAULT_RECIPE_COMPONENTS, PRE_RECIPE_COMPONENT_DEFAULTS, GENERIC_RECIPE_NAMES, AUTO_LAUNCHER_COST_BASE, AUTO_LAUNCHER_COST_RATIO, AUTO_UPGRADE_COST_RATIO, AUTO_SPAWN_INTERVAL_RATIO, LAUNCHER_WORLD_HIGHLIGHT_DURATION, COMPONENT_PROPERTY_RANGES, BUILDING_TYPES, PARTICLE_TYPES, DRONE_CONFIG, CROWD_CONFIG, CROWD_CATCHER_CONFIG, STATS_CONFIG };

