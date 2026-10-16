// Check affordability cues and live wallet transitions against the actual game.
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
const screenshots = join('traces', 'upgrade-affordability');
const errors = [];
await mkdir(screenshots, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.chrome && window.game?.progression);
    await page.evaluate(() => {
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        game.fireworkSystem.fireworkCount = 50;
        game.checkUnlockConditions();
        game.resourceManager.resources.sparkles.amount = 100000;
        game.resourceManager.resources.gold.amount = 100000;
        for (const id of ['base_mult_1', 'unlock_recipes_tab', 'auto_launcher', 'launcher_spawn_rate']) game.buyUpgrade(id);
        game.ui.expandAllTabs();
        game.ui.showTab('upgrades');
        game.ui.renderUpgrades();
    });
    assert(await page.locator('[data-upgrade-card="crowd_spark_1"]').evaluate(card =>
        card.classList.contains('locked') && !card.querySelector('.upgrade-saving-status')),
    'A building prerequisite was incorrectly presented as insufficient resources.');
    await page.evaluate(() => {
        while (game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length < 3) game.buyBuilding('AUTO_LAUNCHER');
        game.buyUpgrade('crowd_spark_1');
        game.ui.dismissNotification();
    });

    for (const [name, viewport] of [
        ['desktop', { width: 1440, height: 900 }],
        ['mobile', { width: 390, height: 844 }],
    ]) {
        await page.setViewportSize(viewport);
        if (name === 'mobile') {
            await page.locator('#upgrades-content .sheet-handle').click();
            await page.waitForFunction(() => document.getElementById('upgrades-content').classList.contains('sheet-full'));
        }
        await page.evaluate(() => {
            game.resourceManager.resources.sparkles.amount = 300;
            game.resourceManager.resources.gold.amount = 40;
            game.updateUI();
            game.ui.renderUpgrades();
        });
        const cues = await page.evaluate(() => {
            const ready = document.querySelector('[data-upgrade-card="base_mult_1"]');
            const saving = document.querySelector('[data-upgrade-card="crowd_fireworks"]');
            const owned = document.querySelector('[data-upgrade-card="auto_launcher"]');
            return {
                ready: ready.classList.contains('ready'),
                readyEnabled: !ready.querySelector('button').disabled,
                readyBackground: getComputedStyle(ready).backgroundColor,
                readyButtonBackground: getComputedStyle(ready.querySelector('button')).backgroundColor,
                saving: saving.classList.contains('saving'),
                savingDisabled: saving.querySelector('button').disabled,
                savingBackground: getComputedStyle(saving).backgroundColor,
                savingFillBackground: getComputedStyle(saving.querySelector('.upgrade-saving-fill')).backgroundColor,
                savingStatus: saving.querySelector('.upgrade-saving-status')?.textContent,
                savingHeight: saving.getBoundingClientRect().height,
                savingProgress: saving.querySelector('.upgrade-saving-track').getAttribute('aria-valuenow'),
                owned: owned.classList.contains('purchased') && !owned.querySelector('.upgrade-saving-status'),
            };
        });
        assert(cues.ready && cues.readyEnabled, `${name}: Affordable upgrade lost its enabled purchase button.`);
        assert(cues.saving && cues.savingDisabled, `${name}: Unaffordable upgrade is not disabled.`);
        assert(!cues.savingStatus, `${name}: Unaffordable upgrade includes an unnecessary status label.`);
        assert(cues.savingBackground !== cues.readyBackground, `${name}: Affordable and unaffordable tiles use the same background.`);
        assert(cues.savingFillBackground !== cues.readyButtonBackground, `${name}: Savings still looks like an enabled purchase.`);
        assert(cues.savingProgress === '50', `${name}: Savings no longer tracks wallet balances.`);
        assert(cues.owned, `${name}: Owned upgrade inherited an unaffordable status.`);
        await page.screenshot({ animations: 'disabled', path: join(screenshots, `${name}.png`) });

        await page.evaluate(() => {
            game.resourceManager.resources.gold.amount = game.progression.getUpgradeCost('crowd_fireworks');
            game.updateUI();
        });
        const funded = await page.locator('[data-upgrade-card="crowd_fireworks"]').evaluate(card => ({
            ready: card.classList.contains('ready') && !card.querySelector('button').disabled,
            height: card.getBoundingClientRect().height,
            status: Boolean(card.querySelector('.upgrade-saving-status')),
        }));
        assert(funded.ready && !funded.status, `${name}: Reaching the price did not enable the upgrade.`);
        assert(funded.height === cues.savingHeight, `${name}: Affordability changed card height from ${cues.savingHeight} to ${funded.height}.`);
        await page.evaluate(() => {
            game.resourceManager.resources.gold.amount = 40;
            game.updateUI();
        });
        assert(await page.locator('[data-upgrade-card="crowd_fireworks"]').evaluate(card =>
            card.classList.contains('saving') && card.querySelector('button').disabled && !card.querySelector('.upgrade-saving-status')),
        `${name}: Spending resources did not disable the upgrade cleanly.`);
        assert(await page.locator('[data-upgrade-card="crowd_fireworks"]').evaluate(card => card.getBoundingClientRect().height) === funded.height,
            `${name}: Disabling the upgrade changed its height.`);
    }
    await page.evaluate(() => {
        game.resourceManager.resources.gold.amount = 80;
        game.updateUI();
    });
    await page.locator('[data-upgrade-card="crowd_fireworks"] .upgrade-buy-button').click();
    assert(await page.locator('[data-upgrade-card="crowd_fireworks"]').evaluate(card =>
        card.classList.contains('purchased') && !card.querySelector('.upgrade-saving-status')),
    'Buying an upgrade did not replace its affordability cue with owned status.');
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, screenshots, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
