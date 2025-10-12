import Building from './Building.js';

/**
 * ResourceGenerator - Passively generates resources over time
 */
class ResourceGenerator extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'RESOURCE_GENERATOR', x, y, data);
        
        // ResourceGenerator specific properties
        this.resourceType = data.resourceType || this.config.resourceType;
        this.productionRate = data.productionRate || this.calculateProductionRate();
        this.accumulator = data.accumulator || 0;
    }

    /**
     * Calculate production rate based on level
     */
    calculateProductionRate() {
        return this.config.baseProductionRate * 
               Math.pow(this.config.productionRateRatio * this.multiplier, this.level - 1);
    }

    /**
     * Update - generate resources over time
     */
    update(deltaTime) {
        this.accumulator += deltaTime;
        
        // Generate resources every second
        if (this.accumulator >= 1.0) {
            const resource = this.game.resourceManager.resources[this.resourceType];
            if (resource) {
                // Apply boost multiplier to production
                resource.add(this.productionRate * this.multiplier);
            }
            this.accumulator -= 1.0;
        }
    }

    /**
     * Upgrade - increase production rate
     */
    onUpgrade() {
        this.productionRate = this.calculateProductionRate();
    }

    /**
     * Get current production rate (resources per second)
     */
    getProductionRate() {
        return this.productionRate * this.multiplier;
    }

    /**
     * Serialize with generator-specific data
     */
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
