// Check that the closed mobile tab bar leaves ground objects visible in the real game.
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
const mobileViewports = [{ width: 390, height: 844 }, { width: 360, height: 640 },
    { width: 320, height: 568 }, { width: 700, height: 900 }, { width: 640, height: 360 }];
const screenshots = join('traces', 'mobile-ground');
await mkdir(screenshots, { recursive: true });
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
url.searchParams.delete('bot');

try {
    // A fresh mobile game reserves the navigation space before it is unlocked.
    // Sample each frame from startup through the real unlock handlers to catch a flash.
    for (const { viewport, deviceScaleFactor } of [
        ...mobileViewports.map(viewport => ({ viewport, deviceScaleFactor: 1 })),
        { viewport: mobileViewports[0], deviceScaleFactor: 3 },
    ]) {
        const fresh = await browser.newPage({ viewport, deviceScaleFactor });
        fresh.on('pageerror', error => errors.push(String(error)));
        await fresh.addInitScript(() => {
            window.__mobileBootFrames = [];
            document.addEventListener('DOMContentLoaded', () => {
                const sample = () => {
                    const r = window.game?.renderer2D;
                    if (window.game?.chrome && r) {
                        window.__mobileBootFrames.push({ y: r.cameraY, zoom: r.cameraZoom,
                            ground: r.worldToScreen(r.cameraX, -540).y });
                    }
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
        });
        await fresh.goto(url.toString(), { waitUntil: 'domcontentloaded' });
        await fresh.waitForFunction(() => window.game?.chrome && !game._isRestoring && window.__mobileBootFrames.length >= 6);
        const initial = await fresh.evaluate(async () => {
            game.pause();
            const locked = document.getElementById('tab-list').classList.contains('unlock-hidden');
            const r = game.renderer2D;
            const canvas = r.canvas.getBoundingClientRect();
            const dock = getComputedStyle(document.querySelector('.tab-bar'));
            const expectedGround = canvas.bottom - parseFloat(dock.bottom) - parseFloat(dock.height) - 16
                - 16 * r.canvas.clientHeight / r.virtualHeight;
            const initial = { y: r.cameraY, zoom: r.cameraZoom,
                ground: r.worldToScreen(r.cameraX, -540).y };
            game._handleUnlock('sparkle_counter');
            game._handleUnlock('tab_menu');
            game._handleUnlock('upgrades_tab');
            for (let i = 0; i < 24; i++) await new Promise(resolve => requestAnimationFrame(resolve));
            return { locked, unlocked: !document.getElementById('tab-list').classList.contains('unlock-hidden'),
                expectedGround, initial, frames: window.__mobileBootFrames };
        });
        const label = `${viewport.width}x${viewport.height}@${deviceScaleFactor}: fresh unlock`;
        assert(initial.locked && initial.unlocked, `${label}: the fresh navigation did not transition from locked to unlocked`);
        assert(initial.frames.every(frame => Math.abs(frame.zoom - .85) < .00001
            && Math.abs(frame.ground - initial.expectedGround) < .3
            && Math.abs(frame.y - initial.initial.y) < .3),
        `${label}: startup or unlocking shifted the camera: ${JSON.stringify(initial)}`);
        results.push({ label, frames: initial.frames.length, cameraY: +initial.initial.y.toFixed(2), zoom: initial.initial.zoom });
        await fresh.close();
    }

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.chrome && window.game?.procduralBackground && !game._isRestoring);
    const fixture = await page.evaluate(async () => {
        const { GAME_BOUNDS, CROWD_CONFIG } = await import('/js/config/config.js');
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        game.fireworkSystem.fireworkCount = 50;
        game.checkUnlockConditions();
        game.ui.initializeUnlockStates();
        game.resourceManager.resources.sparkles.amount = 100000;
        game.resourceManager.resources.gold.amount = 100000;
        game.ui.showSparkleCounter();
        game.ui.showTabMenu();
        game.ui.showCollapseButton();
        game.ui.hideActiveTab();
        game.ui.expandAllTabs();
        // Show the complete navigation bar even when a tab is locked in a fresh save.
        document.querySelectorAll('#tab-list .unlock-hidden, #collapse-button.unlock-hidden')
            .forEach(element => element.classList.remove('unlock-hidden'));
        const lowerAnchor = Math.min(GAME_BOUNDS.WORLD_GROUND_Y,
            GAME_BOUNDS.CROWD_Y - CROWD_CONFIG.ySpread, GAME_BOUNDS.WORLD_LAUNCHER_Y);
        window.__groundLauncher = game.buildingManager.createBuilding('AUTO_LAUNCHER', 0, -435,
            { id: 'mobile-ground-fixture', accumulator: 0 });
        window.__groundCheck = { lowerAnchor, previous: null, stable: 0 };
        return { baseline: game.renderer2D.cameraY };
    });
    await page.waitForFunction(() => window.__groundLauncher?._instancedGroup && game.crowd.instancedGroup);
    await page.evaluate(() => {
        window.__groundLauncher._animTimer = 0;
        window.__groundLauncher.update(0);
        game.crowd.setCount(1);
        const person = game.crowd.people[0];
        Object.assign(person, { x: -70, y: -490, spawnX: -70, spawnY: -490,
            state: 'cheering', animTimer: 0, coinTossTimer: 100 });
        game.crowd.update(0);
        game.ui.updateBuildingCounts();
        game.ui.updateBuildingListByType('AUTO_LAUNCHER');
        game.updateUI();
        game.ui.dismissNotification();
        game.render();
    });

    const settle = async () => {
        await page.evaluate(() => { window.__groundCheck.previous = null; window.__groundCheck.stable = 0; });
        await page.waitForFunction(() => {
            const r = game.renderer2D;
            const current = [r.cameraY, r.cameraZoom, document.querySelector('.tab-bar').getBoundingClientRect().top];
            const check = window.__groundCheck;
            const same = check.previous && current.every((value, index) => Math.abs(value - check.previous[index]) < .08);
            check.stable = same ? check.stable + 1 : 0;
            check.previous = current;
            return check.stable >= 6;
        });
    };

    const inspect = async (label, mobile = true) => {
        await settle();
        const state = await page.evaluate(() => {
            game.render();
            const r = game.renderer2D;
            const canvas = r.canvas.getBoundingClientRect();
            const active = document.querySelector('.tab-content.active');
            const tucked = document.getElementById('tab-list').classList.contains('collapsed');
            const ui = [document.querySelector(tucked ? '#show-menu' : '.tab-bar')]
                .filter(element => element && getComputedStyle(element).display !== 'none'
                    && getComputedStyle(element).visibility !== 'hidden')
                .map(element => ({ id: element.id || element.className,
                    top: element.getBoundingClientRect().top }));
            const bottomUiTop = Math.min(canvas.bottom, ...ui.map(element => element.top));
            const ground = r.worldToScreen(r.cameraX, window.__groundCheck.lowerAnchor);
            const sceneAnchor = r.worldToScreen(r.cameraX, -540);
            const dockStyle = getComputedStyle(document.querySelector('.tab-bar'));
            const expectedSceneAnchorY = canvas.bottom - parseFloat(dockStyle.bottom) - parseFloat(dockStyle.height) - 16
                - 16 * r.canvas.clientHeight / r.virtualHeight;
            // Compare to the prior zoom 1 camera while preserving the same ground pixel.
            const previousCameraY = -540 + (expectedSceneAnchorY - canvas.top - canvas.height / 2)
                * r.virtualHeight / r.canvas.clientHeight;
            const previousSkyTop = previousCameraY + r.virtualHeight / 2;
            const world = game.screenToWorld(ground.x, ground.y);
            const savedGrab = game.crowd.grabbedPersonIndex;
            game.crowd.grabbedPersonIndex = 0;
            const outlines = [window.__groundLauncher.getSkeletonOutlinePoints(), game.crowd.getGrabbedPersonOutlinePoints()];
            game.crowd.grabbedPersonIndex = savedGrab;
            const objectBounds = outlines.map(points => {
                const screen = points.map(point => r.worldToScreen(point.x, point.y));
                return { left: Math.min(...screen.map(point => point.x)), right: Math.max(...screen.map(point => point.x)),
                    top: Math.min(...screen.map(point => point.y)), bottom: Math.max(...screen.map(point => point.y)) };
            });
            const walletBottom = document.querySelector('.resource-counter').getBoundingClientRect().bottom;
            const bounds = r.getVisibleWorldBounds();
            // Background rectangles should cover every sampled edge and interior point.
            const rectangles = game.procduralBackground.shapes
                .filter(shape => shape.vertices?.length === 8 && shape.color.a >= .99)
                .map(shape => {
                    const xs = [], ys = [];
                    for (let i = 0; i < shape.vertices.length; i += 2) {
                        xs.push(shape.vertices[i] * shape.scale.x + shape.position.x);
                        ys.push(shape.vertices[i + 1] * shape.scale.y + shape.position.y);
                    }
                    return { left: Math.min(...xs), right: Math.max(...xs),
                        bottom: Math.min(...ys), top: Math.max(...ys) };
                });
            const uncovered = [];
            for (const fx of [0, .25, .5, .75, 1]) for (const fy of [0, .25, .5, .75, 1]) {
                const x = bounds.left + (bounds.right - bounds.left) * fx;
                const y = bounds.bottom + (bounds.top - bounds.bottom) * fy;
                if (!rectangles.some(rect => x >= rect.left - .001 && x <= rect.right + .001
                    && y >= rect.bottom - .001 && y <= rect.top + .001)) uncovered.push({ x, y });
            }
            return { cameraY: r.cameraY, zoom: r.cameraZoom, ground, sceneAnchor,
                expectedSceneAnchorY, previousSkyTop, skyTop: bounds.top,
                bottomUiTop, clearance: bottomUiTop - ground.y,
                canvas: { top: canvas.top, bottom: canvas.bottom }, ui,
                objectBounds, walletBottom, activePanel: active?.id ?? null,
                roundTripError: Math.hypot(world.x - r.cameraX, world.y - window.__groundCheck.lowerAnchor), uncovered };
        });
        if (mobile) {
            assert(!state.activePanel, `${label}: a panel opened during the navigation-bar check`);
            assert(Math.abs(state.zoom - .85) < .00001, `${label}: mobile zoom is not .85: ${JSON.stringify(state)}`);
            assert(Math.abs(state.sceneAnchor.y - state.expectedSceneAnchorY) < .3,
                `${label}: zoom or menu state moved the ground pixel: ${JSON.stringify(state)}`);
            assert(state.skyTop > state.previousSkyTop + 1,
                `${label}: mobile zoom did not expose more sky: ${JSON.stringify(state)}`);
            // Crowd placement runs upward from CROWD_Y. This lower safety anchor
            // also covers a full ySpread below it, so allow four pixels of tolerance.
            assert(state.clearance >= 12, `${label}: ground overlaps bottom UI: ${JSON.stringify(state)}`);
            assert(state.ground.y >= state.canvas.top && state.ground.y < state.canvas.bottom,
                `${label}: ground left the canvas: ${JSON.stringify(state)}`);
            assert(state.objectBounds.every(bounds => bounds.top >= state.walletBottom + 4
                && bounds.bottom <= state.bottomUiTop - 4),
                `${label}: a ground object overlaps the wallet or bottom UI: ${JSON.stringify(state)}`);
        }
        assert(state.roundTripError < .00001, `${label}: input and rendering cameras disagree: ${JSON.stringify(state)}`);
        assert(state.uncovered.length === 0, `${label}: uncovered background: ${JSON.stringify(state.uncovered)}`);
        results.push({ label, clearance: +state.clearance.toFixed(2), cameraY: +state.cameraY.toFixed(2), zoom: state.zoom });
    };

    for (const size of mobileViewports) {
        await page.setViewportSize(size);
        const prefix = `${size.width}x${size.height}`;
        await page.evaluate(() => { game.ui.hideActiveTab(); game.ui.expandAllTabs(); });
        await inspect(`${prefix}: dock`);
        if (size.width === 390 || size.height === 360) {
            await page.screenshot({ animations: 'disabled', path: join(screenshots, `${prefix}-dock.png`) });
        }
        await page.evaluate(() => game.ui.handleCollapseButton());
        await inspect(`${prefix}: tucked`);
        await page.locator('#show-menu').click();
        await inspect(`${prefix}: menu reopened`);
        console.log(`Passed ${prefix}`);
    }

    // Crossing the desktop breakpoint must release the mobile camera correction.
    await page.setViewportSize({ width: 1440, height: 900 });
    await inspect('desktop restore', false);
    const restored = await page.evaluate(() => ({ y: game.renderer2D.cameraY, zoom: game.renderer2D.cameraZoom }));
    assert(Math.abs(restored.y - fixture.baseline) < .4 && Math.abs(restored.zoom - 1) < .00001,
        `Desktop camera failed to restore: ${JSON.stringify(restored)} vs ${fixture.baseline}/1`);

    // Cover camera movement and zoom outside the original sky and ground extent.
    await page.setViewportSize({ width: 2560, height: 1080 });
    for (const camera of [{ x: -1500, y: 0, zoom: .4 }, { x: 4200, y: 0, zoom: .4 },
        { x: 0, y: 5000, zoom: .75 }, { x: 0, y: -5000, zoom: .75 }]) {
        await page.evaluate(camera => game.renderer2D.setCamera(camera), camera);
        await inspect(`background ${JSON.stringify(camera)}`, false);
    }
    await page.screenshot({ animations: 'disabled', path: join(screenshots, 'desktop-lower-safe-zone.png') });
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, checks: results.length, results, screenshots, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
