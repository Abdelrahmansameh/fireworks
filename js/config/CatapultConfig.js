export const CATAPULT_CONFIG = {
    // Position — sits between the crowd area and the launcher zone
    x: 0,
    y: -490,           // WORLD_GROUND_Y
    scale: 15,

    // Animation timing
    fireInterval: 6,   // seconds between shots (configurable)
    firingAnim: 'throwing',
    idleAnim: 'idle',

    // Rendering
    zIndex: 5,
    maxInstances: 20,  // 7 skeleton parts, but leave headroom
};
