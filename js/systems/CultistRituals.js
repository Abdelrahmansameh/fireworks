import { CULTIST_CONFIG } from '../config/CultistConfig.js';
import { goldPerRitual, ritualInterval, sparklesPerGold } from '../config/CultistRitual.js';

/**
 * Each cultist's ritual clock. At the end of every ritual loop a cultist takes
 * an offering from the gold bank and pays it out as sparkles; with offerings
 * paused or the bank empty the ritual pays nothing. The crowd reads `phase(i)`
 * to play cultist i's ritual clip in step with its own offerings, and
 * `lastPayout[i]` to size its burst. Runs the same way live and headless.
 */
export default class CultistRituals {
    constructor(game) {
        this.game = game;
        this.timers = [];
        this.lastPayout = [];
        this.goldOffered = 0;
    }

    get interval() {
        return ritualInterval(this.game.cultistStats);
    }

    /** Gold each cultist offers per ritual. */
    get offering() {
        return goldPerRitual(this.game.cultistStats);
    }

    /** Sparkles paid for each gold offered. */
    get rate() {
        return sparklesPerGold(this.game.cultistStats, this.game.baseSparkleMultiplier ?? 1);
    }

    /** Sparkles each cultist pays out for a full offering. */
    get payout() {
        return this.offering * this.rate;
    }

    /** Size of the ritual bowl, which grows with each Bigger Bowls level. */
    get bowlScale() {
        return 1 + CULTIST_CONFIG.bowlGrowthPerLevel * (this.game.progression?.getUpgradeLevel?.('cultist_bowls') ?? 0);
    }

    /** Whether rituals are taking gold right now. */
    get active() {
        return !this.game.cultOfferingsPaused && this.timers.length > 0;
    }

    /** Gold per second all cultists take from the bank while it can pay. */
    get goldPerSecond() {
        return this.active ? this.timers.length * this.offering / this.interval : 0;
    }

    /**
     * Least gold a purchase that grows the cult may cost: upkeepSeconds of
     * the drain with `count` cultists offering `offeringMultiplier` times more.
     */
    upkeepCost(count = this.timers.length, offeringMultiplier = 1) {
        return CULTIST_CONFIG.upkeepSeconds * count * this.offering * offeringMultiplier / this.interval;
    }

    setCount(count) {
        // Stagger new clocks so cultists added together don't move in unison.
        while (this.timers.length < count) this.timers.push(((this.timers.length * 0.618) % 1) * this.interval);
        this.timers.length = count;
        this.lastPayout.length = count;
    }

    /** Position in cultist i's current ritual loop, 0 (climax) to 1. */
    phase(index) {
        return ((this.timers[index] ?? 0) / this.interval) % 1;
    }

    update(dt) {
        const interval = this.interval;
        const gold = this.game.resourceManager.resources.gold;
        for (let i = 0; i < this.timers.length; i++) {
            this.timers[i] += dt;
            while (this.timers[i] >= interval) {
                this.timers[i] -= interval;
                const offered = this.game.cultOfferingsPaused ? 0 : Math.min(this.offering, gold.amount);
                this.lastPayout[i] = offered * this.rate;
                if (offered <= 0) continue;
                gold.subtract(offered);
                this.goldOffered += offered;
                this.game.addSparkles(this.lastPayout[i], 'cultist');
            }
        }
    }
}
