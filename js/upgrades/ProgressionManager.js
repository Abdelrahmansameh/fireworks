import { DRONE_CONFIG } from '../config/config.js';

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
            } else {
                this._upgrades.set(entry.id, entry);
            }
        }

        /** @type {Object.<string, number>} id → purchased level */
        this._upgradeLevels = {};
        /** @type {Set<string>} set of unlocked node IDs */
        this._unlockedSet = new Set();
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    /**
     * Restore state from a previously serialized object.
     * Safe to call with null / undefined / empty object (no-op).
     */
    loadState(data) {
        if (!data || typeof data !== 'object') return;
        if (data.upgrades && typeof data.upgrades === 'object') {
            this._upgradeLevels = { ...data.upgrades };
        }
        if (Array.isArray(data.unlocked)) {
            this._unlockedSet = new Set(data.unlocked);
        }
    }

    /** Returns a plain object suitable for JSON.stringify / localStorage. */
    getState() {
        return {
            upgrades: { ...this._upgradeLevels },
            unlocked: [...this._unlockedSet],
        };
    }

    // ── Unlock queries ────────────────────────────────────────────────────────

    isUnlocked(id) {
        return this._unlockedSet.has(id);
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

    /** Cost of the *next* level for upgrade `id`. */
    getUpgradeCost(id) {
        const def = this._upgrades.get(id);
        if (!def) return Infinity;
        return Math.floor(def.baseCost * Math.pow(def.costRatio, this.getUpgradeLevel(id)));
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

        const reqCheck = this._evalRequires(def.requires, game);
        if (!reqCheck.met) return { ok: false, reason: reqCheck.reason };

        const cost = this.getUpgradeCost(id);
        const wallet = def.currency === 'gold'
            ? game.resourceManager.resources.gold
            : game.resourceManager.resources.sparkles;
        if (wallet.amount < cost) return { ok: false, reason: `Not enough ${def.currency}` };

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
        if (!def || !def.requires) return { visible: true };
        return this._evalVisibility(def.requires, game);
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

        const cost = this.getUpgradeCost(id);
        const wallet = def.currency === 'gold'
            ? game.resourceManager.resources.gold
            : game.resourceManager.resources.sparkles;
        wallet.subtract(cost);

        const newLevel = (this._upgradeLevels[id] ?? 0) + 1;
        this._upgradeLevels[id] = newLevel;
        def.apply(game, newLevel);
        game.syncCrowdStats();

        game.saveProgress();
        if (game.ui?.renderUpgrades) game.ui.renderUpgrades();
        game.showNotification('Upgrade purchased!');
        return true;
    }

    /**
     * Force-set an upgrade level without cost checks.
     * Used by cheat / debug helpers (unlockAllUpgrades).
     */
    forceSetLevel(id, level) {
        this._upgradeLevels[id] = level;
    }

    /** Reset all upgrade levels to 0 (preserves unlock set). */
    resetUpgradesState() {
        this._upgradeLevels = {};
    }

    /** Clear the entire unlock set (preserves upgrade levels). */
    resetUnlockState() {
        this._unlockedSet = new Set();
    }

    // ── Recompute ─────────────────────────────────────────────────────────────

    /**
     * Reset all game stat multipliers to their defaults, then re-apply every
     * purchased upgrade in definition order. Call after loading saved state or
     * after a resetting operation.
     */
    applyAll(game) {
        game.baseSparkleMultiplier = 1;
        game.patternSparkleMultipliers = { default: 1 };
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
        };
        game.launcherStats = { spawnIntervalMultiplier: 1 };
        game.generatorStats = { productionRateMultiplier: 1 };
        game.droneHubStats = { spawnIntervalMultiplier: 1 };

        for (const def of this._upgrades.values()) {
            const level = this.getUpgradeLevel(def.id);
            if (level > 0) def.apply(game, level);
        }

        if (game.droneSystem) game.droneSystem.maxDrones = game.droneStats.maxDrones;
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

    /**
     * Evaluate all `requires` keys against current game / progression state.
     * Returns { met: bool, reason: string }.
     */
    _evalRequires(requires, game) {
        if (!requires) return { met: true };

        if (requires.stats) {
            const s = requires.stats;
            if (s.fireworkCount !== undefined && game.fireworkCount < s.fireworkCount) {
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
        }

        if (requires.buildings) {
            for (const bType of requires.buildings) {
                if (!game.isBuildingTypeUnlocked(bType)) {
                    return { met: false, reason: `Requires ${bType.replace(/_/g, ' ').toLowerCase()}` };
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
                    return { met: false, reason: `Requires "${name}"` };
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
