import { MINER_CONFIG } from '../config/MinerConfig.js';

/**
 * Each miner's pickaxe clock. A miner pays out gold at every strike; the crowd
 * reads `phase(i)` to play miner i's mining clip in step with its own strikes.
 * Runs the same way live and headless.
 */
export default class MinerShifts {
    constructor(game) {
        this.game = game;
        this.timers = [];
    }

    get interval() {
        return MINER_CONFIG.strikeInterval / (this.game.minerStats?.speedMultiplier ?? 1);
    }

    /** Gold each miner pays out per strike. */
    get payout() {
        return MINER_CONFIG.goldPerStrike * (this.game.minerStats?.goldMultiplier ?? 1);
    }

    get goldPerSecond() {
        return this.timers.length * this.payout / this.interval;
    }

    setCount(count) {
        // Stagger new clocks so miners never swing in unison.
        while (this.timers.length < count) this.timers.push(((this.timers.length * 0.618) % 1) * this.interval);
        this.timers.length = count;
    }

    /** Position in miner i's current swing, 0 (the strike) to 1. */
    phase(index) {
        return ((this.timers[index] ?? 0) / this.interval) % 1;
    }

    update(dt) {
        const interval = this.interval;
        for (let i = 0; i < this.timers.length; i++) {
            this.timers[i] += dt;
            while (this.timers[i] >= interval) {
                this.timers[i] -= interval;
                this.game.addGold(this.payout, 'miner');
            }
        }
    }
}
