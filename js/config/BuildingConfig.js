export const PORTAL_COST_BASE = 60;

export const PORTAL_COST_RATIO = 1.22;

export const PORTAL_WORLD_HIGHLIGHT_DURATION = 2.5;

export const BUILDING_TYPES = {
    PORTAL: {
        id: 'portal',
        name: 'Portal',
        description: 'A glowing pool that fireworks rise out of on their own',
        baseCost: PORTAL_COST_BASE,
        costRatio: PORTAL_COST_RATIO,
        currency: 'sparkles',
        // Footprint width, used to size the venue around the next portal slot.
        width: 60,
        // Always taken from config; portals never save their height.
        y: -449,
        baseSpawnInterval: 5,
        maxCount: 32,
        unlockId: 'buildings_tab',
        statId: 'stat-bld-portal',
        panel: {
            showPortalList: true,
            showRandomizeButton: true,
        },
        zIndex: 20,
    },
    CATAPULT: {
        id: 'catapult',
        name: 'Catapult',
        description: 'Launches crowd members into the firework zone to catch sparkles',
        baseCost: 525,
        costRatio: 1.65,
        currency: 'gold',
        // Skeleton-rendered; width/height used for click-bounds only
        width: 120,
        height: 80,
        color: { r: 0.68, g: 0.68, b: 0.68, a: 1 },
        texture: null,
        textureKey: null,
        skeletonUrl: 'assets/skeletons/catapult.json',
        skeletonScale: 15,
        baseFireInterval: 5,
        // Share the crowd area so launched members arc toward the fireworks.
        x: -450,
        y: -435,
        // Animation timing
        fireInterval: 6,   // seconds between shots (configurable)
        firingAnim: 'throwing',
        idleAnim: 'idle',
        // Rendering
        zIndex: 15,
        maxInstances: 20,  // 7 skeleton parts, but leave headroom
        unlockId: 'catapult',
        statId: 'stat-bld-catapult',
        panel: {
            showPortalList: false,
            showRandomizeButton: false,
        },
    },


};
