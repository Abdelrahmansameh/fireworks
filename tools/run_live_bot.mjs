#!/usr/bin/env node
/** Run the actual browser game and its live bot. No GameCore/headless economy is constructed. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, createReadStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`Unexpected argument: ${args[i]}`);
    const name = args[i].slice(2);
    options[name] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
}

if (options.help) {
    console.log('node tools/run_live_bot.mjs [--url http://localhost:8080/] [--preset active|relaxed|idle] [--speed 50] [--max-game-time 3600] [--max-wall-time 600] [--seed 1] [--output traces/live-balance/run] [--headed] [--chrome path]');
    console.log('Without --url, serves this repository on a temporary local port. Bot storage is isolated from the player save.');
    process.exit(0);
}

const preset = options.preset ?? 'active';
if (!['active', 'relaxed', 'idle'].includes(preset)) throw new Error(`Unknown player preset: ${preset}`);
const speed = Math.max(1, Math.min(50, Number(options.speed ?? 50)));
const maxGameTime = Number(options['max-game-time'] ?? 3600);
const maxWallTime = Number(options['max-wall-time'] ?? 600);
if (![speed, maxGameTime, maxWallTime].every(Number.isFinite) || maxGameTime <= 0 || maxWallTime <= 0) throw new Error('Time limits and speed must be positive numbers.');
const seed = Number(options.seed ?? 1);
if (!Number.isFinite(seed)) throw new Error('Seed must be a number.');
const name = options.output ?? join('traces', 'live-balance', `${preset}-seed${seed}`);
const output = resolve(root, name);
await mkdir(dirname(output), { recursive: true });

const modulePaths = [
    'playwright',
    'playwright-core',
    ...(process.env.PLAYWRIGHT_MODULE_PATH ? [process.env.PLAYWRIGHT_MODULE_PATH] : []),
    ...(process.env.CODEX_NODE_MODULES ? [join(process.env.CODEX_NODE_MODULES, 'playwright')] : []),
    join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'),
];
let playwright;
for (const modulePath of modulePaths) {
    try { playwright = require(modulePath); break; } catch { /* Try the next available runtime. */ }
}
if (!playwright) throw new Error('Playwright unavailable. Set PLAYWRIGHT_MODULE_PATH to its package directory or install playwright.');

let server;
let browser;
let page;
const errors = [];
const fatalErrors = [];
const started = Date.now();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

try {
    let url = options.url;
    if (!url) {
        server = createServer(async (request, response) => {
            try {
                const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
                const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
                if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; }
                if (!(await stat(file)).isFile()) { response.writeHead(404); response.end(); return; }
                response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
                createReadStream(file).pipe(response);
            } catch { response.writeHead(404); response.end(); }
        });
        await new Promise(resolveListening => server.listen(0, '127.0.0.1', resolveListening));
        url = `http://127.0.0.1:${server.address().port}/`;
    }
    const gameUrl = new URL(url);
    gameUrl.searchParams.set('bot', '1');
    const browserOptions = {
        headless: !options.headed,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
    };
    const explicitChrome = options.chrome ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (explicitChrome) browserOptions.executablePath = explicitChrome;
    try { browser = await playwright.chromium.launch(browserOptions); }
    catch (originalError) {
        if (explicitChrome) throw originalError;
        const installed = [
            join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ].find(existsSync);
        if (!installed) throw originalError;
        browser = await playwright.chromium.launch({ ...browserOptions, executablePath: installed });
    }
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => { errors.push(String(error)); fatalErrors.push(String(error)); });
    page.on('console', message => { if (message.type() === 'error' && errors.length < 100) errors.push(message.text()); });
    await page.addInitScript(({ seed }) => {
        // Seed the actual game's random choices, including particle flight and catches.
        let state = seed >>> 0;
        Math.random = () => {
            state += 0x6D2B79F5;
            let value = Math.imul(state ^ (state >>> 15), 1 | state);
            value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }, { seed });
    // Audio streams and deferred assets can keep the network busy after the
    // game is ready. Wait for its actual initialized systems instead.
    await page.goto(gameUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.game?.bot && window.game?.particleSystem, { timeout: 30000 });
    const balance = await page.evaluate(async () => {
        const { BUILDING_TYPES, CROWD_CONFIG, DRONE_CONFIG } = await import(new URL('js/config/config.js', document.baseURI).href);
        return {
            upgrades: window.game.progression.getAllUpgradeDefs().map(({ id, name, treeParent, baseCost, costRatio, currency, secondaryCost, maxLevel, requires }) => ({ id, name, treeParent, baseCost, costRatio, currency, secondaryCost, maxLevel, requires })),
            buildings: BUILDING_TYPES,
            crowd: CROWD_CONFIG,
            drones: DRONE_CONFIG,
        };
    });
    await page.evaluate(({ preset, speed }) => {
        const game = window.game;
        const tick = game.bot.tick.bind(game.bot);
        // Pause between actual physics steps so the climax frame can be saved
        // without letting accelerated play skip past the 30-second spectacle.
        game.bot.tick = dt => {
            tick(dt);
            if (!window.__liveBotFinaleCaptured && game.grandFinaleManager.active && game.grandFinaleManager.elapsed >= 15) {
                window.__liveBotFinaleCapture = true;
                window.__liveBotFinaleCaptured = true;
                game.pause();
            }
        };
        window.game.bot.setPreset(preset);
        window.game.bot.setSpeedMultiplier(speed);
        window.game.bot.start();
    }, { preset, speed });
    console.log(`Live browser game started: ${preset}, ${speed}x, seed ${seed}`);
    let report;
    let finaleCapture = null;
    let status = 'running';
    let lastLoggedMinute = -1;
    while (status === 'running') {
        await new Promise(resolveWait => setTimeout(resolveWait, 2000));
        report = await page.evaluate(() => window.game.bot.finalReport ?? window.game.bot.getReport());
        if (await page.evaluate(() => !!window.__liveBotFinaleCapture)) {
            await page.screenshot({ path: `${output}-finale.png`, fullPage: false });
            finaleCapture = { elapsed: report.elapsed, finaleElapsed: await page.evaluate(() => window.game.grandFinaleManager.elapsed), activeParticles: report.activeParticles, launcherFPS: report.launcherFPS, buildings: report.buildings };
            await page.evaluate(() => { window.__liveBotFinaleCapture = false; window.game.resume(); });
        }
        const minute = Math.floor(report.elapsed / 60);
        if (minute !== lastLoggedMinute) {
            console.log(`${minute}m: ${report.buildings.AUTO_LAUNCHER.count} launchers, ${report.launcherFPS.toFixed(2)} launches/s, ${report.sps.toFixed(1)} sparkles/s, ${report.gps.toFixed(1)} gold/s; ${report.goal?.label ?? ''}`);
            lastLoggedMinute = minute;
        }
        if (report.complete) status = 'complete';
        else if (report.elapsed >= maxGameTime) status = 'game-time-limit';
        else if ((Date.now() - started) / 1000 >= maxWallTime) status = 'wall-time-limit';
        else if (fatalErrors.length) status = 'browser-error';
    }
    await page.evaluate(() => window.game.bot.stop());
    await page.screenshot({ path: `${output}.png`, fullPage: false });
    const result = { validation: 'actual-browser-game', status, preset, speed, seed, wallSeconds: (Date.now() - started) / 1000, url: gameUrl.toString(), errors, runtimeErrors: fatalErrors, balance, finaleCapture, ...report };
    await writeFile(`${output}.json`, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`${status}: ${(report.elapsed / 60).toFixed(2)} game minutes; max purchase gap ${report.maxPurchaseGap.toFixed(1)}s`);
    console.log(`Report: ${output}.json`);
    console.log(`Screenshot: ${output}.png`);
    if (status !== 'complete') process.exitCode = 2;
} catch (error) {
    await writeFile(`${output}.error.json`, `${JSON.stringify({ validation: 'actual-browser-game', error: String(error), errors }, null, 2)}\n`);
    throw error;
} finally {
    server?.closeAllConnections();
    await browser?.close();
    if (server) await new Promise(resolveClosed => server.close(resolveClosed));
}
