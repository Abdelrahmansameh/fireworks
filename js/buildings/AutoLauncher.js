import Building from './Building.js';
import Firework from '../entities/Firework.js';
import { GAME_BOUNDS } from '../config/config.js';

/**
 * AutoLauncher - Automatically launches fireworks at intervals
 */
class AutoLauncher extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'AUTO_LAUNCHER', x, y, data);
        
        // AutoLauncher specific properties
        this.spawnInterval = data.spawnInterval || this.config.baseSpawnInterval;
        this.accumulator = data.accumulator || Math.random() * 5;
        this.assignedRecipeIndex = data.assignedRecipeIndex ?? null;
    }

    /**
     * Update - spawn fireworks at intervals
     */
    update(deltaTime, boostMultiplier = 1.0) {
        // Apply boost to time accumulation (faster firing rate)
        this.accumulator += deltaTime * boostMultiplier;
        
        if (this.accumulator >= this.spawnInterval) {
            this.spawnFirework();
            this.accumulator -= this.spawnInterval;
        }
    }

    /**
     * Spawn a firework from this launcher
     */
    spawnFirework() {
        const x = this.x;
        const launchY = GAME_BOUNDS.WORLD_LAUNCHER_Y;
        
        // Get recipe to use
        let recipe = this.game.recipes[this.assignedRecipeIndex];
        let recipeComponents = null;
        let trailEffect = null;

        if (recipe) {
            recipeComponents = recipe.components;
            trailEffect = recipe.trailEffect;
        } else {
            // Use random recipe or current recipe
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
        
        // Add slight random offset
        const spawnX = x + (Math.random() * 0.5 - 0.25) * this.config.width;
        
        // Create and launch firework
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
        
        // Add sparkles
        const sparkleAmount = components.reduce(
            (sum, c) => sum + this.game.getComponentSparkles(c), 
            0
        );
        this.game.resourceManager.resources.sparkles.add(sparkleAmount);
    }

    /**
     * Upgrade - reduce spawn interval
     */
    onUpgrade() {
        this.spawnInterval = this.spawnInterval * this.config.spawnIntervalRatio;
    }

    /**
     * Get current spawn rate (fireworks per second)
     */
    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    /**
     * Get sparkles per second for this launcher
     */
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

    /**
     * Serialize with launcher-specific data
     */
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
