// Only onPurchase grants units: replaying effects never duplicates a building.
const unlock = (game, id) => {
    if (id === 'crowd') game.crowdUnlocked = true;
    if (!game.progression.isUnlocked(id)) game._handleUnlock(id);
};
const grant = type => (game, _level, upgradeId) => game.grantMilestoneBuilding(type, upgradeId);
const node = (id, parent, branch, name, desc, cost, currency, extra = {}) => ({
    id, treeParent: parent, group: branch, branch,
    icon: branch === 'DRONE' ? 'drone' : branch === 'CROWD' ? 'crowd' : branch === 'LAUNCHER' ? 'launcher' : 'base',
    offset: { x: branch === 'CROWD' ? 200 : branch === 'LAUNCHER' ? -200 : 0, y: -180 },
    name, desc, baseCost: cost, currency, costRatio: 1, maxLevel: 1, ...extra,
});
export const SHOW_MILESTONES = ['base_mult_1', 'auto_launcher', 'crowd_spark_1', 'catapult', 'drone_hub', 'launcher_sparkle_2', 'grand_finale'];
export const SKILL_TREE_CONFIG = {
    branches: {
        BASE: { color: '#FFC857', label: 'Fireworks' },
        LAUNCHER: { color: '#FF7043', label: 'Launchers' },
        CROWD: { color: '#F06292', label: 'Crowd & catapults' },
        GENERATOR: { color: '#66BB6A', label: 'Workshop' },
        DRONE: { color: '#29B6F6', label: 'Drones' },
    },
    nodes: {
        base_mult_1: node('base_mult_1', 'ROOT', 'BASE', 'Brighter Sparks',
            '+75% sparkles.', 30, 'sparkles', {
                offset: { x: 0, y: 0 }, milestone: true,
                maxLevel: 2, costRatio: 8, apply: game => { game.baseSparkleMultiplier *= 1.75; },
            }),
        auto_launcher: node('auto_launcher', 'base_mult_1', 'LAUNCHER', 'Auto Launcher',
            'Fires a firework every 5s.', 45, 'sparkles', {
                offset: { x: 0, y: -180 }, milestone: true, action: 'Build', unlockId: 'buildings_tab',
                apply: game => unlock(game, 'buildings_tab'), onPurchase: grant('AUTO_LAUNCHER'),
            }),
        launcher_spawn_rate: node('launcher_spawn_rate', 'auto_launcher', 'LAUNCHER', 'Rapid Fire',
            '+33% launcher fire rate.', 150, 'sparkles', {
                maxLevel: 2, costRatio: 4, apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.75; },
            }),
        crowd_spark_1: node('crowd_spark_1', 'launcher_spawn_rate', 'CROWD', 'Opening Night',
            'Fans bring gold.', 330, 'sparkles', {
                milestone: true, action: 'Invite', unlockId: 'crowd',
                requires: { stats: { launcherCount: 3 }, upgrades: { base_mult_1: 1 } },
                apply: game => unlock(game, 'crowd'), onPurchase: game => game.beginCrowdArrival(),
            }),
        crowd_fireworks: node('crowd_fireworks', 'crowd_spark_1', 'CROWD', 'Sparkle Powder',
            '+25% launcher sparkles.', 80, 'gold', {
                apply: game => { game.launcherStats.sparkleYieldMultiplier *= 1.25; },
            }),
        crowd_gold_1: node('crowd_gold_1', 'crowd_fireworks', 'CROWD', 'Better Tips',
            '+75% crowd gold.', 120, 'gold', {
                maxLevel: 2, costRatio: 4,
                apply: game => { game.crowdStats.goldRateMultiplier *= 1.75; },
            }),
        unlock_recipes_tab: node('unlock_recipes_tab', 'catapult_spawn_rate', 'BASE', 'Firework Recipes',
            'Create your own fireworks.', 600, 'sparkles', {
                action: 'Unlock', unlockId: 'recipes_tab', botOptional: true,
                requires: { stats: { launcherCount: 10 } },
                apply: game => unlock(game, 'recipes_tab'),
            }),
        unlock_brokenHeart: node('unlock_brokenHeart', 'unlock_recipes_tab', 'BASE', 'Broken Heart',
            'A heart that bursts apart.', 120, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_brokenHeart', botOptional: true,
                apply: game => unlock(game, 'pattern_brokenHeart'),
            }),
        unlock_christmasTree: node('unlock_christmasTree', 'unlock_brokenHeart', 'BASE', 'Christmas Tree',
            'Light up a sparkling tree.', 160, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_christmasTree', botOptional: true,
                requires: { upgrades: { catapult: 1 } },
                apply: game => unlock(game, 'pattern_christmasTree'),
            }),
        unlock_spinner: node('unlock_spinner', 'unlock_christmasTree', 'BASE', 'Spinner',
            'A spinning burst of color.', 240, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_spinner', botOptional: true,
                requires: { upgrades: { catapult_spawn_rate: 1 } },
                apply: game => unlock(game, 'pattern_spinner'),
            }),
        unlock_helix: node('unlock_helix', 'unlock_spinner', 'BASE', 'Helix',
            'Twisting trails of light.', 480, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_helix', botOptional: true,
                requires: { upgrades: { catapult_max: 1 } },
                apply: game => unlock(game, 'pattern_helix'),
            }),
        unlock_snowflake: node('unlock_snowflake', 'unlock_helix', 'BASE', 'Snowflake',
            'A glittering six-pointed burst.', 900, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_snowflake', botOptional: true,
                requires: { upgrades: { drone_hub: 1 } },
                apply: game => unlock(game, 'pattern_snowflake'),
            }),
        unlock_dragonsBreath: node('unlock_dragonsBreath', 'unlock_snowflake', 'BASE', "Dragon's Breath",
            'Roaring trails of fire.', 1500, 'sparkles', {
                action: 'Unlock', unlockId: 'pattern_dragonsBreath', botOptional: true,
                requires: { upgrades: { drone_lifetime: 1 } },
                apply: game => unlock(game, 'pattern_dragonsBreath'),
            }),
        crowd_invite_1: node('crowd_invite_1', 'crowd_gold_1', 'CROWD', 'Extra Tickets',
            '+4 fans.', 1050, 'sparkles', {
                offset: { x: 200, y: 0 }, apply: game => { game.crowdStats.countBonus += 4; },
            }),
        crowd_catcher_unlock: node('crowd_catcher_unlock', 'crowd_gold_1', 'CROWD', 'Sky Catchers',
            'Toss fans into fireworks to catch sparkles.', 1350, 'sparkles', {
                requires: { upgrades: { crowd_gold_1: 2 } }, apply: game => { game.crowdStats.catchingEnabled = true; },
            }),
        resource_generator: node('resource_generator', 'crowd_invite_1', 'GENERATOR', 'Sparkle Workshop',
            '+1 generator. Makes sparkles automatically.', 900, 'gold', {
                offset: { x: -600, y: 0 }, botOptional: true, action: 'Build', unlockId: 'resource_generator',
                requires: { upgrades: { crowd_gold_1: 2 } },
                apply: game => unlock(game, 'resource_generator'), onPurchase: grant('RESOURCE_GENERATOR'),
            }),
        generator_production: node('generator_production', 'resource_generator', 'GENERATOR', 'Better Channels',
            '+75% generator sparkles.', 2400, 'gold', {
                maxLevel: 2, costRatio: 5, botOptional: true, requires: { upgrades: { catapult: 1 } },
                apply: game => { game.generatorStats.productionRateMultiplier *= 1.75; },
            }),
        catapult: node('catapult', 'crowd_catcher_unlock', 'CROWD', 'Catapult',
            'Flings fans into fireworks. Catches sparkles.', 3600, 'gold', {
                milestone: true, action: 'Build', unlockId: 'catapult',
                requires: { stats: { launcherCount: 7 }, upgrades: { crowd_invite_1: 1, launcher_spawn_rate: 2, base_mult_1: 2 } },
                apply: game => unlock(game, 'catapult'), onPurchase: grant('CATAPULT'),
            }),
        catapult_spawn_rate: node('catapult_spawn_rate', 'catapult', 'CROWD', 'Quick Reload',
            '+43% catapult fire rate.', 1950, 'gold', {
                maxLevel: 2, costRatio: 3.5, apply: game => { game.catapultStats.fireIntervalMultiplier *= 0.7; },
            }),
        catapult_max: node('catapult_max', 'catapult_spawn_rate', 'CROWD', 'Catapult Team',
            '+1 catapult.', 3300, 'gold', {
                maxLevel: 2, costRatio: 3, offset: { x: 200, y: 0 },
                apply: game => { game.catapultStats.maxCatapults += 1; }, onPurchase: grant('CATAPULT'),
            }),
        crowd_catcher_yield: node('crowd_catcher_yield', 'catapult_max', 'CROWD', 'Confetti Catchers',
            '+75% catch sparkles.', 2700, 'gold', {
                maxLevel: 2, costRatio: 4,
                apply: game => { game.crowdStats.sparklesPerParticleMultiplier *= 1.75; },
            }),
        crowd_catcher_radius: node('crowd_catcher_radius', 'crowd_catcher_yield', 'CROWD', 'Helping Hands',
            '+25% catch reach.', 1050, 'gold', {
                maxLevel: 2, costRatio: 4,
                apply: game => { game.crowdStats.collectionRadiusMultiplier *= 1.25; },
            }),
        catapult_range_1: node('catapult_range_1', 'crowd_catcher_radius', 'CROWD', 'Long Toss',
            '+10% throw range.', 450, 'gold', {
                maxLevel: 2, costRatio: 4,
                apply: game => { game.catapultStats.launchVxMultiplier *= 1.1; },
            }),
        spark_core_2: node('spark_core_2', 'catapult', 'BASE', 'Festival Sparks',
            '+80% sparkles.', 4000, 'sparkles', {
                maxLevel: 2, costRatio: 2.5, apply: game => { game.baseSparkleMultiplier *= 1.8; },
            }),
        launcher_sparkle_1: node('launcher_sparkle_1', 'spark_core_2', 'LAUNCHER', 'Sparkle Payload',
            '+75% launcher sparkles.', 8000, 'sparkles', {
                maxLevel: 2, costRatio: 4, apply: game => { game.launcherStats.sparkleYieldMultiplier *= 1.75; },
            }),
        crowd_gold_2: node('crowd_gold_2', 'catapult_spawn_rate', 'CROWD', 'Festival Sponsors',
            '×2 crowd gold.', 7500, 'gold', {
                requires: { upgrades: { catapult_spawn_rate: 2, catapult_max: 1 }, buildingCounts: { CATAPULT: 2 } },
                apply: game => { game.crowdStats.goldRateMultiplier *= 2; },
            }),
        crowd_invite_2: node('crowd_invite_2', 'crowd_gold_2', 'CROWD', 'Full House',
            '+6 fans.', 4500, 'gold', {
                action: 'Invite', apply: game => { game.crowdStats.countBonus += 6; },
            }),
        drone_hub: node('drone_hub', 'crowd_invite_2', 'DRONE', 'Drone Hub',
            'Launches drones that chase sparkles.', 21000, 'gold', {
                milestone: true, action: 'Build', unlockId: 'drone_hub',
                requires: { stats: { launcherCount: 14 }, upgrades: { spark_core_2: 2, crowd_catcher_yield: 1, crowd_catcher_radius: 1, catapult_range_1: 1 } },
                apply: game => unlock(game, 'drone_hub'), onPurchase: grant('DRONE_HUB'),
            }),
        drone_lifetime: node('drone_lifetime', 'drone_hub', 'DRONE', 'Long Flight',
            '+50% flight time.', 6750, 'gold', {
                apply: game => { game.droneStats.lifetimeMultiplier *= 1.5; },
            }),
        drone_speed: node('drone_speed', 'drone_lifetime', 'DRONE', 'Fast Flyers',
            '+35% drone speed.', 3000, 'gold', {
                apply: game => { game.droneStats.speedMultiplier *= 1.35; },
            }),
        drone_max: node('drone_max', 'drone_speed', 'DRONE', 'Drone Team',
            '+2 drone slots.', 15000, 'gold', {
                maxLevel: 2, costRatio: 3,
                requires: { buildingCounts: { DRONE_HUB: 2 }, stats: { droneCoverage: 1 } },
                apply: game => { game.droneStats.maxDrones += 2; },
            }),
        drone_sparkle_yield: node('drone_sparkle_yield', 'drone_lifetime', 'DRONE', 'Particle Magnets',
            '+75% drone sparkles.', 9750, 'gold', {
                maxLevel: 2, costRatio: 3.5, offset: { x: -200, y: 0 },
                apply: game => { game.droneStats.sparklesPerParticleMultiplier *= 1.75; },
            }),
        drone_radius: node('drone_radius', 'drone_sparkle_yield', 'DRONE', 'Wide Sweep',
            '+25% drone reach.', 3000, 'gold', {
                maxLevel: 2, costRatio: 3.5,
                apply: game => { game.droneStats.collectionRadiusMultiplier *= 1.25; },
            }),
        drone_efficiency: node('drone_efficiency', 'drone_max', 'DRONE', 'Air Show',
            '+43% drone launches.', 22500, 'gold', {
                requires: { upgrades: { drone_max: 1, drone_sparkle_yield: 1, drone_radius: 1, drone_speed: 1 }, buildingCounts: { DRONE_HUB: 2 } },
                apply: game => { game.droneHubStats.spawnIntervalMultiplier *= 0.7; },
            }),
        unlock_advanced_creator: node('unlock_advanced_creator', 'drone_efficiency', 'BASE', 'Firework Studio',
            'Design custom bursts.', 3000, 'gold', {
                action: 'Unlock', unlockId: 'advanced_creator', botOptional: true,
                requires: { upgrades: { unlock_recipes_tab: 1 } },
                apply: game => { game.advancedCreatorUnlocked = true; unlock(game, 'advanced_creator'); },
            }),
        launcher_overclock: node('launcher_overclock', 'drone_efficiency', 'LAUNCHER', 'Full Salvo',
            '+54% launcher fire rate.', 55000, 'sparkles', {
                requires: { stats: { launcherCount: 20 }, upgrades: { launcher_sparkle_1: 2 } },
                apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.65; },
            }),
        spark_core_3: node('spark_core_3', 'launcher_overclock', 'BASE', 'Encore Sparks',
            '×2 sparkles.', 80000, 'sparkles', {
                apply: game => { game.baseSparkleMultiplier *= 2; },
            }),
        launcher_sparkle_2: node('launcher_sparkle_2', 'spark_core_3', 'LAUNCHER', 'Sky Curtain',
            '+54% launcher fire rate.', 120000, 'sparkles', {
                maxLevel: 2, costRatio: 2.5, milestone: true,
                requires: { stats: { launcherCount: 25 } }, apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.65; },
            }),
        grand_finale: node('grand_finale', 'launcher_sparkle_2', 'LAUNCHER', 'Grand Finale',
            'Fill the sky for 30 seconds.', 750000, 'sparkles', {
                secondaryCost: { gold: 22500 },
                milestone: true, action: 'Launch',
                requires: { stats: { launcherCount: 32 }, upgrades: { launcher_sparkle_2: 2, drone_efficiency: 1 } },
                apply: game => game._unlockGrandFinale(),
            }),
    },
};
