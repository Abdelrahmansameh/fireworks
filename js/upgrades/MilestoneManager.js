import { BUILDING_TYPES } from '../config/config.js';
import { MILESTONES, MILESTONE_CHAPTERS } from '../config/MilestoneConfig.js';

const STORAGE_KEY = 'milestoneState';
const CUMULATIVE = new Set(['fireworks', 'sparkles', 'gold', 'caught']);
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });
/** Short enough for a one-line goal: 1,800 · 15K · 1.2M. */
export const formatAmount = value => {
    const amount = Math.floor(Math.max(0, value));
    return amount < 10000 ? amount.toLocaleString('en') : compact.format(amount);
};

/**
 * MilestoneManager — the ordered goal chain that paces a show.
 *
 * Owned by GameCore as `game.milestones`. Exactly one milestone is current;
 * meeting its goal makes it ready, and claiming it grants its reward and starts
 * the next. Cumulative goals
 * count from the moment the milestone became current, so spending never sets
 * a goal back. Completion is permanent for the save; a full reset starts over.
 */
export default class MilestoneManager {
    constructor(game) {
        this.game = game;
        /** Called with (milestone) after a claim. */
        this.onComplete = null;
        this._reset();
    }

    _reset() {
        this.index = 0;
        this.completedAt = {};
        this.start = null;
        // A met goal stays claimable even if the player sells what met it.
        this.ready = false;
        this._initialized = false;
    }

    reset() {
        this._reset();
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    load(storage) {
        try {
            this.loadState(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
        } catch {
            this._reset();
        }
    }

    loadState(data) {
        this._reset();
        if (!data || typeof data !== 'object') return;
        const completed = data.completedAt && typeof data.completedAt === 'object' ? data.completedAt : {};
        // Completion is stored by id so the chain can be reordered or extended:
        // resume after the furthest completed milestone, counting any newer
        // milestones before it as done.
        const furthest = MILESTONES.findLastIndex(milestone => Object.hasOwn(completed, milestone.id));
        while (this.index <= furthest) {
            const id = MILESTONES[this.index].id;
            this.completedAt[id] = Number(completed[id]) || 0;
            this.index++;
        }
        if (data.start && typeof data.start === 'object' && data.currentId === this.current?.id) {
            this.start = Object.fromEntries(Object.entries(data.start).map(([key, value]) => [key, Number(value) || 0]));
            this.ready = data.ready === true;
        }
        this._initialized = true;
    }

    getState() {
        return { currentId: this.current?.id ?? null, completedAt: { ...this.completedAt }, start: this.start ? { ...this.start } : null, ready: this.ready };
    }

    save(storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(this.getState()));
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    get current() {
        return MILESTONES[this.index] ?? null;
    }

    get total() {
        return MILESTONES.length;
    }

    get allComplete() {
        return this.index >= MILESTONES.length;
    }

    isComplete(id) {
        return Object.hasOwn(this.completedAt, id);
    }

    getChapterName(milestone = this.current) {
        return milestone ? MILESTONE_CHAPTERS[milestone.chapter] ?? '' : '';
    }

    /** Human-readable goal text, generated so tuned targets never go stale. */
    describeGoal(milestone = this.current) {
        const goal = milestone?.goal;
        if (!goal) return '';
        const n = goal.target;
        switch (goal.type) {
            case 'fireworks': return `Launch ${formatAmount(n)} fireworks`;
            case 'sparkles': return `Earn ${formatAmount(n)} sparkles`;
            case 'gold': return `Collect ${formatAmount(n)} gold`;
            case 'caught': return `Fans catch ${formatAmount(n)} sparkles`;
            case 'crowd': return `Welcome ${formatAmount(n)} fans`;
            case 'building': {
                const name = BUILDING_TYPES[goal.building]?.name ?? goal.building;
                return `Own ${formatAmount(n)} ${n === 1 ? name : `${name}s`}`;
            }
            case 'upgrade': {
                const def = this.game.progression.getUpgradeDef(goal.upgrade);
                return `Buy ${def?.name ?? goal.upgrade}${n > 1 ? ` level ${n}` : ''}`;
            }
            default: return '';
        }
    }

    /** { value, target, fraction } for the current goal. */
    getProgress(milestone = this.current) {
        if (!milestone) return { value: 1, target: 1, fraction: 1 };
        const target = milestone.goal.target;
        if (milestone === this.current && this.ready) return { value: target, target, fraction: 1 };
        const value = Math.max(0, this._measure(milestone.goal));
        return { value, target, fraction: Math.min(1, value / Math.max(1e-9, target)) };
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    tick() {
        const game = this.game;
        if (game._isRestoring) return;
        if (!this._initialized) this._initialize();
        if (!this.current) return;
        if (!this.start) this.start = this._snapshot();
        if (!this.ready && this.getProgress().fraction >= 1) {
            this.ready = true;
            game.saveProgress();
        }
    }

    /** The player collects the reward of a met goal. Returns whether it did. */
    claim() {
        if (!this.ready || !this.current) return false;
        this._complete(this.current);
        return true;
    }

    /** Complete everything silently (cheats). */
    completeAll() {
        while (this.current) this._complete(this.current, { silent: true });
    }

    /**
     * Saves from before milestones existed already own some rewards. Skip, without
     * fanfare, every milestone up to the furthest one the save already shows:
     * an owned reward or a met ownership goal. Skipped rewards are still granted.
     */
    _initialize() {
        this._initialized = true;
        let furthest = -1;
        MILESTONES.forEach((milestone, index) => {
            const goalMet = !CUMULATIVE.has(milestone.goal.type) && this._measure(milestone.goal) >= milestone.goal.target;
            if (goalMet || this._rewardOwned(milestone)) furthest = index;
        });
        while (this.index <= furthest) this._complete(this.current, { silent: true });
        this.start = this._snapshot();
    }

    _rewardOwned(milestone) {
        const { reward } = milestone;
        const owned = [
            ...(reward.upgrades ?? []).map(id => this.game.progression.getUpgradeLevel(id) > 0),
            ...(reward.unlocks ?? []).map(id => this.game.progression.isUnlocked(id)),
        ];
        return owned.length > 0 && owned.every(Boolean);
    }

    _complete(milestone, { silent = false } = {}) {
        const game = this.game;
        this.completedAt[milestone.id] = game.elapsedGameTime ?? 0;
        this.index++;
        this.ready = false;
        this._grant(milestone, silent);
        this.start = this._snapshot();
        game.saveProgress();
        game.ui.renderUpgrades?.();
        if (!silent) this.onComplete?.(milestone);
    }

    _grant(milestone, silent) {
        const game = this.game;
        const { reward } = milestone;
        const grantId = `milestone:${milestone.id}`;
        for (const id of reward.unlocks ?? []) {
            if (!game.progression.isUnlocked(id)) game._handleUnlock(id);
        }
        for (const id of reward.upgrades ?? []) {
            if (game.progression.getUpgradeLevel(id) === 0) game.progression.grantUpgrade(id, game, grantId);
        }
    }

    /** Re-own granted upgrades after "Reset all upgrades" (they were never paid for). */
    reapplyGrantedUpgrades() {
        const progression = this.game.progression;
        for (const milestone of MILESTONES) {
            if (!this.isComplete(milestone.id)) continue;
            for (const id of milestone.reward.upgrades ?? []) progression.restoreGrant(id, this.game);
        }
    }

    /** Upgrade ids a completed milestone granted for free. */
    getGrantedUpgradeIds() {
        return MILESTONES.filter(milestone => this.isComplete(milestone.id))
            .flatMap(milestone => milestone.reward.upgrades ?? []);
    }

    // ── Measurement ───────────────────────────────────────────────────────────

    _snapshot() {
        const stats = this.game.statsTracker;
        const bySource = stats.lifetimeSparklesBySource ?? {};
        return {
            fireworks: this.game.fireworkSystem.fireworkCount,
            sparkles: stats.lifetimeSparkles ?? 0,
            gold: stats.lifetimeGold ?? 0,
            caught: (bySource.crowd_catch ?? 0) + (bySource.flyer ?? 0),
        };
    }

    _measure(goal) {
        const game = this.game;
        switch (goal.type) {
            case 'upgrade': return game.progression.getUpgradeLevel(goal.upgrade);
            case 'building': return game.buildingManager.getBuildingsByType(goal.building).length;
            case 'crowd': return game.crowd?.naturalCount ?? 0;
            default: {
                if (!CUMULATIVE.has(goal.type)) return 0;
                const now = this._snapshot();
                return now[goal.type] - (this.start?.[goal.type] ?? now[goal.type]);
            }
        }
    }
}
