import { GAME_BOUNDS, BACKGROUND_IMAGES, DEFAULT_RECIPE_COMPONENTS, COMPONENT_PROPERTY_RANGES, PARTICLE_TYPES, STATS_CONFIG, LAUNCHER_WORLD_HIGHLIGHT_DURATION, PATTERN_DISPLAY_NAMES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import StatsTracker from '../stats/StatsTracker.js';

class UIManager {
    constructor(game) {
        this.game = game;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.isScrollDragReady = false;
        this.hasScrolledDuringDrag = false;
        this.scrollDragHoldTimeout = null;
        this.scrollDragStartX = 0;
        this.minCameraDragHoldMs = 180;
        this.draggingLauncher = null;
        this.lastPointerX = 0;
        this.grabCursorWorldX = 0;
        this.grabCursorWorldY = 0;
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
    }

    initializeRendererEvents() {
        const gameCanvas = document.getElementById('game-canvas');
        gameCanvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    }

    bindUIEvents() {
        const addComponentButtons = [
            document.getElementById('add-component'),
            document.getElementById('creator-add-component')
        ];
        addComponentButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            const defaultComponent = { ...DEFAULT_RECIPE_COMPONENTS[0] };
            this.game.currentRecipeComponents.push(defaultComponent);
            this.game.updateComponentsList(btn.id === 'creator-add-component' ? 'creator-components-list' : 'components-list');
            this.game.saveCurrentRecipeComponents();
        }));

        const saveRecipeButtons = [
            document.getElementById('creator-save-recipe'),
            document.getElementById('save-recipe')
        ];
        saveRecipeButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            this.game.saveCurrentRecipe();
        }));

        const randomizeRecipeButtons = [
            document.getElementById('creator-randomize-recipe'),
            document.getElementById('randomize-recipe')
        ];
        randomizeRecipeButtons.forEach(btn => btn && btn.addEventListener('click', () => {
            this.game.randomizeRecipe();
        }));

        const eraseRecipeButtons = [
            document.getElementById('creator-erase-recipes'),
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


        document.getElementById('buy-auto-launcher').addEventListener('click', () => {
            this.game.buyAutoLauncher();
        });

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

        document.getElementById('recipes-tab').addEventListener('click', () => {
            this.toggleTab('recipes');
        });
        document.getElementById('stats-tab').addEventListener('click', () => {
            this.toggleTab('stats');
        });
        document.getElementById('crowd-tab').addEventListener('click', () => {
            this.toggleTab('crowd');
        });
        document.getElementById('buildings-tab').addEventListener('click', () => {
            this.toggleTab('buildings');
            this.game.updateLauncherList();
            this.updateBuildingCosts();
            this.updateBuildingTypeVisibility();
        });
        const settingsTabBtn = document.getElementById('settings-tab');
        if (settingsTabBtn) {
            settingsTabBtn.addEventListener('click', () => {
                this.toggleTab('settings');
            });
        }
        const upgradesTabBtn = document.getElementById('upgrades-tab');
        if (upgradesTabBtn) {
            upgradesTabBtn.addEventListener('click', () => {
                this.toggleTab('upgrades');
                this.renderUpgrades();
            });
        }
        document.getElementById('background-tab').addEventListener('click', () => {
            this.toggleTab('background');
        });

        const cheatsTabBtn = document.getElementById('cheats-tab');
        if (cheatsTabBtn) {
            cheatsTabBtn.addEventListener('click', () => {
                this.toggleTab('cheats');
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

        const ppToggle = document.getElementById('toggle-post-processing');
        if (ppToggle) {
            ppToggle.checked = !!this.game.renderer2D.usePostProcessing;
            ppToggle.addEventListener('change', (e) => {
                this.game.togglePostProcessing(e.target.checked);
            });
        }

        document.addEventListener('wheel', this.handleWheelScroll, { passive: false });

        this.updateBackgroundPicker();

        document.getElementById('spread-launchers').addEventListener('click', () => {
            this.game.spreadLaunchers();
        });

        document.getElementById('upgrade-all-launchers').addEventListener('click', () => {
            this.game.upgradeAllLaunchers();
        });

        document.getElementById('randomize-launcher-recipes').addEventListener('click', () => {
            this.game.randomizeLauncherRecipes();
        });

        const advButton = document.getElementById('advanced-creator');
        if (advButton) {
            const unlocked = true; //localStorage.getItem('advancedCreatorUnlocked') === 'true';
            advButton.style.display = unlocked ? 'inline-block' : 'none';
            advButton.addEventListener('click', () => {
                if (unlocked) this.game.openAdvancedCreator();
            });
        }

        // Building type tab switching
        const buildingTypeTabs = document.querySelectorAll('.building-type-tab');
        buildingTypeTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const buildingType = e.target.getAttribute('data-building-type');
                this.switchBuildingType(buildingType);
            });
        });

        // Buy buttons for new building types
        document.getElementById('buy-resource-generator').addEventListener('click', () => {
            this.game.buyBuilding('RESOURCE_GENERATOR');
        });

        document.getElementById('buy-efficiency-booster').addEventListener('click', () => {
            this.game.buyBuilding('EFFICIENCY_BOOSTER');
        });

        document.getElementById('upgrade-all-generators').addEventListener('click', () => {
            this.game.upgradeAllBuildingsByType('RESOURCE_GENERATOR');
        });

        document.getElementById('upgrade-all-boosters').addEventListener('click', () => {
            this.game.upgradeAllBuildingsByType('EFFICIENCY_BOOSTER');
        });

        document.getElementById('buy-drone-hub').addEventListener('click', () => {
            this.game.buyBuilding('DRONE_HUB');
        });

        document.getElementById('upgrade-all-drone-hubs').addEventListener('click', () => {
            this.game.upgradeAllBuildingsByType('DRONE_HUB');
        });

        const backButton = document.getElementById('back-to-game');
        if (backButton) {
            backButton.addEventListener('click', () => {
                this.game.closeAdvancedCreator();
            });
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

        const volumeSlider = document.getElementById('music-volume');
        const volumeValue = document.getElementById('volume-value');
        if (volumeSlider && volumeValue) {
            const savedVolume = localStorage.getItem('musicVolume');
            if (savedVolume !== null) {
                const volume = parseInt(savedVolume);
                volumeSlider.value = volume;
                volumeValue.textContent = volume;
                this.game.audioManager.setVolume(volume / 100);
            }

            volumeSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                volumeValue.textContent = volume;
                this.game.audioManager.setVolume(volume / 100);
                localStorage.setItem('musicVolume', volume);
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
            this.scrollDragStartX = event.clientX;

            if (this.scrollDragHoldTimeout) {
                clearTimeout(this.scrollDragHoldTimeout);
            }
            this.scrollDragHoldTimeout = setTimeout(() => {
                this.isScrollDragReady = true;
                this.emitGrabModeBurst(worldPos.x, worldPos.y);
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
                0, // glowStrength
                0, // blurStrength
                updateFn, // update function
                false, // enableColorGradient
                null, // gradientFinalColor
                0.0, // gradientStartTime
                1.0, // gradientDuration
                PARTICLE_TYPES.UI_EFFECT
            );
        }
    }

    pointerMoveHandler(e) {
        if (this.isDragging && this.draggingLauncher) {
            e.preventDefault();
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.grabCursorWorldX = worldPos.x;
            this.grabCursorWorldY = worldPos.y;
            const clampedX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(worldPos.x, GAME_BOUNDS.LAUNCHER_MAX_X));

            this.draggingLauncher.setPosition(clampedX, this.draggingLauncher.y);
            this.game.saveProgress();
        } else if (this.isScrollDragging) {
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            this.grabCursorWorldX = worldPos.x;
            this.grabCursorWorldY = worldPos.y;

            if (!this.isScrollDragReady) {
                this.lastPointerX = e.clientX;
                return;
            }

            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 1;

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
        if (this.isDragging || this.isScrollDragging) {
            if (this.scrollDragHoldTimeout) {
                clearTimeout(this.scrollDragHoldTimeout);
                this.scrollDragHoldTimeout = null;
            }


            if (this.isScrollDragging) {
                const shouldLaunch = !this.hasScrolledDuringDrag && !this.game.isClickInsideUI(e);
                if (shouldLaunch) {
                    const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
                    const res = this.game.launchFireworkAt(worldPos.x, worldPos.y);
                    if (res.sparkleAmount) {
                        const screenPos = this.game.renderer2D.worldToScreen(res.spawnX, res.spawnY);
                        this.showFloatingSparkle(e.clientX + 30, screenPos.y - 50, res.sparkleAmount);
                    }
                }
            }

            document.body.style.cursor = 'default';

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
        const isCompact = sparklesElement.classList.contains('compact');

        const formatCompactNumber = (num) => {
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toString();
        };

        const sparkleTotalElements = sparklesElement.querySelectorAll('.sparkle-total');
        sparkleTotalElements.forEach(el => {
            const countText = isCompact ?
                `${formatCompactNumber(sparklesCount)} sp` :
                `${sparklesCount}`;
            const rateText = isCompact ?
                ` (+${formatCompactNumber(totalSparklesRate)}/s)` :
                ` (+${totalSparklesRate}/s)`;

            el.innerHTML = `${countText}<span style="font-size: 0.8em; opacity: 0.8;">${rateText}</span>`;
        });

        const sparkleRateEl = sparklesElement.querySelector('.sparkle-rate');
        if (sparkleRateEl) sparkleRateEl.textContent = '';

        const totalRateEl = sparklesElement.querySelector('.total-rate');
        if (totalRateEl) totalRateEl.textContent = '';

        const gold = this.game.resourceManager.resources.gold;
        const goldTotalElements = sparklesElement.querySelectorAll('.gold-total');
        goldTotalElements.forEach(el => {
            const countText = gold.formatAmount();
            const rateText = ` (+${gold.perSecond.toFixed(1)}/s)`;

            el.innerHTML = `${countText}<span style="font-size: 0.8em; opacity: 0.8;">${rateText}</span>`;
        });

        const goldRateElements = sparklesElement.querySelectorAll('.gold-rate');
        goldRateElements.forEach(el => {
            el.textContent = '';
        });

        if (!sparklesElement._hasClickHandler) {
            sparklesElement._hasClickHandler = true;
            sparklesElement.addEventListener('click', () => {
                sparklesElement.classList.toggle('compact');
            });
        }

        document.getElementById('firework-count').textContent = fireworkCount;
        document.getElementById('auto-launcher-level').textContent = autoLauncherCount;
        document.getElementById('auto-launcher-cost').textContent = nextCost;

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
        set('stat-bld-boost', getBldCount('EFFICIENCY_BOOSTER'));
        set('stat-bld-drone', getBldCount('DRONE_HUB'));

        // ── Session totals ──────────────────────────────────────────────────
        set('stat-session-time', StatsTracker.formatDuration(st.getSessionDurationSeconds()));

        set('stat-sess-sparkles', fmt(st.sessionSparkles));
        set('stat-sess-sp-auto', fmt(st.sessionSparklesBySource['auto_launcher'] ?? 0));
        set('stat-sess-sp-gen', fmt(st.sessionSparklesBySource['resource_generator'] ?? 0));
        set('stat-sess-sp-drone', fmt(st.sessionSparklesBySource['drone'] ?? 0));
        set('stat-sess-sp-manual', fmt(st.sessionSparklesBySource['manual'] ?? 0));

        set('stat-sess-gold', fmt(st.sessionGold));
        set('stat-sess-g-crowd', fmt(st.sessionGoldBySource['crowd'] ?? 0));

        set('stat-sess-fw', fmt(st.sessionFireworks));
        set('stat-sess-fw-manual', fmt(st.sessionFireworksBySource['manual'] ?? 0));
        set('stat-sess-fw-auto', fmt(st.sessionFireworksBySource['auto_launcher'] ?? 0));

        set('stat-sess-drone-parts', fmt(st.sessionDroneParticles));

        // ── Lifetime records ────────────────────────────────────────────────
        set('firework-count', fmt(g.fireworkCount));
        set('stat-life-sparkles', fmt(st.lifetimeSparkles));
        set('stat-life-sp-auto', fmt(st.lifetimeSparklesBySource['auto_launcher'] ?? 0));
        set('stat-life-sp-gen', fmt(st.lifetimeSparklesBySource['resource_generator'] ?? 0));
        set('stat-life-sp-drone', fmt(st.lifetimeSparklesBySource['drone'] ?? 0));
        set('stat-life-sp-manual', fmt(st.lifetimeSparklesBySource['manual'] ?? 0));

        set('stat-life-gold', fmt(st.lifetimeGold));
        set('stat-life-drone-parts', fmt(st.lifetimeDroneParticles));

        set('stat-peak-sps', fmtRate(st.peakSPS) + ' /s');
        set('stat-peak-gps', fmtRate(st.peakGPS) + ' /s');
        set('stat-peak-fps', fmtRate(st.peakFPS) + ' /s');
        set('stat-peak-crowd', st.peakCrowdSize);
    }

    updateComponentsList(components, onUpdate, containerId = 'components-list') {
        const componentsList = document.getElementById(containerId);
        componentsList.innerHTML = '';

        components.forEach((component, index) => {
            if (!('secondaryColor' in component)) {
                component.secondaryColor = '#00ff00';
            }
            if (!('glowStrength' in component)) {
                component.glowStrength = 0.0;
            }
            if (!('blurStrength' in component)) {
                component.blurStrength = 0.0;
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
                                <option value="spherical">Spherical</option>
                                <option value="solidsphere">Solid Sphere</option>
                                <option value="ring">Ring</option>
                                <option value="heart">Heart</option>
                                <option value="burst">Burst</option>
                                <option value="palm">Palm</option>
                                <option value="willow">Willow</option>
                                <option value="helix">Helix</option>
                                <option value="spinner">Spinner</option>
                                <option value="star">Star</option>
                                <option value="brocade">Brocade</option>
                                <option value="brokenHeart">Broken Heart</option>
                                <option value="christmasTree">Christmas Tree</option>
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
                    <div class="recipes-option">
                        <label>Glow Strength:</label>
                        <input type="range" class="glow-strength-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.glowStrength.min}" max="${COMPONENT_PROPERTY_RANGES.glowStrength.max}" step="${COMPONENT_PROPERTY_RANGES.glowStrength.step}" value="${component.glowStrength}">
                    </div>
                    <div class="recipes-option">
                        <label>Blur Strength:</label>
                        <input type="range" class="blur-strength-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.blurStrength.min}" max="${COMPONENT_PROPERTY_RANGES.blurStrength.max}" step="${COMPONENT_PROPERTY_RANGES.blurStrength.step}" value="${component.blurStrength}">
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
            const glowStrengthSelect = componentDiv.querySelector('.glow-strength-select');
            const blurStrengthSelect = componentDiv.querySelector('.blur-strength-select');

            const updateSecondaryColorVisibility = () => {
                if (patternSelect.value === 'helix' || patternSelect.value === 'christmasTree') {
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

            glowStrengthSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                const value = parseFloat(e.target.value);
                components[idx].glowStrength = value;
                // Update the value display
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay && valueDisplay.classList.contains('value-display')) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                onUpdate();
            });

            blurStrengthSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                const value = parseFloat(e.target.value);
                components[idx].blurStrength = value;
                // Update the value display
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay && valueDisplay.classList.contains('value-display')) {
                    valueDisplay.textContent = value.toFixed(2);
                }
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

    updateLauncherList(launchers, selectedBuildingId, onSelect, onUpgrade) {
        const launcherList = document.getElementById('launcher-list');
        launcherList.innerHTML = '';

        if (launchers.length === 0) {
            launcherList.innerHTML = "<p>No auto-launchers owned yet.</p>";
            return;
        }

        launchers.forEach((launcher, index) => {
            const launcherDiv = document.createElement('div');
            launcherDiv.classList.add('launcher-card');
            launcherDiv.dataset.buildingId = launcher.id;

            if (launcher.id === selectedBuildingId) {
                launcherDiv.classList.add('selected');
            }

            const upgradeCost = launcher.getUpgradeCost();

            launcherDiv.innerHTML = `
                <h3>Auto-Launcher ${index + 1}</h3>
                ${this.game.unlockStates.recipesTab ? `
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
                            <option value="${key}" ${launcher.patternOverride === key ? 'selected' : ''}>${PATTERN_DISPLAY_NAMES[key] || key}</option>
                        `).join('')}
                    </select>
                </div>
                `}
                <div class="launcher-details">
                    <p>Level: ${launcher.level}</p>
                    <p>Spawn Rate: Every ${launcher.spawnInterval.toFixed(1)}s</p>
                    <p>Upgrade Cost: ${upgradeCost} sparkles</p>
                    <button class="upgrade-button" data-building-id="${launcher.id}">Upgrade</button>
                </div>
            `;
            launcherList.appendChild(launcherDiv);

            if (this.game.unlockStates.recipesTab) {
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

            const upgradeButton = launcherDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', () => onUpgrade(launcher.id));

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

    updateBackgroundPicker() {
        const container = document.getElementById('background-picker-container');
        if (!container) return;
        container.innerHTML = '';

        BACKGROUND_IMAGES.forEach(bg => {
            const bgOption = document.createElement('div');
            bgOption.className = 'background-option';
            if (bg.path === this.game.currentBackground) {
                bgOption.classList.add('selected');
            }

            bgOption.innerHTML = `
                <img src="${bg.path}" alt="${bg.name}" />
                <span>${bg.name}</span>
            `;

            bgOption.addEventListener('click', () => {
                this.game.changeBackground(bg.path);
            });

            container.appendChild(bgOption);
        });
    }

    renderUpgrades() {
        const availableContainer = document.getElementById('upgrades-available');
        const ownedContainer = document.getElementById('upgrades-owned');
        if (!availableContainer || !ownedContainer) return;

        availableContainer.innerHTML = '';
        ownedContainer.innerHTML = '';

        const { upgrades, purchasedUpgrades } = this.game;
        upgrades.forEach(up => {
            // Skip upgrades that have a visibility gate which isn't satisfied yet
            if (up.isVisible && !up.isVisible(this.game)) return;

            const lvl = purchasedUpgrades[up.id] ?? 0;
            const maxLevel = up.maxLevel ?? 1;

            if (lvl > 0) {
                const ownedCard = document.createElement('div');
                ownedCard.className = 'upgrade-card purchased';

                const oTitle = document.createElement('div');
                oTitle.textContent = `${up.name} (Lv ${lvl})`;
                ownedCard.appendChild(oTitle);

                const oDesc = document.createElement('div');
                oDesc.textContent = up.desc;
                ownedCard.appendChild(oDesc);

                ownedContainer.appendChild(ownedCard);
            }

            if (lvl < maxLevel) {
                const availCard = document.createElement('div');
                availCard.className = 'upgrade-card';

                const aTitle = document.createElement('div');
                aTitle.textContent = `${up.name} (Lv ${lvl + 1})`;
                availCard.appendChild(aTitle);

                const aDesc = document.createElement('div');
                aDesc.textContent = up.desc;
                availCard.appendChild(aDesc);

                const nextCost = Math.floor(up.baseCost * Math.pow(up.costRatio, lvl));
                const aCost = document.createElement('div');
                aCost.textContent = `Cost: ${nextCost.toLocaleString()} ${up.currency}`;
                availCard.appendChild(aCost);

                const btn = document.createElement('button');
                btn.textContent = 'Buy';
                btn.addEventListener('click', () => this.game.buyUpgrade(up.id));
                availCard.appendChild(btn);

                availableContainer.appendChild(availCard);
            }
        });
    }


    showFloatingSparkle(screenX, screenY, amount) {
        if (!this.showFloatingSparkleEnabled) return;

        const THRESHOLD_X_DIST = 50;

        if (this.activeFloatingSparkle && document.body.contains(this.activeFloatingSparkle)) {
            const existingX = parseFloat(this.activeFloatingSparkle.style.left || '0');

            if (Math.abs(existingX - screenX) <= THRESHOLD_X_DIST) {
                const elem = this.activeFloatingSparkle;

                const currentAmount = parseFloat(elem.dataset.amount || '0');
                const newAmount = currentAmount + amount;
                elem.dataset.amount = newAmount;
                elem.textContent = `+${newAmount.toLocaleString()}`;

                elem.style.top = `${screenY}px`;

                elem.style.animation = 'none';
                void elem.offsetWidth;
                elem.style.animation = 'floatUpFade 1.5s ease-out forwards';

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
                elem.onanimationend = remove;
                this.floatingSparkleTimeout = setTimeout(remove, 1500);
                return;
            }
            this.activeFloatingSparkle = null;
            if (this.floatingSparkleTimeout) {
                this.floatingSparkleTimeout = null;
            }
        }

        const elem = document.createElement('div');
        elem.className = 'floating-sparkle';
        elem.dataset.amount = amount;
        elem.textContent = `+${amount.toLocaleString()}`;

        elem.style.left = `${screenX}px`;
        elem.style.top = `${screenY}px`;

        document.body.appendChild(elem);

        const remove = () => {
            elem.remove();
            this.activeFloatingSparkle = null;
            this.floatingSparkleTimeout = null;
        };
        elem.onanimationend = remove;
        this.floatingSparkleTimeout = setTimeout(remove, 1500);

        this.activeFloatingSparkle = elem;
    }

    initializeUnlockStates(unlockStates) {
        this.hideSparkleCounter();
        this.hideTabMenu();
        this.hideCollapseButton();
        this.hideAllTabs();

        if (unlockStates.sparkleCounter) {
            this.showSparkleCounter();
        }

        if (unlockStates.tabMenu) {
            this.showTabMenu();
            this.showCollapseButton();
            if (!this.game.firstClickStates.tabMenu) {
                this.addGlimmer('tabMenu');
            }
        }

        if (unlockStates.buildingsTab) {
            this.showBuildingsTab();
            if (!this.game.firstClickStates.buildingsTab) {
                this.addGlimmer('buildingsTab');
            }
        }

        if (unlockStates.upgradesTab) {
            this.showUpgradesTab();
            if (!this.game.firstClickStates.upgradesTab) {
                this.addGlimmer('upgradesTab');
            }
        }

        if (unlockStates.backgroundTab) {
            this.showBackgroundTab();
            if (!this.game.firstClickStates.backgroundTab) {
                this.addGlimmer('backgroundTab');
            }
        }

        if (unlockStates.crowdsTab) {
            this.showCrowdsTab();
            if (!this.game.firstClickStates.crowdsTab) {
                this.addGlimmer('crowdsTab');
            }
        }

        if (unlockStates.recipesTab) {
            this.showRecipesTab();
        }

        // Update building type visibility based on unlock states
        this.updateBuildingTypeVisibility();
    }

    hideAllTabs() {
        const tabs = [
            'recipes-tab',
            'stats-tab',
            'crowd-tab',
            'buildings-tab',
            'settings-tab',
            'upgrades-tab',
            'background-tab',
            'cheats-tab'
        ];

        tabs.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (tab) {
                tab.classList.add('unlock-hidden');
            }
        });
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

        if (this.game && this.game.unlockStates && this.game.unlockStates.recipesTab) {
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

    showBackgroundTab() {
        const backgroundTab = document.getElementById('background-tab');
        if (backgroundTab) {
            backgroundTab.classList.remove('unlock-hidden');
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
            backgroundTab: 'background-tab',
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
            backgroundTab: 'background-tab',
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
                (id) => this.game.selectLauncher(id),
                (id) => this.game.upgradeLauncher(id)
            );
        } else if (buildingType === 'RESOURCE_GENERATOR') {
            this.updateGeneratorList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id),
                (id) => {
                    const building = this.game.buildingManager.getBuildingById(id);
                    if (building) {
                        this.game.buildingManager.upgradeBuilding(building);
                        this.updateBuildingListByType('RESOURCE_GENERATOR');
                    }
                }
            );
        } else if (buildingType === 'EFFICIENCY_BOOSTER') {
            this.updateBoosterList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id),
                (id) => {
                    const building = this.game.buildingManager.getBuildingById(id);
                    if (building) {
                        this.game.buildingManager.upgradeBuilding(building);
                        this.updateBuildingListByType('EFFICIENCY_BOOSTER');
                    }
                }
            );
        } else if (buildingType === 'DRONE_HUB') {
            this.updateDroneHubList(buildings, this.game.selectedBuildingId,
                (id) => this.game.selectLauncher(id),
                (id) => {
                    const building = this.game.buildingManager.getBuildingById(id);
                    if (building) {
                        this.game.buildingManager.upgradeBuilding(building);
                        this.updateBuildingListByType('DRONE_HUB');
                    }
                }
            );
        }

        // Update counts
        this.updateBuildingCounts();
    }

    updateGeneratorList(generators, selectedBuildingId, onSelect, onUpgrade) {
        const generatorList = document.getElementById('generator-list');
        generatorList.innerHTML = '';

        if (generators.length === 0) {
            generatorList.innerHTML = "<p>No resource generators owned yet.</p>";
            return;
        }

        generators.forEach((generator, index) => {
            const generatorDiv = document.createElement('div');
            generatorDiv.classList.add('launcher-card');
            generatorDiv.dataset.buildingId = generator.id;

            if (generator.id === selectedBuildingId) {
                generatorDiv.classList.add('selected');
            }

            const upgradeCost = generator.getUpgradeCost();
            const productionRate = generator.calculateProductionRate();

            generatorDiv.innerHTML = `
                <h3>Resource Generator ${index + 1}</h3>
                <div class="launcher-details">
                    <p>Level: ${generator.level}</p>
                    <p>Production: ${productionRate.toFixed(1)} sparkles/s</p>
                    <p>Upgrade Cost: ${upgradeCost} gold</p>
                    <button class="upgrade-button" data-building-id="${generator.id}">Upgrade</button>
                </div>
            `;
            generatorList.appendChild(generatorDiv);

            const upgradeButton = generatorDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                onUpgrade(generator.id);
            });

            generatorDiv.addEventListener('click', () => {
                onSelect(generator.id);
                if (generator && generator.x !== undefined) {
                    this.game.setCameraTarget(generator.x);
                }
            });
        });
    }

    updateBoosterList(boosters, selectedBuildingId, onSelect, onUpgrade) {
        const boosterList = document.getElementById('booster-list');
        boosterList.innerHTML = '';

        if (boosters.length === 0) {
            boosterList.innerHTML = "<p>No efficiency boosters owned yet.</p>";
            return;
        }

        boosters.forEach((booster, index) => {
            const boosterDiv = document.createElement('div');
            boosterDiv.classList.add('launcher-card');
            boosterDiv.dataset.buildingId = booster.id;

            if (booster.id === selectedBuildingId) {
                boosterDiv.classList.add('selected');
            }

            const upgradeCost = booster.getUpgradeCost();
            const radius = booster.calculateRadius();
            const multiplier = booster.calculateMultiplier();
            const nearbyBuildings = booster.getNearbyBuildings(this.game.buildingManager);

            boosterDiv.innerHTML = `
                <h3>Efficiency Booster ${index + 1}</h3>
                <div class="launcher-details">
                    <p>Level: ${booster.level}</p>
                    <p>Range: ${radius.toFixed(0)} units</p>
                    <p>Boost: ${((multiplier - 1) * 100).toFixed(0)}%</p>
                    <p>Boosting: ${nearbyBuildings.length} buildings</p>
                    <p>Upgrade Cost: ${upgradeCost} gold</p>
                    <button class="upgrade-button" data-building-id="${booster.id}">Upgrade</button>
                </div>
            `;
            boosterList.appendChild(boosterDiv);

            const upgradeButton = boosterDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                onUpgrade(booster.id);
            });

            boosterDiv.addEventListener('click', () => {
                onSelect(booster.id);
                if (booster && booster.x !== undefined) {
                    this.game.setCameraTarget(booster.x);
                }
            });
        });
    }

    updateDroneHubList(hubs, selectedBuildingId, onSelect, onUpgrade) {
        const hubList = document.getElementById('drone-hub-list');
        hubList.innerHTML = '';

        if (hubs.length === 0) {
            hubList.innerHTML = '<p>No drone hubs owned yet.</p>';
            return;
        }

        hubs.forEach((hub, index) => {
            const hubDiv = document.createElement('div');
            hubDiv.classList.add('launcher-card');
            hubDiv.dataset.buildingId = hub.id;

            if (hub.id === selectedBuildingId) {
                hubDiv.classList.add('selected');
            }

            const upgradeCost = hub.getUpgradeCost();
            const spawnRate = hub.getSpawnRate().toFixed(3);

            hubDiv.innerHTML = `
                <h3>Drone Hub ${index + 1}</h3>
                <div class="launcher-details">
                    <p>Level: ${hub.level}</p>
                    <p>Spawn interval: ${hub.spawnInterval.toFixed(1)}s</p>
                    <p>Drone lifetime: ${hub.droneLifetime.toFixed(1)}s</p>
                    <p>Drone speed: ${hub.droneSpeed.toFixed(0)}</p>
                    <p>Upgrade Cost: ${upgradeCost} gold</p>
                    <button class="upgrade-button" data-building-id="${hub.id}">Upgrade</button>
                </div>
            `;
            hubList.appendChild(hubDiv);

            hubDiv.querySelector('.upgrade-button').addEventListener('click', (e) => {
                e.stopPropagation();
                onUpgrade(hub.id);
            });

            hubDiv.addEventListener('click', () => {
                onSelect(hub.id);
                if (hub.x !== undefined) this.game.setCameraTarget(hub.x);
            });
        });
    }

    updateBuildingCounts() {
        const autoLaunchers = this.game.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        const generators = this.game.buildingManager.getBuildingsByType('RESOURCE_GENERATOR');
        const boosters = this.game.buildingManager.getBuildingsByType('EFFICIENCY_BOOSTER');
        const droneHubs = this.game.buildingManager.getBuildingsByType('DRONE_HUB');

        document.getElementById('auto-launcher-level').textContent = autoLaunchers.length;
        document.getElementById('resource-generator-count').textContent = generators.length;
        document.getElementById('efficiency-booster-count').textContent = boosters.length;
        const droneHubCountEl = document.getElementById('drone-hub-count');
        if (droneHubCountEl) droneHubCountEl.textContent = droneHubs.length;
    }

    updateBuildingCosts() {
        const autoLauncherCost = this.game.buildingManager.getBuyCost('AUTO_LAUNCHER');
        const generatorCost = this.game.buildingManager.getBuyCost('RESOURCE_GENERATOR');
        const boosterCost = this.game.buildingManager.getBuyCost('EFFICIENCY_BOOSTER');
        const droneHubCost = this.game.buildingManager.getBuyCost('DRONE_HUB');

        document.getElementById('auto-launcher-cost').textContent = autoLauncherCost;
        document.getElementById('resource-generator-cost').textContent = generatorCost;
        document.getElementById('efficiency-booster-cost').textContent = boosterCost;
        const droneHubCostEl = document.getElementById('drone-hub-cost');
        if (droneHubCostEl) droneHubCostEl.textContent = droneHubCost;
    }

    updateBuildingTypeVisibility() {
        // Show/hide building type tabs based on unlock state
        const generatorTab = document.querySelector('.building-type-tab[data-building-type="RESOURCE_GENERATOR"]');
        const boosterTab = document.querySelector('.building-type-tab[data-building-type="EFFICIENCY_BOOSTER"]');

        if (generatorTab) {
            if (this.game.unlockStates.resourceGenerator) {
                generatorTab.style.display = 'block';
            } else {
                generatorTab.style.display = 'none';
            }
        }

        if (boosterTab) {
            if (this.game.unlockStates.efficiencyBooster) {
                boosterTab.style.display = 'block';
            } else {
                boosterTab.style.display = 'none';
            }
        }

        const droneHubTab = document.querySelector('.building-type-tab[data-building-type="DRONE_HUB"]');
        if (droneHubTab) {
            if (this.game.unlockStates.droneHub) {
                droneHubTab.style.display = 'block';
            } else {
                droneHubTab.style.display = 'none';
            }
        }

        // If currently viewing a locked building type, switch to auto launcher
        const activeBuildingType = document.querySelector('.building-type-tab.active')?.getAttribute('data-building-type');
        if (activeBuildingType === 'RESOURCE_GENERATOR' && !this.game.unlockStates.resourceGenerator) {
            this.switchBuildingType('AUTO_LAUNCHER');
        } else if (activeBuildingType === 'EFFICIENCY_BOOSTER' && !this.game.unlockStates.efficiencyBooster) {
            this.switchBuildingType('AUTO_LAUNCHER');
        } else if (activeBuildingType === 'DRONE_HUB' && !this.game.unlockStates.droneHub) {
            this.switchBuildingType('AUTO_LAUNCHER');
        }
    }
}

export default UIManager;
