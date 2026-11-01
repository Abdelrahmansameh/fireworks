export const AUTO_LAUNCHER_COST_BASE = 60;

export const AUTO_LAUNCHER_COST_RATIO = 1.22;

export const LAUNCHER_WORLD_HIGHLIGHT_DURATION = 2.5;

export const BUILDING_TYPES = {
    AUTO_LAUNCHER: {
        id: 'auto_launcher',
        name: 'Auto Launcher',
        description: 'Automatically launches fireworks',
        baseCost: AUTO_LAUNCHER_COST_BASE,
        costRatio: AUTO_LAUNCHER_COST_RATIO,
        currency: 'sparkles',
        width: 40,
        height: 20,
        y: -435,
        color: { r: 95 / 255, g: 101 / 255, b: 180 / 255, a: 1 },
        texture: null,
        textureKey: null,
        skeletonUrl: 'assets/skeletons/auto_launcher.json',
        skeletonScale: 10,
        baseSpawnInterval: 5,
        maxCount: 32,
        maxAccumulator: 200,
        unlockId: 'buildings_tab',
        statId: 'stat-bld-auto',
        panel: {
            showLauncherList: true,
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
            showLauncherList: false,
            showRandomizeButton: false,
        },
    },


};
