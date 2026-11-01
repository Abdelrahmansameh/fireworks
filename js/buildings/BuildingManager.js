import AutoLauncher from './AutoLauncher.js';
import Catapult from './Catapult.js';
import Building from './Building.js';
import { BUILDING_TYPES, GAME_BOUNDS } from '../config/config.js';
import { getVenueStage } from '../config/VenueProgression.js';

class BuildingManager {
    constructor(game) {
        this.game = game;
        this.buildings = [];
        this.selectedBuildingId = null;

        this.buildingClasses = {
            'AUTO_LAUNCHER': AutoLauncher,
            'CATAPULT': Catapult,
        };
    }

    createBuilding(buildingType, x, y, data = {}) {
        const BuildingClass = this.buildingClasses[buildingType];
        if (!BuildingClass) {
            console.error(`Unknown building type: ${buildingType}`);
            return null;
        }

        if (buildingType === 'AUTO_LAUNCHER') {
            x = this.getLauncherSlotX(this.getBuildingsByType('AUTO_LAUNCHER').length);
        }
        const building = new BuildingClass(this.game, x, y, data);
        this.buildings.push(building);
        // Record milestones immediately, including in headless play or when a
        // player refunds a building before the next rendered frame.
        getVenueStage(this.game);
        if (!this.game._isRestoring && !this.game.headless) {
            this.game.pendingVenueFocusX = building.x;
        }

        return building;
    }

    buyBuilding(buildingType) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) {
            this.game.showNotification("Unknown building type!");
            return null;
        }

        if (!this.game.isBuildingTypeUnlocked(buildingType)) {
            this.game.showNotification(`${config.name} has not unlocked yet.`);
            return null;
        }

        const count = this.getBuildingsByType(buildingType).length;

        const limit = this.getBuildingLimit(buildingType);
        if (count >= limit) {
            this.game.showNotification(`Maximum ${config.name} count reached (${limit}).`);
            return null;
        }

        const cost = Building.getPurchaseCost(buildingType, count);

        const resource = this.game.resourceManager.resources[config.currency];
        if (!resource || resource.amount < cost) {
            this.game.showNotification(`Not enough ${config.currency} to buy ${config.name}!`);
            return null;
        }

        resource.subtract(cost);

        const x = this.getNewBuildingX(buildingType);
        const y = config.y;

        const building = this.createBuilding(buildingType, x, y, { purchaseCost: cost });

        if (building) {
            this.game.showNotification(`${config.name} purchased!`);
        }

        return building;
    }

    getNewBuildingX(buildingType) {
        const count = this.getBuildingsByType(buildingType).length;
        let x;

        // Catapults share the crowd area, with the first closest to launchers.
        if (buildingType === 'CATAPULT') {
            x = GAME_BOUNDS.CATAPULT_MAX_X + count * GAME_BOUNDS.CATAPULT_X_STEP;
            const minX = GAME_BOUNDS.CATAPULT_MIN_X;
            const maxX = GAME_BOUNDS.CATAPULT_MAX_X;
            x = Math.max(minX, Math.min(x, maxX));
        } else {
            x = this.getLauncherSlotX(count);
        }

        return x;
    }

    getLauncherSlotX(index) {
        return GAME_BOUNDS.LAUNCHER_START_X + index * GAME_BOUNDS.LAUNCHER_SPACING;
    }

    /** Launchers always occupy the first N slots, in purchase order. */
    layoutLaunchers() {
        this.getBuildingsByType('AUTO_LAUNCHER').forEach((launcher, index) => {
            launcher.x = this.getLauncherSlotX(index);
            if (launcher.mesh) launcher.mesh.position.x = launcher.x;
        });
    }

    getBuildingLimit(buildingType) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) return 0;
        if (buildingType === 'CATAPULT') return this.game.catapultStats?.maxCatapults ?? 1;
        return config.maxCount ?? Infinity;
    }

    removeBuilding(building) {
        const index = this.buildings.indexOf(building);
        if (index > -1) {
            building.destroy();
            this.buildings.splice(index, 1);

            if (this.selectedBuildingId === building.id) {
                this.selectedBuildingId = null;
            }
            if (building.type === 'AUTO_LAUNCHER') this.layoutLaunchers();
        }
    }

    update(deltaTime) {
        for (const building of this.buildings) {
            building.update(deltaTime);
        }
    }

    getTheoreticalAutoLauncherFPS() {
        if (!this.game.recipes.some(recipe => recipe?.components?.length)) return 0;
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

    resetBuildingsOfType(buildingType) {
        const buildings = this.getBuildingsByType(buildingType);
        let refundAmount = 0;

        for (let i = buildings.length - 1; i >= 0; i--) {
            const building = buildings[i];

            if (!building.grantUpgradeId) {
                refundAmount += building.purchaseCost ?? Building.getPurchaseCost(buildingType, i);
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
                if (!this.buildingClasses[buildingData.type]) continue;
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
