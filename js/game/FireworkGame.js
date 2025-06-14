import { FIREWORK_CONFIG, GAME_BOUNDS } from '../config/config.js';
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
        this.fireworkCount = 0;
        this.autoLauncherCost = 10;
        this.selectedLauncherIndex = null;
        this.crowdCount = 0;
        this.lastSparklesPerSecond = 0;
        this.crowdThresholds = [1, 2, 3, 4, 5, 10, 15];

        this.resourceManager = new ResourceManager(this);
        this.ui = new UIManager(this);
        this.profiler = new GameProfiler();

        this.cameraTransitionSpeed = 2.0;

        this.init();
    }

    init() {
        this.fireworkCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || 10;
        this.crowdCount = 0;

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
            this.gameState.autoLaunchers = savedGameState.autoLaunchers;
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

        // Initialize game components
        this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
        this.crowd = new Crowd();

        // Initialize launchers
        this.gameState.autoLaunchers.forEach(launcher => {
            if (!launcher.accumulator) {
                launcher.accumulator = Math.random() * 5;
            }
            if (launcher.level === undefined) {
                launcher.level = 1;
                launcher.spawnInterval = 5;
                launcher.upgradeCost = 15;
            }
            launcher.x = this.clampToLauncherBounds(launcher.x);
            this.createAutoLauncherMesh(launcher); // Create mesh for existing launchers
        });

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

        });
        this.renderer2D._resizeIfNeeded();

        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
        this.cameraTargetZoom = 1.0;

        this.clock = new Renderer2D.Clock();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.ui.initializeRendererEvents();
        this.bindEvents();
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

    update(deltaTime) {
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
                    recipeComponents = this.currentRecipeComponents;
                    trailEffect = this.currentTrailEffect;
                }

                const components = recipeComponents || this.currentRecipeComponents;

                if (components.length === 0) {
                    return;
                }

                const effect = trailEffect || this.currentTrailEffect;

                const firework = new Firework(x + (Math.random() - 0.5) * FIREWORK_CONFIG.autoLauncherMeshWidth, launchY, components, this.renderer2D, this.renderer2D.virtualHeight / this.renderer2D.cameraZoom, effect, this.particleSystem);
                this.gameState.fireworks.push(firework); this.fireworkCount++;
                this.resourceManager.resources.sparkles.add(1);
                this.updateUI();
                launcher.accumulator -= launcher.spawnInterval;
            }
        });
        this.profiler.endFunction('autoLaunchersUpdate');


        // Update crowd based on sparkles per second
        const currentSps = this.calculateTotalSparklesPerSecond();
        if (currentSps > this.lastSparklesPerSecond) {
            for (const threshold of this.crowdThresholds) {
                if (currentSps >= threshold && this.lastSparklesPerSecond < threshold) {
                    this.crowdCount++;
                    this.crowd.addPerson();
                    this.updateCrowdDisplay();
                }
            }
        }
        this.lastSparklesPerSecond = currentSps;
        this.updateCrowdDisplay();

        this.resourceManager.updateGoldFromCrowd(this.crowdCount);
        this.resourceManager.update();

        this.crowd.update(deltaTime);

        this.saveProgress();

        this.profiler.endFrame();
    }

    initBackgroundColor() {
        const savedColor = localStorage.getItem('backgroundColor') || '#000000';

        const initColorPicker = () => {
            const colorPicker = document.getElementById('background-color');
            if (colorPicker) {
                colorPicker.value = savedColor;
                document.body.style.backgroundColor = savedColor;

                colorPicker.addEventListener('input', (e) => {
                    const color = e.target.value;
                    document.body.style.backgroundColor = color;
                    localStorage.setItem('backgroundColor', color);
                });
            } else {
                setTimeout(initColorPicker, 100);
            }
        };

        initColorPicker();
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
        localStorage.setItem('backgroundColor', document.getElementById('background-color').value);
        localStorage.setItem('selectedLauncherIndex', this.selectedLauncherIndex || '');
        localStorage.setItem('crowdCount', this.crowdCount);

        localStorage.setItem('resources', JSON.stringify(this.resourceManager.save()));
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
            const currentFireworks = this.gameState.fireworks;
            for (let i = currentFireworks.length - 1; i >= 0; i--) {
                currentFireworks[i].update(delta);
                if (!currentFireworks[i].alive) {
                    currentFireworks[i].dispose();
                    currentFireworks.splice(i, 1);
                }
            }

            this.update(delta);
            this.crowd.update(delta);
        }

        this.profiler.startFunction('drawFrame');
        this.renderer2D.drawFrame();
        this.profiler.endFunction('drawFrame');
    }

    // dont use every frame because js is weird 
    launchFireworkAt(x, minY = null, recipeComponents = null, trailEffect = null) {
        const components = recipeComponents || this.currentRecipeComponents;

        if (components.length === 0) {
            this.showNotification("Add at least one component to launch a firework!");
            return;
        }

        const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / 2 / this.renderer2D.cameraZoom);
        const y = minY || viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;
        const effect = trailEffect || this.currentTrailEffect;

        this.launch(x + (Math.random() - 0.5) * FIREWORK_CONFIG.autoLauncherMeshWidth, y, components, effect);
        this.fireworkCount++;
        this.addSparkles(1);
        this.updateUI();
    }

    // dont use every frame because js is weird 
    launch(x, y, components, trailEffect) {
        const firework = new Firework(x, y, components, this.renderer2D, this.renderer2D.virtualHeight / this.renderer2D.cameraZoom, trailEffect, this.particleSystem);
        this.gameState.fireworks.push(firework);
    }

    buyAutoLauncher() {
        const numLaunchers = this.gameState.autoLaunchers.length;
        const cost = this.calculateAutoLauncherCost(numLaunchers);

        if (this.getSparkles() >= cost) {
            this.subtractSparkles(cost);
            const x = GAME_BOUNDS.LAUNCHER_MIN_X + (Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X));
            const accumulator = Math.random() * 5;
            const launcher = {
                x: x,
                accumulator: accumulator,
                assignedRecipeIndex: null,
                level: 1,
                spawnInterval: 5,
                upgradeCost: 15,
                mesh: null // Initialize mesh property
            };
            this.gameState.autoLaunchers.push(launcher);
            this.createAutoLauncherMesh(launcher); // Create mesh for the new launcher
            this.updateUI();
            this.updateLauncherList();
            this.showNotification("Auto-Launcher purchased!");
        } else {
            this.showNotification("Not enough sparkles to buy this upgrade!");
        }
    }

    calculateAutoLauncherCost(numLaunchers) {
        return Math.floor(10 * Math.pow(1.2, numLaunchers));
    }

    createAutoLauncherMesh(launcher) {

        const width = FIREWORK_CONFIG.autoLauncherMeshWidth;
        const height = FIREWORK_CONFIG.autoLauncherMeshHeight;
        const viewBottomWorldY = this.renderer2D.cameraY - (this.renderer2D.virtualHeight / (2 * this.renderer2D.cameraZoom));
        const yPos = viewBottomWorldY + GAME_BOUNDS.OFFSET_MIN_Y;

        // Define vertices for a rectangle centered at (0,0)
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
            zIndex: -5, // Behind fireworks and particles
            blendMode: Renderer2D.BlendMode.NORMAL,
            isStroke: false
        });
    }

    resetAutoLaunchers() {
        let refundAmount = 0;

        this.gameState.autoLaunchers.forEach(launcher => {
            if (launcher.mesh) {
                this.renderer2D.removeNormalShape(launcher.mesh);
                launcher.mesh = null;
            }
            let cost = 0;
            cost += this.calculateAutoLauncherCost(0); // Cost of the first launcher
            // Calculate cost of upgrades for this launcher
            let currentUpgradeCost = 15; // Initial upgrade cost for level 1 to 2
            for (let i = 1; i < launcher.level; i++) {
                cost += currentUpgradeCost;
                currentUpgradeCost = Math.floor(currentUpgradeCost * 1.2);
            }
            refundAmount += cost;
        });
        this.gameState.autoLaunchers = [];


        this.addSparkles(Math.floor(refundAmount));
        this.autoLauncherCost = 10; // Reset base cost
        this.updateUI();
        this.updateLauncherList();
        return refundAmount;
    }

    resetGame() {
        this.fireworkCount = 0;
        this.recipes = [];
        this.crowdCount = 0;
        this.currentTrailEffect = 'fade';
        this.currentRecipeComponents = [{
            pattern: 'spherical', color: '#ff0000', size: 0.5, lifetime: 1.2, shape: 'sphere', spread: 1.0, secondaryColor: '#00ff00'
        }];

        this.resourceManager.reset();

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
            this.crowd = new Crowd(); // Re-initialize crowd
        }



        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
        }

        this.lastSparklesPerSecond = 0;
        this.autoLauncherCost = 10;

        localStorage.clear();

        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();
        this.showNotification("Game has been reset.");

        document.body.style.backgroundColor = '#000000';
        document.getElementById('background-color').value = '#000000';

        this.updateCrowdDisplay();
    }

    eraseAllRecipes() {
        this.recipes = [];
        localStorage.removeItem('fireworkRecipes');
        this.updateRecipeList();
        this.showNotification("All recipes have been erased.");
    }

    updateComponentsList() {
        this.ui.updateComponentsList(this.currentRecipeComponents, () => {
            this.saveCurrentRecipeComponents();
        });
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
            this.currentRecipeComponents = [{
                pattern: 'spherical', color: '#ff0000', size: 0.5, lifetime: 1.2, shape: 'sphere', spread: 1.0, secondaryColor: '#00ff00'
            }];
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
            this.showNotification("Please specify a recipe name");
            return;
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
            launcher.spawnInterval = launcher.spawnInterval * 0.9;
            launcher.upgradeCost = Math.floor(launcher.upgradeCost * 1.2);

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

    serializeGameData() {
        const data = {
            fireworkCount: this.fireworkCount,
            autoLauncherCost: this.autoLauncherCost,
            sparkles: this.getSparkles(),
            recipes: this.recipes,
            currentTrailEffect: this.currentTrailEffect,
            gameState: { autoLaunchers: this.gameState.autoLaunchers }, // Save gameState
            currentRecipeComponents: this.currentRecipeComponents,
            backgroundColor: localStorage.getItem('backgroundColor') || '#000000',
            selectedLauncherIndex: this.selectedLauncherIndex,
            crowdCount: this.crowdCount,
            resources: this.resourceManager.save()
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
        this.autoLauncherCost = data.autoLauncherCost || 10;
        this.recipes = data.recipes || [];
        this.currentTrailEffect = data.currentTrailEffect || 'fade';
        this.currentRecipeComponents = data.currentRecipeComponents || [{
            pattern: 'spherical', color: '#ff0000', size: 0.5, lifetime: 1.2, shape: 'sphere', spread: 1.0, secondaryColor: '#00ff00'
        }];
        this.crowdCount = data.crowdCount || 0;

        const bgColor = data.backgroundColor || '#000000';
        document.body.style.backgroundColor = bgColor;
        localStorage.setItem('backgroundColor', bgColor);
        document.getElementById('background-color').value = bgColor;

        this.selectedLauncherIndex = data.selectedLauncherIndex ?? null;

        if (data.gameState && data.gameState.autoLaunchers) {
            this.gameState.autoLaunchers = data.gameState.autoLaunchers;
            // Recreate meshes for deserialized launchers
            this.gameState.autoLaunchers.forEach(launcher => {
                if (!launcher.accumulator) {
                    launcher.accumulator = Math.random() * 5;
                }
                if (launcher.level === undefined) {
                    launcher.level = 1;
                    launcher.spawnInterval = 5;
                    launcher.upgradeCost = 15;
                }
                launcher.x = this.clampToLauncherBounds(launcher.x);
                this.createAutoLauncherMesh(launcher); // Create mesh
            });
        }


        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        this.updateCrowdDisplay();
    }



    calculateSparklesPerSecond(autoLaunchers) {
        if (!autoLaunchers) return 0;
        let totalSparklesPerSecond = autoLaunchers.reduce((total, launcher) => {
            return total + (1 / launcher.spawnInterval);
        }, 0);

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
            crowdCountElement.textContent = this.crowdCount;
        }

        const currentSps = this.calculateTotalSparklesPerSecond();
        if (currentSpsElement) {
            currentSpsElement.textContent = currentSps;
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
        const spacing = Math.min(totalWidth / (launchers.length + 1), 400);

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
        if (launchers.length === 0) {
            this.showNotification("No auto-launchers to assign recipes to!");
            return;
        }
        if (this.recipes.length === 0) {
            this.showNotification("No recipes available to assign!");
            return;
        }

        launchers.forEach(launcher => {
            const randomIndex = Math.floor(Math.random() * this.recipes.length);
            launcher.assignedRecipeIndex = randomIndex;
        });

        this.updateLauncherList();
        this.saveProgress();
        this.showNotification("Recipes randomly assigned to all auto-launchers!");
    }
}

export default FireworkGame;
