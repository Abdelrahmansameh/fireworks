#!/usr/bin/env node
// Focused regressions against the actual browser runtime, without running an economy simulator.
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
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:8765/?bot=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.particleSystem && window.game?.renderer2D);
    const results = await page.evaluate(async () => {
        const [{ default: Firework }, { default: ParticleSystem }, { default: Crowd }, { default: CultistRituals }, { default: ResourceManager },
            renderer, config] = await Promise.all([
            import('/js/entities/Firework.js'), import('/js/particles/InstancedParticleSystem.js'),
            import('/js/entities/Crowd.js'),
            import('/js/systems/CultistRituals.js'), import('/js/resources/ResourceManager.js'),
            import('/js/rendering/Renderer.js'), import('/js/config/config.js'),
        ]);
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const ready = async predicate => {
            const start = performance.now();
            while (!predicate()) {
                if (performance.now() - start > 10000) throw new Error('Skeleton readiness timed out');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        };
        const results = {};
        const ps = new ParticleSystem(window.game.renderer2D);
        try {
            results.fireworkParticles = [];
            const cases = [['spherical'], ['ring', 'saturn', 'willow'], ['spherical', 'spherical', 'spherical']];
            for (const patterns of cases) {
                for (const shape of Object.keys(ps.activeCounts)) {
                    ps.activeCounts[shape] = 0;
                    ps.meshes[shape].instanceCount = 0;
                    ps.particleUpdateFns[shape].fill(null);
                }
                const components = patterns.map(pattern => ({ ...config.DEFAULT_RECIPE_COMPONENTS[0], pattern, shape: 'sphere' }));
                const firework = new Firework(1000, -435, components, window.game.renderer2D, ps, 100, null, null, 17);
                firework.explode();
                let count = 0;
                let value = 0;
                for (const shape of Object.keys(ps.activeCounts)) {
                    for (let i = 0; i < ps.activeCounts[shape]; i++) {
                        const offset = i * ps.strideFloats;
                        if (ps.instanceData[shape][offset + ps.particleTypeIdx] === config.PARTICLE_TYPES.FIREWORK_EXPLOSION) {
                            count++;
                            value += ps.instanceData[shape][offset + ps.sparkleValueIdx];
                        }
                    }
                }
                assert(count > 0 && Math.abs(value - 17) < 0.0001, 'Rebalanced firework payout budget was not restored');
                results.fireworkParticles.push({ patterns, particles: count, recoveryBudget: value });
                firework.dispose();
            }

            for (const shape of Object.keys(ps.activeCounts)) {
                ps.activeCounts[shape] = 0;
                ps.meshes[shape].instanceCount = 0;
                ps.particleUpdateFns[shape].fill(null);
            }
            const jetpackCrowd = new Crowd(window.game.renderer2D);
            try {
                await ready(() => jetpackCrowd.instancedGroup);
                jetpackCrowd.particleSystem = ps;
                jetpackCrowd.setJetpackCount(1, { speedMultiplier: 1.35, collectionRadiusMultiplier: 1.5625 });
                const fan = jetpackCrowd.people.find(person => person.isJetpack);
                assert(fan, 'Purchased jetpack did not create a crowd member');
                fan.x = 1000; fan.y = 100;
                const crowdPull = () => {};
                crowdPull._isCrowdPull = true;
                const index = ps.addParticle(new renderer.Vector2(1000, 100), new renderer.Vector2(),
                    new renderer.Color(1, 1, 1, 1), 1, 10, 0, 'sphere', new renderer.Vector2(),
                    0, crowdPull, false, null, 0, 1, config.PARTICLE_TYPES.FIREWORK_EXPLOSION, 2.75);
                ps.instanceData.sphere[index * ps.strideFloats + ps.lifetimeIdx] = 9;
                jetpackCrowd._scanFrameCounter = 0;
                jetpackCrowd.update(0);
                assert(ps.particleUpdateFns.sphere[index] === crowdPull, 'Jetpack fan stole a crowd capture');
                ps.particleUpdateFns.sphere[index] = null;
                let awarded = 0;
                jetpackCrowd.onJetpackCollect = amount => { awarded += amount; };
                jetpackCrowd._scanFrameCounter = 0;
                jetpackCrowd.update(0);
                assert(ps.particleUpdateFns.sphere[index]?._isJetpackPull, 'Jetpack fan did not claim an available sparkle');
                ps.update(1 / 60);
                assert(awarded === 2.75, `Jetpack award incorrect: ${awarded}`);
                results.jetpack = { crowdCapturePreserved: true, capturedValue: awarded };
            } finally { jetpackCrowd.dispose(); }

            const tempGame = {
                baseSparkleMultiplier: 4, cultistStats: { sparkleMultiplier: 2, ritualSpeedMultiplier: 1 },
                renderer2D: window.game.renderer2D, particleSystem: ps, recipes: [],
                addSparkles(amount) { this.resourceManager.resources.sparkles.add(amount); },
                addGold(amount) { this.resourceManager.resources.gold.add(amount); },
            };
            tempGame.resourceManager = new ResourceManager(tempGame);
            const rituals = new CultistRituals(tempGame);
            rituals.setCount(1);
            const sparkleResource = tempGame.resourceManager.resources.sparkles;
            const perRitual = rituals.payout;
            sparkleResource.updateFromLevel(perRitual / rituals.interval);
            for (let i = 0; i < 2; i++) {
                rituals.update(rituals.interval);
                sparkleResource._lastUpdate = performance.now() - 2000;
                tempGame.resourceManager.update();
            }
            assert(sparkleResource.amount === perRitual * 2, `Cultist was paid twice: ${sparkleResource.amount}`);
            results.cultist = { perRitual, twoRitualsAward: sparkleResource.amount, duplicateWallClockAward: 0 };

            const crowd = new Crowd(window.game.renderer2D);
            try {
                await ready(() => crowd.instancedGroup);
                crowd.setCount(48);
                crowd.update(1 / 60);
                assert(crowd.people.length === 48, `Crowd capacity lost people: ${crowd.people.length}`);
                assert(crowd.instancedGroup.maxInstances >= 48 * crowd.totalPartsPerPerson, 'Crowd part buffer too small');
                assert(crowd.collectionRadius === 60 && config.JETPACK_CONFIG.collectionRadius === 50,
                    'Original catch radii were not restored');
                assert(config.CROWD_CATCHER_CONFIG.sparklesPerParticle === 1 && config.JETPACK_CONFIG.sparklesPerParticle === 1,
                    'Rebalanced payout multipliers were not restored');
                for (const shape of Object.keys(ps.activeCounts)) {
                    ps.activeCounts[shape] = 0;
                    ps.meshes[shape].instanceCount = 0;
                    ps.particleUpdateFns[shape].fill(null);
                }
                let crowdAward = 0;
                crowd.particleSystem = ps;
                crowd.onCatchSparkles = amount => { crowdAward += amount; };
                const person = { x: 1000, y: 100, collected: 0 };
                const addCatchParticle = x => {
                    const index = ps.addParticle(new renderer.Vector2(x, 100), new renderer.Vector2(),
                        new renderer.Color(1, 1, 1, 1), 1, 10, 0, 'sphere', new renderer.Vector2(),
                        0, null, false, null, 0, 1, config.PARTICLE_TYPES.FIREWORK_EXPLOSION, 0.5);
                    ps.instanceData.sphere[index * ps.strideFloats + ps.lifetimeIdx] = 9;
                    return index;
                };
                const near = addCatchParticle(1005);
                const far = addCatchParticle(1065);
                crowd._scanParticlesForPerson(person);
                assert(ps.particleUpdateFns.sphere[near]?._isCrowdPull && !ps.particleUpdateFns.sphere[far],
                    'Crowd did not respect its original catch radius');
                ps.update(1 / 60);
                assert(crowdAward === 0.5 && person.collected === 1, 'Crowd catch did not pay the rebalanced particle value');
                results.crowdCatch = { radius: crowd.collectionRadius, awarded: crowdAward, caught: person.collected };
                results.crowd = { people: crowd.people.length, partsPerPerson: crowd.totalPartsPerPerson,
                    instanceCapacity: crowd.instancedGroup.maxInstances };
            } finally { crowd.dispose(); }

            // Exercise the real purchase/reset/save paths on this isolated game.
            const game = window.game;
            game.pause();
            const wallets = game.resourceManager.resources;
            wallets.sparkles.amount = 10000000;
            wallets.gold.amount = 1000000;
            const resetIds = ['grand_finale', 'catapult_max', 'jetpack_team'];
            // These checks concern transactions, so chapter prerequisites are
            // bypassed without changing prices, effects, or purchase handlers.
            for (const id of resetIds) {
                const def = game.progression.getUpgradeDef(id);
                def.treeParent = 'ROOT';
                def.requires = {};
            }
            let paidBuildingId;
            const resetCycles = [];
            for (let cycle = 0; cycle < 3; cycle++) {
                const charged = { sparkles: 0, gold: 0 };
                const purchase = id => {
                    const before = { sparkles: wallets.sparkles.amount, gold: wallets.gold.amount };
                    assert(game.buyUpgrade(id), `Reset regression could not purchase ${id}`);
                    for (const currency of ['sparkles', 'gold']) charged[currency] += before[currency] - wallets[currency].amount;
                };
                purchase('base_mult_1');
                purchase('unlock_recipes_tab');
                const launcherCountBeforeUnlock = game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;
                purchase('auto_launcher');
                assert(game.isBuildingTypeUnlocked('AUTO_LAUNCHER')
                    && game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length === launcherCountBeforeUnlock,
                'Auto Launcher upgrade did not unlock purchases without granting a launcher');
                if (cycle === 0) {
                    const paidBuilding = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
                    assert(paidBuilding && !paidBuilding.grantUpgradeId, 'Separately purchased launcher was tagged as a grant');
                    paidBuildingId = paidBuilding.id;
                }
                purchase('base_mult_1');
                purchase('catapult_max');
                purchase('catapult_max');
                purchase('jetpack_team');
                purchase('jetpack_team');
                purchase('grand_finale');
                await ready(() => game.buildingManager.buildings.every(building => building._instancedGroup));
                const saved = JSON.parse(JSON.stringify(game.buildingManager.serialize()));
                assert(saved.buildings.filter(building => building.grantUpgradeId).length === 2,
                    'Save did not preserve every included building marker');
                game.buildingManager.deserialize(saved);
                await ready(() => game.buildingManager.buildings.every(building => building._instancedGroup));
                const beforeReset = { sparkles: wallets.sparkles.amount, gold: wallets.gold.amount };
                const refund = game.resetUpgrades();
                for (const currency of ['sparkles', 'gold']) {
                    assert(refund[currency] === charged[currency], `${currency} refund differed from charged prices`);
                    assert(wallets[currency].amount === beforeReset[currency] + charged[currency], `${currency} refund was not credited exactly`);
                }
                assert(game.buildingManager.buildings.length === 1 && game.buildingManager.buildings[0].id === paidBuildingId,
                    'Reset kept included units or removed the separately paid building');
                resetCycles.push({ cycle: cycle + 1, refund, includedBuildingsReturned: 2, paidBuildingsRetained: 1 });
            }
            results.reset = { markerPreservedAfterDeserialize: true, cycles: resetCycles, noGrantedUnitGrowth: true };
            const paidLauncherRefund = game.resetAutoLaunchers();
            assert(paidLauncherRefund > 0 && game.buildingManager.buildings.length === 0,
                'Paid launcher reset did not refund and remove the retained launcher');
            const beforeGrant = wallets.sparkles.amount;
            const starterCost = game.progression.getUpgradeCost('base_mult_1');
            assert(game.buyUpgrade('base_mult_1'), 'Could not repurchase the starter for launcher reset accounting');
            const creatorCost = game.progression.getUpgradeCost('unlock_recipes_tab');
            assert(game.buyUpgrade('unlock_recipes_tab'), 'Could not repurchase Creator before the launcher license');
            const licenseCost = game.progression.getUpgradeCost('auto_launcher');
            assert(game.buyUpgrade('auto_launcher'), 'Could not repurchase launcher license for reset accounting check');
            assert(game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length === 0,
                'Repurchasing the launcher license granted a free launcher');
            const firstPaid = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
            const secondPaid = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
            const expectedPaidRefund = firstPaid.purchaseCost + secondPaid.purchaseCost;
            // Preserve accounting for included launchers retained in older saves.
            game.grantMilestoneBuilding('AUTO_LAUNCHER', 'auto_launcher');
            const buildingSave = JSON.parse(JSON.stringify(game.buildingManager.serialize()));
            game.buildingManager.deserialize(buildingSave);
            const launcherRefund = game.resetAutoLaunchers();
            assert(launcherRefund === expectedPaidRefund, 'Launcher refund included the grant or lost a paid purchase price');
            const licenseRefund = game.resetUpgrades();
            assert(licenseRefund.sparkles === starterCost + creatorCost + licenseCost && wallets.sparkles.amount === beforeGrant,
                'Launcher reset followed by upgrade reset manufactured currency');
            results.reset.launcherReset = { paidPurchaseRefund: launcherRefund, includedLauncherRefund: 0,
                starterAndLicenseRefund: licenseRefund.sparkles, currencyGrowth: 0, purchasePricesPreservedAfterDeserialize: true };

            const beforeJetpack = game.jetpackCount;
            const cost = game.getJetpackCost();
            const beforeGold = wallets.gold.amount;
            assert(game.purchaseJetpack(), 'Jetpack purchase failed');
            assert(game.jetpackCount === beforeJetpack + 1 && wallets.gold.amount === beforeGold - cost,
                'Jetpack purchase did not grant one fan at the advertised price');
            results.jetpackPurchase = { cost, count: game.jetpackCount };
        } finally { ps.dispose(); }
        return results;
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
