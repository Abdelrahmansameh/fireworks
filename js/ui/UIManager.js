import { GAME_BOUNDS, DEFAULT_RECIPE_COMPONENTS, COMPONENT_PROPERTY_RANGES, PARTICLE_TYPES, STATS_CONFIG, LAUNCHER_WORLD_HIGHLIGHT_DURATION, BUILDING_TYPES } from '../config/config.js';
import { TABS } from './uiSchema.js';
import { SkillTreeScreen } from './SkillTreeScreen.js';
import { patternDefinitions, patternDisplayNames } from '../entities/patterns/index.js';
import * as Renderer2D from '../rendering/Renderer.js';
import GameMetrics from '../metrics/GameMetrics.js';

class UIManager {
    constructor(game) {
        this.game = game;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.isScrollDragReady = false;
        this.hasScrolledDuringDrag = false;
        this.scrollDragHoldTimeout = null;
        this.scrollDragStartX = 0;
        this.minCameraDragHoldMs = 150;
        this.draggingLauncher = null;
        this.lastPointerX = 0;
        this.grabCursorWorldX = 0;
        this.grabCursorWorldY = 0;
        this.isCrowdDragging = false;
        this.notificationTimeout = null;
        this.activeFloatingSparkle = null;
        this.floatingSparkleTimeout = null;

        this.pointerMoveHandler = this.pointerMoveHandler.bind(this);
        this.pointerUpHandler = this.pointerUpHandler.bind(this);
        this.handleWheelScroll = this.handleWheelScroll.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerClick = this.handlePointerClick.bind(this);

        const storedFS = localStorage.getItem('showFloatingSparkle');
        this.showFloatingSparkleEnabled = storedFS === null ? true : (storedFS === 'true');

        /** @type {SkillTreeScreen|null} Initialised in bindUIEvents() once DOM is ready. */
        this.skillTree = null;
    }

    initializeRendererEvents() {
        const gameCanvas = document.getElementById('game-canvas');
        gameCanvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    }

    bindUIEvents() {
        // Initialise the skill-tree screen once the full DOM is available
        this.skillTree = new SkillTreeScreen(this.game);

        const addComponentButtons = [
            document.getElementById('add-component')
        ];
        addComponentButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            const defaultComponent = { ...DEFAULT_RECIPE_COMPONENTS[0] };
            this.game.currentRecipeComponents.push(defaultComponent);
            this.game.updateComponentsList('components-list');
            this.game.saveCurrentRecipeComponents();
        }));

        const saveRecipeButtons = [
            document.getElementById('save-recipe')
        ];
        saveRecipeButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            this.game.saveCurrentRecipe();
        }));

        const randomizeRecipeButtons = [
            document.getElementById('randomize-recipe')
        ];
        randomizeRecipeButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            this.game.randomizeRecipe();
        }));

        const eraseRecipeButtons = [
            document.getElementById('erase-recipes')
        ];
        eraseRecipeButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            this.showConfirmation(
                "Confirm Erase Recipes",
                "Are you sure you want to erase all saved recipes?",
                () => {
                    this.game.eraseAllRecipes();
                }
            );
        }));


        // Buy buttons — one handler per building type, derived from BUILDING_TYPES
        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            document.getElementById(`buy-${type.id}`)
                ?.addEventListener('click', () => this.game.buyBuilding(key));
        }

        document.getElementById('reset-game').addEventListener('click', () => {
            this.showConfirmation(
                "Confirm Reset",
                "Are you sure you want to reset the game? All progress will be lost.",
                () => {
                    this.game.resetGame();
                }
            );
        });

        document.getElementById('reset-launchers').addEventListener('click', () => {
            this.showConfirmation(
                'Reset Auto-Launchers',
                'Are you sure you want to reset all auto-launchers? This will remove all launchers and refund 100% of their cost.',
                () => {
                    const refundAmount = this.game.resetAutoLaunchers(); // Method in game needs adjustment
                    this.showNotification(`Auto-launchers reset! Refunded ${Math.floor(refundAmount)} sparkles`);
                }
            );
        });

        document.getElementById('reset-upgrades').addEventListener('click', () => {
            this.showConfirmation(
                'Reset All Upgrades',
                'Are you sure you want to reset all upgrades? You will be refunded their full cost.',
                () => {
                    const refunds = this.game.resetUpgrades();
                    this.showNotification(`Upgrades reset! Refunded ${Math.floor(refunds.sparkles)} sparkles` + (refunds.gold > 0 ? ` and ${Math.floor(refunds.gold)} gold` : ''));
                }
            );
        });

        // Tab buttons — loop over TABS schema
        for (const tab of TABS) {
            const btn = document.getElementById(`${tab.id}-tab`);
            if (!btn) continue;
            btn.addEventListener('click', () => {
                // Upgrades tab opens the full-screen skill tree instead of a panel
                if (tab.id === 'upgrades') {
                    this.skillTree.open();
                    return;
                }
                this.toggleTab(tab.id);
                if (tab.id === 'buildings') {
                    this.game.updateLauncherList();
                    this.updateBuildingCosts();
                    this.updateBuildingTypeVisibility();
                }
            });
        }

        const cheatAddSparklesBtn = document.getElementById('cheat-add-sparkles');
        if (cheatAddSparklesBtn) {
            cheatAddSparklesBtn.addEventListener('click', () => {
                const amtInput = document.getElementById('cheat-sparkles-amount');
                const amount = parseFloat(amtInput.value) || 0;
                if (amount > 0) {
                    this.game.addSparkles(amount, 'cheat');
                    this.showNotification(`Added ${amount.toLocaleString()} sparkles`);
                }
            });
        }

        const cheatAddGoldBtn = document.getElementById('cheat-add-gold');
        if (cheatAddGoldBtn) {
            cheatAddGoldBtn.addEventListener('click', () => {
                const amtInput = document.getElementById('cheat-gold-amount');
                const amount = parseFloat(amtInput.value) || 0;
                if (amount > 0) {
                    this.game.addGold(amount, 'cheat');
                    this.showNotification(`Added ${amount.toLocaleString()} gold`);
                }
            });
        }

        // Cheat: unlock all upgrades
        const cheatUnlockUpgradesBtn = document.getElementById('cheat-unlock-upgrades');
        if (cheatUnlockUpgradesBtn) {
            cheatUnlockUpgradesBtn.addEventListener('click', () => {
                this.game.unlockAllUpgrades();
                this.showNotification('All upgrades unlocked!');
            });
        }

        const cheatUnlockEverythingBtn = document.getElementById('cheat-unlock-everything');
        if (cheatUnlockEverythingBtn) {
            cheatUnlockEverythingBtn.addEventListener('click', () => {
                this.game.cheatUnlockEverything();
            });
        }

        // Cheat: spawn drones
        const cheatSpawnDroneBtn = document.getElementById('cheat-spawn-drone');
        if (cheatSpawnDroneBtn) {
            cheatSpawnDroneBtn.addEventListener('click', () => {
                const countInput = document.getElementById('cheat-drone-count');
                const count = Math.max(1, parseInt(countInput?.value) || 1);
                for (let i = 0; i < count; i++) {
                    this.game.spawnDrone();
                }
                this.showNotification(`Spawned ${count} drone${count !== 1 ? 's' : ''}!`);
            });
        }

        const gameContainer = document.getElementById('game-canvas');
        gameContainer.addEventListener('pointerdown', (e) => {
            if (!this.game.isClickInsideUI(e)) {
                e.preventDefault();

                const x = e.clientX;
                const y = e.clientY;

                const worldPos = this.game.screenToWorld(x, y);
            }
        });

        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());
        document.addEventListener('gestureend', e => e.preventDefault());

        this.renderUpgrades();
    }

    bindEvents() {
        document.getElementById('collapse-button').addEventListener('click', this.handleCollapseButton.bind(this));

        document.getElementById('save-progress').addEventListener('click', () => {
            const data = this.game.serializeGameData();
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
                this.game.deserializeGameData(data);
                this.showNotification("Progress loaded successfully!");
            } catch (error) {
                this.showNotification("Invalid data format!");
                console.error(error);
            }
        });

        document.addEventListener('wheel', this.handleWheelScroll, { passive: false });

        document.getElementById('spread-launchers').addEventListener('click', () => {
            this.game.spreadLaunchers();
        });

        document.getElementById('randomize-launcher-recipes').addEventListener('click', () => {
            this.game.randomizeLauncherRecipes();
        });



        // Building type sub-tab switching — loop over BUILDING_TYPES
        for (const [key] of Object.entries(BUILDING_TYPES)) {
            const btn = document.querySelector(`.building-type-tab[data-building-type="${key}"]`);
            if (btn) {
                btn.addEventListener('click', () => this.switchBuildingType(key));
            }
        }



        document.addEventListener('keydown', (e) => {
            if ((e.key === 'P' || e.key === 'p') && e.shiftKey) {
                if (!this.game.profiler.isRecording) {
                    console.log('Starting performance recording...');
                    this.game.profiler.startRecording();
                } else {
                    console.log('Stopping performance recording...');
                    this.game.profiler.stopRecording();
                }
            }
        });

        const fsToggle = document.getElementById('toggle-floating-sparkle');
        if (fsToggle) {
            fsToggle.checked = this.showFloatingSparkleEnabled;
            fsToggle.addEventListener('change', (e) => {
                this.showFloatingSparkleEnabled = e.target.checked;
                localStorage.setItem('showFloatingSparkle', this.showFloatingSparkleEnabled);
            });
        }

        const musicSlider = document.getElementById('music-volume');
        const musicValue = document.getElementById('music-volume-value');
        const sfxSlider = document.getElementById('sfx-volume');
        const sfxValue = document.getElementById('sfx-volume-value');

        if (musicSlider && musicValue) {
            const savedVolume = localStorage.getItem('musicVolume');
            const volume = savedVolume !== null ? parseInt(savedVolume) : 15;
            musicSlider.value = volume;
            musicValue.textContent = volume;
            this.game.audioManager.setMusicVolume(volume / 100);

            musicSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                musicValue.textContent = volume;
                this.game.audioManager.setMusicVolume(volume / 100);
                localStorage.setItem('musicVolume', volume);
            });
        }

        if (sfxSlider && sfxValue) {
            const savedVolume = localStorage.getItem('sfxVolume');
            const volume = savedVolume !== null ? parseInt(savedVolume) : 15;
            sfxSlider.value = volume;
            sfxValue.textContent = volume;
            this.game.audioManager.setSfxVolume(volume / 100);

            sfxSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                sfxValue.textContent = volume;
                this.game.audioManager.setSfxVolume(volume / 100);
                localStorage.setItem('sfxVolume', volume);
            });
        }
    }

    handlePointerDown(e) {
        if (!this.game.isClickInsideUI(e)) {
            e.preventDefault();
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.handlePointerClick(worldPos, e);
        }
    }

    handlePointerClick(worldPos, event) {
        if (this.game.isClickInsideUI(event)) {
            return;
        }


        // Crowd grab takes priority over building drag / scroll-drag
        if (this.game.crowd && this.game.crowd.tryGrab(worldPos.x, worldPos.y)) {
            this.isCrowdDragging = true;
            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
            document.body.style.cursor = 'none';
            return;
        }


        this.grabCursorWorldX = worldPos.x;
        this.grabCursorWorldY = worldPos.y;

        const intersectedBuilding = this.game.getLauncherAt(worldPos.x, worldPos.y);

        if (intersectedBuilding) {
            this.isDragging = true;
            this.draggingLauncher = intersectedBuilding;
            this.game.selectLauncher(intersectedBuilding.id);
            this.game.updateLauncherList();
            this.emitGrabModeBurst(worldPos.x, worldPos.y);

            if (intersectedBuilding.type === 'AUTO_LAUNCHER') {
                this.focusBuildingInUI(intersectedBuilding);
            }

            document.body.style.cursor = 'none';

            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
        } else {
            this.isScrollDragging = true;
            this.isScrollDragReady = false;
            this.hasScrolledDuringDrag = false;
            this.game.cameraTargetX = null;
            this.lastPointerX = event.clientX;
            this.currentPointerX = event.clientX;
            this.currentPointerY = event.clientY;
            this.scrollDragStartX = event.clientX;

            if (this.scrollDragHoldTimeout) {
                clearTimeout(this.scrollDragHoldTimeout);
            }
            this.scrollDragHoldTimeout = setTimeout(() => {
                this.isScrollDragReady = true;

                const deltaX = this.currentPointerX - this.lastPointerX;
                if (Math.abs(deltaX) > 0) {
                    this.hasScrolledDuringDrag = true;
                    this.game.renderer2D.cameraX -= deltaX;

                    const viewHalfWidth = (this.game.renderer2D.canvas.width / this.game.renderer2D.cameraZoom) / 2;
                    const minCameraX = GAME_BOUNDS.SCROLL_MIN_X;
                    const maxCameraX = GAME_BOUNDS.SCROLL_MAX_X - viewHalfWidth;

                    if (minCameraX > maxCameraX) {
                        this.game.renderer2D.cameraX = (GAME_BOUNDS.SCROLL_MIN_X + GAME_BOUNDS.SCROLL_MAX_X) / 2;
                    } else {
                        this.game.renderer2D.cameraX = Math.max(minCameraX, Math.min(maxCameraX, this.game.renderer2D.cameraX));
                    }

                    this.game.renderer2D.setCamera({
                        x: this.game.renderer2D.cameraX,
                        y: this.game.renderer2D.cameraY,
                        zoom: this.game.renderer2D.cameraZoom
                    });

                    this.lastPointerX = this.currentPointerX;
                }

                const currentWorldPos = this.game.screenToWorld(this.currentPointerX, this.currentPointerY);
                this.emitGrabModeBurst(currentWorldPos.x, currentWorldPos.y);
                document.body.style.cursor = 'none';
            }, this.minCameraDragHoldMs);

            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
            return;
        }
    }

    emitGrabModeBurst(centerX, centerY) {
        if (!this.game.particleSystem) return;

        const burstCount = 7;
        const white = new Renderer2D.Color(1, 1, 1, 0.95);

        for (let i = 0; i < burstCount; i++) {
            const angle = i / burstCount * Math.PI * 2 * (2 * Math.PI / burstCount);
            const radius = 3 + Math.random();
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const tangentX = -dirY;
            const tangentY = dirX;
            const spinDirection = Math.random() < 0.5 ? -1 : 1;

            const velocity = new Renderer2D.Vector2(
                dirX * (200 + Math.random() * 45) + tangentX * (85 + Math.random() * 55) * spinDirection,
                dirY * (200 + Math.random() * 45) + tangentY * (85 + Math.random() * 55) * spinDirection
            );

            const position = new Renderer2D.Vector2(
                centerX + dirX * radius,
                centerY + dirY * radius
            );

            const spinSpeed = spinDirection * (20 + Math.random() * 14);
            const updateFn = (state, delta) => {
                //state.rotation += spinSpeed * delta;

                const toCursorX = this.grabCursorWorldX - state.position.x;
                const toCursorY = this.grabCursorWorldY - state.position.y;
                const distSq = toCursorX * toCursorX + toCursorY * toCursorY;
                const minAttractDistance = 100;

                if (distSq > minAttractDistance * minAttractDistance) {
                    const dist = Math.sqrt(distSq);
                    const invDist = 1 / dist;
                    const attractAccel = 10000;

                    state.velocity.x += toCursorX * invDist * attractAccel * delta;
                }
            };

            this.game.particleSystem.addParticle(
                position, // initial position
                velocity, // initial velocity
                white, // color
                6, // scale
                .33, // lifetime
                0, // gravity
                'triangle', // shape
                new Renderer2D.Vector2(0, 0), // acceleration
                5, // friction
                updateFn, // update function
                false, // enableColorGradient
                null, // gradientFinalColor
                0.0, // gradientStartTime
                1.0, // gradientDuration
                PARTICLE_TYPES.UI_EFFECT
            );
        }
    }

    emitFloatingSparkleNumberBurst(screenX, screenY, color = null) {
        if (!this.game.particleSystem)
            return;
        const worldPos = this.game.screenToWorld(screenX, screenY);

        // Parse color to normalized RGB, fallback to turquoise
        let baseR = 0.4, baseG = 0.9, baseB = 0.9;
        if (color) {
            if (typeof color === 'string' && color.startsWith('#')) {
                const hex = color.slice(1);
                baseR = parseInt(hex.substring(0, 2), 16) / 255;
                baseG = parseInt(hex.substring(2, 4), 16) / 255;
                baseB = parseInt(hex.substring(4, 6), 16) / 255;
            } else if (color.r !== undefined) {
                baseR = color.r;
                baseG = color.g;
                baseB = color.b;
            }
        }

        const burstCount = 10 + Math.floor(Math.random() * 5); // 10–14 particles
        const angleStep = (Math.PI * 2) / burstCount;

        for (let i = 0; i < burstCount; i++) {
            // Spherical-style: even base angle + random jitter within the slice
            const angle = i * angleStep + (Math.random() - 0.5) * angleStep;
            // replace circle with ellipse for more horiontal spread
            const smallRadius = 20 + Math.random() * 4;
            const bigRadius = 50 + Math.random() * 3;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);

            // Speed with spherical-style random multiplier: 70%–130% of base
            const speed = 150 * (0.7 + Math.random() * 0.6);
            const velocity = new Renderer2D.Vector2(
                dirX * speed,
                dirY * speed
            );

            const position = new Renderer2D.Vector2(
                worldPos.x + dirX * bigRadius + 5,
                worldPos.y + dirY * smallRadius + 10
            );

            // Slight per-particle brightness variation
            const bright = 0.82 + Math.random() * 0.18;
            const color = new Renderer2D.Color(
                baseR * bright,
                baseG * bright,
                baseB * bright,
                0.88 + Math.random() * 0.12
            );

            this.game.particleSystem.addParticle(
                position,
                velocity,
                color,
                3 + Math.random() * 3,
                0.2 + Math.random() * 0.1,
                0,
                'triangle',
                new Renderer2D.Vector2(0, 0),
                6,
                null,
                false,
                null,
                0.0,
                1.0,
                PARTICLE_TYPES.UI_EFFECT
            );
        }
    }

    pointerMoveHandler(e) {
        if (this.isCrowdDragging) {
            e.preventDefault();
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.game.crowd.dragTo(worldPos.x, worldPos.y);
            return;
        }

        if (this.isDragging && this.draggingLauncher) {
            e.preventDefault();
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.grabCursorWorldX = worldPos.x;
            this.grabCursorWorldY = worldPos.y;
            const clampedX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(worldPos.x, GAME_BOUNDS.LAUNCHER_MAX_X));

            this.draggingLauncher.setPosition(clampedX, this.draggingLauncher.y);
            this.game.saveProgress();
        } else if (this.isScrollDragging) {
            this.currentPointerX = e.clientX;
            this.currentPointerY = e.clientY;

            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.grabCursorWorldX = worldPos.x;
            this.grabCursorWorldY = worldPos.y;

            if (!this.isScrollDragReady) {
                return;
            }

            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 3;

            if (Math.abs(deltaX) > 0) {
                this.hasScrolledDuringDrag = true;
            }

            this.game.renderer2D.cameraX -= deltaX * dragScrollSpeed;

            const viewHalfWidth = (this.game.renderer2D.canvas.width / this.game.renderer2D.cameraZoom) / 2;
            const minCameraX = GAME_BOUNDS.SCROLL_MIN_X;
            const maxCameraX = GAME_BOUNDS.SCROLL_MAX_X - viewHalfWidth;
            // Ensure minCameraX is not greater than maxCameraX, can happen if view is wider than scroll area
            if (minCameraX > maxCameraX) {
                this.game.renderer2D.cameraX = (GAME_BOUNDS.SCROLL_MIN_X + GAME_BOUNDS.SCROLL_MAX_X) / 2;
            } else {
                this.game.renderer2D.cameraX = Math.max(minCameraX, Math.min(maxCameraX, this.game.renderer2D.cameraX));
            }

            this.game.renderer2D.setCamera({
                x: this.game.renderer2D.cameraX,
                y: this.game.renderer2D.cameraY,
                zoom: this.game.renderer2D.cameraZoom
            });

            this.lastPointerX = e.clientX;
        }
    }

    pointerUpHandler(e) {

        document.body.style.cursor = 'default';

        if (this.isCrowdDragging) {
            this.game.crowd.release();
            this.isCrowdDragging = false;
            document.removeEventListener('pointermove', this.pointerMoveHandler);
            document.removeEventListener('pointerup', this.pointerUpHandler);
            document.removeEventListener('pointercancel', this.pointerUpHandler);
            return;
        }

        if (this.isDragging || this.isScrollDragging) {
            if (this.scrollDragHoldTimeout) {
                clearTimeout(this.scrollDragHoldTimeout);
                this.scrollDragHoldTimeout = null;
            }


            if (this.isScrollDragging) {
                const shouldLaunch = !this.hasScrolledDuringDrag && !this.game.isClickInsideUI(e);
                if (shouldLaunch) {
                    const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
                    const res = this.game.fireworkSystem.launchFireworkAt(worldPos.x, worldPos.y);
                    if (res.sparkleAmount) {
                        const screenPos = this.game.renderer2D.worldToScreen(res.spawnX, res.spawnY);
                        this.showFloatingSparkle(e.clientX + 100, screenPos.y - 70, res.sparkleAmount, res.rocketColor);
                    }
                }
            }


            this.isDragging = false;
            this.isScrollDragging = false;
            this.isScrollDragReady = false;
            this.hasScrolledDuringDrag = false;
            this.scrollDragStartX = 0;
            this.draggingLauncher = null;

            document.removeEventListener('pointermove', this.pointerMoveHandler);
            document.removeEventListener('pointerup', this.pointerUpHandler);
            document.removeEventListener('pointercancel', this.pointerUpHandler);
        }
    }

    handleWheelScroll(event) {
        if (GAME_BOUNDS.IS_ZOOM_LOCKED) {
            return;
        }

        if (this.game.isClickInsideUI(event)) {
            return;
        }

        const oldZoom = this.game.renderer2D.cameraZoom;
        const oldCameraY = this.game.renderer2D.cameraY;

        const oldViewHeight = this.game.renderer2D.virtualHeight / oldZoom;
        const bottomEdgeY = oldCameraY - oldViewHeight / 2;

        const zoomFactor = 1.1;

        if (event.deltaY < 0) {
            this.game.renderer2D.cameraZoom *= zoomFactor;
        } else {
            this.game.renderer2D.cameraZoom /= zoomFactor;
        }

        this.game.renderer2D.cameraZoom = Math.max(GAME_BOUNDS.MIN_ZOOM, Math.min(this.game.renderer2D.cameraZoom, GAME_BOUNDS.MAX_ZOOM));

        const newViewHeight = this.game.renderer2D.virtualHeight / this.game.renderer2D.cameraZoom;
        this.game.renderer2D.cameraY = bottomEdgeY + newViewHeight / 2;

        this.game.renderer2D.setCamera({
            x: this.game.renderer2D.cameraX,
            y: this.game.renderer2D.cameraY,
            zoom: this.game.renderer2D.cameraZoom
        });
    }

    hideActiveTab() {
        const activeTabContent = document.querySelector('.tab-content.active');
        if (activeTabContent) {
            activeTabContent.classList.remove('active');
        }
    }

    handleCollapseButton() {
        const tabs = document.querySelector('.tabs');

        if (tabs.classList.contains('collapsed')) {
            tabs.classList.remove('collapsed');
        } else {
            tabs.classList.add('collapsed');
            this.hideActiveTab();
        }
    }

    expandAllTabs() {
        const tabs = document.querySelector('.tabs');
        tabs.classList.remove('collapsed');
    }


    showConfirmation(title, message, onConfirm) {
        const confirmationDialog = document.getElementById('confirmation-dialog');
        const confirmationTitle = document.getElementById('confirmation-title');
        const confirmationMessage = document.getElementById('confirmation-message');
        const confirmAction = document.getElementById('confirm-action');
        const cancelAction = document.getElementById('cancel-action');
        const overlay = document.getElementById('overlay');

        confirmationTitle.textContent = title;
        confirmationMessage.textContent = message;

        confirmationDialog.style.display = 'block';
        overlay.style.display = 'block';

        const hide = () => {
            confirmationDialog.style.display = 'none';
            overlay.style.display = 'none';
            confirmAction.removeEventListener('click', confirmHandler);
            cancelAction.removeEventListener('click', cancelHandler);
        };

        const confirmHandler = () => {
            onConfirm();
            hide();
        };

        const cancelHandler = () => {
            hide();
        };

        confirmAction.addEventListener('click', confirmHandler);
        cancelAction.addEventListener('click', cancelHandler);
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.classList.add('show');
        notification.textContent = message;

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        this.notificationTimeout = setTimeout(() => {
            this.dismissNotification();
        }, 3000);

        notification.onclick = () => {
            this.dismissNotification();
        };
    }

    dismissNotification() {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.classList.remove('show');
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
    }

    showTab(tab) {
        const tabs = document.querySelector('.tabs');
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.classList.remove('active'));
        const selectedTab = document.getElementById(`${tab}-content`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            tabs.classList.remove('collapsed');
        }
    }

    toggleTab(tab) {
        const tabs = document.querySelector('.tabs');
        const tabContent = document.getElementById(`${tab}-content`);
        const isActive = tabContent.classList.contains('active');

        if (isActive) {
            tabContent.classList.remove('active');
        } else {
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            tabContent.classList.add('active');
        }
    }

    isClickInsideUI(event) {
        return this.isPositionInsideUI(event.clientX, event.clientY);
    }

    isPositionInsideUI(x, y) {
        const gameContainer = document.getElementById('game-canvas');
        return document.elementFromPoint(x, y) !== gameContainer;
    }

    updateUI(sparklesCount, totalSparklesRate, fireworkCount, autoLauncherCount, nextCost) {
        const sparklesElement = document.getElementById('ressource-count');
        const isDetail = sparklesElement.classList.contains('expanded');

        // Icon provides context — no unit suffix needed
        const formatPill = (num) => {
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return String(num);
        };

        // Full locale-formatted number, label provides context
        const formatDetail = (num) => {
            return Math.floor(num).toLocaleString();
        };

        const sparkleTotalElements = sparklesElement.querySelectorAll('.sparkle-total');
        sparkleTotalElements.forEach(el => {
            el.textContent = isDetail
                ? formatDetail(sparklesCount)
                : formatPill(sparklesCount);
        });

        const gold = this.game.resourceManager.resources.gold;
        const goldTotalElements = sparklesElement.querySelectorAll('.gold-total');
        goldTotalElements.forEach(el => {
            el.textContent = isDetail
                ? formatDetail(gold.amount)
                : formatPill(Math.floor(gold.amount));
        });

        if (this.skillTree?.isOpen) {
            this.skillTree._updateResourceDisplay();
        }
        if (!sparklesElement._hasClickHandler) {
            sparklesElement._hasClickHandler = true;
            sparklesElement.addEventListener('click', () => {
                sparklesElement.classList.toggle('expanded');
            });
        }

        document.getElementById('firework-count').textContent = fireworkCount;

        // Update building counts and costs via data-driven loops
        this.updateBuildingCounts();
        this.updateBuildingCosts();

        // Update stats tab (throttled to every 250 ms)
        const now = performance.now();
        if (!this._lastStatsUpdate || now - this._lastStatsUpdate > 250) {
            this._lastStatsUpdate = now;
            this.updateStatsTab();
        }
    }

    updateStatsTab() {
        const st = this.game.statsTracker;
        if (!st) return;

        // Keep the section title's window-size note in sync with config
        const noteEl = document.querySelector('#stats-content .stats-note');
        if (noteEl) noteEl.textContent = `(${STATS_CONFIG.rollingWindowSeconds}s avg)`;

        const fmt = (n) => {
            if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
            return n.toFixed ? n.toFixed(0) : String(n);
        };
        const fmtRate = (n) => n.toFixed(2);

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        // ── Rolling rates ───────────────────────────────────────────────────
        const spsTot = st.getRollingRate('sparkles');
        const spsAuto = st.getRollingRate('sparkles', 'auto_launcher');
        const spsGen = st.getRollingRate('sparkles', 'resource_generator');
        const spsDrn = st.getRollingRate('sparkles', 'drone');
        const spsCrowdCatch = st.getRollingRate('sparkles', 'crowd_catch');
        const spsMnl = st.getRollingRate('sparkles', 'manual');
        const spsCheat = st.getRollingRate('sparkles', 'cheat');

        const gpsTot = st.getRollingRate('gold');
        const gpsCrowd = st.getRollingRate('gold', 'crowd');
        const gpsCheat = st.getRollingRate('gold', 'cheat');

        const fpsTot = st.getFireworksPerSecond();
        const fpsAuto = st.getFireworksPerSecond('auto_launcher');
        const fpsMnl = st.getFireworksPerSecond('manual');

        set('stat-sps-total', fmtRate(spsTot) + ' /s');
        set('stat-sps-auto', fmtRate(spsAuto) + ' /s');
        set('stat-sps-gen', fmtRate(spsGen) + ' /s');
        set('stat-sps-drone', fmtRate(spsDrn) + ' /s');
        set('stat-sps-crowd-catch', fmtRate(spsCrowdCatch) + ' /s');
        set('stat-sps-manual', fmtRate(spsMnl) + ' /s');
        set('stat-sps-cheat', fmtRate(spsCheat) + ' /s');

        const cheatSpRow = document.getElementById('stat-sps-cheat-row');
        if (cheatSpRow) cheatSpRow.style.display = spsCheat > 0 ? '' : 'none';

        set('stat-gps-total', fmtRate(gpsTot) + ' /s');
        set('stat-gps-crowd', fmtRate(gpsCrowd) + ' /s');
        set('stat-gps-cheat', fmtRate(gpsCheat) + ' /s');

        const cheatGRow = document.getElementById('stat-gps-cheat-row');
        if (cheatGRow) cheatGRow.style.display = gpsCheat > 0 ? '' : 'none';

        set('stat-fps-total', fmtRate(fpsTot) + ' /s');
        set('stat-fps-auto', fmtRate(fpsAuto) + ' /s');
        set('stat-fps-manual', fmtRate(fpsMnl) + ' /s');

        // ── Current state ───────────────────────────────────────────────────
        const g = this.game;
        const sparklesBal = g.resourceManager.resources.sparkles.amount;
        const goldBal = g.resourceManager.resources.gold.amount;
        const crowdSize = g.crowd ? g.crowd.people.length : 0;

        set('stat-bal-sparkles', fmt(sparklesBal) + ' sp');
        set('stat-bal-gold', fmt(goldBal) + ' G');
        set('stat-crowd-size', crowdSize);

        const getBldCount = (type) => g.buildingManager.getBuildingsByType(type).length;
        set('stat-bld-auto', getBldCount('AUTO_LAUNCHER'));
        set('stat-bld-gen', getBldCount('RESOURCE_GENERATOR'));
        set('stat-bld-drone', getBldCount('DRONE_HUB'));

        // ── Session totals ──────────────────────────────────────────────────
        set('stat-session-time', GameMetrics.formatDuration(st.getSessionDurationSeconds()));

        set('stat-sess-sparkles', fmt(st.sessionSparkles));
        set('stat-sess-sp-auto', fmt(st.sessionSparklesBySource['auto_launcher'] ?? 0));
        set('stat-sess-sp-gen', fmt(st.sessionSparklesBySource['resource_generator'] ?? 0));
        set('stat-sess-sp-drone', fmt(st.sessionSparklesBySource['drone'] ?? 0));
        set('stat-sess-sp-crowd-catch', fmt(st.sessionSparklesBySource['crowd_catch'] ?? 0));
        set('stat-sess-sp-manual', fmt(st.sessionSparklesBySource['manual'] ?? 0));

        set('stat-sess-gold', fmt(st.sessionGold));
        set('stat-sess-g-crowd', fmt(st.sessionGoldBySource['crowd'] ?? 0));

        set('stat-sess-fw', fmt(st.sessionFireworks));
        set('stat-sess-fw-manual', fmt(st.sessionFireworksBySource['manual'] ?? 0));
        set('stat-sess-fw-auto', fmt(st.sessionFireworksBySource['auto_launcher'] ?? 0));

        set('stat-sess-drone-parts', fmt(st.sessionDroneParticles));
        set('stat-sess-crowd-parts', fmt(st.sessionCrowdCatchParticles));

        // ── Lifetime records ────────────────────────────────────────────────
        set('firework-count', fmt(g.fireworkSystem.fireworkCount));
        set('stat-life-sparkles', fmt(st.lifetimeSparkles));
        set('stat-life-sp-auto', fmt(st.lifetimeSparklesBySource['auto_launcher'] ?? 0));
        set('stat-life-sp-gen', fmt(st.lifetimeSparklesBySource['resource_generator'] ?? 0));
        set('stat-life-sp-drone', fmt(st.lifetimeSparklesBySource['drone'] ?? 0));
        set('stat-life-sp-crowd-catch', fmt(st.lifetimeSparklesBySource['crowd_catch'] ?? 0));
        set('stat-life-sp-manual', fmt(st.lifetimeSparklesBySource['manual'] ?? 0));

        set('stat-life-gold', fmt(st.lifetimeGold));
        set('stat-life-drone-parts', fmt(st.lifetimeDroneParticles));
        set('stat-life-crowd-parts', fmt(st.lifetimeCrowdCatchParticles));

        set('stat-peak-sps', fmtRate(st.peakSPS) + ' /s');
        set('stat-peak-gps', fmtRate(st.peakGPS) + ' /s');
        set('stat-peak-fps', fmtRate(st.peakFPS) + ' /s');
        set('stat-peak-crowd', st.peakCrowdSize);
    }

    updateComponentsList(components, onUpdate, containerId = 'components-list') {
        const componentsList = document.getElementById(containerId);
        const patternOptions = patternDefinitions.map(({ key, displayName }) => (
            `<option value="${key}">${displayName}</option>`
        )).join('');
        componentsList.innerHTML = '';

        components.forEach((component, index) => {
            if (!('secondaryColor' in component)) {
                component.secondaryColor = '#00ff00';
            }
            if (!('enableColorGradient' in component)) {
                component.enableColorGradient = false;
            }
            if (!('gradientFinalColor' in component)) {
                component.gradientFinalColor = '#ff0000';
            }
            if (!('gradientStartTime' in component)) {
                component.gradientStartTime = 0.0;
            }
            if (!('gradientDuration' in component)) {
                component.gradientDuration = 1.0;
            }
            const componentDiv = document.createElement('div');
            componentDiv.classList.add('component');

            componentDiv.innerHTML = `
                <div class="component-header">
                    <span>Component ${index + 1}</span>
                    <button class="remove-component" data-index="${index}">Remove</button>
                </div>
                <div class="component-body">
                    <div class="recipes-option flex-row">
                        <div class="flex-item">
                            <label>Pattern:</label>
                            <select class="pattern-select" data-index="${index}">
                                ${patternOptions}
                            </select>
                        </div>
                        <div class="flex-item">
                            <label>Particle:</label>
                            <select class="shape-select" data-index="${index}">
                                <option value="sphere">Sphere</option>
                                <option value="star">Star</option>
                                <option value="ring">Ring</option>
                                <option value="crystalDroplet">Crystal Droplet</option>
                                <option value="sliceBurst">Slice Burst</option>
                            </select>
                        </div>
                    </div>                    
                    <div class="recipes-option">
                        <label>Primary Color:</label>
                        <input type="color" class="color-input" data-index="${index}" value="${component.color}">
                    </div>
                    <div class="recipes-option color-gradient-container">
                        <label>Color Gradient:</label>
                        <input type="checkbox" class="color-gradient-toggle" data-index="${index}" ${component.enableColorGradient ? 'checked' : ''}>
                    </div>
                    <div class="recipes-option color-gradient-options" style="display: ${component.enableColorGradient ? 'block' : 'none'};">
                        <label>Gradient Final Color:</label>
                        <input type="color" class="gradient-final-color-input" data-index="${index}" value="${component.gradientFinalColor}">
                        <label>Gradient Start Time:</label>
                        <input type="range" class="gradient-start-time-select" data-index="${index}" min="0" max="1" step="0.01" value="${component.gradientStartTime}">
                        <label>Gradient Duration :</label>
                        <input type="range" class="gradient-duration-select" data-index="${index}" min="0" max="1" step="0.01" value="${component.gradientDuration}">
                    </div>
                    <div class="recipes-option secondary-color-container" style="display:none;">
                        <label>Secondary Color:</label>
                        <input type="color" class="secondary-color-input" data-index="${index}" value="${component.secondaryColor}">
                    </div>
                    <div class="recipes-option">
                        <label>Shell Size:</label>
                        <input type="range" class="size-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.size.min}" max="${COMPONENT_PROPERTY_RANGES.size.max}" step="${COMPONENT_PROPERTY_RANGES.size.step}" value="${component.size}">
                    </div>
                    <div class="recipes-option">
                        <label>Lifetime:</label>
                        <input type="range" class="lifetime-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.lifetime.min}" max="${COMPONENT_PROPERTY_RANGES.lifetime.max}" step="${COMPONENT_PROPERTY_RANGES.lifetime.step}" value="${component.lifetime}">
                    </div>
                    <div class="recipes-option">
                        <label>Spread:</label>
                        <input type="range" class="spread-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.spread.min}" max="${COMPONENT_PROPERTY_RANGES.spread.max}" step="${COMPONENT_PROPERTY_RANGES.spread.step}" value="${component.spread}">
                    </div>
                </div>
            `;
            componentsList.appendChild(componentDiv);

            const header = componentDiv.querySelector('.component-header');
            const body = componentDiv.querySelector('.component-body');

            header.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-component')) return;
                body.style.display = body.style.display === 'none' ? 'grid' : 'none';
            });

            const patternSelect = componentDiv.querySelector('.pattern-select');
            patternSelect.value = component.pattern;

            const shapeSelect = componentDiv.querySelector('.shape-select');
            shapeSelect.value = component.shape;
            const colorInput = componentDiv.querySelector('.color-input');
            const colorGradientContainer = componentDiv.querySelector('.color-gradient-container');
            const colorGradientToggle = componentDiv.querySelector('.color-gradient-toggle');
            const colorGradientOptions = componentDiv.querySelector('.color-gradient-options');
            const gradientFinalColorInput = componentDiv.querySelector('.gradient-final-color-input');
            const gradientStartTimeSelect = componentDiv.querySelector('.gradient-start-time-select');
            const gradientDurationSelect = componentDiv.querySelector('.gradient-duration-select');
            const secondaryColorContainer = componentDiv.querySelector('.secondary-color-container');
            const secondaryColorInput = componentDiv.querySelector('.secondary-color-input');

            const sizeSelect = componentDiv.querySelector('.size-select');
            const lifetimeSelect = componentDiv.querySelector('.lifetime-select');
            const spreadSelect = componentDiv.querySelector('.spread-select');

            const updateSecondaryColorVisibility = () => {
                if (patternSelect.value === 'helix' || patternSelect.value === 'christmasTree' || patternSelect.value === 'snowflake') {
                    secondaryColorContainer.style.display = 'block';
                } else {
                    secondaryColorContainer.style.display = 'none';
                }
            };

            updateSecondaryColorVisibility();

            patternSelect.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].pattern = e.target.value;
                updateSecondaryColorVisibility();
                onUpdate();
            });

            shapeSelect.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].shape = e.target.value;
                onUpdate();
            });
            colorInput.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].color = e.target.value;
                onUpdate();
            });

            colorGradientToggle.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].enableColorGradient = e.target.checked;
                colorGradientOptions.style.display = e.target.checked ? 'block' : 'none';
                onUpdate();
            });

            gradientFinalColorInput.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].gradientFinalColor = e.target.value;
                onUpdate();
            });

            gradientStartTimeSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                const value = parseFloat(e.target.value);
                components[idx].gradientStartTime = value;
                // Update the value display
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay && valueDisplay.classList.contains('value-display')) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                onUpdate();
            });

            gradientDurationSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                const value = parseFloat(e.target.value);
                components[idx].gradientDuration = value;
                // Update the value display
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay && valueDisplay.classList.contains('value-display')) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                onUpdate();
            });

            secondaryColorInput.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].secondaryColor = e.target.value;
                onUpdate();
            });

            sizeSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].size = parseFloat(e.target.value);
                onUpdate();
            });

            lifetimeSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].lifetime = parseFloat(e.target.value);
                onUpdate();
            });

            spreadSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].spread = parseFloat(e.target.value);
                onUpdate();
            });

            const removeButton = componentDiv.querySelector('.remove-component');
            removeButton.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                components.splice(idx, 1);
                this.updateComponentsList(components, onUpdate, containerId);
                onUpdate();
            });
        });
    }

    updateRecipeList(recipes, onSelect) {
        const recipeList = document.getElementById('recipe-list');
        recipeList.innerHTML = '';

        recipes.forEach((recipe, index) => {
            const recipeDiv = document.createElement('div');
            recipeDiv.classList.add('recipe-item');
            recipeDiv.innerHTML = `
                <span>${recipe.name}</span>
                <button class="select-recipe" data-index="${index}">Select</button>
            `;
            recipeList.appendChild(recipeDiv);

            const selectButton = recipeDiv.querySelector('.select-recipe');
            selectButton.addEventListener('click', () => onSelect(index));
        });
    }

    updateLauncherList(launchers, selectedBuildingId, onSelect) {
        const statsDiv = document.getElementById('auto_launcher-stats');
        const launcherList = document.getElementById('auto_launcher-list');
        const spreadBtn = document.getElementById('spread-launchers');
        const randomizeBtn = document.getElementById('randomize-launcher-recipes');

        const hasLaunchers = launchers.length > 0;

        if (statsDiv) statsDiv.style.display = hasLaunchers ? '' : 'none';
        if (spreadBtn) spreadBtn.style.display = hasLaunchers ? '' : 'none';
        if (randomizeBtn) randomizeBtn.style.display = hasLaunchers ? '' : 'none';

        if (!launcherList) return;
        launcherList.style.display = hasLaunchers ? '' : 'none';
        launcherList.innerHTML = '';

        if (!hasLaunchers) return;

        // Show global spawn-rate stat once at the top
        if (statsDiv) {
            const baseInterval = BUILDING_TYPES.AUTO_LAUNCHER.baseSpawnInterval;
            const spawnInterval = baseInterval * (this.game.launcherStats?.spawnIntervalMultiplier ?? 1);
            statsDiv.innerHTML = `<div class="launcher-details"><p>Spawn Rate: Every ${spawnInterval.toFixed(1)}s</p></div>`;
        }

        launchers.forEach((launcher, index) => {
            const launcherDiv = document.createElement('div');
            launcherDiv.classList.add('launcher-card');
            launcherDiv.dataset.buildingId = launcher.id;

            if (launcher.id === selectedBuildingId) {
                launcherDiv.classList.add('selected');
            }

            launcherDiv.innerHTML = `
                <h3>Auto-Launcher ${index + 1}</h3>
                ${this.game.progression.isUnlocked('recipes_tab') ? `
                <div class="recipes-option">
                    <label>Assign Recipe:</label>
                    <select class="recipe-select" data-building-id="${launcher.id}">
                        <option value="">-- Shoot a random recipe --</option>
                        ${this.game.recipes.map((recipe, rIndex) => `
                            <option value="${rIndex}" ${launcher.assignedRecipeIndex === rIndex ? 'selected' : ''}>${recipe.name}</option>
                        `).join('')}
                    </select>
                </div>
                ` : `
                <div class="recipes-option">
                    <label>Color:</label>
                    <input type="color" class="launcher-color-input" data-building-id="${launcher.id}" value="${launcher.colorOverride || '#ffffff'}">
                </div>
                <div class="recipes-option">
                    <label>Pattern:</label>
                    <select class="launcher-pattern-select" data-building-id="${launcher.id}">
                        ${(this.game.unlockedPatternKeys || []).map(key => `
                            <option value="${key}" ${launcher.patternOverride === key ? 'selected' : ''}>${patternDisplayNames[key] || key}</option>
                        `).join('')}
                    </select>
                </div>
                `}
            `;
            launcherList.appendChild(launcherDiv);

            if (this.game.progression.isUnlocked('recipes_tab')) {
                const recipeSelect = launcherDiv.querySelector('.recipe-select');
                if (recipeSelect) {
                    recipeSelect.addEventListener('change', (e) => {
                        const buildingId = e.target.getAttribute('data-building-id');
                        const building = this.game.buildingManager.getBuildingById(buildingId);
                        if (building) {
                            const selectedRecipeIndex = parseInt(e.target.value);
                            if (!isNaN(selectedRecipeIndex)) {
                                building.assignedRecipeIndex = selectedRecipeIndex;
                            } else {
                                building.assignedRecipeIndex = null;
                            }
                            this.game.saveProgress();
                        }
                    });
                }
            } else {
                const colorInput = launcherDiv.querySelector('.launcher-color-input');
                if (colorInput) {
                    colorInput.addEventListener('input', (e) => {
                        const buildingId = e.target.getAttribute('data-building-id');
                        const building = this.game.buildingManager.getBuildingById(buildingId);
                        if (building) {
                            building.colorOverride = e.target.value;
                            this.game.saveProgress();
                        }
                    });
                }

                const patternSelect = launcherDiv.querySelector('.launcher-pattern-select');
                if (patternSelect) {
                    patternSelect.addEventListener('change', (e) => {
                        const buildingId = e.target.getAttribute('data-building-id');
                        const building = this.game.buildingManager.getBuildingById(buildingId);
                        if (building) {
                            building.patternOverride = e.target.value;
                            this.game.saveProgress();
                        }
                    });
                }
            }

            launcherDiv.addEventListener('click', () => {
                onSelect(launcher.id);
                if (launcher && launcher.x !== undefined) {
                    this.game.setCameraTarget(launcher.x);
                    const building = this.game.buildingManager.getBuildingById(launcher.id);
                    if (building) {
                        building.highlight(LAUNCHER_WORLD_HIGHLIGHT_DURATION);
                    }
                }
            });
        });
    }

    getReadableShape(shape) {
        switch (shape) {
            case 'sphere':
                return 'Sphere';
            case 'star':
                return 'Star';
            case 'ring':
                return 'Ring';
            case 'crystalDroplet':
                return 'Crystal Droplet';
            case 'sliceBurst':
                return 'Slice Burst';
            default:
                return 'Sphere';
        }
    }

    renderUpgrades() {
        // When the skill tree is open, refresh it and skip the legacy panel
        if (this.skillTree?.isOpen) {
            this.skillTree.refresh();
            return;
        }

        const availableContainer = document.getElementById('upgrades-available');
        const ownedContainer = document.getElementById('upgrades-owned');
        if (!availableContainer || !ownedContainer) return;

        availableContainer.innerHTML = '';
        ownedContainer.innerHTML = '';

        const progression = this.game.progression;
        for (const def of progression.getAllUpgradeDefs()) {
            const { visible } = progression.isVisible(def.id, this.game);
            if (!visible) continue;

            const level = progression.getUpgradeLevel(def.id);
            const maxLevel = def.maxLevel ?? 1;

            if (level > 0) {
                const ownedCard = document.createElement('div');
                ownedCard.className = 'upgrade-card purchased';

                const oTitle = document.createElement('div');
                oTitle.textContent = `${def.name} (Lv ${level})`;
                ownedCard.appendChild(oTitle);

                const oDesc = document.createElement('div');
                oDesc.textContent = def.desc;
                ownedCard.appendChild(oDesc);

                ownedContainer.appendChild(ownedCard);
            }

            if (level < maxLevel) {
                const { ok: canBuy, reason } = progression.canPurchase(def.id, this.game);
                // Show as locked (no buy button) when a hard prerequisite isn't met — i.e.
                // the reason isn't just affordability.
                const isPrereqLocked = !canBuy && reason !== `Not enough ${def.currency}`;

                const availCard = document.createElement('div');
                availCard.className = `upgrade-card${isPrereqLocked ? ' locked' : ''}`;

                const aTitle = document.createElement('div');
                aTitle.textContent = `${def.name} (Lv ${level + 1})`;
                availCard.appendChild(aTitle);

                const aDesc = document.createElement('div');
                aDesc.textContent = def.desc;
                availCard.appendChild(aDesc);

                if (isPrereqLocked) {
                    const aLock = document.createElement('div');
                    aLock.className = 'upgrade-lock-reason';
                    aLock.textContent = `🔒 ${reason}`;
                    availCard.appendChild(aLock);
                } else {
                    const nextCost = progression.getUpgradeCost(def.id);
                    const aCost = document.createElement('div');
                    aCost.textContent = `Cost: ${nextCost.toLocaleString()} ${def.currency}`;
                    availCard.appendChild(aCost);

                    const btn = document.createElement('button');
                    btn.textContent = 'Buy';
                    btn.addEventListener('click', () => this.game.buyUpgrade(def.id));
                    availCard.appendChild(btn);
                }

                availableContainer.appendChild(availCard);
            }
        }
    }


    _formatSparkleCount(n) {
        if (n < 1000) return Math.floor(n).toString();
        const tiers = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
        for (const [div, suffix] of tiers) {
            if (n >= div) {
                const val = n / div;
                let str;
                if (val < 10) str = val.toFixed(2);
                else if (val < 100) str = val.toFixed(1);
                else str = Math.floor(val).toString();
                str = str.replace(/\.?0+$/, '');
                return str + suffix;
            }
        }
    }

    showFloatingSparkle(screenX, screenY, amount, rocketColor = null) {
        if (!this.showFloatingSparkleEnabled) return;
        // If an active floating sparkle exists, update amount and trigger a shake.
        if (this.activeFloatingSparkle && document.body.contains(this.activeFloatingSparkle)) {
            const elem = this.activeFloatingSparkle;

            let inner = elem.querySelector('.floating-sparkle-inner');
            if (!inner) {
                inner = document.createElement('span');
                inner.className = 'floating-sparkle-inner';
                inner.textContent = elem.textContent;
                elem.textContent = '';
                elem.appendChild(inner);
            }

            const currentAmount = parseFloat(elem.dataset.amount || '0');
            const newAmount = currentAmount + amount;

            elem.dataset.amount = newAmount;
            inner.textContent = `+${this._formatSparkleCount(newAmount)}`;

            elem.style.left = `${screenX}px`;
            elem.style.top = `${screenY}px`;
            if (rocketColor) {
                elem.style.color = typeof rocketColor === 'string' ? rocketColor : `rgb(${Math.round(rocketColor.r * 255)}, ${Math.round(rocketColor.g * 255)}, ${Math.round(rocketColor.b * 255)})`;
            }

            const anims = elem.getAnimations();
            let timeLeft = 1500;
            if (anims.length > 0) {
                const anim = anims[0];
                anim.currentTime = Math.max(50, anim.currentTime - 250);
                timeLeft = 1500 - anim.currentTime;
            }

            if (this.floatingSparkleTimeout) {
                clearTimeout(this.floatingSparkleTimeout);
            }

            const remove = () => {
                elem.remove();
                if (this.activeFloatingSparkle === elem) {
                    this.activeFloatingSparkle = null;
                    this.floatingSparkleTimeout = null;
                }
            };
            elem.onanimationend = (e) => { if (e.target === elem) remove(); };
            this.floatingSparkleTimeout = setTimeout(remove, timeLeft + 100);

            // trigger shake on inner span. Clear any previous timeout so
            // overlapping removals don't cancel a newly-started shake.
            if (inner._shakeTimeout) {
                clearTimeout(inner._shakeTimeout);
                inner._shakeTimeout = null;
            }
            inner.classList.remove('shake');
            void inner.offsetWidth; // force reflow to restart animation
            inner.classList.add('shake');
            inner._shakeTimeout = setTimeout(() => {
                inner.classList.remove('shake');
                inner._shakeTimeout = null;
            }, 600);
            const rect = elem.getBoundingClientRect();
            const burstX = rect.left + rect.width / 2;
            const burstY = rect.top + rect.height / 2;
            this.emitFloatingSparkleNumberBurst(burstX, burstY, rocketColor);
            return;
        }

        // Create new floating sparkle element with inner span so we can animate shake
        const elem = document.createElement('div');
        elem.className = 'floating-sparkle';
        elem.dataset.amount = amount;

        const inner = document.createElement('span');
        inner.className = 'floating-sparkle-inner';
        inner.textContent = `+${this._formatSparkleCount(amount)}`;
        elem.appendChild(inner);

        elem.style.left = `${screenX}px`;
        elem.style.top = `${screenY}px`;
        if (rocketColor) {
            elem.style.color = typeof rocketColor === 'string' ? rocketColor : `rgb(${Math.round(rocketColor.r * 255)}, ${Math.round(rocketColor.g * 255)}, ${Math.round(rocketColor.b * 255)})`;
        }

        document.body.appendChild(elem);
        this.emitFloatingSparkleNumberBurst(screenX, screenY, rocketColor);

        const remove = () => {
            elem.remove();
            this.activeFloatingSparkle = null;
            this.floatingSparkleTimeout = null;
        };
        elem.onanimationend = (e) => { if (e.target === elem) remove(); };
        this.floatingSparkleTimeout = setTimeout(remove, 1500);

        this.activeFloatingSparkle = elem;

        // initial spawn shake — clear any previous timeout and schedule removal
        if (inner._shakeTimeout) {
            clearTimeout(inner._shakeTimeout);
            inner._shakeTimeout = null;
        }
        inner.classList.add('shake');
        inner._shakeTimeout = setTimeout(() => {
            inner.classList.remove('shake');
            inner._shakeTimeout = null;
        }, 600);
    }

    initializeUnlockStates() {
        this.hideSparkleCounter();
        this.hideTabMenu();
        this.hideCollapseButton();
        this.hideAllTabs();

        const p = this.game.progression;
        const fc = this.game.firstClickStates;

        if (p.isUnlocked('sparkle_counter')) this.showSparkleCounter();

        if (p.isUnlocked('tab_menu')) {
            this.showTabMenu();
            this.showCollapseButton();
            if (!fc.tabMenu) this.addGlimmer('tabMenu');
        }

        if (p.getUpgradeLevel('auto_launcher') > 0) {
            this.showBuildingsTab();
            if (!fc.buildingsTab) this.addGlimmer('buildingsTab');
        }

        if (p.isUnlocked('upgrades_tab')) {
            this.showUpgradesTab();
            if (!fc.upgradesTab) this.addGlimmer('upgradesTab');
        }

        if (p.isUnlocked('crowds_tab')) {
            this.showCrowdsTab();
            if (!fc.crowdsTab) this.addGlimmer('crowdsTab');
        }

        if (p.isUnlocked('recipes_tab')) this.showRecipesTab();

        this.updateBuildingTypeVisibility();
    }

    hideAllTabs() {
        for (const tab of TABS) {
            document.getElementById(`${tab.id}-tab`)?.classList.add('unlock-hidden');
        }
    }

    hideSparkleCounter() {
        const sparkleCounter = document.getElementById('ressource-count');
        if (sparkleCounter) {
            sparkleCounter.classList.add('unlock-hidden');
        }
    }

    showSparkleCounter() {
        const sparkleCounter = document.getElementById('ressource-count');
        if (sparkleCounter) {
            sparkleCounter.classList.remove('unlock-hidden');
        }
    }

    hideTabMenu() {
        const tabs = document.querySelector('.tabs');
        if (tabs) {
            tabs.classList.add('unlock-hidden');
        }
    }

    showTabMenu() {
        const tabs = document.querySelector('.tabs');
        if (tabs) {
            tabs.classList.remove('unlock-hidden');
        }

        if (this.game && this.game.progression && this.game.progression.isUnlocked('recipes_tab')) {
            this.showRecipesTab();
        }
        this.showStatsTab();
        this.showSettingsTab();
        this.showCheatsTab();
    }

    hideCollapseButton() {
        const collapseButton = document.getElementById('collapse-button');
        if (collapseButton) {
            collapseButton.classList.add('unlock-hidden');
        }
    }

    showCollapseButton() {
        const collapseButton = document.getElementById('collapse-button');
        if (collapseButton) {
            collapseButton.classList.remove('unlock-hidden');
        }
    }

    showRecipesTab() {
        const recipesTab = document.getElementById('recipes-tab');
        if (recipesTab) {
            recipesTab.classList.remove('unlock-hidden');
        }
    }

    showStatsTab() {
        const statsTab = document.getElementById('stats-tab');
        if (statsTab) {
            statsTab.classList.remove('unlock-hidden');
        }
    }

    showSettingsTab() {
        const settingsTab = document.getElementById('settings-tab');
        if (settingsTab) {
            settingsTab.classList.remove('unlock-hidden');
        }
    }

    showCheatsTab() {
        const cheatsTab = document.getElementById('cheats-tab');
        if (cheatsTab) {
            cheatsTab.classList.remove('unlock-hidden');
        }
    }

    showBuildingsTab() {
        const buildingsTab = document.getElementById('buildings-tab');
        if (buildingsTab) {
            buildingsTab.classList.remove('unlock-hidden');
        }
    }

    showUpgradesTab() {
        const upgradesTab = document.getElementById('upgrades-tab');
        if (upgradesTab) {
            upgradesTab.classList.remove('unlock-hidden');
        }
    }

    showCrowdsTab() {
        const crowdTab = document.getElementById('crowd-tab');
        if (crowdTab) {
            crowdTab.classList.remove('unlock-hidden');
        }
    }

    addGlimmer(elementType) {
        const elementMap = {
            sparkleCounter: 'ressource-count',
            tabMenu: 'stats-tab', // Use stats tab as the first visible tab since recipes might be hidden
            buildingsTab: 'buildings-tab',
            upgradesTab: 'upgrades-tab',
            crowdsTab: 'crowd-tab'
        };

        const elementId = elementMap[elementType];
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.classList.add('unlock-glimmer');
                this.setupFirstClickListener(element, elementType);
            }
        }
    }

    removeGlimmer(elementType) {
        const elementMap = {
            sparkleCounter: 'ressource-count',
            tabMenu: 'stats-tab',
            buildingsTab: 'buildings-tab',
            upgradesTab: 'upgrades-tab',
            crowdsTab: 'crowd-tab'
        };

        const elementId = elementMap[elementType];
        if (elementId) {
            const element = document.getElementById(elementId);
            if (element) {
                element.classList.remove('unlock-glimmer');
            }
        }
    }

    setupFirstClickListener(element, elementType) {
        const clickHandler = () => {
            this.game.onFirstClick(elementType);
            element.removeEventListener('click', clickHandler);
        };
        element.addEventListener('click', clickHandler);
    }

    focusBuildingInUI(building) {
        const tabContent = document.getElementById('buildings-content');
        if (!tabContent.classList.contains('active')) {
            this.toggleTab('buildings');
        }
        this.switchBuildingType(building.type);

        // Wait for DOM to update
        setTimeout(() => {
            const buildingDiv = document.querySelector(`[data-building-id="${building.id}"]`);
            if (buildingDiv) {
                buildingDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Highlight effect
                buildingDiv.style.transition = 'box-shadow 0.3s ease, background-color 0.3s ease';
                const originalBg = buildingDiv.style.backgroundColor;
                const originalShadow = buildingDiv.style.boxShadow;

                buildingDiv.style.backgroundColor = 'rgba(255, 215, 0, 0.2)';
                buildingDiv.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.8)';

                setTimeout(() => {
                    buildingDiv.style.backgroundColor = originalBg;
                    buildingDiv.style.boxShadow = originalShadow;
                    setTimeout(() => {
                        buildingDiv.style.transition = '';
                    }, 300);
                }, 1500);
            }
        }, 50);
    }

    switchBuildingType(buildingType) {
        // Update tab active states
        const tabs = document.querySelectorAll('.building-type-tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-building-type') === buildingType) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update section active states
        const sections = document.querySelectorAll('.building-section');
        sections.forEach(section => {
            if (section.getAttribute('data-building-type') === buildingType) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        // Update the building lists
        this.updateBuildingListByType(buildingType);
    }

    updateBuildingListByType(buildingType) {
        const buildings = this.game.buildingManager.getBuildingsByType(buildingType);

        if (buildingType === 'AUTO_LAUNCHER') {
            this.updateLauncherList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id)
            );
        } else if (buildingType === 'RESOURCE_GENERATOR') {
            this.updateGeneratorList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id)
            );
        } else if (buildingType === 'DRONE_HUB') {
            this.updateDroneHubList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id)
            );
        }

        // Update counts
        this.updateBuildingCounts();
    }

    updateGeneratorList(generators, selectedBuildingId, onSelect) {
        const statsDiv = document.getElementById('resource_generator-stats');
        if (!statsDiv) return;

        if (generators.length === 0) {
            statsDiv.innerHTML = '';
            return;
        }

        const baseRate = BUILDING_TYPES.RESOURCE_GENERATOR.baseProductionRate;
        const productionRate = baseRate * (this.game.generatorStats?.productionRateMultiplier ?? 1);
        const totalRate = productionRate * generators.length;
        statsDiv.innerHTML = `
            <div class="launcher-details">
                <p>Production per generator: ${productionRate.toFixed(1)} sparkles/s</p>
                <p>Total production: ${totalRate.toFixed(1)} sparkles/s</p>
            </div>
        `;
    }

    updateDroneHubList(hubs, selectedBuildingId, onSelect) {
        const statsDiv = document.getElementById('drone_hub-stats');
        if (!statsDiv) return;

        if (hubs.length === 0) {
            statsDiv.innerHTML = '';
            return;
        }

        const baseInterval = BUILDING_TYPES.DRONE_HUB.baseSpawnInterval;
        const spawnInterval = baseInterval * (this.game.droneHubStats?.spawnIntervalMultiplier ?? 1);
        const droneLifetime = BUILDING_TYPES.DRONE_HUB.baseDroneLifetime * (this.game.droneStats?.lifetimeMultiplier ?? 1);
        const droneSpeed = BUILDING_TYPES.DRONE_HUB.baseDroneSpeed * (this.game.droneStats?.speedMultiplier ?? 1);
        statsDiv.innerHTML = `
            <div class="launcher-details">
                <p>Spawn interval: ${spawnInterval.toFixed(1)}s</p>
                <p>Drone lifetime: ${droneLifetime.toFixed(1)}s</p>
                <p>Drone speed: ${droneSpeed.toFixed(0)}</p>
            </div>
        `;
    }

    updateBuildingCounts() {
        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            const count = this.game.buildingManager.getBuildingsByType(key).length;
            const el = document.getElementById(`${type.id}-count`);
            if (el) el.textContent = count;
        }
    }

    updateBuildingCosts() {
        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            const cost = this.game.buildingManager.getBuyCost(key);
            const el = document.getElementById(`${type.id}-cost`);
            if (el) el.textContent = cost;
            // Update disabled state on the buy button based on current resources
            const btn = document.getElementById(`buy-${type.id}`);
            if (btn) {
                const balance = this.game.resourceManager.resources[type.currency]?.amount ?? 0;
                const unaffordable = balance < cost;
                
                let limitReached = false;
                if (key === 'CATAPULT') {
                    const count = this.game.buildingManager.getBuildingsByType('CATAPULT').length;
                    limitReached = count >= (this.game.catapultStats?.maxCatapults ?? 1);
                    
                    if (limitReached) {
                        const costEl = document.getElementById(`${type.id}-cost`);
                        if (costEl) costEl.textContent = 'MAX';
                    }
                }

                btn.disabled = unaffordable || limitReached;
            }
        }
    }

    updateBuildingTypeVisibility() {
        let activeBuildingType = document.querySelector('.building-type-tab.active')?.getAttribute('data-building-type');

        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            const tab = document.querySelector(`.building-type-tab[data-building-type="${key}"]`);
            if (!tab) continue;

            const unlocked = this.game.isBuildingTypeUnlocked(key);
            tab.style.display = unlocked ? 'block' : 'none';

            // If the active section belongs to a now-locked type, fall back to AUTO_LAUNCHER
            if (activeBuildingType === key && !unlocked) {
                this.switchBuildingType('AUTO_LAUNCHER');
                activeBuildingType = 'AUTO_LAUNCHER';
            }
        }
    }

    /**
     * Reveal any tab or building sub-tab whose unlockId matches.
     * Called by FireworkGame._handleUnlock() instead of direct DOM manipulation.
     */
    handleUnlock(unlockId) {
        // Reveal matching top-level tabs
        for (const tab of TABS) {
            if (tab.unlockId === unlockId) {
                document.getElementById(`${tab.id}-tab`)?.classList.remove('unlock-hidden');
            }
        }
        // Reveal matching building sub-tabs
        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            if (type.unlockId === unlockId) {
                const btn = document.querySelector(`.building-type-tab[data-building-type="${key}"]`);
                if (btn) btn.style.display = 'block';
            }
        }
    }
}

export default UIManager;
