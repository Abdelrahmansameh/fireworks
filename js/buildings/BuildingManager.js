import AutoLauncher from './AutoLauncher.js';
import ResourceGenerator from './ResourceGenerator.js';
import EfficiencyBooster from './EfficiencyBooster.js';
import Building from './Building.js';
import { BUILDING_TYPES, GAME_BOUNDS } from '../config/config.js';

/**
 * BuildingManager - Centralized manager for all buildings
 */
class BuildingManager {
    constructor(game) {
        this.game = game;
        this.buildings = [];
        this.selectedBuildingId = null;
        
        // Building type registry
        this.buildingClasses = {
            'AUTO_LAUNCHER': AutoLauncher,
            'RESOURCE_GENERATOR': ResourceGenerator,
            'EFFICIENCY_BOOSTER': EfficiencyBooster,
        };
    }

    /**
     * Create a new building
     */
    createBuilding(buildingType, x, y, data = {}) {
        const BuildingClass = this.buildingClasses[buildingType];
        if (!BuildingClass) {
            console.error(`Unknown building type: ${buildingType}`);
            return null;
        }

        const building = new BuildingClass(this.game, x, y, data);
        this.buildings.push(building);
        
        return building;
    }

    /**
     * Purchase a new building
     */
    buyBuilding(buildingType) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) {
            this.game.showNotification("Unknown building type!");
            return null;
        }

        const count = this.getBuildingsByType(buildingType).length;
        const cost = Building.getPurchaseCost(buildingType, count);
        
        const resource = this.game.resourceManager.resources[config.currency];
        if (!resource || resource.amount < cost) {
            this.game.showNotification(`Not enough ${config.currency} to buy ${config.name}!`);
            return null;
        }

        resource.subtract(cost);
        
        // Calculate spawn position (near camera with some randomness)
        let x = this.game.renderer2D.cameraX + (Math.random() * 500 - 250);
        x = Math.max(
            GAME_BOUNDS.LAUNCHER_MIN_X + Math.random() * 300, 
            Math.min(x, GAME_BOUNDS.LAUNCHER_MAX_X - Math.random() * 300)
        );
        
        const y = GAME_BOUNDS.WORLD_LAUNCHER_Y;
        
        const building = this.createBuilding(buildingType, x, y);
        
        if (building) {
            this.game.showNotification(`${config.name} purchased!`);
        }
        
        return building;
    }

    /**
     * Remove a building
     */
    removeBuilding(building) {
        const index = this.buildings.indexOf(building);
        if (index > -1) {
            building.destroy();
            this.buildings.splice(index, 1);
            
            if (this.selectedBuildingId === building.id) {
                this.selectedBuildingId = null;
            }
        }
    }

    /**
     * Update all buildings
     */
    update(deltaTime) {
        // Calculate booster multipliers first
        const boosterMultipliers = this.calculateBoosterMultipliers();
        
        // Update all buildings with their boost multipliers
        for (const building of this.buildings) {
            const multiplier = boosterMultipliers.get(building.id) || 1.0;
            building.multiplier = multiplier;
            building.update(deltaTime);
        }
    }

    /**
     * Calculate boost multipliers for all buildings
     */
    calculateBoosterMultipliers() {
        const boosters = this.getBuildingsByType('EFFICIENCY_BOOSTER');
        const multipliers = new Map();
        
        for (const building of this.buildings) {
            let totalMultiplier = 1.0;
            
            for (const booster of boosters) {
                if (booster.isInRange(building)) {
                    totalMultiplier *= booster.boostMultiplier;
                }
            }
            
            multipliers.set(building.id, totalMultiplier);
        }
        
        return multipliers;
    }

    /**
     * Get building at position
     */
    getBuildingAt(x, y) {
        for (const building of this.buildings) {
            if (building.isPointInside(x, y)) {
                return building;
            }
        }
        return null;
    }

    /**
     * Get buildings by type
     */
    getBuildingsByType(buildingType) {
        return this.buildings.filter(b => b.type === buildingType);
    }

    /**
     * Get building by ID
     */
    getBuildingById(id) {
        return this.buildings.find(b => b.id === id);
    }

    /**
     * Get the cost to buy a building of the given type
     */
    getBuyCost(buildingType) {
        const count = this.getBuildingsByType(buildingType).length;
        return Building.getPurchaseCost(buildingType, count);
    }

    /**
     * Select a building
     */
    selectBuilding(building) {
        this.selectedBuildingId = building ? building.id : null;
    }

    /**
     * Get selected building
     */
    getSelectedBuilding() {
        return this.getBuildingById(this.selectedBuildingId);
    }

    /**
     * Upgrade a building
     */
    upgradeBuilding(building) {
        if (!building) return false;
        
        const success = building.upgrade();
        if (success) {
            this.game.showNotification(
                `${building.config.name} upgraded to level ${building.level}!`
            );
        } else {
            this.game.showNotification(
                `Not enough ${building.config.currency} to upgrade!`
            );
        }
        
        return success;
    }

    /**
     * Upgrade all buildings of a type
     */
    upgradeAllOfType(buildingType) {
        const buildings = this.getBuildingsByType(buildingType);
        let upgraded = false;
        let totalSpent = 0;
        let foundAffordableUpgrade = true;

        while (foundAffordableUpgrade) {
            foundAffordableUpgrade = false;
            let cheapestCost = Infinity;
            let cheapestBuilding = null;

            for (const building of buildings) {
                const cost = building.getUpgradeCost();
                const resource = this.game.resourceManager.resources[building.config.currency];
                
                if (resource && cost <= resource.amount && cost < cheapestCost) {
                    cheapestCost = cost;
                    cheapestBuilding = building;
                    foundAffordableUpgrade = true;
                }
            }

            if (foundAffordableUpgrade && cheapestBuilding) {
                this.upgradeBuilding(cheapestBuilding);
                totalSpent += cheapestCost;
                upgraded = true;
            }
        }

        if (!upgraded) {
            this.game.showNotification("Not enough resources to upgrade any buildings!");
        } else {
            this.game.showNotification(
                `Upgraded all ${BUILDING_TYPES[buildingType].name}s! (${totalSpent.toLocaleString()} spent)`
            );
        }
    }

    /**
     * Spread buildings evenly
     */
    spreadBuildings(buildingType = null) {
        let buildingsToSpread = buildingType ? 
            this.getBuildingsByType(buildingType) : 
            this.buildings;

        if (buildingsToSpread.length === 0) {
            this.game.showNotification("No buildings to spread!");
            return;
        }

        const totalWidth = GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X;
        const spacing = Math.min(totalWidth / (buildingsToSpread.length + 1), 200);

        buildingsToSpread.forEach((building, index) => {
            const newX = GAME_BOUNDS.LAUNCHER_MIN_X + spacing * (index + 1);
            building.setPosition(newX, building.y);
        });

        this.game.showNotification("Buildings spread evenly!");
    }

    /**
     * Reset all buildings of a type
     */
    resetBuildingsOfType(buildingType) {
        const buildings = this.getBuildingsByType(buildingType);
        let refundAmount = 0;

        for (let i = buildings.length - 1; i >= 0; i--) {
            const building = buildings[i];
            
            // Calculate refund
            const purchaseCost = Building.getPurchaseCost(buildingType, 0);
            refundAmount += purchaseCost;
            
            // Add upgrade costs
            for (let level = 1; level < building.level; level++) {
                const upgradeCost = Math.floor(
                    building.config.baseUpgradeCost * 
                    Math.pow(building.config.upgradeCostRatio, level - 1)
                );
                refundAmount += upgradeCost;
            }
            
            this.removeBuilding(building);
        }

        const config = BUILDING_TYPES[buildingType];
        const resource = this.game.resourceManager.resources[config.currency];
        if (resource) {
            resource.add(Math.floor(refundAmount));
        }

        return refundAmount;
    }

    /**
     * Check if placement is valid
     */
    isValidPlacement(x, y, buildingType, excludeBuilding = null) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) return false;

        // Check bounds
        const halfWidth = config.width / 2;
        if (x - halfWidth < GAME_BOUNDS.LAUNCHER_MIN_X || 
            x + halfWidth > GAME_BOUNDS.LAUNCHER_MAX_X) {
            return false;
        }

        // Check collision with other buildings
        const minSpacing = 20; // Minimum space between buildings
        
        for (const building of this.buildings) {
            if (building === excludeBuilding) continue;
            
            const dx = Math.abs(building.x - x);
            const dy = Math.abs(building.y - y);
            const minDist = (building.config.width + config.width) / 2 + minSpacing;
            
            if (dx < minDist && dy < building.config.height / 2 + config.height / 2) {
                return false;
            }
        }

        return true;
    }

    /**
     * Serialize all buildings
     */
    serialize() {
        return {
            buildings: this.buildings.map(b => b.serialize()),
            selectedBuildingId: this.selectedBuildingId,
        };
    }

    /**
     * Deserialize and restore buildings
     */
    deserialize(data) {
        // Clear existing buildings
        for (const building of this.buildings) {
            building.destroy();
        }
        this.buildings = [];

        // Restore buildings
        if (data.buildings) {
            for (const buildingData of data.buildings) {
                this.createBuilding(
                    buildingData.type,
                    buildingData.x,
                    buildingData.y,
                    buildingData
                );
            }
        }

        this.selectedBuildingId = data.selectedBuildingId || null;
    }

    /**
     * Clean up all buildings
     */
    destroy() {
        for (const building of this.buildings) {
            building.destroy();
        }
        this.buildings = [];
        this.selectedBuildingId = null;
    }
}

export default BuildingManager;
