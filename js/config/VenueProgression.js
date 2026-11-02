import { GAME_BOUNDS } from './GameBoundsConfig.js';
import { BUILDING_TYPES } from './BuildingConfig.js';

export const VENUE_ZOOM_OUT_DURATION_MS = 4000;
// The automatic zoom-out frames at most this far right; portals past it are
// reached by panning. Burst height grows with the framed width up to the cap.
export const VENUE_MAX_ZOOM_RIGHT = 7200;
export const VENUE_MAX_EXPLOSION_Y = 2700;

// Content extents are unioned with the starting viewport by the camera; they
// do not replace it. The right edge comes from the portal slots alone, so the
// view only widens once a new portal would land outside it.
// maxExplosionY caps burst targets, not individual particles.
export const VENUE_STAGES = [
    { id: 'opening', left: -960, maxExplosionY: 324, maxAutomaticExplosionY: 200 },
    { id: 'first-portal', left: -200, maxExplosionY: 380, maxAutomaticExplosionY: 200 },
    { id: 'three-portals', left: -300, maxExplosionY: 440, maxAutomaticExplosionY: 375 },
    { id: 'first-fan', left: -1250, maxExplosionY: 500 },
    { id: 'seven-portals', left: -1250, maxExplosionY: 575 },
    { id: 'fourteen-portals', left: -1250, maxExplosionY: 675 },
    { id: 'twenty-portals', left: -1250, maxExplosionY: 775 },
    { id: 'twenty-five-portals', left: -1250, maxExplosionY: 875 },
    { id: 'thirty-two-portals', left: -1250, maxExplosionY: 975 },
];

/** Infer old saves and persist the high-water mark so refunds cannot shrink it. */
export function getVenueStage(game) {
    const buildings = game.buildingManager?.buildings ?? [];
    const count = type => buildings.filter(building => building.type === type).length;
    const portals = count('PORTAL');
    let earned = 0;
    if (portals >= 1) earned = 1;
    if (portals >= 3) earned = 2;
    if ((game.crowd?.people?.length ?? 0) > 0 || game.hasSeenFirstCrowdCinematic) earned = 3;
    if (portals >= 7 || count('CATAPULT') || game.cultistCount > 0) earned = Math.max(earned, 4);
    if (portals >= 14 || game.flyerCount > 0) earned = Math.max(earned, 5);
    if (portals >= 20) earned = Math.max(earned, 6);
    if (portals >= 25) earned = Math.max(earned, 7);
    if (portals >= 32) earned = Math.max(earned, 8);
    const stored = Math.max(0, Math.min(VENUE_STAGES.length - 1, Number(game.storage?.getItem('venueStage')) || 0));
    const index = Math.max(earned, Math.floor(stored));
    if (!game._isRestoring && index > stored) game.storage?.setItem('venueStage', String(index));
    const stage = VENUE_STAGES[index];
    // Keep the widest extent reached so refunds never zoom the view back in.
    const leftValue = game.storage?.getItem('venueExtentLeft');
    const rightValue = game.storage?.getItem('venuePortalRight');
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
    // Frame the next portal slot before it is bought, so the view is already
    // wide enough when the purchase lands.
    const portalConfig = BUILDING_TYPES.PORTAL;
    if (portals < (portalConfig.maxCount ?? Infinity)) {
        const nextX = GAME_BOUNDS.PORTAL_START_X + portals * GAME_BOUNDS.PORTAL_SPACING;
        right = Math.max(right, nextX + portalConfig.width / 2 + 100);
    }
    if (!game._isRestoring) {
        if (left < stage.left && left < storedLeft) game.storage?.setItem('venueExtentLeft', String(left));
        if (right > storedRight) game.storage?.setItem('venuePortalRight', String(right));
    }
    const zoomRight = Math.min(right, VENUE_MAX_ZOOM_RIGHT);
    // Scale with the framed span so bursts keep the same screen height as the
    // view widens, reaching the cap exactly at the widest zoom.
    const groundY = GAME_BOUNDS.WORLD_GROUND_Y;
    const spanRatio = Math.max(0, (zoomRight - left) / (VENUE_MAX_ZOOM_RIGHT - left));
    const maxExplosionY = Math.min(VENUE_MAX_EXPLOSION_Y,
        Math.max(stage.maxExplosionY, groundY + (VENUE_MAX_EXPLOSION_Y - groundY) * spanRatio));
    return { ...stage, left, right, zoomRight, maxExplosionY, index };
}
