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

export const PREDEFINED_RECIPES = [
    { name: 'Crimson Bloom', components: [ { pattern: 'burst', color: '#D6AA6A',  secondaryColor: '#F4A6A6', size: 0.35, lifetime: 3.0, shape: 'sphere', spread: 0.9 } ] },
    { name: 'Azure Burst', components: [ { pattern: 'burst', color: '#e07638', secondaryColor: '#BEE8FF', size: 0.32, lifetime: 3.2, shape: 'sphere', spread: 0.8 } ] },
    { name: 'Verdant Spark', components: [ { pattern: 'ring', color: '#e77f29', secondaryColor: '#CFEFDE', size: 0.28, lifetime: 2.8, shape: 'sphere', spread: 0.85 } ] },
    { name: 'Golden Ring', components: [ { pattern: 'palm', color: '#f14343', secondaryColor: '#F6E4C9', size: 0.4, lifetime: 3.5, shape: 'ring', spread: 0.7 } ] },
    { name: 'Violet Helix', components: [ { pattern: 'star', color: '#B71C28', secondaryColor: '#EBD7FF', size: 0.3, lifetime: 3.1, shape: 'star', spread: 0.9 } ] },
    { name: 'Coral Star', components: [ { pattern: 'willow', color: '#E86F5A', secondaryColor: '#FFD8C7', size: 0.33, lifetime: 3.0, shape: 'star', spread: 0.8 } ] },
    { name: 'Icy Shard', components: [ { pattern: 'solidsphere', color: '#BDEEFF', secondaryColor: '#4AAFD6', size: 0.27, lifetime: 2.9, shape: 'sphere', spread: 0.7 } ] },
    { name: 'Sunflare', components: [ { pattern: 'brocade', color: '#EFB158', secondaryColor: '#FFD79A', size: 0.36, lifetime: 3.3, shape: 'sphere', spread: 0.95 } ] },
    { name: 'Emerald Fan', components: [ { pattern: 'heart', color: '#1ed9fa', secondaryColor: '#BDEEE0', size: 0.34, lifetime: 3.4, shape: 'star', spread: 0.9 } ] },
    { name: 'Midnight Ring', components: [ { pattern: 'spherical', color: '#1C2E8A', secondaryColor: '#8A9FD6', size: 0.31, lifetime: 3.0, shape: 'ring', spread: 0.75 } ] },
    { name: 'Rose Shower', components: [ { pattern: 'burst', color: '#E57FBF', secondaryColor: '#FFD6F0', size: 0.29, lifetime: 2.9, shape: 'sphere', spread: 0.8 } ] },
    { name: 'Cerulean Tide', components: [ { pattern: 'ring', color: '#2F9BD6', secondaryColor: '#BFEFFF', size: 0.3, lifetime: 3.2, shape: 'sphere', spread: 0.8 } ] },
    { name: 'Amber Pop', components: [ { pattern: 'palm', color: '#E7A65A', secondaryColor: '#FDE7C7', size: 0.33, lifetime: 3.1, shape: 'sphere', spread: 0.85 } ] },
    { name: 'Lilac Drift', components: [ { pattern: 'star', color: '#B59CEB', secondaryColor: '#F2DBFF', size: 0.28, lifetime: 2.8, shape: 'star', spread: 0.9 } ] },
    { name: 'Steel Pulse', components: [ { pattern: 'willow', color: '#7D8FB3', secondaryColor: '#DCE7FF', size: 0.35, lifetime: 3.3, shape: 'sphere', spread: 0.7 } ] },
    { name: 'Crimson Core', components: [ { pattern: 'burst', color: '#C8232C', secondaryColor: '#F5A9A9', size: 0.37, lifetime: 3.4, shape: 'star', spread: 0.95 } ] },
    { name: 'Sea Mist', components: [ { pattern: 'spherical', color: '#e76ed7', secondaryColor: '#D7FFF0', size: 0.3, lifetime: 3.0, shape: 'sphere', spread: 0.8 } ] },
    { name: 'Fuchsia Spin', components: [ { pattern: 'ring', color: '#C04DAA', secondaryColor: '#F2C1E8', size: 0.32, lifetime: 3.1, shape: 'star', spread: 0.85 } ] },
    { name: 'Polar White', components: [ { pattern: 'spherical', color: '#FFFFFF', secondaryColor: '#EAF6FF', size: 0.34, lifetime: 3.5, shape: 'sphere', spread: 0.8 } ] }
];
export const COMPONENT_PROPERTY_RANGES = {
    size: { min: 0.1, max: 0.7, step: 0.05 },
    lifetime: { min: 1.5, max: 4, step: 0.1 },
    spread: { min: 0.4, max: 1, step: 0.1 },
};
