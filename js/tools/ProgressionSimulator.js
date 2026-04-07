import ProgressionManager from '../upgrades/ProgressionManager.js';
import { PROGRESSION_CONFIG } from '../config/ProgressionConfig.js';
import { BUILDING_TYPES } from '../config/config.js';

export class ProgressionSimulator {
    constructor() {
        this.reset();
    }

    reset() {
        this.time = 0;
        this.history = [];
        this.events = [];

        this.mockGame = {
            resourceManager: {
                resources: {
                    sparkles: { amount: 0, add: val => this.mockGame.resourceManager.resources.sparkles.amount += val, subtract: val => this.mockGame.resourceManager.resources.sparkles.amount -= val },
                    gold: { amount: 0, add: val => this.mockGame.resourceManager.resources.gold.amount += val, subtract: val => this.mockGame.resourceManager.resources.gold.amount -= val }
                }
            },
            baseSparkleMultiplier: 1,
            droneStats: { lifetimeMultiplier: 1, speedMultiplier: 1, collectionRadiusMultiplier: 1, maxDrones: 0, sparklesPerParticleMultiplier: 1 },
            crowdStats: { catchingEnabled: false, collectionRadiusMultiplier: 1, sparklesPerParticleMultiplier: 1, goldRateMultiplier: 1, countBonus: 0 },
            launcherStats: { spawnIntervalMultiplier: 1 },
            generatorStats: { productionRateMultiplier: 1 },
            droneHubStats: { spawnIntervalMultiplier: 1 },
            catapultStats: { maxCatapults: 1 },
            fireworkSystem: { fireworkCount: 0 }, // For unlock nodes
            buildingManager: {
                buildings: [], 
                getBuildingsByType: (type) => this.mockGame.buildingManager.buildings.filter(b => b.type === type)
            },
            crowd: { people: [] }, 
            isBuildingTypeUnlocked: (type) => this.isBuildingTypeUnlocked(type),
            syncCrowdStats: () => this.syncCrowd(),
            calculateTotalSparklesPerSecond: () => this.currentSPS,
            showNotification: () => {},
            saveProgress: () => {},
            _handleUnlock: () => {},
            ui: { renderUpgrades: () => {} },
        };

        this.progression = new ProgressionManager(PROGRESSION_CONFIG);
        this.progression.applyAll(this.mockGame);

        this.currentSPS = 0;
        this.currentGPS = 0;
    }

    isBuildingTypeUnlocked(type) {
        if (type === 'AUTO_LAUNCHER') return this.progression.getUpgradeLevel('auto_launcher') > 0;
        if (type === 'RESOURCE_GENERATOR') return this.progression.getUpgradeLevel('resource_generator') > 0;
        if (type === 'DRONE_HUB') return this.progression.getUpgradeLevel('drone_hub') > 0;
        if (type === 'CATAPULT') return this.progression.getUpgradeLevel('catapult') > 0;
        return false;
    }

    syncCrowd() {
        // Mock crowd size scaling
        const fps = this.getLauncherFPS();
        // A rough approximation of crowd scaling from FireworkGame.js `_calculateTargetCrowdCount`
        // formulaA = 15, formulaB = 5 (using default config scaling roughly)
        const target = fps <= 0 ? (this.mockGame.crowdStats.countBonus || 0) : Math.floor(15 * Math.sqrt(fps) + 5) + (this.mockGame.crowdStats.countBonus || 0);
        this.mockGame.crowd.people.length = target; 
    }

    getLauncherFPS() {
        const launchers = this.mockGame.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        let totalFPS = 0;
        for (const _ of launchers) {
            totalFPS += 1 / (BUILDING_TYPES.AUTO_LAUNCHER.baseSpawnInterval * this.mockGame.launcherStats.spawnIntervalMultiplier);
        }
        return totalFPS;
    }

    getBuildingCost(type) {
        const config = BUILDING_TYPES[type];
        if (!config) return Infinity;
        const count = this.mockGame.buildingManager.getBuildingsByType(type).length;
        return Math.floor(config.baseCost * Math.pow(config.costRatio, count));
    }

    simulate(durationMinutes, inputs) {
        this.reset();
        
        const tickSize = 1; // 1 second per tick
        let totalTicks = durationMinutes * 60 / tickSize;
        let lastReportTime = -1;

        const ClicksPerSec = parseFloat(inputs.clicksPerSec) || 0;
        const BaseDroneYieldPerSec = parseFloat(inputs.baseDroneYieldPerSec) || 0;
        const BaseCatchYieldPerSec = parseFloat(inputs.baseCatchYieldPerSec) || 0;
        const BaseGoldDropsPerSecPerPerson = 1 / 5; // roughly 1 gold every 5 seconds per person as base?

        for (let t = 0; t < totalTicks; t++) {
            this.time += tickSize;

            // 1. Calculate and Add Resources
            let tickSPS = 0;
            let tickGPS = 0;

            // Clicks
            tickSPS += ClicksPerSec * this.mockGame.baseSparkleMultiplier;

            // Launchers (roughly assuming each firework gives baseSparkleMultiplier immediately for simplicity)
            const fps = this.getLauncherFPS();
            tickSPS += fps * this.mockGame.baseSparkleMultiplier;
            this.mockGame.fireworkSystem.fireworkCount += fps * tickSize; // Simulate firework count going up

            // Generators
            const gens = this.mockGame.buildingManager.getBuildingsByType('RESOURCE_GENERATOR').length;
            const genBase = BUILDING_TYPES.RESOURCE_GENERATOR.baseProductionRate;
            tickSPS += gens * genBase * this.mockGame.generatorStats.productionRateMultiplier;

            // Drones
            const droneHubs = this.mockGame.buildingManager.getBuildingsByType('DRONE_HUB').length;
            if (droneHubs > 0) {
                const maxActiveDrones = Math.min(
                    this.mockGame.droneStats.maxDrones, 
                    droneHubs * (12 / (this.mockGame.droneHubStats.spawnIntervalMultiplier * 12)) * (10 * this.mockGame.droneStats.lifetimeMultiplier) // rough Little's law
                );
                tickSPS += maxActiveDrones * BaseDroneYieldPerSec * this.mockGame.droneStats.sparklesPerParticleMultiplier;
            }

            // Crowd Catching
            const catapults = this.mockGame.buildingManager.getBuildingsByType('CATAPULT').length;
            if (this.mockGame.crowdStats.catchingEnabled && catapults > 0) {
                // Rough estimate based on people flying
                const activeCatchers = Math.min(this.mockGame.crowd.people.length, catapults * 2); 
                tickSPS += activeCatchers * BaseCatchYieldPerSec * this.mockGame.crowdStats.sparklesPerParticleMultiplier * this.mockGame.crowdStats.collectionRadiusMultiplier;
            }

            // Gold
            const crowdCount = this.mockGame.crowd.people.length;
            tickGPS += crowdCount * BaseGoldDropsPerSecPerPerson * this.mockGame.crowdStats.goldRateMultiplier;

            this.currentSPS = tickSPS;
            this.currentGPS = tickGPS;

            this.mockGame.resourceManager.resources.sparkles.add(tickSPS * tickSize);
            this.mockGame.resourceManager.resources.gold.add(tickGPS * tickSize);

            // 2. Check Progression Unlocks
            const unlocked = this.progression.tick(this.mockGame);
            for(const u of unlocked) {
                this.events.push({ time: this.time, type: 'unlock', label: `Unlocked Feature: ${u}` });
            }

            // 3. Purchase Strategy (Greedy: Quickest to Afford of [Upgrades, Buildings])
            let purchasedSomething = true;
            while(purchasedSomething) {
                purchasedSomething = false;

                let bestOption = null;
                let lowestTimeToAfford = Infinity;

                const getResources = (currency) => {
                    if (currency === 'gold') return { amount: this.mockGame.resourceManager.resources.gold.amount, rate: tickGPS };
                    return { amount: this.mockGame.resourceManager.resources.sparkles.amount, rate: tickSPS };
                };

                // Check upgrades
                const defs = this.progression.getAllUpgradeDefs();
                for (const def of defs) {
                    if (!this.progression.isVisible(def.id, this.mockGame).visible) continue;
                    const canPurchase = this.progression.canPurchase(def.id, this.mockGame);
                    if (canPurchase.ok || canPurchase.reason.includes('Not enough')) { 
                        const cost = this.progression.getUpgradeCost(def.id);
                        const res = getResources(def.currency);
                        const deficit = Math.max(0, cost - res.amount);
                        const timeToAfford = deficit === 0 ? 0 : (res.rate <= 0 ? Infinity : deficit / res.rate);

                        if (timeToAfford < lowestTimeToAfford || (timeToAfford === lowestTimeToAfford && cost < (bestOption ? bestOption.cost : Infinity))) {
                            lowestTimeToAfford = timeToAfford;
                            bestOption = { type: 'upgrade', id: def.id, cost, currency: def.currency, def };
                        }
                    }
                }

                // Check buildings
                const buildingKeys = Object.keys(BUILDING_TYPES);
                for (const bType of buildingKeys) {
                    if (this.isBuildingTypeUnlocked(bType)) {
                        const count = this.mockGame.buildingManager.getBuildingsByType(bType).length;
                        if (bType === 'CATAPULT' && count >= this.mockGame.catapultStats.maxCatapults) continue;
                        
                        // Heuristic: Limit launchers / generators to not overpower early cheap upgrades indefinitely
                        if (bType === 'AUTO_LAUNCHER' && count >= 100) continue; 
                        
                        const cfg = BUILDING_TYPES[bType];
                        const cost = this.getBuildingCost(bType);
                        const res = getResources(cfg.currency);
                        const deficit = Math.max(0, cost - res.amount);
                        const timeToAfford = deficit === 0 ? 0 : (res.rate <= 0 ? Infinity : deficit / res.rate);

                        if (timeToAfford < lowestTimeToAfford || (timeToAfford === lowestTimeToAfford && cost < (bestOption ? bestOption.cost : Infinity))) {
                            lowestTimeToAfford = timeToAfford;
                            bestOption = { type: 'building', id: bType, cost, currency: cfg.currency, name: cfg.name };
                        }
                    }
                }

                if (bestOption && lowestTimeToAfford === 0) {
                    const res = this.mockGame.resourceManager.resources[bestOption.currency];
                    if (res && res.amount >= bestOption.cost) {
                        // Buy it!
                        if (bestOption.type === 'upgrade') {
                            this.progression.purchaseUpgrade(bestOption.id, this.mockGame);
                            const newLvl = this.progression.getUpgradeLevel(bestOption.id);
                            this.events.push({ time: this.time, type: 'upgrade', label: `Upgraded ${bestOption.def.name} to Lvl ${newLvl}` });
                            purchasedSomething = true;
                        } else if (bestOption.type === 'building') {
                            res.subtract(bestOption.cost);
                            this.mockGame.buildingManager.buildings.push({ type: bestOption.id });
                            const newCount = this.mockGame.buildingManager.getBuildingsByType(bestOption.id).length;
                            // Only record milestone buying events for buildings to not spam timeline
                            if (newCount <= 10 || newCount % 10 === 0) {
                                this.events.push({ time: this.time, type: 'building', label: `Bought ${bestOption.name} (Count: ${newCount})` });
                            }
                            this.syncCrowd(); // crowd scales with fps, fps scales with buildings
                            purchasedSomething = true;
                        }
                    }
                }
            }

            // 4. Record history every 10 seconds or so to avoid huge arrays
            if (this.time - lastReportTime >= 10) {
                this.history.push({
                    time: this.time,
                    sparkles: this.mockGame.resourceManager.resources.sparkles.amount,
                    gold: this.mockGame.resourceManager.resources.gold.amount,
                    sps: tickSPS,
                    gps: tickGPS,
                });
                lastReportTime = this.time;
            }
        }

        const unpurchasedUpgrades = [];
        const defs = this.progression.getAllUpgradeDefs();
        for (const def of defs) {
            const currentLvl = this.progression.getUpgradeLevel(def.id);
            const maxLevel = def.maxLevel || 1;
            if (currentLvl < maxLevel) {
                const isVisible = this.progression.isVisible(def.id, this.mockGame).visible;
                unpurchasedUpgrades.push({
                    id: def.id,
                    name: def.name,
                    level: currentLvl,
                    maxLevel: maxLevel,
                    visible: isVisible
                });
            }
        }

        return {
            history: this.history,
            events: this.events,
            unpurchasedUpgrades: unpurchasedUpgrades
        };
    }
}
