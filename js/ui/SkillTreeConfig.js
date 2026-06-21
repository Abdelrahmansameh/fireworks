/**
 * SkillTreeConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the skill-tree visual layout.
 *
 * Each node entry maps one upgrade id (from PROGRESSION_CONFIG) to:
 *   x, y        — position in tree-space (pixels, origin = ROOT at 0,0)
 *   icon        — key into ICON_MAP (see SkillTreeScreen.js)
 *   branch      — branch name → colour theme (see `branches` below)
 *   treeParent  — 'ROOT' | <upgrade id>
 *                 Nodes whose treeParent hasn't been purchased yet are HIDDEN.
 *                 This is a visual/UX gate; change treeParent to adjust
 *                 which upgrade must be bought before a node becomes visible.
 *
 * Layout overview (all positions relative to ROOT = base_mult_1 at 0,0):
 *   BASE     chain → goes straight up           (x ≈ 0,   y negative)
 *   LAUNCHER branch → goes left                  (x negative, y ≈ -60)
 *   GENERATOR branch → goes lower-left           (x negative, y positive)
 *   DRONE    branch → goes right                 (x positive, y ≈ 0 to -400)
 *   CROWD    branch → goes lower-right & down    (x positive, y positive)
 *
 * Tree spans roughly x: -520 to +1100, y: -700 to +660.
 *
 * To add a new upgrade: add its entry in `nodes`, point treeParent at the
 * logical predecessor, and set x/y within the appropriate branch area.
 * The PROGRESSION_CONFIG handles actual purchasing rules.
 */

import { DRONE_CONFIG } from '../config/config.js';

export const SKILL_TREE_CONFIG = {

    // ── Branch colour themes ─────────────────────────────────────────────────
    branches: {
        BASE: { color: '#FFC857', label: 'Core' },
        DRONE: { color: '#29B6F6', label: 'Drones' },
        CROWD: { color: '#F06292', label: 'Crowd' },
        LAUNCHER: { color: '#FF7043', label: 'Launchers' },
        GENERATOR: { color: '#66BB6A', label: 'Generators' },
    },

    // ── Upgrade nodes ────────────────────────────────────────────────────────
    nodes: {

        // ── BASE chain — goes straight up ─────────────────────────────────
        // +2/+5/+15/+50 SP per firework → final BSM 177
        base_mult_1: {
            position: { x: 0, y: 0 },
            offset: { x: 0, y: 0 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'ROOT',

            id: 'base_mult_1',
            group: 'BASE',
            name: 'Spark Core I',
            desc: '×2 sparkles per firework',
            baseCost: 20,
            costRatio: 5,
            currency: 'sparkles',
            maxLevel: 3,
            apply: (game, level) => { game.baseSparkleMultiplier *= 2; },
        },
        spark_core_2: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',

            id: 'spark_core_2',
            group: 'BASE',
            name: 'Spark Core II',
            desc: 'x3 sparkles per firework',
            baseCost: 25000,
            costRatio: 9.0,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { base_mult_1: 3 } },
            apply: (game, level) => { game.baseSparkleMultiplier *= 3; },
        },
        spark_core_3: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_2',

            id: 'spark_core_3',
            group: 'BASE',
            name: 'Spark Core III',
            desc: '×2.5 sparkles per firework (per level)',
            baseCost: 50000,
            costRatio: 2.2,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { spark_core_2: 5 } },
            // baseSparkleMultiplier feeds clicks + launchers + the finale only —
            // NOT the emergent collectors. A huge value here (was ×10/level → ×1000)
            // makes the launcher family run away and crushes drones/crowd-catch in
            // the endgame, so the capstone is kept to a modest ×2.5 (×15.6 maxed).
            apply: (game, level) => { game.baseSparkleMultiplier *= 2.5; },
        },
        unlock_recipes_tab: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_3',

            id: 'unlock_recipes_tab',
            group: 'BASE',
            name: 'Recipe System',
            desc: 'Unlocks the Firework Recipes tab',
            baseCost: 2000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('recipes_tab'); },
        },

        auto_launcher: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'base_mult_1',

            id: 'auto_launcher',
            group: 'LAUNCHER',
            name: 'Auto-Launchers',
            desc: 'Unlocks Firework Auto-Launchers',
            baseCost: 25,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            apply: (game, _level) => {
                game._handleUnlock('buildings_tab');
            },
        },

        // ── LAUNCHER branch — goes left ───────────────────────────────────
        // Fire-rate reduction chain; both cost sparkles
        launcher_spawn_rate: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'auto_launcher',

            id: 'launcher_spawn_rate',
            group: 'LAUNCHER',
            name: 'Rapid Fire',
            desc: '×0.85 launcher spawn interval (per level)',
            baseCost: 120,
            costRatio: 2.2,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { auto_launcher: 1 } },
            apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier = Math.pow(0.85, level); },
        },
        launcher_overclock: {
            offset: { x: 0, y: -200 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',

            id: 'launcher_overclock',
            group: 'LAUNCHER',
            name: 'Launcher Overclock',
            desc: '×0.82 launcher spawn interval',
            baseCost: 18000,
            costRatio: 5.0,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { launcher_spawn_rate: 5 } },
            apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier *= 0.82; },
        },
        launcher_sparkle_1: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',

            id: 'launcher_sparkle_1',
            group: 'LAUNCHER',
            name: 'Sparkle Payload',
            desc: '×1.39 sparkles per launcher firework (per level)',
            baseCost: 2500,
            costRatio: 4.5,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { launcher_spawn_rate: 1 } },
            // Launchers are the particle SUPPLY (and the visual spectacle via
            // count/fire-rate); their per-firework sparkle yield is deliberately
            // modest so emergent collectors out-extract them in their windows.
            apply: (game, level) => { game.launcherStats.sparkleYieldMultiplier = Math.pow(1.39, level); },
        },
        launcher_sparkle_2: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_sparkle_1',

            id: 'launcher_sparkle_2',
            group: 'LAUNCHER',
            name: 'Dense Packing',
            desc: '×1.15 sparkles per launcher firework',
            baseCost: 300000,
            costRatio: 3.0,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { launcher_sparkle_1: 5 } },
            apply: (game, level) => { game.launcherStats.sparkleYieldMultiplier *= 1.15; },
        },
        grand_finale: {
            offset: { x: 0, y: -200 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_overclock',

            id: 'grand_finale',
            group: 'LAUNCHER',
            name: 'Grand Finale',
            desc: 'Periodically floods the sky with fireworks up to the particle limit — a recurring spectacle and a launcher income encore',
            baseCost: 14000000,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { launcher_overclock: 1 } },
            apply: (game, _level) => { game._unlockGrandFinale(); },
        },

        // ── GENERATOR branch — goes lower-left ───────────────────────────
        // Production multipliers; costs gold
        resource_generator: {
            offset: { x: 0, y: 200 },
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'auto_launcher',

            id: 'resource_generator',
            group: 'GENERATOR',
            name: 'Sparkle Generators',
            desc: 'Unlocks Sparkle Generators',
            baseCost: 1100,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { auto_launcher: 1 } },
            apply: (game, _level) => {
                game._handleUnlock('resource_generator');
            },
        },
        generator_production: {
            offset: { x: -200, y: 0 },
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'resource_generator',

            id: 'generator_production',
            group: 'GENERATOR',
            name: 'Efficient Channels',
            desc: '×2.43 generator production rate (per level)',
            baseCost: 2200,
            costRatio: 2.4,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { resource_generator: 1 } },
            apply: (game, level) => { game.generatorStats.productionRateMultiplier = Math.pow(2.43, level); },
        },
        generator_overclock: {
            offset: { x: -200, y: 0 },
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'generator_production',

            id: 'generator_overclock',
            group: 'GENERATOR',
            name: 'Generator Overclock',
            desc: '×2 generator production rate (per level)',
            baseCost: 30000,
            costRatio: 2.4,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { generator_production: 5 } },
            // NOTE: applyAll replays apply(1..level), so use a constant factor
            // here (×1.6 each level → ×4.1 at max). The previous Math.pow(3, level)
            // compounded to ×3^6 = 729× and caused a generator runaway. Kept modest
            // so generators shine right after unlock (strong base) without a
            // late-game runaway.
            apply: (game, level) => { game.generatorStats.productionRateMultiplier *= 1.6; },
        },

        // ── DRONE branch — goes right ─────────────────────────────────────
        // Six core upgrades fanning out, then capstone
        drone_hub: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'resource_generator',

            id: 'drone_hub',
            group: 'DRONE',
            name: 'Drone Hub',
            desc: 'Unlocks Drone Hubs',
            baseCost: 2000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { resource_generator: 1 } },
            apply: (game, _level) => {
                game._handleUnlock('drone_hub');
            },
        },
        drone_lifetime: {
            offset: { x: -200, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_hub',

            id: 'drone_lifetime',
            group: 'DRONE',
            name: 'Extended Range',
            desc: '+0.42× drone lifetime (per level)',
            baseCost: 1200,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.lifetimeMultiplier = 1 + 0.42 * level; },
        },
        drone_speed: {
            offset: { x: -200, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',

            id: 'drone_speed',
            group: 'DRONE',
            name: 'Afterburners',
            desc: '+0.33× drone speed (per level)',
            baseCost: 1000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.speedMultiplier = 1 + 0.33 * level; },
        },
        drone_radius: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',

            id: 'drone_radius',
            group: 'DRONE',
            name: 'Magnetic Field',
            desc: '+0.33× drone collection radius (per level)',
            baseCost: 900,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.collectionRadiusMultiplier = 1 + 0.33 * level; },
        },
        drone_max: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',

            id: 'drone_max',
            group: 'DRONE',
            name: 'Drone Fleet',
            desc: '+13 max drones (per level)',
            baseCost: 2000,
            costRatio: 2.6,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => {
                game.droneStats.maxDrones = DRONE_CONFIG.maxDrones + 13 * level;
                if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
            },
        },
        drone_sparkle_yield: {
            offset: { x: -200, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',

            id: 'drone_sparkle_yield',
            group: 'DRONE',
            name: 'Energy Siphon',
            desc: '+4.2 sparkles per collected particle (per level)',
            baseCost: 1500,
            costRatio: 2.3,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.sparklesPerParticleMultiplier = 1 + 4.2 * level; },
        },
        drone_hub_spawn_rate: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_max',

            id: 'drone_hub_spawn_rate',
            group: 'DRONE',
            name: 'Scout Protocol',
            desc: '×0.81 drone hub spawn interval (per level)',
            baseCost: 1300,
            costRatio: 2.2,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneHubStats.spawnIntervalMultiplier = Math.pow(0.81, level); },
        },
        drone_efficiency: {
            offset: { x: -200, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_hub_spawn_rate',

            id: 'drone_efficiency',
            group: 'DRONE',
            name: 'Drone Swarm Protocol',
            desc: '+10 max drones and ×0.75 hub spawn interval',
            baseCost: 60000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 2,
            requires: { upgrades: { drone_max: 5, drone_sparkle_yield: 5, drone_hub_spawn_rate: 5 } },
            apply: (game, level) => {
                game.droneStats.maxDrones += 10 * level;
                if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
                game.droneHubStats.spawnIntervalMultiplier *= Math.pow(0.75, level);
            },
        },

        crowd_spark_1: {
            offset: { x: 200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'base_mult_1',

            id: 'crowd_spark_1',
            group: 'CROWD',
            name: 'Crowd Excitement I',
            desc: '×2 sparkles per firework',
            baseCost: 10,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { auto_launcher: 1 }, stats: { crowdCount: 1 } },
            apply: (game, _level) => { game.baseSparkleMultiplier *= 2; },
        },
        crowd_gold_1: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_spark_1',

            id: 'crowd_gold_1',
            group: 'CROWD',
            name: 'Coin Rain I',
            desc: '×2 gold per crowd member',
            baseCost: 20,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_spark_1: 1 } },
            apply: (game, _level) => { game.crowdStats.goldRateMultiplier *= 2; },
        },

        crowd_invite_1: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_1',

            id: 'crowd_invite_1',
            group: 'CROWD',
            name: 'Extra Tickets I',
            desc: '+4 permanent crowd members',
            baseCost: 1000000,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_3: 1, spark_core_2: 2 } },
            apply: (game, _level) => { game.crowdStats.countBonus += 4; },
        },
        crowd_invite_2: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_invite_1',

            id: 'crowd_invite_2',
            group: 'CROWD',
            name: 'Extra Tickets II',
            desc: '+6 crowd members',
            baseCost: 5000000,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_invite_1: 1, spark_core_2: 3 } },
            apply: (game, _level) => { game.crowdStats.countBonus += 6; },
        },
        crowd_gold_2: {
            offset: { x: 200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_spark_1',

            id: 'crowd_gold_2',
            group: 'CROWD',
            name: 'Coin Rain II',
            desc: '×2 gold per crowd member',
            baseCost: 250,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_1: 1 } },
            apply: (game, _level) => { game.crowdStats.goldRateMultiplier *= 2; },
        },
        crowd_spark_2: {
            offset: { x: 200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_2',

            id: 'crowd_spark_2',
            group: 'CROWD',
            name: 'Crowd Excitement II',
            desc: '×2 sparkles per firework',
            baseCost: 100,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_2: 1 } },
            apply: (game, _level) => { game.baseSparkleMultiplier *= 2; },
        },
        crowd_gold_3: {
            offset: { x: 200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_spark_2',

            id: 'crowd_gold_3',
            group: 'CROWD',
            name: 'Coin Rain III',
            desc: '×2 gold per crowd member',
            baseCost: 6000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_spark_2: 1 } },
            apply: (game, _level) => { game.crowdStats.goldRateMultiplier *= 2; },
        },
        crowd_catcher_unlock: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_1',

            id: 'crowd_catcher_unlock',
            group: 'CROWD',
            name: 'Crowd Catchers',
            desc: 'Thrown crowd members collect firework particles',
            baseCost: 500,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_1: 1 } },
            apply: (game, _level) => { game.crowdStats.catchingEnabled = true; },
        },
        catapult: {
            offset: { x: -200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',

            id: 'catapult',
            group: 'CROWD',
            name: 'Catapults',
            desc: 'Unlocks Catapults',
            baseCost: 380,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_spark_1: 1 } },
            apply: (game, _level) => {
                game._handleUnlock('catapult');
            },
        },
        catapult_spawn_rate: {
            offset: { x: 0, y: -200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'catapult',

            id: 'catapult_spawn_rate',
            group: 'CROWD',
            name: 'Catapult Rapid Fire',
            desc: '×0.85 catapult fire interval (per level)',
            baseCost: 220,
            costRatio: 2.2,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { catapult: 1 } },
            apply: (game, level) => { game.catapultStats.fireIntervalMultiplier = Math.pow(0.85, level); },
        }, catapult_max: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'catapult',

            id: 'catapult_max',
            group: 'CROWD',
            name: 'Catapult Fleet',
            desc: '+1 max Catapult (up to +3)',
            baseCost: 1000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { catapult: 1 } },
            apply: (game, level) => { game.catapultStats.maxCatapults = 1 + level; },
        },
        catapult_range_1: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'catapult_max',

            id: 'catapult_range_1',
            group: 'CROWD',
            name: 'Long Shot',
            desc: '×1.25 catapult horizontal range per level',
            baseCost: 500,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { catapult: 1 } },
            apply: (game, level) => { game.catapultStats.launchVxMultiplier = Math.pow(1.15, level); },
        },
        crowd_catcher_yield: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',

            id: 'crowd_catcher_yield',
            group: 'CROWD',
            name: 'Greedy Hands',
            desc: '+1.83 sparkles per caught particle (per level)',
            baseCost: 500,
            costRatio: 3.2,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { crowd_catcher_unlock: 1 } },
            // Crowd-catching is the FIRST emergent source: it spikes to #1 the
            // moment catapults arrive (~5 min), then plateaus (lower ceiling than
            // drones) so generators and drones can take their later turns.
            apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier = 1 + 1.83 * level; },
        },
        crowd_catcher_radius: {
            offset: { x: 200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_yield',

            id: 'crowd_catcher_radius',
            group: 'CROWD',
            name: 'Wide Arms',
            desc: '+0.42× catching radius (per level)',
            baseCost: 220,
            costRatio: 2.6,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { crowd_catcher_unlock: 1 } },
            apply: (game, level) => { game.crowdStats.collectionRadiusMultiplier = 1 + 0.42 * level; },
        },
        crowd_throw_power: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_yield',

            id: 'crowd_throw_power',
            group: 'CROWD',
            name: 'Hyper Throw',
            desc: '+2.5 sparkles per caught particle',
            baseCost: 50000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 2,
            requires: { upgrades: { crowd_catcher_yield: 5 } },
            apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier += 2.5 * level; },
        },
        crowd_invite_3: {
            offset: { x: 200, y: 0 },

            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_3',

            id: 'crowd_invite_3',
            group: 'CROWD',
            name: 'Extra Tickets III',
            desc: '+10 crowd members',
            baseCost: 500000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_3: 1 } },
            apply: (game, _level) => { game.crowdStats.countBonus += 10; },
        },
        crowd_gold_4: {
            offset: { x: 0, y: 200 },

            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_invite_3',

            id: 'crowd_gold_4',
            group: 'CROWD',
            name: 'Jackpot',
            desc: '×8 gold per crowd member',
            baseCost: 200000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_3: 1, crowd_invite_2: 1 } },
            apply: (game, _level) => { game.crowdStats.goldRateMultiplier *= 8; },
        },
        // Pattern unlocks — sprinkled across branches
        unlock_brokenHeart: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_brokenHeart',
            group: 'LAUNCHER',
            name: 'Broken Heart Pattern',
            desc: 'Unlocks the Broken Heart firework pattern',
            baseCost: 500,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_brokenHeart'); },
        },
        unlock_spinner: {
            offset: { x: -162, y: -118 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_spinner',
            group: 'DRONE',
            name: 'Spinner Pattern',
            desc: 'Unlocks the Spinner firework pattern',
            baseCost: 600,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_spinner'); },
        },
        unlock_helix: {
            offset: { x: -62, y: -190 },
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_helix',
            group: 'GENERATOR',
            name: 'Helix Pattern',
            desc: 'Unlocks the Helix firework pattern',
            baseCost: 3000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_helix'); },
        },
        unlock_christmasTree: {
            offset: { x: 62, y: -190 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_christmasTree',
            group: 'CROWD',
            name: 'Christmas Tree Pattern',
            desc: 'Unlocks the Christmas Tree firework pattern',
            baseCost: 500,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_christmasTree'); },
        },
        unlock_dragonsBreath: {
            offset: { x: 162, y: -118 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_dragonsBreath',
            group: 'LAUNCHER',
            name: "Dragon's Breath Pattern",
            desc: 'Unlocks the Dragon\'s Breath firework pattern',
            baseCost: 2000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_dragonsBreath'); },
        },
        unlock_snowflake: {
            offset: { x: 220, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'unlock_recipes_tab',

            id: 'unlock_snowflake',
            group: 'DRONE',
            name: 'Snowflake Pattern',
            desc: 'Unlocks the Snowflake firework pattern',
            baseCost: 800,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            apply: (game, _level) => { game._handleUnlock('pattern_snowflake'); },
        },
    },
};
