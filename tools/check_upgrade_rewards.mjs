#!/usr/bin/env node
// Check each purchase against the actual game's browser state, without a simulator.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.set('bot', '1');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && window.game?.renderer2D);
    const results = await page.evaluate(async () => {
        const { patternDisplayNames } = await import('/js/entities/patterns/index.js');
        const game = window.game;
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const rewards = {
            auto_launcher: ['unlocks'],
            base_mult_1: ['baseSparkleMultiplier'],
            launcher_spawn_rate: ['launcherStats.spawnIntervalMultiplier'],
            crowd_spark_1: ['crowdUnlocked', 'unlocks'],
            unlock_recipes_tab: ['advancedCreatorUnlocked', 'patterns', 'unlocks', 'recipes', 'recipeGrants'],
            crowd_gold_1: ['crowdStats.goldRateMultiplier'],
            crowd_fireworks: ['launcherStats.sparkleYieldMultiplier'],
            crowd_invite_1: ['crowdStats.countBonus'],
            crowd_catcher_unlock: ['crowdStats.catchingEnabled'],
            resource_generator: ['buildings.RESOURCE_GENERATOR', 'unlocks'],
            generator_production: ['generatorStats.productionRateMultiplier'],
            catapult: ['buildings.CATAPULT', 'unlocks'],
            catapult_spawn_rate: ['catapultStats.fireIntervalMultiplier'],
            catapult_max: ['buildings.CATAPULT', 'catapultStats.maxCatapults'],
            crowd_catcher_yield: ['crowdStats.sparklesPerParticleMultiplier'],
            crowd_catcher_radius: ['crowdStats.collectionRadiusMultiplier'],
            catapult_range_1: ['catapultStats.launchVxMultiplier'],
            spark_core_2: ['baseSparkleMultiplier'],
            launcher_sparkle_1: ['launcherStats.sparkleYieldMultiplier'],
            crowd_gold_2: ['crowdStats.goldRateMultiplier'],
            crowd_invite_2: ['crowdStats.countBonus'],
            drone_hub: ['buildings.DRONE_HUB', 'unlocks'],
            drone_lifetime: ['droneStats.lifetimeMultiplier'],
            drone_speed: ['droneStats.speedMultiplier'],
            drone_max: ['droneStats.maxDrones'],
            drone_sparkle_yield: ['droneStats.sparklesPerParticleMultiplier'],
            drone_radius: ['droneStats.collectionRadiusMultiplier'],
            drone_efficiency: ['droneHubStats.spawnIntervalMultiplier'],
            launcher_overclock: ['launcherStats.spawnIntervalMultiplier'],
            spark_core_3: ['baseSparkleMultiplier'],
            launcher_sparkle_2: ['launcherStats.spawnIntervalMultiplier'],
            grand_finale: ['grandFinaleUnlocked'],
        };
        const unlockRewards = {
            auto_launcher: ['buildings_tab'],
            crowd_spark_1: ['crowd', 'crowds_tab'],
            unlock_recipes_tab: ['recipes_tab', 'advanced_creator', 'pattern_burst'],
            resource_generator: ['resource_generator'],
            catapult: ['catapult'],
            drone_hub: ['drone_hub'],
        };
        const flatten = (value, prefix, target) => {
            for (const [key, item] of Object.entries(value)) {
                const path = prefix ? `${prefix}.${key}` : key;
                if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, target);
                else target[path] = item;
            }
        };
        const snapshot = () => {
            const result = {};
            flatten({ baseSparkleMultiplier: game.baseSparkleMultiplier,
                launcherStats: game.launcherStats, crowdStats: game.crowdStats,
                catapultStats: game.catapultStats, droneStats: game.droneStats,
                generatorStats: game.generatorStats, droneHubStats: game.droneHubStats,
                crowdUnlocked: game.crowdUnlocked,
                advancedCreatorUnlocked: game.advancedCreatorUnlocked,
                grandFinaleUnlocked: game.grandFinaleUnlocked,
                buildings: Object.fromEntries(['AUTO_LAUNCHER', 'CATAPULT', 'DRONE_HUB', 'RESOURCE_GENERATOR']
                    .map(type => [type, game.buildingManager.getBuildingsByType(type).length])),
                patterns: [...game.unlockedPatternKeys].sort(),
                recipes: game.recipes.map(recipe => ({ name: recipe.name,
                    components: recipe.components.map(component => ({ ...component })) })),
                recipeGrants: [...game.grantedRecipePatterns].sort(),
                unlocks: [...game.progression.getState().unlocked].sort(),
            }, '', result);
            return result;
        };
        const clear = () => {
            for (const building of [...game.buildingManager.buildings]) game.buildingManager.removeBuilding(building);
            game.progression.resetUpgradesState();
            game.progression.resetUnlockState();
            game.unlockedPatternKeys = ['spherical'];
            game.progression.applyAll(game);
            game.recipes = [];
            game.grantedRecipePatterns = new Set();
            game.grantPatternRecipe('spherical');
        };
        const purchases = [];
        for (const def of game.progression.getAllUpgradeDefs()) {
            const patternKeys = def.patternKeys ?? (def.patternKey ? [def.patternKey] : []);
            const expectedRewards = rewards[def.id] ?? (patternKeys.length ? ['patterns', 'unlocks', 'recipes', 'recipeGrants'] : null);
            assert(expectedRewards, `No reward expectation for ${def.id}`);
            clear();
            // Isolate the transaction while retaining its real price/effect/handler.
            def.treeParent = 'ROOT';
            def.requires = {};
            game.resourceManager.resources.sparkles.amount = 1000000000;
            game.resourceManager.resources.gold.amount = 1000000000;
            for (let level = 1; level <= (def.maxLevel ?? 1); level++) {
                const costs = game.progression.getUpgradeCosts(def.id);
                const walletBefore = Object.fromEntries(Object.keys(game.resourceManager.resources)
                    .map(currency => [currency, game.resourceManager.resources[currency].amount]));
                const before = snapshot();
                assert(game.buyUpgrade(def.id), `Could not purchase ${def.id} level ${level}`);
                const after = snapshot();
                const changed = Object.keys(after).filter(key => JSON.stringify(after[key]) !== JSON.stringify(before[key])).sort();
                const expected = [...expectedRewards].sort();
                assert(JSON.stringify(changed) === JSON.stringify(expected),
                    `${def.id} level ${level} changed ${changed.join(', ')}; expected only ${expected.join(', ')}`);
                const expectedUnlocks = unlockRewards[def.id] ?? patternKeys.map(key => `pattern_${key}`);
                assert(JSON.stringify(after.unlocks) === JSON.stringify([...expectedUnlocks].sort()),
                    `${def.id} unlocked extra features: ${after.unlocks.join(', ')}`);
                const expectedPatterns = ['spherical', ...patternKeys].sort();
                assert(JSON.stringify(after.patterns) === JSON.stringify(expectedPatterns),
                    `${def.id} granted extra firework patterns: ${after.patterns.join(', ')}`);
                assert(JSON.stringify(after.recipeGrants) === JSON.stringify(expectedPatterns)
                    && after.recipes.length === expectedPatterns.length,
                    `${def.id} did not grant exactly one saved recipe per unlocked pattern`);
                for (const key of patternKeys) {
                    const recipe = after.recipes.find(recipe => recipe.components[0]?.pattern === key);
                    assert(recipe && recipe.name === patternDisplayNames[key],
                    `${def.id} did not grant its pattern-named recipe for ${key}`);
                }
                for (const [currency, amount] of Object.entries(walletBefore)) {
                    assert(game.resourceManager.resources[currency].amount === amount - (costs[currency] ?? 0),
                        `${def.id} did not charge its displayed ${currency} cost exactly`);
                }
                const granted = game.buildingManager.buildings;
                assert(granted.every(building => building.grantUpgradeId === def.id),
                    `${def.id} did not tag its granted units for save/reset accounting`);
                purchases.push({ id: def.id, level, changed, costs });
            }
        }
        return { purchases };
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ passed: true, validation: 'actual-browser-game', ...results }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
