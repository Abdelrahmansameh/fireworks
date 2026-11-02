// Building rewards unlock a type for purchase; they never build one.
const unlock = (game, id) => {
    if (id === 'crowd') game.crowdUnlocked = true;
    if (!game.progression.isUnlocked(id)) game._handleUnlock(id);
};
const node = (id, parent, branch, name, desc, cost, currency, extra = {}) => ({
    id, treeParent: parent, group: branch, branch,
    icon: branch === 'FLYER' ? 'crowd' : branch === 'CROWD' ? 'crowd' : branch === 'LAUNCHER' ? 'launcher' : 'base',
    offset: { x: branch === 'CROWD' ? 200 : branch === 'LAUNCHER' ? -200 : 0, y: -180 },
    name, desc, baseCost: cost, currency, costRatio: 1, maxLevel: 1, ...extra,
});
// Pattern upgrades form their own ordered branch. Upgrade prerequisites place
// each new shape at a different point in the show without relying on buildings.
const pattern = (key, parent, name, cost, stage, extra = {}) =>
    node(`unlock_${key}`, parent, 'BASE', name, 'New firework shape', cost, 'sparkles', {
        action: 'Unlock', unlockId: `pattern_${key}`, patternKey: key, botOptional: true,
        requires: { upgrades: { [stage]: 1 } },
        apply: game => unlock(game, `pattern_${key}`),
        ...extra,
    });
// Nodes marked milestoneReward are granted by MilestoneConfig, never bought.
// `requires.milestone` opens a card when that milestone completes.
export const SKILL_TREE_CONFIG = {
    branches: {
        BASE: { color: '#FFC857', label: 'Fireworks' },
        LAUNCHER: { color: '#FF7043', label: 'Launchers' },
        CROWD: { color: '#F06292', label: 'Crowd & catapults' },
        CULTIST: { color: '#66BB6A', label: 'Cult' },
        FLYER: { color: '#29B6F6', label: 'Flyers' },
    },
    nodes: {
        base_mult_1: node('base_mult_1', 'ROOT', 'BASE', 'Brighter Sparks',
            '+75% sparkles.', 30, 'sparkles', {
                offset: { x: 0, y: 0 },
                maxLevel: 2, costRatio: 8, apply: game => { game.baseSparkleMultiplier *= 1.75; },
            }),
        unlock_recipes_tab: node('unlock_recipes_tab', 'base_mult_1', 'BASE', 'Firework Creator',
            'Design your own fireworks.', 40, 'sparkles', {
                milestoneReward: true, action: 'Unlock', unlockId: 'recipes_tab', patternKey: 'burst',
                apply: game => {
                    game.advancedCreatorUnlocked = true;
                    unlock(game, 'recipes_tab');
                    unlock(game, 'advanced_creator');
                    unlock(game, 'pattern_burst');
                },
            }),
        auto_launcher: node('auto_launcher', 'unlock_recipes_tab', 'LAUNCHER', 'Auto Launcher',
            'Unlock auto launchers', 45, 'sparkles', {
                offset: { x: 0, y: -180 }, milestoneReward: true, action: 'Unlock', unlockId: 'buildings_tab',
                apply: game => unlock(game, 'buildings_tab'),
            }),
        launcher_spawn_rate: node('launcher_spawn_rate', 'auto_launcher', 'LAUNCHER', 'Rapid Fire',
            '+33% launcher fire rate.', 150, 'sparkles', {
                maxLevel: 2, costRatio: 4, apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.75; },
            }),
        crowd_spark_1: node('crowd_spark_1', 'launcher_spawn_rate', 'CROWD', 'Opening Night',
            'Fans bring gold.', 330, 'sparkles', {
                milestoneReward: true, action: 'Invite', unlockId: 'crowd',
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
        unlock_palm: pattern('palm', 'auto_launcher', 'Palm',
            90, 'auto_launcher', { offset: { x: -600, y: -180 } }),
        unlock_star: pattern('star', 'unlock_palm', 'Star',
            180, 'launcher_spawn_rate'),
        unlock_willow: pattern('willow', 'unlock_star', 'Willow',
            300, 'crowd_spark_1'),
        unlock_ring: pattern('ring', 'unlock_willow', 'Ring',
            450, 'crowd_gold_1'),
        unlock_solidsphere: pattern('solidsphere', 'unlock_ring', 'Solid Sphere',
            600, 'crowd_catcher_unlock'),
        unlock_brocade: pattern('brocade', 'unlock_solidsphere', 'Brocade',
            900, 'catapult'),
        unlock_heart: pattern('heart', 'unlock_brocade', 'Heart',
            1200, 'catapult_spawn_rate'),
        unlock_pistil: pattern('pistil', 'unlock_heart', 'Pistil',
            1600, 'catapult_max'),
        unlock_saturn: pattern('saturn', 'unlock_pistil', 'Saturn',
            2400, 'crowd_gold_2'),
        unlock_brokenHeart: pattern('brokenHeart', 'unlock_saturn', 'Broken Heart',
            120, 'flyer_unlock'),
        // Christmas Tree and Helix are temporarily disabled.
        unlock_spinner: pattern('spinner', 'unlock_brokenHeart', 'Spinner',
            240, 'flyer_speed'),
        unlock_snowflake: pattern('snowflake', 'unlock_spinner', 'Snowflake',
            900, 'launcher_overclock'),
        unlock_dragonsBreath: pattern('dragonsBreath', 'unlock_snowflake', "Dragon's Breath",
            1500, 'spark_core_3'),
        crowd_invite_1: node('crowd_invite_1', 'crowd_gold_1', 'CROWD', 'Extra Tickets',
            '+4 fans.', 1050, 'sparkles', {
                offset: { x: 200, y: 0 }, apply: game => { game.crowdStats.countBonus += 4; },
            }),
        crowd_catcher_unlock: node('crowd_catcher_unlock', 'crowd_gold_1', 'CROWD', 'Sky Catchers',
            'Toss fans into fireworks to catch sparkles.', 1350, 'sparkles', {
                apply: game => { game.crowdStats.catchingEnabled = true; },
            }),
        cultist_unlock: node('cultist_unlock', 'crowd_invite_1', 'CULTIST', 'Sparkle Cult',
            'Recruit cultists whose rituals conjure sparkles.', 900, 'gold', {
                offset: { x: -600, y: 0 }, milestoneReward: true, action: 'Recruit', unlockId: 'cultist_unlock',
                apply: game => unlock(game, 'cultist_unlock'),
            }),
        cultist_chants: node('cultist_chants', 'cultist_unlock', 'CULTIST', 'Louder Chants',
            '+75% cultist sparkles.', 2400, 'gold', {
                maxLevel: 2, costRatio: 5, botOptional: true, requires: { upgrades: { catapult: 1 } },
                apply: game => { game.cultistStats.sparkleMultiplier *= 1.75; },
            }),
        catapult: node('catapult', 'crowd_catcher_unlock', 'CROWD', 'Catapult',
            'Flings fans into fireworks. Catches sparkles.', 3600, 'gold', {
                milestoneReward: true, action: 'Build', unlockId: 'catapult',
                // Catapult catches need catching on, even if Sky Catchers was skipped.
                apply: game => { game.crowdStats.catchingEnabled = true; unlock(game, 'catapult'); },
            }),
        catapult_spawn_rate: node('catapult_spawn_rate', 'catapult', 'CROWD', 'Quick Reload',
            '+43% catapult fire rate.', 1950, 'gold', {
                maxLevel: 2, costRatio: 3.5, apply: game => { game.catapultStats.fireIntervalMultiplier *= 0.7; },
            }),
        catapult_max: node('catapult_max', 'catapult_spawn_rate', 'CROWD', 'Catapult Team',
            'Build one more catapult.', 3300, 'gold', {
                maxLevel: 2, costRatio: 3, offset: { x: 200, y: 0 },
                apply: game => { game.catapultStats.maxCatapults += 1; },
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
            '+12.5% throw range.', 450, 'gold', {
                // Both levels take a throw to roughly 1500 world units.
                maxLevel: 2, costRatio: 4,
                apply: game => { game.catapultStats.launchVxMultiplier *= 1.125; },
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
                apply: game => { game.crowdStats.goldRateMultiplier *= 2; },
            }),
        crowd_invite_2: node('crowd_invite_2', 'crowd_gold_2', 'CROWD', 'Full House',
            '+6 fans.', 4500, 'gold', {
                action: 'Invite', apply: game => { game.crowdStats.countBonus += 6; },
            }),
        flyer_unlock: node('flyer_unlock', 'crowd_invite_2', 'FLYER', 'Flying Cultists',
            'Teach a fan to fly on palm sparkles and catch bursts.', 21000, 'gold', {
                milestoneReward: true, action: 'Equip', unlockId: 'flyer_unlock',
                apply: game => unlock(game, 'flyer_unlock'), onPurchase: game => game.grantFlyer(),
            }),
        flyer_reach: node('flyer_reach', 'flyer_unlock', 'FLYER', 'Helping Hands',
            '+25% flying cultist reach.', 6750, 'gold', {
                apply: game => { game.flyerStats.collectionRadiusMultiplier *= 1.25; },
            }),
        flyer_speed: node('flyer_speed', 'flyer_reach', 'FLYER', 'Fast Flyers',
            '+35% flying cultist speed.', 3000, 'gold', {
                apply: game => { game.flyerStats.speedMultiplier *= 1.35; },
            }),
        flyer_team: node('flyer_team', 'flyer_speed', 'FLYER', 'Sky Coven',
            '+1 flying cultist.', 15000, 'gold', {
                maxLevel: 2, costRatio: 3,
                onPurchase: game => game.grantFlyer(),
            }),
        flyer_sparkle_yield: node('flyer_sparkle_yield', 'flyer_reach', 'FLYER', 'Particle Magnets',
            '+75% flying cultist sparkles.', 9750, 'gold', {
                maxLevel: 2, costRatio: 3.5, offset: { x: -200, y: 0 },
                apply: game => { game.flyerStats.sparklesPerParticleMultiplier *= 1.75; },
            }),
        flyer_radius: node('flyer_radius', 'flyer_sparkle_yield', 'FLYER', 'Wide Sweep',
            '+25% flying cultist reach.', 3000, 'gold', {
                maxLevel: 2, costRatio: 3.5,
                apply: game => { game.flyerStats.collectionRadiusMultiplier *= 1.25; },
            }),
        flyer_efficiency: node('flyer_efficiency', 'flyer_team', 'FLYER', 'Air Show',
            '+35% flying cultist speed.', 22500, 'gold', {
                requires: { upgrades: { flyer_team: 1, flyer_sparkle_yield: 1, flyer_radius: 1, flyer_speed: 1 } },
                apply: game => { game.flyerStats.speedMultiplier *= 1.35; },
            }),
        launcher_overclock: node('launcher_overclock', 'flyer_efficiency', 'LAUNCHER', 'Full Salvo',
            '+54% launcher fire rate.', 25000, 'sparkles', {
                apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.65; },
            }),
        spark_core_3: node('spark_core_3', 'launcher_overclock', 'BASE', 'Encore Sparks',
            '×2 sparkles.', 80000, 'sparkles', {
                apply: game => { game.baseSparkleMultiplier *= 2; },
            }),
        launcher_sparkle_2: node('launcher_sparkle_2', 'spark_core_3', 'LAUNCHER', 'Sky Curtain',
            '+54% launcher fire rate.', 60000, 'sparkles', {
                maxLevel: 2, costRatio: 2.5,
                apply: game => { game.launcherStats.spawnIntervalMultiplier *= 0.65; },
            }),
        grand_finale: node('grand_finale', 'launcher_sparkle_2', 'LAUNCHER', 'Grand Finale',
            'Fill the sky for 30 seconds.', 750000, 'sparkles', {
                milestoneReward: true, action: 'Launch',
                apply: game => game._unlockGrandFinale(),
            }),
    },
};
