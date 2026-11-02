// Exercise mobile navigation and panel sizing on small, tall, and landscape screens.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const cases = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 640, height: 360 }];
const errors = [];
try {
    for (const viewport of cases) {
        const page = await browser.newPage({ viewport, hasTouch: true });
        const label = `${viewport.width}x${viewport.height}`;
        page.on('pageerror', error => errors.push(`${label}: ${error}`));
        await page.goto(process.argv[2] ?? 'http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.game?.chrome && !game._isRestoring);
        await page.evaluate(() => { game.pause(); game.cheatUnlockEverything(); game.ui.expandAllTabs(); game.ui.dismissNotification(); });
        for (const tab of ['upgrades', 'buildings', 'recipes', 'crowd', 'stats', 'settings']) {
            // More contains stats and settings on mobile; use the actual navigation buttons.
            if (tab === 'stats' || tab === 'settings') {
                await page.locator('#more-tab').tap();
                if (tab === 'settings') await page.locator('#stats-content [data-more-view="settings"]').tap();
            } else await page.locator(`#${tab}-tab`).tap();
            const panel = page.locator(`#${tab}-content`);
            await panel.waitFor({ state: 'visible' });
            const state = await panel.evaluate(el => {
                const r = el.getBoundingClientRect();
                return { active: el.classList.contains('active'), left: r.left, right: r.right,
                    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
            });
            assert(state.active && state.left >= -1 && state.right <= viewport.width + 1 && state.scrollWidth <= state.clientWidth + 1,
                `${label} ${tab}: panel is outside the viewport or overflows: ${JSON.stringify(state)}`);
            if (tab === 'recipes') await panel.locator('.panel-close').tap();
            else await page.locator(tab === 'stats' || tab === 'settings' ? '#more-tab' : `#${tab}-tab`).tap();
            assert(!(await panel.isVisible()), `${label} ${tab}: close did not dismiss the panel`);
        }
        await page.waitForTimeout(350);
        const sky = await page.evaluate(() => document.elementFromPoint(innerWidth * .5, innerHeight * .4)?.id);
        assert(sky === 'game-canvas', `${label}: closed panels block the sky: ${sky}`);
        console.log(`Passed mobile panels ${label}`);
        await page.close();
    }
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, viewports: cases.length, panelsPerViewport: 6 }));
} finally { await browser.close(); }
