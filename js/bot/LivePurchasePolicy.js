import { BUILDING_TYPES } from '../config/config.js';
import Building from '../buildings/Building.js';

const UNLOCK_UPGRADE = {
    AUTO_LAUNCHER: 'auto_launcher',
    RESOURCE_GENERATOR: 'resource_generator',
    CATAPULT: 'catapult',
    DRONE_HUB: 'drone_hub',
};

/**
 * A goal-driven player for the live game, independent of js/sim.
 * It saves for the next mechanic, buys cheaper useful investments during long
 * waits, and respects the same visibility, prerequisites and caps as the UI.
 * Decisions use measured income from actual launches and particle catches.
 */
export default class LivePurchasePolicy {
    constructor() { this.reset(); }

    reset() { this.goal = null; }

    _count(game, type) { return game.buildingManager.getBuildingsByType(type).length; }

    _nextBeat(game) {
        if (this._count(game, 'AUTO_LAUNCHER') === 0) return { building: 'AUTO_LAUNCHER', label: 'First auto launcher' };
        // The crowd's economic introduction comes before either collection system.
        const crowdUnlock = game.progression.getUpgradeDef('crowd_unlock') ? 'crowd_unlock' : 'crowd_spark_1';
        if (game.progression.getUpgradeLevel(crowdUnlock) === 0) return { upgrade: crowdUnlock, label: 'Welcome the crowd' };
        if (this._count(game, 'CATAPULT') === 0) return { building: 'CATAPULT', label: 'First catapult' };
        if (game.progression.getUpgradeDef('unlock_recipes_tab') && game.progression.getUpgradeLevel('unlock_recipes_tab') === 0) return { upgrade: 'unlock_recipes_tab', label: 'Create firework recipes' };
        if (this._count(game, 'DRONE_HUB') === 0) return { building: 'DRONE_HUB', label: 'First drone hub' };
        return { upgrade: 'grand_finale', label: 'Grand finale' };
    }

    _requirements(game, beat) {
        const needed = new Map();
        const visiting = new Set();
        const building = (type, count = 1) => {
            if (this._count(game, type) >= count) return;
            const key = `building:${type}`;
            needed.set(key, Math.max(count, needed.get(key) || 0));
            if (!game.isBuildingTypeUnlocked(type)) upgrade(UNLOCK_UPGRADE[type], 1);
        };
        const upgrade = (id, level = 1) => {
            if (!id || game.progression.getUpgradeLevel(id) >= level || visiting.has(id)) return;
            const definition = game.progression.getUpgradeDef(id);
            if (!definition) return;
            visiting.add(id);
            needed.set(`upgrade:${id}`, Math.max(level, needed.get(`upgrade:${id}`) || 0));
            if (definition.treeParent && definition.treeParent !== 'ROOT') upgrade(definition.treeParent, 1);
            for (const [required, minimum] of Object.entries(definition.requires?.upgrades || {})) upgrade(required, minimum);
            for (const type of definition.requires?.buildings || []) upgrade(UNLOCK_UPGRADE[type], 1);
            for (const [type, minimum] of Object.entries(definition.requires?.buildingCounts || {})) building(type, minimum);
            if (definition.requires?.stats?.launcherCount) building('AUTO_LAUNCHER', definition.requires.stats.launcherCount);
            visiting.delete(id);
        };
        if (beat.building) building(beat.building);
        else upgrade(beat.upgrade);
        return needed;
    }

    _candidates(game) {
        const candidates = [];
        for (const definition of game.progression.getAllUpgradeDefs()) {
            if (!game.progression.isVisible(definition.id, game).visible) continue;
            const check = game.progression.canPurchase(definition.id, game);
            if (!check.ok && !check.reason?.startsWith('Not enough')) continue;
            if (!this._hasUsefulSource(game, definition)) continue;
            candidates.push({ kind: 'upgrade', key: `upgrade:${definition.id}`, id: definition.id, name: definition.name, currency: definition.currency, cost: game.progression.getUpgradeCost(definition.id), secondaryCost: { ...definition.secondaryCost }, definition });
        }
        for (const [type, definition] of Object.entries(BUILDING_TYPES)) {
            if (!game.isBuildingTypeUnlocked(type)) continue;
            const count = this._count(game, type);
            // Use the live manager's cap, including the final partly useful hub,
            // rather than maintaining a second model of airborne coverage.
            if (game.buildingManager.getBuildingLimit && count >= game.buildingManager.getBuildingLimit(type)) continue;
            if (count >= (definition.maxCount ?? definition.maxInstances ?? 100)) continue;
            if (type === 'CATAPULT' && count >= (game.catapultStats?.maxCatapults ?? 1)) continue;
            if (type === 'DRONE_HUB' && count > 0 && !game.buildingManager.getBuildingLimit) {
                const uptime = definition.baseDroneLifetime * (game.droneStats?.lifetimeMultiplier ?? 1)
                    / (definition.baseSpawnInterval * (game.droneHubStats?.spawnIntervalMultiplier ?? 1));
                if (count * uptime >= (game.droneStats?.maxDrones ?? Infinity)) continue;
            }
            candidates.push({ kind: 'building', key: `building:${type}`, id: type, name: definition.name, currency: definition.currency, cost: Building.getPurchaseCost(type, count), definition });
        }
        return candidates;
    }

    _hasUsefulSource(game, definition) {
        const id = definition.id;
        if (id === 'grand_finale' || id === 'auto_launcher' || id === 'resource_generator' || id === 'catapult' || id === 'drone_hub') return true;
        if (id.startsWith('launcher_') && this._count(game, 'AUTO_LAUNCHER') === 0) return false;
        if (id.startsWith('generator_') && this._count(game, 'RESOURCE_GENERATOR') === 0) return false;
        if (id.startsWith('drone_') && this._count(game, 'DRONE_HUB') === 0) return false;
        if (id.startsWith('catapult_') && this._count(game, 'CATAPULT') === 0) return false;
        if (id.startsWith('crowd_catcher_') && id !== 'crowd_catcher_unlock' && !game.crowdStats?.catchingEnabled) return false;
        return true;
    }

    _investmentWeight(game, candidate) {
        const id = candidate.id;
        if (candidate.kind === 'building') {
            if (id === 'AUTO_LAUNCHER') return 1.5;
            if (id === 'RESOURCE_GENERATOR') return 1.0;
            if (id === 'CATAPULT') return 1.1;
            if (id === 'DRONE_HUB') return 1.1;
        }
        // Workshop cards are optional for finishing, but they are productive
        // choices the player should exercise when gold is plentiful.
        if (id === 'resource_generator') return 1.1;
        if (id.startsWith('generator_')) return 0.9;
        if (id === 'unlock_advanced_creator') return 0.8;
        if (candidate.definition.onPurchase) return 1.25;
        if (candidate.definition.botOptional || id.startsWith('unlock_')) return 0.15;
        if (id.startsWith('crowd_gold')) return 2.0;
        if (id.startsWith('base_mult') || id.startsWith('spark_core') || id.startsWith('crowd_spark')) return 1.7;
        if (id.startsWith('launcher_spawn') || id.startsWith('launcher_overclock')) return 1.5;
        if (id.startsWith('launcher_sparkle')) return 1.3;
        if (id.startsWith('crowd_invite')) return 1.25;
        if (id === 'drone_max') {
            const hubs = this._count(game, 'DRONE_HUB');
            const definition = BUILDING_TYPES.DRONE_HUB;
            const expected = hubs * definition.baseDroneLifetime * (game.droneStats?.lifetimeMultiplier ?? 1)
                / (definition.baseSpawnInterval * (game.droneHubStats?.spawnIntervalMultiplier ?? 1));
            return expected >= (game.droneStats?.maxDrones ?? Infinity) * 0.75 ? 0.9 : 0;
        }
        return 1;
    }

    _costs(candidate) {
        const costs = { [candidate.currency]: candidate.cost };
        for (const [currency, cost] of Object.entries(candidate.secondaryCost || {})) costs[currency] = (costs[currency] || 0) + cost;
        return costs;
    }

    _canAfford(game, candidate) {
        if (!Object.entries(this._costs(candidate)).every(([currency, cost]) => (game.resourceManager.resources[currency]?.amount ?? 0) >= cost)) return false;
        return candidate.kind === 'building' || game.progression.canPurchase(candidate.id, game).ok;
    }

    runTick(game, rates) {
        if (game.grandFinaleUnlocked) { this.goal = { label: 'Watch the grand finale' }; return null; }
        const beat = this._nextBeat(game);
        const needed = this._requirements(game, beat);
        const candidates = this._candidates(game);
        const amount = currency => game.resourceManager.resources[currency]?.amount ?? 0;
        const rate = currency => currency === 'gold' ? rates.gps : rates.sps;
        const wait = candidate => Math.max(...Object.entries(this._costs(candidate)).map(([currency, cost]) => Math.max(0, cost - amount(currency)) / Math.max(0.001, rate(currency))));
        const costTime = candidate => Math.max(...Object.entries(this._costs(candidate)).map(([currency, cost]) => cost / Math.max(0.001, rate(currency))));
        const required = candidates.filter(candidate => needed.has(candidate.key));
        required.sort((a, b) => wait(a) - wait(b) || costTime(a) - costTime(b));
        const target = required[0];
        this.goal = target
            ? { label: beat.label, next: target.name, currency: target.currency, cost: target.cost, secondaryCost: target.secondaryCost, wait: wait(target) }
            : { label: beat.label, next: 'Build income and meet prerequisites' };

        // Affordable steps toward a mechanic take precedence over side purchases.
        const ready = required.find(candidate => this._canAfford(game, candidate));
        if (ready) return this._buy(game, ready, 'progression');

        const investments = candidates.filter(candidate => {
            if (needed.has(candidate.key) || !this._canAfford(game, candidate)) return false;
            const weight = this._investmentWeight(game, candidate);
            if (weight <= 0) return false;
            // Protect the last few seconds of saving, but allow useful investments
            // while another currency is the bottleneck.
            for (const [currency, cost] of Object.entries(this._costs(candidate))) {
                const ownTarget = required.find(requiredCandidate => Object.hasOwn(this._costs(requiredCandidate), currency));
                if (ownTarget && (wait(ownTarget) < 20 || cost > this._costs(ownTarget)[currency] * 0.35)) return false;
            }
            const maxIncomeSeconds = weight < 0.5 ? 8 : 45 * weight;
            return costTime(candidate) <= maxIncomeSeconds;
        });
        investments.sort((a, b) => costTime(a) / this._investmentWeight(game, a) - costTime(b) / this._investmentWeight(game, b));
        return investments[0] ? this._buy(game, investments[0], 'investment') : null;
    }

    _buy(game, candidate, reason) {
        if (candidate.kind === 'upgrade') {
            const before = game.progression.getUpgradeLevel(candidate.id);
            game.buyUpgrade(candidate.id);
            const level = game.progression.getUpgradeLevel(candidate.id);
            if (level <= before) return null;
            return { type: 'upgrade', id: candidate.id, name: candidate.name, level, currency: candidate.currency, cost: candidate.cost, secondaryCost: { ...candidate.secondaryCost }, reason };
        }
        const before = this._count(game, candidate.id);
        game.buyBuilding(candidate.id);
        const count = this._count(game, candidate.id);
        if (count <= before) return null;
        return { type: 'building', id: candidate.id, name: candidate.name, count, currency: candidate.currency, cost: candidate.cost, reason };
    }
}
