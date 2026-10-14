#!/usr/bin/env node
// Preview the real early-game menu after crowds, before the separate recipe purchase.
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
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.set('bot', '1');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && window.game?.renderer2D);
    await page.evaluate(() => {
        const game = window.game;
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        game.fireworkSystem.fireworkCount = 20;
        game.checkUnlockConditions();
        game.resourceManager.resources.sparkles.amount = 2000;
        game.resourceManager.resources.gold.amount = 1000;
        for (const id of ['auto_launcher', 'base_mult_1', 'launcher_spawn_rate']) {
            if (!game.buyUpgrade(id)) throw new Error(`Preview could not buy ${id}`);
        }
        for (let i = 0; i < 2; i++) {
            if (!game.buildingManager.buyBuilding('AUTO_LAUNCHER')) throw new Error('Preview could not buy a launcher');
        }
        for (const id of ['crowd_spark_1', 'crowd_fireworks']) {
            if (!game.buyUpgrade(id)) throw new Error(`Preview could not buy ${id}`);
        }
        if (game.progression.isUnlocked('recipes_tab')) throw new Error('Opening Night bundled recipe access');
        if (!game.progression.canPurchase('unlock_recipes_tab', game).ok) throw new Error('The separate recipe upgrade is unavailable');
        game.ui.renderUpgrades();
        game.ui.expandAllTabs();
        game.ui.hideActiveTab();
        game.ui.toggleTab('upgrades');
        if (!document.getElementById('upgrades-content').classList.contains('active')) throw new Error('The upgrade menu did not open');
        const owned = document.getElementById('upgrades-owned').closest('details');
        owned.open = true;
        game.ui.updateUI(game.getSparkles(), game.calculateTotalSparklesPerSecond(), game.fireworkSystem.fireworkCount,
            game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length, game.calculateAutoLauncherCost(3));
        game.render();
    });
    const directory = join('traces', 'live-balance');
    await mkdir(directory, { recursive: true });
    const screenshot = join(directory, 'single-reward-menu.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    console.log(screenshot);
} finally { await browser.close(); }
