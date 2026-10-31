#!/usr/bin/env node
// Validate the generated scenery and real firework lighting in an isolated Chrome save.
// Usage: node tools/check_background_lighting.mjs [http://127.0.0.1:8765/]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let playwright;
for (const location of ['playwright', process.env.PLAYWRIGHT_MODULE_PATH,
    join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(location); break; } catch { /* Try the bundled runtime next. */ }
}
if (!playwright) throw new Error('Install Playwright or set PLAYWRIGHT_MODULE_PATH.');

const browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const output = join('traces', 'background-lighting');
const errors = [];
await mkdir(output, { recursive: true });

try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.setDefaultTimeout(20000);
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.delete('bot');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && !game._isRestoring);
    console.log('Checking deterministic scenery generation');
    const generated = await page.evaluate(() => {
        game.pause();
        game.hasSeenFirstCrowdCinematic = true;
        game.ui.hideActiveTab();
        game.ui.dismissNotification();
        const background = game.procduralBackground;
        const renderer = game.renderer2D;
        const snapshot = () => JSON.stringify(background.shapes.map(shape => ({
            vertices: Array.from(shape.vertices), indices: Array.from(shape.indices ?? []),
            color: { ...shape.color }, position: { ...shape.position },
            scale: { ...shape.scale }, rotation: shape.rotation, zIndex: shape.zIndex,
        })));
        background.generate();
        const first = snapshot();
        const inventory = () => ({ shapes: renderer.normalShapes.length, groups: renderer.instancedGroups.length,
            vertices: renderer.normalShapes.reduce((total, shape) => total + shape.vertices.length, 0),
            instanceCapacity: renderer.instancedGroups.reduce((total, group) => total + group.instanceData.length, 0) });
        const counts = inventory();
        let deterministic = true, stable = true;
        for (let i = 0; i < 3; i++) {
            background.generate();
            deterministic &&= snapshot() === first;
            stable &&= JSON.stringify(counts) === JSON.stringify(inventory());
        }
        const center = renderer.waterReflection
            ? (renderer.waterReflection.left + renderer.waterReflection.right) / 2 : 0;
        renderer.setCamera({ x: center, y: -20, zoom: 1 });
        background.ensureCoverage();
        game.render();
        return { deterministic, stable, counts, sceneryShapes: background.shapes.length,
            lightSurfaces: background.lightSurfaces?.length ?? 0,
            water: renderer.waterReflection ? { ...renderer.waterReflection } : null,
            glError: renderer.gl.getError() };
    });
    assert(generated.deterministic, 'Regenerating the same background seed changed its geometry or base colors.');
    assert(generated.stable, 'Repeated background generation leaked renderer shapes or instance groups.');
    assert(generated.lightSurfaces > 0, 'Generated scenery has no surfaces that receive firework light.');
    assert(generated.water && generated.water.surfaceY > generated.water.bottomY, 'No valid reflecting water region was generated.');
    assert(generated.glError === 0, `WebGL error after scenery generation: ${generated.glError}`);
    await page.screenshot({ path: join(output, 'unlit.png'), animations: 'disabled' });

    console.log('Checking running water without fireworks');
    const waterAnimation = await page.evaluate(() => {
        const background = game.procduralBackground;
        const renderer = game.renderer2D;
        const gl = renderer.gl;
        game.fireworkSystem.disposeAll();
        game.particleSystem.clear();
        const water = renderer.waterReflection;
        const lowerLeft = renderer.worldToScreen(water.left, water.bottomY);
        const upperRight = renderer.worldToScreen(water.right, water.surfaceY);
        const canvas = renderer.canvas.getBoundingClientRect();
        const scaleX = gl.drawingBufferWidth / canvas.width;
        const scaleY = gl.drawingBufferHeight / canvas.height;
        const left = Math.max(0, Math.floor((lowerLeft.x - canvas.left) * scaleX));
        const right = Math.min(gl.drawingBufferWidth, Math.ceil((upperRight.x - canvas.left) * scaleX));
        const bottom = Math.max(0, Math.floor(gl.drawingBufferHeight - (lowerLeft.y - canvas.top) * scaleY));
        const top = Math.min(gl.drawingBufferHeight, Math.ceil(gl.drawingBufferHeight - (upperRight.y - canvas.top) * scaleY));
        const read = () => {
            renderer.drawFrame();
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        const counts = { shapes: renderer.normalShapes.length, groups: renderer.instancedGroups.length };
        const before = read();
        // Advance scenery alone so star twinkle and other game animation cannot satisfy this check.
        background.scenery.update(.5, game.particleSystem, []);
        const after = read();
        let changedPixels = 0, maxDifference = 0;
        for (let y = bottom; y < top; y++) for (let x = left; x < right; x++) {
            const offset = (y * gl.drawingBufferWidth + x) * 4;
            const difference = Math.max(Math.abs(after[offset] - before[offset]),
                Math.abs(after[offset + 1] - before[offset + 1]), Math.abs(after[offset + 2] - before[offset + 2]));
            if (difference >= 2) changedPixels++;
            maxDifference = Math.max(maxDifference, difference);
        }
        return { changedPixels, maxDifference,
            stable: counts.shapes === renderer.normalShapes.length && counts.groups === renderer.instancedGroups.length,
            waterPixels: (right - left) * (top - bottom), glError: gl.getError() };
    });
    assert(waterAnimation.changedPixels >= 100 && waterAnimation.maxDifference >= 2,
        `Idle water did not visibly flow or ripple: ${JSON.stringify(waterAnimation)}`);
    assert(waterAnimation.stable, 'Animating water added renderer shapes or instance groups.');
    assert(waterAnimation.glError === 0, `WebGL error during water animation: ${waterAnimation.glError}`);
    await page.screenshot({ path: join(output, 'water-flow.png'), animations: 'disabled' });

    // Real launch/explosion paths supply the particles; only simulation time is advanced manually.
    const captureBurst = async (name, color, altitude = 60, cameraX = null) => {
        console.log(`Checking ${name} scenery lighting`);
        const lighting = await page.evaluate(({ color, altitude, cameraX }) => {
            const background = game.procduralBackground;
            const renderer = game.renderer2D;
            const particles = game.particleSystem;
            game.fireworkSystem.disposeAll();
            particles.clear();
            background.generate();
            const water = renderer.waterReflection;
            const x = cameraX ?? (water.left + water.right) / 2;
            renderer.setCamera({ x, y: -20, zoom: 1 });
            const base = background.lightSurfaces.map(surface => ({ ...surface.shape.color }));
            const colors = Array.isArray(color) ? color : [color];
            colors.forEach((burstColor, index) => {
                const burstX = x + (index - (colors.length - 1) / 2) * 45;
                game.fireworkSystem.launch(burstX, -535, [{ pattern: 'spherical', color: burstColor,
                    secondaryColor: burstColor, shape: 'sphere', size: .7, spread: .8, lifetime: 3 }], altitude, 0);
                const firework = game.fireworkSystem.fireworks.at(-1);
                firework.rocket.position.set(burstX, altitude);
                firework.explode();
            });
            for (let i = 0; i < 12; i++) {
                particles.update(1 / 60);
                background.update(1 / 60, particles, game.fireworkSystem.fireworks);
            }
            const energy = { r: 0, g: 0, b: 0, changed: 0, maxChange: 0, maxChannel: 0,
                finiteAndBounded: true, mountainMaxChange: 0, primitiveEdgeMaxChange: 0 };
            background.lightSurfaces.forEach((surface, index) => {
                const dr = surface.shape.color.r - base[index].r;
                const dg = surface.shape.color.g - base[index].g;
                const db = surface.shape.color.b - base[index].b;
                energy.r += Math.max(0, dr);
                energy.g += Math.max(0, dg);
                energy.b += Math.max(0, db);
                energy.maxChange = Math.max(energy.maxChange, dr, dg, db);
                for (const channel of ['r', 'g', 'b']) {
                    const value = surface.shape.color[channel];
                    energy.maxChannel = Math.max(energy.maxChannel, value);
                    energy.finiteAndBounded &&= Number.isFinite(value) && value >= 0 && value <= .5;
                }
                const { zIndex } = background.config;
                if (surface.shape.zIndex === zIndex.mountainsFar || surface.shape.zIndex === zIndex.mountainsNear) {
                    energy.mountainMaxChange = Math.max(energy.mountainMaxChange, dr, dg, db);
                }
                if (surface.shape.zIndex >= zIndex.landmarks && surface.shape.zIndex < zIndex.water
                    && surface.reflectivity >= .78) {
                    energy.primitiveEdgeMaxChange = Math.max(energy.primitiveEdgeMaxChange, dr, dg, db);
                }
                if (Math.max(dr, dg, db) > .001) energy.changed++;
            });
            game.render();
            return { ...energy, particles: particles.getTotalActiveParticles(), glError: renderer.gl.getError() };
        }, { color, altitude, cameraX });
        assert(lighting.particles > 0, `${name}: the actual firework explosion did not produce live particles.`);
        assert(lighting.changed > 0 && lighting.maxChange > .005,
            `${name}: the explosion did not visibly illuminate scenery: ${JSON.stringify(lighting)}`);
        assert(lighting.finiteAndBounded,
            `${name}: scenery lighting produced invalid colors or washed out above .5: ${JSON.stringify(lighting)}`);
        assert(lighting.glError === 0, `${name}: WebGL error ${lighting.glError}`);
        await page.screenshot({ path: join(output, `${name}.png`), animations: 'disabled' });
        return lighting;
    };

    const warm = await captureBurst('warm-burst', '#ff4a12');
    assert(warm.r > warm.b * 1.2, `Warm firework lighting did not retain its red color: ${JSON.stringify(warm)}`);
    const blue = await captureBurst('blue-burst', '#1769ff');
    assert(blue.b > blue.r * 1.2, `Blue firework lighting did not retain its blue color: ${JSON.stringify(blue)}`);
    const green = await captureBurst('green-burst', '#16ff40');
    assert(green.g > green.r * 1.2 && green.g > green.b * 1.2,
        `Green firework lighting lost its dominant hue: ${JSON.stringify(green)}`);
    const magenta = await captureBurst('magenta-burst', '#ff00c8');
    assert(magenta.r > magenta.g * 1.2 && magenta.b > magenta.g * 1.2,
        `Magenta firework lighting lost its dominant hue: ${JSON.stringify(magenta)}`);
    const mixed = await captureBurst('mixed-bursts', ['#ff3519', '#17eaff', '#16ff40', '#ff00c8',
        '#ff3519', '#17eaff', '#16ff40', '#ff00c8']);
    assert(mixed.mountainMaxChange > .001 && mixed.primitiveEdgeMaxChange > .005
        && mixed.mountainMaxChange < mixed.primitiveEdgeMaxChange * .9,
    `Busy bursts should keep mountains more restrained than primitive edges: ${JSON.stringify(mixed)}`);
    const settlement = await captureBurst('primitive-settlement', '#ffae56', 80, 0);
    // The highest launch target must still have a visible reflection in this shallow lake.
    const maxAltitude = await page.evaluate(async () => (await import('/js/config/GameBoundsConfig.js')).GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y);
    const high = await captureBurst('high-burst', '#77bbff', maxAltitude);

    // Compare the same GPU frame with reflection switched off/on. Read immediately after each draw,
    // because WebGL's default framebuffer need not be preserved across animation frames.
    console.log('Checking rendered firework reflection pixels');
    const reflection = await page.evaluate(() => {
        const renderer = game.renderer2D;
        const gl = renderer.gl;
        const water = { ...renderer.waterReflection };
        const waterSurfaces = game.procduralBackground.scenery.waterBands
            .map(shape => ({ shape, enabled: shape.isWaterSurface }));
        const particleGroups = new Set(Object.values(game.particleSystem.meshes));
        const otherSources = [...renderer.normalShapes, ...renderer.instancedGroups]
            .filter(source => !particleGroups.has(source))
            .map(source => ({ source, enabled: source.reflectsInWater }));
        for (const { source } of otherSources) source.reflectsInWater = false;
        // The water shader also uses this renderer setting. Disable its animated surface
        // during comparison so only actual reflected firework pixels can pass the check.
        for (const { shape } of waterSurfaces) shape.isWaterSurface = false;
        const read = () => {
            renderer.drawFrame();
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        renderer.setWaterReflection(null);
        const off = read();
        renderer.setWaterReflection(water);
        const on = read();
        for (const { source, enabled } of otherSources) source.reflectsInWater = enabled;
        for (const { shape, enabled } of waterSurfaces) shape.isWaterSurface = enabled;
        const lowerLeft = renderer.worldToScreen(water.left, water.bottomY);
        const upperRight = renderer.worldToScreen(water.right, water.surfaceY);
        const canvas = renderer.canvas.getBoundingClientRect();
        const scaleX = gl.drawingBufferWidth / canvas.width;
        const scaleY = gl.drawingBufferHeight / canvas.height;
        const left = Math.max(0, Math.floor((lowerLeft.x - canvas.left) * scaleX));
        const right = Math.min(gl.drawingBufferWidth, Math.ceil((upperRight.x - canvas.left) * scaleX));
        const bottom = Math.max(0, Math.floor(gl.drawingBufferHeight - (lowerLeft.y - canvas.top) * scaleY));
        const top = Math.min(gl.drawingBufferHeight, Math.ceil(gl.drawingBufferHeight - (upperRight.y - canvas.top) * scaleY));
        let changedInside = 0, changedOutside = 0, totalGain = 0, maxDifference = 0;
        for (let y = 0; y < gl.drawingBufferHeight; y++) for (let x = 0; x < gl.drawingBufferWidth; x++) {
            const offset = (y * gl.drawingBufferWidth + x) * 4;
            const difference = Math.max(Math.abs(on[offset] - off[offset]),
                Math.abs(on[offset + 1] - off[offset + 1]), Math.abs(on[offset + 2] - off[offset + 2]));
            if (difference < 2) continue;
            if (x >= left && x < right && y >= bottom && y < top) {
                changedInside++;
                totalGain += on[offset] + on[offset + 1] + on[offset + 2]
                    - off[offset] - off[offset + 1] - off[offset + 2];
                maxDifference = Math.max(maxDifference, difference);
            } else changedOutside++;
        }
        return { changedInside, changedOutside, totalGain, maxDifference,
            waterPixels: (right - left) * (top - bottom), glError: gl.getError(),
            fireworkReflectionSources: [...particleGroups].filter(source => source.reflectsInWater).length };
    });
    assert(reflection.waterPixels > 100, 'Water was outside the validation camera.');
    assert(reflection.changedInside >= 20 && reflection.maxDifference >= 3 && reflection.totalGain > 0,
        `Enabling reflection did not add visible firework pixels to the water: ${JSON.stringify(reflection)}`);
    assert(reflection.changedOutside === 0,
        `Reflection escaped its water region: ${JSON.stringify(reflection)}`);
    assert(reflection.glError === 0, `WebGL error during reflection rendering: ${reflection.glError}`);
    await page.screenshot({ path: join(output, 'water-reflection.png'), animations: 'disabled' });

    const faded = await page.evaluate(() => {
        const background = game.procduralBackground;
        game.fireworkSystem.disposeAll();
        game.particleSystem.clear();
        for (let i = 0; i < 300; i++) background.update(1 / 60, game.particleSystem, []);
        let maxDifference = 0;
        for (const surface of background.lightSurfaces) for (const channel of ['r', 'g', 'b']) {
            maxDifference = Math.max(maxDifference, Math.abs(surface.shape.color[channel] - surface.baseColor[channel]));
        }
        game.render();
        return { maxDifference, glError: game.renderer2D.gl.getError() };
    });
    assert(faded.maxDifference < .005, `Scenery remained illuminated after the fireworks faded: ${JSON.stringify(faded)}`);
    assert(faded.glError === 0, `WebGL error after lighting faded: ${faded.glError}`);
    const reset = await page.evaluate(() => {
        const previousParticles = game.particleSystem;
        game.resetGame();
        game.hasSeenFirstCrowdCinematic = true;
        const background = game.procduralBackground;
        const water = game.renderer2D.waterReflection;
        const x = (water.left + water.right) / 2;
        game.fireworkSystem.launch(x, -535, [{ pattern: 'spherical', color: '#ff4a12',
            secondaryColor: '#ff4a12', shape: 'sphere', size: .7, spread: .8, lifetime: 3 }], 60, 0);
        const firework = game.fireworkSystem.fireworks.at(-1);
        firework.rocket.position.set(x, 60);
        firework.explode();
        for (let i = 0; i < 12; i++) game.update(1 / 60);
        let maxChange = 0;
        for (const surface of background.lightSurfaces) for (const channel of ['r', 'g', 'b']) {
            maxChange = Math.max(maxChange, surface.shape.color[channel] - surface.baseColor[channel]);
        }
        game.render();
        return { freshParticleSystem: game.particleSystem !== previousParticles,
            particles: game.particleSystem.getTotalActiveParticles(), maxChange,
            glError: game.renderer2D.gl.getError() };
    });
    assert(reset.freshParticleSystem && reset.particles > 0 && reset.maxChange > .005,
        `Reset or the production update loop lost scenery lighting: ${JSON.stringify(reset)}`);
    assert(reset.glError === 0, `WebGL error after reset: ${reset.glError}`);
    assert(errors.length === 0, `Browser errors: ${errors.join('\n')}`);
    const result = { passed: true, validation: 'actual-browser-game', generated, waterAnimation,
        warm, blue, green, magenta, mixed, settlement, high, reflection, faded, reset,
        screenshots: output, browserErrors: errors };
    await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    await browser.close();
}
