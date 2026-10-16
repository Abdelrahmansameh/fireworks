import { BUILDING_TYPES, DRONE_CONFIG } from '../config/config.js';
import { SKILL_TREE_CONFIG, SHOW_MILESTONES } from '../ui/SkillTreeConfig.js';
import { roundUpClean } from '../utils/costRounding.js';

const PROGRESSION_SCHEMA_VERSION = 3;
// Historical charges for saves written before purchase ledgers existed.
const LEGACY_BASE_COSTS = {
    auto_launcher: 45,
    base_mult_1: 60,
    launcher_spawn_rate: 100,
    crowd_spark_1: 220,
    crowd_fireworks: 80,
    crowd_gold_1: 80,
    unlock_recipes_tab: 180,
    unlock_brokenHeart: 120,
    unlock_christmasTree: 160,
    unlock_spinner: 240,
    unlock_helix: 480,
    unlock_snowflake: 900,
    unlock_dragonsBreath: 1500,
    crowd_invite_1: 700,
    crowd_catcher_unlock: 900,
    resource_generator: 600,
    generator_production: 1600,
    catapult: 2400,
    catapult_spawn_rate: 1300,
    catapult_max: 2200,
    crowd_catcher_yield: 1800,
    crowd_catcher_radius: 700,
    catapult_range_1: 300,
    spark_core_2: 4000,
    launcher_sparkle_1: 8000,
    crowd_gold_2: 5000,
    crowd_invite_2: 3000,
    drone_hub: 14000,
    drone_lifetime: 4500,
    drone_speed: 2000,
    drone_max: 10000,
    drone_sparkle_yield: 6500,
    drone_radius: 2000,
    drone_efficiency: 15000,
    unlock_advanced_creator: 3000,
    launcher_overclock: 55000,
    spark_core_3: 80000,
    launcher_sparkle_2: 120000,
    grand_finale: 900000,
};

// Old bundle prices are retained only to refund existing purchases accurately.
const LEGACY_BUNDLES = [
    { id: 'crowd_catcher_yield', baseCost: 2800, costRatio: 4, targets: ['crowd_catcher_yield', 'crowd_catcher_radius', 'catapult_range_1'] },
    { id: 'crowd_gold_2', baseCost: 8000, costRatio: 1, targets: ['crowd_gold_2', 'crowd_invite_2'] },
    { id: 'drone_lifetime', baseCost: 6500, costRatio: 1, targets: ['drone_lifetime', 'drone_speed'] },
    { id: 'drone_sparkle_yield', baseCost: 8500, costRatio: 3.5, targets: ['drone_sparkle_yield', 'drone_radius'] },
    { id: 'drone_efficiency', baseCost: 18000, costRatio: 1, targets: ['drone_efficiency', 'unlock_advanced_creator'] },
];

const LEGACY_UNLOCKS = [
    ['crowd_spark_1', ['unlock_recipes_tab', 'unlock_brokenHeart', 'unlock_christmasTree']],
    ['catapult', ['unlock_spinner', 'unlock_helix']],
    ['drone_hub', ['unlock_snowflake', 'unlock_dragonsBreath']],
];

/**
 * ProgressionManager — centralized state for all upgrades and unlock nodes.
 *
 * Initialized with a PROGRESSION_CONFIG array (see ProgressionConfig.js).
 * Owned by FireworkGame as `game.progression`.
 *
 * Responsibilities:
 *   - Track which unlock nodes have been triggered (isUnlocked)
 *   - Track purchased upgrade levels (getUpgradeLevel)
 *   - Evaluate unlock node conditions each tick (tick)
 *   - Recompute all game stat multipliers from scratch (applyAll)
 *   - Validate and execute upgrade purchases (purchaseUpgrade)
 *   - Serialize / deserialize state for localStorage
 */
class ProgressionManager {
    constructor(config) {
        /** @type {Map<string, object>} upgrade defs keyed by id */
        this._upgrades = new Map();
        /** @type {Map<string, object>} unlock node defs keyed by id */
        this._unlockNodes = new Map();

        for (const entry of config) {
            if (entry.type === 'unlock') {
                this._unlockNodes.set(entry.id, entry);
            }
        }

        for (const [id, node] of Object.entries(SKILL_TREE_CONFIG.nodes)) {
            const upgradeDef = { ...node, id };
            this._upgrades.set(id, upgradeDef);
        }

        /** @type {Object.<string, number>} id → purchased level */
        this._upgradeLevels = {};
        /** Per-level wallet charges; inherited unlocks carry an empty charge. */
        this._purchaseCosts = {};
        /** @type {Set<string>} set of unlocked node IDs */
        this._unlockedSet = new Set();
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    /**
     * Restore state from a previously serialized object.
     * Safe to call with null / undefined / empty object (no-op).
     */
    loadState(data, savedPatterns = []) {
        if (!data || typeof data !== 'object') return;
        const savedUpgrades = data.upgrades && typeof data.upgrades === 'object'
            ? { ...data.upgrades } : { ...this._upgradeLevels };
        const upgrades = { ...savedUpgrades };
        const schemaVersion = Number(data.schemaVersion) || 0;
        const legacy = schemaVersion < 2;
        const unlocked = Array.isArray(data.unlocked)
            ? new Set(data.unlocked.filter(id => typeof id === 'string')) : new Set(this._unlockedSet);
        const inherit = (id, level) => {
            if (!this._upgrades.has(id)) return;
            upgrades[id] = Math.max(this._savedLevel(id, upgrades[id]), this._savedLevel(id, level));
        };

        if (legacy) {
            for (const [source, targets] of LEGACY_UNLOCKS) {
                if (this._savedLevel(source, savedUpgrades[source]) > 0) {
                    targets.forEach(id => inherit(id, 1));
                }
            }
            for (const bundle of LEGACY_BUNDLES) {
                const level = this._savedLevel(bundle.id, savedUpgrades[bundle.id]);
                bundle.targets.forEach(id => inherit(id, level));
            }
        }

        if (schemaVersion < 3) {
            // Former launcher-earned patterns become owned upgrades, with no
            // charge attached. Player recipes and assignments stay untouched.
            for (const key of Array.isArray(savedPatterns) ? savedPatterns : []) {
                const def = [...this._upgrades.values()].find(upgrade => upgrade.patternKey === key);
                if (def) unlocked.add(def.unlockId);
            }
            if (savedUpgrades.auto_launcher > 0 || savedUpgrades.unlock_advanced_creator > 0
                || unlocked.has('recipes_tab') || unlocked.has('advanced_creator')) {
                inherit('unlock_recipes_tab', 1);
            }
        }

        // Some saves recorded an unlock before recording its purchase. Keep
        // that feature owned so its card cannot charge for an existing effect.
        for (const [id, def] of this._upgrades) {
            if (def.unlockId && unlocked.has(def.unlockId)) inherit(id, 1);
        }

        this._upgradeLevels = {};
        this._purchaseCosts = {};
        this._unlockedSet = unlocked;
        for (const [id] of this._upgrades) {
            const level = this._savedLevel(id, upgrades[id]);
            if (level === 0) continue;
            this._upgradeLevels[id] = level;
            const savedLevel = this._savedLevel(id, savedUpgrades[id]);
            this._purchaseCosts[id] = Array.from({ length: level }, (_, index) => {
                const recorded = !legacy ? data.purchaseCosts?.[id]?.[index] : null;
                if (recorded && typeof recorded === 'object' && !Array.isArray(recorded)) {
                    return this._cleanCosts(recorded);
                }
                return index < savedLevel ? this._levelCosts(id, index, legacy) : {};
            });
        }

        if (legacy) {
            for (const bundle of LEGACY_BUNDLES) {
                const level = this._savedLevel(bundle.id, savedUpgrades[bundle.id]);
                const targets = bundle.targets.filter(id => this._upgrades.has(id));
                for (let index = 0; index < level; index++) {
                    let remaining = roundUpClean(bundle.baseCost * Math.pow(bundle.costRatio, index));
                    targets.forEach((id, targetIndex) => {
                        if (!this._purchaseCosts[id] || index >= this.getUpgradeLevel(id)) return;
                        const amount = targetIndex === targets.length - 1 ? remaining
                            : Math.min(remaining, this._levelCosts(id, index, true).gold ?? 0);
                        this._purchaseCosts[id][index] = { gold: amount };
                        remaining -= amount;
                    });
                }
            }
        }
        // The late Studio purchase is now part of the early Creator. Retain
        // its original charge so resetting upgrades refunds the actual spend.
        if (schemaVersion < 3 && savedUpgrades.unlock_advanced_creator > 0
            && (!legacy || !(savedUpgrades.drone_efficiency > 0))) {
            const charge = !legacy && data.purchaseCosts?.unlock_advanced_creator?.[0];
            const costs = charge && typeof charge === 'object' ? this._cleanCosts(charge) : { gold: 3000 };
            const creatorCosts = this._purchaseCosts.unlock_recipes_tab?.[0];
            if (creatorCosts) {
                for (const [currency, amount] of Object.entries(costs)) creatorCosts[currency] = (creatorCosts[currency] ?? 0) + amount;
            }
        }
    }

    /** Returns a plain object suitable for JSON.stringify / localStorage. */
    getState() {
        return {
            schemaVersion: PROGRESSION_SCHEMA_VERSION,
            upgrades: { ...this._upgradeLevels },
            unlocked: [...this._unlockedSet],
            purchaseCosts: Object.fromEntries(Object.entries(this._purchaseCosts)
                .map(([id, costs]) => [id, costs.map(cost => ({ ...cost }))])),
        };
    }

    // ── Unlock queries ────────────────────────────────────────────────────────

    isUnlocked(id) {
        return this._unlockedSet.has(id);
    }

    /** Explicitly record an unlock (e.g. triggered by a skill-tree node). */
    recordUnlock(id) {
        this._unlockedSet.add(id);
    }

    // ── Upgrade queries ───────────────────────────────────────────────────────

    getUpgradeLevel(id) {
        return this._upgradeLevels[id] ?? 0;
    }

    getUpgradeDef(id) {
        return this._upgrades.get(id) ?? null;
    }

    /** Returns an array of all upgrade definitions in insertion order. */
    getAllUpgradeDefs() {
        return [...this._upgrades.values()];
    }

    getNextMilestone() {
        return SHOW_MILESTONES.map(id => this._upgrades.get(id))
            .find(def => this.getUpgradeLevel(def.id) === 0) ?? null;
    }

    /** Cost of the *next* level for upgrade `id` (rounded up to a clean ending). */
    getUpgradeCost(id) {
        const def = this._upgrades.get(id);
        if (!def) return Infinity;
        return roundUpClean(def.baseCost * Math.pow(def.costRatio, this.getUpgradeLevel(id)));
    }

    /** All wallets charged together by the next purchase. */
    getUpgradeCosts(id) {
        const def = this._upgrades.get(id);
        if (!def) return {};
        const costs = { [def.currency]: this.getUpgradeCost(id) };
        for (const [currency, amount] of Object.entries(def.secondaryCost ?? {})) {
            costs[currency] = (costs[currency] ?? 0) + amount;
        }
        return costs;
    }

    /** Return the wallets actually charged for all owned levels. */
    getUpgradeRefunds(id) {
        const refunds = {};
        for (let index = 0; index < this.getUpgradeLevel(id); index++) {
            const costs = this._purchaseCosts[id]?.[index] ?? this._levelCosts(id, index);
            for (const [currency, amount] of Object.entries(costs)) {
                refunds[currency] = (refunds[currency] ?? 0) + amount;
            }
        }
        return refunds;
    }

    /**
     * Returns { ok, reason }.
     * `reason` is a human-readable string explaining why purchase would fail.
     */
    canPurchase(id, game) {
        const def = this._upgrades.get(id);
        if (!def) return { ok: false, reason: 'Unknown upgrade' };

        const level = this.getUpgradeLevel(id);
        if (level >= (def.maxLevel ?? 1)) return { ok: false, reason: 'Already maxed' };
        if (def.unlockId && this.isUnlocked(def.unlockId)) return { ok: false, reason: 'Already unlocked' };

        if (def.treeParent && def.treeParent !== 'ROOT') {
            const parentLevel = this.getUpgradeLevel(def.treeParent);
            if (parentLevel < 1) {
                const parentDef = this._upgrades.get(def.treeParent);
                const name = parentDef ? parentDef.name : def.treeParent;
                return { ok: false, reason: `Requires "${name}"` };
            }
        }

        const requirement = this._evalRequires(def.requires, game);
        if (!requirement.met) return { ok: false, reason: requirement.reason };

        for (const [currency, cost] of Object.entries(this.getUpgradeCosts(id))) {
            const wallet = game.resourceManager.resources[currency];
            if (!wallet || wallet.amount < cost) return { ok: false, reason: `Not enough ${currency}` };
        }

        return { ok: true };
    }

    /**
     * Returns { visible }.
     * An upgrade is *hidden* when its building or unlock prerequisites aren't
     * satisfied yet. It shows as *locked* (visible but unclickable) when only
     * cost or upgrade-chain prerequisites are unmet.
     */
    isVisible(id, game) {
        const def = this._upgrades.get(id);
        if (!def) return { visible: true };
        if (def.unlockId && this.isUnlocked(def.unlockId) && this.getUpgradeLevel(id) === 0) return { visible: false };

        if (def.treeParent && def.treeParent !== 'ROOT') {
            if (this.getUpgradeLevel(def.treeParent) < 1) {
                return { visible: false };
            }
        }

        if (!this._evalVisibility(def.requires, game).visible) return { visible: false };

        // Exact upgrade prerequisites keep later chapter cards out of the first
        // decisions. Building-count milestones can still appear as clear goals.
        for (const [requiredId, level] of Object.entries(def.requires?.upgrades ?? {})) {
            if (this.getUpgradeLevel(requiredId) < level) return { visible: false };
        }

        if (def.requires?.stats?.crowdCount !== undefined) {
            const currentCrowd = game.crowd ? game.crowd.people.length : 0;
            if (currentCrowd < def.requires.stats.crowdCount) {
                return { visible: false };
            }
        }

        return { visible: true };
    }

    // ── Upgrade mutations ─────────────────────────────────────────────────────

    /**
     * Validate, deduct cost, increment level, call apply(), sync crowd stats,
     * save progress, and re-render upgrades UI.
     * Returns true on success.
     */
    purchaseUpgrade(id, game) {
        const def = this._upgrades.get(id);
        if (!def) return false;

        const check = this.canPurchase(id, game);
        if (!check.ok) {
            game.showNotification(check.reason);
            return false;
        }

        const costs = this.getUpgradeCosts(id);
        for (const [currency, cost] of Object.entries(costs)) {
            game.resourceManager.resources[currency].subtract(cost);
        }

        const newLevel = (this._upgradeLevels[id] ?? 0) + 1;
        this._purchaseCosts[id] ??= [];
        this._purchaseCosts[id][newLevel - 1] = { ...costs };
        this._upgradeLevels[id] = newLevel;
        this.applyAll(game);
        def.onPurchase?.(game, newLevel, def.id);
        for (const key of def.patternKeys ?? (def.patternKey ? [def.patternKey] : [])) game.grantPatternRecipe(key);
        game.syncCrowdStats();

        game.saveProgress();
        if (game.ui?.renderUpgrades) game.ui.renderUpgrades();
        game.showNotification(`${def.name} purchased!`);
        return true;
    }

    /**
     * Force-set an upgrade level without cost checks.
     * Used by cheat / debug helpers (unlockAllUpgrades).
     */
    forceSetLevel(id, level) {
        const def = this._upgrades.get(id);
        if (!def || !Number.isFinite(level)) return;
        const newLevel = this._savedLevel(id, level);
        const costs = this._purchaseCosts[id] ?? [];
        this._purchaseCosts[id] = Array.from({ length: newLevel }, (_, index) => costs[index] ?? {});
        this._upgradeLevels[id] = newLevel;
    }

    /** Clear purchases and their mechanic unlocks; keep introductory UI unlocks. */
    resetUpgradesState() {
        this._upgradeLevels = {};
        this._purchaseCosts = {};
        for (const def of this._upgrades.values()) {
            if (def.unlockId) this._unlockedSet.delete(def.unlockId);
        }
        this._unlockedSet.delete('crowd');
        this._unlockedSet.delete('crowds_tab');
        this._unlockedSet.delete('advanced_creator');
        for (const id of this._unlockedSet) {
            if (id.startsWith('pattern_')) this._unlockedSet.delete(id);
        }
    }

    /** Clear the entire unlock set (preserves upgrade levels). */
    resetUnlockState() {
        this._unlockedSet = new Set();
    }

    /**
     * Force-unlock all progression nodes.
     * Used by cheat / debug helpers.
     */
    forceUnlockAll() {
        for (const id of this._unlockNodes.keys()) {
            this._unlockedSet.add(id);
        }
    }

    // ── Recompute ─────────────────────────────────────────────────────────────

    /**
     * Reset all game stat multipliers to their defaults, then re-apply every
     * purchased upgrade in definition order. Call after loading saved state or
     * after a resetting operation.
     */
    applyAll(game) {
        game.baseSparkleMultiplier = 1;
        game.droneStats = {
            lifetimeMultiplier: 1,
            speedMultiplier: 1,
            collectionRadiusMultiplier: 1,
            maxDrones: DRONE_CONFIG.maxDrones,
            sparklesPerParticleMultiplier: 1,
        };
        game.crowdStats = {
            catchingEnabled: false,
            collectionRadiusMultiplier: 1,
            sparklesPerParticleMultiplier: 1,
            goldRateMultiplier: 1,   // multiplied into crowd.goldPerCoinToss (base 1 gold per 5s)
            countBonus: 0,            // added to the crowd count formula result
        };
        game.launcherStats = { spawnIntervalMultiplier: 1, sparkleYieldMultiplier: 1 };
        game.generatorStats = { productionRateMultiplier: 1 };
        game.droneHubStats = { spawnIntervalMultiplier: 1 };
        game.catapultStats = { maxCatapults: 1, fireIntervalMultiplier: 1, launchVxMultiplier: 1 };
        game.crowdUnlocked = false;
        game.grandFinaleUnlocked = false;
        game.advancedCreatorUnlocked = false;
        game.unlockedPatternKeys = game.getOwnedPatternKeys();

        for (const def of this._upgrades.values()) {
            const level = this.getUpgradeLevel(def.id);
            for (let i = 1; i <= level; i++) def.apply(game, i);
        }

        if (game.droneSystem?.applyUpgradeStats) game.droneSystem.applyUpgradeStats(game.droneStats);
        else if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
        game.syncCrowdStats();
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    /**
     * Evaluate all unlock nodes against current game state.
     * Returns an array of IDs that were newly unlocked this call (may be empty).
     * Idempotent — already-unlocked nodes are always skipped.
     */
    tick(game) {
        const newlyUnlocked = [];
        for (const [id, node] of this._unlockNodes) {
            if (this._unlockedSet.has(id)) continue;
            const { met } = this._evalRequires(node.requires, game);
            if (met) {
                this._unlockedSet.add(id);
                newlyUnlocked.push(id);
            }
        }
        return newlyUnlocked;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _savedLevel(id, savedLevel) {
        const def = this._upgrades.get(id);
        const level = Number(savedLevel);
        if (!def || !Number.isFinite(level)) return 0;
        return Math.max(0, Math.min(def.maxLevel ?? 1, Math.floor(level)));
    }

    _levelCosts(id, index, legacy = false) {
        const def = this._upgrades.get(id);
        if (!def) return {};
        const baseCost = legacy ? LEGACY_BASE_COSTS[id] ?? def.baseCost : def.baseCost;
        const costRatio = legacy && id === 'base_mult_1' ? 2.6 : def.costRatio;
        const costs = { [def.currency]: roundUpClean(baseCost * Math.pow(costRatio, index)) };
        const secondaryCost = legacy && id === 'grand_finale' ? { gold: 15000 } : def.secondaryCost;
        for (const [currency, amount] of Object.entries(secondaryCost ?? {})) {
            costs[currency] = (costs[currency] ?? 0) + amount;
        }
        return costs;
    }

    _cleanCosts(costs) {
        const clean = {};
        for (const currency of ['sparkles', 'gold']) {
            if (!Object.hasOwn(costs, currency)) continue;
            const amount = Number(costs[currency]);
            if (Number.isFinite(amount) && amount >= 0) clean[currency] = amount;
        }
        return clean;
    }

    /**
     * Evaluate all `requires` keys against current game / progression state.
     * Returns { met: bool, reason: string }.
     */
    _evalRequires(requires, game) {
        if (!requires) return { met: true };

        if (requires.stats) {
            const s = requires.stats;
            if (s.fireworkCount !== undefined && game.fireworkSystem.fireworkCount < s.fireworkCount) {
                return { met: false, reason: `Launch ${s.fireworkCount} fireworks` };
            }
            if (s.sps !== undefined && game.calculateTotalSparklesPerSecond() < s.sps) {
                return { met: false, reason: `Reach ${s.sps} sparkles/sec` };
            }
            if (s.launcherCount !== undefined) {
                const count = game.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;
                if (count < s.launcherCount) {
                    return { met: false, reason: `Build ${s.launcherCount} Auto-Launchers` };
                }
            }
            if (s.crowdCount !== undefined) {
                const count = game.crowd ? game.crowd.people.length : 0;
                if (count < s.crowdCount) {
                    return { met: false, reason: `Have ${s.crowdCount} crowd member${s.crowdCount !== 1 ? 's' : ''}` };
                }
            }
            if (s.droneCoverage !== undefined) {
                const hubs = game.buildingManager.getBuildingsByType('DRONE_HUB').length;
                const config = BUILDING_TYPES.DRONE_HUB;
                const lifetime = config.baseDroneLifetime * (game.droneStats?.lifetimeMultiplier ?? 1);
                const interval = config.baseSpawnInterval * (game.droneHubStats?.spawnIntervalMultiplier ?? 1);
                const capacity = game.droneStats?.maxDrones ?? DRONE_CONFIG.maxDrones;
                const coverage = hubs * lifetime / interval / capacity;
                if (coverage < s.droneCoverage) return { met: false, reason: 'Add a Drone Hub' };
            }
        }

        if (requires.buildings) {
            for (const bType of requires.buildings) {
                if (!game.isBuildingTypeUnlocked(bType)) {
                    return { met: false, reason: `Requires ${bType.replace(/_/g, ' ').toLowerCase()}` };
                }
            }
        }

        if (requires.buildingCounts) {
            for (const [type, minimum] of Object.entries(requires.buildingCounts)) {
                if (game.buildingManager.getBuildingsByType(type).length < minimum) {
                    return { met: false, reason: `Build ${minimum} ${type.replace(/_/g, ' ').toLowerCase()}${minimum === 1 ? '' : 's'}` };
                }
            }
        }

        if (requires.unlocked) {
            for (const uid of requires.unlocked) {
                if (!this.isUnlocked(uid)) {
                    return { met: false, reason: `Requires ${uid.replace(/_/g, ' ')}` };
                }
            }
        }

        if (requires.upgrades) {
            for (const [uid, minLevel] of Object.entries(requires.upgrades)) {
                if (this.getUpgradeLevel(uid) < minLevel) {
                    const refDef = this._upgrades.get(uid);
                    const name = refDef ? refDef.name : uid;
                    return { met: false, reason: `Requires "${name}" level ${minLevel}` };
                }
            }
        }

        return { met: true };
    }

    /**
     * Determine whether a card should be shown in the UI at all.
     * Hard-hidden when building types or unlock nodes aren't reached yet.
     * Visible-but-locked when only cost / upgrade-chain prerequisites fail.
     */
    _evalVisibility(requires, game) {
        if (!requires) return { visible: true };

        if (requires.buildings) {
            for (const bType of requires.buildings) {
                if (!game.isBuildingTypeUnlocked(bType)) return { visible: false };
            }
        }

        if (requires.unlocked) {
            for (const uid of requires.unlocked) {
                if (!this.isUnlocked(uid)) return { visible: false };
            }
        }

        return { visible: true };
    }
}

export default ProgressionManager;
