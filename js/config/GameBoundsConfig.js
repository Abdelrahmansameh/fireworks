export const GAME_BOUNDS = {
    PORTAL_MIN_X: 100,
    PORTAL_MAX_X: 4000,
    // Portals sit in fixed, evenly spaced slots in purchase order.
    PORTAL_START_X: 220,
    PORTAL_SPACING: 280,
    OFFSET_MIN_Y: 5,
    OFFSET_MAX_Y: -50,
    SCROLL_MIN_X: -1500,
    SCROLL_MAX_X: 4200,
    CROWD_RIGHT_X: -1280,
    CROWD_LEFT_X: -180,          // leaves room for the cultists before the portals
    CROWD_Y: -490,
    WORLD_GROUND_Y: -540,
    WORLD_MIN_EXPLOSION_Y: -105,
    WORLD_MAX_EXPLOSION_Y: 324,
    MANUAL_RANDOM_TARGET_MAX_Y: 0,
    // Height manual fireworks launch from.
    WORLD_LAUNCH_Y: -535,
    // Catapults share the crowd's ground area, close to the portals.
    CATAPULT_MIN_X: -900,
    CATAPULT_MAX_X: -450,
    BUILDING_Y: -435,
    CATAPULT_X_STEP: -140,
    IS_ZOOM_LOCKED: true,
    INITIAL_ZOOM: 1.2,
    MOBILE_ZOOM_FACTOR: 0.85,
    // How far past the starting framing the player may zoom in.
    PLAYER_ZOOM_IN_FACTOR: 4,
    MAX_ZOOM: 5,
    MIN_ZOOM: 0.4
};
