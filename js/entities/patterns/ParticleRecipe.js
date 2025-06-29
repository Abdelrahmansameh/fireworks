export default class ParticleRecipe {
    constructor({ count, calcInitialState, name }) {
        this.count = count;
        this.calcInitialState = calcInitialState; // (index, ctx) => { pos, vel, accel, updateFn? }
        this.name = name;
    }
} 