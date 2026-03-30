// ProgressionConfig.js — single source of truth for all unlock nodes and upgrades.
//
// Two entry types:
//   { type: 'unlock', id, requires }
//       Auto-unlocks when requires conditions are met (no cost, no level).
//       Replaces the hard-coded thresholds in checkUnlockConditions().
//
//   { type: 'upgrade', id, group, name, desc, baseCost, costRatio, currency,
//       maxLevel, requires?, apply(game, level) }
//       Purchasable upgrades. `requires` replaces the old isVisible() predicate.
//       apply() callback is kept verbatim — ProgressionManager calls it.
//
// requires schema (all fields optional):
//   {
//     stats?:     { fireworkCount?, sps?, launcherCount? }
//     buildings?: string[]     — building types that must be unlocked
//     unlocked?:  string[]     — unlock node IDs that must be in the unlocked set
//     upgrades?:  { [id]: minLevel }  — other upgrades that must reach minLevel
//   }

import { DRONE_CONFIG } from './config.js';

export const PROGRESSION_CONFIG = [

    // ── Unlock nodes ──────────────────────────────────────────────────────────
    // These fire automatically when their `requires` conditions are met.
    // IDs map 1-to-1 to the old game.unlockStates keys (snake_case).

    { type: 'unlock', id: 'sparkle_counter', requires: { stats: { fireworkCount: 1 } } },
    { type: 'unlock', id: 'tab_menu', requires: { stats: { fireworkCount: 10 } } },
    { type: 'unlock', id: 'buildings_tab', requires: { stats: { fireworkCount: 20 } } },
    { type: 'unlock', id: 'upgrades_tab', requires: { stats: { fireworkCount: 30 } } },
    { type: 'unlock', id: 'crowds_tab', requires: { stats: { sps: 0.7 } } },
    { type: 'unlock', id: 'resource_generator', requires: { stats: { launcherCount: 3 } } },
    { type: 'unlock', id: 'drone_hub', requires: { stats: { sps: 2.0 } } },
    { type: 'unlock', id: 'recipes_tab', requires: { stats: { launcherCount: 20 } } },

    // ── Base upgrades ─────────────────────────────────────────────────────────

    {
        type: 'upgrade',
        id: 'base_mult_1',
        group: 'BASE',
        name: 'Spark Core I',
        desc: '+2 sparkles per component',
        baseCost: 1000,
        costRatio: 1.5,
        currency: 'sparkles',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 2 * level; },
    },
    {
        type: 'upgrade',
        id: 'base_mult_2',
        group: 'BASE',
        name: 'Spark Core II',
        desc: '+5 sparkles per component',
        baseCost: 5000,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 5 * level; },
    },

    // ── Drone upgrades ────────────────────────────────────────────────────────

    {
        type: 'upgrade',
        id: 'drone_lifetime',
        group: 'DRONE',
        name: 'Extended Range',
        desc: '+25% drone lifetime per level',
        baseCost: 150,
        costRatio: 1.6,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => { game.droneStats.lifetimeMultiplier = 1 + 0.25 * level; },
    },
    {
        type: 'upgrade',
        id: 'drone_speed',
        group: 'DRONE',
        name: 'Afterburners',
        desc: '+20% drone speed per level',
        baseCost: 120,
        costRatio: 1.6,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => { game.droneStats.speedMultiplier = 1 + 0.20 * level; },
    },
    {
        type: 'upgrade',
        id: 'drone_radius',
        group: 'DRONE',
        name: 'Magnetic Field',
        desc: '+20% drone collection radius per level',
        baseCost: 100,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => { game.droneStats.collectionRadiusMultiplier = 1 + 0.20 * level; },
    },
    {
        type: 'upgrade',
        id: 'drone_max',
        group: 'DRONE',
        name: 'Drone Fleet',
        desc: '+5 max drones per level',
        baseCost: 200,
        costRatio: 1.8,
        currency: 'gold',
        maxLevel: 4,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => {
            game.droneStats.maxDrones = DRONE_CONFIG.maxDrones + 5 * level;
            if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
        },
    },
    {
        type: 'upgrade',
        id: 'drone_sparkle_yield',
        group: 'DRONE',
        name: 'Energy Siphon',
        desc: '+50% sparkles per collected particle per level',
        baseCost: 300,
        costRatio: 1.7,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => { game.droneStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
    },
    {
        type: 'upgrade',
        id: 'drone_hub_spawn_rate',
        group: 'DRONE',
        name: 'Scout Protocol',
        desc: '-12% drone hub spawn interval per level for all Drone Hubs',
        baseCost: 200,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['DRONE_HUB'] },
        apply: (game, level) => { game.droneHubStats.spawnIntervalMultiplier = Math.pow(0.88, level); },
    },

    // ── Crowd upgrades ────────────────────────────────────────────────────────

    {
        type: 'upgrade',
        id: 'crowd_catcher_unlock',
        group: 'CROWD',
        name: 'Crowd Catchers',
        desc: 'Thrown crowd members collect firework particles while airborne, awarding sparkles.',
        baseCost: 500,
        costRatio: 1,
        currency: 'sparkles',
        maxLevel: 1,
        requires: { unlocked: ['crowds_tab'] },
        apply: (game, _level) => { game.crowdStats.catchingEnabled = true; },
    },
    {
        type: 'upgrade',
        id: 'crowd_catcher_radius',
        group: 'CROWD',
        name: 'Wide Arms',
        desc: '+25% catching radius per level',
        baseCost: 300,
        costRatio: 2.5,
        currency: 'gold',
        maxLevel: 3,
        requires: { upgrades: { crowd_catcher_unlock: 1 } },
        apply: (game, level) => { game.crowdStats.collectionRadiusMultiplier = 1 + 0.25 * level; },
    },
    {
        type: 'upgrade',
        id: 'crowd_catcher_yield',
        group: 'CROWD',
        name: 'Greedy Hands',
        desc: '+50% sparkles per caught particle per level',
        baseCost: 400,
        costRatio: 2.5,
        currency: 'gold',
        maxLevel: 3,
        requires: { upgrades: { crowd_catcher_unlock: 1 } },
        apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
    },

    // ── Launcher upgrades ─────────────────────────────────────────────────────

    {
        type: 'upgrade',
        id: 'launcher_spawn_rate',
        group: 'LAUNCHER',
        name: 'Rapid Fire',
        desc: '-10% spawn interval per level for all Auto-Launchers',
        baseCost: 500,
        costRatio: 1.5,
        currency: 'sparkles',
        maxLevel: 5,
        requires: { buildings: ['AUTO_LAUNCHER'] },
        apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier = Math.pow(0.9, level); },
    },

    // ── Generator upgrades ────────────────────────────────────────────────────

    {
        type: 'upgrade',
        id: 'generator_production',
        group: 'GENERATOR',
        name: 'Efficient Channels',
        desc: '+50% production rate per level for all Generators',
        baseCost: 200,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { buildings: ['RESOURCE_GENERATOR'] },
        apply: (game, level) => { game.generatorStats.productionRateMultiplier = Math.pow(1.5, level); },
    },
];
