export default class Resource {
    constructor(name, abbreviation, initialAmount = 0) {
        this.name = name;
        this.abbreviation = abbreviation;
        this._amount = initialAmount;
        this._perSecond = 0;
        this._lastUpdate = performance.now();
    }

    get amount() {
        return this._amount;
    }

    set amount(value) {
        this._amount = Math.max(0, value);
    }

    get perSecond() {
        return this._perSecond;
    }

    set perSecond(value) {
        this._perSecond = value;
    }

    update() {
        const now = performance.now();
        const deltaTime = (now - this._lastUpdate) / 1000; // Convert to seconds
        this._amount += this._perSecond * deltaTime;
        this._lastUpdate = now;
    }

    add(amount) {
        this._amount += amount;
    }

    subtract(amount) {
        this._amount = Math.max(0, this._amount - amount);
    }

    formatAmount() {
        if (this._amount >= 1000000) {
            return `${(this._amount / 1000000).toFixed(2)}M ${this.abbreviation}`;
        } else if (this._amount >= 1000) {
            return `${(this._amount / 1000).toFixed(2)}K ${this.abbreviation}`;
        }
        return `${Math.floor(this._amount)} ${this.abbreviation}`;
    }

    save() {
        return {
            name: this.name,
            amount: this._amount,
            perSecond: this._perSecond
        };
    }

    load(data) {
        this._amount = data.amount || 0;
        this._perSecond = data.perSecond || 0;
        this._lastUpdate = performance.now();
    }
}
