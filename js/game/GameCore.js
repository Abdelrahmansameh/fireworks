import {
    AUTO_LAUNCHER_COST_BASE,
    AUTO_LAUNCHER_COST_RATIO,
    DEFAULT_RECIPE_COMPONENTS,
    DRONE_CONFIG,
    CROWD_CATCHER_CONFIG,
    CROWD_CONFIG,
    GAME_BOUNDS,
} from '../config/config.js';
import Engine from '../engine/Engine.js';
import ProgressionManager from '../upgrades/ProgressionManager.js';
import { PROGRESSION_CONFIG } from '../config/ProgressionConfig.js';
import ResourceManager from '../resources/ResourceManager.js';
import BuildingManager from '../buildings/BuildingManager.js';
import GameMetrics from '../metrics/GameMetrics.js';
import FireworkSystem from '../systems/FireworkSystem.js';
import { patternKeys, patternDefinitions, patternDisplayNames } from '../entities/patterns/index.js';
import { expectedGPS, BASE_GOLD_PER_TOSS, targetCrowdCount } from '../systems/ProductionRates.js';
import { gameStorage } from '../platform/GameStorage.js';
import { GRAND_FINALE_CONFIG } from '../config/GrandFinaleConfig.js';
import EmergentYieldModel from '../sim/EmergentYieldModel.js';
import NullRenderer from '../platform/NullRenderer.js';
import NullAudio from '../platform/NullAudio.js';
import makeNullUI from '../platform/NullUI.js';
import MemoryStorage from '../platform/MemoryStorage.js';
import HeadlessCrowd from '../platform/HeadlessCrowd.js';
import { roundUpToStep } from '../utils/costRounding.js';

export const SAVE_VERSION = '4';

/**
 * GameCore — the headless-capable game-logic engine.
 *
 * Owns all economy / progression state and behaviour: resources, buildings,
 * upgrades, unlocks, firework counts, crowd size, and the per-tick economy
 * step. It depends only on injected *services* (renderer / audio / ui /
 * storage / rng / now), which default to inert null implementations so the
 * whole thing runs with no canvas, audio, or DOM.
 *
 * The live game (FireworkGame) extends this class and swaps in the real
 * renderer/audio/UI plus the visual systems (particles, drones, the real
 * Crowd, cinematics, camera, input). The headless simulator constructs a
 * GameCore directly with `{ headless: true }` and steps it via stepHeadless().
 *
 * Drone collection and crowd-catching income are emergent from particle
 * physics in the live game; headless mode estimates them via EmergentYieldModel
 * (see SimulationConfig.js).
 */
class GameCore extends Engine {
    constructor(options = {}) {
        super();
        this._isRestoring = !(options.headless ?? false);

        // ── Services (overridden by the live subclass) ──────────────────────
        this.headless = options.headless ?? false;
        this.storage = options.storage
            ?? (this.headless ? new MemoryStorage()
                : gameStorage);
        this.rng = options.rng ?? Math.random;
        this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

        // Inert presentation defaults; FireworkGame replaces these with real impls.
        this.renderer2D = new NullRenderer();
        this.audioManager = new NullAudio();
        this.ui = makeNullUI();

        // Keep existing progress when the balance changes.
        if (this.storage.getItem('saveVersion') !== SAVE_VERSION) {
            this.storage.setItem('saveVersion', SAVE_VERSION);
        }

        // ── Core logic state ────────────────────────────────────────────────
        this.gameState = { autoLaunchers: [] };
        this.elapsedGameTime = Number(this.storage.getItem('elapsedGameTime')) || 0;
        this.gameCompleted = this.storage.getItem('gameCompleted') === 'true';
        this.crowdUnlocked = false;
        this.restoreCrowdArrival(this.storage.getItem('crowdStartFireworks'), this.storage.getItem('crowdStartedAt'));
        this.fireworkSystem = new FireworkSystem(this);

        this.recipes = [];
        this.currentRecipeComponents = [...DEFAULT_RECIPE_COMPONENTS];
        this.cursorRecipeIndex = 0;
        this.autoLauncherCost = AUTO_LAUNCHER_COST_BASE;
        this.selectedLauncherIndex = null;

        const firstAuto = (patternDefinitions.find(p => !p.unlockId) || patternDefinitions[0]).key;
        this.unlockedPatternKeys = [firstAuto];

        this.firstClickStates = {
            tabMenu: false,
            buildingsTab: false,
            upgradesTab: false,
            crowdsTab: false,
        };

        this.currentState = 'game';

        // Persistence flags owned by the live subclass; defaulted here so an
        // early saveProgress() (e.g. from applyAll) never reads undefined.
        this.hasSeenFirstCrowdCinematic = false;
        this.advancedCreatorUnlocked = false;

        // Grand Finale climax event. The live game drives the real
        // particle-flooding event via GrandFinaleManager; headless models the
        // income burst in stepHeadless. Both gate on this flag.
        this.grandFinaleUnlocked = false;
        this._finaleSim = { active: false, elapsed: 0, cooldown: 0 };

        this.progression = new ProgressionManager(PROGRESSION_CONFIG);
        this.resourceManager = new ResourceManager(this);
        this.buildingManager = new BuildingManager(this);
        this.statsTracker = new GameMetrics({ storage: this.storage, now: () => this.elapsedGameTime * 1000 });

        // Stat multiplier buckets (recomputed by progression.applyAll).
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

        // Headless-only collaborators.
        this.emergentModel = this.headless ? new EmergentYieldModel() : null;
        this.crowd = this.headless ? new HeadlessCrowd() : null;

        if (this.headless) {
            // Launchers gate firing on having a recipe; seed one so the economy runs.
            this.recipes = [{ name: 'sim', components: DEFAULT_RECIPE_COMPONENTS.map(c => ({ ...c })) }];
        }

        // Restore persisted progression state (no-op in a fresh headless run).
        try {
            const pState = JSON.parse(this.storage.getItem('progressionState') || '{}');
            this.progression.loadState(pState);
            if (pState.firstClicks && typeof pState.firstClicks === 'object') {
                this.firstClickStates = { ...this.firstClickStates, ...pState.firstClicks };
            }
        } catch (e) {
            console.error('Failed to load progression state:', e);
        }

        const savedPatterns = JSON.parse(this.storage.getItem('unlockedPatternKeys') || 'null');
        if (Array.isArray(savedPatterns) && savedPatterns.length > 0) {
            this.unlockedPatternKeys = savedPatterns;
        }

        this.progression.applyAll(this);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Notifications (routed through UI; no-op headless)
    // ════════════════════════════════════════════════════════════════════════

    showNotification(message) {
        this.ui.showNotification(message);
    }

    showConfirmation(title, message, onConfirm) {
        this.ui.showConfirmation(title, message, onConfirm);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Resources
    // ════════════════════════════════════════════════════════════════════════

    addSparkles(amount, source = 'unknown') {
        this.resourceManager.resources.sparkles.add(amount);
        this.statsTracker.record('sparkles', amount, source);
    }

    subtractSparkles(amount) {
        this.resourceManager.resources.sparkles.subtract(amount);
    }

    getSparkles() {
        return this.resourceManager.resources.sparkles.amount;
    }

    getFireworkSparkles() {
        return this.baseSparkleMultiplier;
    }

    getFireworkRecoveryBudget() {
        return this.baseSparkleMultiplier * (this.launcherStats?.sparkleYieldMultiplier ?? 1) * 1.5;
    }

    addGold(amount, source = 'unknown') {
        this.resourceManager.resources.gold.add(amount);
        this.statsTracker.record('gold', amount, source);
    }

    spawnDrone(x, y) {
        if (!this.droneSystem) return;
        const spawnX = x ?? (GAME_BOUNDS.LAUNCHER_MIN_X
            + this.rng() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X));
        const spawnY = y ?? (GAME_BOUNDS.WORLD_LAUNCHER_Y
            + this.rng() * (GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - GAME_BOUNDS.WORLD_LAUNCHER_Y));
        this.droneSystem.spawnDrone(spawnX, spawnY);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Production rates / crowd
    // ════════════════════════════════════════════════════════════════════════

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

    _calculateTargetCrowdCount(production) {
        if (!this.crowdUnlocked) return 0;
        return targetCrowdCount(production, this);
    }

    /** Only a newly purchased crowd opening starts the new arrival schedule. */
    beginCrowdArrival() {
        if (Number.isFinite(this.crowdStartFireworks) && Number.isFinite(this.crowdStartedAt)) return;
        this.crowdStartFireworks = this.fireworkSystem.fireworkCount;
        this.crowdStartedAt = this.elapsedGameTime;
    }

    restoreCrowdArrival(fireworks, startedAt) {
        const present = value => value !== null && value !== undefined && value !== '';
        const valid = present(fireworks) && present(startedAt)
            && Number.isFinite(Number(fireworks)) && Number(fireworks) >= 0
            && Number.isFinite(Number(startedAt)) && Number(startedAt) >= 0;
        this.crowdStartFireworks = valid ? Number(fireworks) : null;
        this.crowdStartedAt = valid ? Number(startedAt) : null;
    }

    clearCrowdArrival() {
        this.crowdStartFireworks = null;
        this.crowdStartedAt = null;
    }

    syncCrowdStats() {
        if (!this.crowd || this.headless) return;
        this.crowd.catchingEnabled = this.crowdStats.catchingEnabled;
        this.crowd.collectionRadius = CROWD_CATCHER_CONFIG.collectionRadius
            * (this.crowdStats.collectionRadiusMultiplier ?? 1);
        this.crowd.goldPerCoinToss = BASE_GOLD_PER_TOSS * (this.crowdStats.goldRateMultiplier ?? 1);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Buildings
    // ════════════════════════════════════════════════════════════════════════

    calculateAutoLauncherCost(numLaunchers) {
        // Mirror Building.getPurchaseCost('AUTO_LAUNCHER', …): clean ending, round up to a multiple of 25.
        return roundUpToStep(AUTO_LAUNCHER_COST_BASE * Math.pow(AUTO_LAUNCHER_COST_RATIO, numLaunchers), 25);
    }

    isBuildingTypeUnlocked(buildingType) {
        switch (buildingType) {
            case 'AUTO_LAUNCHER': return this.progression.isUnlocked('buildings_tab');
            case 'RESOURCE_GENERATOR': return this.progression.isUnlocked('resource_generator');
            case 'CATAPULT': return this.progression.isUnlocked('catapult');
            case 'DRONE_HUB': return this.progression.isUnlocked('drone_hub');
            default: return false;
        }
    }

    grantMilestoneBuilding(type, grantUpgradeId = null) {
        const count = this.buildingManager.getBuildingsByType(type).length;
        const x = type === 'AUTO_LAUNCHER' ? this.buildingManager.getNewBuildingX(type)
            : type === 'CATAPULT' ? GAME_BOUNDS.CATAPULT_MAX_X + count * GAME_BOUNDS.CATAPULT_X_STEP
            : (GAME_BOUNDS.LAUNCHER_MIN_X + GAME_BOUNDS.LAUNCHER_MAX_X) / 2;
        this.buildingManager.createBuilding(type, x, GAME_BOUNDS.BUILDING_Y, { grantUpgradeId });
        this.ui.updateBuildingCounts?.();
        this.ui.updateBuildingCosts?.();
        this.updateLauncherList();
    }

    buyAutoLauncher() {
        const building = this.buildingManager.buyBuilding('AUTO_LAUNCHER');
        if (building) {
            if (!this.progression.isUnlocked('recipes_tab')) {
                const autoUnlockable = patternDefinitions.filter(p => !p.unlockId).map(p => p.key);
                const remaining = autoUnlockable.filter(k => !this.unlockedPatternKeys.includes(k));
                let patternToAssign;
                if (remaining.length > 0) {
                    patternToAssign = remaining[0];
                    this.unlockedPatternKeys.push(patternToAssign);
                } else if (this.unlockedPatternKeys.length > 0) {
                    patternToAssign = this.unlockedPatternKeys[Math.floor(this.rng() * this.unlockedPatternKeys.length)];
                } else {
                    patternToAssign = patternKeys[0];
                }
                if (typeof building.assignedRecipeIndex === 'number' && this.recipes[building.assignedRecipeIndex]) {
                    this.recipes[building.assignedRecipeIndex].components[0].pattern = patternToAssign;
                }
                this.saveProgress();
            }
            this.updateLauncherList();
        }
    }

    buyBuilding(buildingType) {
        if (buildingType === 'AUTO_LAUNCHER') {
            return this.buyAutoLauncher();
        }
        const building = this.buildingManager.buyBuilding(buildingType);
        if (building) {
            this.ui.updateBuildingCounts();
            this.ui.updateBuildingCosts();
            this.ui.updateBuildingListByType(buildingType);
        }
    }

    assignSequentialRecipesToLaunchers() {
        if (!Array.isArray(this.recipes) || this.recipes.length === 0) return;
        const launchers = this.buildingManager.getBuildingsByType('AUTO_LAUNCHER');
        for (let i = 0; i < launchers.length; i++) {
            const launcher = launchers[i];
            if (launcher.assignedRecipeIndex == null) {
                launcher.assignedRecipeIndex = i % this.recipes.length;
            }
        }
    }

    clampToLauncherBounds(x) {
        return Math.max(GAME_BOUNDS.LAUNCHER_MIN_X, Math.min(x, GAME_BOUNDS.LAUNCHER_MAX_X));
    }

    clampToCrowdBounds(x) {
        return Math.max(GAME_BOUNDS.CROWD_LEFT_X, Math.min(x, GAME_BOUNDS.CROWD_RIGHT_X));
    }

    /** Thin UI delegate; the live subclass overrides with the real DOM version. */
    updateLauncherList() {
        this.ui.updateLauncherList?.();
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Upgrades
    // ════════════════════════════════════════════════════════════════════════

    buyUpgrade(id) {
        return this.progression.purchaseUpgrade(id, this);
    }

    recomputeUpgrades() {
        this.progression.applyAll(this);
    }

    resetUpgrades() {
        const refunds = { sparkles: 0, gold: 0 };

        // Included units are part of their upgrade price. Returning that price
        // also returns those units; separately bought buildings stay in place.
        for (const building of [...this.buildingManager.buildings]) {
            if (building.grantUpgradeId) this.buildingManager.removeBuilding(building);
        }

        for (const def of this.progression.getAllUpgradeDefs()) {
            for (const [currency, amount] of Object.entries(this.progression.getUpgradeRefunds(def.id))) {
                refunds[currency] = (refunds[currency] ?? 0) + amount;
            }
        }

        this.progression.resetUpgradesState();
        this.clearCrowdArrival();
        this.unlockedPatternKeys = this.unlockedPatternKeys.filter(key =>
            !patternDefinitions.find(pattern => pattern.key === key)?.unlockId);
        this.progression.applyAll(this);
        this.crowd?.setCount(0);

        for (const [currency, amount] of Object.entries(refunds)) {
            if (amount > 0) this.resourceManager.resources[currency]?.add(amount);
        }

        this.saveProgress();
        this.ui.initializeUnlockStates?.();
        this.ui.updateBuildingCounts?.();
        this.ui.updateBuildingCosts?.();
        this.ui.updateBuildingTypeVisibility?.();
        this.updateLauncherList();
        if (this.ui?.renderUpgrades) this.ui.renderUpgrades();

        return refunds;
    }

    unlockAllUpgrades() {
        let changed = false;
        for (const def of this.progression.getAllUpgradeDefs()) {
            const maxLevel = def.maxLevel ?? 1;
            if (this.progression.getUpgradeLevel(def.id) < maxLevel) {
                this.progression.forceSetLevel(def.id, maxLevel);
                changed = true;
            }
        }
        if (changed) {
            this.progression.applyAll(this);
            this.saveProgress();
            if (this.ui?.renderUpgrades) this.ui.renderUpgrades();
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Unlocks
    // ════════════════════════════════════════════════════════════════════════

    checkUnlockConditions() {
        const newlyUnlocked = this.progression.tick(this);
        for (const id of newlyUnlocked) {
            this._handleUnlock(id);
        }
        if (newlyUnlocked.length > 0) {
            this.saveProgress();
        }
    }

    _handleUnlock(id) {
        // Persist the unlock so isUnlocked() stays true (e.g. after applyAll on reload)
        this.progression.recordUnlock(id);
        // Delegate tab/sub-tab DOM reveals to UIManager (no-op headless)
        this.ui.handleUnlock(id);

        switch (id) {
            case 'crowd':
                this.crowdUnlocked = true;
                this.progression.recordUnlock('crowds_tab');
                this.ui.handleUnlock('crowds_tab');
                this.ui.showCrowdsTab();
                break;
            case 'sparkle_counter':
                this.ui.showSparkleCounter();
                break;
            case 'tab_menu':
                this.ui.showTabMenu();
                this.ui.showCollapseButton();
                this.ui.expandAllTabs();
                break;
            case 'buildings_tab':
                this.ui.showBuildingsTab();
                this.ui.expandAllTabs();
                break;
            case 'upgrades_tab':
                this.ui.showUpgradesTab();
                this.ui.expandAllTabs();
                break;
            case 'crowds_tab':
                this.ui.showCrowdsTab();
                break;
            case 'resource_generator':
                this.showNotification('Sparkle Generator unlocked!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'drone_hub':
                this.showNotification('Drone Hub unlocked!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'catapult':
                this.showNotification('Catapult unlocked!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'recipes_tab':
                this.ui.showRecipesTab();
                this.showNotification('Recipes unlocked!');
                break;
        }
        // Pattern unlocks (from skill-tree upgrades) — id format 'pattern_<key>'
        if (typeof id === 'string' && id.startsWith('pattern_')) {
            const key = id.replace(/^pattern_/, '');
            if (!this.unlockedPatternKeys.includes(key)) {
                this.unlockedPatternKeys.push(key);
                const name = patternDisplayNames[key] || key;
                this.showNotification(`Pattern unlocked: ${name}`);
                this.saveProgress();
            }
        }
    }

    /**
     * Unlock the Grand Finale. Base implementation just flips the flag (so the
     * headless sim models the income burst); the live FireworkGame overrides this
     * to also kick off the first finale and reveal its UI.
     */
    _unlockGrandFinale() {
        this.grandFinaleUnlocked = true;
    }

    onFirstClick(elementType) {
        if (!this.firstClickStates[elementType]) {
            this.firstClickStates[elementType] = true;
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Recipe helpers (data only)
    // ════════════════════════════════════════════════════════════════════════

    getCursorRecipeCount() {
        return (Array.isArray(this.recipes) ? this.recipes.length : 0) + 1; // +1 for default
    }

    getCursorRecipeComponentsAt(index) {
        try {
            if (index === 0) return JSON.parse(JSON.stringify(DEFAULT_RECIPE_COMPONENTS));
            const recipe = this.recipes[index - 1];
            if (recipe && Array.isArray(recipe.components)) return JSON.parse(JSON.stringify(recipe.components));
        } catch (e) {
            console.error('Failed to clone recipe components for cursor cycle:', e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_RECIPE_COMPONENTS));
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Persistence
    // ════════════════════════════════════════════════════════════════════════

    saveProgress() {
        // Headless runs never persist (and must not clobber the player's save).
        if (this.headless || this._isRestoring) return;

        this.storage.setItem('elapsedGameTime', this.elapsedGameTime);
        this.storage.setItem('gameCompleted', this.gameCompleted);
        this.storage.setItem('crowdStartFireworks', JSON.stringify(this.crowdStartFireworks));
        this.storage.setItem('crowdStartedAt', JSON.stringify(this.crowdStartedAt));

        this.storage.setItem('fireworkCount', this.fireworkSystem.fireworkCount);
        this.storage.setItem('autoLauncherCost', this.autoLauncherCost);
        this.storage.setItem('sparkles', this.getSparkles());
        this.storage.setItem('fireworkRecipes', JSON.stringify(this.recipes));

        this.storage.setItem('buildingManagerData', JSON.stringify(this.buildingManager.serialize()));

        this.storage.setItem('gameState', JSON.stringify({ autoLaunchers: [] }));

        this.storage.setItem('currentRecipeComponents', JSON.stringify(this.currentRecipeComponents));
        this.storage.setItem('selectedLauncherIndex', this.selectedLauncherIndex || '');

        this.storage.setItem('resources', JSON.stringify(this.resourceManager.save()));
        this.storage.setItem('advancedCreatorUnlocked', JSON.stringify(this.advancedCreatorUnlocked));

        const progressionState = {
            ...this.progression.getState(),
            firstClicks: this.firstClickStates,
        };
        this.storage.setItem('progressionState', JSON.stringify(progressionState));
        this.storage.setItem('hasSeenFirstCrowdCinematic', JSON.stringify(this.hasSeenFirstCrowdCinematic));
        this.storage.setItem('unlockedPatternKeys', JSON.stringify(this.unlockedPatternKeys));
        this.statsTracker.save();
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Headless economy step
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Advance the economy by `dt` seconds with no presentation. Runs the same
     * building / progression code the live game uses; the only headless-specific
     * pieces are the emergent (drone / crowd-catch) estimate and the crowd-count
     * / gold model that stand in for the absent visual systems.
     */
    stepHeadless(dt, { clicksPerSec = 0 } = {}) {
        // Manual clicks: each launches a firework worth baseSparkleMultiplier.
        if (clicksPerSec > 0) {
            this.fireworkSystem.fireworkCount += clicksPerSec * dt;
            this.addSparkles(clicksPerSec * this.baseSparkleMultiplier * dt, 'manual');
        }

        // Real building economy (launchers fire + count, generators produce).
        this.buildingManager.update(dt);

        // Emergent estimate: drone collection + crowd catching.
        this.emergentModel.applyTick(this, dt, clicksPerSec);

        // Grand Finale income burst (headless model of the live particle flood).
        if (this.grandFinaleUnlocked) this._stepHeadlessFinale(dt);

        // Gold from crowd coin tosses (closed-form; mirrors the live Crowd).
        const gps = expectedGPS(this).total;
        if (gps > 0) this.addGold(gps * dt, 'crowd');

        // Crowd count scales with total fireworks launched (same formula the
        // live game uses) — smooth and monotonic.
        const targetCrowd = this._calculateTargetCrowdCount(this.fireworkSystem.fireworkCount);
        this.crowd.setCount(targetCrowd);

        // Progression unlocks.
        this.checkUnlockConditions();
    }

    /**
     * Headless model of the Grand Finale income burst. The live event floods the
     * sky to the particle cap; here we approximate that as a sustained stream of
     * `simEffectiveFireworksPerSec` launcher-yield fireworks (× sparkleYieldFraction)
     * while active, on the same duration/cooldown cadence as the live manager.
     */
    _stepHeadlessFinale(dt) {
        const cfg = GRAND_FINALE_CONFIG;
        const f = this._finaleSim;
        if (f.active) {
            f.elapsed += dt;
            const yieldMulti = this.launcherStats?.sparkleYieldMultiplier ?? 1;
            const perFw = this.baseSparkleMultiplier * yieldMulti * cfg.sparkleYieldFraction;
            const fw = cfg.simEffectiveFireworksPerSec * dt;
            // Mirror the live finale: income only, no fireworkCount bump (which would
            // inflate the crowd). See GrandFinaleManager._launchOne.
            this.addSparkles(fw * perFw, cfg.sparkleSource);
            if (f.elapsed >= cfg.durationSec) { f.active = false; f.cooldown = cfg.cooldownSec; }
        } else {
            f.cooldown -= dt;
            if (cfg.autoTrigger && f.cooldown <= 0) { f.active = true; f.elapsed = 0; }
        }
    }

    /**
     * Instantaneous sparkles/sec and gold/sec, used by the purchase policy to
     * rank options by time-to-afford.
     */
    currentRates(clicksPerSec = 0) {
        if (!this.headless) {
            return { sps: this.statsTracker.getRollingRate('sparkles'), gps: this.statsTracker.getRollingRate('gold') };
        }
        let sps = this.calculateTotalSparklesPerSecond();
        sps += clicksPerSec * this.baseSparkleMultiplier;
        const em = this.emergentModel.rates(this, clicksPerSec);
        sps += em.drones + em.crowdCatching;
        const gps = expectedGPS(this).total;
        return { sps, gps };
    }
}

export default GameCore;
