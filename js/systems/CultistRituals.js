import { ritualInterval, sparklesPerRitual } from '../config/CultistRitual.js';

/**
 * Each cultist's ritual clock. A cultist pays out at the end of every ritual
 * loop; the crowd reads `phase(i)` to play cultist i's ritual clip in step
 * with its own payouts. Runs the same way live and headless.
 */
export default class CultistRituals {
    constructor(game) {
        this.game = game;
        this.timers = [];
    }

    get interval() {
        return ritualInterval(this.game.cultistStats);
    }

    /** Sparkles each cultist pays out per ritual. */
    get payout() {
        return sparklesPerRitual(this.game.cultistStats, this.game.baseSparkleMultiplier ?? 1);
    }

    setCount(count) {
        // Stagger new clocks so cultists added together don't move in unison.
        while (this.timers.length < count) this.timers.push(((this.timers.length * 0.618) % 1) * this.interval);
        this.timers.length = count;
    }

    /** Position in cultist i's current ritual loop, 0 (climax) to 1. */
    phase(index) {
        return ((this.timers[index] ?? 0) / this.interval) % 1;
    }

    update(dt) {
        const interval = this.interval;
        for (let i = 0; i < this.timers.length; i++) {
            this.timers[i] += dt;
            while (this.timers[i] >= interval) {
                this.timers[i] -= interval;
                this.game.addSparkles(this.payout, 'cultist');
            }
        }
    }
}
