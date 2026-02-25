import { FIREWORK_CONFIG, GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS, GENERIC_RECIPE_NAMES, BACKGROUND_IMAGES, AUTO_LAUNCHER_COST_BASE, AUTO_LAUNCHER_COST_RATIO, AUTO_UPGRADE_COST_RATIO, AUTO_SPAWN_INTERVAL_RATIO, COMPONENT_PROPERTY_RANGES, BUILDING_TYPES, DRONE_CONFIG, PATTERN_UNLOCK_ORDER } from '../config/config.js';
import { UPGRADE_DEFINITIONS } from '../upgrades/upgrades.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import InstancedDroneSystem from '../entities/InstancedDroneSystem.js';
import Crowd from '../entities/Crowd.js';
import Firework from '../entities/Firework.js';
import UIManager from '../ui/UIManager.js';
import ResourceManager from '../resources/ResourceManager.js';
import GameProfiler from '../profiling/GameProfiler.js';
import * as Renderer2D from '../rendering/Renderer.js';
import Engine from '../engine/Engine.js';
import BuildingManager from '../buildings/BuildingManager.js';
import AudioManager from '../audio/AudioManager.js';
import GameMetrics from '../metrics/GameMetrics.js';

class FireworkGame extends Engine {
    constructor() {
        super();
        this.gameState = {
            fireworks: [],
            autoLaunchers: []
        };

        this.recipes = [];
        this.currentRecipeComponents = [];
        this.currentBackground = BACKGROUND_IMAGES[0].path;
        this.fireworkCount = 0;
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;
        this.selectedLauncherIndex = null;
        this.crowdThresholds = [1, 2, 3, 4, 5, 10, 15];

        this.unlockStates = {
            sparkleCounter: false,
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false,
            backgroundTab: false,
            resourceGenerator: false,
            efficiencyBooster: false,
            droneHub: false,
            recipesTab: false
        };

        // Patterns unlocked progressively via AutoLauncher purchases
        this.unlockedPatternKeys = [PATTERN_UNLOCK_ORDER[0]];

        this.firstClickStates = {
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false,
            backgroundTab: false
        };

        this.resourceManager = new ResourceManager(this);
        this.buildingManager = new BuildingManager(this);
        this.ui = new UIManager(this);
        this.profiler = new GameProfiler();
        this.audioManager = new AudioManager();
        this.statsTracker = new GameMetrics();

        this.currentState = 'game';
        this.advancedCreatorUnlocked = JSON.parse(localStorage.getItem('advancedCreatorUnlocked') || 'false');

        this.cameraTransitionSpeed = 2.0;

        this.usePostProcessing = JSON.parse(localStorage.getItem('usePostProcessing') || 'true');

        this.baseSparkleMultiplier = 1;
        this.patternSparkleMultipliers = { default: 1 };
        this.droneStats = {
            lifetimeMultiplier: 1,
            speedMultiplier: 1,
            collectionRadiusMultiplier: 1,
            maxDrones: DRONE_CONFIG.maxDrones,
            sparklesPerParticleMultiplier: 1,
        };

        this.upgrades = UPGRADE_DEFINITIONS;
        this.upgradeLookup = Object.fromEntries(UPGRADE_DEFINITIONS.map(u => [u.id, u]));
        this.purchasedUpgrades = {};

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

        try {
            const stored = JSON.parse(localStorage.getItem('purchasedUpgrades') || '{}');
            if (stored && typeof stored === 'object') this.purchasedUpgrades = stored;
        } catch { }

        this.loadUnlockStates();

        this.init();
    }

    init() {
        this.fireworkCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || AUTO_LAUNCHER_COST_BASE;
        this.currentBackground = localStorage.getItem('currentBackground') || BACKGROUND_IMAGES[0].path;

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
                if (launcherData.level === undefined) {
                    launcherData.level = 1;
                    launcherData.spawnInterval = 5;
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

        const initialSps = this.calculateTotalSparklesPerSecond();
        const initialCrowd = this._calculateTargetCrowdCount(initialSps);
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

        this.ui.initializeUnlockStates(this.unlockStates);

        this.generatePredefinedRecipes();

        this.audioManager.init();

        this.start();

        this.ui.bindEvents();

        this.recomputeUpgrades();
    }

    generatePredefinedRecipes() {
        if (this.recipes.length >= 20) return;

        const needed = 20 - this.recipes.length;
        for (let i = 0; i < needed; i++) {
            const recipeComponents = [];
            const numComponents = 1; //Math.floor(Math.random() * 3) + 1; // 1 to 3 components

            for (let j = 0; j < numComponents; j++) {
                const possiblePatterns = ['spherical', 'ring', 'heart', 'burst', 'palm', 'willow', 'helix', 'spinner', 'star', 'brokenHeart', 'christmasTree'];
                const possibleShapes = ['sphere', 'star'];
                const randomHex = `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
                const randomSecondaryHex = `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;

                const randomValue = (prop) => {
                    const range = COMPONENT_PROPERTY_RANGES[prop];
                    if (range) {
                        return Math.random() * (range.max - range.min) + range.min;
                    }
                    return 1.0;
                };

                recipeComponents.push({
                    pattern: possiblePatterns[Math.floor(Math.random() * possiblePatterns.length)],
                    color: randomHex,
                    secondaryColor: randomSecondaryHex,
                    size: randomValue('size'),
                    lifetime: randomValue('lifetime'),
                    shape: possibleShapes[Math.floor(Math.random() * possibleShapes.length)],
                    spread: randomValue('spread'),
                    glowStrength: randomValue('glowStrength'),
                    blurStrength: randomValue('blurStrength'),
                });
            }

            let recipeName = GENERIC_RECIPE_NAMES[Math.floor(Math.random() * GENERIC_RECIPE_NAMES.length)];
            let existingIndex = this.recipes.findIndex(recipe => recipe.name.toLowerCase() === recipeName.toLowerCase());
            let attempts = 0;
            while (existingIndex !== -1 && attempts < 10) {
                recipeName = GENERIC_RECIPE_NAMES[Math.floor(Math.random() * GENERIC_RECIPE_NAMES.length)];
                existingIndex = this.recipes.findIndex(recipe => recipe.name.toLowerCase() === recipeName.toLowerCase());
                attempts++;
            }
            if (existingIndex !== -1) {
                recipeName += ` (${this.recipes.length + 1})`;
            }

            this.recipes.push({
                name: recipeName,
                components: recipeComponents
            });
        }

        // Ensure the current recipe matches the first one if not explicitly set
        if (!this.unlockStates.recipesTab && this.recipes.length > 0) {
            this.currentRecipeComponents = this.recipes[0].components.map(component => ({ ...component }));
            this.saveCurrentRecipeComponents();
        }

        this.updateRecipeList();
        localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
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

        this._backgroundMeshes = [];
        this._skyMeshes = [];
        this.updateBackgroundMesh();

        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
        this.cameraTargetZoom = 1.0;

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.ui.initializeRendererEvents();
        this.bindEvents();
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

    async updateBackgroundMesh() {
        if (this._backgroundMeshes) {
            this._backgroundMeshes.forEach(mesh => this.renderer2D.removeNormalShape(mesh));
            this._backgroundMeshes = [];
        }

        if (this._skyMeshes) {
            this._skyMeshes.forEach(mesh => this.renderer2D.removeNormalShape(mesh));
            this._skyMeshes = [];
        }

        const currentBgConfig = BACKGROUND_IMAGES.find(bg => bg.path === this.currentBackground);

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

        if (currentBgConfig && currentBgConfig.skyPath) {
            const skyTextureKey = `sky_${currentBgConfig.skyPath}`;
            await this.renderer2D.loadTexture(currentBgConfig.skyPath, skyTextureKey);
            const skyTex = this.renderer2D.getTexture(skyTextureKey);

            if (skyTex) {
                const skyMeshes = [];
                const skyLayers = 4;

                for (let x = -repeatCount / 2; x <= repeatCount / 2; x++) {
                    for (let y = 1; y <= skyLayers; y++) {
                        const skyMesh = this.renderer2D.createNormalShape({
                            ...Renderer2D.buildTexturedSquare(width, height),
                            texCoords: new Float32Array([
                                0, 1,
                                1, 1,
                                1, 0,
                                0, 0
                            ]),
                            texture: skyTex,
                            position: new Renderer2D.Vector2(x * width, y * height),
                            rotation: 0,
                            scale: new Renderer2D.Vector2(1, 1),
                            zIndex: -999,
                            blendMode: Renderer2D.BlendMode.NORMAL,
                            isStroke: false
                        });
                        skyMeshes.push(skyMesh);
                    }
                }
                this._skyMeshes = skyMeshes;
            }
        } else {
            this._skyMeshes = [];
        }
    }

    onWindowResize() {
        this.renderer2D._updateProjectionMatrix();
        const yPos = GAME_BOUNDS.WORLD_LAUNCHER_Y;

        for (const building of this.buildingManager.buildings) {
            building.setPosition(building.x, yPos);
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

    addSparkles(amount, source = 'unknown') {
        this.resourceManager.resources.sparkles.add(amount);
        this.statsTracker.record('sparkles', amount, source);
    }


    spawnDrone(x, y) {
        const spawnX = x ?? (GAME_BOUNDS.LAUNCHER_MIN_X
            + Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X));
        const spawnY = y ?? (GAME_BOUNDS.WORLD_LAUNCHER_Y
            + Math.random() * (GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - GAME_BOUNDS.WORLD_LAUNCHER_Y));
        this.droneSystem.spawnDrone(spawnX, spawnY);
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
        const totalSparklesPerSec = this.calculateTotalSparklesPerSecond();
        const launcherCount = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;

        this.resourceManager.resources.sparkles.updateFromLevel(totalSparklesPerSec);

        this.ui.updateUI(
            Math.floor(this.getSparkles()),
            totalSparklesPerSec.toFixed(2),
            this.fireworkCount,
            launcherCount,
            this.calculateAutoLauncherCost(launcherCount)
        );
    }

    updateGame(deltaTime) {
        this.profiler.startFrame();

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


        const currentSps = this.calculateTotalSparklesPerSecond();
        const targetCrowdSize = this._calculateTargetCrowdCount(currentSps);
        this.crowd.setCount(targetCrowdSize);

        this.resourceManager.updateGoldFromCrowd(this.crowd.people.length);
        this.resourceManager.update();

        this.crowd.update(deltaTime);

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

        localStorage.setItem('buildingManagerData', JSON.stringify(this.buildingManager.serialize()));

        const gameStateData = {
            autoLaunchers: []
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
        this.saveUnlockStates();
        this.statsTracker.save();
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
            const currentFireworks = this.gameState.fireworks;
            for (let i = currentFireworks.length - 1; i >= 0; i--) {
                currentFireworks[i].update(delta);
                if (!currentFireworks[i].alive) {
                    currentFireworks[i].dispose();
                    currentFireworks.splice(i, 1);
                }
            }

            this.updateGame(delta);
        } else if (this.currentState === 'creator') {
            this.updateCreator(delta);
        }
    }

    render() {
        this.profiler.startFunction('drawFrame');
        if (this.currentState === 'game') {
            this.renderer2D.drawFrame();
        } else if (this.currentState === 'creator') {
            if (this.previewRenderer) this.previewRenderer.drawFrame();
        }
        this.profiler.endFunction('drawFrame');
    }

    getLauncherAt(x, y) {
        return this.buildingManager.getBuildingAt(x, y);
    }

    // dont use every frame because js is weird 
    launchFireworkAt(x, targetY = null, minY = null, recipeComponents = null) {
        let components = recipeComponents || this.currentRecipeComponents;

        if (!this.unlockStates.recipesTab) {
            const launchers = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
            // Cycle: slot 0 = DEFAULT_RECIPE_COMPONENTS, slots 1..N = each launcher's patternOverride variant
            const cycleCount = launchers.length + 1;
            const cycleIndex = this.fireworkCount % cycleCount;
            if (cycleIndex === 0) {
                components = DEFAULT_RECIPE_COMPONENTS;
            } else {
                const launcher = launchers[cycleIndex - 1];
                if (launcher && launcher.patternOverride) {
                    components = DEFAULT_RECIPE_COMPONENTS.map(c => ({ ...c, pattern: launcher.patternOverride, color: launcher.colorOverride || c.color }));
                } else {
                    components = DEFAULT_RECIPE_COMPONENTS;
                }
            }
        }

        if (components.length === 0) {
            this.showNotification("Add at least one component to launch a firework!");
            return;
        }

        const y = minY || GAME_BOUNDS.WORLD_LAUNCHER_Y;
        const spawnX = x + (Math.random() - 0.5) * FIREWORK_CONFIG.autoLauncherMeshWidth;
        const spawnY = y + FIREWORK_CONFIG.autoLauncherMeshHeight / 2;

        this.launch(spawnX, spawnY, components, Math.max(targetY, minY));
        this.fireworkCount++;
        const sparkleAmount = components.reduce((sum, c) => sum + this.getComponentSparkles(c), 0);
        this.addSparkles(sparkleAmount, 'manual');
        this.statsTracker.recordFirework('manual');
        this.checkUnlockConditions();
        return { sparkleAmount, spawnX, spawnY };
    }

    // dont use every frame because js is weird 
    launch(x, y, components, targetY = null) {
        const firework = new Firework(x, y, components, this.renderer2D, this.particleSystem, targetY, this.audioManager);
        this.gameState.fireworks.push(firework);
    }

    buyAutoLauncher() {
        const building = this.buildingManager.buyBuilding('AUTO_LAUNCHER');
        if (building) {
            if (!this.unlockStates.recipesTab) {
                // Unlock the next pattern in sequence (if any remain)
                const nextIndex = this.unlockedPatternKeys.length;
                let assignedPattern;
                if (nextIndex < PATTERN_UNLOCK_ORDER.length) {
                    assignedPattern = PATTERN_UNLOCK_ORDER[nextIndex];
                    this.unlockedPatternKeys.push(assignedPattern);
                } else {
                    // All patterns already unlocked – assign a random one
                    assignedPattern = PATTERN_UNLOCK_ORDER[Math.floor(Math.random() * PATTERN_UNLOCK_ORDER.length)];
                }
                building.patternOverride = assignedPattern;
                this.saveProgress();
            }
            this.updateLauncherList();
        }
    }

    buyBuilding(buildingType) {
        const building = this.buildingManager.buyBuilding(buildingType);
        if (building) {
            this.ui.updateBuildingCounts();
            this.ui.updateBuildingCosts();
            this.ui.updateBuildingListByType(buildingType);
        }
    }

    upgradeAllBuildingsByType(buildingType) {
        this.buildingManager.upgradeAllOfType(buildingType);
        this.ui.updateBuildingCounts();
        this.ui.updateBuildingCosts();
        this.ui.updateBuildingListByType(buildingType);
    }

    calculateAutoLauncherCost(numLaunchers) {
        return Math.floor(AUTO_LAUNCHER_COST_BASE * Math.pow(AUTO_LAUNCHER_COST_RATIO, numLaunchers));
    }

    resetAutoLaunchers() {
        const refundAmount = this.buildingManager.resetBuildingsOfType('AUTO_LAUNCHER');
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;
        this.updateLauncherList();
        return refundAmount;
    }

    resetGame() {
        this.ui.hideActiveTab();
        this.fireworkCount = 0;
        this.recipes = [];
        this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
        this.baseSparkleMultiplier = 1;
        this.patternSparkleMultipliers = { default: 1 };
        this.droneStats = {
            lifetimeMultiplier: 1,
            speedMultiplier: 1,
            collectionRadiusMultiplier: 1,
            maxDrones: DRONE_CONFIG.maxDrones,
            sparklesPerParticleMultiplier: 1,
        };

        this.resourceManager.reset();

        this.purchasedUpgrades = {};

        this.unlockStates = {
            sparkleCounter: false,
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false,
            backgroundTab: false,
            resourceGenerator: false,
            efficiencyBooster: false,
            droneHub: false,
            recipesTab: false
        };

        this.unlockedPatternKeys = [PATTERN_UNLOCK_ORDER[0]];

        this.firstClickStates = {
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false,
            backgroundTab: false
        };

        this.recomputeUpgrades();

        if (this.gameState.fireworks) {
            this.gameState.fireworks.forEach(firework => {
                firework.dispose();
            });
        }
        this.gameState.fireworks = [];

        // Reset all buildings
        this.buildingManager.destroy();
        this.buildingManager = new BuildingManager(this);

        if (this._backgroundMeshes) {
            this._backgroundMeshes.forEach(mesh => this.renderer2D.removeNormalShape(mesh));
            this._backgroundMeshes = [];
        }
        if (this._skyMeshes) {
            this._skyMeshes.forEach(mesh => this.renderer2D.removeNormalShape(mesh));
            this._skyMeshes = [];
        }


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
        this.statsTracker.reset();

        this.ui.initializeUnlockStates(this.unlockStates);

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

            const randomValue = (prop) => {
                const range = COMPONENT_PROPERTY_RANGES[prop];
                if (range) {
                    return Math.random() * (range.max - range.min) + range.min;
                }
                return 1.0;
            };

            const randomIntValue = (prop) => {
                const range = COMPONENT_PROPERTY_RANGES[prop];
                if (range) {
                    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                }
                return 1;
            }

            this.currentRecipeComponents[i] = {
                pattern: possiblePatterns[Math.floor(Math.random() * possiblePatterns.length)],
                color: randomHex,
                secondaryColor: randomSecondaryHex,
                size: randomValue('size'),
                lifetime: randomValue('lifetime'),
                shape: possibleShapes[Math.floor(Math.random() * possibleShapes.length)],
                spread: randomValue('spread'),
                glowStrength: randomValue('glowStrength'),
                blurStrength: randomValue('blurStrength'),
            };
        }
        this.updateComponentsList();
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
            (buildingId) => this.selectLauncher(buildingId),
            (buildingId) => this.upgradeLauncher(buildingId)
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

    upgradeLauncher(buildingId) {
        const building = this.buildingManager.getBuildingById(buildingId);
        if (!building) {
            this.showNotification("Building not found.");
            return;
        }

        const success = this.buildingManager.upgradeBuilding(building);
        if (success) {
            this.updateLauncherList();
        }
    }

    upgradeAllLaunchers() {
        this.buildingManager.upgradeAllOfType('AUTO_LAUNCHER');
        this.updateLauncherList();
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
            buildingManagerData: this.buildingManager.serialize(),
            currentRecipeComponents: this.currentRecipeComponents,
            backgroundColor: localStorage.getItem('backgroundColor') || '#000000',
            resources: this.resourceManager.save(),
            currentBackground: this.currentBackground,
            baseSparkleMultiplier: this.baseSparkleMultiplier,
            patternSparkleMultipliers: this.patternSparkleMultipliers,
            purchasedUpgrades: this.purchasedUpgrades,
            unlockStates: this.unlockStates,
            firstClickStates: this.firstClickStates,
            unlockedPatternKeys: this.unlockedPatternKeys
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
        this.currentRecipeComponents = data.currentRecipeComponents || [...DEFAULT_RECIPE_COMPONENTS];

        const bgColor = data.backgroundColor || '#000000';
        document.body.style.backgroundColor = bgColor;
        localStorage.setItem('backgroundColor', bgColor);
        this.currentBackground = data.currentBackground || BACKGROUND_IMAGES[0].path;

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
        this.updateBackgroundMesh();

        this.updateCrowdDisplay();

        this.baseSparkleMultiplier = (typeof data.baseSparkleMultiplier === 'number' && !isNaN(data.baseSparkleMultiplier)) ? data.baseSparkleMultiplier : 1;
        if (data.patternSparkleMultipliers && typeof data.patternSparkleMultipliers === 'object') {
            this.patternSparkleMultipliers = { ...this.patternSparkleMultipliers, ...data.patternSparkleMultipliers };
        }

        if (data.purchasedUpgrades && typeof data.purchasedUpgrades === 'object') {
            this.purchasedUpgrades = data.purchasedUpgrades;
        }

        if (data.unlockStates && typeof data.unlockStates === 'object') {
            this.unlockStates = { ...this.unlockStates, ...data.unlockStates };
            this.saveUnlockStates();
            this.ui.initializeUnlockStates(this.unlockStates);
        }

        if (data.firstClickStates && typeof data.firstClickStates === 'object') {
            this.firstClickStates = { ...this.firstClickStates, ...data.firstClickStates };
        }

        this.recomputeUpgrades();
    }



    calculateSparklesPerSecond(buildings) {
        if (!buildings) return 0;
        let totalSparklesPerSecond = 0;

        buildings.forEach(building => {
            if (building.type === 'AUTO_LAUNCHER' && building.getSparklesPerSecond) {
                totalSparklesPerSecond += building.getSparklesPerSecond();
            } else if (building.type === 'RESOURCE_GENERATOR' && building.resourceType === 'sparkles') {
                totalSparklesPerSecond += building.getProductionRate();
            }
        });

        return Math.round(totalSparklesPerSecond * 100) / 100;
    }

    calculateTotalSparklesPerSecond() {
        return this.calculateSparklesPerSecond(this.buildingManager.buildings);
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
        this.droneStats = {
            lifetimeMultiplier: 1,
            speedMultiplier: 1,
            collectionRadiusMultiplier: 1,
            maxDrones: DRONE_CONFIG.maxDrones,
            sparklesPerParticleMultiplier: 1,
        };

        for (const up of this.upgrades) {
            const level = this.purchasedUpgrades[up.id] ?? 0;
            if (level > 0) {
                up.apply(this, level);
            }
        }

        if (this.droneSystem) {
            this.droneSystem.maxDrones = this.droneStats.maxDrones;
        }
    }

    resetUpgrades() {
        const refunds = { sparkles: 0, gold: 0 };

        for (const up of this.upgrades) {
            const level = this.purchasedUpgrades[up.id] ?? 0;
            if (level > 0) {
                for (let l = 0; l < level; l++) {
                    const cost = Math.floor(up.baseCost * Math.pow(up.costRatio, l));
                    if (up.currency === 'gold') {
                        refunds.gold += cost;
                    } else {
                        refunds.sparkles += cost;
                    }
                }
            }
        }

        this.purchasedUpgrades = {};
        this.recomputeUpgrades();

        if (refunds.sparkles > 0) this.resourceManager.resources.sparkles.add(refunds.sparkles);
        if (refunds.gold > 0) this.resourceManager.resources.gold.add(refunds.gold);

        this.saveProgress();
        if (this.ui && this.ui.renderUpgrades) this.ui.renderUpgrades();

        return refunds;
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
        this.ui.renderUpgrades();
        this.showNotification('Upgrade purchased!');
    }

    addGold(amount, source = 'unknown') {
        this.resourceManager.resources.gold.add(amount);
        this.statsTracker.record('gold', amount, source);
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
            if (this.ui && this.ui.renderUpgrades) this.ui.renderUpgrades();
        }
    }

    loadUnlockStates() {
        const states = JSON.parse(localStorage.getItem('unlockStates') || '{}');
        this.unlockStates = { ...this.unlockStates, ...states };

        const clickStates = JSON.parse(localStorage.getItem('firstClickStates') || '{}');
        this.firstClickStates = { ...this.firstClickStates, ...clickStates };

        const savedPatterns = JSON.parse(localStorage.getItem('unlockedPatternKeys') || 'null');
        if (Array.isArray(savedPatterns) && savedPatterns.length > 0) {
            this.unlockedPatternKeys = savedPatterns;
        }
    }

    saveUnlockStates() {
        localStorage.setItem('unlockStates', JSON.stringify(this.unlockStates));
        localStorage.setItem('firstClickStates', JSON.stringify(this.firstClickStates));
        localStorage.setItem('unlockedPatternKeys', JSON.stringify(this.unlockedPatternKeys));
    }

    checkUnlockConditions() {
        let unlockUpdated = false;

        if (!this.unlockStates.sparkleCounter && this.fireworkCount >= 1) {
            this.unlockStates.sparkleCounter = true;
            this.ui.showSparkleCounter();
            unlockUpdated = true;
        }

        if (!this.unlockStates.tabMenu && this.fireworkCount >= 10) {
            this.unlockStates.tabMenu = true;
            this.ui.showTabMenu();
            this.ui.showCollapseButton();
            this.ui.expandAllTabs();
            if (!this.firstClickStates.tabMenu) {
                this.ui.addGlimmer('tabMenu');
            }
            unlockUpdated = true;
        }

        if (!this.unlockStates.buildingsTab && this.fireworkCount >= 20) {
            this.unlockStates.buildingsTab = true;
            this.ui.showBuildingsTab();
            this.ui.expandAllTabs();
            if (!this.firstClickStates.buildingsTab) {
                this.ui.addGlimmer('buildingsTab');
            }
            unlockUpdated = true;
        }

        if (!this.unlockStates.upgradesTab && this.fireworkCount >= 30) {
            this.unlockStates.upgradesTab = true;
            this.ui.showUpgradesTab();
            this.ui.expandAllTabs();
            if (!this.firstClickStates.upgradesTab) {
                this.ui.addGlimmer('upgradesTab');
            }
            unlockUpdated = true;
        }

        if (!this.unlockStates.backgroundTab && this.getSparkles() >= 50) {
            this.unlockStates.backgroundTab = true;
            this.ui.showBackgroundTab();
            if (!this.firstClickStates.backgroundTab) {
                this.ui.addGlimmer('backgroundTab');
            }
            unlockUpdated = true;
        }

        if (!this.unlockStates.crowdsTab && this.calculateTotalSparklesPerSecond() >= 0.7) {
            this.unlockStates.crowdsTab = true;
            this.ui.showCrowdsTab();
            if (!this.firstClickStates.crowdsTab) {
                this.ui.addGlimmer('crowdsTab');
            }
            unlockUpdated = true;
        }

        if (!this.unlockStates.resourceGenerator) {
            const launcherCount = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;
            if (launcherCount >= 3) {
                this.unlockStates.resourceGenerator = true;
                this.showNotification("New building unlocked: Sparkle Generator!");
                this.ui.updateBuildingTypeVisibility();
                unlockUpdated = true;
            }
        }

        if (!this.unlockStates.efficiencyBooster) {
            const totalSps = this.calculateTotalSparklesPerSecond();
            if (totalSps >= 2.0) {
                this.unlockStates.efficiencyBooster = true;
                this.showNotification("New building unlocked: Efficiency Booster!");
                this.ui.updateBuildingTypeVisibility();
                unlockUpdated = true;
            }
        }

        if (!this.unlockStates.droneHub) {
            const boosterCount = this.buildingManager.getBuildingsByType('EFFICIENCY_BOOSTER').length;
            if (boosterCount >= 1) {
                this.unlockStates.droneHub = true;
                this.showNotification("New building unlocked: Drone Hub!");
                this.ui.updateBuildingTypeVisibility();
                unlockUpdated = true;
            }
        }

        if (!this.unlockStates.recipesTab) {
            const launcherCount = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER').length;
            if (launcherCount >= 20) {
                this.unlockStates.recipesTab = true;
                this.ui.showRecipesTab();
                this.showNotification("Recipe system unlocked! You can now create and assign custom recipes.");
                unlockUpdated = true;
            }
        }

        if (unlockUpdated) {
            this.saveUnlockStates();
        }
    }

    onFirstClick(elementType) {
        if (!this.firstClickStates[elementType]) {
            this.firstClickStates[elementType] = true;
            this.ui.removeGlimmer(elementType);
            this.saveUnlockStates();
        }
    }

    isBuildingTypeUnlocked(buildingType) {
        switch (buildingType) {
            case 'AUTO_LAUNCHER':
                return this.unlockStates.buildingsTab || false;
            case 'RESOURCE_GENERATOR':
                return this.unlockStates.resourceGenerator || false;
            case 'EFFICIENCY_BOOSTER':
                return this.unlockStates.efficiencyBooster || false;
            case 'DRONE_HUB':
                return this.unlockStates.droneHub || false;
            default:
                return false;
        }
    }

    getLauncherAt(x, y) {
        return this.buildingManager.getBuildingAt(x, y);
    }
}

export default FireworkGame;
