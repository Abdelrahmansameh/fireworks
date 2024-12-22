import { FIREWORK_CONFIG, GAME_BOUNDS } from '../config/config.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import Crowd from '../entities/Crowd.js';
import Firework from '../entities/Firework.js';
import UIManager from '../ui/UIManager.js';

class FireworkGame {
    constructor() {
        // Core game state
        this.currentLevel = 0;
        this.levels = [{
            fireworks: [],
            autoLaunchers: [],
            unlocked: true
        }];

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = null;

        this.recipes = [];
        this.currentRecipeComponents = [];
        this.currentTrailEffect = 'fade';
        this.fireworkCount = 0;
        this.autoLauncherCost = 10;
        this.sparkles = 0;
        this.selectedLauncherIndex = null;
        this.crowdCount = 0;
        this.lastSparklesPerSecond = 0;
        this.crowdThresholds = [1, 2, 3, 4, 5, 10, 15];

        this.draggingLauncher = null;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.lastPointerX = 0;

        this.isMobile = this.detectMobile();

        // Initialize UI
        this.ui = new UIManager(this);

        // Initialize the game
        this.init();
    }

    init() {
        // Load game state from localStorage
        this.currentLevel = parseInt(localStorage.getItem('currentLevel')) || 0;
        this.fireworkCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || 10;
        this.sparkles = parseInt(localStorage.getItem('sparkles')) || 0;

        // Load levels data
        const savedLevels = JSON.parse(localStorage.getItem('levels'));
        if (savedLevels) {
            this.levels = savedLevels.map(levelData => ({
                fireworks: [],
                autoLaunchers: levelData.autoLaunchers || [],
                unlocked: levelData.unlocked || false
            }));
        }

        // Load selected launcher
        const savedSelectedIndex = parseInt(localStorage.getItem('selectedLauncherIndex'));
        if (!isNaN(savedSelectedIndex) && savedSelectedIndex < this.levels[this.currentLevel].autoLaunchers.length) {
            this.selectedLauncherIndex = savedSelectedIndex;
            this.selectLauncher(this.selectedLauncherIndex);
        }

        // Initialize Three.js components
        this.initThreeJS();
        this.initBackgroundColor();

        // Initialize game components
        this.particleSystem = new InstancedParticleSystem(this.scene, 50000);
        this.crowd = new Crowd(this.scene);

        // Initialize launchers
        this.levels.forEach(levelData => {
            levelData.autoLaunchers.forEach(launcher => {
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
        });

        this.levels[this.currentLevel].autoLaunchers.forEach(launcher => {
            this.createAutoLauncherMesh(launcher);
        });

        // Initialize UI and events
        this.loadRecipes();
        this.loadCurrentRecipe();
        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        // Set up game container
        const gameContainer = document.getElementById('game-container');
        gameContainer.style.touchAction = 'none';

        // Add visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.pause();
            } else if (document.visibilityState === 'visible') {
                this.resume();
            }
        });

        // Update UI displays
        this.updateLevelDisplay();
        this.updateLevelsList();
        this.updateLevelArrows();

        // Start game loop
        this.animate();
    }

    initThreeJS() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        const aspectRatio = window.innerWidth / window.innerHeight;
        const verticalSize = GAME_BOUNDS.MAX_Y - GAME_BOUNDS.MIN_Y;
        const desiredDistance = (verticalSize / 2) / Math.tan((this.camera.fov * Math.PI / 180) / 2);
        this.camera.position.z = desiredDistance * 1.5;

        // Calculate the visible height at the target z-position
        this.visibleHeight = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.position.z;
        this.visibleWidth = this.visibleHeight * aspectRatio;

        // Adjust game bounds based on visible area
        GAME_BOUNDS.MIN_Y = -this.visibleHeight / 2;

        this.cameraTargetX = null;
        this.cameraTransitionSpeed = 5.0;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        const gameContainer = document.getElementById('game-container');
        gameContainer.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Initialize UI events after renderer is set up
        this.ui.initializeRendererEvents();
        this.ui.bindEvents();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }

    bindEvents() {
        document.getElementById('add-component').addEventListener('click', () => {
            this.currentRecipeComponents.push({
                pattern: 'spherical',
                color: '#ff0000',
                size: 0.5,
                lifetime: 1.2,
                shape: 'sphere',
                spread: 1.0,
                secondaryColor: '#00ff00'
            });
            this.updateComponentsList();
            this.saveCurrentRecipeComponents();
        });

        document.getElementById('save-recipe').addEventListener('click', () => {
            this.saveCurrentRecipe();
        });

        document.getElementById('erase-recipes').addEventListener('click', () => {
            this.showConfirmation(
                "Confirm Erase Recipes",
                "Are you sure you want to erase all saved recipes?",
                () => {
                    this.eraseAllRecipes();
                }
            );
        });

        document.getElementById('buy-auto-launcher').addEventListener('click', () => {
            this.buyAutoLauncher();
        });

        document.getElementById('reset-game').addEventListener('click', () => {
            this.showConfirmation(
                "Confirm Reset",
                "Are you sure you want to reset the game? All progress will be lost.",
                () => {
                    this.resetGame();
                }
            );
        });

        document.getElementById('reset-launchers').addEventListener('click', () => {
            this.showConfirmation(
                'Reset Auto-Launchers',
                'Are you sure you want to reset all auto-launchers? This will remove all launchers and refund 100% of their cost.',
                () => {
                    const refundAmount = this.resetAutoLaunchers();
                    this.showNotification(`Auto-launchers reset! Refunded ${Math.floor(refundAmount)} sparkles`);
                }
            );
        });

        document.getElementById('crafting-tab').addEventListener('click', () => {
            this.toggleTab('crafting');
        });
        document.getElementById('stats-tab').addEventListener('click', () => {
            this.toggleTab('stats');
        });
        document.getElementById('crowd-tab').addEventListener('click', () => {
            this.toggleTab('crowd');
        });
        document.getElementById('auto-launcher-tab').addEventListener('click', () => {
            this.toggleTab('auto-launcher');
            this.updateLauncherList();
        });
        document.getElementById('data-tab').addEventListener('click', () => {
            this.toggleTab('data');
        });
        document.getElementById('levels-tab').addEventListener('click', () => {
            this.toggleTab('levels');
            this.updateLevelsList();
        });

        document.getElementById('recipe-trail-effect').addEventListener('change', (e) => {
            this.currentTrailEffect = e.target.value;
            this.saveCurrentRecipeComponents();
        });

        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (!this.isClickInsideUI(e)) {
                e.preventDefault();
                if (e.pointerType === 'touch') {
                    e.target.setPointerCapture(e.pointerId);
                }

                const x = e.clientX;
                const y = e.clientY;

                const mouse = new THREE.Vector2();
                mouse.x = (x / window.innerWidth) * 2 - 1;
                mouse.y = - (y / window.innerHeight) * 2 + 1;

                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, this.camera);

                const launcherMeshes = this.levels[this.currentLevel].autoLaunchers.map(launcher => launcher.mesh);
                const intersects = raycaster.intersectObjects(launcherMeshes);

                if (intersects.length > 0) {
                    const intersectedMesh = intersects[0].object;
                    const launcherIndex = this.levels[this.currentLevel].autoLaunchers.findIndex(launcher => launcher.mesh === intersectedMesh);
                    if (launcherIndex !== -1) {
                        this.selectLauncher(launcherIndex);
                        this.showTab('auto-launcher');
                        setTimeout(() => {
                            const launcherList = document.getElementById('launcher-list');
                            const launcherCards = launcherList.getElementsByClassName('launcher-card');
                            if (launcherCards[launcherIndex]) {
                                launcherCards[launcherIndex].scrollIntoView({ behavior: 'smooth' });
                            }
                        }, 100);
                        this.draggingLauncher = this.levels[this.currentLevel].autoLaunchers[launcherIndex];
                        this.isDragging = true;

                        document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
                        document.addEventListener('pointerup', this.pointerUpHandler);
                        document.addEventListener('pointercancel', this.pointerUpHandler);

                        return;
                    }
                }

                const worldPos = this.screenToWorld(x, y);
                this.handlePointerClick(worldPos, e);
            }
        }, { passive: false });

        document.getElementById('collapse-button').addEventListener('click', function () {
            const tabs = document.querySelector('.tabs');
            const activeTabContent = document.querySelector('.tab-content.active');

            if (tabs.classList.contains('collapsed')) {
                tabs.classList.remove('collapsed');
            } else {
                tabs.classList.add('collapsed');
                if (activeTabContent) {
                    activeTabContent.classList.remove('active');
                }
            }
        });

        // Save/Load
        document.getElementById('save-progress').addEventListener('click', () => {
            const data = this.serializeGameData();
            const textarea = document.getElementById('serialized-data');
            textarea.value = data;
            textarea.select();
            textarea.setSelectionRange(0, 99999);
            document.execCommand('copy');
            this.showNotification("Progress saved and copied to clipboard!");
        });

        document.getElementById('load-progress').addEventListener('click', () => {
            const textarea = document.getElementById('serialized-data');
            const data = textarea.value.trim();
            if (!data) {
                this.showNotification("No data provided!");
                return;
            }
            try {
                this.deserializeGameData(data);
                this.showNotification("Progress loaded successfully!");
            } catch (error) {
                this.showNotification("Invalid data format!");
                console.error(error);
            }
        });

        // Level navigation
        document.getElementById('prev-level').addEventListener('click', () => {
            if (this.currentLevel > 0) {
                this.switchLevel(this.currentLevel - 1);
            }
        });
        document.getElementById('next-level').addEventListener('click', () => {
            // Now we do not automatically add a new level. The player must unlock it in the Levels tab.
            if (this.currentLevel < this.levels.length - 1 && this.levels[this.currentLevel + 1].unlocked) {
                this.switchLevel(this.currentLevel + 1);
            }
        });

        // Unlock next level button
        document.getElementById('unlock-next-level').addEventListener('click', () => {
            this.unlockNextLevel();
        });

        // Add wheel event listener for horizontal scrolling
        document.addEventListener('wheel', this.handleWheelScroll.bind(this), { passive: false });

        document.getElementById('spread-launchers').addEventListener('click', () => {
            this.spreadLaunchers();
        });

        document.getElementById('upgrade-all-launchers').addEventListener('click', () => this.upgradeAllLaunchers());
    }

    handleWheelScroll(event) {
        if (this.isClickInsideUI(event)) {
            return;
        }

        const wheelScrollSpeed = 0.05;
        const scrollAmount = event.deltaY * wheelScrollSpeed;

        this.camera.position.x += scrollAmount;

        // Use absolute bounds for scroll limits
        const maxScroll = (GAME_BOUNDS.SCROLL_MAX_X - GAME_BOUNDS.SCROLL_MIN_X) * 0.5;
        this.camera.position.x = Math.max(-maxScroll, Math.min(maxScroll, this.camera.position.x));
    }

    switchLevel(newLevel) {
        if (newLevel < 0 || newLevel >= this.levels.length || !this.levels[newLevel].unlocked) {
            return;
        }

        this.levels[this.currentLevel].fireworks.forEach(firework => {
            firework.dispose();
        });
        this.levels[this.currentLevel].fireworks = [];
        this.disposeAutoLaunchers(this.levels[this.currentLevel]);

        this.particleSystem.clear();

        this.currentLevel = newLevel;
        this.updateLevelDisplay();

        this.levels[this.currentLevel].autoLaunchers.forEach(launcher => {
            if (launcher.mesh) {
                this.scene.remove(launcher.mesh);
                if (launcher.mesh.geometry) launcher.mesh.geometry.dispose();
                if (launcher.mesh.material) {
                    if (launcher.mesh.material.map) launcher.mesh.material.map.dispose();
                    launcher.mesh.material.dispose();
                }
                launcher.mesh = null;
            }
            this.createAutoLauncherMesh(launcher);
        });

        this.updateLauncherList();
        this.updateLevelArrows();
        this.updateLevelsList();
    }

    pointerMoveHandler = (e) => {
        if (this.isDragging && this.draggingLauncher) {
            e.preventDefault();
            const x = e.clientX;
            const y = e.clientY;

            const mouse = new THREE.Vector2();
            mouse.x = (x / window.innerWidth) * 2 - 1;
            mouse.y = - (y / window.innerHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);

            const t = - (this.camera.position.z) / raycaster.ray.direction.z;
            const worldPos = new THREE.Vector3();
            worldPos.copy(raycaster.ray.direction).multiplyScalar(t).add(this.camera.position);

            const clampedX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(worldPos.x, GAME_BOUNDS.LAUNCHER_MAX_X));

            this.draggingLauncher.mesh.position.x = clampedX;
            this.draggingLauncher.x = clampedX;
            this.saveProgress();
        } else if (this.isScrollDragging) {
            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 0.2;

            this.camera.position.x -= deltaX * dragScrollSpeed;

            const maxScroll = (GAME_BOUNDS.SCROLL_MAX_X - GAME_BOUNDS.SCROLL_MIN_X) * 0.5;
            this.camera.position.x = Math.max(-maxScroll, Math.min(maxScroll, this.camera.position.x));

            this.lastPointerX = e.clientX;
        }
    };

    handlePointerClick(worldPos, event) {
        if (this.isClickInsideUI(event)) {
            return;
        }

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, this.camera);

        const launcherMeshes = this.levels[this.currentLevel].autoLaunchers.map(launcher => launcher.mesh);
        const intersects = raycaster.intersectObjects(launcherMeshes);
        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const launcherIndex = this.levels[this.currentLevel].autoLaunchers.findIndex(launcher => launcher.mesh === clickedMesh);
            if (launcherIndex !== -1) {
                if (event.pointerType === 'touch' || event.button === 0) {
                    this.selectLauncher(launcherIndex);

                    // Scroll the launcher into view in the UI
                    setTimeout(() => {
                        const launcherCards = document.querySelectorAll('.launcher-card');
                        if (launcherCards[launcherIndex]) {
                            launcherCards[launcherIndex].scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                    this.draggingLauncher = this.levels[this.currentLevel].autoLaunchers[launcherIndex];
                    this.isDragging = true;

                    if (event.pointerType === 'touch' && event.target) {
                        event.target.setPointerCapture(event.pointerId);
                    }

                    document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
                    document.addEventListener('pointerup', this.pointerUpHandler);
                    document.addEventListener('pointercancel', this.pointerUpHandler);

                    return;
                }
            }
        } else {
            // Start scroll dragging if not clicking on a launcher
            this.isScrollDragging = true;
            this.cameraTargetX = null;
            this.lastPointerX = event.clientX;
            document.body.style.cursor = 'grabbing';

            if (event.pointerType === 'touch' && event.target) {
                event.target.setPointerCapture(event.pointerId);
            }

            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
            return;
        }

        this.launchFireworkAt(worldPos.x);
    }

    pointerUpHandler = (e) => {
        if (this.isDragging || this.isScrollDragging) {
            if (e.pointerType === 'touch' && e.target) {
                e.target.releasePointerCapture(e.pointerId);
            }

            // For touch events, always treat them as potential firework launches
            if (e.pointerType === 'touch' && !this.isClickInsideUI(e)) {
                const worldPos = this.screenToWorld(e.clientX, e.clientY);
                this.launchFireworkAt(worldPos.x);
            }
            if (this.isScrollDragging) {
                const deltaX = Math.abs(e.clientX - this.lastPointerX);
                if (deltaX < 20 && !this.isClickInsideUI(e)) {
                    const worldPos = this.screenToWorld(e.clientX, e.clientY);
                    this.launchFireworkAt(worldPos.x);
                }
                document.body.style.cursor = 'default';
            }

            this.isDragging = false;
            this.isScrollDragging = false;
            this.draggingLauncher = null;

            document.removeEventListener('pointermove', this.pointerMoveHandler);
            document.removeEventListener('pointerup', this.pointerUpHandler);
            document.removeEventListener('pointercancel', this.pointerUpHandler);
        }
    }

    showConfirmation(title, message, onConfirm) {
        this.ui.showConfirmation(title, message, onConfirm);
    }

    showNotification(message) {
        this.ui.showNotification(message);
    }

    isPositionInsideUI(x, y) {
        return document.elementFromPoint(x, y) !== this.renderer.domElement;
    }

    isClickInsideUI(event) {
        return this.isPositionInsideUI(event.clientX, event.clientY);
    }

    screenToWorld(x, y) {
        const mouse = new THREE.Vector2();
        mouse.x = (x / window.innerWidth) * 2 - 1;
        mouse.y = - (y / window.innerHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const t = - (this.camera.position.z) / raycaster.ray.direction.z;
        const worldPos = new THREE.Vector3();
        worldPos.copy(raycaster.ray.direction).multiplyScalar(t).add(this.camera.position);

        return worldPos;
    }

    getViewBounds() {
        // Return fixed game bounds instead of screen-relative bounds
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
        const currentLevelSparklesPerSec = this.calculateSparklesPerSecond(this.levels[this.currentLevel]).toFixed(2);
        const totalSparklesPerSec = this.calculateTotalSparklesPerSecond().toFixed(2);

        this.ui.updateUI(
            Math.round(this.sparkles).toLocaleString(),
            `+${totalSparklesPerSec}`,
            `+${currentLevelSparklesPerSec}`,
            this.fireworkCount,
            this.levels[this.currentLevel].autoLaunchers.length,
            this.currentTrailEffect,
            this.calculateAutoLauncherCost(this.levels[this.currentLevel].autoLaunchers.length)
        );
    }

    update(deltaTime) {
        this.particleSystem.update(deltaTime);

        this.updateCameraPosition(deltaTime);

        this.levels[this.currentLevel].autoLaunchers.forEach(launcher => {
            launcher.accumulator += deltaTime;
            if (launcher.accumulator >= launcher.spawnInterval) {
                const x = launcher.x;
                let recipe = this.recipes[launcher.assignedRecipeIndex];
                if (recipe) {
                    this.launchFireworkAt(x, GAME_BOUNDS.MIN_Y, recipe.components, recipe.trailEffect);
                } else {
                    this.launchFireworkAt(x, GAME_BOUNDS.MIN_Y, this.currentRecipeComponents, this.currentTrailEffect);
                }
                launcher.accumulator -= launcher.spawnInterval;
            }
        });

        // Generate sparkles in other unlocked levels passively
        this.levels.forEach((level, index) => {
            if (index !== this.currentLevel && level.unlocked) {
                const sparklesPerSecond = this.calculateSparklesPerSecond(level);
                this.sparkles += sparklesPerSecond * deltaTime;
                this.saveProgress();
                this.updateUI();
            }
        });

        // Update crowd based on sparkles per second
        const currentSps = this.calculateTotalSparklesPerSecond();
        if (currentSps > this.lastSparklesPerSecond) {
            // Add new crowd members based on thresholds
            for (const threshold of this.crowdThresholds) {
                if (currentSps >= threshold && this.lastSparklesPerSecond < threshold) {
                    this.crowdCount++;
                    this.crowd.addPerson();
                    this.saveProgress();
                    this.updateCrowdDisplay();
                }
            }
        }
        this.lastSparklesPerSecond = currentSps;
        this.updateCrowdDisplay();
    }

    initBackgroundColor() {
        const savedColor = localStorage.getItem('backgroundColor') || '#000000';

        const initColorPicker = () => {
            const colorPicker = document.getElementById('background-color');
            if (colorPicker) {
                colorPicker.value = savedColor;
                this.renderer.setClearColor(new THREE.Color(savedColor));

                colorPicker.addEventListener('input', (e) => {
                    const color = e.target.value;
                    this.renderer.setClearColor(new THREE.Color(color));
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
        localStorage.setItem('sparkles', this.sparkles);
        localStorage.setItem('fireworkRecipes', JSON.stringify(this.recipes));
        localStorage.setItem('currentTrailEffect', this.currentTrailEffect);
        localStorage.setItem('currentLevel', this.currentLevel);

        const levelsData = this.levels.map(level => ({
            autoLaunchers: level.autoLaunchers,
            unlocked: level.unlocked
        }));
        localStorage.setItem('levels', JSON.stringify(levelsData));

        localStorage.setItem('currentRecipeComponents', JSON.stringify(this.currentRecipeComponents));
        localStorage.setItem('backgroundColor', document.getElementById('background-color').value);
        localStorage.setItem('selectedLauncherIndex', this.selectedLauncherIndex || '');
        localStorage.setItem('crowdCount', this.crowdCount);
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
            const currentFireworks = this.levels[this.currentLevel].fireworks;
            for (let i = currentFireworks.length - 1; i >= 0; i--) {
                currentFireworks[i].update(delta);
                if (!currentFireworks[i].alive) {
                    currentFireworks[i].dispose();
                    currentFireworks.splice(i, 1);
                }
            }

            this.update(delta);

            // Update crowd animation
            this.crowd.update(delta);

            this.renderer.render(this.scene, this.camera);
        }
    }

    launchFireworkAt(x, minY = null, recipeComponents = null, trailEffect = null) {
        const components = recipeComponents || this.currentRecipeComponents;

        if (components.length === 0) {
            this.showNotification("Add at least one component to launch a firework!");
            return;
        }

        const y = minY || GAME_BOUNDS.MIN_Y;
        const effect = trailEffect || this.currentTrailEffect;

        this.launch(x, y, components, effect);
        this.fireworkCount++;
        this.sparkles++;
        this.saveProgress();
        this.updateUI();
    }

    launch(x, y, components, trailEffect) {
        const firework = new Firework(x, y, components, this.scene, this.camera, trailEffect, this.particleSystem);
        this.levels[this.currentLevel].fireworks.push(firework);
    }

    buyAutoLauncher() {
        const numLaunchers = this.levels[this.currentLevel].autoLaunchers.length;
        const cost = this.calculateAutoLauncherCost(numLaunchers);

        if (this.sparkles >= cost) {
            this.sparkles -= cost;
            const x = GAME_BOUNDS.LAUNCHER_MIN_X + (Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X));
            const accumulator = Math.random() * 5;
            const launcher = {
                x: x,
                accumulator: accumulator,
                assignedRecipeIndex: null,
                level: 1,
                spawnInterval: 5,
                upgradeCost: 15
            };
            this.createAutoLauncherMesh(launcher);
            this.levels[this.currentLevel].autoLaunchers.push(launcher);
            this.saveProgress();
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
        const width = 2;
        const height = 4;
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });
        const launcherMesh = new THREE.Mesh(geometry, material);
        // Position launcher at bottom of visible area with small offset
        const y = GAME_BOUNDS.MIN_Y + (height / 2);
        launcherMesh.position.set(launcher.x, y, 0);
        this.scene.add(launcherMesh);

        launcher.mesh = launcherMesh;
    }

    resetAutoLaunchers() {
        let refundAmount = 0;

        this.levels.forEach(level => {
            level.autoLaunchers.forEach(launcher => {
                let cost = 0;
                // Initial purchase cost
                cost += this.calculateAutoLauncherCost(0);
                // Add all upgrade costs
                for (let i = 2; i <= launcher.level; i++) {
                    cost += launcher.upgradeCost * (i - 1);
                }
                refundAmount += cost;

                // Remove the mesh from the scene
                if (launcher.mesh) {
                    this.scene.remove(launcher.mesh);
                    if (launcher.mesh.geometry) launcher.mesh.geometry.dispose();
                    if (launcher.mesh.material) {
                        if (launcher.mesh.material.map) launcher.mesh.material.map.dispose();
                        launcher.mesh.material.dispose();
                    }
                    launcher.mesh = null;
                }
            });
            level.autoLaunchers = []; // Clear all launchers
        });

        // Add the refund to sparkles
        this.sparkles += Math.floor(refundAmount);

        // Reset auto launcher cost to initial value
        this.autoLauncherCost = 10;

        // Update UI
        this.updateUI();
        this.updateLauncherList();
        this.saveProgress();
        return refundAmount;
    }

    resetGame() {
        this.fireworkCount = 0;
        this.sparkles = 0;
        this.recipes = [];
        this.crowdCount = 0;
        this.currentTrailEffect = 'fade';
        this.currentRecipeComponents = [{
            pattern: 'spherical', color: '#ff0000', size: 0.5, lifetime: 1.2, shape: 'sphere', spread: 1.0, secondaryColor: '#00ff00'
        }];

        this.levels.forEach(levelData => {
            levelData.fireworks.forEach(firework => {
                firework.dispose();
            });
            levelData.fireworks = [];
            this.disposeAutoLaunchers(levelData);
            levelData.autoLaunchers = [];
        });

        // Properly dispose of crowd members
        if (this.crowd) {
            this.crowd.dispose();
        }

        this.levels = [{ fireworks: [], autoLaunchers: [], unlocked: true }];
        this.currentLevel = 0;

        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = new InstancedParticleSystem(this.scene, 50000);
        }

        this.lastSparklesPerSecond = 0;

        this.autoLauncherCost = 10;

        localStorage.clear();

        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();
        this.showNotification("Game has been reset.");

        this.renderer.setClearColor(new THREE.Color('#000000'));
        document.getElementById('background-color').value = '#000000';
        this.updateLevelDisplay();
        this.updateLevelsList();
        this.updateLevelArrows();
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
            this.levels[this.currentLevel].autoLaunchers,
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
        const launcher = this.levels[this.currentLevel].autoLaunchers[index];
        if (!launcher) {
            this.showNotification("Launcher not found.");
            return;
        }

        if (this.sparkles >= launcher.upgradeCost) {
            this.sparkles -= launcher.upgradeCost;
            launcher.level += 1;
            launcher.spawnInterval = launcher.spawnInterval * 0.9;
            launcher.upgradeCost = Math.floor(launcher.upgradeCost * 1.2);

            this.saveProgress();
            this.updateUI();
            this.updateLauncherList();
            this.showNotification(`Auto-Launcher ${index + 1} upgraded to level ${launcher.level}!`);
        } else {
            this.showNotification("Not enough sparkles to upgrade this launcher!");
        }
    }

    upgradeAllLaunchers() {
        const currentLevel = this.levels[this.currentLevel];
        let upgraded = false;
        let totalSpent = 0;
        let foundAffordableUpgrade = true;

        while (foundAffordableUpgrade) {
            foundAffordableUpgrade = false;
            let cheapestCost = Infinity;
            let cheapestIndex = -1;

            // Find the cheapest upgrade we can afford
            for (let i = 0; i < currentLevel.autoLaunchers.length; i++) {
                const cost = currentLevel.autoLaunchers[i].upgradeCost;
                if (cost <= this.sparkles && cost < cheapestCost) {
                    cheapestCost = cost;
                    cheapestIndex = i;
                    foundAffordableUpgrade = true;
                }
            }

            // If we found one, buy it
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
            sparkles: this.sparkles,
            recipes: this.recipes,
            currentTrailEffect: this.currentTrailEffect,
            currentLevel: this.currentLevel,
            levels: this.levels.map(level => ({
                autoLaunchers: level.autoLaunchers,
                unlocked: level.unlocked
            })),
            currentRecipeComponents: this.currentRecipeComponents,
            backgroundColor: localStorage.getItem('backgroundColor') || '#000000',
            selectedLauncherIndex: this.selectedLauncherIndex,
            crowdCount: this.crowdCount
        };
        return JSON.stringify(data);
    }

    deserializeGameData(jsonString) {
        const data = JSON.parse(jsonString);

        this.resetGame();

        this.fireworkCount = data.fireworkCount || 0;
        this.autoLauncherCost = data.autoLauncherCost || 10;
        this.sparkles = data.sparkles || 0;
        this.recipes = data.recipes || [];
        this.currentTrailEffect = data.currentTrailEffect || 'fade';
        this.currentRecipeComponents = data.currentRecipeComponents || [{
            pattern: 'spherical', color: '#ff0000', size: 0.5, lifetime: 1.2, shape: 'sphere', spread: 1.0, secondaryColor: '#00ff00'
        }];

        const bgColor = data.backgroundColor || '#000000';
        this.renderer.setClearColor(new THREE.Color(bgColor));
        localStorage.setItem('backgroundColor', bgColor);
        document.getElementById('background-color').value = bgColor;

        this.selectedLauncherIndex = data.selectedLauncherIndex ?? null;

        if (data.levels) {
            const currentLevel = data.currentLevel || 0;
            this.levels = data.levels.map((levelData, index) => ({
                fireworks: [],
                autoLaunchers: levelData.autoLaunchers || [],
                unlocked: levelData.unlocked || index === 0
            }));
            this.currentLevel = currentLevel;
        } else {
            this.levels = [{
                fireworks: [],
                autoLaunchers: data.autoLaunchers || [],
                unlocked: true
            }];
            this.currentLevel = 0;
        }

        this.levels.forEach(levelData => {
            levelData.autoLaunchers.forEach(launcher => {
                if (!launcher.accumulator) {
                    launcher.accumulator = Math.random() * 5;
                }
                if (launcher.level === undefined) {
                    launcher.level = 1;
                    launcher.spawnInterval = 5;
                    launcher.upgradeCost = 15;
                }
            });
        });

        this.levels[this.currentLevel].autoLaunchers.forEach(launcher => {
            this.createAutoLauncherMesh(launcher);
        });

        this.saveProgress();
        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();

        if (this.selectedLauncherIndex !== null && this.selectedLauncherIndex < this.levels[this.currentLevel].autoLaunchers.length) {
            this.selectLauncher(this.selectedLauncherIndex);
        }

        this.updateLevelDisplay();
        this.updateLevelsList();
        this.updateLevelArrows();
        this.updateCrowdDisplay();
    }

    disposeAutoLaunchers(levelData) {
        levelData.autoLaunchers.forEach(launcher => {
            if (launcher.mesh) {
                this.scene.remove(launcher.mesh);
                if (launcher.mesh.geometry) launcher.mesh.geometry.dispose();
                if (launcher.mesh.material) {
                    if (launcher.mesh.material.map) launcher.mesh.material.map.dispose();
                    launcher.mesh.material.dispose();
                }
                launcher.mesh = null;
            }
        });
    }

    updateLevelDisplay() {
        const levelDisplay = document.getElementById('level-display');
        levelDisplay.textContent = `Level: ${this.currentLevel + 1}`;
    }

    updateLevelArrows() {
        const prevButton = document.getElementById('prev-level');
        const nextButton = document.getElementById('next-level');

        prevButton.style.display = this.currentLevel > 0 ? 'block' : 'none';

        // Next button only if next level is unlocked
        if (this.currentLevel < this.levels.length - 1 && this.levels[this.currentLevel + 1].unlocked) {
            nextButton.style.display = 'block';
        } else {
            nextButton.style.display = 'none';
        }
    }

    // We no longer automatically unlock new levels. We must buy them at a cost of 100000 sparkles.
    unlockNextLevel() {
        const cost = 100000; // 100k sparkles
        // If there's already a next level in existence and locked, unlock it.
        // If there's no next level, create one and unlock it.
        let nextLevelIndex = this.levels.length;
        // Check if last level is unlocked
        // We always create a new level when we unlock next.
        if (this.sparkles >= cost) {
            this.sparkles -= cost;
            this.levels.push({
                fireworks: [],
                autoLaunchers: [],
                unlocked: true
            });
            this.saveProgress();
            this.updateUI();
            this.showNotification("New level unlocked!");
            this.updateLevelsList();
            this.updateLevelArrows();
        } else {
            this.showNotification("Not enough sparkles to unlock next level!");
        }
    }

    updateLevelsList() {
        const levelsList = document.getElementById('levels-list');
        levelsList.innerHTML = '';

        this.levels.forEach((level, index) => {
            if (level.unlocked) {
                const levelDiv = document.createElement('div');
                levelDiv.style.border = '1px solid #34495e';
                levelDiv.style.borderRadius = '5px';
                levelDiv.style.padding = '10px';
                levelDiv.style.marginBottom = '10px';
                levelDiv.style.cursor = 'pointer';
                levelDiv.style.background = (index === this.currentLevel) ? '#1a1f2a' : '#2a2f3a';
                levelDiv.textContent = `Level ${index + 1}`;
                levelDiv.addEventListener('click', () => {
                    if (index !== this.currentLevel) {
                        this.switchLevel(index);
                    }
                });
                levelsList.appendChild(levelDiv);
            }
        });
    }

    calculateSparklesPerSecond(level) {
        if (!level.autoLaunchers) return 0;
        let totalSparklesPerSecond = level.autoLaunchers.reduce((total, launcher) => {
            return total + (1 / launcher.spawnInterval);
        }, 0);

        return Math.round(totalSparklesPerSecond * 100) / 100;
    }

    calculateTotalSparklesPerSecond() {
        let total = 0;
        for (const level of this.levels) {
            if (level.unlocked) {
                total += this.calculateSparklesPerSecond(level);
            }
        }
        return Math.round(total * 100) / 100;
    }

    updateCameraPosition(deltaTime) {
        // we can use null as an invalid value for vectors because javascript will coerce it to 0 because its weird like that
        if (this.cameraTargetX !== null) {
            const t = Math.min(this.cameraTransitionSpeed * deltaTime, 1.0);
            this.camera.position.x += (this.cameraTargetX - this.camera.position.x) * t;
            if (Math.abs(this.camera.position.x - this.cameraTargetX) < 0.1) {
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
        return null; // No active tab found
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

        // Find next threshold
        const nextThreshold = this.crowdThresholds.find(t => t > currentSps) || 'Max';
        if (nextThresholdElement) {
            nextThresholdElement.textContent = nextThreshold;
        }

        // Update progress bar
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
        const launchers = this.levels[this.currentLevel].autoLaunchers;
        if (launchers.length === 0) {
            this.showNotification("No launchers to spread!");
            return;
        }

        const totalWidth = GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X;
        const spacing = totalWidth / (launchers.length + 1);

        launchers.forEach((launcher, index) => {
            const newX = GAME_BOUNDS.LAUNCHER_MIN_X + spacing * (index + 1);
            launcher.x = newX;
            launcher.mesh.position.x = newX;
        });

        this.saveProgress();
        this.showNotification("Launchers spread evenly!");
    }
}

export default FireworkGame;
