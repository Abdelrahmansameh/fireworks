import { BUILDING_TYPES, CROWD_CONFIG } from '../config/config.js';
import Building from '../buildings/Building.js';

// Crowd people drop one coin every COIN_TOSS_INTERVAL seconds (see Crowd.js).
export const COIN_TOSS_INTERVAL = 5;
// Base gold value of a single coin toss (before goldRateMultiplier upgrades).
// Raised from 1 to compensate for the ~150 crowd cap: with far fewer people than
// the old uncapped venue, each coin is worth more so late-game gold income stays
// healthy and gold-priced upgrades keep pacing steadily.
export const BASE_GOLD_PER_TOSS = 3;
export const BASE_GOLD_DROPS_PER_SEC_PER_PERSON = BASE_GOLD_PER_TOSS / COIN_TOSS_INTERVAL;

// Fallback default yields for emergent sources the sim needs to estimate.
// Callers (sim UI) may override per-run via the `rates` argument.
export const DEFAULT_BASE_DRONE_YIELD_PER_SEC = 1;
export const DEFAULT_BASE_CATCH_YIELD_PER_SEC = 1;

// Map building type -> the upgrade id that unlocks it.
const BUILDING_UNLOCK_UPGRADE = {
    AUTO_LAUNCHER: 'auto_launcher',
    RESOURCE_GENERATOR: 'resource_generator',
    DRONE_HUB: 'drone_hub',
    CATAPULT: 'catapult',
};

function countBuildings(state, type) {
    return state.buildingManager?.getBuildingsByType(type).length ?? 0;
}

/** Total fireworks-per-second from all auto launchers. Mirrors BuildingManager.getTheoreticalAutoLauncherFPS. */
export function launcherFPS(state) {
    const launchers = countBuildings(state, 'AUTO_LAUNCHER');
    if (launchers === 0) return 0;
    const baseInterval = BUILDING_TYPES.AUTO_LAUNCHER.baseSpawnInterval;
    const mult = state.launcherStats?.spawnIntervalMultiplier ?? 1;
    return launchers / (baseInterval * mult);
}

/**
 * Target crowd count given the lifetime total of fireworks launched.
 * Formula: floor(A * (totalFireworks - offset)^exp + B), clamped at 0 and bonus.
 */
export function targetCrowdCount(totalFireworks, state) {
    const config = CROWD_CONFIG.scaling;
    const maxCap = CROWD_CONFIG.maxInstances || 1000;
    const bonus = state.crowdStats?.countBonus ?? 0;
    const above = Math.max(0, totalFireworks - (config.formulaOffset ?? 0));
    const raw = above <= 0
        ? (config.formulaB ?? 0)
        : config.formulaA * Math.pow(above, config.formulaExp ?? 1) + (config.formulaB ?? 0);
    const maxCrowd = (typeof config.maxCrowd === 'number') ? config.maxCrowd : maxCap;
    const target = Math.floor(maxCrowd * (1 - Math.exp(-raw / maxCrowd)));
    return Math.min(Math.max(0, target) + bonus, maxCap);
}

/** Inverse of targetCrowdCount: total fireworks needed to reach `n` crowd (ignoring bonus). */
export function fireworksForCrowd(n, state) {
    const config = CROWD_CONFIG.scaling;
    const bonus = state.crowdStats?.countBonus ?? 0;
    const maxCrowd = (typeof config.maxCrowd === 'number') ? config.maxCrowd : (CROWD_CONFIG.maxInstances || 1000);
    const targetN = n - bonus;
    if (targetN <= 0) return config.formulaOffset ?? 0;
    if (targetN >= maxCrowd) return Infinity; // unreachable — beyond the saturation asymptote
    // Invert crowd = maxCrowd*(1-exp(-raw/maxCrowd)) → raw, then invert the power term.
    const raw = -maxCrowd * Math.log(1 - targetN / maxCrowd) - (config.formulaB ?? 0);
    if (raw <= 0) return config.formulaOffset ?? 0;
    const above = Math.pow(raw / config.formulaA, 1 / (config.formulaExp ?? 1));
    return (config.formulaOffset ?? 0) + above;
}

/** Cost of the next building of the given type. */
export function buildingCost(type, state) {
    const count = countBuildings(state, type);
    return Building.getPurchaseCost(type, count);
}

/** Whether the given building type's unlock upgrade has been purchased. */
export function buildingTypeUnlocked(type, progression) {
    const upgradeId = BUILDING_UNLOCK_UPGRADE[type];
    return upgradeId ? progression.getUpgradeLevel(upgradeId) > 0 : false;
}

/**
 * Per-source sparkles-per-second breakdown.
 *
 * `rates` supplies the emergent (random-driven) inputs the game can't compute
 * deterministically: player click rate and per-drone / per-catcher base yield.
 * Building-driven sources (launchers, generators) are derived from state.
 */
export function expectedSPS(state, rates = {}) {
    const clicksPerSec = rates.clicksPerSec ?? 0;
    const baseDroneYield = rates.baseDroneYieldPerSec ?? DEFAULT_BASE_DRONE_YIELD_PER_SEC;
    const baseCatchYield = rates.baseCatchYieldPerSec ?? DEFAULT_BASE_CATCH_YIELD_PER_SEC;

    const baseSparkleMult = state.baseSparkleMultiplier ?? 1;

    const clicks = clicksPerSec * baseSparkleMult;

    const launcherYieldMult = state.launcherStats?.sparkleYieldMultiplier ?? 1;
    const launchers = launcherFPS(state) * baseSparkleMult * launcherYieldMult;

    const genCount = countBuildings(state, 'RESOURCE_GENERATOR');
    const genBase = BUILDING_TYPES.RESOURCE_GENERATOR.baseProductionRate;
    const genMult = state.generatorStats?.productionRateMultiplier ?? 1;
    const generators = genCount * genBase * genMult;

    // Drones: steady-state active count ≈ spawnRate × lifetime, capped by maxDrones.
    let drones = 0;
    const droneHubs = countBuildings(state, 'DRONE_HUB');
    if (droneHubs > 0) {
        const hubCfg = BUILDING_TYPES.DRONE_HUB;
        const hubInterval = hubCfg.baseSpawnInterval * (state.droneHubStats?.spawnIntervalMultiplier ?? 1);
        const droneLifetime = hubCfg.baseDroneLifetime * (state.droneStats?.lifetimeMultiplier ?? 1);
        const steadyActive = Math.min(
            state.droneStats?.maxDrones ?? Infinity,
            droneHubs * (droneLifetime / hubInterval)
        );
        drones = steadyActive * baseDroneYield * (state.droneStats?.sparklesPerParticleMultiplier ?? 1);
    }

    // Crowd catching: rough estimate — assume each catapult engages ~2 people.
    let crowdCatching = 0;
    const catapults = countBuildings(state, 'CATAPULT');
    if (state.crowdStats?.catchingEnabled && catapults > 0) {
        const crowdSize = state.crowd?.people?.length ?? 0;
        const activeCatchers = Math.min(crowdSize, catapults * 2);
        crowdCatching = activeCatchers * baseCatchYield
            * (state.crowdStats?.sparklesPerParticleMultiplier ?? 1)
            * (state.crowdStats?.collectionRadiusMultiplier ?? 1);
    }

    const total = clicks + launchers + generators + drones + crowdCatching;
    return { clicks, launchers, generators, drones, crowdCatching, total };
}

/** Per-source gold-per-second breakdown. */
export function expectedGPS(state) {
    const crowdSize = state.crowd?.people?.length ?? 0;
    // Each catapult occupies ~1 person, who doesn't toss coins (Crowd.js gates on !catapultData).
    const catapults = countBuildings(state, 'CATAPULT');
    const effectiveCrowd = Math.max(0, crowdSize - catapults);
    const goldRateMult = state.crowdStats?.goldRateMultiplier ?? 1;
    const crowd = effectiveCrowd * BASE_GOLD_DROPS_PER_SEC_PER_PERSON * goldRateMult;

    return { crowd, total: crowd };
}
