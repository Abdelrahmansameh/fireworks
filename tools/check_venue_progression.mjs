// Browser integration coverage for the expanding venue. Run against a local server.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const baseUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
baseUrl.searchParams.set('bot', '1'); // isolated memory storage
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const errors = [];
const results = [];

try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 640, height: 360 }]) {
        const context = await browser.newContext({ viewport, hasTouch: true });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(baseUrl.href);
        await page.waitForFunction(() => window.game?.chrome && !game._isRestoring);
        await page.waitForTimeout(300);
        const camera = await page.evaluate(async () => {
            game.pause();
            const frames = n => new Promise(resolve => {
                const values = [];
                function sample() {
                    const r = game.renderer2D;
                    values.push({ x: r.cameraX, zoom: r.cameraZoom, ground: r.worldToScreen(0, -540).y });
                    if (values.length < n) requestAnimationFrame(sample); else resolve(values);
                }
                requestAnimationFrame(sample);
            });
            const sampleFor = durationMs => new Promise(resolve => {
                const values = [];
                let started;
                function sample(now) {
                    started ??= now;
                    const r = game.renderer2D;
                    values.push({ x: r.cameraX, zoom: r.cameraZoom, ground: r.worldToScreen(0, -540).y });
                    if (now - started < durationMs) requestAnimationFrame(sample); else resolve(values);
                }
                requestAnimationFrame(sample);
            });
            const initial = (await frames(5)).at(-1);
            const start = game.getVenueCameraBounds();
            const openingPan = [game.clampCameraX(-1e9), game.clampCameraX(1e9)];
            for (let i = 0; i < 7; i++) {
                const bm = game.buildingManager;
                bm.createBuilding('AUTO_LAUNCHER', bm.getNewBuildingX('AUTO_LAUNCHER'), -435, { id: `test-${i}` });
            }
            const earlyTransition = await sampleFor(800);
            const firstBounds = game.getVenueCameraBounds();
            // A real wheel gesture must start at the visible zoom, not the
            // distant automatic target, and interrupt the slow transition.
            document.getElementById('game-canvas').dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true, deltaY: -100,
                clientX: innerWidth * .5, clientY: innerHeight * .35,
            }));
            const wheelTarget = game.chrome.cameraDesiredZoom;
            const interrupted = await frames(75);
            game.chrome.setPlayerZoom(firstBounds.closeZoom);
            await frames(75);
            for (let i = 7; i < 14; i++) {
                const bm = game.buildingManager;
                bm.createBuilding('AUTO_LAUNCHER', bm.getNewBuildingX('AUTO_LAUNCHER'), -435, { id: `test-${i}` });
            }
            const transition = await sampleFor(4600);
            const bounds = game.getVenueCameraBounds();
            const wide = transition.at(-1);
            game.chrome.setPlayerZoom(bounds.closeZoom);
            const zoomIn = await frames(75);
            const close = zoomIn.at(-1);
            const panMin = game.clampCameraX(-1e9, close.zoom);
            const panMax = game.clampCameraX(1e9, close.zoom);
            game.chrome.setPlayerZoom(bounds.wideZoom);
            const zoomOut = await frames(75);
            const groundDrift = Math.max(...[...earlyTransition, ...interrupted, ...transition, ...zoomIn, ...zoomOut].map(frame => Math.abs(frame.ground - initial.ground)));
            return { initial, start, openingPan, firstBounds, early: earlyTransition.at(-1), wheelTarget, interrupted: interrupted.at(-1), bounds, wide, close, panMin, panMax, groundDrift };
        });
        assert(camera.start.index === 0 && Math.abs(camera.start.wideZoom - camera.start.closeZoom) < 1e-6,
            `${JSON.stringify(viewport)}: opening camera is not fixed`);
        const expectedClose = viewport.width <= 700 ? 1.02 : 1.2;
        assert(Math.abs(camera.initial.zoom - expectedClose) < .001
            && Math.abs(camera.start.closeZoom - expectedClose) < .001
            && Math.abs(camera.openingPan[0] - camera.openingPan[1]) < .01,
        `${JSON.stringify(viewport)}: opening framing or fixed pan bounds are incorrect`);
        assert(camera.early.zoom < camera.initial.zoom - .001
            && camera.early.zoom > camera.firstBounds.wideZoom + (camera.initial.zoom - camera.firstBounds.wideZoom) * .25,
            `${JSON.stringify(viewport)}: automatic zoom completed too quickly: ${JSON.stringify(camera)}`);
        assert(camera.wheelTarget > camera.early.zoom
            && Math.abs(camera.interrupted.zoom - camera.wheelTarget) < .005,
        `${JSON.stringify(viewport)}: wheel zoom did not interrupt from the visible zoom`);
        assert(camera.bounds.index >= 5 && Math.abs(camera.close.zoom - expectedClose) < .001
            && Math.abs(camera.wide.zoom - camera.bounds.wideZoom) < .005
            && camera.wide.zoom < camera.close.zoom - .01,
            `${JSON.stringify(viewport)}: progression did not unlock a zoom range`);
        assert(camera.panMax > camera.panMin + 1, `${JSON.stringify(viewport)}: zoomed camera cannot pan`);
        assert(camera.groundDrift < 1.5, `${JSON.stringify(viewport)}: ground drifted ${camera.groundDrift}px`);
        if (viewport.width === 390) {
            const before = await page.evaluate(() => ({ count: game.fireworkSystem.fireworkCount, zoom: game.chrome.cameraDesiredZoom }));
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 200, id: 1 }, { x: 240, y: 200, id: 2 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 95, y: 200, id: 1 }, { x: 285, y: 200, id: 2 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            const after = await page.evaluate(() => ({ count: game.fireworkSystem.fireworkCount, zoom: game.chrome.cameraDesiredZoom }));
            assert(after.count === before.count && after.zoom > before.zoom, 'Pinching launched a firework or failed to zoom');
            const finale = await page.evaluate(async () => {
                const frames = n => new Promise(resolve => {
                    let elapsed = 0;
                    function tick() {
                        game.updateCameraPosition(1 / 60);
                        if (++elapsed < n) requestAnimationFrame(tick); else resolve();
                    }
                    requestAnimationFrame(tick);
                });
                const bm = game.buildingManager;
                bm.createBuilding('AUTO_LAUNCHER', bm.getNewBuildingX('AUTO_LAUNCHER'), -435, { id: 'focus-test' });
                await frames(200);
                const r = game.renderer2D;
                const visible = r.getVisibleWorldBounds();
                const latest = game.buildingManager.buildings.at(-1).x;
                game.chrome.setPlayerZoom(game.getVenueCameraBounds().closeZoom);
                await frames(100);
                const start = { x: r.cameraX, zoom: r.cameraZoom, ground: r.worldToScreen(0, -540).y };
                game.grandFinaleUnlocked = true;
                const manager = game.grandFinaleManager;
                manager.config = { ...manager.config, durationSec: 2 };
                manager._spawnTowardTarget = () => {};
                const triggered = manager.trigger();
                const shots = [];
                for (let i = 0; i < 4; i++) {
                    manager.update(.5);
                    shots.push({ zoom: r.cameraZoom, ground: r.worldToScreen(0, -540).y });
                }
                await frames(240);
                return { latest, visible, start, triggered, shots, wideZoom: game.getVenueCameraBounds().wideZoom,
                    end: { x: r.cameraX, zoom: r.cameraZoom } };
            });
            assert(finale.latest >= finale.visible.left && finale.latest <= finale.visible.right,
                'A new mobile building was not brought into view');
            assert(finale.triggered && Math.abs(finale.shots.at(-1).zoom - finale.wideZoom) < .001
                && finale.shots.every(shot => Math.abs(shot.ground - finale.start.ground) < 1),
            'Finale did not use the earned overview and preserve the ground');
            assert(Math.abs(finale.end.zoom - finale.start.zoom) < .001 && Math.abs(finale.end.x - finale.start.x) < 1,
                'Finale did not return to the previous view');
        }
        results.push({ viewport, groundDrift: camera.groundDrift, range: [camera.bounds.wideZoom, camera.bounds.closeZoom] });
        await context.close();
    }

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(baseUrl.href);
    await page.waitForFunction(() => window.game?.chrome && !game._isRestoring);
    const state = await page.evaluate(async () => {
        game.pause();
        const { getVenueStage } = await import('/js/config/VenueProgression.js');
        const bm = game.buildingManager, fs = game.fireworkSystem;
        // Exercise the top of each early automatic range deterministically.
        const sampleAutomatic = () => {
            const random = Math.random;
            try {
                Math.random = () => .999999;
                fs.launch(220, -535, game.currentRecipeComponents, null);
                return fs.fireworks.at(-1).targetY;
            } finally { Math.random = random; }
        };
        const earlyAutomatic = [sampleAutomatic()];
        fs.launch(220, -535, game.currentRecipeComponents, 999999);
        const earlyManual = [fs.fireworks.at(-1).targetY];
        const positions = [];
        for (let i = 0; i < 32; i++) {
            const type = 'AUTO_LAUNCHER';
            const x = bm.getNewBuildingX(type);
            positions.push(x);
            bm.createBuilding(type, x, -435, { id: `slot-${i}` });
            if (i === 0 || i === 2) {
                earlyAutomatic.push(sampleAutomatic());
                fs.launch(220, -535, game.currentRecipeComponents, 999999);
                earlyManual.push(fs.fireworks.at(-1).targetY);
            }
        }
        const stage = getVenueStage(game);
        fs.launch(220, -535, game.currentRecipeComponents, 0); const zero = fs.fireworks.at(-1).targetY;
        fs.launch(220, -535, game.currentRecipeComponents, 999999); const high = fs.fireworks.at(-1).targetY;
        fs.launch(220, -535, game.currentRecipeComponents, null); const random = fs.fireworks.at(-1).targetY;
        const catapult = bm.createBuilding('CATAPULT', -1450, -435, { id: 'legacy-catapult' });
        const legacyCatapult = catapult.x;
        const catapultSelectable = bm.getBuildingAt(catapult.x, catapult.y) === catapult;
        game.ui.isDragging = true;
        game.ui.activePointerId = 1;
        game.ui.draggingLauncher = catapult;
        const target = game.renderer2D.worldToScreen(-700, catapult.y);
        game.ui.pointerMoveHandler({ pointerId: 1, clientX: target.x, clientY: target.y, preventDefault() {} });
        game.ui.isDragging = false;
        game.ui.activePointerId = null;
        game.ui.draggingLauncher = null;
        const movedCatapult = catapult.x;
        for (const building of [...bm.buildings]) bm.removeBuilding(building);
        const beforeSave = getVenueStage(game).index;
        const save = game.serializeGameData();
        game.deserializeGameData(save);
        const afterSave = getVenueStage(game).index;
        game.resetGame();
        return { positions, stage, zero, high, random, earlyAutomatic, earlyManual, legacyCatapult, catapultSelectable, movedCatapult,
            beforeSave, afterSave, reset: getVenueStage(game).index };
    });
    assert(new Set(state.positions).size === 32, 'Launcher placement collided');
    assert(state.earlyAutomatic.every((y, i) => y <= [200, 200, 375][i] && y > [199, 199, 374][i])
        && state.earlyManual.every((y, i) => y === [324, 380, 440][i]),
    `Early automatic height limits or manual aiming are incorrect: ${JSON.stringify(state)}`);
    assert(state.stage.index === 8 && state.zero === 0 && state.high === state.stage.maxExplosionY
        && state.random <= state.stage.maxExplosionY, 'Stage or firework height is incorrect');
    assert(state.legacyCatapult === -450, 'Legacy catapult was not moved to the new area');
    assert(state.catapultSelectable && Math.abs(state.movedCatapult + 700) < .1,
        'Catapult cannot be selected and dragged in its new area');
    assert(state.beforeSave === state.afterSave && state.reset === 0, 'Save/import or reset lost venue progress');
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, camera: results, placementSlots: state.positions.length, stage: state.stage.index, errors }, null, 2));
} finally {
    await browser.close();
}
