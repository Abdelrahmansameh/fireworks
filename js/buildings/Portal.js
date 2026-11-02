import Building from './Building.js';
import PortalVisual from './PortalVisual.js';

/** A glowing pool on the ground that fireworks rise out of on a timer. */
class Portal extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'PORTAL', x, y, data);

        this.accumulator = data.accumulator ?? Math.random() * this.spawnInterval;
        this.assignedRecipeIndex = data.assignedRecipeIndex ?? null;
        this.highlightTimer = 0;
        // Without an assigned recipe, the next shot's recipe is picked ahead of
        // time so the portal can show its colour before firing.
        this._nextRandomRecipe = null;

        this._visual = game.headless ? null : new PortalVisual(game.renderer2D, this.config.zIndex);
    }

    createMesh() {
        // Drawn by PortalVisual instead of a building mesh.
    }

    highlight(duration = 2.0) {
        this.highlightTimer = duration;
    }

    isPointInside(x, y) {
        return this._visual?.contains(this.x, this.y, x, y) ?? false;
    }

    get spawnInterval() {
        return this.config.baseSpawnInterval * (this.game.portalStats?.spawnIntervalMultiplier ?? 1);
    }

    /**
     * World-space outline of the portal's ground ellipse, or null when headless.
     * Shares its name with the other buildings' outline hook used by cursor particles.
     * @returns {{x:number,y:number}[]|null}
     */
    getSkeletonOutlinePoints() {
        return this._visual?.outlinePoints(this.x, this.y) ?? null;
    }

    update(deltaTime) {
        // We do not call super.update() as it relies on this.mesh
        if (this.highlightTimer > 0) {
            this.highlightTimer -= deltaTime;
        }

        // During a cinematic, don't launch (and don't build up an accumulator
        // that would dump a burst the moment the cinematic ends).
        if (!this.game.cinematicManager?.isPlaying) {
            this.accumulator += deltaTime;
            // Staggered timers keep the show lively while preserving the exact
            // cadence bought by the player, including at a lower frame rate.
            this.accumulator = Math.min(this.accumulator, this.spawnInterval * 32);
            while (this.accumulator >= this.spawnInterval) {
                this.spawnFirework();
                this.accumulator -= this.spawnInterval;
            }
        }

        if (this._visual) {
            const recipe = this._getNextRecipe();
            this._visual.setColor(recipe?.components[0]?.color ?? null);
            this._visual.update(deltaTime, this.x, this.y, Math.max(0, this.highlightTimer));
        }
    }

    _getAssignedRecipe() {
        const index = this.assignedRecipeIndex;
        const recipe = Number.isInteger(index) && index >= 0 ? this.game.recipes?.[index] : null;
        if (Array.isArray(recipe?.components) && recipe.components.length > 0) return recipe;

        this.assignedRecipeIndex = null;
        return null;
    }

    /**
     * The recipe the next shot will use: the assigned one, or a random pick that
     * stays fixed until it fires. Recipes edited meanwhile are not re-checked.
     */
    _getNextRecipe() {
        const assigned = this._getAssignedRecipe();
        if (assigned) return assigned;
        if (!this._nextRandomRecipe) {
            const recipes = (this.game.recipes ?? []).filter(saved =>
                Array.isArray(saved?.components) && saved.components.length > 0);
            if (recipes.length === 0) return null;

            const random = this.game.rng?.() ?? Math.random();
            this._nextRandomRecipe = recipes[Math.floor(random * recipes.length)];
        }
        return this._nextRandomRecipe;
    }

    spawnFirework() {
        const recipe = this._getNextRecipe();
        if (!recipe) return;
        this._nextRandomRecipe = null;
        const components = recipe.components.map(component => ({ ...component }));

        // Rockets rise straight out of the portal's void, with a slight random lean.
        const spawnX = this.x + (Math.random() - 0.5) * 16;
        const initialTilt = (Math.random() - 0.5) * 0.08;
        this._visual?.fire(spawnX, this.y);

        // In headless mode we skip the visual firework entity but keep the
        // economic effect (firework count + sparkle award) below.
        if (!this.game.headless) {
            this.game.fireworkSystem.launch(spawnX, this.y, components, null, initialTilt);
        }
        this.game.fireworkSystem.fireworkCount++;

        const yieldMulti = this.game.portalStats?.sparkleYieldMultiplier ?? 1;
        const sparkleAmount = this.game.baseSparkleMultiplier * yieldMulti;
        this.game.addSparkles(sparkleAmount, 'portal');
        this.game.statsTracker.recordFirework('portal');
    }

    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    getSparklesPerSecond() {
        if (!this.game.recipes?.some(recipe => Array.isArray(recipe?.components) && recipe.components.length > 0)) return 0;
        const yieldMulti = this.game.portalStats?.sparkleYieldMultiplier ?? 1;
        return (this.game.baseSparkleMultiplier * yieldMulti) / this.spawnInterval;
    }

    serialize() {
        // Height comes from config on load, so it is not saved.
        const { y, ...data } = super.serialize();
        return {
            ...data,
            accumulator: this.accumulator,
            assignedRecipeIndex: this.assignedRecipeIndex,
        };
    }

    destroy() {
        this._visual?.destroy();
        this._visual = null;
    }
}

export default Portal;
