import Firework from '../entities/Firework.js';
import { FIREWORK_CONFIG, GAME_BOUNDS } from '../config/config.js';

export default class FireworkSystem {
    constructor(game) {
        this.game = game;
        this.fireworks = [];
        this.fireworkCount = 0;
    }

    init(savedFireworkCount = 0) {
        this.fireworkCount = savedFireworkCount;
        this.disposeAll();
    }

    update(deltaTime) {
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            this.fireworks[i].update(deltaTime);
            if (!this.fireworks[i].alive) {
                this.fireworks[i].dispose();
                this.fireworks.splice(i, 1);
            }
        }
    }

    disposeAll() {
        if (this.fireworks) {
            this.fireworks.forEach(f => f.dispose());
        }
        this.fireworks = [];
    }

    launch(x, y, components, targetY = null, initialTilt = null) {
        const firework = new Firework(
            x, y, components,
            this.game.renderer2D,
            this.game.particleSystem,
            targetY,
            this.game.audioManager,
            initialTilt
        );
        this.fireworks.push(firework);
    }

    launchFireworkAt(x, targetY = null, minY = null, recipeComponents = null) {
        let components = recipeComponents || this.game.currentRecipeComponents;

        if (components.length === 0) {
            this.game.showNotification("Add at least one component to launch a firework!");
            return;
        }

        const y = minY || GAME_BOUNDS.WORLD_LAUNCHER_Y;
        const spawnX = x + (Math.random() * 6 - 3) * FIREWORK_CONFIG.autoLauncherMeshWidth;
        const spawnY = y + FIREWORK_CONFIG.autoLauncherMeshHeight / 2;

        this.launch(spawnX, spawnY, components, Math.max(targetY, minY), null);
        this.fireworkCount++;
        
        const sparkleAmount = this.game.baseSparkleMultiplier;
        this.game.addSparkles(sparkleAmount, 'manual');
        this.game.statsTracker.recordFirework('manual');
        this.game.checkUnlockConditions();
        
        const rocketColor = components[0]?.color ?? null;
        return { sparkleAmount, spawnX, spawnY, rocketColor };
    }
}
