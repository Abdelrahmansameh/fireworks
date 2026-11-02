#!/usr/bin/env node
// Profile the real rendered game in a disposable Chrome profile (never the player's save).
// node tools/profile_late_game.mjs --scenario=late --mode=timing --seconds=12
// Scenarios: baseline, late, finale, stress (three layers, all shapes, UI max values).
// Modes: observe (frame timings), timing (nested subsystem timings), cpu, trace, gpu.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
}));
const scenario = args.scenario ?? 'late';
const hasFinale = scenario === 'finale' || scenario === 'stress';
const mode = args.mode ?? 'observe';
const variant = args.variant ?? 'normal';
const seconds = Number(args.seconds ?? 12);
const warmup = Number(args.warmup ?? 20);
const seed = Number(args.seed ?? 713);
const output = resolve(args.out ?? `traces/late-game-profile/${scenario}-${mode}-${variant}-${seed}`);
if (!['baseline', 'late', 'finale', 'stress'].includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
if (!['observe', 'timing', 'cpu', 'trace', 'gpu'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
if (!(seconds > 0) || !(warmup >= 0)) throw new Error('seconds must be positive and warmup nonnegative.');
const variants = ['normal', 'no-save', 'no-ui', 'no-profiler', 'no-crowd-animation', 'no-building-animation',
    'no-crowd-scan', 'no-render', 'no-background-draw', 'no-star-draw', 'no-trails', 'no-cursor-outline'];
if (!variants.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
let playwright;
for (const name of ['playwright', process.env.PLAYWRIGHT_MODULE_PATH,
    join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(name); break; } catch { /* Try bundled runtime. */ }
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE_PATH.');
const browser = await playwright.chromium.launch({ headless: args.headed !== true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(({ seed }) => {
        let state = seed >>> 0;
        Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }, { seed });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    const url = new URL(args.url ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot'); // Real localStorage overhead in an isolated browser context.
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && window.game?.crowd?._skeleton);
    const setup = await page.evaluate(async ({ scenario }) => {
        const g = window.game;
        g.pause();
        g.hasSeenFirstCrowdCinematic = true;
        g.gameCompleted = true; // Explicitly trigger the finale only in that scenario.
        if (scenario !== 'baseline') {
            g.cheatUnlockEverything();
            g.elapsedGameTime = 7200;
            g.crowdStartFireworks = 0;
            g.crowdStartedAt = 0;
            g.fireworkSystem.fireworkCount = 100000;
            g.setCultistCount(Infinity);
            for (const type of ['AUTO_LAUNCHER', 'CATAPULT']) {
                const limit = g.buildingManager.getBuildingLimit(type);
                if (!Number.isFinite(limit)) throw new Error(`Missing building limit for ${type}`);
                while (g.buildingManager.getBuildingsByType(type).length < limit) g.grantMilestoneBuilding(type);
            }
            const launchers = g.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
            launchers.forEach((building, index) => {
                building.assignedRecipeIndex = index % g.recipes.length;
                building.accumulator = building.spawnInterval * index / launchers.length;
            });
            g.crowd.setCount(g._calculateTargetCrowdCount(g.fireworkSystem.fireworkCount));
            g.syncCrowdStats();
            g.flyerCount = 6;
            g.crowd.setFlyerCount(g.flyerCount, g.flyerStats);
            if (scenario === 'stress') {
                const { FIREWORK_CONFIG } = await import('/js/config/config.js');
                const originalRecipes = structuredClone(g.recipes);
                g.recipes.forEach((recipe, index) => {
                    recipe.components = Array.from({ length: 3 }, (_, layer) => ({
                        ...originalRecipes[(index + layer) % originalRecipes.length].components[0],
                        shape: FIREWORK_CONFIG.supportedShapes[(index * 3 + layer) % FIREWORK_CONFIG.supportedShapes.length],
                        lifetime: 4, size: 0.7, spread: 1,
                    }));
                });
            }
        }
        g.dismissNotification();
        window.__profileSnapshot = () => ({
            gameSeconds: g.elapsedGameTime,
            particles: g.particleSystem.getTotalActiveParticles(),
            particlesByShape: { ...g.particleSystem.activeCounts },
            rockets: g.fireworkSystem.fireworks.length,
            crowd: g.crowd.people.length,
            crowdStates: g.crowd.people.reduce((all, person) => { all[person.state] = (all[person.state] ?? 0) + 1; return all; }, {}),
            flyers: g.crowd.flyerCount,
            buildings: g.buildingManager.buildings.reduce((all, building) => { all[building.type] = (all[building.type] ?? 0) + 1; return all; }, {}),
            recipes: g.recipes.length,
            patterns: g.unlockedPatternKeys.length,
            finaleActive: g.grandFinaleManager.active,
            finaleSeconds: g.grandFinaleManager.elapsed,
            normalShapes: g.renderer2D.normalShapes.length,
            instanceGroups: g.renderer2D.instancedGroups.length,
            heap: performance.memory?.usedJSHeapSize,
        });
        const gl = g.renderer2D.gl;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { ...window.__profileSnapshot(), launcherStats: g.launcherStats,
            flyerStats: g.flyerStats, catapultStats: g.catapultStats,
            gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            browser: navigator.userAgent,
            localStorage: g.storage === localStorage,
        };
    }, { scenario });
    await page.waitForFunction(() => game.buildingManager.buildings.every(b => b._instancedGroup)
        && game.crowd.instancedGroup && game.crowd.flyerInstancedGroup);
    await page.evaluate(() => game.resume());
    console.log(JSON.stringify({ stage: 'warmup', scenario, mode, variant, warmup, setup }));
    await sleep(warmup * 1000);
    await page.evaluate(async ({ hasFinale, variant }) => {
        const g = window.game;
        if (variant === 'no-save') g.saveProgress = () => {};
        if (variant === 'no-ui') g.updateUI = () => {};
        if (variant === 'no-profiler') {
            for (const method of ['startFrame', 'endFrame', 'startFunction', 'endFunction']) g.profiler[method] = () => {};
        }
        if (variant === 'no-crowd-animation') g.crowd._updateProceduralAnimation = () => {};
        if (variant === 'no-building-animation') {
            for (const b of g.buildingManager.buildings) if (b._renderFrame) b._renderFrame = () => {};
        }
        if (variant === 'no-crowd-scan') g.crowd._scanParticlesForPerson = () => {};
        if (variant === 'no-cursor-outline') g.cursorParticles.setGrabOutline = () => {};
        if (variant === 'no-render') g.renderer2D.drawFrame = () => {};
        if (variant === 'no-background-draw') {
            const background = new Set(g.procduralBackground.shapes);
            g.renderer2D.normalShapes = g.renderer2D.normalShapes.filter(shape => !background.has(shape));
        }
        if (variant === 'no-star-draw') {
            const stars = new Set(g.procduralBackground.twinkleStars.map(star => star.shape));
            g.renderer2D.normalShapes = g.renderer2D.normalShapes.filter(shape => !stars.has(shape));
        }
        if (variant === 'no-trails') {
            const { FIREWORK_CONFIG } = await import('/js/config/config.js');
            FIREWORK_CONFIG.trails.enabled = false;
            FIREWORK_CONFIG.rocketTrails.enabled = false;
        }
        if (hasFinale) g.cheatTriggerGrandFinale();
    }, { hasFinale, variant });
    if (hasFinale) await sleep(8000);
    if (variant === 'no-trails') await sleep(2000); // Let existing trails expire before measurement.
    const cdp = await context.newCDPSession(page);
    if (mode === 'cpu') {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
        await cdp.send('Profiler.start');
    }
    if (mode === 'trace') await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack,disabled-by-default-v8.gc,gpu',
        transferMode: 'ReturnAsStream',
    });
    await page.evaluate(({ mode }) => {
        const g = window.game;
        const recorder = window.__lateGameProfile = { frames: [], snapshots: [], active: true, stack: [], current: null };
        if (mode === 'gpu') {
            const gl = g.renderer2D.gl;
            const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            recorder.gpu = { supported: Boolean(ext), milliseconds: [], disjoint: 0 };
            if (ext) {
                const pending = [];
                const originalDraw = g.renderer2D.drawFrame;
                let frame = 0;
                g.renderer2D.drawFrame = function () {
                    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
                        const query = pending.shift();
                        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) recorder.gpu.milliseconds.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
                        else recorder.gpu.disjoint++;
                        gl.deleteQuery(query);
                    }
                    if (frame++ % 10 !== 0) return originalDraw.call(this);
                    const query = gl.createQuery();
                    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
                    try { return originalDraw.call(this); }
                    finally { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); }
                };
            }
        }
        const wrap = (owner, method, name) => {
            if (typeof owner?.[method] !== 'function') return;
            const original = owner[method];
            owner[method] = function (...args) {
                if (!recorder.active || !recorder.current) return original.apply(this, args);
                const entry = { start: performance.now(), children: 0 };
                recorder.stack.push(entry);
                try { return original.apply(this, args); }
                finally {
                    const duration = performance.now() - entry.start;
                    recorder.stack.pop();
                    const parent = recorder.stack.at(-1);
                    if (parent) parent.children += duration;
                    const stat = recorder.current.functions[name] ??= { total: 0, self: 0, calls: 0 };
                    stat.total += duration;
                    stat.self += duration - entry.children;
                    stat.calls++;
                }
            };
        };
        if (mode === 'timing') {
            for (const [owner, method, name] of [
                [g, 'updateGame', 'simulation'], [g.fireworkSystem, 'update', 'fireworks'],
                [g.particleSystem, 'update', 'particles'],
                [g.buildingManager, 'update', 'buildings'], [g.crowd, 'update', 'crowd'],
                [g.crowd, '_scanParticlesForPerson', 'crowdScan'],
                [g.crowd, '_updateProceduralAnimation', 'crowdAnimation'],
                [g, 'updateUI', 'ui'], [g, 'saveProgress', 'save'],
                [g.procduralBackground, 'update', 'background'],
                [g.grandFinaleManager, 'update', 'finale'],
                [g.statsTracker, 'save', 'saveMetrics'],
                [g.statsTracker, 'getRollingRate', 'metricsRate'],
                [g.renderer2D, 'drawFrame', 'renderer'],
                [g.renderer2D, '_drawNormalShape', 'drawNormal'],
                [g.renderer2D, '_drawInstancedGroup', 'drawInstanced'],
            ]) wrap(owner, method, name);
        }
        const originalUpdate = g.update;
        const originalRender = g.render;
        g.update = function (delta) {
            if (!recorder.active) return originalUpdate.call(this, delta);
            recorder.current = { start: performance.now(), delta, functions: {} };
            const start = performance.now();
            try { return originalUpdate.call(this, delta); }
            finally { recorder.current.update = performance.now() - start; }
        };
        g.render = function () {
            if (!recorder.active || !recorder.current) return originalRender.call(this);
            const start = performance.now();
            try { return originalRender.call(this); }
            finally {
                recorder.current.render = performance.now() - start;
                recorder.current.work = recorder.current.update + recorder.current.render;
                recorder.frames.push(recorder.current);
                recorder.current = null;
                if (recorder.frames.length % 60 === 0) recorder.snapshots.push(window.__profileSnapshot());
            }
        };
        recorder.start = performance.now();
        recorder.initial = window.__profileSnapshot();
    }, { mode });
    console.log(JSON.stringify({ stage: 'recording', scenario, mode, variant, seconds }));
    await sleep(seconds * 1000);
    const data = await page.evaluate(() => {
        const r = window.__lateGameProfile;
        r.end = performance.now();
        r.active = false;
        r.final = window.__profileSnapshot();
        r.final.particlesByType = {};
        const ps = game.particleSystem;
        for (const shape of Object.keys(ps.activeCounts)) {
            for (let i = 0; i < ps.activeCounts[shape]; i++) {
                const type = ps.instanceData[shape][i * ps.strideFloats + ps.particleTypeIdx];
                r.final.particlesByType[type] = (r.final.particlesByType[type] ?? 0) + 1;
            }
        }
        r.final.backgroundShapes = game.procduralBackground.shapes.length;
        r.final.starShapes = game.procduralBackground.twinkleStars.length;
        delete r.current;
        delete r.stack;
        return r;
    });
    if (mode === 'cpu') {
        const { profile } = await cdp.send('Profiler.stop');
        await writeFile(join(output, 'cpu.cpuprofile'), JSON.stringify(profile));
    }
    if (mode === 'trace') {
        const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
        await cdp.send('Tracing.end');
        const { stream } = await completed;
        const chunks = [];
        while (true) {
            const chunk = await cdp.send('IO.read', { handle: stream });
            chunks.push(chunk.data);
            if (chunk.eof) break;
        }
        await cdp.send('IO.close', { handle: stream });
        await writeFile(join(output, 'trace.json'), chunks.join(''));
    }
    await page.screenshot({ path: join(output, 'scene.png') });
    const quantile = (values, p) => {
        const sorted = values.toSorted((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    };
    const describe = values => ({ mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
        p50: quantile(values, .5), p95: quantile(values, .95), p99: quantile(values, .99), max: Math.max(0, ...values) });
    const gaps = data.frames.slice(1).map((f, i) => f.start - data.frames[i].start);
    const functionNames = new Set(data.frames.flatMap(f => Object.keys(f.functions)));
    const functions = Object.fromEntries([...functionNames].map(name => [name, {
        inclusive: describe(data.frames.map(f => f.functions[name]?.total ?? 0)),
        exclusive: describe(data.frames.map(f => f.functions[name]?.self ?? 0)),
        callsPerFrame: data.frames.reduce((n, f) => n + (f.functions[name]?.calls ?? 0), 0) / data.frames.length,
    }]));
    const summary = { scenario, mode, variant, seed, seconds: (data.end - data.start) / 1000,
        frames: data.frames.length, fps: data.frames.length * 1000 / (data.end - data.start),
        frameIntervalMs: describe(gaps), mainThreadWorkMs: describe(data.frames.map(f => f.work)),
        updateMs: describe(data.frames.map(f => f.update)), renderSubmitMs: describe(data.frames.map(f => f.render)),
        over25ms: gaps.filter(g => g > 25).length / Math.max(1, gaps.length),
        over50ms: gaps.filter(g => g > 50).length / Math.max(1, gaps.length),
        gpu: data.gpu ? { supported: data.gpu.supported, samples: data.gpu.milliseconds.length,
            timeMs: describe(data.gpu.milliseconds), disjoint: data.gpu.disjoint } : undefined,
        functions, initial: data.initial, final: data.final, setup, errors };
    await writeFile(join(output, 'frames.json'), JSON.stringify(data));
    await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ output, ...summary }, null, 2));
    if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
