#!/usr/bin/env node
// Check the first gold purchase through the real crowd introduction and browser UI.
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(String(error)));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !window.game._isRestoring);
    const initial = await page.evaluate(() => {
        const game = window.game;
        game.pause();
        game.hasSeenFirstCrowdCinematic = false;
        game.fireworkSystem.fireworkCount = 20;
        game.checkUnlockConditions();
        game.resourceManager.resources.sparkles.amount = 2000;
        game.resourceManager.resources.gold.amount = 0;
        for (const id of ['base_mult_1', 'auto_launcher', 'launcher_spawn_rate']) {
            if (!game.buyUpgrade(id)) throw new Error(`Could not buy ${id}`);
        }
        for (let i = 0; i < 2; i++) {
            if (!game.buildingManager.buyBuilding('AUTO_LAUNCHER')) throw new Error('Could not buy a launcher');
        }
        game.ui.showTab('upgrades');
        if (!game.buyUpgrade('crowd_spark_1')) throw new Error('Could not invite the crowd');
        const card = document.getElementById('crowd-gold-upgrade');
        const result = { gold: game.resourceManager.resources.gold.amount,
            firstUpgrade: document.querySelector('#upgrades-available .upgrade-buy-button[data-upgrade-id="crowd_fireworks"]')?.dataset.upgradeId,
            firstSavingUpgrade: document.querySelector('#upgrades-available .upgrade-card.saving .upgrade-buy-button')?.dataset.upgradeId,
            cardVisible: !card.hidden, disabled: document.getElementById('crowd-gold-upgrade-buy').disabled,
            recipes: game.progression.isUnlocked('recipes_tab') };
        game.resume();
        return result;
    });
    assert(initial.firstUpgrade === 'crowd_fireworks' && initial.firstSavingUpgrade === 'crowd_fireworks' && initial.cardVisible && initial.disabled,
        `Opening Night did not immediately show the first gold purchase: ${JSON.stringify(initial)}`);
    assert(initial.gold === 0 && !initial.recipes, 'Crowd unlock granted free gold or recipes.');
    await page.waitForFunction(() => game.hasSeenFirstCrowdCinematic && !game.cinematicManager.isPlaying
        && document.querySelector('.tab-content.active')?.id === 'crowd-content'
        && game.resourceManager.resources.gold.amount > 0, { timeout: 60000 });
    const introduction = await page.evaluate(() => {
        game.pause();
        return { activePanel: document.querySelector('.tab-content.active')?.id,
            cardVisible: !document.getElementById('crowd-gold-upgrade').hidden,
            panelScroll: document.querySelector('#crowd-content .panel').scrollTop,
            gold: game.resourceManager.resources.gold.amount,
            earnedGold: game.statsTracker.sessionGoldBySource.crowd ?? 0,
            crowdLabel: document.getElementById('crowd-count-label').textContent,
            card: document.getElementById('crowd-gold-upgrade').innerText,
            gameSeconds: game.elapsedGameTime, recipes: game.progression.isUnlocked('recipes_tab') };
    });
    assert(introduction.activePanel === 'crowd-content' && introduction.cardVisible && introduction.panelScroll === 0,
        `The first crowd cinematic did not return to its purchase card: ${JSON.stringify(introduction)}`);
    assert(introduction.gold === introduction.earnedGold && !introduction.recipes,
        'The introduction added a free gold reward or recipe access.');
    assert(introduction.crowdLabel === 'fan', 'The first crowd member did not use the singular label.');
    assert(introduction.card.toLowerCase().includes('80 gold') && introduction.card.includes('+25% launcher sparkles.'),
        `The first gold card did not show its price and effect: ${introduction.card}`);
    const directory = join('traces', 'live-balance');
    await mkdir(directory, { recursive: true });
    const screenshot = join(directory, 'crowd-first-gold-ui.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });

    const before = await page.evaluate(() => {
        const snapshot = () => ({ base: game.baseSparkleMultiplier, crowd: { ...game.crowdStats },
            launcher: { ...game.launcherStats }, catapult: { ...game.catapultStats }, drone: { ...game.droneStats },
            workshop: { ...game.generatorStats }, hubs: { ...game.droneHubStats },
            recipes: game.progression.isUnlocked('recipes_tab'), studio: game.advancedCreatorUnlocked,
            patterns: [...game.unlockedPatternKeys], buildings: game.buildingManager.buildings.map(building => building.id),
            sparkles: game.getSparkles() });
        window.__goldSnapshot = snapshot;
        game.resourceManager.resources.gold.amount = 79;
        game.updateUI();
        const button = document.getElementById('crowd-gold-upgrade-buy');
        const disabledAt79 = button.disabled;
        button.click();
        const blocked = game.resourceManager.resources.gold.amount === 79 && game.progression.getUpgradeLevel('crowd_fireworks') === 0;
        game.resourceManager.resources.gold.amount = 80;
        game.updateUI();
        return { disabledAt79, blocked, enabledAt80: !button.disabled, state: snapshot() };
    });
    assert(before.disabledAt79 && before.blocked && before.enabledAt80, 'The first gold button did not follow affordability.');
    await page.locator('#crowd-gold-upgrade-buy').click();
    const first = await page.evaluate(() => ({ gold: game.resourceManager.resources.gold.amount,
        level: game.progression.getUpgradeLevel('crowd_fireworks'), state: window.__goldSnapshot(),
        visible: !document.getElementById('crowd-gold-upgrade').hidden,
        name: document.getElementById('crowd-gold-upgrade-name').textContent,
        button: document.getElementById('crowd-gold-upgrade-buy').innerText,
        disabled: document.getElementById('crowd-gold-upgrade-buy').disabled }));
    const expectedFirst = JSON.parse(JSON.stringify(before.state));
    expectedFirst.launcher.sparkleYieldMultiplier = 1.25;
    assert(first.gold === 0 && first.level === 1 && JSON.stringify(first.state) === JSON.stringify(expectedFirst),
        `The Crowd button changed more than launcher sparkles: ${JSON.stringify(first)}`);
    assert(!first.visible, 'The purchased Sparkle Powder card stayed visible.');
    await page.evaluate(() => game.saveProgress());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !window.game._isRestoring);
    const reload = await page.evaluate(() => {
        game.pause();
        return { level: game.progression.getUpgradeLevel('crowd_fireworks'), multiplier: game.launcherStats.sparkleYieldMultiplier,
            hidden: document.getElementById('crowd-gold-upgrade').hidden,
            cinematic: game.cinematicManager.isPlaying, recipes: game.progression.isUnlocked('recipes_tab') };
    });
    assert(reload.level === 1 && reload.multiplier === 1.25 && reload.hidden && !reload.cinematic && !reload.recipes,
        `Reload did not preserve the maxed purchase: ${JSON.stringify(reload)}`);
    const reset = await page.evaluate(() => {
        const refund = game.resetUpgrades();
        const hiddenAfterReset = document.getElementById('crowd-gold-upgrade').hidden;
        const gold = game.resourceManager.resources.gold.amount;
        for (const id of ['base_mult_1', 'auto_launcher', 'launcher_spawn_rate', 'crowd_spark_1']) {
            if (!game.buyUpgrade(id)) throw new Error(`Reset could not rebuy ${id}`);
        }
        return { refund, hiddenAfterReset, goldBeforeCrowd: gold, goldAfterCrowd: game.resourceManager.resources.gold.amount,
            visibleAfterCrowd: !document.getElementById('crowd-gold-upgrade').hidden,
            level: game.progression.getUpgradeLevel('crowd_fireworks'), multiplier: game.launcherStats.sparkleYieldMultiplier,
            price: document.getElementById('crowd-gold-upgrade-buy').innerText,
            firstUpgrade: document.querySelector('#upgrades-available .upgrade-buy-button[data-upgrade-id="crowd_fireworks"]')?.dataset.upgradeId };
    });
    assert(reset.refund.gold === 80 && reset.hiddenAfterReset && reset.visibleAfterCrowd
        && reset.goldBeforeCrowd === reset.goldAfterCrowd && reset.level === 0 && reset.multiplier === 1
        && reset.price.toLowerCase().includes('80 gold') && reset.firstUpgrade === 'crowd_fireworks',
    `Reset did not restore the clean first gold purchase: ${JSON.stringify(reset)}`);
    assert(errors.length === 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, validation: 'actual-browser-game', initial, introduction,
        first: { gold: first.gold, level: first.level }, reload, reset, screenshot }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
