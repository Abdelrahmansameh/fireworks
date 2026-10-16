#!/usr/bin/env node
// Exercise recipe ownership and launcher behavior in an isolated real browser game.
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
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    // Keep each loaded game paused before its first animation frame. The fresh
    // browser's localStorage lets reloads exercise the normal persistence path.
    await page.addInitScript(() => {
        let instance;
        Object.defineProperty(window, 'game', {
            configurable: true,
            get: () => instance,
            set(value) { instance = value; value.pause(); },
        });
    });
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    const ready = () => page.waitForFunction(() => window.game?.particleSystem
        && !window.game._isRestoring && window.game.workshop && window.game.crowd?.instancedGroup);
    await ready();

    const opening = await page.evaluate(() => {
        const game = window.game;
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        game.hasSeenFirstCrowdCinematic = true;
        game.fireworkSystem.fireworkCount = 5;
        game.checkUnlockConditions();
        game.resourceManager.resources.sparkles.amount = 10000;
        ensure(game.recipes.length === 1 && game.recipes[0].name === 'Spherical'
            && game.recipes[0].components[0].pattern === 'spherical', 'Fresh game did not start with only Spherical');
        ensure(JSON.stringify(game.unlockedPatternKeys) === JSON.stringify(['spherical']), 'Fresh game unlocked extra patterns');
        ensure(!game.buyUpgrade('unlock_recipes_tab'), 'Creator could be bought before Brighter Sparks');
        ensure(!game.buyUpgrade('auto_launcher'), 'Auto Launcher could be bought before Creator');
        ensure(game.buyUpgrade('base_mult_1'), 'Could not buy Brighter Sparks');
        ensure(!game.progression.isUnlocked('recipes_tab'), 'Brighter Sparks prematurely unlocked Creator');
        ensure(!game.progression.isVisible('auto_launcher', game).visible, 'Auto Launcher appeared before Creator');
        ensure(game.progression.getUpgradeCost('unlock_recipes_tab') === 40, 'Creator price is not 40 sparkles');
        const beforeCreator = game.getSparkles();
        ensure(game.buyUpgrade('unlock_recipes_tab'), 'Could not buy Creator as second upgrade');
        ensure(game.getSparkles() === beforeCreator - 40, 'Creator did not charge exactly 40 sparkles');
        ensure(game.progression.isUnlocked('recipes_tab') && game.advancedCreatorUnlocked, 'Creator did not open the workshop');
        ensure(JSON.stringify(game.unlockedPatternKeys) === JSON.stringify(['spherical', 'burst']), 'Creator did not bundle only Burst');
        ensure(game.recipes.length === 2 && game.recipes[1].name === 'Burst'
            && game.recipes[1].components[0].pattern === 'burst', 'Creator did not gift the Burst recipe');
        game.workshop.refresh();
        const availableShapes = [...document.querySelectorAll('.workshop-tile[data-pattern]')]
            .filter(button => !button.hidden).map(button => button.dataset.pattern);
        ensure(JSON.stringify(availableShapes) === JSON.stringify(['spherical', 'burst']), 'Workshop offered locked patterns');
        const beforeLauncherUnlock = JSON.stringify({ recipes: game.recipes, patterns: game.unlockedPatternKeys });
        ensure(game.buyUpgrade('auto_launcher'), 'Could not buy Auto Launcher after Creator');
        ensure(JSON.stringify({ recipes: game.recipes, patterns: game.unlockedPatternKeys }) === beforeLauncherUnlock,
            'Auto Launcher unlock granted a recipe or pattern');
        ensure(game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length === 0, 'Auto Launcher unlock granted an unbought launcher');
        const launcher = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
        ensure(launcher && launcher.assignedRecipeIndex === null, 'Purchased launcher did not default to Random');
        ensure(JSON.stringify({ recipes: game.recipes, patterns: game.unlockedPatternKeys }) === beforeLauncherUnlock,
            'Buying a launcher granted a recipe or pattern');
        return { purchases: ['Brighter Sparks', 'Firework Creator', 'Auto Launcher'], creatorCost: 40, availableShapes };
    });

    const progression = await page.evaluate(async () => {
        const game = window.game;
        const { PATTERN_RECIPE_COMPONENTS } = await import('/js/config/RecipeConfig.js');
        const { patternDisplayNames } = await import('/js/entities/patterns/index.js');
        const expectedPatterns = ['spherical', 'burst', 'palm', 'star', 'willow', 'ring', 'solidsphere',
            'brocade', 'heart', 'pistil', 'saturn', 'brokenHeart', 'christmasTree', 'spinner', 'helix', 'snowflake', 'dragonsBreath'];
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        const fund = () => {
            game.resourceManager.resources.sparkles.amount = 1000000000000;
            game.resourceManager.resources.gold.amount = 1000000000000;
        };
        const defs = game.progression.getAllUpgradeDefs();
        const purchases = [];
        const observedPatterns = [...game.unlockedPatternKeys];
        const buyBuildings = () => {
            let bought = false;
            for (const [type, desired] of Object.entries({ AUTO_LAUNCHER: 32, CATAPULT: 3, DRONE_HUB: 4 })) {
                if (!game.isBuildingTypeUnlocked(type)) continue;
                while (game.buildingManager.getBuildingsByType(type).length < desired) {
                    fund();
                    const before = JSON.stringify({ recipes: game.recipes, patterns: game.unlockedPatternKeys });
                    const building = game.buildingManager.buyBuilding(type);
                    if (!building) break;
                    bought = true;
                    if (type === 'AUTO_LAUNCHER') {
                        ensure(building.assignedRecipeIndex === null, 'A later launcher was not Random');
                        ensure(JSON.stringify({ recipes: game.recipes, patterns: game.unlockedPatternKeys }) === before,
                            'A later launcher purchase granted or changed a recipe/pattern');
                    }
                }
            }
            return bought;
        };
        for (let pass = 0; pass < 30; pass++) {
            let changed = buyBuildings();
            for (const def of defs) {
                fund();
                while (game.progression.canPurchase(def.id, game).ok) {
                    const beforePatterns = new Set(game.unlockedPatternKeys);
                    const beforeRecipes = game.recipes.length;
                    ensure(game.buyUpgrade(def.id), `Purchase failed for ready upgrade ${def.id}`);
                    changed = true;
                    const added = game.unlockedPatternKeys.filter(key => !beforePatterns.has(key));
                    observedPatterns.push(...added);
                    ensure(game.recipes.length === beforeRecipes + added.length,
                        `${def.id} did not gift exactly one recipe for each new pattern`);
                    for (const key of added) {
                        const recipe = game.recipes.find(saved => saved.name === patternDisplayNames[key]);
                        ensure(recipe && recipe.components[0].pattern === key, `${key} recipe is missing or not named after the pattern`);
                        ensure(recipe.components !== PATTERN_RECIPE_COMPONENTS[key]
                            && recipe.components[0] !== PATTERN_RECIPE_COMPONENTS[key][0], `${key} recipe shares its predefined components`);
                        for (const [property, value] of Object.entries(PATTERN_RECIPE_COMPONENTS[key][0])) {
                            ensure(recipe.components[0][property] === value, `${key} recipe lost its predefined ${property}`);
                        }
                    }
                    purchases.push({ id: def.id, level: game.progression.getUpgradeLevel(def.id), patterns: added });
                    fund();
                }
            }
            if (!changed) break;
        }
        ensure(JSON.stringify(observedPatterns) === JSON.stringify(expectedPatterns),
            `Patterns did not unlock in their established order: ${observedPatterns.join(', ')}`);
        ensure(game.recipes.length === expectedPatterns.length, 'Unlocking every pattern produced duplicate or missing gifts');
        ensure(game.recipes.every(recipe => recipe.name === patternDisplayNames[recipe.components[0].pattern]),
            'Some granted recipes use decorative names instead of pattern names');
        ensure(defs.every(def => game.progression.getUpgradeLevel(def.id) === (def.maxLevel ?? 1)),
            `Progression traversal stalled: ${defs.filter(def => game.progression.getUpgradeLevel(def.id) < (def.maxLevel ?? 1))
                .map(def => `${def.id}: ${game.progression.canPurchase(def.id, game).reason}`).join('; ')}`);
        game.saveProgress();
        return { order: observedPatterns, giftedRecipes: game.recipes.map(recipe => recipe.name), purchases: purchases.length,
            launchers: game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length };
    });

    const ownership = await page.evaluate(async () => {
        const game = window.game;
        const { PATTERN_RECIPE_COMPONENTS } = await import('/js/config/RecipeConfig.js');
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        const launchers = game.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        const [randomLauncher, pinnedLauncher, shiftedLauncher] = launchers;
        pinnedLauncher.assignedRecipeIndex = game.recipes.findIndex(recipe => recipe.name === 'Palm');
        shiftedLauncher.assignedRecipeIndex = game.recipes.findIndex(recipe => recipe.name === 'Burst');
        const first = game.recipes[0];
        ensure(first.name === 'Spherical', 'Unexpected first recipe before deletion');
        game.deleteRecipe(0);
        ensure(shiftedLauncher.assignedRecipeIndex === 0 && game.recipes[0].name === 'Burst',
            'Deleting an earlier recipe did not preserve a shifted assignment');
        const palmIndex = game.recipes.findIndex(recipe => recipe.name === 'Palm');
        game.deleteRecipe(palmIndex);
        ensure(pinnedLauncher.assignedRecipeIndex === null, 'Deleting an assigned recipe did not return its launcher to Random');
        ensure(shiftedLauncher.assignedRecipeIndex === 0, 'Deleting a later recipe changed an earlier assignment');
        const burst = game.recipes[0];
        const templateColor = PATTERN_RECIPE_COMPONENTS.burst[0].color;
        game.selectRecipe(0);
        ensure(game.currentRecipeComponents !== burst.components && game.currentRecipeComponents[0] !== burst.components[0],
            'Editing a recipe shares its saved components');
        game.currentRecipeComponents[0].color = '#123456';
        document.getElementById('recipe-name').value = 'My edited burst';
        const countBeforeSave = game.recipes.length;
        game.saveCurrentRecipe();
        ensure(game.recipes.length === countBeforeSave && game.recipes[0].name === 'My edited burst'
            && game.recipes[0].components[0].color === '#123456', 'Renaming a gift duplicated it or failed to save edits');
        ensure(PATTERN_RECIPE_COMPONENTS.burst[0].color === templateColor, 'Editing a gift mutated its predefined recipe');
        game.currentRecipeComponents[0].color = '#654321';
        ensure(game.recipes[0].components[0].color === '#123456', 'Unsaved draft changes mutated a saved recipe');

        const shots = [];
        const originalLaunch = game.fireworkSystem.launch;
        const originalRng = game.rng;
        game.fireworkSystem.launch = (_x, _y, components) => { shots.push(components); };
        try {
            randomLauncher.assignedRecipeIndex = null;
            game.rng = () => 0;
            randomLauncher.spawnFirework();
            game.rng = () => 0.999999;
            randomLauncher.spawnFirework();
            ensure(shots[0][0].pattern === game.recipes[0].components[0].pattern
                && shots[1][0].pattern === game.recipes.at(-1).components[0].pattern,
            'Random did not independently choose from saved recipes on each shot');
            ensure(randomLauncher.assignedRecipeIndex === null, 'Random shooting assigned a permanent recipe');
            shots[0][0].color = '#abcdef';
            ensure(game.recipes[0].components[0].color === '#123456', 'Launching shared a saved recipe component');
            shiftedLauncher.spawnFirework();
            ensure(shots[2][0].pattern === game.recipes[0].components[0].pattern,
                'Assigned launcher fired a different recipe');
            pinnedLauncher.assignedRecipeIndex = 999999;
            pinnedLauncher.spawnFirework();
            ensure(pinnedLauncher.assignedRecipeIndex === null
                && shots[3][0].pattern === game.recipes.at(-1).components[0].pattern,
            'Invalid assignment did not safely fall back to Random');
        } finally {
            game.fireworkSystem.launch = originalLaunch;
            game.rng = originalRng;
        }
        const library = JSON.stringify(game.recipes);
        game.progression.applyAll(game);
        ensure(JSON.stringify(game.recipes) === library, 'Recomputing upgrades restored or changed owned gifts');
        game.saveProgress();
        game.loadRecipes();
        ensure(JSON.stringify(game.recipes) === library, 'Reloading recipes restored deleted gifts or lost edits');
        return { library: game.recipes, patterns: game.unlockedPatternKeys,
            assignments: launchers.map(launcher => launcher.assignedRecipeIndex),
            randomShots: [shots[0][0].pattern, shots[1][0].pattern], renamedRecipe: game.recipes[0].name };
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    const persistence = await page.evaluate(expected => {
        const game = window.game;
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        const verify = label => {
            ensure(JSON.stringify(game.recipes) === JSON.stringify(expected.library), `${label} changed owned recipes or restored deleted gifts`);
            ensure(JSON.stringify(game.unlockedPatternKeys) === JSON.stringify(expected.patterns), `${label} changed unlocked patterns`);
            ensure(JSON.stringify(game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').map(launcher => launcher.assignedRecipeIndex))
                === JSON.stringify(expected.assignments), `${label} changed Random or fixed assignments`);
        };
        verify('Browser reload');
        game.progression.applyAll(game);
        verify('Recompute after reload');
        game.deserializeGameData(game.serializeGameData());
        verify('Save export/import');
        game.progression.applyAll(game);
        verify('Recompute after import');
        return { browserReload: true, exportImport: true, recompute: true, recipes: game.recipes.length };
    }, ownership);

    const emptyLibrary = await page.evaluate(async () => {
        const game = window.game;
        const { launcherFPS, expectedSPS } = await import('/js/systems/ProductionRates.js');
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        game.eraseAllRecipes();
        ensure(game.recipes.length === 0, 'Erase did not empty the recipe library');
        const launchers = game.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        const before = { fireworks: game.fireworkSystem.fireworkCount, sparkles: game.getSparkles(),
            metrics: game.statsTracker.lifetimeFireworks };
        for (const launcher of launchers) {
            launcher.accumulator = 0;
            launcher.update(launcher.spawnInterval * 2);
            launcher.spawnFirework();
            ensure(launcher.getSparklesPerSecond() === 0, 'Empty library reports launcher sparkle production');
        }
        ensure(game.fireworkSystem.fireworkCount === before.fireworks && game.getSparkles() === before.sparkles
            && game.statsTracker.lifetimeFireworks === before.metrics,
        'Empty library launched the draft or awarded fireworks/sparkles/metrics');
        ensure(launcherFPS(game) === 0 && expectedSPS(game).launchers === 0, 'Production estimates ignore the empty library');
        game.progression.applyAll(game);
        game.loadRecipes();
        ensure(game.recipes.length === 0, 'Recompute or recipe reload restored erased gifts');
        game.deserializeGameData(game.serializeGameData());
        ensure(game.recipes.length === 0, 'Import restored erased gifts');
        game.saveProgress();
        return { fireworksAdded: game.fireworkSystem.fireworkCount - before.fireworks,
            launcherFPS: launcherFPS(game), estimatedLauncherSPS: expectedSPS(game).launchers };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    const remainsEmpty = await page.evaluate(() => {
        game.progression.applyAll(game);
        return game.recipes.length === 0 && game.buildingManager.getBuildingsByType('AUTO_LAUNCHER')
            .every(launcher => launcher.assignedRecipeIndex === null);
    });
    assert(remainsEmpty, 'Browser reload regenerated erased gifts or invalid assignments');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ passed: true, validation: 'actual-browser-game', opening, progression,
        ownership: { renamedRecipe: ownership.renamedRecipe, randomShots: ownership.randomShots,
            remainingRecipes: ownership.library.length }, persistence, emptyLibrary, emptyLibraryPersists: true }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
