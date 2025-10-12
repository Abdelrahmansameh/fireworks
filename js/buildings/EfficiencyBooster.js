import Building from './Building.js';

class EfficiencyBooster extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'EFFICIENCY_BOOSTER', x, y, data);
        
        this.radius = data.radius || this.calculateRadius();
        this.boostMultiplier = data.boostMultiplier || this.calculateMultiplier();
    }

    calculateRadius() {
        return this.config.baseRadius * 
               Math.pow(this.config.radiusRatio, this.level - 1);
    }

    calculateMultiplier() {
        return this.config.baseMultiplier * 
               Math.pow(this.config.multiplierRatio, this.level - 1);
    }

    update(deltaTime) {
        
    }

    isInRange(building) {
        if (building === this) return false;
        
        const dx = building.x - this.x;
        const dy = building.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= this.radius;
    }

    getNearbyBuildings(buildingManager) {
        return buildingManager.buildings.filter(b => this.isInRange(b));
    }

    onUpgrade() {
        this.radius = this.calculateRadius();
        this.boostMultiplier = this.calculateMultiplier();
    }

    getBoostStats() {
        return {
            radius: this.radius,
            multiplier: this.boostMultiplier,
            boostPercent: Math.round((this.boostMultiplier - 1) * 100)
        };
    }

    serialize() {
        return {
            ...super.serialize(),
            radius: this.radius,
            multiplier: this.boostMultiplier,
        };
    }
}

export default EfficiencyBooster;
