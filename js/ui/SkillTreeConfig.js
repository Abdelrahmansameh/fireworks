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
            x: 0, y: 0,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'ROOT',
        id: 'base_mult_1',
        group: 'BASE',
        name: 'Spark Core I',
        desc: '+2 sparkles per firework',
        baseCost: 100,
        costRatio: 1.5,
        currency: 'sparkles',
        maxLevel: 3,
        apply: (game, level) => { game.baseSparkleMultiplier += 2 * level; },
        },
        spark_core_2: {
            x: 0, y: -220,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',
        id: 'spark_core_2',
        group: 'BASE',
        name: 'Spark Core II',
        desc: '+5 sparkles per firework',
        baseCost: 800,
        costRatio: 1.8,
        currency: 'sparkles',
        maxLevel: 5,
        requires: { upgrades: { base_mult_1: 3 } },
        apply: (game, level) => { game.baseSparkleMultiplier += 5 * level; },
        },
        spark_core_3: {
            x: 0, y: -440,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_2',
        id: 'spark_core_3',
        group: 'BASE',
        name: 'Spark Core III',
        desc: '+15 sparkles per firework',
        baseCost: 5000,
        costRatio: 2.0,
        currency: 'gold',
        maxLevel: 3,
        requires: { upgrades: { spark_core_2: 5 } },
        apply: (game, level) => { game.baseSparkleMultiplier += 15 * level; },
        },
        spark_core_4: {
            x: 0, y: -660,
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
            x: 0, y: 120,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',
        id: 'auto_launcher',
        group: 'BASE',
        name: 'Auto-Launcher Blueprint',
        desc: 'Unlocks Firework Auto-Launchers',
        baseCost: 100,
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
            x: -320, y: 120,
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'auto_launcher',
        id: 'launcher_spawn_rate',
        group: 'LAUNCHER',
        name: 'Rapid Fire',
        desc: '-10% launcher spawn interval',
        baseCost: 300,
        costRatio: 1.6,
        currency: 'sparkles',
        maxLevel: 5,
        requires: { upgrades: { auto_launcher: 1 } },
        apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier = Math.pow(0.9, level); },
        },
        launcher_overclock: {
            x: -520, y: -60,
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',
        id: 'launcher_overclock',
        group: 'LAUNCHER',
        name: 'Launcher Overclock',
        desc: '-20% launcher spawn interval',
        baseCost: 12000,
        costRatio: 2.0,
        currency: 'sparkles',
        maxLevel: 3,
        requires: { upgrades: { launcher_spawn_rate: 5 } },
        apply: (game, level) => { game.launcherStats.spawnIntervalMultiplier *= Math.pow(0.8, level); },
        },

        // ── GENERATOR branch — goes lower-left ───────────────────────────
        // Production multipliers; costs gold
        resource_generator: {
            x: -210, y: 240,
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'auto_launcher',
        id: 'resource_generator',
        group: 'GENERATOR',
        name: 'Generator Blueprint',
        desc: 'Unlocks Sparkle Generators',
        baseCost: 500,
        costRatio: 1,
        currency: 'gold',
        maxLevel: 1,
        requires: { upgrades: { auto_launcher: 1 } },
        apply: (game, _level) => {
            game._handleUnlock('resource_generator');
        },
        },
        generator_production: {
            x: -400, y: 240,
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'resource_generator',
        id: 'generator_production',
        group: 'GENERATOR',
        name: 'Efficient Channels',
        desc: '+50% generator production rate',
        baseCost: 800,
        costRatio: 1.6,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { resource_generator: 1 } },
        apply: (game, level) => { game.generatorStats.productionRateMultiplier = Math.pow(1.5, level); },
        },
        generator_overclock: {
            x: -400, y: 480,
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
            x: 210, y: -60,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'auto_launcher',
        id: 'drone_hub',
        group: 'DRONE',
        name: 'Drone Hub Blueprint',
        desc: 'Unlocks Drone Hubs',
        baseCost: 2000,
        costRatio: 1,
        currency: 'gold',
        maxLevel: 1,
        requires: { upgrades: { auto_launcher: 1 } },
        apply: (game, _level) => {
            game._handleUnlock('drone_hub');
        },
        },
        drone_lifetime: {
            x: 400, y: -60,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_hub',
        id: 'drone_lifetime',
        group: 'DRONE',
        name: 'Extended Range',
        desc: '+25% drone lifetime',
        baseCost: 500,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { drone_hub: 1 } },
        apply: (game, level) => { game.droneStats.lifetimeMultiplier = 1 + 0.25 * level; },
        },
        drone_speed: {
            x: 480, y: -220,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        id: 'drone_speed',
        group: 'DRONE',
        name: 'Afterburners',
        desc: '+20% drone speed',
        baseCost: 400,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { drone_hub: 1 } },
        apply: (game, level) => { game.droneStats.speedMultiplier = 1 + 0.20 * level; },
        },
        drone_radius: {
            x: 480, y: -400,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',
        id: 'drone_radius',
        group: 'DRONE',
        name: 'Magnetic Field',
        desc: '+20% drone collection radius',
        baseCost: 300,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { drone_hub: 1 } },
        apply: (game, level) => { game.droneStats.collectionRadiusMultiplier = 1 + 0.20 * level; },
        },
        drone_max: {
            x: 480, y: 100,
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
            x: 660, y: -220,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',
        id: 'drone_sparkle_yield',
        group: 'DRONE',
        name: 'Energy Siphon',
        desc: '+50% sparkles per collected particle',
        baseCost: 600,
        costRatio: 1.7,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { drone_hub: 1 } },
        apply: (game, level) => { game.droneStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
        },
        drone_hub_spawn_rate: {
            x: 660, y: 100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_max',
        id: 'drone_hub_spawn_rate',
        group: 'DRONE',
        name: 'Scout Protocol',
        desc: '-12% drone hub spawn interval',
        baseCost: 500,
        costRatio: 1.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { drone_hub: 1 } },
        apply: (game, level) => { game.droneHubStats.spawnIntervalMultiplier = Math.pow(0.88, level); },
        },
        drone_efficiency: {
            x: 840, y: -60,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_hub_spawn_rate',
        id: 'drone_efficiency',
        group: 'DRONE',
        name: 'Drone Swarm Protocol',
        desc: '+10 max drones and -25% hub spawn interval',
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
            x: 0, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'auto_launcher',
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
        catapult: {
            x: -200, y: 440,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'auto_launcher',
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
        crowd_gold_1: {
            x: 200, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'auto_launcher',
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
            x: 200, y: 440,
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
            x: 400, y: 440,
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
            x: 400, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_1',
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
            x: 600, y: 240,
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
            x: 800, y: 240,
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
            x: 800, y: 440,
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
        crowd_catcher_radius: {
            x: 600, y: 620,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        id: 'crowd_catcher_radius',
        group: 'CROWD',
        name: 'Wide Arms',
        desc: '+25% catching radius',
        baseCost: 200,
        costRatio: 2.0,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { crowd_catcher_unlock: 1 } },
        apply: (game, level) => { game.crowdStats.collectionRadiusMultiplier = 1 + 0.25 * level; },
        },
        crowd_catcher_yield: {
            x: 800, y: 620,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        id: 'crowd_catcher_yield',
        group: 'CROWD',
        name: 'Greedy Hands',
        desc: '+50% sparkles per caught particle',
        baseCost: 500,
        costRatio: 2.5,
        currency: 'gold',
        maxLevel: 5,
        requires: { upgrades: { crowd_catcher_unlock: 1 } },
        apply: (game, level) => { game.crowdStats.sparklesPerParticleMultiplier = 1 + 0.5 * level; },
        },
        crowd_throw_power: {
            x: 800, y: 800,
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
            x: 1000, y: 440,
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
            x: 1000, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_3',
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
