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
import { expectedGPS } from '../systems/ProductionRates.js';
import EmergentYieldModel from '../sim/EmergentYieldModel.js';
import NullRenderer from '../platform/NullRenderer.js';
import NullAudio from '../platform/NullAudio.js';
import makeNullUI from '../platform/NullUI.js';
import MemoryStorage from '../platform/MemoryStorage.js';
import HeadlessCrowd from '../platform/HeadlessCrowd.js';

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

        // ── Services (overridden by the live subclass) ──────────────────────
        this.headless = options.headless ?? false;
        this.storage = options.storage
            ?? (this.headless ? new MemoryStorage()
                : (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage()));
        this.rng = options.rng ?? Math.random;
        this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

        // Inert presentation defaults; FireworkGame replaces these with real impls.
        this.renderer2D = new NullRenderer();
        this.audioManager = new NullAudio();
        this.ui = makeNullUI();

        // Clear saves when the save format version changes.
        if (this.storage.getItem('saveVersion') !== SAVE_VERSION) {
            this.storage.clear();
            this.storage.setItem('saveVersion', SAVE_VERSION);
        }

        // ── Core logic state ────────────────────────────────────────────────
        this.gameState = { autoLaunchers: [] };
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

        this.progression = new ProgressionManager(PROGRESSION_CONFIG);
        this.resourceManager = new ResourceManager(this);
        this.buildingManager = new BuildingManager(this);
        this.statsTracker = new GameMetrics();

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
        this.emergentModel = new EmergentYieldModel();
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
        const config = CROWD_CONFIG.scaling;
        const maxCap = CROWD_CONFIG.maxInstances || 1000;
        const bonus = this.crowdStats?.countBonus ?? 0;
        const offset = config.formulaOffset ?? 0;

        if (production <= 0) return Math.min(bonus, maxCap);

        const p = Math.max(0, production - offset);
        const exponent = (typeof config.formulaExp === 'number') ? config.formulaExp : 0.5;
        const a = (typeof config.formulaA === 'number') ? config.formulaA : 1;
        const b = (typeof config.formulaB === 'number') ? config.formulaB : 0;

        const target = Math.floor(a * Math.pow(p, exponent) + b);
        return Math.min(target + bonus, maxCap);
    }

    syncCrowdStats() {
        if (!this.crowd || this.headless) return;
        this.crowd.catchingEnabled = this.crowdStats.catchingEnabled;
        this.crowd.collectionRadius = CROWD_CATCHER_CONFIG.collectionRadius
            * (this.crowdStats.collectionRadiusMultiplier ?? 1);
        this.crowd.goldPerCoinToss = Math.round(1 * (this.crowdStats.goldRateMultiplier ?? 1));
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Buildings
    // ════════════════════════════════════════════════════════════════════════

    calculateAutoLauncherCost(numLaunchers) {
        return Math.floor(AUTO_LAUNCHER_COST_BASE * Math.pow(AUTO_LAUNCHER_COST_RATIO, numLaunchers));
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
        this.progression.purchaseUpgrade(id, this);
    }

    recomputeUpgrades() {
        this.progression.applyAll(this);
    }

    resetUpgrades() {
        const refunds = { sparkles: 0, gold: 0 };

        for (const def of this.progression.getAllUpgradeDefs()) {
            const level = this.progression.getUpgradeLevel(def.id);
            for (let l = 0; l < level; l++) {
                const cost = Math.floor(def.baseCost * Math.pow(def.costRatio, l));
                if (def.currency === 'gold') refunds.gold += cost;
                else refunds.sparkles += cost;
            }
        }

        this.progression.resetUpgradesState();
        this.progression.applyAll(this);

        if (refunds.sparkles > 0) this.resourceManager.resources.sparkles.add(refunds.sparkles);
        if (refunds.gold > 0) this.resourceManager.resources.gold.add(refunds.gold);

        this.saveProgress();
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
                this.showNotification('New building unlocked: Sparkle Generator!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'drone_hub':
                this.showNotification('New building unlocked: Drone Hub!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'catapult':
                this.showNotification('New building unlocked: Catapult!');
                this.ui.updateBuildingTypeVisibility();
                break;
            case 'recipes_tab':
                this.ui.showRecipesTab();
                this.showNotification('Recipe system unlocked! You can now create and assign custom recipes.');
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
        if (this.headless) return;

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
     * Instantaneous sparkles/sec and gold/sec, used by the purchase policy to
     * rank options by time-to-afford.
     */
    currentRates(clicksPerSec = 0) {
        let sps = this.calculateTotalSparklesPerSecond();
        sps += clicksPerSec * this.baseSparkleMultiplier;
        const em = this.emergentModel.rates(this, clicksPerSec);
        sps += em.drones + em.crowdCatching;
        const gps = expectedGPS(this).total;
        return { sps, gps };
    }
}

export default GameCore;
