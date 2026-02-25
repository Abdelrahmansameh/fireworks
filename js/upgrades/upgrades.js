// id          : unique string key (used for saving/loading)
// group       : 'BASE' | 'PATTERN' | 'DRONE' etc.
// pattern     : pattern name if group==='PATTERN', else null
// name        : human-readable title
// desc        : description shown in UI
// baseCost    : starting price
// costRatio   : multiplier for each level
// currency    : 'sparkles' | 'gold'
// maxLevel    : maximum purchasable level (1 for single-purchase)
// isVisible(game): optional function — if present, upgrade is hidden unless it returns true
// apply(game, level): callback executed after purchase and on load.

const UPGRADE_DEFINITIONS = [
    {
        id: 'base_mult_1',
        group: 'BASE',
        pattern: null,
        name: 'Spark Core I',
        desc: '+2 sparkles per component',
        baseCost: 1000,
        costRatio: 1.5,
        currency: 'sparkles',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 2 * level; }
    },
    {
        id: 'base_mult_2',
        group: 'BASE',
        pattern: null,
        name: 'Spark Core II',
        desc: '+5 sparkles per component',
        baseCost: 5000,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 5 * level; }
    },
    // ── Drone upgrades (global, apply to all drones from all hubs) ──────────
    {
        id: 'drone_lifetime',
        group: 'DRONE',
        pattern: null,
        name: 'Extended Range',
        desc: '+25% drone lifetime per level',
        baseCost: 150,
        costRatio: 1.6,
        currency: 'gold',
        maxLevel: 5,
        isVisible: (game) => game.isBuildingTypeUnlocked('DRONE_HUB'),
        apply: (game, level) => {
            game.droneStats.lifetimeMultiplier = 1 + 0.25 * level;
        },
    },
    {
        id: 'drone_speed',
        group: 'DRONE',
        pattern: null,
        name: 'Afterburners',
        desc: '+20% drone speed per level',
        baseCost: 120,
        costRatio: 1.6,
        currency: 'gold',
        maxLevel: 5,
        isVisible: (game) => game.isBuildingTypeUnlocked('DRONE_HUB'),
        apply: (game, level) => {
            game.droneStats.speedMultiplier = 1 + 0.20 * level;
        },
    },
    {
        id: 'drone_radius',
        group: 'DRONE',
        pattern: null,
        name: 'Magnetic Field',
        desc: '+20% drone collection radius per level',
        baseCost: 100,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        isVisible: (game) => game.isBuildingTypeUnlocked('DRONE_HUB'),
        apply: (game, level) => {
            game.droneStats.collectionRadiusMultiplier = 1 + 0.20 * level;
        },
    },
    {
        id: 'drone_max',
        group: 'DRONE',
        pattern: null,
        name: 'Drone Fleet',
        desc: '+5 max drones per level',
        baseCost: 200,
        costRatio: 1.8,
        currency: 'gold',
        maxLevel: 4,
        isVisible: (game) => game.isBuildingTypeUnlocked('DRONE_HUB'),
        apply: (game, level) => {
            game.droneStats.maxDrones = DRONE_CONFIG.maxDrones + 5 * level;
            if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
        },
    },
    {
        id: 'drone_sparkle_yield',
        group: 'DRONE',
        pattern: null,
        name: 'Energy Siphon',
        desc: '+50% sparkles per collected particle per level',
        baseCost: 300,
        costRatio: 1.7,
        currency: 'gold',
        maxLevel: 5,
        isVisible: (game) => game.isBuildingTypeUnlocked('DRONE_HUB'),
        apply: (game, level) => {
            game.droneStats.sparklesPerParticleMultiplier = 1 + 0.5 * level;
        },
    },
];

import { DRONE_CONFIG } from '../config/config.js';

export { UPGRADE_DEFINITIONS }; 