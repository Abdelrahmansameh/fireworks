import { BUILDING_TYPES } from '../config/config.js';
import Building from '../buildings/Building.js';

/**
 * PurchasePolicy — the simulator's spending AI.
 *
 * It does NOT contain any game logic: it inspects the real GameCore state
 * (upgrade defs, costs, building counts) and drives purchases through the same
 * `buyUpgrade` / `buyBuilding` APIs the UI buttons call. The strategy mirrors
 * the original simulator: each step it ranks every candidate by time-to-afford
 * at the current production rate and, if the cheapest-to-reach target is
 * affordable right now, buys it.
 */
export default class PurchasePolicy {
    constructor({ clicksPerSec = 0, maxLaunchers = 100, maxPurchasesPerTick = 1 } = {}) {
        this.clicksPerSec = clicksPerSec;
        this.maxLaunchers = maxLaunchers;
        this.maxPurchasesPerTick = maxPurchasesPerTick;
    }

    /** Enumerate buyable candidates (visible / unlocked), with cost + currency. */
    _candidates(game) {
        const out = [];

        for (const def of game.progression.getAllUpgradeDefs()) {
            if (!game.progression.isVisible(def.id, game).visible) continue;
            const check = game.progression.canPurchase(def.id, game);
            if (check.ok || (check.reason && check.reason.includes('Not enough'))) {
                out.push({
                    kind: 'upgrade',
                    id: def.id,
                    name: def.name,
                    currency: def.currency,
                    cost: game.progression.getUpgradeCost(def.id),
                });
            }
        }

        for (const type of Object.keys(BUILDING_TYPES)) {
            if (!game.isBuildingTypeUnlocked(type)) continue;
            const count = game.buildingManager.getBuildingsByType(type).length;
            if (type === 'CATAPULT' && count >= (game.catapultStats?.maxCatapults ?? 1)) continue;
            if (type === 'AUTO_LAUNCHER' && count >= this.maxLaunchers) continue;

            const cfg = BUILDING_TYPES[type];
            out.push({
                kind: 'building',
                id: type,
                name: cfg.name,
                currency: cfg.currency,
                cost: Building.getPurchaseCost(type, count),
            });
        }

        return out;
    }

    /** Run one tick of purchasing. Returns the purchases made, for event logging. */
    runTick(game) {
        const purchases = [];
        let made = 0;

        while (made < this.maxPurchasesPerTick) {
            const { sps, gps } = game.currentRates(this.clicksPerSec);
            const sparkles = game.resourceManager.resources.sparkles.amount;
            const gold = game.resourceManager.resources.gold.amount;
            const amountOf = c => (c === 'gold' ? gold : sparkles);
            const rateOf = c => (c === 'gold' ? gps : sps);

            let best = null;
            let bestTime = Infinity;
            for (const opt of this._candidates(game)) {
                const deficit = Math.max(0, opt.cost - amountOf(opt.currency));
                const rate = rateOf(opt.currency);
                const time = deficit === 0 ? 0 : (rate <= 0 ? Infinity : deficit / rate);
                if (time < bestTime || (time === bestTime && opt.cost < (best ? best.cost : Infinity))) {
                    bestTime = time;
                    best = opt;
                }
            }

            // Save up for the fastest-to-afford target; only buy when it's affordable now.
            if (!best || bestTime !== 0 || amountOf(best.currency) < best.cost) break;

            const bought = this._buy(game, best);
            if (!bought) break;
            purchases.push(bought);
            made++;
        }

        return purchases;
    }

    _buy(game, opt) {
        if (opt.kind === 'upgrade') {
            const before = game.progression.getUpgradeLevel(opt.id);
            game.buyUpgrade(opt.id);
            const after = game.progression.getUpgradeLevel(opt.id);
            if (after <= before) return null;
            return { type: 'upgrade', id: opt.id, name: opt.name, level: after };
        }
        const before = game.buildingManager.getBuildingsByType(opt.id).length;
        game.buyBuilding(opt.id);
        const after = game.buildingManager.getBuildingsByType(opt.id).length;
        if (after <= before) return null;
        return { type: 'building', id: opt.id, name: opt.name, count: after };
    }

    /** Cheapest visible candidate cost per currency (for the history charts). */
    cheapest(game) {
        let sparkle = Infinity;
        let gold = Infinity;
        for (const opt of this._candidates(game)) {
            if (opt.currency === 'gold') gold = Math.min(gold, opt.cost);
            else sparkle = Math.min(sparkle, opt.cost);
        }
        return {
            sparkle: sparkle === Infinity ? null : sparkle,
            gold: gold === Infinity ? null : gold,
        };
    }
}
