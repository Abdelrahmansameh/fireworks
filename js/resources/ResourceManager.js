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
        // Sparkles self-accumulates via _perSecond (set from building SPS).
        this.resources.sparkles.update();

        // Gold income is routed through game.addGold() so StatsTracker
        // can attribute it to the 'crowd' source.
        const goldIncome = this.resources.gold.computePassiveIncome();
        if (goldIncome > 0) {
            this.game.addGold(goldIncome, 'crowd');
        }
    }

    updateGoldFromCrowd(crowdSize) {
        this.resources.gold.updateFromCrowd(crowdSize);
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
