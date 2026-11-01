// Verify low manual clicks use the same current random height range as launchers.
// Run against a local server, e.g. node tools/check_manual_firework_height.mjs http://127.0.0.1:8765/.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
url.searchParams.set('bot', '1');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url.href);
    await page.waitForFunction(() => window.game?.chrome && !game._isRestoring);
    const results = await page.evaluate(async () => {
        game.pause();
        const { getVenueStage } = await import('/js/config/VenueProgression.js');
        const { GAME_BOUNDS } = await import('/js/config/GameBoundsConfig.js');
        const bm = game.buildingManager;
        const fs = game.fireworkSystem;
        const withRandom = (value, fn) => {
            const old = Math.random;
            try { Math.random = () => value; return fn(); }
            finally { Math.random = old; }
        };
        const launch = (manual, targetY, random) => withRandom(random, () => {
            if (manual) game.launchCursorCyclingFireworkAt(220, targetY);
            else fs.launch(220, GAME_BOUNDS.WORLD_LAUNCHER_Y, game.currentRecipeComponents, null);
            return fs.fireworks.at(-1).targetY;
        });
        const samples = [];
        for (const count of [0, 1, 3, 7, 14, 32]) {
            while (bm.getBuildingsByType('AUTO_LAUNCHER').length < count) {
                bm.createBuilding('AUTO_LAUNCHER', bm.getNewBuildingX('AUTO_LAUNCHER'), GAME_BOUNDS.BUILDING_Y);
            }
            const stage = getVenueStage(game);
            const expectedMax = stage.maxAutomaticExplosionY ?? stage.maxExplosionY;
            const low = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y;
            samples.push({ count, index: stage.index, expectedMax, low,
                manualBottom: launch(true, GAME_BOUNDS.WORLD_LAUNCHER_Y, 0),
                autoBottom: launch(false, null, 0),
                manualTop: launch(true, GAME_BOUNDS.WORLD_LAUNCHER_Y, .999999),
                autoTop: launch(false, null, .999999),
                justBelow: launch(true, -1, .75),
                boundary: launch(true, 0, .75),
                justAbove: launch(true, 1, .75),
                aimed: launch(true, 42, .75),
                directZero: withRandom(.75, () => {
                    fs.launch(220, GAME_BOUNDS.WORLD_LAUNCHER_Y, game.currentRecipeComponents, 0);
                    return fs.fireworks.at(-1).targetY;
                }),
                high: launch(true, 1e9, .75), maxManual: stage.maxExplosionY });
        }
        return samples;
    });
    for (const s of results) {
        const context = `stage ${s.index} (${s.count} launchers)`;
        assert(s.manualBottom === s.autoBottom && Math.abs(s.manualBottom - s.low) < .001,
            `${context}: low manual click and launcher have different lower bounds: ${JSON.stringify(s)}`);
        const expectedTop = s.low + .999999 * (s.expectedMax - s.low);
        assert(Math.abs(s.manualTop - s.autoTop) < .001 && Math.abs(s.manualTop - expectedTop) < .001,
            `${context}: low manual click and launcher have different upper bounds: ${JSON.stringify(s)}`);
        const expectedMiddle = s.low + .75 * (s.expectedMax - s.low);
        assert(Math.abs(s.justBelow - expectedMiddle) < .001 && Math.abs(s.boundary - expectedMiddle) < .001 && s.justAbove === 1,
            `${context}: random/aimed height threshold is wrong: ${JSON.stringify(s)}`);
        assert(s.aimed === 42 && s.directZero === 0 && s.high === s.maxManual,
            `${context}: aimed or maximum manual height changed: ${JSON.stringify(s)}`);
    }
    assert(!errors.length, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, stages: results.map(({ count, index, low, expectedMax }) => ({ count, index, low, expectedMax })) }, null, 2));
} finally { await browser.close(); }
