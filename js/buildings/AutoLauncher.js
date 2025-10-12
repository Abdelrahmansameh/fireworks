import Building from './Building.js';
import Firework from '../entities/Firework.js';
import { GAME_BOUNDS } from '../config/config.js';

class AutoLauncher extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'AUTO_LAUNCHER', x, y, data);
        
        this.spawnInterval = data.spawnInterval || this.config.baseSpawnInterval;
        this.accumulator = data.accumulator || Math.random() * 5;
        this.assignedRecipeIndex = data.assignedRecipeIndex ?? null;
    }

    update(deltaTime, boostMultiplier = 1.0) {
        this.accumulator += deltaTime * boostMultiplier;
        
        if (this.accumulator >= this.spawnInterval) {
            this.spawnFirework();
            this.accumulator -= this.spawnInterval;
        }
    }

    spawnFirework() {
        const x = this.x;
        const launchY = GAME_BOUNDS.WORLD_LAUNCHER_Y;
        
        let recipe = this.game.recipes[this.assignedRecipeIndex];
        let recipeComponents = null;
        let trailEffect = null;

        if (recipe) {
            recipeComponents = recipe.components;
            trailEffect = recipe.trailEffect;
        } else {
            if (this.game.recipes.length > 0) {
                const randomRecipe = this.game.recipes[Math.floor(Math.random() * this.game.recipes.length)];
                recipeComponents = randomRecipe.components;
                trailEffect = randomRecipe.trailEffect;
            } else {
                recipeComponents = this.game.currentRecipeComponents;
                trailEffect = this.game.currentTrailEffect;
            }
        }

        const components = recipeComponents || this.game.currentRecipeComponents;

        if (components.length === 0) {
            return;
        }

        const effect = trailEffect || this.game.currentTrailEffect;
        
        const spawnX = x + (Math.random() * 0.5 - 0.25) * this.config.width;
        
        const firework = new Firework(
            spawnX, 
            launchY, 
            components, 
            this.game.renderer2D, 
            effect, 
            this.game.particleSystem
        );
        
        this.game.gameState.fireworks.push(firework);
        this.game.fireworkCount++;
        
        const sparkleAmount = components.reduce(
            (sum, c) => sum + this.game.getComponentSparkles(c), 
            0
        );
        this.game.resourceManager.resources.sparkles.add(sparkleAmount);
    }

    onUpgrade() {
        this.spawnInterval = this.spawnInterval * this.config.spawnIntervalRatio;
    }

    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    getSparklesPerSecond() {
        let recipe = this.game.recipes[this.assignedRecipeIndex];
        let components;
        
        if (recipe) {
            components = recipe.components;
        } else {
            if (this.game.recipes.length > 0) {
                components = this.game.recipes[0].components;
            } else {
                components = this.game.currentRecipeComponents;
            }
        }

        const sparklePerFirework = components.reduce(
            (sum, c) => sum + this.game.getComponentSparkles(c), 
            0
        );
        
        return sparklePerFirework / this.spawnInterval;
    }

    serialize() {
        return {
            ...super.serialize(),
            spawnInterval: this.spawnInterval,
            accumulator: this.accumulator,
            assignedRecipeIndex: this.assignedRecipeIndex,
        };
    }
}

export default AutoLauncher;
