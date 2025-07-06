import { GAME_BOUNDS, BACKGROUND_IMAGES, DEFAULT_RECIPE_COMPONENTS, COMPONENT_PROPERTY_RANGES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';

class UIManager {
    constructor(game) {
        this.game = game;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.draggingLauncher = null;
        this.lastPointerX = 0;
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

        document.getElementById('recipes-tab').addEventListener('click', () => {
            this.toggleTab('recipes');
        });
        document.getElementById('stats-tab').addEventListener('click', () => {
            this.toggleTab('stats');
        });
        document.getElementById('crowd-tab').addEventListener('click', () => {
            this.toggleTab('crowd');
        });
        document.getElementById('auto-launcher-tab').addEventListener('click', () => {
            this.toggleTab('auto-launcher');
            this.game.updateLauncherList();
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
                    this.game.addSparkles(amount);
                    this.game.updateUI();
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
                    this.game.addGold(amount);
                    this.game.updateUI();
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

        const trailSelects = [
            document.getElementById('recipe-trail-effect'),
            document.getElementById('creator-trail-effect')
        ];
        trailSelects.forEach(sel => sel && sel.addEventListener('change', (e) => {
            this.game.currentTrailEffect = e.target.value;
            this.game.saveCurrentRecipeComponents();
        }));

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

        const intersectedLauncher = this.game.getLauncherAt(worldPos.x, worldPos.y);

        if (intersectedLauncher) {
            this.isDragging = true;
            this.draggingLauncher = intersectedLauncher;
            const launcherIndex = this.game.gameState.autoLaunchers.indexOf(intersectedLauncher);
            if (launcherIndex > -1) {
                this.game.selectLauncher(launcherIndex);
            }

            document.body.style.cursor = 'grabbing';

            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
        } else {
            this.isScrollDragging = true;
            this.game.cameraTargetX = null;
            this.lastPointerX = event.clientX;
            document.body.style.cursor = 'grabbing';



            document.addEventListener('pointermove', this.pointerMoveHandler, { passive: false });
            document.addEventListener('pointerup', this.pointerUpHandler);
            document.addEventListener('pointercancel', this.pointerUpHandler);
            return;
        }
    }

    pointerMoveHandler(e) {
        if (this.isDragging && this.draggingLauncher) {
            e.preventDefault();
            const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
            const clampedX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(worldPos.x, GAME_BOUNDS.LAUNCHER_MAX_X));

            this.draggingLauncher.x = clampedX;
            this.draggingLauncher.mesh.position.x = clampedX;
            this.game.saveProgress();
        } else if (this.isScrollDragging) {
            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 1;

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


            if (this.isScrollDragging) {
                const deltaX = Math.abs(e.clientX - this.lastPointerX);
                if (deltaX < 20 && !this.game.isClickInsideUI(e)) {
                    const worldPos = this.game.screenToWorld(e.clientX, e.clientY);
                    const res = this.game.launchFireworkAt(worldPos.x,  worldPos.y);
                    if (res.sparkleAmount) {
                        const screenPos = this.game.renderer2D.worldToScreen(res.spawnX, res.spawnY);
                        this.showFloatingSparkle(e.clientX + 30, screenPos.y - 50, res.sparkleAmount);
                    }
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

    updateUI(sparklesCount, totalSparklesRate, fireworkCount, autoLauncherCount, trailEffect, nextCost) {
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

        // Clear the separate rate displays since we're now showing inline
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

        // Clear the separate gold rate displays since we're now showing inline
        const goldRateElements = sparklesElement.querySelectorAll('.gold-rate');
        goldRateElements.forEach(el => {
            el.textContent = '';
        });

        if (!sparklesElement._hasClickHandler) {
            sparklesElement._hasClickHandler = true;
            sparklesElement.addEventListener('click', () => {
                sparklesElement.classList.toggle('compact');
                this.updateUI(sparklesCount, totalSparklesRate, fireworkCount, autoLauncherCount, trailEffect, nextCost);
            });
        }

        document.getElementById('firework-count').textContent = fireworkCount;
        document.getElementById('auto-launcher-level').textContent = autoLauncherCount; // Renamed from autoLauncherLevel
        document.getElementById('recipe-trail-effect').value = trailEffect;
        const creatorTrail = document.getElementById('creator-trail-effect');
        if (creatorTrail) creatorTrail.value = trailEffect;
        document.getElementById('auto-launcher-cost').textContent = nextCost;
    }

    updateComponentsList(components, onUpdate, containerId = 'components-list') {
        const componentsList = document.getElementById(containerId);
        componentsList.innerHTML = '';

        components.forEach((component, index) => {
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
                    <div class="recipes-option trail-container">
                        <label>Trail:</label>
                        <input type="checkbox" class="trail-toggle" data-index="${index}" ${component.enableTrail ? 'checked' : ''}>
                    </div>                    
                    <div class="recipes-option trail-options" style="display: ${component.enableTrail ? 'block' : 'none'};">
                        <label>Trail Length:</label>
                        <input type="range" class="trail-length-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.trailLength.min}" max="${COMPONENT_PROPERTY_RANGES.trailLength.max}" step="${COMPONENT_PROPERTY_RANGES.trailLength.step}" value="${component.trailLength}">
                        <label>Trail Width:</label>
                        <input type="range" class="trail-width-select" data-index="${index}" min="${COMPONENT_PROPERTY_RANGES.trailWidth.min}" max="${COMPONENT_PROPERTY_RANGES.trailWidth.max}" step="${COMPONENT_PROPERTY_RANGES.trailWidth.step}" value="${component.trailWidth}">
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
            const trailContainer = componentDiv.querySelector('.trail-container'); const trailToggle = componentDiv.querySelector('.trail-toggle');
            const trailOptions = componentDiv.querySelector('.trail-options');
            const trailLengthSelect = componentDiv.querySelector('.trail-length-select');
            const trailWidthSelect = componentDiv.querySelector('.trail-width-select');
            const glowStrengthSelect = componentDiv.querySelector('.glow-strength-select');
            const blurStrengthSelect = componentDiv.querySelector('.blur-strength-select');

            const updateSecondaryColorVisibility = () => {
                if (patternSelect.value === 'helix' || patternSelect.value === 'christmasTree') {
                    secondaryColorContainer.style.display = 'block';
                } else {
                    secondaryColorContainer.style.display = 'none';
                }
            };

            const updateTrailAvailability = () => {
                const idx = patternSelect.getAttribute('data-index');
                if (patternSelect.value === 'helix') {
                    trailContainer.style.display = 'none';
                    trailOptions.style.display = 'none';
                    if (components[idx].enableTrail) {
                        components[idx].enableTrail = false;
                        trailToggle.checked = false;
                        onUpdate();
                    }
                } else {
                    trailContainer.style.display = 'block';
                    trailOptions.style.display = trailToggle.checked ? 'block' : 'none';
                }
            };

            updateSecondaryColorVisibility();
            updateTrailAvailability();

            patternSelect.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].pattern = e.target.value;
                updateSecondaryColorVisibility();
                updateTrailAvailability();
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

            trailToggle.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].enableTrail = e.target.checked;
                trailOptions.style.display = e.target.checked ? 'block' : 'none';
                onUpdate();
            });

            trailLengthSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].trailLength = parseFloat(e.target.value);
                onUpdate();
            });
            trailWidthSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                components[idx].trailWidth = parseFloat(e.target.value);
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

    updateLauncherList(launchers, selectedIndex, onSelect, onUpgrade) {
        const launcherList = document.getElementById('launcher-list');
        launcherList.innerHTML = '';

        if (launchers.length === 0) {
            launcherList.innerHTML = "<p>No auto-launchers owned yet.</p>";
            return;
        }

        launchers.forEach((launcher, index) => {
            const launcherDiv = document.createElement('div');
            launcherDiv.classList.add('launcher-card');
            if (index === selectedIndex) {
                launcherDiv.classList.add('selected');
            }

            launcherDiv.innerHTML = `
                <h3>Auto-Launcher ${index + 1}</h3>
                <div class="recipes-option">
                    <label>Assign Recipe:</label>
                    <select class="recipe-select" data-index="${index}">
                        <option value="">-- Shoot a random recipe --</option>
                        ${this.game.recipes.map((recipe, rIndex) => `
                            <option value="${rIndex}" ${launcher.assignedRecipeIndex === rIndex ? 'selected' : ''}>${recipe.name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="launcher-details">
                    <p>Level: ${launcher.level}</p>
                    <p>Spawn Rate: Every ${launcher.spawnInterval.toFixed(1)}s</p>
                    <p>Upgrade Cost: ${launcher.upgradeCost} sparkles</p>
                    <button class="upgrade-button" data-index="${index}">Upgrade</button>
                </div>
            `;
            launcherList.appendChild(launcherDiv);

            const recipeSelect = launcherDiv.querySelector('.recipe-select');
            recipeSelect.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                const selectedRecipeIndex = parseInt(e.target.value);
                if (!isNaN(selectedRecipeIndex)) {
                    this.game.gameState.autoLaunchers[idx].assignedRecipeIndex = selectedRecipeIndex;
                } else {
                    this.game.gameState.autoLaunchers[idx].assignedRecipeIndex = null;
                }
                this.game.saveProgress();
            });

            const upgradeButton = launcherDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', () => onUpgrade(index));

            launcherDiv.addEventListener('click', () => {
                onSelect(index);
                if (launcher && launcher.x !== undefined) {
                    this.game.setCameraTarget(launcher.x);
                }
            });
        });
    }

    getReadableTrailEffect(effect) {
        switch (effect) {
            case 'fade':
                return 'Fade';
            case 'sparkle':
                return 'Sparkle';
            case 'rainbow':
                return 'Rainbow Gradient';
            case 'comet':
                return 'Comet Tail';
            default:
                return 'None';
        }
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

        const THRESHOLD_X_DIST = 30; 

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
        
        if (unlockStates.autoLauncherTab) {
            this.showAutoLauncherTab();
            if (!this.game.firstClickStates.autoLauncherTab) {
                this.addGlimmer('autoLauncherTab');
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
    }

    hideAllTabs() {
        const tabs = [
            'recipes-tab',
            'stats-tab', 
            'crowd-tab',
            'auto-launcher-tab',
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
        
        this.showRecipesTab();
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

    showAutoLauncherTab() {
        const autoLauncherTab = document.getElementById('auto-launcher-tab');
        if (autoLauncherTab) {
            autoLauncherTab.classList.remove('unlock-hidden');
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
            tabMenu: 'recipes-tab', // Use recipes tab as the first visible tab
            autoLauncherTab: 'auto-launcher-tab',
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
            tabMenu: 'recipes-tab',
            autoLauncherTab: 'auto-launcher-tab',
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
}

export default UIManager;
