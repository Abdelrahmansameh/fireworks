import Resource from './Resource.js';

export default class Gold extends Resource {
    constructor(initialAmount = 0) {
        super('Gold', 'G', initialAmount);
        this.basePerCrowdMember = 0.1;
    }

    updateFromCrowd(crowdSize) {
        this.perSecond = crowdSize * this.basePerCrowdMember;
    }

    /**
     * Compute how much gold should be added this tick (based on _perSecond
     * and elapsed time) WITHOUT adding it. Resets the internal timer.
     * The caller (ResourceManager) routes the amount through game.addGold()
     * so it gets source-tracked by StatsTracker.
     * @returns {number}
     */
    computePassiveIncome() {
        const now = performance.now();
        const dt = (now - this._lastUpdate) / 1000;
        this._lastUpdate = now;
        return this._perSecond * dt;
    }

    /** Override so the base update() does NOT also accumulate gold. */
    update() {
        // Intentionally empty – income is handled by computePassiveIncome()
        // which is called from ResourceManager and routed through addGold().
        this._lastUpdate = performance.now();
    }
}
