import Resource from './Resource.js';

export default class Sparkles extends Resource {
    constructor(initialAmount = 0) {
        super('Sparkles', 'sp', initialAmount);
        this.levelRate = 0;
        this.totalRate = 0;
    }

    updateFromLevel(levelSparklesPerSecond) {
        this.levelRate = levelSparklesPerSecond;
        this.updateTotalRate();
    }

    updateTotalRate() {
        this.perSecond = this.levelRate;
    }

    formatAmount() {
        if (this._amount >= 1000000) {
            return `${(this._amount / 1000000).toFixed(2)}M sp`;
        } else if (this._amount >= 1000) {
            return `${(this._amount / 1000).toFixed(2)}K sp`;
        }
        return `${Math.floor(this._amount)} sp`;
    }

    save() {
        const data = super.save();
        return {
            ...data,
            levelRate: this.levelRate,
            totalRate: this.totalRate
        };
    }

    load(data) {
        super.load(data);
        this.levelRate = data.levelRate || 0;
        this.totalRate = data.totalRate || 0;
    }
}
