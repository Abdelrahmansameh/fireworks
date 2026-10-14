#!/usr/bin/env node
// Focused checks of the Sparkle Press and real particle buffers in the browser.
// A fresh browser context and bot storage protect the player's normal save.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH
    ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];
try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    await context.addInitScript(() => {
        window.__sparklePressStorageWrites = [];
        Storage.prototype.setItem = function (key) {
            window.__sparklePressStorageWrites.push(key);
            throw new Error(`Sparkle regression attempted native storage write: ${key}`);
        };
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:8765/');
    url.searchParams.set('bot', '1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && window.game?.renderer2D);
    const results = await page.evaluate(async () => {
        window.game.pause();
        window.game.saveProgress = () => {};
        const [{ default: ResourceGenerator }, { default: ParticleSystem },
            { default: ResourceManager }, animator, config] = await Promise.all([
            import('/js/buildings/ResourceGenerator.js'),
            import('/js/particles/InstancedParticleSystem.js'),
            import('/js/resources/ResourceManager.js'),
            import('/js/animation/SkeletonAnimator.js'),
            import('/js/config/config.js'),
        ]);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const near = (actual, expected, tolerance = 0.0001) => Math.abs(actual - expected) <= tolerance;
        const ready = async predicate => {
            const start = performance.now();
            while (!predicate()) {
                if (performance.now() - start > 10000) throw new Error('Sparkle Press skeleton readiness timed out');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const ps = new ParticleSystem(window.game.renderer2D);
        const awards = [];
        const game = {
            headless: false,
            baseSparkleMultiplier: 1,
            generatorStats: { productionRateMultiplier: 1 },
            renderer2D: window.game.renderer2D,
            particleSystem: ps,
            // A lone recipe must not force every generator sparkle to its red color.
            recipes: [{ components: [{ color: '#ff0000' }] }],
            addSparkles(amount, source) {
                this.resourceManager.resources.sparkles.add(amount);
                awards.push({ amount, source });
            },
            addGold(amount) { this.resourceManager.resources.gold.add(amount); },
        };
        game.resourceManager = new ResourceManager(game);
        const generator = new ResourceGenerator(game, 450, -435, { accumulator: 0 });
        const results = {};
        const particles = () => Object.entries(ps.activeCounts).flatMap(([shape, count]) => {
            const data = ps.instanceData[shape];
            return Array.from({ length: count }, (_, index) => {
                const offset = index * ps.strideFloats;
                return {
                    shape, index,
                    type: data[offset + ps.particleTypeIdx],
                    x: data[offset + ps.positionIdx], y: data[offset + ps.positionIdx + 1],
                    vx: data[offset + ps.velocityIdx], vy: data[offset + ps.velocityIdx + 1],
                    size: data[offset + ps.scaleIdx],
                    lifetime: data[offset + ps.lifetimeIdx],
                    gravity: data[offset + ps.gravityIdx], friction: data[offset + ps.frictionIdx],
                    color: Array.from(data.subarray(offset + ps.colorIdx, offset + ps.colorIdx + 3)),
                };
            });
        });
        const visualPart = id => {
            const index = generator._skeleton.drawIndexMap.get(id);
            const offset = index * generator._instancedGroup.instanceStrideFloats;
            return Array.from(generator._instancedGroup.instanceData.subarray(offset, offset + 9));
        };
        const renderPhase = time => {
            generator.accumulator = time;
            generator._renderFrame();
            return Object.fromEntries(['body', 'jaw_left', 'jaw_right', 'charge_low', 'charge_mid', 'charge_high']
                .map(id => [id, visualPart(id)]));
        };
        try {
            await ready(() => generator._skeleton && generator._instancedGroup);
            const ids = generator._skeleton.parts.map(part => part.id);
            const required = ['base', 'base_outline', 'body', 'body_outline', 'charge_window',
                'charge_low', 'charge_mid', 'charge_high', 'outlet', 'jaw_left',
                'jaw_left_outline', 'jaw_right', 'jaw_right_outline', 'glow', 'emitter'];
            assert(ids.length === required.length && required.every(id => ids.includes(id)),
                `Unexpected generator parts (removed stripe, upright bar, or fake sparkles): ${ids}`);
            const shooting = generator._animData.getClip('shooting');
            assert(shooting.duration === 1 && shooting.loop, 'Press cycle does not match the 1s production interval');
            const resting = renderPhase(0.5);
            const popping = renderPhase(0.04);
            assert(popping.jaw_left[0] < resting.jaw_left[0]
                && popping.jaw_right[0] > resting.jaw_right[0]
                && popping.jaw_left[1] > resting.jaw_left[1]
                && popping.jaw_right[1] > resting.jaw_right[1], 'Both press lids did not snap outward and up');
            const empty = renderPhase(0.2);
            const charged = renderPhase(0.8);
            for (const id of ['charge_low', 'charge_mid', 'charge_high']) {
                assert(empty[id][8] < charged[id][8], `${id} did not refill across the production cycle`);
            }
            results.art = { parts: ids.length, noFakeSparkleParts: true, cycle: 1,
                lidsOpen: true, chargeRefills: true };

            generator.accumulator = 0;
            generator.update(0.99);
            assert(game.resourceManager.resources.sparkles.amount === 0 && ps.getTotalActiveParticles() === 0,
                'Generator emitted particles or paid before its 1s production threshold');
            generator.update(0.01);
            const first = particles();
            assert(first.length === 8, `Default burst should have 8 real sparkles, received ${first.length}`);
            assert(first.every(p => p.type === config.PARTICLE_TYPES.RESOURCE_GENERATOR),
                'Generator particles were not tagged as actual RESOURCE_GENERATOR sparkles');
            assert(first.every(p => p.vy > 0) && first.some(p => p.vx < 0) && first.some(p => p.vx > 0),
                'Sparkles did not travel upward in both sides of the fan');
            assert(first.every(p => p.friction === 0), 'Sparkle fan has friction instead of the preview ballistic trajectory');
            const center = first.filter(p => Math.abs(p.vx) < Math.max(...first.map(p => Math.abs(p.vx))) * 0.45);
            const edges = first.filter(p => Math.abs(p.vx) > Math.max(...first.map(p => Math.abs(p.vx))) * 0.85);
            assert(Math.min(...center.map(p => p.vy)) > Math.max(...edges.map(p => p.vy)),
                'The center of the sparkle fan is not taller than its edges');
            const colorKeys = first.map(p => p.color.map(channel => channel.toFixed(4)).join(','));
            assert(new Set(colorKeys).size > 1 && first.some(p => p.color[1] > 0.2 || p.color[2] > 0.2),
                'Generator sparkle colors did not vary independently of the single red recipe');
            assert(first.every(p => p.color.every(channel => channel >= 0 && channel <= 1)),
                'Sparkle RGB channels fell outside their valid range');
            const outletPose = animator.computePose(generator._skeleton, shooting, 0).get('outlet');
            const outletX = generator.x + outletPose.x * generator.config.skeletonScale;
            const outletY = generator.y + outletPose.y * generator.config.skeletonScale;
            assert(first.every(p => Math.abs(p.x - outletX) < generator.config.skeletonScale * 0.2
                && p.y > outletY && p.y - outletY < generator.config.skeletonScale * 0.5),
                'Sparkles did not originate immediately above the press outlet');
            const scale = generator.config.skeletonScale;
            assert(first.every((p, i) => p.shape === 'sphere'
                && near(p.size, (i % 3 === 0 ? 0.08 : 0.06) * scale)
                && near(p.lifetime, 0.53) && near(p.gravity, 10.4 * scale)),
                'Actual sparkle size, short lifetime, or gravity does not match the approved fan preview');
            const emitterPose = animator.computePose(generator._skeleton, shooting, 0).get('emitter');
            const expectedSpawnX = generator.x + emitterPose.x * scale;
            const expectedSpawnY = generator.y + emitterPose.y * scale;
            assert(near(expectedSpawnY, generator.y + 2.08 * scale), 'Emitter bone does not match the preview burst origin');
            assert(generator._skeleton.getPart('emitter').alpha === 0, 'Particle emitter marker should be invisible');
            assert(first.every(p => near(p.x, expectedSpawnX) && near(p.y, expectedSpawnY)),
                'Real particle burst did not start at the press emitter');
            const currentBodyPose = animator.computePose(generator._skeleton, shooting, generator.accumulator).get('body');
            assert(near(visualPart('body')[1], generator.y + currentBodyPose.y * scale),
                'Rendered press phase lagged behind the production cycle');
            results.burst = { count: first.length, shape: first[0].shape,
                sizes: [...new Set(first.map(p => Number(p.size.toFixed(4))))],
                lifetime: first[0].lifetime, gravity: first[0].gravity,
                origin: { x: first[0].x, y: first[0].y },
                velocityBounds: { x: [Math.min(...first.map(p => p.vx)), Math.max(...first.map(p => p.vx))],
                    y: [Math.min(...first.map(p => p.vy)), Math.max(...first.map(p => p.vy))] },
                zeroFriction: true, bothFanDirections: true, colors: new Set(colorKeys).size };

            const physicsTime = 0.18;
            const steps = 18;
            for (let i = 0; i < steps; i++) ps.update(physicsTime / steps);
            const risen = particles();
            assert(risen.length === first.length, 'Preview-sized sparkles vanished before the fan unfolded');
            for (let i = 0; i < risen.length; i++) {
                const before = first[i], after = risen[i];
                assert(near(after.x, before.x + before.vx * physicsTime, 0.003),
                    'Live particles did not preserve their outward fan trajectory');
                const expectedY = before.y + before.vy * physicsTime
                    - before.gravity * physicsTime * physicsTime / 2;
                assert(near(after.y, expectedY, before.gravity * physicsTime * physicsTime / steps),
                    'Live particles did not follow the preview ballistic arc');
                assert(after.y > before.y, 'Live sparkles did not rise above the outlet');
            }
            ps.clear();
            generator.update(1);
            const nextColors = particles().map(p => p.color.map(channel => channel.toFixed(4)).join(','));
            assert(nextColors.some((color, index) => color !== colorKeys[index]), 'Random colors repeated exactly across bursts');
            ps.update(1);
            assert(ps.getTotalActiveParticles() === 0, 'Sparkles or unintended trails persisted past their short burst lifetime');
            results.physics = { checkedSeconds: physicsTime, ballisticFan: true, shortBurstExpires: true };

            const resource = game.resourceManager.resources.sparkles;
            assert(resource.amount === 2 && awards.every(award => award.source === 'resource_generator'),
                'Press redesign changed the default 1 sparkle/s payout or production source');
            game.baseSparkleMultiplier = 4;
            game.generatorStats.productionRateMultiplier = 2;
            assert(generator.getProductionRate() === 8, 'Existing generator production multipliers changed');
            resource.updateFromLevel(generator.getProductionRate());
            generator.update(2.25);
            resource._lastUpdate = performance.now() - 2000;
            game.resourceManager.update();
            assert(resource.amount === 18 && near(generator.accumulator, 0.25),
                `Production timing, multiplier payout, or wall-clock double award changed: ${resource.amount}`);
            const saved = generator.serialize();
            assert(saved.type === 'RESOURCE_GENERATOR' && saved.resourceType === 'sparkles'
                && near(saved.accumulator, 0.25), 'Generator save lost its type or partial production cycle');
            results.economy = { initialTwoSecondsAward: 2, multipliedRate: 8,
                totalAfterTwoMoreSeconds: resource.amount, savedAccumulator: saved.accumulator,
                duplicateWallClockAward: 0 };

            const headlessGame = { ...game, headless: true, renderer2D: null, particleSystem: null };
            headlessGame.resourceManager = new ResourceManager(headlessGame);
            const headless = new ResourceGenerator(headlessGame, 0, 0, { accumulator: 0.5 });
            try {
                headless.update(1.75);
                headless.emitSparkleTrailBurst();
                assert(!headless._skeleton && !headless._instancedGroup
                    && headlessGame.resourceManager.resources.sparkles.amount === 16
                    && near(headless.accumulator, 0.25), 'Headless production did not work without a renderer or particles');
                results.headless = { award: 16, accumulator: 0.25, requiresRenderer: false, requiresParticles: false };
            } finally { headless.destroy(); }
            assert(window.__sparklePressStorageWrites.length === 0, 'Browser regression wrote normal game storage');
            assert(window.game.isPaused, 'Main game resumed during controlled regression checks');
            results.playerSaveUntouched = true;
        } finally {
            generator.destroy();
            ps.dispose();
        }
        return results;
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
