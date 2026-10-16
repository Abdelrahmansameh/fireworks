export const DEFAULT_RECIPE_COMPONENTS = [{
    pattern: 'spherical',
    color: '#ddbb4a',
    size: 0.3,
    lifetime: 3,
    shape: 'ring',
    spread: .7,
    secondaryColor: '#00ff00',
}];

export const GENERIC_RECIPE_NAMES = [
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

// Each pattern has one editable starter recipe, awarded once when it is bought.
// Preserve the established visual presets where a pattern already had one.
const preset = (pattern, color, secondaryColor, size, lifetime, shape, spread) => [{
    pattern, color, secondaryColor, size, lifetime, shape, spread,
}];
export const PATTERN_RECIPE_COMPONENTS = {
    spherical: DEFAULT_RECIPE_COMPONENTS.map(component => ({ ...component })),
    burst: preset('burst', '#D6AA6A', '#F4A6A6', 0.35, 3, 'sphere', 0.9),
    palm: preset('palm', '#f14343', '#F6E4C9', 0.4, 3.5, 'ring', 0.7),
    star: preset('star', '#B71C28', '#EBD7FF', 0.3, 3.1, 'star', 0.9),
    willow: preset('willow', '#E86F5A', '#FFD8C7', 0.33, 3, 'star', 0.8),
    ring: preset('ring', '#e77f29', '#CFEFDE', 0.28, 2.8, 'sphere', 0.85),
    solidsphere: preset('solidsphere', '#BDEEFF', '#4AAFD6', 0.27, 2.9, 'sphere', 0.7),
    brocade: preset('brocade', '#EFB158', '#FFD79A', 0.36, 3.3, 'sphere', 0.95),
    heart: preset('heart', '#1ed9fa', '#BDEEE0', 0.34, 3.4, 'star', 0.9),
    pistil: preset('pistil', '#ffd04a', '#ff7a59', 0.3, 3.2, 'sphere', 0.8),
    saturn: preset('saturn', '#B59CEB', '#BEE8FF', 0.3, 3.2, 'sphere', 0.8),
    brokenHeart: preset('brokenHeart', '#E57FBF', '#FFD6F0', 0.3, 3, 'star', 0.8),
    christmasTree: preset('christmasTree', '#66BB6A', '#ffd04a', 0.3, 3.5, 'sphere', 0.8),
    spinner: preset('spinner', '#C04DAA', '#F2C1E8', 0.32, 3.1, 'star', 0.85),
    helix: preset('helix', '#B59CEB', '#BEE8FF', 0.3, 3.2, 'sphere', 0.8),
    snowflake: preset('snowflake', '#BDEEFF', '#FFFFFF', 0.3, 3.5, 'star', 0.8),
    dragonsBreath: preset('dragonsBreath', '#e07638', '#FFD79A', 0.35, 3.5, 'sphere', 0.9),
};
export const COMPONENT_PROPERTY_RANGES = {
    size: { min: 0.1, max: 0.7, step: 0.05 },
    lifetime: { min: 1.5, max: 4, step: 0.1 },
    spread: { min: 0.4, max: 1, step: 0.1 },
};
