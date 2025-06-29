// Game Configuration Constants

const FIREWORK_CONFIG = {
    maxParticles: 500000,
    trailMaxPoints: 20,
    trailDistBetweenPoints: 5,
    trailWidth: 2.0,
    baseSpeed: 150,
    baseFriction: 1.0,
    verticalFrictionMultiplier: .9,
    gravityMultiplier: 5,
    particleSize: 5.0,
    particleDensity: 100,
    ascentSpeed: 350,
    rocketTrailLength: 30,
    rocketSize: .5,
    rocketTrailSize: 1.2,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    autoLauncherMeshWidth: 30,
    autoLauncherMeshHeight: 80,
    autoLauncherMeshColor: { r: 136 / 255, g: 136 / 255, b: 136 / 255, a: 1 },
    autoLauncherTexture: 'assets/launcher.png',
    patternGravities: {
        spherical: 9.81,
        solidsphere: 30,
        ring: 8.0,
        heart: 50.0,
        star: 13,
        brocade: 10,
        burst: 15,
        palm: 25.0,
        willow: 30,
        christmasTree: 20.4,
        brokenHeart: 2,
        spinner: 2,
        spinningtails: 0.3,
        helix: 0.3,
        default: 0.7
    },
    patternFriction: {
        spherical: 1.0,
        solidsphere: 2,
        ring: 2.0,
        heart: 2.0,
        star: 2.0,
        brocade: 2.0,
        burst: 2.0,
        palm: 3.0,
        willow: -1.3,
        christmasTree: 1.5,
        brokenHeart: 2.0,
        spinner: 0.0,
        spinningtails: 0.0,
        helix: 0.0,
        default: 0.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const DEFAULT_RECIPE_COMPONENTS = [{
    pattern: 'spherical',
    color: '#f5d0a6',
    size: 0.5,
    lifetime: 3.7,
    shape: 'sphere',
    spread: 1.5,
    secondaryColor: '#00ff00',
    enableTrail: true,
    trailLength: 11,
    trailWidth: 2.6,
    glowStrength: 1.0,
    blurStrength: .5
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
    CROWD_Y: -515
};

const GENERIC_RECIPE_NAMES = [
    'Boom','Starburst', 'Shooting Star', 'Rainbow Rocket',
    'Golden Shower', 'Silver Sparkle', 'Crimson Comet', 'Emerald',
    'Blaster', 'Pulse', 'Wonder', 'Pop',
    'Orb', 'Twinkle', 'Twink','Violet Vortex', 'Cyclone',
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
    {name: 'Black Forest', path: 'assets/black-forest.png' },
    {name: 'Default', path: 'assets/background.png' },
    {name: 'Black Town', path: 'assets/black-town.png' },
    {name: 'Black City', path: 'assets/black-city.png' },
    {name: 'Black Mountains', path: 'assets/black-mountains.png' },
    {name: 'Black Ruins', path: 'assets/black-ruins.png' },
    {name: 'Forest', path: 'assets/darkened_forest.png'},
    {name: 'Town', path: 'assets/darkened_town.png'},
    {name: 'City', path: 'assets/darkened_city.png'},
    /*{name: 'Forest', path: 'assets/forest.png' },
    {name: 'Town', path: 'assets/town.png' },
    {name: 'City', path: 'assets/city.png' },*/
    {name: 'Mountain', path: 'assets/mountains-loop.png' },
    {name: 'Ruins', path: 'assets/ruins.png' },
];

export { FIREWORK_CONFIG, GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, BACKGROUND_IMAGES };

