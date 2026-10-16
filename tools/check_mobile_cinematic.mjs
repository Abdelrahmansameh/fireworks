#!/usr/bin/env node
// Exercise the real first crowd unlock while browser animation frames keep the
// mobile chrome controller running alongside the cinematic camera.
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
const screenshots = join('traces', 'mobile-cinematic');
await mkdir(screenshots, { recursive: true });
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
url.searchParams.delete('bot');
const cases = [
    ...[{ width: 390, height: 844 }, { width: 320, height: 568 },
        { width: 640, height: 360 }, { width: 700, height: 900 }]
        .map(viewport => ({ viewport, deviceScaleFactor: 1 })),
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
        resize: { width: 640, height: 360 } },
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
        resize: { width: 844, height: 390 } },
    { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, desktop: true },
];

try {
    for (const fixture of cases) {
        const label = `${fixture.viewport.width}x${fixture.viewport.height}@${fixture.deviceScaleFactor}`
            + (fixture.resize ? `-rotate-${fixture.resize.width}x${fixture.resize.height}` : '');
        const page = await browser.newPage({ viewport: fixture.viewport,
            deviceScaleFactor: fixture.deviceScaleFactor });
        page.on('pageerror', error => errors.push(`${label}: ${error}`));
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.game?.chrome && game.crowd?.instancedGroup && !game._isRestoring);
        const initial = await page.evaluate(({ desktop }) => {
            game.pause();
            game.hasSeenFirstCrowdCinematic = false;
            game.fireworkSystem.fireworkCount = 20;
            game.checkUnlockConditions();
            game.resourceManager.resources.sparkles.amount = 2000;
            game.resourceManager.resources.gold.amount = 0;
            for (const id of ['base_mult_1', 'unlock_recipes_tab', 'auto_launcher', 'launcher_spawn_rate']) {
                if (!game.buyUpgrade(id)) throw new Error(`Could not buy ${id}`);
            }
            for (let i = 0; i < 3; i++) {
                if (!game.buildingManager.buyBuilding('AUTO_LAUNCHER')) throw new Error('Could not buy a launcher');
            }
            // Keep the purchased launchers in the real unlock flow, but isolate
            // the scripted rocket from unrelated automatic firework launches.
            for (const launcher of game.buildingManager.getBuildingsByType('AUTO_LAUNCHER')) launcher.accumulator = -1e6;
            game.ui.showTab('upgrades');
            const camera = game.renderer2D;
            const check = window.__cinematicCheck = { desktop, originalX: camera.cameraX,
                frames: 0, stableShotFrames: 0, walkingShotFrames: 0, rocketFrames: 0,
                coins: [], launches: [], failures: [], maxChromeCameraChange: 0,
                maxFramingError: 0, minBodyClearance: Infinity, minRocketClearance: Infinity,
                minWalkingHeight: Infinity, minCoinClearance: Infinity, coinFrames: 0 };
            const recordFailure = message => {
                if (check.failures.length < 6) check.failures.push(message);
            };
            const coinDrop = game.crowd.onCoinDrop;
            game.crowd.onCoinDrop = (amount, source) => {
                check.coins.push({ amount, source, playing: game.cinematicManager.isPlaying,
                    exploded: check.firework?.exploded ?? false });
                coinDrop(amount, source);
            };
            const launch = game.fireworkSystem.launch.bind(game.fireworkSystem);
            game.fireworkSystem.launch = (...args) => {
                launch(...args);
                if (!game.cinematicManager.isPlaying) return;
                check.launches.push({ x: args[0], y: args[1], targetY: args[3], tilt: args[4] ?? null });
                check.firework = game.fireworkSystem.fireworks.at(-1);
                const firework = check.firework;
                const explode = firework.explode.bind(firework);
                firework.explode = () => {
                    check.burstWorld = { x: firework.rocket.position.x, y: firework.rocket.position.y };
                    explode();
                };
            };
            check.sample = () => {
                const cm = game.cinematicManager;
                const r = game.renderer2D;
                const person = game.crowd.people[0];
                const rect = r.canvas.getBoundingClientRect();
                const clearance = point => Math.min(point.x - rect.left, rect.right - point.x,
                    point.y - rect.top, rect.bottom - point.y);
                check.frames++;
                if (cm.isPlaying && !desktop) {
                    const ui = getComputedStyle(document.getElementById('ui-root'));
                    if (!document.body.classList.contains('cinematic-active') || ui.visibility !== 'hidden'
                        || ui.pointerEvents !== 'none') recordFailure(`Mobile chrome is interactive/visible during frame ${check.frames}`);
                    if (!game.isInputDisabled || !game.hideFloatingSparkles) recordFailure('Cinematic input and floating rewards were not suspended');
                }
                // Stable following and arrival shots must keep the whole fan
                // visible, and read exactly the camera the framing callback owns.
                if (cm.isPlaying && person && !cm._zoomTween && cm._cameraFraming && !desktop
                    && document.querySelector('.tab-content.active')?.id !== 'crowd-content') {
                    const target = cm._cameraFraming();
                    const framingError = Math.max(Math.abs(r.cameraX - target.x),
                        Math.abs(r.cameraY - target.y), Math.abs(r.cameraZoom - target.zoom));
                    check.maxFramingError = Math.max(check.maxFramingError, framingError);
                    if (framingError > .01) recordFailure(`Camera differs from cinematic framing by ${framingError}`);
                    const grabbed = game.crowd.grabbedPersonIndex;
                    game.crowd.grabbedPersonIndex = 0;
                    const outline = game.crowd.getGrabbedPersonOutlinePoints();
                    game.crowd.grabbedPersonIndex = grabbed;
                    if (outline?.length) {
                        const pixels = outline.map(point => r.worldToScreen(point.x, point.y));
                        const minClearance = Math.min(...pixels.map(clearance));
                        check.minBodyClearance = Math.min(check.minBodyClearance, minClearance);
                        if (minClearance < 8) recordFailure(`Fan outline is clipped: ${minClearance}px at ${rect.width}x${rect.height}`);
                        if (person.state === 'walking') {
                            const height = Math.max(...pixels.map(point => point.y)) - Math.min(...pixels.map(point => point.y));
                            check.minWalkingHeight = Math.min(check.minWalkingHeight, height);
                        }
                    }
                    if (person.coinAnimTimer > 0) {
                        // Include the detached animated coin, which is rendered
                        // in the fan's preallocated prop instances.
                        const group = game.crowd.instancedGroup;
                        let minClearance = Infinity;
                        for (let i = 0; i < game.crowd.totalPartsPerPerson; i++) {
                            const base = (person.instanceBaseIndex + i) * group.instanceStrideFloats;
                            const data = group.instanceData;
                            const halfWidth = Math.abs(data[base + 3]) / 2;
                            const halfHeight = Math.abs(data[base + 4]) / 2;
                            if (halfWidth === 0 || halfHeight === 0 || data[base + 8] === 0) continue;
                            const cos = Math.cos(data[base + 2]), sin = Math.sin(data[base + 2]);
                            for (const dx of [-halfWidth, halfWidth]) for (const dy of [-halfHeight, halfHeight]) {
                                const pixel = r.worldToScreen(data[base] + dx * cos - dy * sin,
                                    data[base + 1] + dx * sin + dy * cos);
                                minClearance = Math.min(minClearance, clearance(pixel));
                            }
                        }
                        check.minCoinClearance = Math.min(check.minCoinClearance, minClearance);
                        check.coinFrames++;
                        if (minClearance < 8) recordFailure(`Fan or tossed coin is clipped: ${minClearance}px`);
                    }
                    check.stableShotFrames++;
                    if (person.state === 'walking') check.walkingShotFrames++;
                    if ((check.firework?.rocket || check.burstWorld) && person.cinematicLookFn) {
                        const position = check.firework.rocket?.position ?? check.burstWorld;
                        const pixel = r.worldToScreen(position.x, position.y);
                        const minClearance = clearance(pixel);
                        check.minRocketClearance = Math.min(check.minRocketClearance, minClearance);
                        if (minClearance < 8) recordFailure(`Cinematic rocket/burst is clipped: ${JSON.stringify(pixel)}`);
                        check.rocketFrames++;
                    }
                }
            };
            check.advanceTo = async (milestone, maxSteps = 6000) => {
                const reached = () => {
                    const cm = game.cinematicManager;
                    const person = game.crowd.people[0];
                    if (milestone === 'follow') return person?.state === 'walking'
                        && (cm.followedEntity === person || (!desktop && cm._cameraFraming)) && !cm._zoomTween;
                    if (milestone === 'arrival') return person?.cinematicIdle && !cm._zoomTween;
                    if (milestone === 'launch') return !!check.firework;
                    if (milestone === 'burst') return !!check.firework?.exploded;
                    if (milestone === 'coin') return check.coins.length > 0 && person?.coinAnimTimer > 0
                        && cm.isPlaying && !cm._zoomTween;
                    if (milestone === 'finish') return game.hasSeenFirstCrowdCinematic && !cm.isPlaying
                        && document.querySelector('.tab-content.active')?.id === 'crowd-content';
                    throw new Error(`Unknown milestone: ${milestone}`);
                };
                for (let step = 0; step < maxSteps; step++) {
                    if (step % 6 === 0) {
                        const r = game.renderer2D;
                        const before = [r.cameraX, r.cameraY, r.cameraZoom];
                        const playing = game.cinematicManager.isPlaying;
                        await new Promise(resolve => requestAnimationFrame(resolve));
                        const after = [r.cameraX, r.cameraY, r.cameraZoom];
                        if (playing && game.cinematicManager.isPlaying) {
                            const change = Math.max(...after.map((value, i) => Math.abs(value - before[i])));
                            check.maxChromeCameraChange = Math.max(check.maxChromeCameraChange, change);
                            if (change > .001) recordFailure(`Chrome changed the cinematic camera during browser frame: ${change}`);
                        }
                    }
                    game.elapsedGameTime += 1 / 60;
                    game._stepSimulation(1 / 60);
                    await Promise.resolve();
                    await Promise.resolve();
                    check.sample();
                    if (reached()) { game.render(); return; }
                }
                throw new Error(`Timed out advancing to ${milestone}; ${JSON.stringify({
                    playing: game.cinematicManager.isPlaying, person: game.crowd.people[0]?.state,
                    launches: check.launches.length, failures: check.failures })}`);
            };
            if (!game.buyUpgrade('crowd_spark_1')) throw new Error('Could not invite the crowd');
            game.ui.dismissNotification();
            return { gold: game.resourceManager.resources.gold.amount,
                crowdUnlocked: game.crowdUnlocked, recipes: game.progression.isUnlocked('recipes_tab'),
                burst: game.recipes.some(recipe => recipe.name === 'Burst' && recipe.components[0].pattern === 'burst'),
                originalX: check.originalX };
        }, { desktop: !!fixture.desktop });
        assert(initial.gold === 0 && initial.crowdUnlocked && initial.recipes && initial.burst,
            `${label}: real crowd unlock did not start cleanly: ${JSON.stringify(initial)}`);

        await page.evaluate(() => window.__cinematicCheck.advanceTo('follow'));
        await page.screenshot({ path: join(screenshots, `${label}-follow.png`) });
        if (fixture.resize) {
            await page.setViewportSize(fixture.resize);
            // A normal update reads the new CSS canvas extent immediately.
            await page.evaluate(async () => {
                await new Promise(resolve => requestAnimationFrame(resolve));
                game._stepSimulation(1 / 60);
                await Promise.resolve();
                window.__cinematicCheck.sample();
                game.render();
            });
        }
        await page.evaluate(() => window.__cinematicCheck.advanceTo('arrival'));
        const arrival = await page.evaluate(() => ({ zoom: game.renderer2D.cameraZoom,
            fan: { x: game.crowd.people[0].x, y: game.crowd.people[0].y },
            gold: game.resourceManager.resources.gold.amount }));
        assert(arrival.gold === 0, `${label}: crowd paid gold before the cinematic firework`);
        if (fixture.desktop) assert(Math.abs(arrival.zoom - 1.5) < .00001,
            `Desktop close shot changed: ${JSON.stringify(arrival)}`);
        await page.screenshot({ path: join(screenshots, `${label}-arrival.png`) });

        await page.evaluate(() => window.__cinematicCheck.advanceTo('launch'));
        await page.evaluate(() => window.__cinematicCheck.advanceTo('burst'));
        const burst = await page.evaluate(() => {
            const check = window.__cinematicCheck;
            return { screen: game.renderer2D.worldToScreen(check.burstWorld.x, check.burstWorld.y),
                world: check.burstWorld,
                camera: { x: game.renderer2D.cameraX, y: game.renderer2D.cameraY, zoom: game.renderer2D.cameraZoom },
                coins: check.coins.length, viewport: { width: innerWidth, height: innerHeight } };
        });
        assert(burst.coins === 0, `${label}: crowd paid gold before its first firework exploded`);
        if (!fixture.desktop) assert(burst.screen.x >= 16 && burst.screen.x <= burst.viewport.width - 16
            && burst.screen.y >= 16 && burst.screen.y <= burst.viewport.height - 16,
        `${label}: burst is outside the mobile shot: ${JSON.stringify(burst)}`);
        // Allow the first particle expansion to be visible in the captured shot.
        await page.evaluate(async () => {
            for (let i = 0; i < 12; i++) {
                game._stepSimulation(1 / 60);
                await Promise.resolve();
                window.__cinematicCheck.sample();
            }
            game.render();
        });
        await page.screenshot({ path: join(screenshots, `${label}-burst.png`) });
        await page.evaluate(() => window.__cinematicCheck.advanceTo('coin'));
        await page.evaluate(async () => {
            for (let i = 0; i < 18; i++) {
                game._stepSimulation(1 / 60);
                await Promise.resolve();
                window.__cinematicCheck.sample();
            }
            game.render();
        });
        await page.screenshot({ path: join(screenshots, `${label}-coin.png`) });
        await page.evaluate(() => window.__cinematicCheck.advanceTo('finish'));
        const finished = await page.evaluate(async () => {
            const check = window.__cinematicCheck;
            // Chrome resumes its panel framing once the sequence gives up control.
            for (let i = 0; i < 48; i++) await new Promise(resolve => requestAnimationFrame(resolve));
            const r = game.renderer2D;
            const ui = getComputedStyle(document.getElementById('ui-root'));
            const expected = game.chrome.getCameraFraming?.();
            return { frames: check.frames, stableShotFrames: check.stableShotFrames,
                walkingShotFrames: check.walkingShotFrames, rocketFrames: check.rocketFrames,
                minBodyClearance: check.minBodyClearance, minRocketClearance: check.minRocketClearance,
                minWalkingHeight: check.minWalkingHeight, minCoinClearance: check.minCoinClearance,
                coinFrames: check.coinFrames,
                maxFramingError: check.maxFramingError, maxChromeCameraChange: check.maxChromeCameraChange,
                coins: check.coins, launches: check.launches, failures: check.failures,
                camera: { x: r.cameraX, y: r.cameraY, zoom: r.cameraZoom }, expected,
                uiVisible: ui.visibility !== 'hidden', activeClass: document.body.classList.contains('cinematic-active'),
                activePanel: document.querySelector('.tab-content.active')?.id,
                panelScroll: document.querySelector('#crowd-content .panel').scrollTop,
                coinBlocked: game.crowd.people[0].cinematicCoinTossDisabled,
                inputDisabled: game.isInputDisabled, rewardsHidden: game.hideFloatingSparkles,
                gold: game.resourceManager.resources.gold.amount,
                earnedGold: game.statsTracker.sessionGoldBySource.crowd ?? 0 };
        });
        assert(finished.failures.length === 0, `${label}: ${finished.failures.join('; ')}`);
        assert(finished.coins.filter(coin => coin.playing).length === 1
            && finished.coins[0].exploded && finished.coins[0].source === 'crowd',
        `${label}: introduction did not make exactly one scripted toss after its burst: ${JSON.stringify(finished.coins)}`);
        assert(finished.gold === finished.earnedGold && finished.gold === finished.coins.reduce((sum, coin) => sum + coin.amount, 0),
            `${label}: introduction granted extra gold`);
        assert(finished.launches.length === 1, `${label}: expected one scripted firework: ${JSON.stringify(finished.launches)}`);
        assert(finished.uiVisible && !finished.activeClass && !finished.coinBlocked && !finished.inputDisabled
            && !finished.rewardsHidden && finished.activePanel === 'crowd-content' && finished.panelScroll === 0,
        `${label}: cinematic failed to restore the crowd purchase UI: ${JSON.stringify(finished)}`);
        assert(Math.abs(finished.camera.x - initial.originalX) < (fixture.desktop ? 80 : 1),
            `${label}: camera did not return to its original X: ${JSON.stringify(finished.camera)}`);
        if (!fixture.desktop) {
            assert(finished.stableShotFrames > 20 && finished.walkingShotFrames > 20 && finished.rocketFrames > 20,
                `${label}: regression did not sample all mobile shots: ${JSON.stringify(finished)}`);
            const finalHeight = fixture.resize?.height ?? fixture.viewport.height;
            assert(finished.minWalkingHeight >= Math.min(75, finalHeight * .13) && finished.coinFrames > 20,
                `${label}: close fan shot is too small or the coin arc was not sampled: ${JSON.stringify(finished)}`);
            const handbackZoom = (fixture.resize?.width ?? fixture.viewport.width) <= 700 ? .85 : 1;
            assert(Math.abs(finished.camera.zoom - handbackZoom) < .00001,
                `${label}: camera did not return to ${handbackZoom} zoom for the final viewport`);
            assert(finished.launches[0].tilt === 0, `${label}: mobile cinematic rocket is randomly tilted`);
            assert(!finished.expected || Math.abs(finished.camera.y - finished.expected.y) < 1,
                `${label}: mobile camera did not hand back to crowd panel framing: ${JSON.stringify(finished)}`);
        } else assert(Math.abs(finished.camera.zoom - 1) < .00001, 'Desktop camera did not return to normal zoom');
        results.push({ label, arrivalZoom: +arrival.zoom.toFixed(3), burst: burst.screen,
            frames: finished.frames, walkingFrames: finished.walkingShotFrames,
            bodyClearance: Number.isFinite(finished.minBodyClearance) ? +finished.minBodyClearance.toFixed(1) : null,
            rocketClearance: Number.isFinite(finished.minRocketClearance) ? +finished.minRocketClearance.toFixed(1) : null,
            walkingBodyHeight: Number.isFinite(finished.minWalkingHeight) ? +finished.minWalkingHeight.toFixed(1) : null,
            coinClearance: Number.isFinite(finished.minCoinClearance) ? +finished.minCoinClearance.toFixed(1) : null,
            chromeCameraChange: finished.maxChromeCameraChange, scriptedCoins: finished.coins.length,
            restoredZoom: finished.camera.zoom });
        console.log(`Passed ${label}`);
        await page.close();
    }
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    console.log(JSON.stringify({ passed: true, checks: results.length, results, screenshots, browserErrors: errors }, null, 2));
} finally { await browser.close(); }
