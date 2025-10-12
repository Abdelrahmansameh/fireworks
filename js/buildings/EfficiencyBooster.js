import Building from './Building.js';

/**
 * EfficiencyBooster - Boosts production of nearby buildings
 */
class EfficiencyBooster extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'EFFICIENCY_BOOSTER', x, y, data);
        
        // EfficiencyBooster specific properties
        this.radius = data.radius || this.calculateRadius();
        this.boostMultiplier = data.boostMultiplier || this.calculateMultiplier();
    }

    /**
     * Calculate radius based on level
     */
    calculateRadius() {
        return this.config.baseRadius * 
               Math.pow(this.config.radiusRatio, this.level - 1);
    }

    /**
     * Calculate multiplier based on level
     */
    calculateMultiplier() {
        return this.config.baseMultiplier * 
               Math.pow(this.config.multiplierRatio, this.level - 1);
    }

    /**
     * Update - find and boost nearby buildings
     * Note: The actual boosting is handled by the BuildingManager
     * to avoid double-processing
     */
    update(deltaTime) {
        
    }

    /**
     * Check if a building is within boost radius
     */
    isInRange(building) {
        if (building === this) return false;
        
        const dx = building.x - this.x;
        const dy = building.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= this.radius;
    }

    /**
     * Get all buildings within boost range
     */
    getNearbyBuildings(buildingManager) {
        return buildingManager.buildings.filter(b => this.isInRange(b));
    }

    /**
     * Upgrade - increase radius and multiplier
     */
    onUpgrade() {
        this.radius = this.calculateRadius();
        this.boostMultiplier = this.calculateMultiplier();
    }

    /**
     * Get current boost stats
     */
    getBoostStats() {
        return {
            radius: this.radius,
            multiplier: this.boostMultiplier,
            boostPercent: Math.round((this.boostMultiplier - 1) * 100)
        };
    }

    /**
     * Serialize with booster-specific data
     */
    serialize() {
        return {
            ...super.serialize(),
            radius: this.radius,
            multiplier: this.boostMultiplier,
        };
    }
}

export default EfficiencyBooster;
