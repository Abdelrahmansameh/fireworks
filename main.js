const FIREWORK_CONFIG = {
    baseSpeed: 10,
    gravity: 9.81,
    particleSize: 1.0,
    particleDensity: 100,
    ascentSpeed: 40,
    trailLength: 10,
    rocketSize: 0.25,
    minExplosionHeightPercent: 0.4,
    maxExplosionHeightPercent: 0.8,
    patternGravities: {
        spherical: 9.81,
        ring: 8.0,
        heart: 6.0,
        star: 7.0,
        burst: 9.81,
        palm: 5.0,
        willow: 1.0,
        helix: 3.0
    },
    supportedShapes: ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst']
};

const GAME_BOUNDS = {
    MIN_X: -100,
    MAX_X: 100,
    MIN_Y: -50,
    MAX_Y: 50
};

class InstancedParticleSystem {
    constructor(scene, maxParticles = 10000) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.meshes = {};
        this.activeCounts = {};

        const geometries = {
            sphere: new THREE.SphereGeometry(1, 8, 8),
            star: this.createStarGeometry(),
            ring: new THREE.RingGeometry(0.5, 1, 8),
            crystalDroplet: this.createCrystalDropletGeometry(),
            sliceBurst: this.createSliceBurstGeometry()
        };

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const geometry = geometries[shape];
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });

            const instancedMesh = new THREE.InstancedMesh(
                geometry,
                material,
                maxParticles
            );

            instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(maxParticles * 3),
                3
            );

            this.meshes[shape] = instancedMesh;
            this.activeCounts[shape] = 0;
            scene.add(instancedMesh);
        });

        this.positions = {};
        this.velocities = {};
        this.colors = {};
        this.scales = {};
        this.lifetimes = {};
        this.initialLifetimes = {};
        this.gravities = {};
        this.alphas = {};
        this.rotations = {};

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.positions[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Vector3());
            this.velocities[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Vector3());
            this.colors[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Color());
            this.scales[shape] = new Float32Array(maxParticles);
            this.lifetimes[shape] = new Float32Array(maxParticles);
            this.initialLifetimes[shape] = new Float32Array(maxParticles);
            this.gravities[shape] = new Float32Array(maxParticles);
            this.alphas[shape] = new Float32Array(maxParticles).fill(1.0);
            this.rotations[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Quaternion());
        });

        this.matrix = new THREE.Matrix4();
        this.tempData = {};
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.tempData[shape] = {
                matrix: new THREE.Matrix4(),
                color: new THREE.Color()
            };
        });
    }

    createStarGeometry() {
        const shape = new THREE.Shape();
        const outerRadius = 2;
        const innerRadius = 1;
        const spikes = 5;
        const step = Math.PI / spikes;

        shape.moveTo(outerRadius, 0);
        for (let i = 0; i < spikes * 2; i++) {
            const radius = (i % 2 === 0) ? outerRadius : innerRadius;
            const angle = i * step;
            shape.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
        }
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }

    createCrystalDropletGeometry() {
        const shape = new THREE.Shape();
        const width = 2;
        const height = 5;

        shape.moveTo(0, 0);
        shape.bezierCurveTo(width / 2, height / 2, width / 2, height, 0, height);
        shape.bezierCurveTo(-width / 2, height, -width / 2, height / 2, 0, 0);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }

    createSliceBurstGeometry(base = 1, height = 5) {
        const shape = new THREE.Shape();

        shape.moveTo(-base / 2, 0);
        shape.lineTo(base / 2, 0);
        shape.lineTo(0, -height);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }

    addParticle(position, velocity, color, scale, lifetime, gravity, shape = 'sphere') {
        if (!FIREWORK_CONFIG.supportedShapes.includes(shape)) {
            shape = 'sphere';
        }

        const activeCount = this.activeCounts[shape];

        if (activeCount >= this.maxParticles) return -1;

        const index = activeCount;

        this.positions[shape][index].copy(position);
        this.velocities[shape][index].copy(velocity);
        this.colors[shape][index].copy(color);
        this.scales[shape][index] = scale;
        this.lifetimes[shape][index] = lifetime;
        this.initialLifetimes[shape][index] = lifetime;
        this.gravities[shape][index] = gravity;
        this.alphas[shape][index] = 1.0;

        const normalizedVelocity = velocity.clone().normalize();
        const targetDir = normalizedVelocity.clone().multiplyScalar(-1);
        const defaultFront = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultFront, targetDir);
        this.rotations[shape][index].copy(quaternion);

        this.updateParticleTransform(shape, index);

        this.activeCounts[shape]++;
        return index;
    }

    updateParticleTransform(shape, index) {
        const position = this.positions[shape][index].clone();
        const quaternion = this.rotations[shape][index].clone();

        this.matrix.makeRotationFromQuaternion(quaternion);

        const scale = this.scales[shape][index];
        this.matrix.scale(new THREE.Vector3(scale, scale, scale));

        this.matrix.setPosition(position.x, position.y, position.z);

        this.meshes[shape].setMatrixAt(index, this.matrix);

        this.tempData[shape].color.copy(this.colors[shape][index]);
        this.tempData[shape].color.multiplyScalar(this.alphas[shape][index]);
        this.meshes[shape].setColorAt(index, this.tempData[shape].color);
    }

    update(delta) {
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            let nextFreeIndex = 0;
            const activeCount = this.activeCounts[shape];

            for (let i = 0; i < activeCount; i++) {
                this.lifetimes[shape][i] -= delta;

                if (this.lifetimes[shape][i] > 0) {
                    if (i !== nextFreeIndex) {
                        this.positions[shape][nextFreeIndex].copy(this.positions[shape][i]);
                        this.velocities[shape][nextFreeIndex].copy(this.velocities[shape][i]);
                        this.colors[shape][nextFreeIndex].copy(this.colors[shape][i]);
                        this.scales[shape][nextFreeIndex] = this.scales[shape][i];
                        this.lifetimes[shape][nextFreeIndex] = this.lifetimes[shape][i];
                        this.initialLifetimes[shape][nextFreeIndex] = this.initialLifetimes[shape][i];
                        this.gravities[shape][nextFreeIndex] = this.gravities[shape][i];
                        this.alphas[shape][nextFreeIndex] = this.alphas[shape][i];
                        this.rotations[shape][nextFreeIndex].copy(this.rotations[shape][i]);
                    }

                    this.velocities[shape][nextFreeIndex].y -= this.gravities[shape][nextFreeIndex] * delta;
                    this.positions[shape][nextFreeIndex].addScaledVector(
                        this.velocities[shape][nextFreeIndex],
                        delta
                    );

                    const normalizedLifetime = this.lifetimes[shape][nextFreeIndex] /
                        this.initialLifetimes[shape][nextFreeIndex];
                    this.alphas[shape][nextFreeIndex] = Math.pow(normalizedLifetime, 3);

                    this.updateParticleTransform(shape, nextFreeIndex);
                    nextFreeIndex++;
                }
            }

            this.activeCounts[shape] = nextFreeIndex;
            this.meshes[shape].count = nextFreeIndex;

            if (this.meshes[shape].instanceMatrix) {
                this.meshes[shape].instanceMatrix.needsUpdate = true;
            }
            if (this.meshes[shape].instanceColor) {
                this.meshes[shape].instanceColor.needsUpdate = true;
            }
        });
    }

    dispose() {
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.scene.remove(this.meshes[shape]);
            this.meshes[shape].geometry.dispose();
            this.meshes[shape].material.dispose();
            this.rotations[shape] = null;
        });
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
            this.activeCounts[shape] = 0;
            this.meshes[shape].count = 0;
            this.meshes[shape].instanceMatrix.needsUpdate = true;
            if (this.meshes[shape].instanceColor) {
                this.meshes[shape].instanceColor.needsUpdate = true;
            }
        });
    }
}

class FireworkGame {
    constructor() {
        this.currentLevel = parseInt(localStorage.getItem('currentLevel')) || 0;

        const savedLevels = JSON.parse(localStorage.getItem('levels'));
        if (savedLevels) {
            this.levels = savedLevels.map(levelData => ({
                fireworks: [],
                autoLaunchers: levelData.autoLaunchers || [],
                unlocked: levelData.unlocked || false
            }));
        } else {
            // Create default first level (always unlocked)
            this.levels = [{
                fireworks: [],
                autoLaunchers: [],
                unlocked: true
            }];
        }

        this.debugInfo = {
            activeFireworks: 0,
            totalParticles: 0,
            gpuMemory: 0
        };

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = null;

        this.recipes = [];
        this.currentRecipeComponents = [];
        this.currentTrailEffect = 'fade';
        this.fireworkCount = parseInt(localStorage.getItem('fireworkCount')) || 0;
        this.autoLauncherCost = parseInt(localStorage.getItem('autoLauncherCost')) || 10;
        this.sparkles = parseInt(localStorage.getItem('sparkles')) || 0;

        const savedSelectedIndex = parseInt(localStorage.getItem('selectedLauncherIndex'));
        if (!isNaN(savedSelectedIndex) && savedSelectedIndex < this.levels[this.currentLevel].autoLaunchers.length) {
            this.selectedLauncherIndex = savedSelectedIndex;
            this.selectLauncher(this.selectedLauncherIndex);
        } else {
            this.selectedLauncherIndex = null;
        }

        this.isMobile = this.detectMobile();
        this.initThreeJS();
        this.initBackgroundColor();

        this.particleSystem = new InstancedParticleSystem(this.scene, 50000);

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

        this.bindEvents();

        this.loadRecipes();
        this.loadCurrentRecipe();
        this.updateUI();
        this.updateComponentsList();
        this.updateRecipeList();
        this.updateLauncherList();
        this.draggingLauncher = null;
        this.isDragging = false;
        this.isScrollDragging = false;
        this.lastPointerX = 0;
        this.animate();

        const gameContainer = document.getElementById('game-container');
        gameContainer.style.touchAction = 'none';

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.pause();
            } else if (document.visibilityState === 'visible') {
                this.resume();
            }
        });

        this.updateLevelDisplay();
        this.updateLevelsList(); // Update the Levels tab UI
        this.updateLevelArrows();
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
        GAME_BOUNDS.MAX_Y = this.visibleHeight / 2;
        GAME_BOUNDS.MIN_X = -this.visibleWidth / 2;
        GAME_BOUNDS.MAX_X = this.visibleWidth / 2;

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

    }

    handleWheelScroll(event) {
        if (this.isClickInsideUI(event)) {
            return;
        }

        const wheelScrollSpeed = 0.05;
        const scrollAmount = event.deltaY * wheelScrollSpeed;

        this.camera.position.x += scrollAmount;

        // Use absolute bounds for scroll limits
        const maxScroll = (GAME_BOUNDS.MAX_X - GAME_BOUNDS.MIN_X) * 0.5;
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

            const clampedX = Math.max(GAME_BOUNDS.MIN_X, Math.min(worldPos.x, GAME_BOUNDS.MAX_X));

            this.draggingLauncher.mesh.position.x = clampedX;
            this.draggingLauncher.x = clampedX;
            this.saveProgress();
        } else if (this.isScrollDragging) {
            const deltaX = e.clientX - this.lastPointerX;
            const dragScrollSpeed = 0.2;

            this.camera.position.x -= deltaX * dragScrollSpeed;

            const maxScroll = (GAME_BOUNDS.MAX_X - GAME_BOUNDS.MIN_X) * 0.5;
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

            // If it was a very small drag, treat it as a click and launch a firework
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

        const confirmHandler = () => {
            onConfirm();
            hide();
        };
        const cancelHandler = () => {
            hide();
        };
        const hide = () => {
            confirmationDialog.style.display = 'none';
            overlay.style.display = 'none';
            confirmAction.removeEventListener('click', confirmHandler);
            cancelAction.removeEventListener('click', cancelHandler);
        };

        confirmAction.addEventListener('click', confirmHandler);
        cancelAction.addEventListener('click', cancelHandler);
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
        const tabs = document.querySelector('.tabs');
        if (tabs.classList.contains('collapsed')) {
            tabs.classList.remove('collapsed');
        }
        const contentId = tab + '-content';
        const tabElement = document.getElementById(tab + '-tab');
        const contentElement = document.getElementById(contentId);

        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

        contentElement.classList.add('active');
        tabElement.classList.add('active');

        if (tab === 'auto-launcher') {
            this.updateLauncherList();
        }
        if (tab === 'levels') {
            this.updateLevelsList();
        }
    }

    toggleTab(tab) {
        const contentId = tab + '-content';
        const tabElement = document.getElementById(tab + '-tab');
        const contentElement = document.getElementById(contentId);

        if (contentElement.classList.contains('active')) {
            contentElement.classList.remove('active');
            tabElement.classList.remove('active');
        } else {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
            contentElement.classList.add('active');
            tabElement.classList.add('active');
        }
    }

    updateUI() {
        const currentLevelSparklesPerSec = this.calculateSparklesPerSecond(this.levels[this.currentLevel]).toFixed(2);
        const totalSparklesPerSec = this.calculateTotalSparklesPerSecond().toFixed(2);

        document.getElementById('sparkles-count').innerHTML = `
        <div class="sparkles-count-main">Sparkles: ${Math.round(this.sparkles).toLocaleString()}</div>
        <div class="sparkles-count-rates">
            Total: +${totalSparklesPerSec}/s<br>
            Level: +${currentLevelSparklesPerSec}/s
        </div>
    `;

        document.getElementById('firework-count').textContent = this.fireworkCount;
        document.getElementById('auto-launcher-level').textContent = this.levels[this.currentLevel].autoLaunchers.length;
        document.getElementById('recipe-trail-effect').value = this.currentTrailEffect;

        const nextCost = this.calculateAutoLauncherCost(this.levels[this.currentLevel].autoLaunchers.length);
        document.getElementById('auto-launcher-cost').textContent = nextCost;
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
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.classList.add('show');

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

            this.debugInfo.activeFireworks = currentFireworks.length;
            this.debugInfo.totalParticles = Object.values(this.particleSystem.activeCounts).reduce((a, b) => a + b, 0);

            this.debugInfo.gpuMemory = (
                (FIREWORK_CONFIG.supportedShapes.length * this.particleSystem.meshes[FIREWORK_CONFIG.supportedShapes[0]].geometry.attributes.position.array.length * 4) +
                (this.particleSystem.meshes[FIREWORK_CONFIG.supportedShapes[0]].instanceMatrix.array.length * 4) +
                (this.particleSystem.meshes[FIREWORK_CONFIG.supportedShapes[0]].instanceColor.array.length * 4)
            ) / (1024 * 1024);

            this.update(delta);

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
            // Use absolute bounds for positioning
            const x = GAME_BOUNDS.MIN_X + (Math.random() * (GAME_BOUNDS.MAX_X - GAME_BOUNDS.MIN_X));
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
            this.showNotification("Auto-Launcher purchased!");
            this.updateLauncherList();
        } else {
            this.showNotification("Not enough sparkles to buy this upgrade!");
        }
    }

    calculateAutoLauncherCost(numLaunchers) {
        return Math.floor(10 * Math.pow(1.5, numLaunchers));
    }

    createAutoLauncherMesh(launcher) {
        const width = 3;
        const height = 6;
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
                    launcher.mesh.geometry.dispose();
                    launcher.mesh.material.dispose();
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

        this.levels = [{ fireworks: [], autoLaunchers: [], unlocked: true }];
        this.currentLevel = 0;

        if (this.particleSystem) {
            this.particleSystem.dispose();
            this.particleSystem = new InstancedParticleSystem(this.scene, 50000);
        }

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
    }

    eraseAllRecipes() {
        this.recipes = [];
        localStorage.removeItem('fireworkRecipes');
        this.updateRecipeList();
        this.showNotification("All recipes have been erased.");
    }

    updateComponentsList() {
        const componentsList = document.getElementById('components-list');
        componentsList.innerHTML = '';

        this.currentRecipeComponents.forEach((component, index) => {
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
                            <label>Shell Size (0.3 - 0.7):</label>
                            <input type="range" class="size-select" data-index="${index}" min="0.3" max="0.7" step="0.05" value="${component.size}">
                            <span class="size-value">${component.size}</span>
                        </div>
                        <div class="crafting-option">
                            <label>Lifetime (0.5 - 3 seconds):</label>
                            <input type="range" class="lifetime-select" data-index="${index}" min="0.5" max="3" step="0.1" value="${component.lifetime}">
                            <span class="lifetime-value">${component.lifetime}</span>
                        </div>
                        <div class="crafting-option">
                            <label>Spread (0.5 - 2.0):</label>
                            <input type="range" class="spread-select" data-index="${index}" min="0.5" max="2" step="0.1" value="${component.spread}">
                            <span class="spread-value">${component.spread}</span>
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
            const sizeValue = componentDiv.querySelector('.size-value');

            const lifetimeSelect = componentDiv.querySelector('.lifetime-select');
            const lifetimeValue = componentDiv.querySelector('.lifetime-value');

            const spreadSelect = componentDiv.querySelector('.spread-select');
            const spreadValue = componentDiv.querySelector('.spread-value');

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
                this.currentRecipeComponents[idx].pattern = e.target.value;
                updateSecondaryColorVisibility();
                this.saveCurrentRecipeComponents();
            });

            shapeSelect.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].shape = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            colorInput.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].color = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            secondaryColorInput.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].secondaryColor = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            sizeSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].size = parseFloat(e.target.value);
                sizeValue.textContent = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            lifetimeSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].lifetime = parseFloat(e.target.value);
                lifetimeValue.textContent = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            spreadSelect.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents[idx].spread = parseFloat(e.target.value);
                spreadValue.textContent = e.target.value;
                this.saveCurrentRecipeComponents();
            });

            const removeButton = componentDiv.querySelector('.remove-component');
            removeButton.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.currentRecipeComponents.splice(idx, 1);
                this.updateComponentsList();
                this.saveCurrentRecipeComponents();
            });
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
        const list = document.getElementById('recipe-list');
        if (this.recipes.length === 0) {
            list.innerHTML = "<p>No recipes saved yet.</p>";
            return;
        }
        list.innerHTML = this.recipes.map((recipe, index) => `
                    <div class="recipe-card" onclick="game.selectRecipe(${index})" style="cursor: pointer; padding: 10px; border: 1px solid #34495e; border-radius: 5px; margin-bottom: 10px; background: #2a2f3a;">
                        <strong>${recipe.name || `Recipe ${index + 1}`}</strong><br>
                        <div>Trail Effect: ${this.getReadableTrailEffect(recipe.trailEffect)}</div>
                        ${recipe.components.map((component, cIndex) => `
                            <div>
                                <strong>Component ${cIndex + 1}:</strong><br>
                                Pattern: ${component.pattern}<br>
                                Shape: ${this.getReadableShape(component.shape)}<br>
                                Size: ${component.size}<br>
                                Lifetime: ${component.lifetime} s<br>
                                Spread: ${component.spread}<br>
                                Color(s): <div class="color-preview" style="width: 20px; height: 20px; background-color: ${component.color}; border: 1px solid #fff; display: inline-block;"></div>
                                ${component.pattern === 'helix' ? `<div class="color-preview" style="width: 20px; height: 20px; background-color: ${component.secondaryColor}; border: 1px solid #fff; display: inline-block;"></div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `).join('');
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
        const launcherList = document.getElementById('launcher-list');
        launcherList.innerHTML = '';

        if (this.levels[this.currentLevel].autoLaunchers.length === 0) {
            launcherList.innerHTML = "<p>No auto-launchers owned yet.</p>";
            return;
        }

        this.levels[this.currentLevel].autoLaunchers.forEach((launcher, index) => {
            const launcherDiv = document.createElement('div');
            launcherDiv.classList.add('launcher-card');
            if (index === this.selectedLauncherIndex) {
                launcherDiv.classList.add('selected');
            }

            launcherDiv.innerHTML = `
                        <h3>Auto-Launcher ${index + 1}</h3>
                        <div class="crafting-option">
                            <label>Assign Recipe:</label>
                            <select class="recipe-select" data-index="${index}">
                                <option value="">-- Select a Recipe --</option>
                                ${this.recipes.map((recipe, rIndex) => `
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
                    this.levels[this.currentLevel].autoLaunchers[idx].assignedRecipeIndex = selectedRecipeIndex;
                } else {
                    this.levels[this.currentLevel].autoLaunchers[idx].assignedRecipeIndex = null;
                }
                this.saveProgress();
            });

            const upgradeButton = launcherDiv.querySelector('.upgrade-button');
            upgradeButton.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                this.upgradeLauncher(idx);
            });

            launcherDiv.addEventListener('click', () => {
                this.selectLauncher(index);
                const launcher = this.levels[this.currentLevel].autoLaunchers[index];
                if (launcher && launcher.mesh) {
                    this.setCameraTarget(launcher.mesh.position.x);
                }
            });
        });
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
            launcher.upgradeCost = Math.floor(launcher.upgradeCost * 1.5);

            this.saveProgress();
            this.updateUI();
            this.updateLauncherList();
            this.showNotification(`Auto-Launcher ${index + 1} upgraded to level ${launcher.level}!`);
        } else {
            this.showNotification("Not enough sparkles to upgrade this launcher!");
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
            selectedLauncherIndex: this.selectedLauncherIndex
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
}

class Firework {
    constructor(x, y, components, scene, camera, trailEffect, particleSystem) {
        this.scene = scene;
        this.camera = camera;
        this.components = components;
        this.trailEffect = trailEffect;
        this.particleSystem = particleSystem;
        this.exploded = false;
        this.alive = true;
        this.particles = {};

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape] = new Set();
        });

        this.rocket = this.createRocket(x, y);
        this.trailParticles = [];

        const distance = this.camera.position.z - this.rocket.position.z;
        const vFOV = this.camera.fov * Math.PI / 180;
        const viewHeight = 2 * Math.tan(vFOV / 2) * distance;

        const minY = -viewHeight / 2 + FIREWORK_CONFIG.minExplosionHeightPercent * viewHeight;
        const maxY = -viewHeight / 2 + FIREWORK_CONFIG.maxExplosionHeightPercent * viewHeight;

        this.targetY = minY + Math.random() * (maxY - minY);
    }

    createRocket(x, y) {
        const geometry = new THREE.SphereGeometry(FIREWORK_CONFIG.rocketSize, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const rocket = new THREE.Mesh(geometry, material);
        rocket.position.set(x, y, 0);
        this.scene.add(rocket);
        return rocket;
    }

    update(delta) {
        if (!this.exploded) {
            this.rocket.position.y += FIREWORK_CONFIG.ascentSpeed * delta;
            this.createTrailParticle(this.rocket.position.x, this.rocket.position.y);

            this.updateTrailParticles(delta);

            if (this.rocket.position.y >= this.targetY) {
                this.explode();
            }
        } else {
            this.alive = false;
            FIREWORK_CONFIG.supportedShapes.forEach(shape => {
                if (this.particles[shape].size > 0) {
                    this.alive = true;
                }
            });
        }
    }

    createTrailParticle(x, y) {
        let material;
        switch (this.trailEffect) {
            case 'sparkle':
                const groupSize = 5;  // Number of particles in each sparkle group
                const groupSpread = 0.3;  // How far particles spread from center
                const groupTime = Date.now();  // Shared timestamp for the group
                const groupId = Math.floor(groupTime / 100);  // Group identifier
                
                for (let i = 0; i < groupSize; i++) {
                    const angle = (Math.PI * 2 * i) / groupSize;
                    const offsetX = x + Math.cos(angle) * groupSpread * Math.random();
                    const offsetY = y + Math.sin(angle) * groupSpread * Math.random();
                    
                    material = new THREE.PointsMaterial({
                        color: 0xffffff,
                        size: 0.2 + Math.random() * 0.2,
                        transparent: true,
                        opacity: 0.8,
                        blending: THREE.AdditiveBlending
                    });
                    
                    const geometry = new THREE.BufferGeometry();
                    const positions = new Float32Array([offsetX, offsetY, 0]);
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    const particle = new THREE.Points(geometry, material);
                    this.scene.add(particle);
                    
                    this.trailParticles.push({
                        mesh: particle,
                        createdAt: groupTime,
                        initialOpacity: 0.8,
                        groupId: groupId
                    });
                }
                break;

            case 'rainbow':
                const hue = (Date.now() * 0.001) % 1;
                const color = new THREE.Color();
                color.setHSL(hue, 1, 0.5);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const sphere = new THREE.SphereGeometry(0.2, 4, 4);
                const mesh = new THREE.Mesh(sphere, material);
                mesh.position.set(x, y, 0);
                this.scene.add(mesh);
                this.trailParticles.push({
                    mesh: mesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8,
                    color: color.clone()
                });
                break;

            case 'comet':
                material = new THREE.MeshBasicMaterial({
                    color: 0xffaa00,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const cometGeometry = new THREE.SphereGeometry(0.3, 4, 4);
                const cometMesh = new THREE.Mesh(cometGeometry, material);
                cometMesh.position.set(x, y, 0);
                this.scene.add(cometMesh);
                this.trailParticles.push({
                    mesh: cometMesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8,
                    scale: 1.0
                });
                break;

            case 'fade':
            default:
                material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const defaultGeometry = new THREE.SphereGeometry(0.2, 4, 4);
                const defaultMesh = new THREE.Mesh(defaultGeometry, material);
                defaultMesh.position.set(x, y, 0);
                this.scene.add(defaultMesh);
                this.trailParticles.push({
                    mesh: defaultMesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8
                });
                break;
        }
    }

    updateTrailParticles(delta) {
        const now = Date.now();
        const flickerSpeed = 8;  
        
        const groups = {};
        this.trailParticles.forEach(particle => {
            if (particle.groupId) {
                if (!groups[particle.groupId]) {
                    groups[particle.groupId] = [];
                }
                groups[particle.groupId].push(particle);
            }
        });

        this.trailParticles.forEach((particle, index) => {
            const age = (now - particle.createdAt) / 500;

            if (age >= 1) return;

            switch (this.trailEffect) {
                case 'sparkle':
                    if (particle.groupId) {
                        // Calculate a shared brightness for the group
                        const groupPhase = (now * flickerSpeed + particle.groupId * 1000) / 1000;
                        const groupBrightness = 0.3 + (Math.sin(groupPhase) * 0.5 + 0.5) * 0.7;
                        
                        particle.mesh.material.size = (0.2 + Math.random() * 0.2) * (1 - age * 0.5);
                        particle.mesh.material.opacity = particle.initialOpacity * groupBrightness * (1 - age);
                    } else {
                        // Fallback for any particles without a group
                        particle.mesh.material.size = (0.3 + Math.random() * 0.3) * (1 - age);
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    }
                    break;

                case 'rainbow':
                    if (particle.groupId) {
                        // Calculate a shared hue for the group
                        const groupPhase = (now * flickerSpeed + particle.groupId * 1000) / 1000;
                        const groupHue = (groupPhase + index * 0.1) % 1;
                        
                        particle.color.setHSL(groupHue, 1, 0.5);
                        particle.mesh.material.color = particle.color;
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    } else {
                        // Fallback for any particles without a group
                        const hue = ((now * 0.001) + index * 0.1) % 1;
                        particle.color.setHSL(hue, 1, 0.5);
                        particle.mesh.material.color = particle.color;
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    }
                    break;

                case 'comet':
                    particle.scale = Math.max(0.0001, particle.scale * 1.1 * (1 - age));
                    particle.mesh.scale.set(particle.scale, particle.scale, particle.scale);
                    particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    particle.mesh.position.y += delta * 2;
                    break;

                case 'fade':
                default:
                    particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    break;
            }
        });

        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const particle = this.trailParticles[i];
            if (Date.now() - particle.createdAt > 500) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
                this.trailParticles.splice(i, 1);
            }
        }
    }

    explode() {
        this.scene.remove(this.rocket);
        if (this.rocket.geometry) this.rocket.geometry.dispose();
        if (this.rocket.material) this.rocket.material.dispose();

        this.trailParticles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
            }
        });
        this.trailParticles = [];

        this.components.forEach(component => {
            const particleCount = Math.floor(FIREWORK_CONFIG.particleDensity * component.size);
            const pattern = component.pattern;
            const gravity = FIREWORK_CONFIG.patternGravities[pattern] || FIREWORK_CONFIG.patternGravities.default;
            const speed = FIREWORK_CONFIG.baseSpeed * component.size;
            const color = new THREE.Color(component.color);
            const secondaryColor = new THREE.Color(component.secondaryColor || '#00ff00');
            const size = FIREWORK_CONFIG.particleSize * component.size;
            const rocketPos = this.rocket.position.clone();
            const velocity = new THREE.Vector3();
            const shape = component.shape;
            const spread = component.spread;

            // Pattern explosion code unchanged from original, included fully

            switch (pattern) {
                case 'spherical':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = (i / particleCount) * Math.PI * 2;
                        const magnitude = speed * (0.8 + Math.random() * 0.4) * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity * (0.8 + Math.random() * 0.4),
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'ring':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = (i / particleCount) * Math.PI * 2;
                        const magnitude = speed * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity * (0.8 + Math.random() * 0.2),
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'burst':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const magnitude = speed * Math.random() * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'palm':
                    const branches = 8;
                    const particlesPerBranch = Math.floor(particleCount / branches);
                    for (let i = 0; i < particleCount; i++) {
                        const branch = i % branches;
                        const particleInBranch = Math.floor(i / branches);
                        const baseAngle = (branch / branches) * Math.PI * 2;
                        const angleSpread = 0.3 * (particleInBranch / particlesPerBranch);
                        const angle = baseAngle + (Math.random() - 0.5) * angleSpread;
                        const magnitude = speed * (1.2 + particleInBranch / particlesPerBranch) * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'willow':
                    const emissionAngle = 0.5;
                    for (let i = 0; i < particleCount; i++) {
                        const angleOffset = (Math.random() * 1.2 - 0.5) * emissionAngle;
                        const angle = (-Math.PI / 2) + angleOffset;
                        const horizontalDrift = (Math.random() - 0.5) * 10;
                        const initialSpeed = speed * (0.7 + Math.random() * 0.3) * spread;
                        velocity.set(
                            Math.cos(angle) * initialSpeed + horizontalDrift,
                            Math.sin(angle) * initialSpeed,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'heart':
                    const heartScale = spread;
                    for (let i = 0; i < particleCount; i++) {
                        const t = (i / particleCount) * Math.PI * 2;
                        const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
                        const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                        const angle = Math.atan2(yOffset, xOffset);
                        const magnitude = speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.05;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity * (0.8 + Math.random() * 0.2),
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'helix':
                    const helixRadius = 0.5;
                    const riseSpeed = speed * 0.1 * spread;
                    const rotationSpeed = 2;
                    const particlesPerStream = 100;
                    const verticalSpacing = 0.1;
                    const spreadFactor = 0.1;

                    for (let stream = 0; stream < 2; stream++) {
                        const streamOffset = stream * Math.PI;
                        for (let i = 0; i < particlesPerStream; i++) {
                            const t = (i / particlesPerStream) * Math.PI * 2;
                            const angle = t + streamOffset;

                            const randomSpread = (Math.random() - 0.5) * spreadFactor;
                            const offset = new THREE.Vector3(
                                Math.cos(angle) * helixRadius * (1 + randomSpread),
                                -i * verticalSpacing,
                                Math.sin(angle) * helixRadius * (1 + randomSpread)
                            );

                            velocity.set(
                                -Math.sin(angle) * rotationSpeed,
                                riseSpeed * (1 + randomSpread),
                                Math.cos(angle) * rotationSpeed
                            );
                            const particleColor = new THREE.Color();
                            if (stream === 1) {
                                particleColor.copy(secondaryColor);
                            } else {
                                particleColor.copy(color);
                            }

                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone().add(offset),
                                particleColor,
                                size,
                                component.lifetime,
                                gravity * 0.2,
                                shape
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                    }
                    break;

                case 'star':
                    const spikes = 5;
                    const outerRadius = speed * spread;
                    const innerRadius = speed * 0.5 * spread;
                    const pointsPerStar = spikes * 2;

                    for (let i = 0; i < particleCount; i++) {
                        const starPoint = i % pointsPerStar;
                        const starCopy = Math.floor(i / pointsPerStar);
                        let radius = (starPoint % 2 === 0) ? outerRadius : innerRadius;
                        let angle = (starPoint / pointsPerStar) * Math.PI * 2;

                        if (i > pointsPerStar && (starPoint % 2 === 0)) {
                            radius = outerRadius * (1 + (Math.random() * 0.2 - 0.1));
                        }

                        const radiusVariation = 1 + (Math.random() * 0.2 - 0.1) * (starCopy > 0 ? 1 : 0);
                        const angleVariation = (Math.random() * 0.1 - 0.05) * (starCopy > 0 ? 1 : 0);

                        velocity.set(
                            Math.cos(angle + angleVariation) * radius * radiusVariation,
                            Math.sin(angle + angleVariation) * radius * radiusVariation,
                            0
                        );

                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                default:
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const magnitude = speed * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
            }
        });
        this.exploded = true;
    }

    dispose() {
        if (this.rocket) {
            this.scene.remove(this.rocket);
            if (this.rocket.geometry) this.rocket.geometry.dispose();
            if (this.rocket.material) this.rocket.material.dispose();
            this.rocket = null;
        }

        this.trailParticles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
            }
        });
        this.trailParticles = [];

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape].clear();
        });

        this.alive = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new FireworkGame();
});
