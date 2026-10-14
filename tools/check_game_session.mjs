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
        localStorage.setItem('saveVersion', '3');
        localStorage.setItem('resources', JSON.stringify({ sparkles: { amount: 12345 }, gold: { amount: 6789 } }));
        localStorage.setItem('progressionState', JSON.stringify({ upgrades: {
            auto_launcher: 1, base_mult_1: 2, crowd_spark_1: 1, catapult: 1,
            crowd_catcher_yield: 2, crowd_gold_2: 1, drone_hub: 1,
            drone_lifetime: 1, drone_max: 2, drone_sparkle_yield: 2, drone_efficiency: 1,
        },
            unlocked: ['buildings_tab', 'crowds_tab'] }));
        localStorage.setItem('buildingManagerData', JSON.stringify({ buildings: [
            { id: 'legacy-launcher', type: 'AUTO_LAUNCHER', x: 600, y: -435, assignedRecipeIndex: 0 },
            { id: 'legacy-catapult', type: 'CATAPULT', x: 1650, y: -435, grantUpgradeId: 'catapult' },
            { id: 'legacy-hub', type: 'DRONE_HUB', x: 600, y: -435, grantUpgradeId: 'drone_hub' },
            { id: 'legacy-team-hub-1', type: 'DRONE_HUB', x: 1000, y: -435, grantUpgradeId: 'drone_max' },
            { id: 'legacy-team-hub-2', type: 'DRONE_HUB', x: 1400, y: -435, grantUpgradeId: 'drone_max' },
        ] }));
        localStorage.setItem('hasSeenFirstCrowdCinematic', 'true');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem);
    const restored = await page.evaluate(() => {
        game.pause();
        return { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount,
            launchers: game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length,
            hubs: game.buildingManager.getBuildingsByType('DRONE_HUB').length,
            patterns: game.unlockedPatternKeys, stored: localStorage.getItem('resources'),
            progression: game.progression.getState(), crowd: game.crowdStats,
            drone: game.droneStats, catapult: game.catapultStats,
            crowdTarget: game._calculateTargetCrowdCount(game.fireworkSystem.fireworkCount),
            crowdStartFireworks: game.crowdStartFireworks, crowdStartedAt: game.crowdStartedAt,
            studio: game.advancedCreatorUnlocked, recipes: game.progression.isUnlocked('recipes_tab') };
    });
    assert(restored.sparkles >= 12345 && restored.gold >= 6789 && restored.launchers === 1,
        'Reapplying bundled unlocks erased the old save.');
    for (const key of ['brokenHeart', 'christmasTree', 'spinner', 'helix', 'snowflake', 'dragonsBreath']) {
        assert(restored.patterns.includes(key), `Existing ${key} pattern was not restored.`);
    }
    assert(restored.recipes && restored.studio, 'Existing recipe or studio access was lost during bundle migration.');
    assert(restored.crowd.collectionRadiusMultiplier === 1.5625
        && Math.abs(restored.catapult.launchVxMultiplier - 1.21) < 0.000001
        && restored.crowd.countBonus === 6,
    'Existing crowd reach, throw range, or fans were lost during bundle migration.');
    assert(restored.drone.speedMultiplier === 1.35 && restored.drone.collectionRadiusMultiplier === 1.5625,
        'Existing drone speed or reach was lost during bundle migration.');
    assert(restored.hubs === 3, 'Bundle migration duplicated or removed an existing drone hub.');
    assert(restored.crowdTarget === 9 && restored.crowdStartFireworks === null && restored.crowdStartedAt === null,
        'The new arrival schedule changed an existing unanchored crowd.');

    await page.evaluate(() => game.saveProgress());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem);
    const migrationReload = await page.evaluate(() => {
        game.pause();
        const before = { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount };
        const hubs = game.buildingManager.getBuildingsByType('DRONE_HUB').length;
        const refund = game.resetUpgrades();
        return { hubs, refund, before, after: { sparkles: game.getSparkles(), gold: game.resourceManager.resources.gold.amount },
            buildings: game.buildingManager.buildings.map(building => ({ id: building.id, grantUpgradeId: building.grantUpgradeId })) };
    });
    assert(migrationReload.hubs === 3, 'Reload duplicated a migrated included hub.');
    assert(migrationReload.refund.sparkles === 485 && migrationReload.refund.gold === 142200,
        `Migrated rewards changed the original purchase refund: ${JSON.stringify(migrationReload.refund)}`);
    assert(migrationReload.after.sparkles === migrationReload.before.sparkles + 485
        && migrationReload.after.gold === migrationReload.before.gold + 142200,
    'Legacy reset manufactured currency from inherited unlocks.');
    assert(migrationReload.buildings.length === 1 && migrationReload.buildings[0].id === 'legacy-launcher',
        'Legacy reset removed the separately owned launcher or retained included units.');

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
    console.log(JSON.stringify({ passed: true, legacySave: restored, migrationReload, crowdOnly,
        botIsolated: true, completion, creator, finale }, null, 2));
} finally { await browser.close(); }
