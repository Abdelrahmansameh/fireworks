import LivePurchasePolicy from './LivePurchasePolicy.js';
import { BUILDING_TYPES } from '../config/config.js';
import { GAME_BOUNDS } from '../config/GameBoundsConfig.js';

const PRESETS = {
    active: { opening: 2, cruising: 0.3, openingSeconds: 120, throwInterval: 20 },
    relaxed: { opening: 1, cruising: 0.15, openingSeconds: 120, throwInterval: 45 },
    idle: { opening: 1, cruising: 0, openingSeconds: 90, throwInterval: Infinity },
};

const copy = value => JSON.parse(JSON.stringify(value));
const difference = (current, previous) => Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(previous)])]
        .map(key => [key, (current[key] || 0) - (previous[key] || 0)])
);

/** Plays the actual rendered game: all launches, catches and purchases use its public actions. */
export default class GameBot {
    constructor(game) {
        this.game = game;
        this.preset = 'active';
        this.clicksPerSec = PRESETS.active.opening;
        this.speedMultiplier = 1;
        this.enabled = false;
        this.complete = false;
        this.policy = new LivePurchasePolicy();
        this.PURCHASE_INTERVAL = 0.75;
        this.SAMPLE_INTERVAL = 30;
        this._reset();
    }

    start() {
        if (this.complete) return; // A new test requires a fresh game, not a completed save.
        if (!this._baseline) {
            this._baseline = this._totals();
            this._rateHistory = [{ time: 0, ...this._baseline }];
            this._lastSampleTotals = this._baseline;
            this._initialWallet = this._wallet();
            this._finalesAtStart = this.game.grandFinaleManager?.timesFired ?? 0;
            this._sample();
        }
        this.enabled = true;
        this._log('bot', `${this.preset} bot started`);
    }

    stop() {
        this.enabled = false;
        this._log('bot', 'Bot paused');
    }

    setPreset(name) {
        if (name === 'custom') { this.preset = name; return; }
        if (!PRESETS[name]) return;
        this.preset = name;
        this.clicksPerSec = PRESETS[name].opening;
    }

    setClicksPerSec(value) {
        this.preset = 'custom';
        this.clicksPerSec = Math.max(0, Math.min(4, Number(value) || 0));
    }

    setSpeedMultiplier(value) {
        this.speedMultiplier = Math.max(1, Math.min(50, Math.floor(Number(value) || 1)));
    }

    getEffectiveClickRate() {
        const preset = PRESETS[this.preset];
        return preset ? (this.gameTime < preset.openingSeconds ? preset.opening : preset.cruising) : this.clicksPerSec;
    }

    _reset() {
        this.complete = false;
        this.finalReport = null;
        this.gameTime = 0;
        this.events = [];
        this.samples = [];
        this.milestones = {};
        this.spending = { sparkles: 0, gold: 0 };
        this.purchases = [];
        this.maxPurchaseGap = 0;
        this._lastPurchaseTime = 0;
        this._clickAccumulator = 0;
        this._purchaseTimer = 0;
        this._throwTimer = 0;
        this._sampleTimer = 0;
        this._rateTimer = 0;
        this._baseline = null;
        this._rateHistory = [];
        this._lastSampleTime = 0;
        this._sawFinale = false;
        this.manualClicks = 0;
        this.manualThrows = 0;
        this.policy.reset();
    }

    /** Called after every fixed physics substep by FireworkGame. */
    tick(dt) {
        if (!this.enabled || this.complete) return;
        this.gameTime += dt;
        this._updateRates(dt);
        this._doClicks(dt);
        this._doPurchases(dt);
        this._doCrowdThrow(dt);
        this._checkMilestones();
        this._checkCompletion();
        this._sampleTimer += dt;
        if (this._sampleTimer >= this.SAMPLE_INTERVAL) {
            this._sampleTimer %= this.SAMPLE_INTERVAL;
            this._sample();
        }
    }

    _doClicks(dt) {
        if (this.game.isInputDisabled || this.game.cinematicManager?.isPlaying) return;
        this._clickAccumulator += this.getEffectiveClickRate() * dt;
        const count = Math.floor(this._clickAccumulator);
        this._clickAccumulator -= count;
        for (let i = 0; i < count; i++) {
            const x = GAME_BOUNDS.LAUNCHER_MIN_X + Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X);
            const y = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y + Math.random() * (GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y);
            this.game.launchCursorCyclingFireworkAt(x, y);
            this.manualClicks++;
        }
    }

    _doPurchases(dt) {
        if (this.game.cinematicManager?.isPlaying) return;
        this._purchaseTimer += dt;
        if (this._purchaseTimer < this.PURCHASE_INTERVAL) return;
        this._purchaseTimer %= this.PURCHASE_INTERVAL;
        // One decision at human cadence, including while fast-forwarding.
        const purchase = this.policy.runTick(this.game, this.getMeasuredRates());
        if (!purchase) return;
        const gap = this.gameTime - this._lastPurchaseTime;
        this.maxPurchaseGap = Math.max(this.maxPurchaseGap, gap);
        this._lastPurchaseTime = this.gameTime;
        this.spending[purchase.currency] += purchase.cost;
        for (const [currency, cost] of Object.entries(purchase.secondaryCost || {})) this.spending[currency] = (this.spending[currency] || 0) + cost;
        this.purchases.push({ time: this.gameTime, ...purchase });
        const paid = [`${purchase.cost} ${purchase.currency}`, ...Object.entries(purchase.secondaryCost || {}).map(([currency, cost]) => `${cost} ${currency}`)].join(' + ');
        this._log(purchase.type, purchase.type === 'upgrade'
            ? `${purchase.name} level ${purchase.level} (${paid})`
            : `${purchase.name} #${purchase.count} (${paid})`);
    }

    _doCrowdThrow(dt) {
        if (this.game.isInputDisabled || this.game.cinematicManager?.isPlaying) return;
        if (!this.game.crowdStats?.catchingEnabled || !this.game.crowd?.people.length) return;
        const interval = PRESETS[this.preset]?.throwInterval ?? PRESETS.active.throwInterval;
        this._throwTimer += dt;
        if (this._throwTimer < interval) return;
        this._throwTimer %= interval;
        const x = GAME_BOUNDS.LAUNCHER_MIN_X;
        const y = (GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y + GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y) / 2;
        if (this.game.crowd.throwNearestToward(x, y)) this.manualThrows++;
    }

    _checkMilestones() {
        const game = this.game;
        const states = {
            firstUpgrade: game.progression.getUpgradeLevel('base_mult_1') > 0,
            autoLaunchersUnlocked: game.isBuildingTypeUnlocked('AUTO_LAUNCHER'),
            firstAutoLauncher: this._count('AUTO_LAUNCHER') > 0,
            crowd: (game.crowd?.people.length ?? 0) > 0,
            crowdCatching: !!game.crowdStats?.catchingEnabled,
            catapultsUnlocked: game.isBuildingTypeUnlocked('CATAPULT'),
            firstCatapult: this._count('CATAPULT') > 0,
            dronesUnlocked: game.isBuildingTypeUnlocked('DRONE_HUB'),
            firstDroneHub: this._count('DRONE_HUB') > 0,
            secondDroneHub: this._count('DRONE_HUB') >= 2,
            droneSlots: game.progression.getUpgradeLevel('drone_max') > 0,
            generatorsUnlocked: game.isBuildingTypeUnlocked('RESOURCE_GENERATOR'),
            firstGenerator: this._count('RESOURCE_GENERATOR') > 0,
            recipes: game.progression.isUnlocked('recipes_tab'),
            unlock_recipes_tab: game.progression.getUpgradeLevel('unlock_recipes_tab') > 0,
            creator: game.advancedCreatorUnlocked,
            finaleUnlocked: !!game.grandFinaleUnlocked,
            finaleStarted: (game.grandFinaleManager?.timesFired ?? 0) > this._finalesAtStart,
        };
        for (const definition of game.progression.getAllUpgradeDefs()) {
            if (!definition.patternKey) continue;
            states[definition.id] = game.progression.getUpgradeLevel(definition.id) > 0;
        }
        for (const [id, met] of Object.entries(states)) {
            if (!met || Object.hasOwn(this.milestones, id)) continue;
            this.milestones[id] = this.gameTime;
            this._log('milestone', id);
        }
    }

    _checkCompletion() {
        const finale = this.game.grandFinaleManager;
        if (!finale) return;
        if (this.game.grandFinaleUnlocked && !this._sawFinale && finale.canTrigger()) {
            if (this.game.triggerGrandFinale) this.game.triggerGrandFinale();
            else finale.trigger();
        }
        if (finale.active && finale.timesFired > this._finalesAtStart) this._sawFinale = true;
        if (!this._sawFinale || finale.active) return;
        this.complete = true;
        this.enabled = false;
        this.milestones.finaleComplete = this.gameTime;
        this._log('complete', `Grand finale completed in ${Math.floor(this.gameTime / 60)}m ${Math.floor(this.gameTime % 60)}s`);
        this._sample();
        this.finalReport = copy(this.getReport());
    }

    _count(type) { return this.game.buildingManager.getBuildingsByType(type).length; }
    _wallet() { return { sparkles: this.game.resourceManager.resources.sparkles.amount, gold: this.game.resourceManager.resources.gold.amount }; }
    _totals() {
        const stats = this.game.statsTracker;
        return {
            sparkles: stats.sessionSparkles,
            gold: stats.sessionGold,
            fireworks: stats.sessionFireworks,
            sparklesBySource: { ...stats.sessionSparklesBySource },
            goldBySource: { ...stats.sessionGoldBySource },
            fireworksBySource: { ...stats.sessionFireworksBySource },
        };
    }

    _updateRates(dt) {
        this._rateTimer += dt;
        if (this._rateTimer < 1) return;
        this._rateTimer %= 1;
        this._rateHistory.push({ time: this.gameTime, ...this._totals() });
        while (this._rateHistory.length > 1 && this._rateHistory[1].time < this.gameTime - 10) this._rateHistory.shift();
    }

    getMeasuredRates() {
        const previous = this._rateHistory[0];
        const elapsed = previous ? this.gameTime - previous.time : 0;
        const totals = this._totals();
        if (elapsed <= 0) return { sps: 0, gps: 0, fps: 0, launcherFPS: 0, bySource: {} };
        return {
            sps: (totals.sparkles - previous.sparkles) / elapsed,
            gps: (totals.gold - previous.gold) / elapsed,
            fps: (totals.fireworks - previous.fireworks) / elapsed,
            launcherFPS: ((totals.fireworksBySource.auto_launcher || 0) - (previous.fireworksBySource.auto_launcher || 0)) / elapsed,
            bySource: Object.fromEntries(Object.entries(difference(totals.sparklesBySource, previous.sparklesBySource)).map(([source, value]) => [source, value / elapsed])),
        };
    }

    _sample() {
        const totals = this._totals();
        const previous = this._lastSampleTotals ?? totals;
        const duration = this.gameTime - this._lastSampleTime;
        const snapshot = this._snapshot();
        this.samples.push({
            ...snapshot,
            interval: duration,
            earned: { sparkles: totals.sparkles - previous.sparkles, gold: totals.gold - previous.gold },
            sourceIncome: { sparkles: difference(totals.sparklesBySource, previous.sparklesBySource), gold: difference(totals.goldBySource, previous.goldBySource) },
            intervalSPS: duration > 0 ? (totals.sparkles - previous.sparkles) / duration : 0,
            intervalGPS: duration > 0 ? (totals.gold - previous.gold) / duration : 0,
            intervalFPS: duration > 0 ? (totals.fireworks - previous.fireworks) / duration : 0,
            intervalLauncherFPS: duration > 0 ? ((totals.fireworksBySource.auto_launcher || 0) - (previous.fireworksBySource.auto_launcher || 0)) / duration : 0,
            upgradeLevels: { ...this.game.progression.getState().upgrades },
            spending: { ...this.spending },
            goal: this.policy.goal,
        });
        this._lastSampleTotals = totals;
        this._lastSampleTime = this.gameTime;
    }

    _snapshot() {
        const rates = this.getMeasuredRates();
        const buildings = Object.fromEntries(Object.entries(BUILDING_TYPES).map(([type, definition]) => [type, { name: definition.name, count: this._count(type) }]));
        return {
            elapsed: this.gameTime,
            ...this._wallet(),
            sps: rates.sps,
            gps: rates.gps,
            fps: rates.fps,
            launcherFPS: rates.launcherFPS,
            launcherCapacityFPS: this.game.buildingManager.getTheoreticalAutoLauncherFPS(),
            crowd: this.game.crowd?.people.length ?? 0,
            naturalCrowd: Math.max(0, (this.game.crowd?.people.length ?? 0) - (this.game.crowdStats?.countBonus ?? 0)),
            crowdStartFireworks: this.game.crowdStartFireworks,
            crowdStartedAt: this.game.crowdStartedAt,
            recipesUnlocked: this.game.progression.isUnlocked('recipes_tab'),
            advancedCreatorUnlocked: !!this.game.advancedCreatorUnlocked,
            unlockedPatterns: [...(this.game.unlockedPatternKeys ?? [])],
            fireworks: this.game.fireworkSystem.fireworkCount,
            activeParticles: this.game.particleSystem?.getTotalActiveParticles() ?? 0,
            buildings,
        };
    }

    _log(type, label) { this.events.push({ time: this.gameTime, type, label }); }

    getReport() {
        // The world keeps rendering after the bot finishes. Preserve the exact
        // finish totals and rates instead of counting income after its clock stops.
        if (this.complete && this.finalReport) return this.finalReport;
        const game = this.game;
        const totals = this._totals();
        const baseline = this._baseline ?? totals;
        const sparkleSources = difference(totals.sparklesBySource, baseline.sparklesBySource);
        const goldSources = difference(totals.goldBySource, baseline.goldBySource);
        let totalLevels = 0;
        let purchasedLevels = 0;
        const remaining = [];
        for (const definition of game.progression.getAllUpgradeDefs()) {
            const maxLevel = definition.maxLevel ?? 1;
            const level = game.progression.getUpgradeLevel(definition.id);
            totalLevels += maxLevel;
            purchasedLevels += level;
            if (level < maxLevel) remaining.push({ id: definition.id, name: definition.name, level, maxLevel, visible: game.progression.isVisible(definition.id, game).visible });
        }
        return {
            complete: this.complete,
            preset: this.preset,
            ...this._snapshot(),
            productionBreakdown: {
                sparkles: { clicks: sparkleSources.manual || 0, launchers: sparkleSources.auto_launcher || 0, generators: sparkleSources.resource_generator || 0, drones: sparkleSources.drone || 0, crowdCatching: sparkleSources.crowd_catch || 0, grandFinale: sparkleSources.grand_finale || 0 },
                gold: { crowd: goldSources.crowd || 0 },
            },
            earned: { sparkles: totals.sparkles - baseline.sparkles, gold: totals.gold - baseline.gold },
            spending: { ...this.spending },
            maxPurchaseGap: Math.max(this.maxPurchaseGap, this.gameTime - this._lastPurchaseTime),
            currentPurchaseGap: this.gameTime - this._lastPurchaseTime,
            manualClicks: this.manualClicks,
            manualThrows: this.manualThrows,
            goal: this.policy.goal,
            milestones: { ...this.milestones },
            upgrades: { purchasedLevels, totalLevels, remaining },
            purchases: this.purchases,
            samples: this.samples,
            events: this.events,
        };
    }
}
