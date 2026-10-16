// Exercise the redesigned interface against the real game, on desktop and mobile.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const errors = [];
const screenshots = join('traces', 'ui-redesign');
await mkdir(screenshots, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.workshop && window.game?.chrome);
    await page.evaluate(() => {
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        game.fireworkSystem.fireworkCount = 50;
        game.checkUnlockConditions();
        game.resourceManager.resources.sparkles.amount = 100000;
        game.resourceManager.resources.gold.amount = 100000;
        for (const id of ['base_mult_1', 'unlock_recipes_tab', 'auto_launcher', 'launcher_spawn_rate', 'crowd_spark_1', 'crowd_fireworks']) {
            if (id === 'crowd_spark_1') {
                while (game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length < 3) game.buyBuilding('AUTO_LAUNCHER');
            }
            if (game.progression.canPurchase(id, game).ok) game.buyUpgrade(id);
        }
        game.ui.expandAllTabs();
        game.ui.showTab('upgrades');
        game.ui.renderUpgrades();
        game.updateUI();
    });
    await page.waitForFunction(() => document.getElementById('upgrades-tab').classList.contains('active'));
    const buy = page.locator('#upgrades-available .upgrade-buy-button').first();
    const purchase = await buy.getAttribute('data-upgrade-id');
    const levelBefore = await page.evaluate(id => game.progression.getUpgradeLevel(id), purchase);
    await buy.click();
    assert(await page.evaluate(id => game.progression.getUpgradeLevel(id), purchase) === levelBefore + 1, 'Upgrade purchase did not apply to progression.');
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'desktop-upgrades.png') });

    await page.locator('#collapse-button').click();
    await page.waitForFunction(() => document.body.classList.contains('menu-tucked'));
    assert(!await page.locator('.tab-content.active').count(), 'Tucking the menu left a panel open.');
    await page.locator('#collapse-button').click();
    await page.locator('#buildings-tab').click();
    const before = await page.evaluate(() => game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length);
    await page.locator('#buy-auto_launcher').click();
    assert(await page.evaluate(() => game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length) === before + 1, 'Building purchase did not create a launcher.');
    await page.locator('.launcher-card-icon').first().click();
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'desktop-buildings.png') });

    await page.locator('#recipes-tab').click();
    await page.waitForFunction(() => game.previewParticleSystem && !document.getElementById('creator-scene').hidden);
    await page.locator('#recipe-name').fill('UI smoke test');
    const layers = await page.evaluate(() => game.currentRecipeComponents.length);
    await page.locator('#workshop-add-layer').click();
    assert(await page.evaluate(() => game.currentRecipeComponents.length) === layers + 1, 'Adding a layer did not update the recipe.');
    await page.locator('[data-spark="star"]').click();
    assert(await page.evaluate(() => game.workshop.component.shape) === 'star', 'Spark selection did not reach the recipe.');
    await page.locator('#save-recipe').click();
    assert(await page.evaluate(() => game.recipes.some(recipe => recipe.name === 'UI smoke test')), 'Workshop Save did not persist the recipe.');
    const fireworks = await page.evaluate(() => game.fireworkSystem.fireworkCount);
    await page.locator('#workshop-launch').click();
    assert(await page.evaluate(() => game.fireworkSystem.fireworkCount) > fireworks, 'Workshop Launch did not fire into the main sky.');
    await page.evaluate(() => { for (let i = 0; i < 180; i++) game.update(1 / 60); game.render(); });
    assert(await page.evaluate(() => game.previewParticleSystem.getTotalActiveParticles()) > 0, 'Live preview has no engine particles.');
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'desktop-workshop.png') });

    await page.locator('#settings-tab').click();
    await page.locator('#save-progress').click();
    await page.locator('#load-progress').click();
    assert(await page.locator('#serialized-data').isVisible(), 'Load code did not reveal the code editor.');
    await page.locator('#reset-game').click();
    assert(!await page.locator('#confirmation-dialog').isVisible(), 'Reset responded to a short click.');
    await page.locator('#reset-game').focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('confirmation-dialog')).display !== 'none');
    await page.keyboard.up('Space');
    await page.locator('#cancel-action').click();
    await page.locator('#stats-tab').click();
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'desktop-stats.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#upgrades-tab').click();
    await page.waitForFunction(() => document.getElementById('upgrades-content').classList.contains('active'));
    const bounds = await page.locator('#upgrades-content').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y > 200, 'Mobile sheet does not leave the sky playable.');
    await page.locator('#upgrades-content .sheet-handle').click();
    await page.waitForFunction(() => document.getElementById('upgrades-content').classList.contains('sheet-full'));
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'mobile-upgrades.png') });
    const handle = await page.locator('#upgrades-content .sheet-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 100, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('upgrades-content').classList.contains('sheet-full'));
    assert(await page.locator('#upgrades-content').isVisible(), 'Dragging a full sheet down should return it to half height.');
    await page.mouse.move(14, 774);
    await page.mouse.down();
    await page.mouse.move(14, 824, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.body.classList.contains('menu-tucked'));
    await page.locator('#show-menu').click();
    await page.locator('#more-tab').click();
    await page.locator('#stats-content [data-more-view="settings"]').click();
    assert(await page.locator('#settings-content').isVisible(), 'Mobile More did not switch to Settings.');
    await page.locator('#recipes-tab').click();
    await page.locator('[data-workshop-step="colors"]').click();
    assert(await page.locator('#workshop-main-color').isVisible(), 'Mobile studio did not switch to Colors.');
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'mobile-workshop.png') });
    await page.locator('#recipes-content .panel-close').click();
    const sky = await page.evaluate(() => document.elementFromPoint(300, 220)?.id);
    assert(sky === 'game-canvas', `Transparent UI blocks the sky: ${sky}`);
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, purchase, screenshots, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
