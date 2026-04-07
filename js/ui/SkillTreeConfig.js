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
            desc: '+1 sparkles per firework',
            baseCost: 20,
            costRatio: 5,
            currency: 'sparkles',
            maxLevel: 4,
            apply: (game, level) => { game.baseSparkleMultiplier += level; },
        },
        spark_core_2: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',

            id: 'spark_core_2',
            group: 'BASE',
            name: 'Spark Core II',
            desc: '+5 sparkles per firework',
            baseCost: 1000,
            costRatio: 1.8,
            currency: 'sparkles',
            maxLevel: 5,
            requires: { upgrades: { base_mult_1: 3 } },
            apply: (game, level) => { game.baseSparkleMultiplier += 5 * level; },
        },
        spark_core_3: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_2',

            id: 'spark_core_3',
            group: 'BASE',
            name: 'Spark Core III',
            desc: '+15 sparkles per firework',
            baseCost: 10000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { spark_core_2: 5 } },
            apply: (game, level) => { game.baseSparkleMultiplier += 15 * level; },
        },
        spark_core_4: {
            offset: { x: 0, y: -200 },
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_3',

            id: 'spark_core_4',
            group: 'BASE',
            name: 'Spark Core IV',
            desc: '+50 sparkles per firework',
            baseCost: 300000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 2,
            requires: { upgrades: { spark_core_3: 3 } },
            apply: (game, level) => { game.baseSparkleMultiplier += 50 * level; },
        },

        // -- Building Blueprints --
        // These act as hubs for their respective branches
        auto_launcher: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'base_mult_1',

            id: 'auto_launcher',
            group: 'LAUNCHER',
            name: 'Auto-Launcher Blueprint',
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
            desc: '×0.9 launcher spawn interval',
            baseCost: 100,
            costRatio: 2,
            currency: 'sparkles',
            maxLevel: 5,
            requires: { upgrades: { auto_launcher: 1 } },
            apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier = Math.pow(0.9, level); },
        },
        launcher_overclock: {
            offset: { x: 0, y: -200 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',

            id: 'launcher_overclock',
            group: 'LAUNCHER',
            name: 'Launcher Overclock',
            desc: '×0.8 launcher spawn interval',
            baseCost: 4000,
            costRatio: 2.0,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { launcher_spawn_rate: 5 } },
            apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier *= Math.pow(0.8, level); },
        },
        launcher_sparkle_1: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',

            id: 'launcher_sparkle_1',
            group: 'LAUNCHER',
            name: 'Sparkle Payload',
            desc: '×1.5 sparkles per launcher firework',
            baseCost: 400,
            costRatio: 1.5,
            currency: 'sparkles',
            maxLevel: 5,
            requires: { upgrades: { launcher_spawn_rate: 1 } },
            apply: (game, level) => { game.launcherStats.sparkleYieldMultiplier = 1 + 0.5 * level; },
        },
        launcher_sparkle_2: {
            offset: { x: -200, y: 0 },
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_sparkle_1',

            id: 'launcher_sparkle_2',
            group: 'LAUNCHER',
            name: 'Dense Packing',
            desc: '×2 sparkles per launcher firework',
            baseCost: 8000,
            costRatio: 2.0,
            currency: 'sparkles',
            maxLevel: 3,
            requires: { upgrades: { launcher_sparkle_1: 5 } },
            apply: (game, level) => { game.launcherStats.sparkleYieldMultiplier += 1.0 * level; },
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
            name: 'Generator Blueprint',
            desc: 'Unlocks Sparkle Generators',
            baseCost: 1000,
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
            desc: '×1.5 generator production rate',
            baseCost: 2000,
            costRatio: 1.6,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { resource_generator: 1 } },
            apply: (game, level) => { game.generatorStats.productionRateMultiplier = Math.pow(1.5, level); },
        },
        generator_overclock: {
            offset: { x: -200, y: 0 },
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'generator_production',

            id: 'generator_overclock',
            group: 'GENERATOR',
            name: 'Generator Overclock',
            desc: '×2 generator production rate',
            baseCost: 30000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 3,
            requires: { upgrades: { generator_production: 5 } },
            apply: (game, level) => { game.generatorStats.productionRateMultiplier *= Math.pow(2, level); },
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
            name: 'Drone Hub Blueprint',
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
            desc: '×1.25 drone lifetime',
            baseCost: 500,
            costRatio: 1.5,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.lifetimeMultiplier = 1 + 0.25 * level; },
        },
        drone_speed: {
            offset: { x: -200, y: 0 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',

            id: 'drone_speed',
            group: 'DRONE',
            name: 'Afterburners',
            desc: '×1.2 drone speed',
            baseCost: 400,
            costRatio: 1.5,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.speedMultiplier = 1 + 0.20 * level; },
        },
        drone_radius: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',

            id: 'drone_radius',
            group: 'DRONE',
            name: 'Magnetic Field',
            desc: '×1.2 drone collection radius',
            baseCost: 300,
            costRatio: 1.5,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.collectionRadiusMultiplier = 1 + 0.20 * level; },
        },
        drone_max: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',

            id: 'drone_max',
            group: 'DRONE',
            name: 'Drone Fleet',
            desc: '+5 max drones',
            baseCost: 800,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => {
                game.droneStats.maxDrones = DRONE_CONFIG.maxDrones + 5 * level;
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
            desc: '×1.5 sparkles per collected particle',
            baseCost: 600,
            costRatio: 1.7,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
        },
        drone_hub_spawn_rate: {
            offset: { x: 0, y: 200 },
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_max',

            id: 'drone_hub_spawn_rate',
            group: 'DRONE',
            name: 'Scout Protocol',
            desc: '×0.88 drone hub spawn interval',
            baseCost: 500,
            costRatio: 1.5,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { drone_hub: 1 } },
            apply: (game, level) => { game.droneHubStats.spawnIntervalMultiplier = Math.pow(0.88, level); },
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
            requires: { upgrades: { auto_launcher: 1 } },
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
            desc: '+5 permanent crowd members',
            baseCost: 1500,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_1: 1 } },
            apply: (game, _level) => { game.crowdStats.countBonus += 5; },
        },
        crowd_invite_2: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_invite_1',

            id: 'crowd_invite_2',
            group: 'CROWD',
            name: 'Extra Tickets II',
            desc: '+8 crowd members',
            baseCost: 15000,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_1: 1 } },
            apply: (game, _level) => { game.crowdStats.countBonus += 8; },
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
            baseCost: 50,
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
            baseCost: 200,
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
            treeParent: 'crowd_gold_3',

            id: 'crowd_catcher_unlock',
            group: 'CROWD',
            name: 'Crowd Catchers',
            desc: 'Thrown crowd members collect firework particles',
            baseCost: 500,
            costRatio: 1,
            currency: 'sparkles',
            maxLevel: 1,
            requires: { upgrades: { crowd_gold_3: 1 } },
            apply: (game, _level) => { game.crowdStats.catchingEnabled = true; },
        },
        catapult: {
            offset: { x: -200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',

            id: 'catapult',
            group: 'CROWD',
            name: 'Catapult Blueprint',
            desc: 'Unlocks Catapults',
            baseCost: 1000,
            costRatio: 1,
            currency: 'gold',
            maxLevel: 1,
            requires: { upgrades: { crowd_spark_1: 1 } },
            apply: (game, _level) => {
                game._handleUnlock('catapult');
            },
        },
        crowd_catcher_yield: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',

            id: 'crowd_catcher_yield',
            group: 'CROWD',
            name: 'Greedy Hands',
            desc: '×1.5 sparkles per caught particle',
            baseCost: 500,
            costRatio: 2.5,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { crowd_catcher_unlock: 1 } },
            apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
        },
        crowd_catcher_radius: {
            offset: { x: -200, y: 0 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_yield',

            id: 'crowd_catcher_radius',
            group: 'CROWD',
            name: 'Wide Arms',
            desc: '×1.25 catching radius',
            baseCost: 200,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 5,
            requires: { upgrades: { crowd_catcher_unlock: 1 } },
            apply: (game, level) => { game.crowdStats.collectionRadiusMultiplier = 1 + 0.25 * level; },
        },
        crowd_throw_power: {
            offset: { x: 0, y: 200 },
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_yield',

            id: 'crowd_throw_power',
            group: 'CROWD',
            name: 'Hyper Throw',
            desc: '+1.0 sparkles per caught particle',
            baseCost: 50000,
            costRatio: 2.0,
            currency: 'gold',
            maxLevel: 2,
            requires: { upgrades: { crowd_catcher_yield: 5 } },
            apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier += 1.0 * level; },
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
            baseCost: 400000,
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
    },
};
