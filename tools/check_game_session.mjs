#!/usr/bin/env node
// Check live save restoration, bot isolation, completion reload, and the recipe studio.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
for (const path of ['playwright', process.env.PLAYWRIGHT_MODULE_PATH,
    join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')].filter(Boolean)) {
    try { playwright = require(path); break; } catch { /* Try the next installed package. */ }
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE_PATH.');
const browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem);
    await page.evaluate(() => {
        game.pause();
        localStorage.clear();
        localStorage.setItem('saveVersion', '5');
        localStorage.setItem('resources', JSON.stringify({ sparkles: { amount: 12345 }, gold: { amount: 6789 } }));
        localStorage.setItem('progressionState', JSON.stringify({ schemaVersion: 3, upgrades: {
            auto_launcher: 1, crowd_spark_1: 1, flyer_unlock: 1,
            flyer_reach: 1, flyer_speed: 1, flyer_team: 2,
        }, unlocked: ['buildings_tab', 'crowds_tab', 'flyer_unlock'] }));
        localStorage.setItem('buildingManagerData', JSON.stringify({ buildings: [
            { id: 'saved-launcher', type: 'AUTO_LAUNCHER', x: 600, y: -435, assignedRecipeIndex: 0 },
        ] }));
        localStorage.setItem('flyerCount', '3');
        localStorage.setItem('hasSeenFirstCrowdCinematic', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.crowd?.instancedGroup);
    const restored = await page.evaluate(() => {
        game.pause();
        return { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount,
            launchers: game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length,
            flyerCount: game.flyerCount, renderedFlyers: game.crowd.people.filter(p => p.isFlyer).length,
            unlocked: game.progression.isUnlocked('flyer_unlock'), stats: game.flyerStats };
    });
    assert(restored.sparkles >= 12345 && restored.gold >= 6789 && restored.launchers === 1,
        'The saved resources or launcher were not restored.');
    assert(restored.flyerCount === 3 && restored.renderedFlyers === 3 && restored.unlocked,
        'Flyers or their unlock were not restored.');
    assert(Math.abs(restored.stats.speedMultiplier - 1.35) < 1e-9 && Math.abs(restored.stats.collectionRadiusMultiplier - 1.25) < 1e-9,
        'Saved flyer upgrades were not restored.');

    await page.evaluate(() => game.saveProgress());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.crowd?.instancedGroup);
    const reload = await page.evaluate(() => ({ count: game.flyerCount, rendered: game.crowd.people.filter(p => p.isFlyer).length }));
    assert(reload.count === 3 && reload.rendered === 3, 'Reload lost or duplicated flyers.');

    await page.evaluate(() => {
        game.pause();
        localStorage.clear();
        localStorage.setItem('saveVersion', '4');
        localStorage.setItem('resources', JSON.stringify({ sparkles: { amount: 12345 }, gold: { amount: 6789 } }));
        localStorage.setItem('progressionState', JSON.stringify({ schemaVersion: 2,
            upgrades: { crowd_spark_1: 1 }, purchaseCosts: { crowd_spark_1: [{ sparkles: 220 }] },
            unlocked: ['crowd', 'crowds_tab'] }));
        localStorage.setItem('hasSeenFirstCrowdCinematic', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem);
    const crowdOnly = await page.evaluate(() => {
        game.pause();
        return { crowd: game.crowdUnlocked, recipes: game.progression.isUnlocked('recipes_tab'),
            patterns: game.unlockedPatternKeys, stored: localStorage.getItem('resources'),
            recipeLevel: game.progression.getUpgradeLevel('unlock_recipes_tab') };
    });
    assert(crowdOnly.crowd && !crowdOnly.recipes && crowdOnly.recipeLevel === 0
        && !crowdOnly.patterns.includes('brokenHeart'), 'A new crowd-only save restored the old bundled recipes/patterns.');

    const botPage = await context.newPage();
    url.searchParams.set('bot', '1');
    await botPage.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await botPage.waitForFunction(() => window.game?.bot);
    const isolated = await botPage.evaluate(() => {
        game.pause();
        return { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount,
            buildings: game.buildingManager.buildings.length, stored: localStorage.getItem('resources') };
    });
    assert(isolated.sparkles === 0 && isolated.gold === 0 && isolated.buildings === 0 && isolated.stored === crowdOnly.stored,
        'Bot mode read or overwrote the normal save.');
    await botPage.close();

    await page.evaluate(() => { game.cheatUnlockEverything(); game.gameCompleted = true; game.saveProgress(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.grandFinaleManager);
    const completion = await page.evaluate(() => {
        game.pause();
        game.update(1 / 60);
        return { completed: game.gameCompleted, active: game.grandFinaleManager.active, timesFired: game.grandFinaleManager.timesFired };
    });
    assert(completion.completed && !completion.active && completion.timesFired === 0, 'Reload repeated a completed finale.');
    const creator = await page.evaluate(() => {
        game.ui.showTab('recipes');
        game.openAdvancedCreator();
        const timeBefore = game.elapsedGameTime;
        for (let i = 0; i < 300; i++) game.update(1 / 60);
        game.render();
        const result = { state: game.currentState, previewActive: game.previewActive,
            previewVisible: !document.getElementById('creator-scene').hidden,
            mainGameVisible: getComputedStyle(document.getElementById('game-container')).display !== 'none',
            gameContinues: game.elapsedGameTime > timeBefore,
            particles: game.previewParticleSystem.getTotalActiveParticles() };
        game.closeAdvancedCreator();
        return result;
    });
    assert(creator.state === 'game' && creator.previewActive && creator.previewVisible && creator.mainGameVisible && creator.gameContinues && creator.particles > 0,
        `The studio did not show a live firework preview: ${JSON.stringify(creator)}`);
    const finale = await page.evaluate(() => {
        game.hasSeenFirstCrowdCinematic = true;
        while (game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length < 32) game.grantMilestoneBuilding('AUTO_LAUNCHER');
        if (!game.triggerGrandFinale()) throw new Error('Finale replay did not start.');
        for (let i = 0; i < 900; i++) game.update(1 / 60);
        game.render();
        return { active: game.grandFinaleManager.active, particles: game.particleSystem.getTotalActiveParticles(),
            launched: game.statsTracker.sessionFireworksBySource.grand_finale,
            highBursts: game.fireworkSystem.fireworks.filter(f => f.targetY > 324).length };
    });
    assert(finale.active && finale.particles > 5000 && finale.launched > 500 && finale.highBursts > 0,
        `Finale did not fill the visible sky: ${JSON.stringify(finale)}`);
    const directory = join('traces', 'live-balance');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, 'finale-visual-verified.png') });
    assert(errors.length === 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, savedGame: restored, reload, crowdOnly,
        botIsolated: true, completion, creator, finale }, null, 2));
} finally { await browser.close(); }
