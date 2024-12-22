import Gold from './Gold.js';
import Sparkles from './Sparkles.js';

export default class ResourceManager {
    constructor(game) {
        this.game = game;
        this.resources = {
            sparkles: new Sparkles(),
            gold: new Gold()
        };
        
        this.lastUpdate = performance.now();
    }

    update() {
        for (const resource of Object.values(this.resources)) {
            resource.update();
        }
    }

    updateGoldFromCrowd(crowdSize) {
        this.resources.gold.updateFromCrowd(crowdSize);
    }

    updateSparklesFromLevel(levelSparklesPerSecond) {
        this.resources.sparkles.updateFromLevel(levelSparklesPerSecond);
    }

    reset() {
        this.resources = {
            sparkles: new Sparkles(),
            gold: new Gold()
        };
        this.lastUpdate = performance.now();
    }

    save() {
        const saveData = {};
        for (const [key, resource] of Object.entries(this.resources)) {
            saveData[key] = resource.save();
        }
        return saveData;
    }

    load(data) {
        if (!data) return;
        
        for (const [key, resourceData] of Object.entries(data)) {
            if (this.resources[key]) {
                this.resources[key].load(resourceData);
            }
        }
    }
}
