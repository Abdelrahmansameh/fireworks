import { gameStorage } from '../platform/GameStorage.js';
import { fireworksForCrowd, getCrowdArrivalProgress } from '../systems/ProductionRates.js';
import { FIREWORK_CONFIG, GAME_BOUNDS, PROCEDURAL_BACKGROUND_CONFIG, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, AUTO_LAUNCHER_COST_BASE, DRONE_CONFIG, CROWD_CONFIG } from '../config/config.js';
import GameCore from './GameCore.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import InstancedDroneSystem from '../entities/InstancedDroneSystem.js';
import Crowd from '../entities/Crowd.js';
import Firework from '../entities/Firework.js';
import { patternKeys } from '../entities/patterns/index.js';
import CinematicManager, { CINEMATIC_CONFIG } from './CinematicManager.js';
import GrandFinaleManager from './GrandFinaleManager.js';
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
        this.grandFinaleManager = new GrandFinaleManager(this);

        this.hasSeenFirstCrowdCinematic = JSON.parse(gameStorage.getItem('hasSeenFirstCrowdCinematic') || 'false');
        this.isInputDisabled = false;
        this.hideFloatingSparkles = false;
        this.advancedCreatorUnlocked = JSON.parse(gameStorage.getItem('advancedCreatorUnlocked') || 'false');

        this.cameraTransitionSpeed = 2.0;

        this.init();
    }

    init() {
        const savedCount = parseInt(gameStorage.getItem('fireworkCount')) || 0;
        this.fireworkSystem.init(savedCount);
        this.autoLauncherCost = parseInt(gameStorage.getItem('autoLauncherCost')) || AUTO_LAUNCHER_COST_BASE;

        const savedResources = gameStorage.getItem('resources');
        if (savedResources) {
            try {
                const resourceData = JSON.parse(savedResources);
                this.resourceManager.load(resourceData);
            } catch (e) {
                console.error('Failed to load resources:', e);
            }
        }

        this.statsTracker.load();

        const savedGameState = JSON.parse(gameStorage.getItem('gameState'));

        this.initRenderer2D();
        this.initBackgroundColor();

        const savedBuildingData = gameStorage.getItem('buildingManagerData');
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
        this._isRestoring = false;
        this.saveProgress();
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

    updateGame(deltaTime, isFinalStep = true) {
        this.profiler.startFrame();

        this.procduralBackground?.update(deltaTime);

        this.particleSystem.update(deltaTime);
        this.droneSystem?.update(deltaTime, (sparkles, particleCount = 1) => {
            const multiplied = sparkles * (this.droneStats.sparklesPerParticleMultiplier ?? 1);
            this.addSparkles(multiplied, 'drone');
            this.statsTracker.recordDroneParticle(particleCount);
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

        // Grand Finale event (floods the sky once unlocked; auto-recurs on cooldown)
        this.grandFinaleManager.update(deltaTime);

        // Update peak records in GameMetrics
        const rollingSPS = this.statsTracker.getRollingRate('sparkles');
        const rollingGPS = this.statsTracker.getRollingRate('gold');
        const rollingFPS = this.statsTracker.getFireworksPerSecond();
        this.statsTracker.updatePeaks(rollingSPS, rollingGPS, rollingFPS, this.crowd.people.length);

        this.checkUnlockConditions();

        // Cosmetic UI refresh + persistence only on the final sub-step (during a
        // bot fast-forward these would otherwise run N× per rendered frame).
        if (isFinalStep) {
            this.updateUI();
            this.saveProgress();
        }

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

    /**
     * One step of the active state's simulation. `isFinalStep` is false for all
     * but the last sub-step of a bot fast-forward, letting updateGame() skip the
     * cosmetic UI refresh + localStorage save on intermediate steps.
     */
    _stepSimulation(delta, isFinalStep = true) {
        if (this.currentState === 'game') {
            this.fireworkSystem.update(delta);
            this.updateGame(delta, isFinalStep);
        }
    }

    update(delta) {
        // The play-bot (js/bot/GameBot.js) can fast-forward by running the
        // simulation multiple times per rendered frame. Sub-stepping (rather
        // than scaling delta) keeps particle/crowd physics stable at high speed.
        const botRunning = this.bot?.enabled;
        const frameDelta = Math.min(Math.max(delta, 0), 0.05);
        const steps = botRunning ? this.bot.speedMultiplier : Math.max(1, Math.ceil(frameDelta * 60));
        const stepDelta = botRunning ? 1 / 60 : frameDelta / steps;
        for (let i = 0; i < steps; i++) {
            const isFinalStep = i === steps - 1;
            this.elapsedGameTime += stepDelta;
            this._stepSimulation(stepDelta, isFinalStep);
            if (this.bot?.enabled) this.bot.tick(stepDelta);
            if (botRunning && !this.bot.enabled) break;
        }
        if (this.previewActive) this.updateCreator(frameDelta);

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
            this.procduralBackground?.ensureCoverage();
            this.renderer2D.drawFrame();
        }
        if (this.previewActive && this.previewRenderer) this.previewRenderer.drawFrame();
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
        this.grantedRecipePatterns = new Set();
        this.selectedRecipeIndex = null;
        this.currentRecipeComponents = DEFAULT_RECIPE_COMPONENTS.map(component => ({ ...component }));
        this.baseSparkleMultiplier = 1;
        this.elapsedGameTime = 0;
        this.clearCrowdArrival();
        this.gameCompleted = false;
        this.grandFinaleUnlocked = false;
        this.grandFinaleManager.reset();
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

        gameStorage.clear();
        this.loadRecipes();
        this.statsTracker.reset();

        this.ui.initializeUnlockStates();

        this.updateComponentsList();
        this.showNotification("Game reset.");

        this.initBackgroundColor();

        this.updateCrowdDisplay();
    }

    eraseAllRecipes() {
        this.recipes = [];
        this.selectedRecipeIndex = null;
        for (const launcher of this.buildingManager.getBuildingsByType('AUTO_LAUNCHER')) {
            launcher.assignedRecipeIndex = null;
        }
        this.persistRecipes();
        this.saveCurrentRecipeComponents();
        this.updateRecipeList();
        this.updateLauncherList();
        this.saveProgress();
        this.showNotification("Recipes erased.");
    }

    deleteRecipe(index) {
        if (!Number.isInteger(index) || !this.recipes[index]) return false;
        this.recipes.splice(index, 1);
        for (const launcher of this.buildingManager.getBuildingsByType('AUTO_LAUNCHER')) {
            if (launcher.assignedRecipeIndex === index) launcher.assignedRecipeIndex = null;
            else if (launcher.assignedRecipeIndex > index) launcher.assignedRecipeIndex--;
        }
        if (this.selectedRecipeIndex === index) this.selectedRecipeIndex = null;
        else if (this.selectedRecipeIndex > index) this.selectedRecipeIndex--;
        this.cursorRecipeIndex = 0;
        this.persistRecipes();
        this.saveCurrentRecipeComponents();
        this.updateRecipeList();
        this.updateLauncherList();
        this.saveProgress();
        this.showNotification('Recipe deleted.');
        return true;
    }

    updateComponentsList(containerId = 'components-list') {
        this.ui.updateComponentsList(this.currentRecipeComponents, () => {
            this.saveCurrentRecipeComponents();
        }, containerId);
    }

    saveCurrentRecipeComponents() {
        gameStorage.setItem('currentRecipeComponents', JSON.stringify(this.currentRecipeComponents));
        gameStorage.setItem('selectedRecipeIndex', JSON.stringify(this.selectedRecipeIndex));
    }

    loadCurrentRecipe() {
        const selected = JSON.parse(gameStorage.getItem('selectedRecipeIndex') ?? 'null');
        this.selectedRecipeIndex = Number.isInteger(selected) && this.recipes[selected] ? selected : null;
        const savedRecipeComponents = gameStorage.getItem('currentRecipeComponents');
        const savedRecipeName = gameStorage.getItem('currentRecipeName');
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
            this.currentRecipeComponents = DEFAULT_RECIPE_COMPONENTS.map(component => ({ ...component }));
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
            this.showNotification("Add a component first.");
            return;
        }

        const selected = Number.isInteger(this.selectedRecipeIndex) && this.recipes[this.selectedRecipeIndex]
            ? this.selectedRecipeIndex : null;
        const existingIndex = this.recipes.findIndex((recipe, index) => index !== selected && recipe.name.toLowerCase() === recipeName.toLowerCase());
        if (existingIndex !== -1) {
            this.showNotification('That name is already in your collection. Choose another name.');
            return false;
        }
        const recipe = { name: recipeName, components: this.currentRecipeComponents.map(component => ({ ...component })) };
        if (selected !== null) {
            this.recipes[selected] = recipe;
            this.showNotification("Recipe updated.");
        } else {
            this.recipes.push(recipe);
            this.selectedRecipeIndex = this.recipes.length - 1;
            this.showNotification("Recipe saved.");
        }

        this.persistRecipes();
        this.saveCurrentRecipeComponents();
        gameStorage.setItem('currentRecipeName', recipeName);
        this.updateRecipeList();
        this.updateLauncherList();
        this.saveProgress();
        return true;
    }

    loadRecipes() {
        this.restoreRecipes();
        this.updateRecipeList();
        this.updateLauncherList();
    }

    updateRecipeList() {
        this.ui.updateRecipeList(this.recipes, (index) => {
            this.selectRecipe(index);
        });
    }

    /**
     * Launch a firework using the next saved recipe, or the starter when the collection is empty.
     * Returns the same result object as `fireworkSystem.launchFireworkAt`.
     */
    launchCursorCyclingFireworkAt(x, targetY = null) {
        const count = this.getCursorRecipeCount();

        if (count <= 0) {
            return this.fireworkSystem.launchFireworkAt(x, targetY, null, DEFAULT_RECIPE_COMPONENTS.map(component => ({ ...component })));
        }
        if (typeof this.cursorRecipeIndex !== 'number')
            this.cursorRecipeIndex = 0;
        const usedIndex = this.cursorRecipeIndex % count;
        const components = this.getCursorRecipeComponentsAt(usedIndex);

        // advance index for next click
        this.cursorRecipeIndex = (usedIndex + 1) % count;

        return this.fireworkSystem.launchFireworkAt(x, targetY, null, components);
    }

    selectRecipe(index) {
        if (!Number.isInteger(index) || !this.recipes[index]) return;
        this.selectedRecipeIndex = index;
        this.currentRecipeComponents = this.recipes[index].components.map(component => ({ ...component }));
        this.updateComponentsList();
        this.saveCurrentRecipeComponents();
        document.getElementById('recipe-name').value = this.recipes[index].name;
        gameStorage.setItem('currentRecipeName', this.recipes[index].name);
        this.showNotification(`Loaded "${this.recipes[index].name}"`);
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
            card.setAttribute('aria-pressed', String(card.dataset.buildingId === buildingId));
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
            elapsedGameTime: this.elapsedGameTime,
            crowdStartFireworks: this.crowdStartFireworks,
            crowdStartedAt: this.crowdStartedAt,
            gameCompleted: this.gameCompleted,
            autoLauncherCost: this.autoLauncherCost,
            sparkles: this.getSparkles(),
            recipes: this.recipes,
            grantedRecipePatterns: [...this.grantedRecipePatterns],
            selectedRecipeIndex: this.selectedRecipeIndex,
            currentRecipeName: document.getElementById('recipe-name').value,
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
            gameStorage.setItem('resources', JSON.stringify(resourceData));
        }

        this.fireworkSystem.init(data.fireworkCount || 0);
        this.elapsedGameTime = Math.max(0, Number(data.elapsedGameTime) || 0);
        this.restoreCrowdArrival(data.crowdStartFireworks, data.crowdStartedAt);
        this.gameCompleted = !!data.gameCompleted;
        this.autoLauncherCost = data.autoLauncherCost || AUTO_LAUNCHER_COST_BASE;
        this.recipes = data.recipes || [];
        this.selectedRecipeIndex = Number.isInteger(data.selectedRecipeIndex) && this.recipes[data.selectedRecipeIndex]
            ? data.selectedRecipeIndex : null;
        document.getElementById('recipe-name').value = data.currentRecipeName ?? '';
        gameStorage.setItem('currentRecipeName', data.currentRecipeName ?? '');
        this.currentRecipeComponents = data.currentRecipeComponents || [...DEFAULT_RECIPE_COMPONENTS];

        this.initBackgroundColor();
        gameStorage.setItem('backgroundColor', PROCEDURAL_BACKGROUND_CONFIG.bodyBackgroundColor);

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
            this.progression.loadState(data.progression, data.unlockedPatternKeys);
            if (data.progression.firstClicks) {
                this.firstClickStates = { ...this.firstClickStates, ...data.progression.firstClicks };
            }
        }

        this.hasSeenFirstCrowdCinematic = !!data.hasSeenFirstCrowdCinematic;
        this.grantedRecipePatterns = new Set(Array.isArray(data.grantedRecipePatterns)
            ? data.grantedRecipePatterns : this.getOwnedPatternKeys());
        this.persistRecipes();
        this.saveCurrentRecipeComponents();

        this.ui.initializeUnlockStates();
        this.progression.applyAll(this);
        this.crowd.setCount(this._calculateTargetCrowdCount(this.fireworkSystem.fireworkCount));
        this.updateCrowdDisplay();
        this.saveProgress();
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
        const crowdCountLabel = document.getElementById('crowd-count-label');
        const currentSpsElement = document.getElementById('current-sps');
        const nextThresholdElement = document.getElementById('next-threshold');
        const progressBar = document.getElementById('threshold-progress');
        const fireworksLabel = document.getElementById('crowd-firework-progress');
        const arrivalCountdown = document.getElementById('crowd-arrival-countdown');

        const currentCrowd = this.crowd ? this.crowd.people.length : 0;
        if (crowdCountElement) {
            crowdCountElement.textContent = currentCrowd;
        }
        if (crowdCountLabel) crowdCountLabel.textContent = currentCrowd === 1 ? 'fan' : 'fans';

        // Inverse thresholds stay absolute; new venues also have an arrival clock.
        const currentFireworks = this.fireworkSystem.fireworkCount;
        if (currentSpsElement) {
            currentSpsElement.textContent = Math.floor(currentFireworks).toLocaleString();
        }

        const nextThresholdFireworks = fireworksForCrowd(currentCrowd + 1, this);
        const full = !Number.isFinite(nextThresholdFireworks);
        const arrival = getCrowdArrivalProgress(currentCrowd + 1, this);
        const waitingForArrival = !full && currentFireworks >= nextThresholdFireworks && arrival.secondsRemaining > 1e-7;
        if (nextThresholdElement) {
            nextThresholdElement.textContent = full ? '—' : Math.ceil(nextThresholdFireworks).toLocaleString();
        }
        if (fireworksLabel) fireworksLabel.hidden = full || waitingForArrival;
        if (arrivalCountdown) {
            arrivalCountdown.hidden = !waitingForArrival;
            const text = waitingForArrival ? `Next fan: ${Math.ceil(arrival.secondsRemaining)}s` : '';
            if (arrivalCountdown.textContent !== text) arrivalCountdown.textContent = text;
        }
        const fullLabel = document.getElementById('crowd-full');
        if (fullLabel) fullLabel.hidden = !full;

        if (progressBar) {
            progressBar.parentElement.hidden = full;
            if (full) {
                progressBar.style.width = '100%';
                return;
            }
            const currentThresholdFireworks = fireworksForCrowd(currentCrowd, this);
            const base = Math.max(0, currentThresholdFireworks);
            const denom = Math.max(1e-6, nextThresholdFireworks - base);
            const fireworkProgress = currentFireworks >= nextThresholdFireworks ? 1 : Math.min(1, Math.max(0, (currentFireworks - base) / denom));
            const progress = Math.min(fireworkProgress, arrival.progress) * 100;
            progressBar.style.width = `${progress}%`;
            progressBar.parentElement.setAttribute('aria-valuenow', Math.round(progress));
            progressBar.parentElement.setAttribute('aria-valuetext', waitingForArrival
                ? `Next fan in ${Math.ceil(arrival.secondsRemaining)} seconds`
                : `${Math.floor(currentFireworks)} of ${Math.ceil(nextThresholdFireworks)} fireworks`);
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
        this.showNotification('All launchers set to Random.');
    }

    openAdvancedCreator() {
        const creatorScene = document.getElementById('creator-scene');
        if (!creatorScene) return;
        if (!document.getElementById('recipes-content')?.classList.contains('active')) {
            this.ui.showTab('recipes');
        }
        creatorScene.hidden = false;
        const canvas = document.getElementById('creator-canvas');
        if (!canvas) return;
        // Reuse this context when navigating away and back to the workshop.
        if (!this.previewRenderer) {
            this.previewRenderer = new Renderer2D.Renderer2D(canvas);
            this.previewParticleSystem = new InstancedParticleSystem(this.previewRenderer, this.profiler);
            const sky = Renderer2D.buildTexturedSquare(10000, 10000);
            this.previewRenderer.createNormalShape({
                vertices: sky.vertices, indices: sky.indices,
                position: new Renderer2D.Vector2(),
                color: new Renderer2D.Color(13 / 255, 17 / 255, 51 / 255, 1),
                zIndex: -100,
            });
            // WebGL textures belong to their own context. The game's shared glow
            // texture must be replaced with one loaded by the preview renderer.
            this.previewParticleSystem.meshes.glow.texture = null;
            this.previewRenderer.loadTexture('assets/glow.png', 'workshop-glow').then((texture) => {
                this.previewGlowTexture = texture;
                this.previewParticleSystem.meshes.glow.texture = texture;
            });
        }
        this.previewActive = true;
        this.previewRenderer._resizeIfNeeded();
        this.previewRenderer.setCamera({ x: 0, y: 70, zoom: window.matchMedia('(max-width: 700px)').matches ? 4.4 : 2.7 });
        this.workshop?.restartPreview();
    }

    closeAdvancedCreator() {
        const creatorScene = document.getElementById('creator-scene');
        if (creatorScene) creatorScene.hidden = true;
        this.previewActive = false;
        this.workshop?.restartPreview();
    }

    updateCreator(delta) {
        if (!this.previewRenderer || !this.previewParticleSystem) return;
        this.previewParticleSystem.meshes.glow.texture = this.previewGlowTexture ?? null;
        this.previewParticleSystem.update(delta);
        this.previewFireworkTimer = Math.max(0, (this.previewFireworkTimer ?? 0) - delta);
        this.previewRenderer.setCamera({ x: 0, y: 70, zoom: window.matchMedia('(max-width: 700px)').matches ? 4.4 : 2.7 });
        if (!this.previewFireworkTimer && this.currentRecipeComponents.length) {
            this.previewParticleSystem.clear();
            const components = this.currentRecipeComponents.map((component) => ({ ...component }));
            // A preview bursts immediately, so every control change has visible
            // feedback. Particle physics and shape recipes are the real game's.
            const firework = new Firework(0, 100, components, this.previewRenderer, this.previewParticleSystem, 100, null, 0);
            firework.rocket.texture = this.previewGlowTexture ?? null;
            if (firework._glowInner) firework._glowInner.texture = this.previewGlowTexture ?? null;
            firework.explode();
            firework.dispose();
            this.previewFireworkTimer = Math.max(...components.map((component) => component.lifetime ?? 3)) * 0.55 + 0.2;
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
            if (def.patternKey) this.grantPatternRecipe(def.patternKey);
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

    /**
     * Live override: flip the unlock flag (base behaviour) and immediately kick
     * off the first Grand Finale so buying the upgrade pays off with a show.
     */
    _unlockGrandFinale() {
        super._unlockGrandFinale();
    }

    triggerGrandFinale() {
        return this.grandFinaleManager.trigger();
    }

    /** Cheat / dev: force-unlock and trigger a Grand Finale now. */
    cheatTriggerGrandFinale() {
        this.grandFinaleUnlocked = true;
        this.grandFinaleManager.cooldown = 0;
        if (!this.grandFinaleManager.trigger()) {
            this.showNotification('Grand Finale already running!');
        }
    }

    cheatPlayFirstCrowdCinematic() {
        if (this.cinematicManager.isPlaying) return;
        // Unspawn all crowd members so the cinematic starts from an empty scene.
        this.crowd.setCount(0);
        this.playFirstCrowdCinematic();
    }

    playFirstCrowdCinematic() {
        const showCrowdUpgrade = () => {
            if (this.crowdUnlocked && this.progression.getUpgradeLevel('crowd_fireworks') === 0) {
                this.ui.renderCrowdGoldUpgrade();
                this.ui.showTab('crowd');
                const panel = document.querySelector('#crowd-content .panel');
                if (panel) panel.scrollTop = 0;
            }
        };
        let crowdPanelShown = false;
        return this.cinematicManager.play(async (game, cm) => {
            const mobile = game.chrome?.mobile.matches ?? window.matchMedia('(max-width: 700px)').matches;
            const originalCameraX = game.renderer2D.cameraX;
            const originalCameraY = game.renderer2D.cameraY;
            if (mobile) {
                // Begin at the fan's entrance, outside normal scroll bounds.
                // The same fitted shot then follows him all the way to his spot.
                const entrance = { x: GAME_BOUNDS.SCROLL_MIN_X - 800, y: GAME_BOUNDS.CROWD_Y };
                await cm.frameCamera(() => cm.getMobileCrowdFrame(entrance), CINEMATIC_CONFIG.ZOOM_IN_DURATION_MS);
            } else {
                await cm.panCameraTo(GAME_BOUNDS.SCROLL_MIN_X, 3000);
                const zoomTargetY = GAME_BOUNDS.CROWD_Y + CINEMATIC_CONFIG.ZOOM_Y_OFFSET;
                await cm.zoomCamera(CINEMATIC_CONFIG.ZOOM_IN_LEVEL, CINEMATIC_CONFIG.ZOOM_IN_DURATION_MS, null, zoomTargetY);
            }

            // Hold on the empty shot
            await cm.wait(CINEMATIC_CONFIG.ZOOM_IN_DELAY_MS);

            // Crowd member spawns
            game.crowd.setCount(1);
            const person = game.crowd.people[0];
            // Prevent normal crowd income while he walks into the cinematic.
            // The only toss during this sequence is the scripted one below.
            person.cinematicCoinTossDisabled = true;

            // Register arrival listener NOW before he can reach his spot
            const arrivalPromise = cm.waitForEvent('firstCrowdArrival');

            try {
                if (mobile) {
                    await cm.frameCamera(() => cm.getMobileCrowdFrame(person), 0);
                } else {
                    await cm.wait(CINEMATIC_CONFIG.FOLLOW_DELAY_MS);
                    cm.followEntity(person);
                }

                // Wait until he stops walking at his spot
                await arrivalPromise;

                // Freeze his coin toss timer so he can't toss naturally during the cinematic
                person.coinTossTimer = -9999;

                // Take procedural control of his skeleton: settle into an idle pose
                // (eyes neutral for now) until the firework gives them something to follow.
                // Cross-fade from his current cheering pose into the idle clip.
                this.crowd.requestPoseBlend(person, CROWD_CONFIG.blending?.cinematicTakeover);
                person.cinematicIdle = true;

                if (mobile) {
                    // Widen before launch so both his reaction and the entire burst
                    // remain in view. Refit on every frame if the phone rotates.
                    await cm.frameCamera(() => cm.getMobileCrowdFrame(person, true), CINEMATIC_CONFIG.MOBILE.SHOT_TRANSITION_MS);
                }
                // Small beat after arrival, then launch a firework in front of and above the person
                await cm.wait(CINEMATIC_CONFIG.FIREWORK_SPAWN_DELAY_MS);
                const fwX = person.x + (mobile ? CINEMATIC_CONFIG.MOBILE.FIREWORK_OFFSET_X : CINEMATIC_CONFIG.FIREWORK_OFFSET_X);
                const fwTargetY = person.y + (mobile ? CINEMATIC_CONFIG.MOBILE.FIREWORK_HEIGHT : -CINEMATIC_CONFIG.FIREWORK_OFFSET_Y);
                game.fireworkSystem.launch(fwX, GAME_BOUNDS.WORLD_LAUNCHER_Y, game.currentRecipeComponents, fwTargetY, mobile ? 0 : null);
                const firework = game.fireworkSystem.fireworks[game.fireworkSystem.fireworks.length - 1];

                // Steer his pupils toward the rocket as it climbs; once it bursts,
                // keep his gaze locked on the explosion point.
                person.cinematicLookFn = () => {
                    if (firework.rocket && !firework.exploded) {
                        return { x: firework.rocket.position.x, y: firework.rocket.position.y };
                    }
                    return { x: fwX, y: fwTargetY };
                };

                // Wait for it to explode, then a beat before the coin toss
                await cm.waitForExplosion(firework);
                await cm.wait(CINEMATIC_CONFIG.POST_EXPLOSION_DELAY_MS);

                if (mobile) {
                    // Return to the fan for the coin toss, after the burst has read.
                    await cm.frameCamera(() => cm.getMobileCrowdFrame(person), CINEMATIC_CONFIG.MOBILE.SHOT_TRANSITION_MS);
                }

                // Hand the skeleton back to the normal state machine for the coin toss.
                // Cross-fade out of the idle clip back into his state animation.
                this.crowd.requestPoseBlend(person, CROWD_CONFIG.blending?.cinematicRelease);
                person.cinematicIdle = false;
                person.cinematicLookFn = null;
                person.cinematicCoinTossDisabled = false;
                person.coinTossTimer = 5; // force immediate toss

                // Brief pause, then zoom back out to where we were
                await cm.wait(CINEMATIC_CONFIG.ZOOM_OUT_DELAY_MS);
                cm.stopFollowing();
                if (mobile) {
                    // Prepare the destination UI while hidden. Return to its current
                    // camera target before handing control back to mobile chrome.
                    game.ui.collapseForCinematic(false);
                    showCrowdUpgrade();
                    crowdPanelShown = true;
                    await cm.frameCamera(() => ({ x: originalCameraX, ...game.chrome.getCameraFraming() }), CINEMATIC_CONFIG.ZOOM_OUT_DURATION_MS);
                } else {
                    cm.followEntity(person);
                    await cm.zoomCamera(1.0, CINEMATIC_CONFIG.ZOOM_OUT_DURATION_MS, null, originalCameraY);
                    cm.stopFollowing();
                    await cm.panCameraTo(originalCameraX, 2000);
                    await cm.wait(500);
                }
            } finally {
                // Always release the pose and income locks if a sequence fails.
                if (person.cinematicIdle) this.crowd.requestPoseBlend(person, CROWD_CONFIG.blending?.cinematicRelease);
                person.cinematicIdle = false;
                person.cinematicLookFn = null;
                person.cinematicCoinTossDisabled = false;
                if (person.coinTossTimer < 0) person.coinTossTimer = 0;
            }
        }).then(() => {
            if (!crowdPanelShown) showCrowdUpgrade();
        });
    }
}

export default FireworkGame;
