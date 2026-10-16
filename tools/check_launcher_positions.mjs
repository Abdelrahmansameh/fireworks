import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
console.log('Launching browser');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const positions = page => page.evaluate(() => game.buildingManager.getBuildingsByType('AUTO_LAUNCHER')
    .map(({ id, x, y }) => ({ id, x, y })));
const unchanged = (before, after) => before.every(previous => after.some(current =>
    current.id === previous.id && current.x === previous.x && current.y === previous.y));
try {
    console.log('Browser ready');
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    console.log('Page loaded');
    await page.waitForFunction(() => window.game?.particleSystem);
    await page.evaluate(() => {
        game.pause();
        game.resourceManager.resources.sparkles.amount = 1e9;
        game._handleUnlock('upgrades_tab');
        game._handleUnlock('buildings_tab');
        game.buildingManager.createBuilding('AUTO_LAUNCHER', 1600, -435);
        game.buildingManager.createBuilding('AUTO_LAUNCHER', 3200, -435);
        game.ui.showTab('buildings');
        game.ui.updateBuildingCounts();
        game.ui.updateBuildingCosts();
    });
    const beforeBuy = await positions(page);
    console.log('Buying regular launcher');
    await page.locator('#buy-auto_launcher').click();
    const afterBuy = await positions(page);
    assert(afterBuy.length === beforeBuy.length + 1, 'Buy button did not add a launcher.');
    assert(unchanged(beforeBuy, afterBuy), 'Regular purchase moved existing launchers.');
    await page.evaluate(() => {
        game.progression.loadState({ schemaVersion: 2, upgrades: { base_mult_1: 1 }, unlocked: ['upgrades_tab'] });
        if (!game.buyUpgrade('unlock_recipes_tab')) throw new Error('Could not buy Creator before launcher unlock');
        game.ui.showTab('upgrades');
        game.ui.renderUpgrades();
    });
    console.log('Unlocking launcher purchases');
    await page.locator('.upgrade-buy-button[data-upgrade-id="auto_launcher"]').click();
    const afterUpgrade = await positions(page);
    console.log(JSON.stringify({ beforeBuy, afterBuy, afterUpgrade }, null, 2));
    assert(afterUpgrade.length === afterBuy.length, 'Upgrade purchase granted a free launcher.');
    assert(await page.evaluate(() => game.isBuildingTypeUnlocked('AUTO_LAUNCHER')),
        'Upgrade purchase did not unlock launcher purchases.');
    assert(unchanged(afterBuy, afterUpgrade), 'Upgrade purchase rearranged existing launchers.');
    await page.evaluate(() => game.grantMilestoneBuilding('AUTO_LAUNCHER'));
    const afterGrant = await positions(page);
    assert(afterGrant.length === afterUpgrade.length + 1, 'Explicit milestone grant did not add a launcher.');
    assert(unchanged(afterUpgrade, afterGrant), 'Granted launcher moved existing launchers.');
    assert(new Set(afterGrant.map(launcher => launcher.x)).size === afterGrant.length,
        'New launcher overlapped an existing launcher.');
    await page.evaluate(() => game.saveProgress());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem);
    await page.evaluate(() => { game.pause(); game.ui.showTab('buildings'); });
    assert(unchanged(afterGrant, await positions(page)), 'Reload changed launcher positions.');
    await page.locator('#spread-launchers').click();
    assert(!unchanged(afterGrant, await positions(page)), 'Manual spread button stopped working.');
    assert(errors.length === 0, errors.join('\n'));
    console.log('PASS: purchases and grants preserve positions; save/reload and manual spread work.');
} finally {
    await browser.close();
}
