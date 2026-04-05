import Building from './Building.js';
import Firework from '../entities/Firework.js';
import { GAME_BOUNDS, PRE_RECIPE_COMPONENT_DEFAULTS } from '../config/config.js';

class AutoLauncher extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'AUTO_LAUNCHER', x, y, data);

        this.accumulator = data.accumulator || Math.random() * 5;
        this.assignedRecipeIndex = data.assignedRecipeIndex ?? null;
        this.colorOverride = data.colorOverride || AutoLauncher._randomColor();
        this.patternOverride = data.patternOverride || null;
    }

    get spawnInterval() {
        return this.config.baseSpawnInterval * (this.game.launcherStats?.spawnIntervalMultiplier ?? 1);
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.accumulator += deltaTime;

        if (this.accumulator >= this.spawnInterval) {
            this.spawnFirework();
            this.accumulator -= this.spawnInterval;
        }
    } 

    spawnFirework() {
        const x = this.x;
        const launchY = GAME_BOUNDS.WORLD_LAUNCHER_Y;

        let components;

        if (!this.game.progression.isUnlocked('recipes_tab')) {
            // Pre-recipe-tab: apply fixed defaults for all properties except color and pattern,
            // then apply colorOverride / patternOverride as usual.
            components = this.game.currentRecipeComponents.map(c => ({
                ...PRE_RECIPE_COMPONENT_DEFAULTS,
                color: c.color,
                pattern: c.pattern,
            }));
            if (this.patternOverride) {
                components = components.map(c => ({ ...c, pattern: this.patternOverride }));
            }
            if (this.colorOverride) {
                components = components.map(c => ({ ...c, color: this.colorOverride }));
            }
        } else {
            const recipe = this.game.recipes[this.assignedRecipeIndex];
            if (recipe) {
                components = recipe.components;
            } else if (this.game.recipes.length > 0) {
                const randomRecipe = this.game.recipes[Math.floor(Math.random() * this.game.recipes.length)];
                components = randomRecipe.components;
            } else {
                components = this.game.currentRecipeComponents;
            }
        }

        if (components.length === 0) {
            return;
        }

        const spawnX = x + (Math.random() * 0.5 - 0.25) * this.config.width;

        this.game.fireworkSystem.launch(spawnX, launchY, components, null);
        this.game.fireworkSystem.fireworkCount++;

        const sparkleAmount = this.game.baseSparkleMultiplier;
        this.game.addSparkles(sparkleAmount, 'auto_launcher');
        this.game.statsTracker.recordFirework('auto_launcher');
    }

    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    getSparklesPerSecond() {
        return this.game.baseSparkleMultiplier / this.spawnInterval;
    }

    serialize() {
        return {
            ...super.serialize(),
            accumulator: this.accumulator,
            assignedRecipeIndex: this.assignedRecipeIndex,
            colorOverride: this.colorOverride,
            patternOverride: this.patternOverride,
        };
    }

    static _randomColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 80 + Math.floor(Math.random() * 20); // 80–100%
        const lightness = 50 + Math.floor(Math.random() * 15);  // 50–65%
        // Convert HSL to hex
        const s = saturation / 100;
        const l = lightness / 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + hue / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
}

export default AutoLauncher;
