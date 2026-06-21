import GameCore from '../game/GameCore.js';
import PurchasePolicy from './PurchasePolicy.js';

/**
 * HeadlessSimulator — runs the real game economy with no rendering or audio.
 *
 * Instead of re-deriving launcher FPS / costs / crowd scaling (as the old
 * ProgressionSimulator did), it constructs a headless {@link GameCore} and
 * steps it, so the simulated economy IS the game's economy. The only modelled
 * pieces are drone collection and crowd catching, which are emergent from
 * particle physics in the live game (see EmergentYieldModel + SimulationConfig).
 *
 * Returns the same result shape the original simulator produced, so the
 * existing ProgressionToolUI charts/timeline work unchanged.
 */
export class HeadlessSimulator {
    simulate(durationMinutes, inputs = {}) {
        const clicksPerSec = parseFloat(inputs.clicksPerSec) || 0;
        const dt = 1; // seconds per tick (coarse — emergent income is analytical)
        const totalTicks = Math.floor((durationMinutes * 60) / dt);

        const game = new GameCore({ headless: true });
        const policy = new PurchasePolicy({ clicksPerSec });

        const history = [];
        const events = [];
        let time = 0;
        let lastReportTime = -1;
        let totalUpgradesPurchased = 0;

        let prevUnlocked = new Set(game.progression.getState().unlocked);
        let prevCrowd = game.crowd.people.length;
        let lastMinuteSnapshot = this._sourceSnapshot(game);

        for (let t = 0; t < totalTicks; t++) {
            time += dt;

            // 1. Economy step — real building + progression code + emergent estimate.
            game.stepHeadless(dt, { clicksPerSec });

            // 2. Unlock events (diff the progression unlock set).
            const nowUnlocked = game.progression.getState().unlocked;
            for (const id of nowUnlocked) {
                if (!prevUnlocked.has(id)) {
                    events.push({ time, type: 'unlock', label: `Unlocked Feature: ${id}` });
                }
            }
            prevUnlocked = new Set(nowUnlocked);

            // 3. Crowd-growth events.
            const crowd = game.crowd.people.length;
            if (crowd > prevCrowd) {
                events.push({ time, type: 'crowd', label: `Gained ${crowd - prevCrowd} crowd (Total: ${crowd})` });
                prevCrowd = crowd;
            }

            // 4. Greedy purchasing through the real buy APIs.
            for (const p of policy.runTick(game)) {
                if (p.type === 'upgrade') {
                    totalUpgradesPurchased++;
                    events.push({ time, type: 'upgrade', label: `Upgraded ${p.name} to Lvl ${p.level}` });
                } else if (p.count <= 10 || p.count % 10 === 0) {
                    events.push({ time, type: 'building', label: `Bought ${p.name} (Count: ${p.count})` });
                }
            }

            // 5. Per-minute production breakdown event.
            if (time % 60 === 0) {
                const snap = this._sourceSnapshot(game);
                const d = this._deltaSnapshot(lastMinuteSnapshot, snap);
                lastMinuteSnapshot = snap;
                const s = d.sparkles;
                const sparklesParts = [
                    `clicks ${Math.round(s.manual || 0)}`,
                    `launchers ${Math.round(s.auto_launcher || 0)}`,
                    `generators ${Math.round(s.resource_generator || 0)}`,
                    `drones ${Math.round(s.drone || 0)}`,
                    `crowdCatch ${Math.round(s.crowd_catch || 0)}`,
                    `finale ${Math.round(s.grand_finale || 0)}`,
                ].join(', ');
                events.push({
                    time,
                    type: 'minute',
                    label: `Minute ${time / 60}: Sparkles — ${sparklesParts}; Gold — crowd ${Math.round(d.gold.crowd || 0)}`,
                });
            }

            // 6. History sample every ~10 seconds.
            if (time - lastReportTime >= 10) {
                const rates = game.currentRates(clicksPerSec);
                const cheapest = policy.cheapest(game);
                history.push({
                    time,
                    sparkles: game.resourceManager.resources.sparkles.amount,
                    gold: game.resourceManager.resources.gold.amount,
                    sps: rates.sps,
                    gps: rates.gps,
                    upgrades: totalUpgradesPurchased,
                    crowd: game.crowd.people.length,
                    cheapestSparkle: cheapest.sparkle,
                    cheapestGold: cheapest.gold,
                });
                lastReportTime = time;
            }
        }

        const unpurchasedUpgrades = [];
        for (const def of game.progression.getAllUpgradeDefs()) {
            const lvl = game.progression.getUpgradeLevel(def.id);
            const maxLevel = def.maxLevel || 1;
            if (lvl < maxLevel) {
                unpurchasedUpgrades.push({
                    id: def.id,
                    name: def.name,
                    level: lvl,
                    maxLevel,
                    visible: game.progression.isVisible(def.id, game).visible,
                });
            }
        }

        const bs = game.statsTracker.sessionSparklesBySource;
        const bg = game.statsTracker.sessionGoldBySource;
        const productionBreakdown = {
            sparkles: {
                clicks: bs.manual || 0,
                launchers: bs.auto_launcher || 0,
                generators: bs.resource_generator || 0,
                drones: bs.drone || 0,
                crowdCatching: bs.crowd_catch || 0,
                grandFinale: bs.grand_finale || 0,
            },
            gold: { crowd: bg.crowd || 0 },
        };

        return { history, events, unpurchasedUpgrades, productionBreakdown };
    }

    _sourceSnapshot(game) {
        return {
            sparkles: { ...game.statsTracker.sessionSparklesBySource },
            gold: { ...game.statsTracker.sessionGoldBySource },
        };
    }

    _deltaSnapshot(prev, now) {
        const delta = (a, b) => {
            const out = {};
            for (const k of Object.keys(b)) out[k] = (b[k] || 0) - (a[k] || 0);
            return out;
        };
        return {
            sparkles: delta(prev.sparkles, now.sparkles),
            gold: delta(prev.gold, now.gold),
        };
    }
}
