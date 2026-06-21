import PurchasePolicy from '../sim/PurchasePolicy.js';
import { BUILDING_TYPES } from '../config/config.js';
import { GAME_BOUNDS } from '../config/GameBoundsConfig.js';

/**
 * GameBot — an automated player that drives the LIVE (rendered + physics) game.
 *
 * It exists to measure how long it takes to beat the game and to sanity-check
 * pacing / costs / stats against the real economy (as opposed to the headless
 * simulator). The bot:
 *   • launches fireworks a configurable number of times per second,
 *   • buys every affordable upgrade/building as soon as possible,
 *   • throws a crowd member toward the fireworks every 10s once crowd catching
 *     is unlocked,
 *   • stops and emits a final report once every upgrade is maxed.
 *
 * Design note — "minimal changes when adding content": the bot owns NO game
 * data. Purchasing is delegated to {@link PurchasePolicy}, which enumerates the
 * data-driven upgrade/building defs and buys through the real `buyUpgrade` /
 * `buyBuilding` APIs. New upgrades/buildings are picked up automatically.
 */
export default class GameBot {
    constructor(game) {
        this.game = game;

        // ── Config (driven by the Bot tab) ───────────────────────────────
        this.clicksPerSec = 5;
        this.speedMultiplier = 1;        // 1..50 — applied as integer update sub-steps

        // ── Run state ────────────────────────────────────────────────────
        this.enabled = false;
        this.complete = false;
        this.gameTime = 0;               // accumulated in-game seconds (start-relative)
        this.events = [];                // { time, type, label }
        this.finalReport = null;

        // ── Internal timers ──────────────────────────────────────────────
        this._clickAccumulator = 0;
        this._purchaseTimer = 0;
        this._throwTimer = 0;

        this.policy = new PurchasePolicy({ clicksPerSec: this.clicksPerSec });

        this.THROW_INTERVAL = 10;        // seconds between crowd throws
        this.PURCHASE_INTERVAL = 0.25;   // seconds between purchase sweeps
    }

    // ── Controls ─────────────────────────────────────────────────────────

    start() {
        if (this.complete) this._reset();
        this.policy.clicksPerSec = this.clicksPerSec;
        this.enabled = true;
        this._log('bot', 'Bot started');
    }

    stop() {
        this.enabled = false;
        this._log('bot', 'Bot stopped');
    }

    setClicksPerSec(v) {
        this.clicksPerSec = Math.max(0, Number(v) || 0);
        this.policy.clicksPerSec = this.clicksPerSec;
    }

    setSpeedMultiplier(v) {
        this.speedMultiplier = Math.max(1, Math.min(50, Math.floor(Number(v) || 1)));
    }

    _reset() {
        this.complete = false;
        this.finalReport = null;
        this.gameTime = 0;
        this.events = [];
        this._clickAccumulator = 0;
        this._purchaseTimer = 0;
        this._throwTimer = 0;
    }

    // ── Per-frame (per sub-step) tick, called from FireworkGame.update ────

    tick(dt) {
        if (!this.enabled || this.complete) return;
        this.gameTime += dt;

        this._doClicks(dt);
        this._doPurchases(dt);
        this._doCrowdThrow(dt);
        this._checkCompletion();
    }

    _doClicks(dt) {
        if (this.clicksPerSec <= 0) return;
        this._clickAccumulator += this.clicksPerSec * dt;
        let n = Math.floor(this._clickAccumulator);
        this._clickAccumulator -= n;

        const minX = GAME_BOUNDS.LAUNCHER_MIN_X;
        const maxX = GAME_BOUNDS.LAUNCHER_MAX_X;
        const minY = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y;
        const maxY = GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y;

        while (n-- > 0) {
            const x = minX + Math.random() * (maxX - minX);
            const targetY = minY + Math.random() * (maxY - minY);
            // Same entry point the real pointer-up handler uses (UIManager.js).
            this.game.launchCursorCyclingFireworkAt(x, targetY);
        }
    }

    _doPurchases(dt) {
        this._purchaseTimer += dt;
        if (this._purchaseTimer < this.PURCHASE_INTERVAL) return;
        this._purchaseTimer = 0;

        // Keep buying until nothing more is affordable this sweep, so the bot
        // never falls behind the economy at high speed multipliers.
        for (let guard = 0; guard < 200; guard++) {
            const purchases = this.policy.runTick(this.game);
            if (!purchases.length) break;
            for (const p of purchases) {
                if (p.type === 'upgrade') {
                    this._log('upgrade', `Upgraded ${p.name} to Lvl ${p.level}`);
                } else if (p.count <= 10 || p.count % 10 === 0) {
                    this._log('building', `Bought ${p.name} (Count: ${p.count})`);
                }
            }
        }
    }

    _doCrowdThrow(dt) {
        const game = this.game;
        if (!game.crowdStats?.catchingEnabled) return;
        if (game.buildingManager.getBuildingsByType('CATAPULT').length === 0) return;
        if (!game.crowd || game.crowd.people.length === 0) return;

        this._throwTimer += dt;
        if (this._throwTimer < this.THROW_INTERVAL) return;
        this._throwTimer = 0;

        // Aim toward the firework / explosion zone (up and to the right of the
        // crowd, which sits at the far left of the world).
        const targetX = GAME_BOUNDS.LAUNCHER_MIN_X;
        const targetY = (GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y + GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y) / 2;
        game.crowd.throwNearestToward(targetX, targetY);
    }

    _checkCompletion() {
        const defs = this.game.progression.getAllUpgradeDefs();
        if (!defs.length) return;
        for (const def of defs) {
            const maxLevel = def.maxLevel || 1;
            if (this.game.progression.getUpgradeLevel(def.id) < maxLevel) return;
        }
        // Everything is maxed → beat the game.
        this.complete = true;
        this.enabled = false;
        this.finalReport = this.getReport();
        this._log('complete', `All upgrades maxed — game beaten in ${this._fmtTime(this.gameTime)} (game time)`);
    }

    _log(type, label) {
        this.events.push({ time: this.gameTime, type, label });
    }

    // ── Report (mirrors HeadlessSimulator's output shape) ────────────────

    getReport() {
        const game = this.game;
        const rates = game.currentRates(this.clicksPerSec);
        const bs = game.statsTracker.sessionSparklesBySource;
        const bg = game.statsTracker.sessionGoldBySource;

        // Upgrade progress (purchased levels vs. total + remaining list).
        let totalLevels = 0;
        let purchasedLevels = 0;
        const remaining = [];
        for (const def of game.progression.getAllUpgradeDefs()) {
            const maxLevel = def.maxLevel || 1;
            const lvl = game.progression.getUpgradeLevel(def.id);
            totalLevels += maxLevel;
            purchasedLevels += lvl;
            if (lvl < maxLevel) {
                remaining.push({
                    id: def.id,
                    name: def.name,
                    level: lvl,
                    maxLevel,
                    visible: game.progression.isVisible(def.id, game).visible,
                });
            }
        }

        // Buildings owned by type (data-driven — new types appear automatically).
        const buildings = {};
        for (const type of Object.keys(BUILDING_TYPES)) {
            buildings[type] = {
                name: BUILDING_TYPES[type].name,
                count: game.buildingManager.getBuildingsByType(type).length,
            };
        }

        return {
            complete: this.complete,
            elapsed: this.gameTime,
            sparkles: game.resourceManager.resources.sparkles.amount,
            gold: game.resourceManager.resources.gold.amount,
            sps: rates.sps,
            gps: rates.gps,
            crowd: game.crowd ? game.crowd.people.length : 0,
            fireworks: game.fireworkSystem.fireworkCount,
            productionBreakdown: {
                sparkles: {
                    clicks: bs.manual || 0,
                    launchers: bs.auto_launcher || 0,
                    generators: bs.resource_generator || 0,
                    drones: bs.drone || 0,
                    crowdCatching: bs.crowd_catch || 0,
                    grandFinale: bs.grand_finale || 0,
                },
                gold: { crowd: bg.crowd || 0 },
            },
            upgrades: {
                purchasedLevels,
                totalLevels,
                remaining,
            },
            buildings,
            events: this.events,
        };
    }

    _fmtTime(s) {
        s = Math.floor(s);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return (h > 0 ? `${h}h ` : '') + `${m}m ${sec}s`;
    }
}
