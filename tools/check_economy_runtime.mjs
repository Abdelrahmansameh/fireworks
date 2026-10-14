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
        const [{ default: Firework }, { default: ParticleSystem }, { default: DroneSystem },
            { default: Crowd }, { default: ResourceGenerator }, { default: ResourceManager },
            renderer, config] = await Promise.all([
            import('/js/entities/Firework.js'), import('/js/particles/InstancedParticleSystem.js'),
            import('/js/entities/InstancedDroneSystem.js'), import('/js/entities/Crowd.js'),
            import('/js/buildings/ResourceGenerator.js'), import('/js/resources/ResourceManager.js'),
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
            const drones = new DroneSystem(window.game.renderer2D, ps);
            try {
                await ready(() => drones.mesh);
                drones.spawnDrone(1000, 100, { lifetime: 28, speed: 600, collectionRadius: 50,
                    baseLifetime: 28, baseSpeed: 600, baseRadius: 50 });
                drones.applyUpgradeStats({ maxDrones: 4, lifetimeMultiplier: 1.5,
                    speedMultiplier: 1.35, collectionRadiusMultiplier: 1.5625 });
                assert(drones.data[drones.LIFETIME] === 42, 'Airborne lifetime upgrade did not apply immediately');
                assert(drones.data[drones.SPEED] === 810, 'Airborne speed upgrade did not apply immediately');
                assert(drones.data[drones.RADIUS] === 78.125, 'Airborne radius upgrade did not apply immediately');
                assert(drones.maxDrones === 4, 'Drone capacity upgrade did not apply');
                const crowdPull = () => {};
                crowdPull._isCrowdPull = true;
                const index = ps.addParticle(new renderer.Vector2(1000, 100), new renderer.Vector2(),
                    new renderer.Color(1, 1, 1, 1), 1, 10, 0, 'sphere', new renderer.Vector2(),
                    0, crowdPull, false, null, 0, 1, config.PARTICLE_TYPES.FIREWORK_EXPLOSION, 2.75);
                ps.instanceData.sphere[index * ps.strideFloats + ps.lifetimeIdx] = 9;
                for (let i = 0; i < config.DRONE_CONFIG.scanInterval; i++) drones.update(0, () => {});
                assert(ps.particleUpdateFns.sphere[index] === crowdPull, 'Drone stole a crowd capture');
                ps.particleUpdateFns.sphere[index] = null;
                for (let i = 0; i < config.DRONE_CONFIG.scanInterval; i++) drones.update(0, () => {});
                assert(ps.particleUpdateFns.sphere[index]?._isDronePull, 'Drone did not claim an available explosion particle');
                ps.update(1 / 60);
                let awarded = 0;
                let captured = 0;
                drones.update(1 / 60, (amount, count) => { awarded += amount; captured += count; });
                assert(awarded === 2.75 && captured === 1, `Rebalanced drone award incorrect: ${awarded}/${captured}`);
                results.drone = { lifetime: 42, speed: 810, radius: 78.125, capacity: 4,
                    crowdCapturePreserved: true, capturedValue: awarded, capturedParticles: captured };
            } finally { drones.dispose(); }

            const tempGame = {
                baseSparkleMultiplier: 4, generatorStats: { productionRateMultiplier: 2 },
                renderer2D: window.game.renderer2D, particleSystem: ps, recipes: [],
                addSparkles(amount) { this.resourceManager.resources.sparkles.add(amount); },
                addGold(amount) { this.resourceManager.resources.gold.add(amount); },
            };
            tempGame.resourceManager = new ResourceManager(tempGame);
            const generator = new ResourceGenerator(tempGame, 450, -435, { accumulator: 0 });
            try {
                const sparkleResource = tempGame.resourceManager.resources.sparkles;
                const perSecond = generator.getProductionRate();
                sparkleResource.updateFromLevel(perSecond);
                generator.update(1);
                sparkleResource._lastUpdate = performance.now() - 2000;
                tempGame.resourceManager.update();
                generator.update(1);
                sparkleResource._lastUpdate = performance.now() - 2000;
                tempGame.resourceManager.update();
                assert(sparkleResource.amount === perSecond * 2, `Generator was paid twice: ${sparkleResource.amount}`);
                results.generator = { perSecond, twoGameSecondsAward: sparkleResource.amount, duplicateWallClockAward: 0 };
            } finally { generator.destroy(); }

            const crowd = new Crowd(window.game.renderer2D);
            try {
                await ready(() => crowd.instancedGroup);
                crowd.setCount(48);
                crowd.update(1 / 60);
                assert(crowd.people.length === 48, `Crowd capacity lost people: ${crowd.people.length}`);
                assert(crowd.instancedGroup.maxInstances >= 48 * crowd.totalPartsPerPerson, 'Crowd part buffer too small');
                assert(crowd.collectionRadius === 60 && config.DRONE_CONFIG.collectionRadius === 50,
                    'Original catch radii were not restored');
                assert(config.CROWD_CATCHER_CONFIG.sparklesPerParticle === 1 && config.DRONE_CONFIG.sparklesPerParticle === 1,
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
            const resetIds = ['grand_finale', 'catapult_max', 'drone_max'];
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
                purchase('auto_launcher');
                assert(game.buildingManager.buildings.some(building => building.grantUpgradeId === 'auto_launcher'),
                    'Auto Launcher grant was not tagged with its purchased upgrade');
                if (cycle === 0) {
                    const paidBuilding = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
                    assert(paidBuilding && !paidBuilding.grantUpgradeId, 'Separately purchased launcher was tagged as a grant');
                    paidBuildingId = paidBuilding.id;
                }
                purchase('base_mult_1');
                purchase('base_mult_1');
                purchase('catapult_max');
                purchase('catapult_max');
                purchase('drone_max');
                purchase('drone_max');
                purchase('grand_finale');
                await ready(() => game.buildingManager.buildings.every(building => building._instancedGroup));
                const saved = JSON.parse(JSON.stringify(game.buildingManager.serialize()));
                assert(saved.buildings.filter(building => building.grantUpgradeId).length === 3,
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
                resetCycles.push({ cycle: cycle + 1, refund, includedBuildingsReturned: 3, paidBuildingsRetained: 1 });
            }
            results.reset = { markerPreservedAfterDeserialize: true, cycles: resetCycles, noGrantedUnitGrowth: true };
            const paidLauncherRefund = game.resetAutoLaunchers();
            assert(paidLauncherRefund > 0 && game.buildingManager.buildings.length === 0,
                'Paid launcher reset did not refund and remove the retained launcher');
            const beforeGrant = wallets.sparkles.amount;
            const licenseCost = game.progression.getUpgradeCost('auto_launcher');
            assert(game.buyUpgrade('auto_launcher'), 'Could not repurchase launcher license for reset accounting check');
            const firstPaid = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
            const secondPaid = game.buildingManager.buyBuilding('AUTO_LAUNCHER');
            const expectedPaidRefund = firstPaid.purchaseCost + secondPaid.purchaseCost;
            const buildingSave = JSON.parse(JSON.stringify(game.buildingManager.serialize()));
            game.buildingManager.deserialize(buildingSave);
            const launcherRefund = game.resetAutoLaunchers();
            assert(launcherRefund === expectedPaidRefund, 'Launcher refund included the grant or lost a paid purchase price');
            const licenseRefund = game.resetUpgrades();
            assert(licenseRefund.sparkles === licenseCost && wallets.sparkles.amount === beforeGrant,
                'Launcher reset followed by upgrade reset manufactured currency');
            results.reset.launcherReset = { paidPurchaseRefund: launcherRefund, includedLauncherRefund: 0,
                licenseRefund: licenseRefund.sparkles, currencyGrowth: 0, purchasePricesPreservedAfterDeserialize: true };

            game._handleUnlock('drone_hub');
            game.droneStats.maxDrones = 4;
            game.droneStats.lifetimeMultiplier = 1.5;
            game.droneHubStats.spawnIntervalMultiplier = 0.7;
            game.droneSystem.applyUpgradeStats(game.droneStats);
            await ready(() => game.droneSystem.mesh);
            assert(game.buildingManager.getBuildingLimit('DRONE_HUB') === 2,
                'Upgraded drone flight coverage should need only two hubs');
            const firstHub = game.buildingManager.buyBuilding('DRONE_HUB');
            const beforeSecondHub = wallets.gold.amount;
            const secondHubPrice = game.buildingManager.getBuyCost('DRONE_HUB');
            const secondHub = game.buildingManager.buyBuilding('DRONE_HUB');
            assert(firstHub && secondHub && wallets.gold.amount === beforeSecondHub - secondHubPrice,
                'A useful paid hub could not be bought at its displayed cost');
            firstHub.update(0);
            secondHub.update(0);
            assert(game.droneSystem.count === 2, 'New paid hubs did not launch their first working drones');
            const beforeBlockedHub = wallets.gold.amount;
            const blockedHub = game.buildingManager.buyBuilding('DRONE_HUB');
            assert(blockedHub === null && wallets.gold.amount === beforeBlockedHub
                && game.buildingManager.getBuildingsByType('DRONE_HUB').length === 2,
            'An already-covered fleet allowed a meaningless paid hub or charged gold');
            results.hubCapacity = { lifetime: 42, interval: 16.8, maxActiveDrones: 4, hubLimit: 2,
                usefulHubCharged: secondHubPrice, immediateWorkingDrones: 2, blockedHubGoldCharge: 0 };
        } finally { ps.dispose(); }
        return results;
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
    if (errors.length) console.error('Browser errors:', errors.join('\n'));
    throw error;
} finally { await browser.close(); }
