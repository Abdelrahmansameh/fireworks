#!/usr/bin/env node
// Exercise Creator before launchers, staged patterns, and crowd arrivals in the real browser game.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

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
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !window.game._isRestoring && window.game.crowd?.instancedGroup);
    const opening = await page.evaluate(() => {
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        for (let i = 0; i < 5; i++) game.fireworkSystem.launchFireworkAt(0, 100);
        game.resourceManager.resources.sparkles.amount = 75;
        game.resourceManager.resources.gold.amount = 0;
        game.ui.showTab('upgrades');
        game.ui.renderUpgrades();
        const before = game.getSparkles();
        const visible = game.progression.getAllUpgradeDefs().filter(def => game.progression.isVisible(def.id, game).visible).map(def => def.id);
        const blockedAuto = !game.buyUpgrade('auto_launcher') && game.getSparkles() === before;
        return { visible, blockedAuto, starterCost: game.progression.getUpgradeCost('base_mult_1') };
    });
    assert(JSON.stringify(opening.visible) === JSON.stringify(['base_mult_1']) && opening.blockedAuto && opening.starterCost === 30,
        `The opening did not require exactly one first upgrade: ${JSON.stringify(opening)}`);
    const screenshotDirectory = join('traces', 'live-balance');
    await mkdir(screenshotDirectory, { recursive: true });
    await page.evaluate(() => { game.ui.dismissNotification(); game.updateUI(); });
    await page.screenshot({ path: join(screenshotDirectory, 'early-first-upgrade.png'), animations: 'disabled' });
    await page.locator('[data-upgrade-card="base_mult_1"] .upgrade-buy-button').click();
    const starter = await page.evaluate(() => {
        const before = game.getSparkles();
        game.fireworkSystem.launchFireworkAt(0, 100);
        return { manualAward: game.getSparkles() - before, multiplier: game.baseSparkleMultiplier,
            buildings: game.buildingManager.buildings.length, recipes: game.progression.isUnlocked('recipes_tab'),
            autoVisible: game.progression.isVisible('auto_launcher', game).visible,
            creatorVisible: game.progression.isVisible('unlock_recipes_tab', game).visible,
            firstLauncherCost: game.buildingManager.getBuyCost('AUTO_LAUNCHER'),
            secondStarterCost: game.progression.getUpgradeCost('base_mult_1') };
    });
    assert(starter.manualAward === 1.75 && starter.multiplier === 1.75 && starter.buildings === 0
        && !starter.recipes && !starter.autoVisible && starter.creatorVisible && starter.secondStarterCost === 240,
    `The starter did not lead to the Creator before launchers: ${JSON.stringify(starter)}`);
    await page.locator('[data-upgrade-card="unlock_recipes_tab"] .upgrade-buy-button').click();
    const creator = await page.evaluate(() => {
        const result = { recipes: game.progression.isUnlocked('recipes_tab'),
            advancedCreator: game.advancedCreatorUnlocked,
            burst: game.progression.isUnlocked('pattern_burst'),
            patterns: [...game.unlockedPatternKeys],
            recipesNamed: game.recipes.map(recipe => recipe.name),
            buildings: game.buildingManager.buildings.length,
            autoVisible: game.progression.isVisible('auto_launcher', game).visible };
        game.resourceManager.resources.sparkles.amount = game.progression.getUpgradeCost('auto_launcher');
        game.updateUI();
        return result;
    });
    assert(creator.recipes && creator.advancedCreator && creator.burst && creator.buildings === 0 && creator.autoVisible
        && JSON.stringify(creator.patterns) === JSON.stringify(['spherical', 'burst'])
        && creator.recipesNamed.filter(name => name === 'Burst').length === 1,
    `The second upgrade did not bundle Creator with Burst and its recipe: ${JSON.stringify(creator)}`);
    await page.evaluate(() => { game.ui.dismissNotification(); game.updateUI(); });
    await page.screenshot({ path: join(screenshotDirectory, 'early-first-launcher.png'), animations: 'disabled' });
    await page.locator('[data-upgrade-card="auto_launcher"] .upgrade-buy-button').click();
    const launcherUnlock = await page.evaluate(() => {
        game.progression.applyAll(game);
        game.ui.showTab('buildings');
        game.updateUI();
        game.saveProgress();
        return { unlocked: game.progression.isUnlocked('buildings_tab'),
            count: game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length,
            firstCost: game.buildingManager.getBuyCost('AUTO_LAUNCHER'),
            buyDisabled: document.getElementById('buy-auto_launcher').disabled };
    });
    assert(launcherUnlock.unlocked && launcherUnlock.count === 0 && launcherUnlock.firstCost === starter.firstLauncherCost && launcherUnlock.buyDisabled,
        `Launcher unlock granted a free unit or changed its first price: ${JSON.stringify(launcherUnlock)}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !window.game._isRestoring);
    const launcherReload = await page.evaluate(firstCost => {
        game.pause();
        game.ui.showTab('buildings');
        game.resourceManager.resources.sparkles.amount = firstCost - 1;
        game.updateUI();
        const blocked = !game.buildingManager.buyBuilding('AUTO_LAUNCHER');
        const result = { count: game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length,
            blocked, balance: game.getSparkles(), disabled: document.getElementById('buy-auto_launcher').disabled };
        game.resourceManager.resources.sparkles.amount = firstCost;
        game.updateUI();
        return result;
    }, launcherUnlock.firstCost);
    assert(launcherReload.count === 0 && launcherReload.blocked && launcherReload.balance === launcherUnlock.firstCost - 1 && launcherReload.disabled,
        `Loading or an unaffordable purchase granted a launcher: ${JSON.stringify(launcherReload)}`);
    await page.locator('#buy-auto_launcher').click();
    const firstLauncher = await page.evaluate(() => {
        const launchers = game.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        return { count: launchers.length, balance: game.getSparkles(),
            paid: launchers[0]?.purchaseCost, grant: launchers[0]?.grantUpgradeId ?? null };
    });
    assert(firstLauncher.count === 1 && firstLauncher.balance === 0 && firstLauncher.paid === launcherUnlock.firstCost && firstLauncher.grant === null,
        `The first launcher was not a separate paid purchase: ${JSON.stringify(firstLauncher)}`);
    const arrivals = await page.evaluate(async () => {
        const { fireworksForCrowd, getCrowdArrivalProgress } = await import('/js/systems/ProductionRates.js');
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        game.resourceManager.resources.sparkles.amount = 10000000;
        game.resourceManager.resources.gold.amount = 10000000;
        for (let i = 0; i < 2; i++) ensure(game.buildingManager.buyBuilding('AUTO_LAUNCHER'), 'Could not buy a launcher');
        ensure(game.buyUpgrade('launcher_spawn_rate'), 'Could not buy Rapid Fire');
        game.fireworkSystem.fireworkCount = 5000;
        ensure(game.buyUpgrade('crowd_spark_1'), 'Could not invite the first fan');
        const anchor = { fireworks: game.crowdStartFireworks, time: game.crowdStartedAt };
        ensure(anchor.fireworks === 5000 && Number.isFinite(anchor.time), 'Crowd purchase did not anchor its progress');
        const sample = (age, relativeFireworks) => {
            game.elapsedGameTime = anchor.time + age;
            game.fireworkSystem.fireworkCount = anchor.fireworks + relativeFireworks;
            game.updateGame(0);
            return { age, relativeFireworks, people: game.crowd.people.length,
                label: document.getElementById('crowd-count-label').textContent };
        };
        const samples = [[0, 0], [0, 10000], [44.99, 10000], [45, 10000], [89.99, 10000], [90, 10000],
            [180, 10000], [194.99, 10000], [195, 10000]].map(([age, fireworks]) => sample(age, fireworks));
        const expected = [1, 1, 1, 2, 2, 3, 5, 5, 6];
        ensure(samples.every((result, index) => result.people === expected[index]),
            `Crowds did not trickle in even at high firework throughput: ${JSON.stringify(samples)}`);
        ensure(samples.every(result => result.label === (result.people === 1 ? 'fan' : 'fans')),
            `The crowd label did not match its count: ${JSON.stringify(samples)}`);
        sample(20, 10000);
        const countdown = { ...getCrowdArrivalProgress(2, game),
            text: document.getElementById('crowd-arrival-countdown').textContent,
            hidden: document.getElementById('crowd-arrival-countdown').hidden };
        ensure(countdown.secondsRemaining === 25 && Math.abs(countdown.progress - 20 / 45) < 0.000001
            && !countdown.hidden && countdown.text.includes('25'),
        `The next-fan UI ignored the remaining arrival time: ${JSON.stringify(countdown)}`);
        const threshold = fireworksForCrowd(2, game);
        ensure(threshold > anchor.fireworks && threshold < anchor.fireworks + 100, 'The next fan ignored the new show anchor');
        const beforeThreshold = sample(300, Math.ceil(threshold) - anchor.fireworks - 1);
        const atThreshold = sample(300, Math.ceil(threshold) - anchor.fireworks);
        ensure(beforeThreshold.people === 1 && atThreshold.people === 2,
            `The displayed next-fan threshold did not match real arrivals: ${JSON.stringify({ threshold, beforeThreshold, atThreshold })}`);
        sample(90.5, 10000);
        game.saveProgress();
        return { anchor, samples, countdown, threshold, savedPeople: game.crowd.people.length };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !window.game._isRestoring && window.game.crowd?.instancedGroup);
    const persistence = await page.evaluate(() => {
        game.pause();
        const capture = () => ({ fireworks: game.crowdStartFireworks, time: game.crowdStartedAt,
            people: game._calculateTargetCrowdCount(game.fireworkSystem.fireworkCount) });
        const reload = capture();
        game.progression.applyAll(game);
        const recompute = capture();
        const exported = game.serializeGameData();
        game.deserializeGameData(exported);
        const imported = capture();
        game.resetUpgrades();
        const reset = { fireworks: game.crowdStartFireworks, time: game.crowdStartedAt,
            target: game._calculateTargetCrowdCount(game.fireworkSystem.fireworkCount) };
        return { reload, recompute, imported, reset };
    });
    const expectedAnchor = { fireworks: arrivals.anchor.fireworks, time: arrivals.anchor.time, people: 3 };
    for (const phase of ['reload', 'recompute', 'imported']) {
        assert(JSON.stringify(persistence[phase]) === JSON.stringify(expectedAnchor),
            `${phase} changed crowd progress: ${JSON.stringify(persistence[phase])}`);
    }
    assert(persistence.reset.fireworks === null && persistence.reset.time === null && persistence.reset.target === 0,
        `Upgrade reset retained crowd progress: ${JSON.stringify(persistence.reset)}`);
    const patterns = await page.evaluate(() => {
        const ensure = (condition, message) => { if (!condition) throw new Error(message); };
        const buy = id => ensure(game.buyUpgrade(id), `Could not buy ${id}`);
        game.resourceManager.resources.sparkles.amount = 10000000;
        game.resourceManager.resources.gold.amount = 10000000;
        for (const id of ['base_mult_1', 'unlock_recipes_tab', 'auto_launcher']) buy(id);
        const beforeLaunchers = { patterns: [...game.unlockedPatternKeys], recipes: JSON.stringify(game.recipes) };
        while (game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length < 10) {
            ensure(game.buildingManager.buyBuilding('AUTO_LAUNCHER'), 'Could not buy a launcher');
        }
        const launchersUnchanged = JSON.stringify(game.unlockedPatternKeys) === JSON.stringify(beforeLaunchers.patterns)
            && JSON.stringify(game.recipes) === beforeLaunchers.recipes;
        const starBeforePalm = game.progression.canPurchase('unlock_star', game).ok;
        const before = { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount,
            recipes: game.recipes.length };
        buy('unlock_palm');
        const palm = { sparkleCharge: before.sparkles - game.getSparkles(),
            goldCharge: before.gold - game.resourceManager.resources.gold.amount,
            recipeAdded: game.recipes.length === before.recipes + 1 && game.recipes.at(-1).name === 'Palm' };
        const starBeforeRapidFire = game.progression.canPurchase('unlock_star', game).ok;
        buy('launcher_spawn_rate');
        const starAfterRapidFire = game.progression.canPurchase('unlock_star', game).ok;
        buy('unlock_star');
        const willowBeforeCrowd = game.progression.canPurchase('unlock_willow', game).ok;
        buy('crowd_spark_1');
        const willowAfterCrowd = game.progression.canPurchase('unlock_willow', game).ok;
        buy('unlock_willow');
        return { launchersUnchanged, starBeforePalm, palm, starBeforeRapidFire, starAfterRapidFire,
            willowBeforeCrowd, willowAfterCrowd, unlocked: [...game.unlockedPatternKeys],
            newRecipes: game.recipes.slice(before.recipes).map(recipe => recipe.name) };
    });
    assert(patterns.launchersUnchanged && !patterns.starBeforePalm && patterns.palm.sparkleCharge === 90
        && patterns.palm.goldCharge === 0 && patterns.palm.recipeAdded
        && !patterns.starBeforeRapidFire && patterns.starAfterRapidFire && !patterns.willowBeforeCrowd && patterns.willowAfterCrowd
        && JSON.stringify(patterns.unlocked) === JSON.stringify(['spherical', 'burst', 'palm', 'star', 'willow'])
        && JSON.stringify(patterns.newRecipes) === JSON.stringify(['Palm', 'Star', 'Willow']),
    `Pattern upgrades did not follow their staged order and grant named recipes: ${JSON.stringify(patterns)}`);
    assert(errors.length === 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, validation: 'actual-browser-game', opening, starter, creator, launcherUnlock, launcherReload, firstLauncher,
        arrivals, persistence, patterns }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
