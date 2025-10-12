import Building from './Building.js';

class ResourceGenerator extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'RESOURCE_GENERATOR', x, y, data);
        
        this.resourceType = data.resourceType || this.config.resourceType;
        this.productionRate = data.productionRate || this.calculateProductionRate();
        this.accumulator = data.accumulator || 0;
    }

    calculateProductionRate() {
        return this.config.baseProductionRate * 
               Math.pow(this.config.productionRateRatio * this.multiplier, this.level - 1);
    }

    update(deltaTime) {
        this.accumulator += deltaTime;
        
        if (this.accumulator >= 1.0) {
            const resource = this.game.resourceManager.resources[this.resourceType];
            if (resource) {
                resource.add(this.productionRate * this.multiplier);
            }
            this.accumulator -= 1.0;
        }
    }

    onUpgrade() {
        this.productionRate = this.calculateProductionRate();
    }

    getProductionRate() {
        return this.productionRate * this.multiplier;
    }

    serialize() {
        return {
            ...super.serialize(),
            resourceType: this.resourceType,
            productionRate: this.productionRate,
            accumulator: this.accumulator,
        };
    }
}

export default ResourceGenerator;
