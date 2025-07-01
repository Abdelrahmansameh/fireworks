import { FIREWORK_CONFIG, GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, BACKGROUND_IMAGES, AUTO_LAUNCHER_COST_BASE, AUTO_LAUNCHER_COST_RATIO, AUTO_UPGRADE_COST_RATIO, AUTO_SPAWN_INTERVAL_RATIO } from '../config/config.js';
import { UPGRADE_DEFINITIONS } from '../upgrades/upgrades.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import Crowd from '../entities/Crowd.js';
import Firework from '../entities/Firework.js';
import UIManager from '../ui/UIManager.js';
import ResourceManager from '../resources/ResourceManager.js';
import GameProfiler from '../profiling/GameProfiler.js';
import * as Renderer2D from '../rendering/Renderer.js';

class FireworkGame {
    constructor() {
        this.gameState = {
            fireworks: [],
            autoLaunchers: []
        };

        this.recipes = [];
        this.currentRecipeComponents = [];
        this.currentTrailEffect = 'fade';
        this.currentBackground = BACKGROUND_IMAGES[0].path;
        this.fireworkCount = 0;
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;
        this.selectedLauncherIndex = null;
        this.crowdThresholds = [1, 2, 3, 4, 5, 10, 15];

        this.resourceManager = new ResourceManager(this);
        this.ui = new UIManager(this);
        this.profiler = new GameProfiler();

        this.currentState = 'game';
        this.advancedCreatorUnlocked = JSON.parse(localStorage.getItem('advancedCreatorUnlocked') || 'false');

        this.cameraTransitionSpeed = 2.0;

        this.usePostProcessing = JSON.parse(localStorage.getItem('usePostProcessing') || 'true');

        this.baseSparkleMultiplier = 1;
        this.patternSparkleMultipliers = { default: 1 };

        // Upgrades state
        this.upgrades = UPGRADE_DEFINITIONS;                       // static definitions
        this.upgradeLookup = Object.fromEntries(UPGRADE_DEFINITIONS.map(u => [u.id, u]));
        this.purchasedUpgrades = {}; // id -> level

        const savedBaseMult = parseFloat(localStorage.getItem('baseSparkleMultiplier'));
        if (!isNaN(savedBaseMult)) {
            this.baseSparkleMultiplier = savedBaseMult;
        }

        const savedPatternMultStr = localStorage.getItem('patternSparkleMultipliers');
        if (savedPatternMultStr) {
            try {
                const parsed = JSON.parse(savedPatternMultStr);
                if (parsed && typeof parsed === 'object') {
                    this.patternSparkleMultipliers = { ...this.patternSparkleMultipliers, ...parsed };
                }
            } catch (e) {
                console.error('Failed to parse pattern sparkle multipliers:', e);
            }
        }

        // Load purchased upgrades
        try {
            const stored = JSON.parse(localStorage.getItem('purchasedUpgrades') || '{}');
            if (stored && typeof stored === 'object') this.purchasedUpgrades = stored;
        } catch { }

        // Apply purchased upgrades to compute multipliers / effects
        this.recomputeUpgrades();

        this.init();
    }

    init() {
        this.fireworkCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || AUTO_LAUNCHER_COST_BASE;
        this.currentBackground = localStorage.getItem('currentBackground') || BACKGROUND_IMAGES[0].path;

        // Load resources
        const savedResources = localStorage.getItem('resources');
        if (savedResources) {
            try {
                const resourceData = JSON.parse(savedResources);
                this.resourceManager.load(resourceData);
            } catch (e) {
                console.error('Failed to load resources:', e);
            }
        }

        // Load game state data 
        const savedGameState = JSON.parse(localStorage.getItem('gameState'));
        if (savedGameState && savedGameState.autoLaunchers) {
            this.gameState.autoLaunchers = savedGameState.autoLaunchers.map(launcherData => ({ ...launcherData }));
        }

        // Load selected launcher
        const savedSelectedIndex = parseInt(localStorage.getItem('selectedLauncherIndex'));
        if (!isNaN(savedSelectedIndex) && savedSelectedIndex < this.gameState.autoLaunchers.length) {
            this.selectedLauncherIndex = savedSelectedIndex;
            // this.selectLauncher(this.selectedLauncherIndex); // selectLauncher updates UI, UI might not be ready
        }

        // Initialize 2D renderer
        this.initRenderer2D();
        this.initBackgroundColor();

        this.gameState.autoLaunchers.forEach(launcher => {
            this.createAutoLauncherMesh(launcher);

            if (!launcher.accumulator) {
                launcher.accumulator = Math.random() * 5;
            }
            if (launcher.level === undefined) {
                launcher.level = 1;
                launcher.spawnInterval = 5;
                launcher.upgradeCost = 15;
            }
            launcher.x = this.clampToLauncherBounds(launcher.x);
        });

        // Initialize game components
        this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
        this.crowd = new Crowd(this.renderer2D);

        // Initialize crowd
        const initialSps = this.calculateTotalSparklesPerSecond();
        const initialCrowd = this._calculateTargetCrowdCount(initialSps);
        this.crowd.setCount(initialCrowd);
        this.updateCrowdDisplay();

        // Load UI and events
        this.loadRecipes();
        this.loadCurrentRecipe();
        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        // Setup game container
        const gameContainer = document.getElementById('game-container');
        gameContainer.style.touchAction = 'none';

        // Setup visibility change handler\
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.pause();
            } else if (document.visibilityState === 'visible') {
                this.resume();
            }
        });

        // Start game loop
        this.animate();

        this.ui.bindEvents();
    }

    initRenderer2D() {
        this.canvas2D = document.getElementById('game-canvas');
        this.renderer2D = new Renderer2D.Renderer2D(this.canvas2D, {
            usePostProcessing: this.usePostProcessing,
        });
        this.renderer2D._resizeIfNeeded();


        this.autoLauncherTextureLoaded = false;
        if (FIREWORK_CONFIG.autoLauncherTexture) {
            this.renderer2D.loadTexture(FIREWORK_CONFIG.autoLauncherTexture, 'auto_launcher_texture')
                .then(() => {
                    this.autoLauncherTextureLoaded = true;
                    this._applyAutoLauncherTexture();
                })
                .catch(err => console.warn('Failed to load auto-launcher texture. Falling back to default mesh.', err));
        }

        this.updateBackgroundMesh();

        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
        this.cameraTargetZoom = 1.0;

        this.clock = new Renderer2D.Clock();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.ui.initializeRendererEvents();
        this.bindEvents();
    }

    /**
     * Replace existing launcher meshes with textured versions once the texture is loaded.
     * New launchers created after this point will automatically use the texture.
     */
    _applyAutoLauncherTexture() {
        const tex = this.renderer2D.getTexture('auto_launcher_texture');
        if (!tex) return;

        for (const launcher of this.gameState.autoLaunchers) {
            if (!launcher.mesh) {
                // Mesh not yet created (e.g., pending). Create it now.
                this.createAutoLauncherMesh(launcher);
                continue;
            }

            // Replace the existing mesh with a textured one
            this.renderer2D.removeNormalShape(launcher.mesh);
            launcher.mesh = null;
            this.createAutoLauncherMesh(launcher);
        }
    }

    async updateBackgroundMesh() {
        if (this._backgroundMeshes) {
            this._backgroundMeshes.forEach(mesh => this.renderer2D.removeNormalShape(mesh));
            this._backgroundMeshes = [];
        }

        const textureKey = `bg_${this.currentBackground}`;
        await this.renderer2D.loadTexture(this.currentBackground, textureKey);
        const tex = this.renderer2D.getTexture(textureKey);
        if (!tex) return;

        const width = this.renderer2D.virtualWidth;
        const height = this.renderer2D.virtualHeight;

        const repeatCount = 10;
        const meshes = [];
        for (let i = -repeatCount / 2; i <= repeatCount / 2; i++) {
            const bgMesh = this.renderer2D.createNormalShape({
                ...Renderer2D.buildTexturedSquare(width, height),
                texCoords: new Float32Array([
                    0, 1,
                    1, 1,
                    1, 0,
                    0, 0
                ]),
                texture: tex,
                position: new Renderer2D.Vector2(i * width, 0),
                rotation: 0,
                scale: new Renderer2D.Vector2(1, 1),
                zIndex: -1000,
                blendMode: Renderer2D.BlendMode.NORMAL,
                isStroke: false
            });
            meshes.push(bgMesh);
        }
        this._backgroundMeshes = meshes;
    }

    onWindowResize() {

        this.renderer2D._updateProjectionMatrix();
        const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / (2 * this.renderer2D.cameraZoom));
        const yPos = viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;
        for (const launcher of this.gameState.autoLaunchers) {
            launcher.y = yPos;
            if (launcher.mesh) {
                launcher.mesh.position.y = yPos;
            }
        }
    }

    bindEvents() {
        this.ui.bindUIEvents();
    }

    showConfirmation(title, message, onConfirm) {
        this.ui.showConfirmation(title, message, onConfirm);
    }

    showNotification(message) {
        this.ui.showNotification(message);
    }

    isPositionInsideUI(x, y) {
        const gameCanvas = document.getElementById('game-canvas');
        return document.elementFromPoint(x, y) !== gameCanvas;
    }

    isClickInsideUI(event) {
        return this.isPositionInsideUI(event.clientX, event.clientY);
    }

    screenToWorld(x, y) {
        return this.renderer2D.screenToCanvas(x, y);
    }

    getViewBounds() {
        return { ...GAME_BOUNDS };
    }

    detectMobile() {
        return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.userAgent.includes('Mobi');
    }

    showTab(tab) {
        this.ui.showTab(tab);
    }

    toggleTab(tab) {
        this.ui.toggleTab(tab);
    }

    addSparkles(amount) {
        this.resourceManager.resources.sparkles.add(amount);
    }

    subtractSparkles(amount) {
        this.resourceManager.resources.sparkles.subtract(amount);
    }

    getSparkles() {
        return this.resourceManager.resources.sparkles.amount;
    }

    getComponentSparkles(component) {
        const patternMult = this.patternSparkleMultipliers[component.pattern] ?? this.patternSparkleMultipliers.default ?? 1;
        return this.baseSparkleMultiplier * patternMult;
    }

    updateUI() {
        const totalSparklesPerSec = this.calculateTotalSparklesPerSecond().toFixed(2);

        this.ui.updateUI(
            Math.floor(this.getSparkles()),
            totalSparklesPerSec, // Pass total rate, level-specific rate is removed
            this.fireworkCount,
            this.gameState.autoLaunchers.length,
            this.currentTrailEffect,
            this.calculateAutoLauncherCost(this.gameState.autoLaunchers.length)
        );
    }

    updateGame(deltaTime) {
        this.profiler.startFrame();

        this.particleSystem.update(deltaTime);

        this.updateCameraPosition(deltaTime);


        this.profiler.startFunction('autoLaunchersUpdate');
        this.gameState.autoLaunchers.forEach(launcher => {
            launcher.accumulator += deltaTime;
            if (launcher.accumulator >= launcher.spawnInterval) {
                const x = launcher.x;
                let recipe = this.recipes[launcher.assignedRecipeIndex];

                let recipeComponents = null;
                let trailEffect = null;

                const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / 2 / this.renderer2D.cameraZoom);
                const launchY = viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;

                if (recipe) {
                    recipeComponents = recipe.components;
                    trailEffect = recipe.trailEffect;
                } else {
                    if (!this.recipes.length) {
                        recipeComponents = this.currentRecipeComponents;
                        trailEffect = this.currentTrailEffect;
                    }
                    else {
                        recipeComponents = this.recipes[Math.floor(Math.random() * this.recipes.length)].components;
                        trailEffect = this.recipes[Math.floor(Math.random() * this.recipes.length)].trailEffect;
                    }
                }

                const components = recipeComponents || this.currentRecipeComponents;

                if (components.length === 0) {
                    return;
                }

                const effect = trailEffect || this.currentTrailEffect;

                const firework = new Firework(x + (Math.random() * 0.5 - 0.25) * FIREWORK_CONFIG.autoLauncherMeshWidth, launchY, components, this.renderer2D, this.renderer2D.virtualHeight / this.renderer2D.cameraZoom, effect, this.particleSystem);
                this.gameState.fireworks.push(firework); this.fireworkCount++;
                const sparkleAmount = components.reduce((sum, c) => sum + this.getComponentSparkles(c), 0);
                this.resourceManager.resources.sparkles.add(sparkleAmount);
                this.updateUI();
                launcher.accumulator -= launcher.spawnInterval;
            }
        });
        this.profiler.endFunction('autoLaunchersUpdate');


        // Update crowd based on sparkles per second
        const currentSps = this.calculateTotalSparklesPerSecond();
        const targetCrowdSize = this._calculateTargetCrowdCount(currentSps);
        this.crowd.setCount(targetCrowdSize);

        this.resourceManager.updateGoldFromCrowd(this.crowd.people.length);
        this.resourceManager.update();

        this.crowd.update(deltaTime);

        this.saveProgress();

        this.profiler.endFrame();
    }

    _calculateTargetCrowdCount(sps) {
        let count = 0;
        for (const threshold of this.crowdThresholds) {
            if (sps >= threshold) {
                count++;
            }
        }
        return count;
    }

    initBackgroundColor() {
        document.body.style.backgroundColor = '#171717';
    }

    saveProgress() {
        localStorage.setItem('fireworkCount', this.fireworkCount);
        localStorage.setItem('autoLauncherCost', this.autoLauncherCost);
        localStorage.setItem('sparkles', this.getSparkles());
        localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
        localStorage.setItem('currentTrailEffect', this.currentTrailEffect);

        const gameStateData = {
            autoLaunchers: this.gameState.autoLaunchers
        };
        localStorage.setItem('gameState', JSON.stringify(gameStateData));

        localStorage.setItem('currentRecipeComponents', JSON.stringify(this.currentRecipeComponents));
        localStorage.setItem('selectedLauncherIndex', this.selectedLauncherIndex || '');
        localStorage.setItem('currentBackground', this.currentBackground);

        localStorage.setItem('resources', JSON.stringify(this.resourceManager.save()));
        localStorage.setItem('advancedCreatorUnlocked', JSON.stringify(this.advancedCreatorUnlocked));

        localStorage.setItem('baseSparkleMultiplier', this.baseSparkleMultiplier);
        localStorage.setItem('patternSparkleMultipliers', JSON.stringify(this.patternSparkleMultipliers));
        localStorage.setItem('purchasedUpgrades', JSON.stringify(this.purchasedUpgrades));
    }

    dismissNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        if (this.isPaused) {
            this.isPaused = false;
            this.clock.start();
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        if (!this.isPaused) {
            if (this.currentState === 'game') {
                const currentFireworks = this.gameState.fireworks;
                for (let i = currentFireworks.length - 1; i >= 0; i--) {
                    currentFireworks[i].update(delta);
                    if (!currentFireworks[i].alive) {
                        currentFireworks[i].dispose();
                        currentFireworks.splice(i, 1);
                    }
                }

                this.updateGame(delta);

                this.profiler.startFunction('drawFrame');
                this.renderer2D.drawFrame();
                this.profiler.endFunction('drawFrame');
            } else if (this.currentState === 'creator') {
                this.updateCreator(delta);

                this.profiler.startFunction('drawFrame');
                if (this.previewRenderer) this.previewRenderer.drawFrame();
                this.profiler.endFunction('drawFrame');
            }
        }
    }

    getLauncherAt(x, y) {
        for (const launcher of this.gameState.autoLaunchers) {
            if (launcher.mesh) {
                const halfWidth = (launcher.mesh.scale.x * FIREWORK_CONFIG.autoLauncherMeshWidth) / 2;
                const halfHeight = (launcher.mesh.scale.y * FIREWORK_CONFIG.autoLauncherMeshHeight) / 2;
                if (
                    x >= launcher.x - halfWidth &&
                    x <= launcher.x + halfWidth &&
                    y >= launcher.mesh.position.y - halfHeight &&
                    y <= launcher.mesh.position.y + halfHeight
                ) {
                    return launcher;
                }
            }
        }
        return null;
    }

    // dont use every frame because js is weird 
    launchFireworkAt(x, targetY = null, minY = null, recipeComponents = null, trailEffect = null) {
        const components = recipeComponents || this.currentRecipeComponents;

        if (components.length === 0) {
            this.showNotification("Add at least one component to launch a firework!");
            return;
        }

        const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / 2 / this.renderer2D.cameraZoom);
        const y = minY || viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;
        const effect = trailEffect || this.currentTrailEffect;
        const spawnX = x + (Math.random() - 0.5) * FIREWORK_CONFIG.autoLauncherMeshWidth;
        const spawnY = y + FIREWORK_CONFIG.autoLauncherMeshHeight / 2;

        this.launch(spawnX, spawnY, components, effect, Math.max(targetY, minY));
        this.fireworkCount++;
        const sparkleAmount = components.reduce((sum, c) => sum + this.getComponentSparkles(c), 0);
        this.addSparkles(sparkleAmount);
        this.updateUI();
        return { sparkleAmount, spawnX, spawnY };
    }

    // dont use every frame because js is weird 
    launch(x, y, components, trailEffect, targetY = null) {
        const firework = new Firework(x, y, components, this.renderer2D, this.renderer2D.virtualHeight / this.renderer2D.cameraZoom, trailEffect, this.particleSystem, targetY);
        this.gameState.fireworks.push(firework);
    }

    buyAutoLauncher() {
        const numLaunchers = this.gameState.autoLaunchers.length;
        const cost = this.calculateAutoLauncherCost(numLaunchers);

        if (this.getSparkles() >= cost) {
            this.subtractSparkles(cost);
            let x = this.renderer2D.cameraX + (Math.random() * 500 - 250);
            x = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X + Math.random() * 300, Math.min(x, GAME_BOUNDS.LAUNCHER_MAX_X - Math.random() * 300));
            const accumulator = Math.random() * 5;
            const launcher = {
                x: x,
                accumulator: accumulator,
                assignedRecipeIndex: null,
                level: 1,
                spawnInterval: 5,
                upgradeCost: 15,
                mesh: null 
            };
            this.gameState.autoLaunchers.push(launcher);
            this.createAutoLauncherMesh(launcher); 
            this.updateUI();
            this.updateLauncherList();
            this.showNotification("Auto-Launcher purchased!");
        } else {
            this.showNotification("Not enough sparkles to buy this upgrade!");
        }
    }

    calculateAutoLauncherCost(numLaunchers) {
        return Math.floor(AUTO_LAUNCHER_COST_BASE * Math.pow(AUTO_LAUNCHER_COST_RATIO, numLaunchers));
    }

    createAutoLauncherMesh(launcher) {
        const width = FIREWORK_CONFIG.autoLauncherMeshWidth;
        const height = FIREWORK_CONFIG.autoLauncherMeshHeight;
        const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / (2 * this.renderer2D.cameraZoom));
        const yPos = viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;

        const tex = (this.autoLauncherTextureLoaded && FIREWORK_CONFIG.autoLauncherTexture) ? this.renderer2D.getTexture('auto_launcher_texture') : null;

        if (tex) {
            // Textured square (width x height) centred around origin
            const squareGeom = Renderer2D.buildTexturedSquare(width, height);

            launcher.mesh = this.renderer2D.createNormalShape({
                vertices: squareGeom.vertices,
                texCoords: squareGeom.texCoords,
                indices: squareGeom.indices,
                texture: tex,
                color: new Renderer2D.Color(1, 1, 1, 1), // white so texture shows as-is
                position: new Renderer2D.Vector2(launcher.x, yPos),
                rotation: 0,
                scale: new Renderer2D.Vector2(1, 1),
                zIndex: 10, // Behind fireworks and particles
                blendMode: Renderer2D.BlendMode.NORMAL,
                isStroke: false
            });
        } else {
            // Fallback to simple coloured rectangle (legacy behaviour)
            const rectVertices = [
                -width / 2, -height / 2,
                width / 2, -height / 2,
                width / 2, height / 2,
                -width / 2, height / 2
            ];

            const rectGeom = Renderer2D.buildPolygon(rectVertices);
            const color = FIREWORK_CONFIG.autoLauncherMeshColor;

            launcher.mesh = this.renderer2D.createNormalShape({
                vertices: rectGeom.vertices,
                indices: rectGeom.indices,
                color: new Renderer2D.Color(color.r, color.g, color.b, 1),
                position: new Renderer2D.Vector2(launcher.x, yPos),
                rotation: 0,
                scale: new Renderer2D.Vector2(1, 1),
                zIndex: 20,
                blendMode: Renderer2D.BlendMode.NORMAL,
                isStroke: false
            });
        }
    }

    resetAutoLaunchers() {
        let refundAmount = 0;

        this.gameState.autoLaunchers.forEach(launcher => {
            if (launcher.mesh) {
                this.renderer2D.removeNormalShape(launcher.mesh);
                launcher.mesh = null;
            }
            let cost = 0;
            cost += this.calculateAutoLauncherCost(0); 
            let currentUpgradeCost = 15; 
            for (let i = 1; i < launcher.level; i++) {
                cost += currentUpgradeCost;
                currentUpgradeCost = Math.floor(currentUpgradeCost * AUTO_UPGRADE_COST_RATIO);
            }
            refundAmount += cost;
        });
        this.gameState.autoLaunchers = [];


        this.addSparkles(Math.floor(refundAmount));
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE; 
        this.updateUI();
        this.updateLauncherList();
        return refundAmount;
    }

    resetGame() {
        this.fireworkCount = 0;
        this.recipes = [];
        this.currentTrailEffect = 'fade';
        this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
        this.baseSparkleMultiplier = 1;
        this.patternSparkleMultipliers = { default: 1 };

        this.resourceManager.reset();

        this.purchasedUpgrades = {};
        this.recomputeUpgrades();

        if (this.gameState.fireworks) {
            this.gameState.fireworks.forEach(firework => {
                firework.dispose();
            });
        }
        this.gameState.fireworks = [];
        this.gameState.autoLaunchers.forEach(launcher => {
            if (launcher.mesh) {
                this.renderer2D.removeNormalShape(launcher.mesh);
            }
        });
        this.gameState.autoLaunchers = [];


        if (this.crowd) {
            this.crowd.dispose();
            this.crowd = new Crowd(this.renderer2D);
        }



        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
        }

        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;

        localStorage.clear();

        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();
        this.showNotification("Game has been reset.");

        document.body.style.backgroundColor = '#000000';

        this.updateCrowdDisplay();
    }

    eraseAllRecipes() {
        this.recipes = [];
        localStorage.removeItem('fireworkRecipes');
        this.updateRecipeList();
        this.showNotification("All recipes have been erased.");
    }

    updateComponentsList(containerId = 'components-list') {
        this.ui.updateComponentsList(this.currentRecipeComponents, () => {
            this.saveCurrentRecipeComponents();
        }, containerId);
    }

    saveCurrentRecipeComponents() {
        localStorage.setItem('currentRecipeComponents', JSON.stringify(this.currentRecipeComponents));
        localStorage.setItem('currentTrailEffect', this.currentTrailEffect);
    }

    loadCurrentRecipe() {
        const savedRecipeComponents = localStorage.getItem('currentRecipeComponents');
        const savedTrailEffect = localStorage.getItem('currentTrailEffect');
        const savedRecipeName = localStorage.getItem('currentRecipeName');
        if (savedRecipeComponents) {
            this.currentRecipeComponents = JSON.parse(savedRecipeComponents);
            this.currentRecipeComponents.forEach(component => {
                if (!component.shape || !FIREWORK_CONFIG.supportedShapes.includes(component.shape)) {
                    component.shape = 'sphere';
                }
                if (typeof component.spread !== 'number') {
                    component.spread = 1.0;
                }
                if (!('secondaryColor' in component)) {
                    component.secondaryColor = '#00ff00';
                }
                if (!('enableTrail' in component)) {
                    component.enableTrail = false;
                }
                if (!('trailLength' in component)) {
                    component.trailLength = 4;
                }
                if (!('trailWidth' in component)) {
                    component.trailWidth = 1.5;
                }
            });
        } else {
            this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
        }
        if (savedTrailEffect) {
            this.currentTrailEffect = savedTrailEffect;
        }
        if (savedRecipeName) {
            document.getElementById('recipe-name').value = savedRecipeName;
        }
    }

    saveCurrentRecipe() {
        const recipeNameInput = document.getElementById('recipe-name');
        let recipeName = recipeNameInput.value.trim();


        if (!recipeName) {
            let randomName = GENERIC_RECIPE_NAMES[Math.floor(Math.random() * GENERIC_RECIPE_NAMES.length)];
            let existingIndex = this.recipes.findIndex(recipe => recipe.name.toLowerCase() === randomName.toLowerCase());
            // lord forgive me for this
            const maxRandoms = 10;
            let attempts = 0;
            while (existingIndex !== -1 && attempts < maxRandoms) {
                randomName = GENERIC_RECIPE_NAMES[Math.floor(Math.random() * GENERIC_RECIPE_NAMES.length)];
                existingIndex = this.recipes.findIndex(recipe => recipe.name.toLowerCase() === randomName.toLowerCase());
                attempts++;
            }
            if (existingIndex !== -1) {
                randomName += ` (${existingIndex + 1})`;
            }
            recipeName = randomName;
            recipeNameInput.value = recipeName;
        }

        if (this.currentRecipeComponents.length === 0) {
            this.showNotification("Add at least one component before saving!");
            return;
        }

        const existingIndex = this.recipes.findIndex(recipe => recipe.name.toLowerCase() === recipeName.toLowerCase());

        if (existingIndex !== -1) {
            this.recipes[existingIndex].components = this.currentRecipeComponents.map(component => ({ ...component }));
            this.recipes[existingIndex].trailEffect = this.currentTrailEffect;
            this.showNotification("Recipe overwritten successfully!");
        } else {
            const recipe = {
                name: recipeName,
                components: this.currentRecipeComponents.map(component => ({ ...component })),
                trailEffect: this.currentTrailEffect
            };
            this.recipes.push(recipe);
            this.showNotification("Recipe saved successfully!");
        }

        localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
        this.updateRecipeList();
    }

    randomizeRecipe() {
        for (let i = 0; i < this.currentRecipeComponents.length; i++) {
            const possiblePatterns = ['spherical', 'ring', 'heart', 'burst', 'palm', 'willow', 'helix', 'spinner', 'star', 'brokenHeart', 'christmasTree'];
            const possibleShapes = ['sphere', 'star'];
            const randomHex = `#${Math.floor(Math.random() * 0xFFFFFF)
                .toString(16)
                .padStart(6, '0')}`;
            const randomSecondaryHex = `#${Math.floor(Math.random() * 0xFFFFFF)
                .toString(16)
                .padStart(6, '0')}`;
            const maxSize = 0.7;
            const minSize = 0.3;
            const size = Math.random() * (maxSize - minSize) + minSize;
            const maxLifetime = 5.0;
            const minLifetime = 1.5;
            const lifetime = Math.random() * (maxLifetime - minLifetime) + minLifetime;
            const maxSpread = 2.0;
            const minSpread = 0.5;
            const spread = Math.random() * (maxSpread - minSpread) + minSpread;
            this.currentRecipeComponents[i] = {
                pattern: possiblePatterns[Math.floor(Math.random() * possiblePatterns.length)],
                color: randomHex,
                secondaryColor: randomSecondaryHex,
                size: size,
                lifetime: lifetime,
                shape: possibleShapes[Math.floor(Math.random() * possibleShapes.length)],
                spread: spread,
                enableTrail: Math.random() < 0.8,
                trailLength: Math.floor(Math.random() * 10) + 1,
                trailWidth: Math.random() * 2 + 0.5,
            };
        }
        this.updateComponentsList();
        this.updateUI();
        this.saveCurrentRecipeComponents();
        this.showNotification("Recipe randomized!");
    }

    loadRecipes() {
        const saved = localStorage.getItem('fireworkRecipes');
        if (saved) {
            this.recipes = JSON.parse(saved);
            this.recipes.forEach((recipe, index) => {
                if (!recipe.name || typeof recipe.name !== 'string' || recipe.name.trim() === '') {
                    recipe.name = `Recipe ${index + 1}`;
                }
                recipe.components.forEach(component => {
                    if (!component.shape || !FIREWORK_CONFIG.supportedShapes.includes(component.shape)) {
                        component.shape = 'sphere';
                    }
                    if (typeof component.spread !== 'number') {
                        component.spread = 1.0;
                    }
                    if (!('secondaryColor' in component)) {
                        component.secondaryColor = '#00ff00';
                    }
                    if (!('enableTrail' in component)) {
                        component.enableTrail = false;
                    }
                    if (!('trailLength' in component)) {
                        component.trailLength = 4;
                    }
                    if (!('trailWidth' in component)) {
                        component.trailWidth = 1.5;
                    }
                });
            });
            this.updateRecipeList();
        }
    }

    updateRecipeList() {
        this.ui.updateRecipeList(this.recipes, (index) => {
            this.selectRecipe(index);
        });
    }

    selectRecipe(index) {
        this.currentRecipeComponents = this.recipes[index].components.map(component => ({ ...component }));
        this.currentTrailEffect = this.recipes[index].trailEffect;
        this.updateComponentsList();
        this.updateUI();
        this.saveCurrentRecipeComponents();
        document.getElementById('recipe-name').value = this.recipes[index].name;
        this.showNotification(`Loaded Recipe "${this.recipes[index].name}"`);
    }

    updateLauncherList() {
        this.ui.updateLauncherList(
            this.gameState.autoLaunchers,
            this.selectedLauncherIndex,
            (index) => this.selectLauncher(index),
            (index) => this.upgradeLauncher(index)
        );
    }

    selectLauncher(selectedIndex) {
        const launcherCards = document.querySelectorAll('.launcher-card');
        launcherCards.forEach((card, index) => {
            if (index === selectedIndex) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        this.selectedLauncherIndex = selectedIndex;
        localStorage.setItem('selectedLauncherIndex', selectedIndex);
    }

    upgradeLauncher(index) {
        const launcher = this.gameState.autoLaunchers[index];
        if (!launcher) {
            this.showNotification("Launcher not found.");
            return;
        }

        if (this.getSparkles() >= launcher.upgradeCost) {
            this.subtractSparkles(launcher.upgradeCost);
            launcher.level += 1;
            launcher.spawnInterval = launcher.spawnInterval * AUTO_SPAWN_INTERVAL_RATIO;
            launcher.upgradeCost = Math.floor(launcher.upgradeCost * AUTO_UPGRADE_COST_RATIO);

            this.updateUI();
            this.updateLauncherList();
            this.showNotification(`Auto-Launcher ${index + 1} upgraded to level ${launcher.level}!`);
        } else {
            this.showNotification("Not enough sparkles to upgrade this launcher!");
        }
    }

    upgradeAllLaunchers() {
        const launchers = this.gameState.autoLaunchers;
        let upgraded = false;
        let totalSpent = 0;
        let foundAffordableUpgrade = true;

        while (foundAffordableUpgrade) {
            foundAffordableUpgrade = false;
            let cheapestCost = Infinity;
            let cheapestIndex = -1;

            for (let i = 0; i < launchers.length; i++) {
                const cost = launchers[i].upgradeCost;
                if (cost <= this.getSparkles() && cost < cheapestCost) {
                    cheapestCost = cost;
                    cheapestIndex = i;
                    foundAffordableUpgrade = true;
                }
            }

            if (foundAffordableUpgrade) {
                this.upgradeLauncher(cheapestIndex);
                totalSpent += cheapestCost;
                upgraded = true;
            }
        }

        if (!upgraded) {
            this.showNotification("Not enough sparkles to upgrade any launchers!");
        } else {
            this.showNotification(`Upgraded all launchers! (${totalSpent.toLocaleString()} sparkles spent)`);
        }
    }

    stripLauncherForSave(launcher) {
        return {
            x: launcher.x,
            accumulator: launcher.accumulator,
            assignedRecipeIndex: launcher.assignedRecipeIndex ?? -1,
            level: launcher.level ?? 1,
            spawnInterval: launcher.spawnInterval ?? 5,
            upgradeCost: launcher.upgradeCost ?? 15
        };
    }

    serializeGameData() {
        const data = {
            fireworkCount: this.fireworkCount,
            autoLauncherCost: this.autoLauncherCost,
            sparkles: this.getSparkles(),
            recipes: this.recipes,
            currentTrailEffect: this.currentTrailEffect,
            gameState: { autoLaunchers: this.gameState.autoLaunchers.map(launcher => this.stripLauncherForSave(launcher)) }, // Save only minimal launcher data
            currentRecipeComponents: this.currentRecipeComponents,
            backgroundColor: localStorage.getItem('backgroundColor') || '#000000',
            selectedLauncherIndex: this.selectedLauncherIndex,
            resources: this.resourceManager.save(),
            currentBackground: this.currentBackground,
            baseSparkleMultiplier: this.baseSparkleMultiplier,
            patternSparkleMultipliers: this.patternSparkleMultipliers,
            purchasedUpgrades: this.purchasedUpgrades
        };
        return JSON.stringify(data);
    }

    deserializeGameData(jsonString) {
        const data = JSON.parse(jsonString);

        this.resetGame();

        if (data.resources) {
            const resourceData = typeof data.resources === 'string' ? JSON.parse(data.resources) : data.resources;
            this.resourceManager.load(resourceData);
            localStorage.setItem('resources', JSON.stringify(resourceData));
        }

        this.fireworkCount = data.fireworkCount || 0;
        this.autoLauncherCost = data.autoLauncherCost || AUTO_LAUNCHER_COST_BASE;
        this.recipes = data.recipes || [];
        this.currentTrailEffect = data.currentTrailEffect || 'fade';
        this.currentRecipeComponents = data.currentRecipeComponents || [...DEFAULT_RECIPE_COMPONENTS];

        const bgColor = data.backgroundColor || '#000000';
        document.body.style.backgroundColor = bgColor;
        localStorage.setItem('backgroundColor', bgColor);
        this.currentBackground = data.currentBackground || BACKGROUND_IMAGES[0].path;

        this.selectedLauncherIndex = data.selectedLauncherIndex ?? null;

        if (data.gameState && data.gameState.autoLaunchers) {
            this.gameState.autoLaunchers = data.gameState.autoLaunchers.map(launcherData => {
                const launcher = { ...launcherData };
                this.createAutoLauncherMesh(launcher);
                return launcher;
            });
        }

        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();
        this.updateBackgroundMesh();

        this.updateCrowdDisplay();

        this.baseSparkleMultiplier = (typeof data.baseSparkleMultiplier === 'number' && !isNaN(data.baseSparkleMultiplier)) ? data.baseSparkleMultiplier : 1;
        if (data.patternSparkleMultipliers && typeof data.patternSparkleMultipliers === 'object') {
            this.patternSparkleMultipliers = { ...this.patternSparkleMultipliers, ...data.patternSparkleMultipliers };
        }

        if (data.purchasedUpgrades && typeof data.purchasedUpgrades === 'object') {
            this.purchasedUpgrades = data.purchasedUpgrades;
        }

        this.recomputeUpgrades();
    }



    calculateSparklesPerSecond(autoLaunchers) {
        if (!autoLaunchers) return 0;
        let totalSparklesPerSecond = 0;

        autoLaunchers.forEach(launcher => {
            let recipe = this.recipes[launcher.assignedRecipeIndex];
            let components;
            if (recipe) {
                components = recipe.components;
            } else {
                if (!this.recipes.length) {
                    components = this.currentRecipeComponents;
                } else {
                    components = this.recipes[0].components;
                }
            }

            const sparklePerFirework = components.reduce((sum, c) => sum + this.getComponentSparkles(c), 0);
            totalSparklesPerSecond += sparklePerFirework / launcher.spawnInterval;
        });

        return Math.round(totalSparklesPerSecond * 100) / 100;
    }

    calculateTotalSparklesPerSecond() {
        return this.calculateSparklesPerSecond(this.gameState.autoLaunchers);
    }

    updateCameraPosition(deltaTime) {
        if (this.cameraTargetX !== null) {
            const t = Math.min(this.cameraTransitionSpeed * deltaTime, 1.0);
            this.renderer2D.cameraX += (this.cameraTargetX - this.renderer2D.cameraX) * t;

            this.renderer2D.setCamera({
                x: this.renderer2D.cameraX,
                y: this.renderer2D.cameraY,
                zoom: this.renderer2D.cameraZoom
            });

            if (Math.abs(this.renderer2D.cameraX - this.cameraTargetX) < 0.1) {
                this.cameraTargetX = null;
            }
        }
    }

    setCameraTarget(targetX) {
        this.cameraTargetX = targetX;
    }

    isTabContentActive() {
        const activeTabContent = document.querySelector('.tab-content.active');
        if (activeTabContent) {
            return activeTabContent;
        }
        return null;
    }

    updateCrowdDisplay() {
        const crowdCountElement = document.getElementById('crowd-count');
        const currentSpsElement = document.getElementById('current-sps');
        const nextThresholdElement = document.getElementById('next-threshold');
        const progressBar = document.getElementById('threshold-progress');

        if (crowdCountElement) {
            crowdCountElement.textContent = this.crowd ? this.crowd.people.length : 0;
        }

        const currentSps = this.calculateTotalSparklesPerSecond();
        if (currentSpsElement) {
            currentSpsElement.textContent = currentSps.toFixed(2);
        }

        const nextThreshold = this.crowdThresholds.find(t => t > currentSps) || 'Max';
        if (nextThresholdElement) {
            nextThresholdElement.textContent = nextThreshold;
        }

        if (progressBar && nextThreshold !== 'Max') {
            const prevThreshold = this.crowdThresholds[this.crowdThresholds.indexOf(nextThreshold) - 1] || 0;
            const progress = ((currentSps - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        } else if (progressBar) {
            progressBar.style.width = '100%';
        }
    }

    clampToLauncherBounds(x) {
        return Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(x, GAME_BOUNDS.LAUNCHER_MAX_X));
    }

    clampToCrowdBounds(x) {
        return Math.max(GAME_BOUNDS.CROWD_LEFT_X, Math.min(x, GAME_BOUNDS.CROWD_RIGHT_X));
    }

    spreadLaunchers() {
        const launchers = this.gameState.autoLaunchers;
        if (launchers.length === 0) {
            this.showNotification("No launchers to spread!");
            return;
        }

        const totalWidth = GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X;
        const spacing = Math.min(totalWidth / (launchers.length + 1), 200);

        launchers.forEach((launcher, index) => {
            const newX = GAME_BOUNDS.LAUNCHER_MIN_X + spacing * (index + 1);
            launcher.x = newX;
            if (launcher.mesh) {
                launcher.mesh.position.x = newX;
            }
        });

        this.showNotification("Launchers spread evenly!");
    }

    randomizeLauncherRecipes() {
        const launchers = this.gameState.autoLaunchers;


        launchers.forEach(launcher => {
            launcher.assignedRecipeIndex = -1;
        });

        this.updateLauncherList();
        this.saveProgress();
        this.showNotification("All auto-launchers are now shooting random recipes!");
    }

    openAdvancedCreator() {
        const creatorScene = document.getElementById('creator-scene');
        if (!creatorScene) return;

        document.getElementById('game-container').style.display = 'none';
        const uiElements = document.querySelectorAll('.top-bar-container, .tab-content');
        uiElements.forEach(el => el.style.display = 'none');

        creatorScene.style.display = 'flex';

        const canvas = document.getElementById('creator-canvas');
        this.previewRenderer = new Renderer2D.Renderer2D(canvas, {});
        this.previewRenderer._resizeIfNeeded();
        this.previewParticleSystem = new InstancedParticleSystem(this.previewRenderer, this.profiler);

        this.updateComponentsList('creator-components-list');
        const trailSelect = document.getElementById('creator-trail-effect');
        if (trailSelect) trailSelect.value = this.currentTrailEffect;
        const nameInput = document.getElementById('creator-recipe-name');
        if (nameInput) nameInput.value = document.getElementById('recipe-name').value;

        this.currentState = 'creator';
        this.previewFirework = null;
    }

    closeAdvancedCreator() {
        const creatorScene = document.getElementById('creator-scene');
        if (!creatorScene) return;

        creatorScene.style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        const uiElements = document.querySelectorAll('.top-bar-container, .tab-content');
        uiElements.forEach(el => el.style.display = '');

        if (this.previewParticleSystem) {
            this.previewParticleSystem.dispose();
            this.previewParticleSystem = null;
        }
        this.previewRenderer = null;
        this.previewFirework = null;

        this.updateComponentsList('components-list');
        const trailSelect = document.getElementById('recipe-trail-effect');
        if (trailSelect) trailSelect.value = this.currentTrailEffect;

        this.currentState = 'game';
    }

    updateCreator(delta) {
        this.updateGame(delta);

        if (this.previewParticleSystem) {
            this.previewParticleSystem.update(delta);
        }

        let lifetime = 0;
        if (this.currentRecipeComponents) {
            for (const component of this.currentRecipeComponents) {
                if (component.lifetime) {
                    lifetime = Math.max(lifetime, component.lifetime);
                }
            }
        }
        lifetime -= 1;

        if (this.previewFireworkTimer) {
            this.previewFireworkTimer -= delta;
            if (this.previewFireworkTimer <= 0) {
                this.previewFireworkTimer = null;
            }
        }

        if (this.previewFirework) {
            this.previewFirework.update(delta);
            if (!this.previewFirework.alive) {
                this.previewFirework.dispose();
                this.previewFirework = null;
            }
        }

        if (!this.previewFirework && !this.previewFireworkTimer) {
            const viewHeight = this.previewRenderer.virtualHeight / this.previewRenderer.cameraZoom;
            const y = -viewHeight / 16 + GAME_BOUNDS.OFFSET_MIN_Y;
            this.previewFirework = new Firework(0, y, this.currentRecipeComponents, this.previewRenderer, viewHeight, this.currentTrailEffect, this.previewParticleSystem, y);
            this.previewFireworkTimer = lifetime;
        }
    }

    changeBackground(path) {
        if (this.currentBackground === path) return;
        this.currentBackground = path;
        localStorage.setItem('currentBackground', path);
        this.updateBackgroundMesh();
        this.ui.updateBackgroundPicker();
    }

    togglePostProcessing(enabled) {
        const usePP = !!enabled;

        if (this.renderer2D.usePostProcessing === usePP) {
            return;
        }

        this.renderer2D.usePostProcessing = usePP;

        if (usePP) {
            if (!this.renderer2D.postProcessingInitialized) {
                try {
                    this.renderer2D._initPostProcessing();
                    this.renderer2D._resizePostProcessingBuffers();
                } catch (err) {
                    console.warn('Failed to initialize post-processing:', err);
                    this.renderer2D.usePostProcessing = false;
                }
            }
        }

        localStorage.setItem('usePostProcessing', JSON.stringify(usePP));
    }


    recomputeUpgrades() {
        this.baseSparkleMultiplier = 1;
        this.patternSparkleMultipliers = { default: 1 };

        for (const up of this.upgrades) {
            const level = this.purchasedUpgrades[up.id] ?? 0;
            if (level > 0) {
                up.apply(this, level);
            }
        }
    }

    buyUpgrade(id) {
        const up = this.upgradeLookup[id];
        if (!up) return;

        const currentLevel = this.purchasedUpgrades[id] ?? 0;
        if (currentLevel >= (up.maxLevel ?? 1)) {
            this.showNotification('Upgrade already maxed');
            return;
        }

        const wallet = up.currency === 'gold' ? this.resourceManager.resources.gold : this.resourceManager.resources.sparkles;
        const nextCost = Math.floor(up.baseCost * Math.pow(up.costRatio, currentLevel));
        if (wallet.amount < nextCost) {
            this.showNotification(`Not enough ${up.currency}`);
            return;
        }

        wallet.subtract(nextCost);
        this.purchasedUpgrades[id] = currentLevel + 1;

        up.apply(this, this.purchasedUpgrades[id]);

        this.saveProgress();
        this.updateUI();
        this.ui.renderUpgrades();
        this.showNotification('Upgrade purchased!');
    }

    addGold(amount) {
        this.resourceManager.resources.gold.add(amount);
        this.updateUI();
    }

    unlockAllUpgrades() {
        let changed = false;
        for (const up of this.upgrades) {
            const maxLevel = up.maxLevel ?? 1;
            if ((this.purchasedUpgrades[up.id] ?? 0) < maxLevel) {
                this.purchasedUpgrades[up.id] = maxLevel;
                up.apply(this, maxLevel);
                changed = true;
            }
        }
        if (changed) {
            this.saveProgress();
            this.updateUI();
            if (this.ui && this.ui.renderUpgrades) this.ui.renderUpgrades();
        }
    }
}

export default FireworkGame;
