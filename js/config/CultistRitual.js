// The cultist ritual clip in crowd.json is the source of truth for cultist
// timing: each cultist makes one offering per ritual loop, so changing the
// clip's length (here or in the skeleton editor) changes the exchange cycle.
import { CULTIST_CONFIG } from './CultistConfig.js';
import { SKILL_TREE_CONFIG } from '../ui/SkillTreeConfig.js';

const CROWD_URL = new URL('../../assets/skeletons/crowd.json', import.meta.url);

async function loadCrowdSkeleton() {
    if (typeof window === 'undefined') {
        const { readFile } = await import('node:fs/promises');
        return JSON.parse(await readFile(CROWD_URL, 'utf8'));
    }
    return (await fetch(CROWD_URL)).json();
}

/** Length of one ritual loop at normal speed, in seconds. */
export const RITUAL_DURATION = (await loadCrowdSkeleton()).animations.ritual.duration;

/** Seconds between offerings; speed upgrades shorten it and the ritual plays faster. */
export function ritualInterval(cultistStats) {
    return RITUAL_DURATION / (cultistStats?.ritualSpeedMultiplier ?? 1);
}

/** Gold a cultist takes from the bank at the end of each ritual. */
export function goldPerRitual(cultistStats) {
    return CULTIST_CONFIG.goldPerRitual * (cultistStats?.offeringMultiplier ?? 1);
}

/** Sparkles paid out for every gold offered. */
export function sparklesPerGold(cultistStats, baseSparkleMultiplier = 1) {
    return CULTIST_CONFIG.sparklesPerGold * baseSparkleMultiplier * (cultistStats?.sparkleMultiplier ?? 1);
}

/** Sparkles a cultist pays out for a full offering. */
export function sparklesPerRitual(cultistStats, baseSparkleMultiplier = 1) {
    return goldPerRitual(cultistStats) * sparklesPerGold(cultistStats, baseSparkleMultiplier);
}

/** Full-offering payout before any upgrade; the smallest ritual burst. */
export const BASE_SPARKLES_PER_RITUAL = CULTIST_CONFIG.goldPerRitual * CULTIST_CONFIG.sparklesPerGold;

/**
 * Payout per ritual with every skill tree upgrade at max level. Upgrades that
 * touch anything else throw on the stub and are skipped.
 */
export const MAX_SPARKLES_PER_RITUAL = (() => {
    const stub = { baseSparkleMultiplier: 1, cultistStats: { sparkleMultiplier: 1, ritualSpeedMultiplier: 1, offeringMultiplier: 1 } };
    for (const upgrade of Object.values(SKILL_TREE_CONFIG.nodes)) {
        for (let level = 0; level < (upgrade.maxLevel ?? 1); level++) {
            try { upgrade.apply?.(stub); } catch { break; }
        }
    }
    return sparklesPerRitual(stub.cultistStats, stub.baseSparkleMultiplier);
})();

/** Gold per second one cultist offers while the bank can pay. */
export function cultistGoldPerSecond(cultistStats) {
    return goldPerRitual(cultistStats) / ritualInterval(cultistStats);
}

/** Sparkles per second from one fully fed cultist. */
export function cultistSparklesPerSecond(cultistStats, baseSparkleMultiplier = 1) {
    return sparklesPerRitual(cultistStats, baseSparkleMultiplier) / ritualInterval(cultistStats);
}
