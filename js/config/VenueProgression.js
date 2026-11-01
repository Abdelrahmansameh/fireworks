import { GAME_BOUNDS } from './GameBoundsConfig.js';
import { BUILDING_TYPES } from './BuildingConfig.js';

export const VENUE_ZOOM_OUT_DURATION_MS = 4000;

// Content extents are unioned with the starting viewport by the camera; they
// do not replace it. The right edge comes from the launcher slots alone, so the
// view only widens once a new launcher would land outside it.
// maxExplosionY caps burst targets, not individual particles.
export const VENUE_STAGES = [
    { id: 'opening', left: -960, maxExplosionY: 324, maxAutomaticExplosionY: 200 },
    { id: 'first-launcher', left: -200, maxExplosionY: 380, maxAutomaticExplosionY: 200 },
    { id: 'three-launchers', left: -300, maxExplosionY: 440, maxAutomaticExplosionY: 375 },
    { id: 'first-fan', left: -1250, maxExplosionY: 500 },
    { id: 'seven-launchers', left: -1250, maxExplosionY: 575 },
    { id: 'fourteen-launchers', left: -1250, maxExplosionY: 675 },
    { id: 'twenty-launchers', left: -1250, maxExplosionY: 775 },
    { id: 'twenty-five-launchers', left: -1250, maxExplosionY: 875 },
    { id: 'thirty-two-launchers', left: -1250, maxExplosionY: 975 },
];

/** Infer old saves and persist the high-water mark so refunds cannot shrink it. */
export function getVenueStage(game) {
    const buildings = game.buildingManager?.buildings ?? [];
    const count = type => buildings.filter(building => building.type === type).length;
    const launchers = count('AUTO_LAUNCHER');
    let earned = 0;
    if (launchers >= 1) earned = 1;
    if (launchers >= 3) earned = 2;
    if ((game.crowd?.people?.length ?? 0) > 0 || game.hasSeenFirstCrowdCinematic) earned = 3;
    if (launchers >= 7 || count('CATAPULT') || game.cultistCount > 0) earned = Math.max(earned, 4);
    if (launchers >= 14 || game.jetpackCount > 0) earned = Math.max(earned, 5);
    if (launchers >= 20) earned = Math.max(earned, 6);
    if (launchers >= 25) earned = Math.max(earned, 7);
    if (launchers >= 32) earned = Math.max(earned, 8);
    const stored = Math.max(0, Math.min(VENUE_STAGES.length - 1, Number(game.storage?.getItem('venueStage')) || 0));
    const index = Math.max(earned, Math.floor(stored));
    if (!game._isRestoring && index > stored) game.storage?.setItem('venueStage', String(index));
    const stage = VENUE_STAGES[index];
    // Keep the widest extent reached so refunds never zoom the view back in.
    const leftValue = game.storage?.getItem('venueExtentLeft');
    const rightValue = game.storage?.getItem('venueLauncherRight');
    const storedLeft = leftValue != null && Number.isFinite(Number(leftValue)) ? Number(leftValue) : Infinity;
    const storedRight = rightValue != null && Number.isFinite(Number(rightValue)) ? Number(rightValue) : -Infinity;
    let left = Math.min(stage.left, storedLeft);
    let right = storedRight;
    for (const building of buildings) {
        if (!Number.isFinite(building.x)) continue;
        const padding = (building.config?.width ?? 100) / 2 + 100;
        left = Math.min(left, building.x - padding);
        right = Math.max(right, building.x + padding);
    }
    // Frame the next launcher slot before it is bought, so the view is already
    // wide enough when the purchase lands.
    const launcherConfig = BUILDING_TYPES.AUTO_LAUNCHER;
    if (launchers < (launcherConfig.maxCount ?? Infinity)) {
        const nextX = GAME_BOUNDS.LAUNCHER_START_X + launchers * GAME_BOUNDS.LAUNCHER_SPACING;
        right = Math.max(right, nextX + launcherConfig.width / 2 + 100);
    }
    if (!game._isRestoring) {
        if (left < stage.left && left < storedLeft) game.storage?.setItem('venueExtentLeft', String(left));
        if (right > storedRight) game.storage?.setItem('venueLauncherRight', String(right));
    }
    return { ...stage, left, right, index };
}
