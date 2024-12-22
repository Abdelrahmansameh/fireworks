import { GAME_BOUNDS } from '../config/config.js';

class UIManager {
    constructor(game) {
        this.game = game;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.draggingLauncher = null;
        this.lastPointerX = 0;
        this.notificationTimeout = null;
        
        // Bind event handlers
        this.pointerMoveHandler = this.pointerMoveHandler.bind(this);
        this.pointerUpHandler = this.pointerUpHandler.bind(this);
        this.handleWheelScroll = this.handleWheelScroll.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
    }

    initializeRendererEvents() {
        if (this.game.renderer && this.game.renderer.domElement) {
            this.game.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
        }
    }

    bindUIEvents() {
        document.getElementById('add-component').addEventListener('click', () => {
            this.game.currentRecipeComponents.push({
                pattern: 'spherical',
                color: '#ff0000',
                size: 0.5,
                lifetime: 1.2,
                shape: 'sphere',
                spread: 1.0,
                secondaryColor: '#00ff00'
            });
            this.game.updateComponentsList();
            this.game.saveCurrentRecipeComponents();
        });

        document.getElementById('save-recipe').addEventListener('click', () => {
            this.game.saveCurrentRecipe();
        });

        document.getElementById('erase-recipes').addEventListener('click', () => {
            this.showConfirmation(
                "Confirm Erase Recipes",
                "Are you sure you want to erase all saved recipes?",
                () => {
                    this.game.eraseAllRecipes();
                }
            );
        });

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
                    const refundAmount = this.game.resetAutoLaunchers();
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
            this.game.updateLauncherList();
        });
        document.getElementById('data-tab').addEventListener('click', () => {
            this.toggleTab('data');
        });
        document.getElementById('levels-tab').addEventListener('click', () => {
            this.toggleTab('levels');
            this.game.updateLevelsList();
        });

        document.getElementById('recipe-trail-effect').addEventListener('change', (e) => {
            this.game.currentTrailEffect = e.target.value;
            this.game.saveCurrentRecipeComponents();
        });

        this.game.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (!this.game.isClickInsideUI(e)) {
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
                raycaster.setFromCamera(mouse, this.game.camera);

                const launcherMeshes = this.game.levels[this.game.currentLevel].autoLaunchers.map(launcher => launcher.mesh);
                const intersects = raycaster.intersectObjects(launcherMeshes);

                if (intersects.length > 0) {
                    const intersectedMesh = intersects[0].object;
                    const launcherIndex = this.game.levels[this.game.currentLevel].autoLaunchers.findIndex(launcher => launcher.mesh === intersectedMesh);
                    if (launcherIndex !== -1) {
                        this.game.selectLauncher(launcherIndex);
                        this.showTab('auto-launcher');
                        setTimeout(() => {
                            const launcherList = document.getElementById('launcher-list');
                            const launcherCards = launcherList.getElementsByClassName('launcher-card');
                            if (launcherCards[launcherIndex]) {
                                launcherCards[launcherIndex].scrollIntoView({ behavior: 'smooth' });
                            }
                        }, 100);
                        this.game.draggingLauncher = this.game.levels[this.game.currentLevel].autoLaunchers[launcherIndex];
                        this.game.isDragging = true;
                    }
                }
            }
        });
    }

    bindEvents() {
        document.getElementById('collapse-button').addEventListener('click', this.handleCollapseButton);

        // Save/Load
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

        // Level navigation
        document.getElementById('prev-level').addEventListener('click', () => {
            if (this.game.currentLevel > 0) {
                this.game.switchLevel(this.game.currentLevel - 1);
            }
        });

        document.getElementById('next-level').addEventListener('click', () => {
            if (this.game.currentLevel < this.game.levels.length - 1 && this.game.levels[this.game.currentLevel + 1].unlocked) {
                this.game.switchLevel(this.game.currentLevel + 1);
            }
        });

        document.getElementById('unlock-next-level').addEventListener('click', () => {
            this.game.unlockNextLevel();
        });

        document.addEventListener('wheel', this.handleWheelScroll, { passive: false });

        document.getElementById('spread-launchers').addEventListener('click', () => {
            this.game.spreadLaunchers();
        });

        document.getElementById('upgrade-all-launchers').addEventListener('click', () => {
            this.game.upgradeAllLaunchers();
            this.showNotification("All launchers upgraded!");
        });
    }

    handlePointerDown(e) {
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
            raycaster.setFromCamera(mouse, this.game.camera);

            const launcherMeshes = this.game.levels[this.game.currentLevel].autoLaunchers.map(launcher => launcher.mesh);
            const intersects = raycaster.intersectObjects(launcherMeshes);

            if (intersects.length > 0) {
                const intersectedMesh = intersects[0].object;
                const launcherIndex = this.game.levels[this.game.currentLevel].autoLaunchers.findIndex(launcher => launcher.mesh === intersectedMesh);
                if (launcherIndex !== -1) {
                    this.game.selectLauncher(launcherIndex);
                    this.showTab('auto-launcher');
                    setTimeout(() => {
                        const launcherList = document.getElementById('launcher-list');
                        const launcherCards = launcherList.getElementsByClassName('launcher-card');
                        if (launcherCards[launcherIndex]) {
                            launcherCards[launcherIndex].scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                    this.draggingLauncher = this.game.levels[this.game.currentLevel].autoLaunchers[launcherIndex];
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
    }

    handlePointerClick(worldPos, event) {
        if (this.isClickInsideUI(event)) {
            return;
        }

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, this.game.camera);

        const launcherMeshes = this.game.levels[this.game.currentLevel].autoLaunchers.map(launcher => launcher.mesh);
        const intersects = raycaster.intersectObjects(launcherMeshes);
        
        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const launcherIndex = this.game.levels[this.game.currentLevel].autoLaunchers.findIndex(launcher => launcher.mesh === clickedMesh);
            if (launcherIndex !== -1) {
                if (event.pointerType === 'touch' || event.button === 0) {
                    this.game.selectLauncher(launcherIndex);
                    setTimeout(() => {
                        const launcherCards = document.querySelectorAll('.launcher-card');
                        if (launcherCards[launcherIndex]) {
                            launcherCards[launcherIndex].scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                    this.draggingLauncher = this.game.levels[this.game.currentLevel].autoLaunchers[launcherIndex];
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
            this.isScrollDragging = true;
            this.game.cameraTargetX = null;
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

        this.game.launchFireworkAt(worldPos.x);
    }

    pointerMoveHandler(e) {
        if (this.isDragging && this.draggingLauncher) {
            e.preventDefault();
            const x = e.clientX;
            const y = e.clientY;

            const mouse = new THREE.Vector2();
            mouse.x = (x / window.innerWidth) * 2 - 1;
            mouse.y = - (y / window.innerHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.game.camera);

            const t = - (this.game.camera.position.z) / raycaster.ray.direction.z;
            const worldPos = new THREE.Vector3();
            worldPos.copy(raycaster.ray.direction).multiplyScalar(t).add(this.game.camera.position);

            const clampedX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(worldPos.x, GAME_BOUNDS.LAUNCHER_MAX_X));

            this.draggingLauncher.mesh.position.x = clampedX;
            this.draggingLauncher.x = clampedX;
            this.game.saveProgress();
        } else if (this.isScrollDragging) {
            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 0.2;

            this.game.camera.position.x -= deltaX * dragScrollSpeed;

            const maxScroll = (GAME_BOUNDS.SCROLL_MAX_X - GAME_BOUNDS.SCROLL_MIN_X) * 0.5;
            this.game.camera.position.x = Math.max(-maxScroll, Math.min(maxScroll, this.game.camera.position.x));

            this.lastPointerX = e.clientX;
        }
    }

    pointerUpHandler(e) {
        if (this.isDragging || this.isScrollDragging) {
            if (e.pointerType === 'touch' && e.target) {
                e.target.releasePointerCapture(e.pointerId);
            }

            if (e.pointerType === 'touch' && !this.isClickInsideUI(e)) {
                const worldPos = this.screenToWorld(e.clientX, e.clientY);
                this.game.launchFireworkAt(worldPos.x);
            }
            if (this.isScrollDragging) {
                const deltaX = Math.abs(e.clientX - this.lastPointerX);
                if (deltaX < 20 && !this.isClickInsideUI(e)) {
                    const worldPos = this.screenToWorld(e.clientX, e.clientY);
                    this.game.launchFireworkAt(worldPos.x);
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
        if (this.isClickInsideUI(event)) {
            return;
        }

        const wheelScrollSpeed = 0.05;
        const scrollAmount = event.deltaY * wheelScrollSpeed;

        this.game.camera.position.x += scrollAmount;

        const maxScroll = (GAME_BOUNDS.SCROLL_MAX_X - GAME_BOUNDS.SCROLL_MIN_X) * 0.5;
        this.game.camera.position.x = Math.max(-maxScroll, Math.min(maxScroll, this.game.camera.position.x));
    }

    handleCollapseButton() {
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
        return document.elementFromPoint(x, y) !== this.game.renderer.domElement;
    }

    screenToWorld(x, y) {
        const mouse = new THREE.Vector2();
        mouse.x = (x / window.innerWidth) * 2 - 1;
        mouse.y = - (y / window.innerHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.game.camera);

        const t = - (this.game.camera.position.z) / raycaster.ray.direction.z;
        const worldPos = new THREE.Vector3();
        worldPos.copy(raycaster.ray.direction).multiplyScalar(t).add(this.game.camera.position);

        return worldPos;
    }

    updateUI(sparklesCount, totalSparklesRate, levelSparklesRate, fireworkCount, autoLauncherLevel, trailEffect, nextCost) {
        const sparklesElement = document.getElementById('ressource-count');
        const isCompact = sparklesElement.classList.contains('compact');
        
        // Format numbers for compact display
        const formatCompactNumber = (num) => {
            if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
            if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toString();
        };
        
        // Update sparkle totals
        const sparkleTotalElements = sparklesElement.querySelectorAll('.sparkle-total');
        sparkleTotalElements.forEach(el => {
            el.textContent = isCompact ? 
                `${formatCompactNumber(sparklesCount)} sp` : 
                `${sparklesCount} sp`;
        });
        
        // Update sparkle rates
        if (isCompact) {
            sparklesElement.querySelector('.sparkle-rate').textContent = 
                ` (+${formatCompactNumber(totalSparklesRate)}/s)`;
        } else {
            sparklesElement.querySelector('.total-rate').textContent = 
                `${totalSparklesRate} sp/s`;
            sparklesElement.querySelector('.level-rate').textContent = 
                `${levelSparklesRate} sp/s`;
        }

        // Update gold totals
        const gold = this.game.resourceManager.resources.gold;
        const goldTotalElements = sparklesElement.querySelectorAll('.gold-total');
        goldTotalElements.forEach(el => {
            el.textContent = gold.formatAmount();
        });

        // Update gold rates
        const goldRateElements = sparklesElement.querySelectorAll('.gold-rate');
        goldRateElements.forEach(el => {
            el.textContent = ` +${gold.perSecond.toFixed(1)}/s`;
        });

        // Add click handler if not already added
        if (!sparklesElement._hasClickHandler) {
            sparklesElement._hasClickHandler = true;
            sparklesElement.addEventListener('click', () => {
                sparklesElement.classList.toggle('compact');
                this.updateUI(sparklesCount, totalSparklesRate, levelSparklesRate, fireworkCount, autoLauncherLevel, trailEffect, nextCost);
            });
        }

        // Update other UI elements
        document.getElementById('firework-count').textContent = fireworkCount;
        document.getElementById('auto-launcher-level').textContent = autoLauncherLevel;
        document.getElementById('recipe-trail-effect').value = trailEffect;
        document.getElementById('auto-launcher-cost').textContent = nextCost;
    }

    updateComponentsList(components, onUpdate) {
        const componentsList = document.getElementById('components-list');
        componentsList.innerHTML = '';

        components.forEach((component, index) => {
            if (!('secondaryColor' in component)) {
                component.secondaryColor = '#00ff00';
            }
            const componentDiv = document.createElement('div');
            componentDiv.classList.add('component');

            componentDiv.innerHTML = `
                <h3>Component ${index + 1}</h3>
                <div class="crafting-option flex-row">
                    <div class="flex-item">
                        <label>Pattern:</label>
                        <select class="pattern-select" data-index="${index}">
                            <option value="spherical">Spherical</option>
                            <option value="ring">Ring</option>
                            <option value="heart">Heart</option>
                            <option value="burst">Burst</option>
                            <option value="palm">Palm</option>
                            <option value="willow">Willow</option>
                            <option value="helix">Helix</option>
                            <option value="star">Star</option>
                            <option value="brokenHeart">Broken Heart</option>
                        </select>
                    </div>
                    <div class="flex-item">
                        <label>Shape:</label>
                        <select class="shape-select" data-index="${index}">
                            <option value="sphere">Sphere</option>
                            <option value="star">Star</option>
                            <option value="ring">Ring</option>
                            <option value="crystalDroplet">Crystal Droplet</option>
                            <option value="sliceBurst">Slice Burst</option>
                        </select>
                    </div>
                </div>
                <div class="crafting-option">
                    <label>Primary Color:</label>
                    <input type="color" class="color-input" data-index="${index}" value="${component.color}">
                </div>
                <div class="crafting-option secondary-color-container" style="display:none;">
                    <label>Secondary Color (Helix Only):</label>
                    <input type="color" class="secondary-color-input" data-index="${index}" value="${component.secondaryColor}">
                </div>
                <div class="crafting-option">
                    <label>Shell Size:</label>
                    <input type="range" class="size-select" data-index="${index}" min="0.3" max="0.7" step="0.05" value="${component.size}">
                </div>
                <div class="crafting-option">
                    <label>Lifetime:</label>
                    <input type="range" class="lifetime-select" data-index="${index}" min="0.5" max="3" step="0.1" value="${component.lifetime}">
                </div>
                <div class="crafting-option">
                    <label>Spread:</label>
                    <input type="range" class="spread-select" data-index="${index}" min="0.5" max="2" step="0.1" value="${component.spread}">
                </div>
                <button class="remove-component" data-index="${index}">Remove Component</button>
            `;
            componentsList.appendChild(componentDiv);

            const patternSelect = componentDiv.querySelector('.pattern-select');
            patternSelect.value = component.pattern;

            const shapeSelect = componentDiv.querySelector('.shape-select');
            shapeSelect.value = component.shape;

            const colorInput = componentDiv.querySelector('.color-input');
            const secondaryColorContainer = componentDiv.querySelector('.secondary-color-container');
            const secondaryColorInput = componentDiv.querySelector('.secondary-color-input');

            const sizeSelect = componentDiv.querySelector('.size-select');
            const lifetimeSelect = componentDiv.querySelector('.lifetime-select');
            const spreadSelect = componentDiv.querySelector('.spread-select');

            const updateSecondaryColorVisibility = () => {
                if (patternSelect.value === 'helix') {
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
                this.updateComponentsList(components, onUpdate);
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
                <div class="crafting-option">
                    <label>Assign Recipe:</label>
                    <select class="recipe-select" data-index="${index}">
                        <option value="">-- Select a Recipe --</option>
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
                    this.game.levels[this.game.currentLevel].autoLaunchers[idx].assignedRecipeIndex = selectedRecipeIndex;
                } else {
                    this.game.levels[this.game.currentLevel].autoLaunchers[idx].assignedRecipeIndex = null;
                }
                this.game.saveProgress();
            });

            const upgradeButton = launcherDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', () => onUpgrade(index));

            launcherDiv.addEventListener('click', () => {
                onSelect(index);
                if (launcher && launcher.mesh) {
                    this.game.setCameraTarget(launcher.mesh.position.x);
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
}

export default UIManager;
