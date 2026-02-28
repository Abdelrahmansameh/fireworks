import Resource from './Resource.js';

export default class Gold extends Resource {
    constructor(initialAmount = 0) {
        super('Gold', 'G', initialAmount);
    }

    update() {
        this._lastUpdate = performance.now();
    }
}
