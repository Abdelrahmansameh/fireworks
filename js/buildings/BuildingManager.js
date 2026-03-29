import AutoLauncher from './AutoLauncher.js';
import ResourceGenerator from './ResourceGenerator.js';
import DroneHub from './DroneHub.js';
import Building from './Building.js';
import { BUILDING_TYPES, GAME_BOUNDS } from '../config/config.js';

class BuildingManager {
    constructor(game) {
        this.game = game;
        this.buildings = [];
        this.selectedBuildingId = null;
        
        this.buildingClasses = {
            'AUTO_LAUNCHER': AutoLauncher,
            'RESOURCE_GENERATOR': ResourceGenerator,
            'DRONE_HUB': DroneHub,
        };
    }

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

    update(deltaTime) {
        for (const building of this.buildings) {
            building.update(deltaTime);
        }
    }

    getTheoreticalAutoLauncherFPS() {
        const launchers = this.getBuildingsByType('AUTO_LAUNCHER');
        
        let totalFPS = 0;
        for (const launcher of launchers) {
            totalFPS += 1 / launcher.spawnInterval;
        }
        return totalFPS;
    }

    getBuildingAt(x, y) {
        for (const building of this.buildings) {
            if (building.isPointInside(x, y)) {
                return building;
            }
        }
        return null;
    }

    getBuildingsByType(buildingType) {
        return this.buildings.filter(b => b.type === buildingType);
    }

    getBuildingById(id) {
        return this.buildings.find(b => b.id === id);
    }

    getBuyCost(buildingType) {
        const count = this.getBuildingsByType(buildingType).length;
        return Building.getPurchaseCost(buildingType, count);
    }

    selectBuilding(building) {
        this.selectedBuildingId = building ? building.id : null;
    }

    getSelectedBuilding() {
        return this.getBuildingById(this.selectedBuildingId);
    }

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

    resetBuildingsOfType(buildingType) {
        const buildings = this.getBuildingsByType(buildingType);
        let refundAmount = 0;

        for (let i = buildings.length - 1; i >= 0; i--) {
            const building = buildings[i];
            
            const purchaseCost = Building.getPurchaseCost(buildingType, 0);
            refundAmount += purchaseCost;
            
            this.removeBuilding(building);
        }

        const config = BUILDING_TYPES[buildingType];
        const resource = this.game.resourceManager.resources[config.currency];
        if (resource) {
            resource.add(Math.floor(refundAmount));
        }

        return refundAmount;
    }

    isValidPlacement(x, y, buildingType, excludeBuilding = null) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) return false;

        const halfWidth = config.width / 2;
        if (x - halfWidth < GAME_BOUNDS.LAUNCHER_MIN_X || 
            x + halfWidth > GAME_BOUNDS.LAUNCHER_MAX_X) {
            return false;
        }

        const minSpacing = 20;
        
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

    serialize() {
        return {
            buildings: this.buildings.map(b => b.serialize()),
            selectedBuildingId: this.selectedBuildingId,
        };
    }

    deserialize(data) {
        for (const building of this.buildings) {
            building.destroy();
        }
        this.buildings = [];

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

    destroy() {
        for (const building of this.buildings) {
            building.destroy();
        }
        this.buildings = [];
        this.selectedBuildingId = null;
    }
}

export default BuildingManager;
