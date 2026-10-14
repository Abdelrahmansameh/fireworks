// Exercise editor/collection transitions against the actual workshop and preview engine.
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
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const errors = [];
const results = [];
const screenshots = join('traces', 'workshop-preview');
await mkdir(screenshots, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(String(error)));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.workshop && !game._isRestoring);
    await page.evaluate(() => {
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        for (const id of ['sparkle_counter', 'tab_menu', 'upgrades_tab', 'recipes_tab']) game._handleUnlock(id);
        game.ui.showTab('recipes');
        game.currentRecipeComponents = [{ ...game.currentRecipeComponents[0], pattern: 'spherical',
            color: '#ff4d4d', enableColorGradient: true, gradientFinalColor: '#4d8bff',
            gradientStartTime: .2, gradientDuration: .5, lifetime: 3 }];
        game.updateComponentsList();
        game.saveCurrentRecipeComponents();
    });
    await page.waitForFunction(() => game.previewActive && game.previewRenderer && !document.getElementById('creator-scene').hidden);
    await page.evaluate(() => { window.__workshopRenderer = game.previewRenderer; window.__workshopGl = game.previewRenderer.gl; });
    await page.locator('[data-workshop-step="colors"]').click();
    await page.locator('#recipe-name').fill('Workshop preview regression');
    const savedBefore = await page.evaluate(() => game.recipes.length);
    await page.locator('#save-recipe').click();
    const recipeIndex = await page.evaluate(() => game.recipes.findIndex(recipe => recipe.name === 'Workshop preview regression'));
    assert(recipeIndex >= 0 && await page.evaluate(() => game.recipes.length) === savedBefore + 1,
        'Saving did not create the preview fixture through the real Save button.');

    const settle = async () => {
        await page.evaluate(async () => {
            for (let i = 0; i < 24; i++) await new Promise(resolve => requestAnimationFrame(resolve));
            game.ui.dismissNotification();
        });
    };
    const editor = async (label, { inPanel = false, fade = true } = {}) => {
        await settle();
        const state = await page.evaluate(() => {
            const preview = document.getElementById('creator-scene');
            const panel = document.querySelector('.workshop-panel');
            const canvas = document.getElementById('creator-canvas');
            const visible = element => element && !element.hidden && getComputedStyle(element).display !== 'none'
                && element.getClientRects().length > 0;
            const canvasBounds = canvas.getBoundingClientRect();
            const panelBounds = panel.getBoundingClientRect();
            if (game.previewActive) {
                game.workshop.restartPreview();
                game.updateCreator(1 / 60);
                for (let i = 0; i < 24; i++) game.updateCreator(1 / 60);
                game.render();
            }
            return { mode: game.workshop.mode, step: game.workshop.step, panelMode: panel.dataset.mode,
                hidden: preview.hidden, previewActive: game.previewActive,
                collectionOpen: preview.classList.contains('collection-open'),
                canvasVisible: visible(canvas), nameVisible: visible(document.getElementById('recipe-name')),
                layersVisible: visible(document.querySelector('.workshop-layers')),
                actionsVisible: visible(document.querySelector('.workshop-actions')),
                fadeEnabled: document.getElementById('workshop-fade-toggle').checked,
                fadeControlsVisible: visible(document.getElementById('workshop-fade-controls')),
                scrollTop: panel.scrollTop,
                canvas: { top: canvasBounds.top, bottom: canvasBounds.bottom },
                panel: { top: panelBounds.top, bottom: panelBounds.bottom },
                previewParent: preview.parentElement.className,
                sameRenderer: game.previewRenderer === window.__workshopRenderer,
                sameGl: game.previewRenderer.gl === window.__workshopGl,
                particles: game.previewParticleSystem.getTotalActiveParticles() };
        });
        assert(state.mode === 'editor' && state.panelMode === 'editor' && !state.hidden && state.previewActive
            && !state.collectionOpen && state.canvasVisible && state.nameVisible && state.layersVisible && state.actionsVisible,
        `${label}: editor lost its preview or controls: ${JSON.stringify(state)}`);
        assert(state.sameRenderer && state.sameGl, `${label}: navigation replaced the preview WebGL context`);
        assert(state.particles > 0, `${label}: the preview engine did not produce particles`);
        if (fade) assert(state.step === 'colors' && state.fadeEnabled && state.fadeControlsVisible,
            `${label}: selecting the recipe lost Colors or its fade controls: ${JSON.stringify(state)}`);
        if (inPanel) assert(state.scrollTop === 0 && state.canvas.top >= state.panel.top
            && state.canvas.bottom <= state.panel.bottom,
        `${label}: returning from the scrolled collection did not reveal the preview: ${JSON.stringify(state)}`);
        results.push({ label, particles: state.particles, contextReused: true });
    };
    const selectSaved = async label => {
        await page.locator('[data-workshop-mode="collection"]').click();
        await settle();
        const mobile = await page.evaluate(() => matchMedia('(max-width: 700px)').matches);
        if (mobile) assert(await page.evaluate(() => !game.previewActive && document.getElementById('creator-scene').hidden),
            `${label}: mobile Mine did not stop and hide the editor preview`);
        const saved = page.locator(`[data-saved-recipe="${recipeIndex}"]`);
        await saved.scrollIntoViewIfNeeded();
        if (mobile) assert(await page.locator('.workshop-panel').evaluate(panel => panel.scrollTop) > 100,
            `${label}: the collection was not scrolled far enough to exercise the regression`);
        await saved.click();
        await editor(label, { inPanel: mobile });
    };

    await editor('mobile initial editor');
    await selectSaved('mobile Mine → saved recipe → editor');
    await page.screenshot({ path: join(screenshots, 'mobile-colors-restored.png'), animations: 'disabled' });
    await page.locator('[data-workshop-mode="collection"]').click();
    await page.locator('[data-workshop-mode="editor"]').click();
    await editor('mobile explicit editor button', { inPanel: true });

    await page.locator('.workshop-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await editor('mobile scrolled controls');
    await page.locator('.workshop-panel').evaluate(panel => { panel.scrollTop = 0; });
    await page.locator('#recipes-content .sheet-handle').click();
    await editor('mobile full sheet');
    const handle = await page.locator('#recipes-content .sheet-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    await editor('mobile sheet drag');

    await page.locator('#recipes-content .panel-close').click();
    await page.waitForFunction(() => !document.getElementById('recipes-content').classList.contains('active'));
    assert(await page.evaluate(() => !game.previewActive && document.getElementById('creator-scene').hidden),
        'Closing the workshop left the preview running.');
    await page.evaluate(() => game.ui.showTab('recipes'));
    await editor('mobile reopen');

    for (const viewport of [{ width: 320, height: 568 }, { width: 640, height: 360 },
        { width: 1440, height: 900 }, { width: 701, height: 844 }, { width: 700, height: 844 },
        { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const prefix = `${viewport.width}x${viewport.height}`;
        await editor(`${prefix} resize`);
        await selectSaved(`${prefix} Mine → saved recipe → editor`);
        const location = await page.evaluate(() => {
            const parent = document.getElementById('creator-scene').parentElement;
            return { panel: parent.classList.contains('workshop-panel'), body: parent === document.body };
        });
        assert(viewport.width <= 700 ? location.panel : location.body,
            `${prefix}: preview was not moved to the correct mobile/desktop container: ${JSON.stringify(location)}`);
    }

    await page.locator('#randomize-recipe').click();
    await editor('shuffle keeps editor preview', { fade: false });
    await page.locator('#recipe-name').fill('Shuffled preview regression');
    const countBeforeShuffleSave = await page.evaluate(() => game.recipes.length);
    await page.locator('#save-recipe').click();
    assert(await page.evaluate(() => game.recipes.length) === countBeforeShuffleSave + 1,
        'Save stopped working after restoring and shuffling the editor.');
    await editor('save after shuffle keeps editor preview', { fade: false });
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, checks: results.length, screenshots, results, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
