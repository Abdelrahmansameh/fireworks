// Real touch interaction and camera limits for an expanding mobile venue.
// Run against a local server, e.g. node tools/check_mobile_pan.mjs http://127.0.0.1:8765/.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
url.searchParams.set('bot', '1'); // Each browser context has isolated game storage.
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const errors = [];
const results = [];

try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 640, height: 360 }]) {
        const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: viewport.width === 390 ? 3 : 1 });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(String(error)));
        await page.goto(url.href);
        await page.waitForFunction(() => window.game?.chrome && !game._isRestoring);
        await page.evaluate(() => game.pause());
        const cdp = await context.newCDPSession(page);
        const point = (x, y) => ({ x: Math.round(x), y: Math.round(y), id: 1 });
        const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
        const dimensions = () => page.viewportSize();
        const swipe = async (direction, cancel = false) => {
            const { width, height } = dimensions();
            const y = height * .37;
            const from = width * (direction === 'right' ? .85 : .15);
            const to = width * (direction === 'right' ? .15 : .85);
            await touch('touchStart', [point(from, y)]);
            // Move immediately, without the desktop hold delay.
            await touch('touchMove', [point(to, y)]);
            await touch(cancel ? 'touchCancel' : 'touchEnd', []);
        };
        const state = () => page.evaluate(() => {
            const r = game.renderer2D, bounds = game.getVenueCameraBounds(), visible = r.getVisibleWorldBounds();
            return { x: r.cameraX, zoom: r.cameraZoom, bounds, visible, fireworks: game.fireworkSystem.fireworkCount };
        });
        const settle = async () => {
            await page.waitForFunction(() => Math.abs(game.renderer2D.cameraZoom - game.chrome.cameraDesiredZoom) < .001);
            await page.waitForTimeout(150);
        };
        await settle();
        const opening = await state();
        await swipe('right');
        const afterOpeningSwipe = await state();
        assert(Math.abs(afterOpeningSwipe.x - opening.x) < .1 && afterOpeningSwipe.fireworks === opening.fireworks,
            `${JSON.stringify(viewport)}: opening swipe moved the fixed view or fired a rocket`);
        const { width, height } = dimensions();
        const tap = point(width * .5, height * .37);
        await touch('touchStart', [tap]);
        await touch('touchEnd', []);
        assert((await state()).fireworks === opening.fireworks + 1, `${JSON.stringify(viewport)}: tap did not launch a firework`);
        const beforeCancel = await state();
        await touch('touchStart', [tap]);
        await touch('touchCancel', []);
        assert((await state()).fireworks === beforeCancel.fireworks, `${JSON.stringify(viewport)}: cancelled touch launched a firework`);

        for (const count of [7, 32]) {
            await page.evaluate(count => {
                const bm = game.buildingManager;
                while (bm.getBuildingsByType('PORTAL').length < count) {
                    bm.createBuilding('PORTAL', bm.getNewBuildingX('PORTAL'), -435);
                }
                game.pendingVenueFocusX = null;
                game.cameraTargetX = null;
            }, count);
            if (viewport.width === 390 && count === 7) {
                // Pinching during a milestone reveal must start at the current
                // on-screen zoom and cancel the automatic transition.
                await page.waitForTimeout(600);
                const before = await page.evaluate(() => ({ zoom: game.renderer2D.cameraZoom,
                    automatic: !!game.chrome.cameraAutoZoom, fireworks: game.fireworkSystem.fireworkCount }));
                const a = point(width * .4, height * .37);
                const b = { ...point(width * .6, height * .37), id: 2 };
                const movedA = point(width * .3, height * .37);
                const movedB = { ...point(width * .7, height * .37), id: 2 };
                await touch('touchStart', [a, b]);
                await touch('touchMove', [movedA, movedB]);
                await touch('touchEnd', []);
                const after = await page.evaluate(() => ({ desired: game.chrome.cameraDesiredZoom,
                    automatic: !!game.chrome.cameraAutoZoom, fireworks: game.fireworkSystem.fireworkCount }));
                assert(before.automatic && !after.automatic && after.desired > before.zoom
                    && after.fireworks === before.fireworks,
                `Pinch did not interrupt the automatic zoom from the visible view: ${JSON.stringify({ before, after })}`);
                await page.evaluate(() => game.chrome.setPlayerZoom(game.getVenueCameraBounds().wideZoom));
            }
            await settle();
            for (const which of ['wideZoom', 'closeZoom']) {
                await page.evaluate(which => game.chrome.setPlayerZoom(game.getVenueCameraBounds()[which]), which);
                await settle();
                let before = await state();
                for (let i = 0; i < 64; i++) await swipe('right');
                let atRight = await state();
                const viewWidth = atRight.visible.right - atRight.visible.left;
                const worldWidth = atRight.bounds.right - atRight.bounds.left;
                const expectedRightX = worldWidth <= viewWidth ? (atRight.bounds.left + atRight.bounds.right) / 2
                    : atRight.bounds.right - viewWidth / 2;
                assert(Math.abs(atRight.x - expectedRightX) < 1,
                    `${JSON.stringify(viewport)}: ${count} portals ${which} right edge is wrong: ${JSON.stringify(atRight)}`);
                assert(atRight.fireworks === before.fireworks, `${JSON.stringify(viewport)}: swiping fired a rocket`);
                for (let i = 0; i < 64; i++) await swipe('left');
                let atLeft = await state();
                const expectedLeftX = worldWidth <= viewWidth ? (atLeft.bounds.left + atLeft.bounds.right) / 2
                    : atLeft.bounds.left + viewWidth / 2;
                assert(Math.abs(atLeft.x - expectedLeftX) < 1,
                    `${JSON.stringify(viewport)}: ${count} portals ${which} left edge is wrong: ${JSON.stringify(atLeft)}`);
                assert(atLeft.fireworks === before.fireworks, `${JSON.stringify(viewport)}: swiping at edge fired a rocket`);
                await swipe('right', true);
                assert((await state()).fireworks === before.fireworks, `${JSON.stringify(viewport)}: cancelling a swipe fired a rocket`);
                results.push({ viewport, portals: count, zoom: which, left: +expectedLeftX.toFixed(1), right: +expectedRightX.toFixed(1) });
            }
        }
        // Starting a pinch while grabbing a fan must cancel the grab, not throw them.
        if (viewport.width === 390) {
            await page.evaluate(() => {
                game.crowd.setCount(1);
                const person = game.crowd.people[0];
                const pos = game.screenToWorld(innerWidth * .5, innerHeight * .37);
                Object.assign(person, { x: pos.x, y: pos.y, state: 'cheering', vx: 0, vy: 0 });
            });
            const a = point(width * .5, height * .37);
            const moved = point(width * .55, height * .37);
            const b = { ...point(width * .75, height * .37), id: 2 };
            await touch('touchStart', [a]);
            assert(await page.evaluate(() => game.crowd.grabbedPersonIndex === 0), 'Touch failed to grab the fan fixture');
            await page.waitForTimeout(20);
            await touch('touchMove', [moved]);
            await touch('touchStart', [moved, b]);
            await touch('touchEnd', []);
            const fan = await page.evaluate(() => ({ index: game.crowd.grabbedPersonIndex,
                state: game.crowd.people[0].state, vx: game.crowd.people[0].vx, vy: game.crowd.people[0].vy }));
            assert(fan.index === -1 && fan.state === 'falling' && fan.vx === 0 && fan.vy === 0,
                `Pinch threw the grabbed fan: ${JSON.stringify(fan)}`);
        }
        // A live orientation change must use the new view width and remain inside the same world.
        await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await settle();
        for (let i = 0; i < 64; i++) await swipe('right');
        const rotated = await state();
        const visibleWidth = rotated.visible.right - rotated.visible.left;
        const worldWidth = rotated.bounds.right - rotated.bounds.left;
        const expected = worldWidth <= visibleWidth ? (rotated.bounds.left + rotated.bounds.right) / 2
            : rotated.bounds.right - visibleWidth / 2;
        assert(Math.abs(rotated.x - expected) < 1, `${JSON.stringify(viewport)}: rotated right edge is wrong: ${JSON.stringify(rotated)}`);
        await context.close();
    }
    assert(!errors.length, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, cases: results }, null, 2));
} finally {
    await browser.close();
}
