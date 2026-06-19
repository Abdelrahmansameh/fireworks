import { FIREWORK_CONFIG, GAME_BOUNDS, PROCEDURAL_BACKGROUND_CONFIG, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, PREDEFINED_RECIPES, AUTO_LAUNCHER_COST_BASE, DRONE_CONFIG, CROWD_CONFIG } from '../config/config.js';
import GameCore from './GameCore.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import InstancedDroneSystem from '../entities/InstancedDroneSystem.js';
import Crowd from '../entities/Crowd.js';
import Firework from '../entities/Firework.js';
import { patternKeys, patternDefinitions, patternDisplayNames } from '../entities/patterns/index.js';
import CinematicManager, { CINEMATIC_CONFIG } from './CinematicManager.js';
import UIManager from '../ui/UIManager.js';
import BuildingManager from '../buildings/BuildingManager.js';
import GameProfiler from '../profiling/GameProfiler.js';
import * as Renderer2D from '../rendering/Renderer.js';
import * as TextureManager from '../rendering/TextureManager.js';
import AudioManager from '../audio/AudioManager.js';
import ProcduralBackground from '../entities/ProcduralBackground.js';
import CursorParticles from '../ui/CursorParticles.js';

/**
 * FireworkGame — the live, browser-rendered game.
 *
 * Extends {@link GameCore}, which owns all the headless-capable economy and
 * progression logic. FireworkGame layers on the presentation: the real
 * renderer, particle/drone systems, the physics-based Crowd, cinematics,
 * camera, audio, UI, and input. Only logic that touches the DOM, the renderer,
 * or the visual systems lives here — everything else is inherited from GameCore
 * so the headless simulator runs the exact same economy code.
 */
class FireworkGame extends GameCore {
    constructor() {
        super({ headless: false });

        // Real presentation services replace GameCore's inert defaults.
        this.ui = new UIManager(this);
        this.profiler = new GameProfiler();
        this.audioManager = new AudioManager();
        this.cinematicManager = new CinematicManager(this);

        this.hasSeenFirstCrowdCinematic = JSON.parse(localStorage.getItem('hasSeenFirstCrowdCinematic') || 'false');
        this.isInputDisabled = false;
        this.hideFloatingSparkles = false;
        this.advancedCreatorUnlocked = JSON.parse(localStorage.getItem('advancedCreatorUnlocked') || 'false');

        this.cameraTransitionSpeed = 2.0;

        this.init();
    }

    init() {
        const savedCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.fireworkSystem.init(savedCount);
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || AUTO_LAUNCHER_COST_BASE;

        const savedResources = localStorage.getItem('resources');
        if (savedResources) {
            try {
                const resourceData = JSON.parse(savedResources);
                this.resourceManager.load(resourceData);
            } catch (e) {
                console.error('Failed to load resources:', e);
            }
        }

        this.statsTracker.load();

        const savedGameState = JSON.parse(localStorage.getItem('gameState'));

        this.initRenderer2D();
        this.initBackgroundColor();

        const savedBuildingData = localStorage.getItem('buildingManagerData');
        if (savedBuildingData) {
            try {
                const buildingData = JSON.parse(savedBuildingData);
                this.buildingManager.deserialize(buildingData);
            } catch (e) {
                console.error('Failed to load building data:', e);
            }
        } else if (savedGameState && savedGameState.autoLaunchers) {
            console.log('Migrating old autoLaunchers to new building system...');
            savedGameState.autoLaunchers.forEach(launcherData => {
                if (!launcherData.accumulator) {
                    launcherData.accumulator = Math.random() * 5;
                }

                launcherData.x = this.clampToLauncherBounds(launcherData.x);
                launcherData.y = launcherData.y || GAME_BOUNDS.WORLD_LAUNCHER_Y;

                this.buildingManager.createBuilding(
                    'AUTO_LAUNCHER',
                    launcherData.x,
                    launcherData.y,
                    launcherData
                );
            });

            this.gameState.autoLaunchers = [];
        }

        this.gameState.autoLaunchers = [];

        this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
        this.droneSystem = new InstancedDroneSystem(this.renderer2D, this.particleSystem);
        this.droneSystem.maxDrones = this.droneStats.maxDrones;
        this.crowd = new Crowd(this.renderer2D);
        this.crowd.onCoinDrop = (amount, source) => this.addGold(amount, source);
        this.crowd.particleSystem = this.particleSystem;
        this.crowd.onCatchSparkles = (amount) => {
            const multiplied = amount * (this.crowdStats.sparklesPerParticleMultiplier ?? 1);
            this.addSparkles(multiplied, 'crowd_catch');
            this.statsTracker.recordCrowdCatchParticle();
        };
        this.crowd.onFirstPersonArrival = (person) => {
            if (this.cinematicManager.isPlaying) {
                this.cinematicManager.resumeEvent('firstCrowdArrival');
            }
        };

        const initialCrowd = this._calculateTargetCrowdCount(this.fireworkSystem.fireworkCount);
        this.crowd.setCount(initialCrowd);
        this.updateCrowdDisplay();

        this.loadRecipes();
        this.loadCurrentRecipe();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        const gameContainer = document.getElementById('game-container');
        gameContainer.style.touchAction = 'none';

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.pause();
            } else if (document.visibilityState === 'visible') {
                this.resume();
            }
        });

        this.ui.initializeUnlockStates();

        this.audioManager.init();

        this.start();

        this.ui.bindEvents();

        this.progression.applyAll(this);

        // Re-sync crowd count now that upgrades/multipliers have been applied.
        // The setCount at init runs before applyAll, so it may use stale SPS.
        if (this.crowd) {
            const correctedCrowd = this._calculateTargetCrowdCount(this.fireworkSystem.fireworkCount);
            this.crowd.setCount(correctedCrowd);
        }
    }

    initRenderer2D() {
        this.canvas2D = document.getElementById('game-canvas');
        this.renderer2D = new Renderer2D.Renderer2D(this.canvas2D, {});
        this.renderer2D._resizeIfNeeded();

        this.procduralBackground = new ProcduralBackground(this.renderer2D, PROCEDURAL_BACKGROUND_CONFIG);
        this.procduralBackground.generate();

        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
        this.cameraTargetZoom = 1.0;

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.ui.initializeRendererEvents();
        this.bindEvents();

        TextureManager.init(this.renderer2D);

        this.cursorParticles = new CursorParticles(this.renderer2D);
    }


    _applyAutoLauncherTexture() {
        const tex = this.renderer2D.getTexture('auto_launcher_texture');
        if (!tex) return;

        const launchers = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        for (const launcher of launchers) {
            launcher.destroy();
            launcher.createMesh();
        }
    }

    onWindowResize() {
        this.renderer2D._updateProjectionMatrix();
    }

    bindEvents() {
        this.ui.bindUIEvents();
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

    updateUI() {
        const totalSparklesPerSec = this.calculateTotalSparklesPerSecond();
        const launcherCount = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;

        const passiveSparklesPerSec = this.calculateSparklesPerSecond(
            this.buildingManager.buildings.filter(b => b.type !== 'AUTO_LAUNCHER')
        );
        this.resourceManager.resources.sparkles.updateFromLevel(passiveSparklesPerSec);

        this.ui.updateUI(
            Math.floor(this.getSparkles()),
            totalSparklesPerSec.toFixed(2),
            this.fireworkSystem.fireworkCount,
            launcherCount,
            this.calculateAutoLauncherCost(launcherCount)
        );

        this.updateCrowdDisplay();
    }

    updateGame(deltaTime) {
        this.profiler.startFrame();

        this.procduralBackground?.update(deltaTime);

        this.particleSystem.update(deltaTime);
        this.droneSystem?.update(deltaTime, (sparkles) => {
            const multiplied = sparkles * (this.droneStats.sparklesPerParticleMultiplier ?? 1);
            this.addSparkles(multiplied, 'drone');
            this.statsTracker.recordDroneParticle();
        });

        this.updateCameraPosition(deltaTime);

        this.profiler.startFunction('buildingsUpdate');
        this.buildingManager.update(deltaTime);
        this.profiler.endFunction('buildingsUpdate');


        const targetCrowdSize = this._calculateTargetCrowdCount(this.fireworkSystem.fireworkCount);

        if (targetCrowdSize > 0 && this.crowd.people.length === 0 && !this.hasSeenFirstCrowdCinematic && !this.cinematicManager.isPlaying) {
            this.hasSeenFirstCrowdCinematic = true;
            this.saveProgress();
            this.playFirstCrowdCinematic();
        } else if (!this.cinematicManager.isPlaying) {
            this.crowd.setCount(targetCrowdSize);
        }

        this.resourceManager.update();

        this.crowd.update(deltaTime);

        // Cinematic runs after crowd so camera reads the final person.x for this frame
        this.cinematicManager.update(deltaTime);

        // Update peak records in GameMetrics
        const rollingSPS = this.statsTracker.getRollingRate('sparkles');
        const rollingGPS = this.statsTracker.getRollingRate('gold');
        const rollingFPS = this.statsTracker.getFireworksPerSecond();
        this.statsTracker.updatePeaks(rollingSPS, rollingGPS, rollingFPS, this.crowd.people.length);

        this.checkUnlockConditions();

        this.updateUI();

        this.saveProgress();

        this.profiler.endFrame();
    }

    initBackgroundColor() {
        document.body.style.backgroundColor = PROCEDURAL_BACKGROUND_CONFIG.bodyBackgroundColor;
    }

    dismissNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
    }

    update(delta) {
        if (this.currentState === 'game') {
            this.fireworkSystem.update(delta);

            this.updateGame(delta);
        } else if (this.currentState === 'creator') {
            this.updateCreator(delta);
        }
        // Update skeleton outline for cursor particles (crowd grab or building drag)
        if (this.cursorParticles) {
            let outline = null;
            if (this.crowd?.isGrabbing) {
                outline = this.crowd.getGrabbedPersonOutlinePoints();
            } else if (this.ui?.isDragging && this.ui.draggingLauncher?.getSkeletonOutlinePoints) {
                outline = this.ui.draggingLauncher.getSkeletonOutlinePoints();
            }
            this.cursorParticles.setGrabOutline(outline);
        }

        this.cursorParticles?.update(delta);
    }

    render() {
        this.profiler.startFunction('drawFrame');
        if (this.currentState === 'game') {
            this.renderer2D.drawFrame();
        } else if (this.currentState === 'creator') {
            if (this.previewRenderer) this.previewRenderer.drawFrame();
        }
        this.profiler.endFunction('drawFrame');
        this.cursorParticles?.render();
    }

    getLauncherAt(x, y) {
        return this.buildingManager.getBuildingAt(x, y);
    }

    resetAutoLaunchers() {
        const refundAmount = this.buildingManager.resetBuildingsOfType('AUTO_LAUNCHER');
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;
        this.updateLauncherList();
        return refundAmount;
    }

    resetGame() {
        this.ui.hideActiveTab();
        this.fireworkSystem.init(0);
        this.recipes = [];
        this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
        this.baseSparkleMultiplier = 1;
        this.droneStats = {
            lifetimeMultiplier: 1,
            speedMultiplier: 1,
            collectionRadiusMultiplier: 1,
            maxDrones: DRONE_CONFIG.maxDrones,
            sparklesPerParticleMultiplier: 1,
        };
        this.crowdStats = {
            catchingEnabled: false,
            collectionRadiusMultiplier: 1,
            sparklesPerParticleMultiplier: 1,
            goldRateMultiplier: 1,
            countBonus: 0,
        };
        this.launcherStats = { spawnIntervalMultiplier: 1, sparkleYieldMultiplier: 1 };
        this.generatorStats = { productionRateMultiplier: 1 };
        this.droneHubStats = { spawnIntervalMultiplier: 1 };
        this.catapultStats = { maxCatapults: 1 };

        this.resourceManager.reset();

        this.progression.resetUpgradesState();
        this.progression.resetUnlockState();

        this.unlockedPatternKeys = [patternKeys[0]];
        this.hasSeenFirstCrowdCinematic = false;

        this.firstClickStates = {
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false
        };

        this.progression.applyAll(this);

        this.fireworkSystem.disposeAll();

        // Reset all buildings
        this.buildingManager.destroy();
        this.buildingManager = new BuildingManager(this);

        if (this.crowd) {
            this.crowd.dispose();
            this.crowd = new Crowd(this.renderer2D);
            this.crowd.onCoinDrop = (amount, source) => this.addGold(amount, source);
            this.crowd.particleSystem = this.particleSystem;
            this.crowd.onCatchSparkles = (amount) => {
                const multiplied = amount * (this.crowdStats.sparklesPerParticleMultiplier ?? 1);
                this.addSparkles(multiplied, 'crowd_catch');
                this.statsTracker.recordCrowdCatchParticle();
            };
            this.crowd.onFirstPersonArrival = (person) => {
                if (this.cinematicManager.isPlaying) {
                    this.cinematicManager.resumeEvent('firstCrowdArrival');
                }
            };
        }



        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = new InstancedParticleSystem(this.renderer2D, this.profiler);
            // Re-point crowd at the fresh particle system
            if (this.crowd) this.crowd.particleSystem = this.particleSystem;

            if (this.droneSystem) {
                this.droneSystem.dispose();
            }
            this.droneSystem = new InstancedDroneSystem(this.renderer2D, this.particleSystem);
            this.droneSystem.maxDrones = this.droneStats.maxDrones;
        }

        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;

        localStorage.clear();
        this.loadRecipes();
        this.statsTracker.reset();

        this.ui.initializeUnlockStates();

        this.updateComponentsList();
        this.showNotification("Game has been reset.");

        this.initBackgroundColor();

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
    }

    loadCurrentRecipe() {
        const savedRecipeComponents = localStorage.getItem('currentRecipeComponents');
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
            });
        } else {
            this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
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
            this.showNotification("Recipe overwritten successfully!");
        } else {
            const recipe = {
                name: recipeName,
                components: this.currentRecipeComponents.map(component => ({ ...component }))
            };
            this.recipes.push(recipe);
            this.showNotification("Recipe saved successfully!");
        }

        localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
        this.updateRecipeList();
    }

    loadRecipes() {
        const normalizeRecipes = (recipes) => {
            recipes.forEach((recipe, index) => {
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
                });
            });
        };

        // If user already has saved recipes, use them synchronously (no fetch needed)
        const savedRaw = localStorage.getItem('fireworkRecipes');
        if (savedRaw) {
            try {
                const savedRecipes = JSON.parse(savedRaw);
                if (Array.isArray(savedRecipes) && savedRecipes.length > 0) {
                    this.recipes = savedRecipes;
                    normalizeRecipes(this.recipes);
                    this.updateRecipeList();
                    this.assignSequentialRecipesToLaunchers();
                    this.updateLauncherList();
                    return;
                }
            } catch (e) {
                // fall through to fetch
            }
        }

        // First launch or post-reset: use embedded predefined recipes and persist them
        try {
            const predef = PREDEFINED_RECIPES;
            this.recipes = (Array.isArray(predef) ? predef : []).map(r => ({ ...r }));
            normalizeRecipes(this.recipes);
            localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
            this.updateRecipeList();
            this.assignSequentialRecipesToLaunchers();
            this.updateLauncherList();
        } catch (err) {
            console.error('Failed to load predefined recipes:', err);
        }
    }

    updateRecipeList() {
        this.ui.updateRecipeList(this.recipes, (index) => {
            this.selectRecipe(index);
        });
    }

    /**
     * Launch a firework using the next recipe in the cursor-cycle (includes the default recipe).
     * Returns the same result object as `fireworkSystem.launchFireworkAt`.
     */
    launchCursorCyclingFireworkAt(x, targetY = null) {
        const recipeCount = this.getCursorRecipeCount();
        const launcherCount = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;
        const count = Math.min(recipeCount, launcherCount + 1); // only cycle through as many recipes as the player has launchers (plus default)

        if (count <= 0) {
            return this.fireworkSystem.launchFireworkAt(x, targetY);
        }
        if (typeof this.cursorRecipeIndex !== 'number')
            this.cursorRecipeIndex = 0;
        const usedIndex = this.cursorRecipeIndex;
        const components = this.getCursorRecipeComponentsAt(usedIndex);

        // advance index for next click
        this.cursorRecipeIndex = (usedIndex + 1) % count;

        return this.fireworkSystem.launchFireworkAt(x, targetY, null, components);
    }

    selectRecipe(index) {
        this.currentRecipeComponents = this.recipes[index].components.map(component => ({ ...component }));
        this.updateComponentsList();
        this.saveCurrentRecipeComponents();
        document.getElementById('recipe-name').value = this.recipes[index].name;
        this.showNotification(`Loaded Recipe "${this.recipes[index].name}"`);
    }

    updateLauncherList() {
        const launchers = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        this.ui.updateLauncherList(
            launchers,
            this.buildingManager.selectedBuildingId,
            (buildingId) => this.selectLauncher(buildingId)
        );
    }

    selectLauncher(buildingId) {
        const building = this.buildingManager.getBuildingById(buildingId);
        this.buildingManager.selectBuilding(building);

        const launcherCards = document.querySelectorAll('.launcher-card');
        launcherCards.forEach((card) => {
            if (card.dataset.buildingId === buildingId) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    serializeGameData() {
        const data = {
            fireworkCount: this.fireworkSystem.fireworkCount,
            autoLauncherCost: this.autoLauncherCost,
            sparkles: this.getSparkles(),
            recipes: this.recipes,
            buildingManagerData: this.buildingManager.serialize(),
            currentRecipeComponents: this.currentRecipeComponents,
            backgroundColor: '#f13b3b',
            resources: this.resourceManager.save(),
            baseSparkleMultiplier: this.baseSparkleMultiplier,
            progression: {
                ...this.progression.getState(),
                firstClicks: this.firstClickStates,
            },
            unlockedPatternKeys: this.unlockedPatternKeys,
            hasSeenFirstCrowdCinematic: this.hasSeenFirstCrowdCinematic
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

        this.fireworkSystem.init(data.fireworkCount || 0);
        this.autoLauncherCost = data.autoLauncherCost || AUTO_LAUNCHER_COST_BASE;
        this.recipes = data.recipes || [];
        this.currentRecipeComponents = data.currentRecipeComponents || [...DEFAULT_RECIPE_COMPONENTS];

        this.initBackgroundColor();
        localStorage.setItem('backgroundColor', PROCEDURAL_BACKGROUND_CONFIG.bodyBackgroundColor);

        if (data.buildingManagerData) {
            this.buildingManager.deserialize(data.buildingManagerData);
        } else if (data.gameState && data.gameState.autoLaunchers) {
            console.log('Migrating old save format to building system...');
            data.gameState.autoLaunchers.forEach(launcherData => {
                this.buildingManager.createBuilding(
                    'AUTO_LAUNCHER',
                    launcherData.x,
                    launcherData.y || GAME_BOUNDS.WORLD_LAUNCHER_Y,
                    launcherData
                );
            });
        }

        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        this.updateCrowdDisplay();

        this.baseSparkleMultiplier = (typeof data.baseSparkleMultiplier === 'number' && !isNaN(data.baseSparkleMultiplier)) ? data.baseSparkleMultiplier : 1;

        if (data.progression && typeof data.progression === 'object') {
            this.progression.loadState(data.progression);
            if (data.progression.firstClicks) {
                this.firstClickStates = { ...this.firstClickStates, ...data.progression.firstClicks };
            }
        }

        this.hasSeenFirstCrowdCinematic = !!data.hasSeenFirstCrowdCinematic;

        this.ui.initializeUnlockStates();
        this.progression.applyAll(this);
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
        const viewHalfWidth = (this.renderer2D.canvas.width / this.renderer2D.cameraZoom) / 2;
        const minCameraX = GAME_BOUNDS.SCROLL_MIN_X;
        const maxCameraX = GAME_BOUNDS.SCROLL_MAX_X - viewHalfWidth;

        if (minCameraX > maxCameraX) {
            this.cameraTargetX = (GAME_BOUNDS.SCROLL_MIN_X + GAME_BOUNDS.SCROLL_MAX_X) / 2;
        } else {
            this.cameraTargetX = Math.max(minCameraX, Math.min(maxCameraX, targetX));
        }
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

        const currentCrowd = this.crowd ? this.crowd.people.length : 0;
        if (crowdCountElement) {
            crowdCountElement.textContent = currentCrowd;
        }

        // Crowd is driven by total fireworks launched (see CROWD_CONFIG.scaling).
        const currentFireworks = this.fireworkSystem.fireworkCount;
        if (currentSpsElement) {
            currentSpsElement.textContent = Math.floor(currentFireworks).toLocaleString();
        }

        const config = CROWD_CONFIG.scaling;
        const A = (typeof config.formulaA === 'number') ? config.formulaA : 1;
        const exp = (typeof config.formulaExp === 'number') ? config.formulaExp : 0.5;
        const B = (typeof config.formulaB === 'number') ? config.formulaB : 0;
        const offset = config.formulaOffset ?? 0;
        const bonus = this.crowdStats?.countBonus ?? 0;

        // Fireworks needed to reach a crowd of `n` (inverse of the scaling formula).
        const inverseThreshold = (n) => {
            if (A === 0 || exp === 0) return Infinity;
            return Math.pow(Math.max(0, (n - bonus - B) / A), 1 / exp) + offset;
        };

        const nextThresholdFireworks = inverseThreshold(currentCrowd + 1);
        if (nextThresholdElement) {
            nextThresholdElement.textContent = Math.ceil(nextThresholdFireworks).toLocaleString();
        }

        if (progressBar) {
            const currentThresholdFireworks = inverseThreshold(currentCrowd);
            const base = Math.max(0, currentThresholdFireworks);
            const denom = Math.max(1e-6, nextThresholdFireworks - base);
            const progress = ((currentFireworks - base) / denom) * 100;
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
    }

    spreadLaunchers() {
        this.buildingManager.spreadBuildings('AUTO_LAUNCHER');
    }

    randomizeLauncherRecipes() {
        const launchers = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER');

        launchers.forEach(launcher => {
            launcher.assignedRecipeIndex = null;
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
            const y = GAME_BOUNDS.WORLD_LAUNCHER_Y;
            this.previewFirework = new Firework(0, y, this.currentRecipeComponents, this.previewRenderer, this.previewParticleSystem, y, this.audioManager);
            this.previewFireworkTimer = lifetime;
        }
    }

    /**
     * Cheat: Unlock everything.
     * Grants resources, unlocks all progression nodes, maxes all upgrades,
     * unlocks all patterns, and triggers UI updates.
     */
    cheatUnlockEverything() {
        // 1. Resources
        this.addSparkles(1000000, 'cheat');
        this.addGold(1000000, 'cheat');

        // 2. Progression nodes (tabs, buildings)
        this.progression.forceUnlockAll();

        // 3. Upgrades (max level)
        for (const def of this.progression.getAllUpgradeDefs()) {
            this.progression.forceSetLevel(def.id, def.maxLevel ?? 1);
        }

        // 4. Pattern keys
        this.unlockedPatternKeys = [...patternKeys];

        // 5. Advanced creator
        this.advancedCreatorUnlocked = true;

        // 6. Apply all (multipliers, etc.)
        this.progression.applyAll(this);

        // 7. Save and update UI
        this.saveProgress();
        this.ui.updateBuildingTypeVisibility();
        this.ui.renderUpgrades();
        this.ui.updateBuildingCounts();
        this.ui.updateBuildingCosts();
        this.updateRecipeList();
        this.updateLauncherList();
        this.ui.initializeUnlockStates(); // Refresh UI tab visibility

        // Ensure all tabs are properly initialized
        for (const tabId of ['recipes', 'buildings', 'crowd', 'upgrades']) {
            this.ui.handleUnlock(`${tabId}_tab`);
        }

        this.showNotification('Everything has been unlocked!');
    }

    cheatPlayFirstCrowdCinematic() {
        if (this.cinematicManager.isPlaying) return;
        // Unspawn all crowd members so the cinematic starts from an empty scene.
        this.crowd.setCount(0);
        this.playFirstCrowdCinematic();
    }

    playFirstCrowdCinematic() {
        this.cinematicManager.play(async (game, cm) => {
            // Camera scrolls to the left edge
            await cm.panCameraTo(GAME_BOUNDS.SCROLL_MIN_X, 3000);

            // Zoom in on the empty spawn area before anyone appears
            const originalCameraY = game.renderer2D.cameraY;
            const zoomTargetY = GAME_BOUNDS.CROWD_Y + CINEMATIC_CONFIG.ZOOM_Y_OFFSET;
            await cm.zoomCamera(CINEMATIC_CONFIG.ZOOM_IN_LEVEL, CINEMATIC_CONFIG.ZOOM_IN_DURATION_MS, null, zoomTargetY);

            // Hold on the empty shot
            await cm.wait(CINEMATIC_CONFIG.ZOOM_IN_DELAY_MS);

            // Crowd member spawns
            game.crowd.setCount(1);
            const person = game.crowd.people[0];

            // Register arrival listener NOW before he can reach his spot
            const arrivalPromise = cm.waitForEvent('firstCrowdArrival');

            await cm.wait(CINEMATIC_CONFIG.FOLLOW_DELAY_MS);
            
            // Camera follows him as he walks to his spot
            cm.followEntity(person);

            // Wait until he stops walking at his spot
            await arrivalPromise;

            // Beat before he tosses the coin, then force the toss
            await cm.wait(CINEMATIC_CONFIG.COIN_TOSS_DELAY_MS);
            person.coinTossTimer = 5; // force immediate toss

            // Brief pause, then zoom back out to where we were
            await cm.wait(CINEMATIC_CONFIG.ZOOM_OUT_DELAY_MS);
            await cm.zoomCamera(1.0, CINEMATIC_CONFIG.ZOOM_OUT_DURATION_MS, null, originalCameraY);

            cm.stopFollowing();
            await cm.wait(500);
        });
    }
}

export default FireworkGame;
