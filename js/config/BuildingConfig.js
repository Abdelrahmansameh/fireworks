export const AUTO_LAUNCHER_COST_BASE = 30;
// Moderate ratio: the player keeps buying launchers all game (count climbs into
// the dozens, fireworks/sec rises, the sky fills up — the core fantasy), but not
// so cheap that purchases come every few seconds. Launchers are also the particle
// supply that feeds drones + crowd-catching.
export const AUTO_LAUNCHER_COST_RATIO = 1.7;

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
        maxAccumulator: 200,
        unlockId: 'buildings_tab',
        statId: 'stat-bld-auto',
        panel: {
            showLauncherList: true,
            showSpreadButton: true,
            showRandomizeButton: true,
        },
        zIndex: 20,
    },
    RESOURCE_GENERATOR: {
        id: 'resource_generator',
        name: 'Sparkle Generator',
        description: 'Passively generates sparkles over time',
        baseCost: 400,
        // gold-fuelled flat producer — ratio kept high so late-game count stays
        // bounded (prevents a generator runaway while it still shines ~8-11 min)
        // and so purchases are spaced out rather than a constant trickle.
        costRatio: 1.6,
        currency: 'gold',
        width: 25,
        height: 30,
        y: -435,
        color: { r: 1, g: 0.84, b: 0, a: 1 },
        texture: null,
        textureKey: null,
        skeletonUrl: 'assets/skeletons/sparkle_generator.json',
        skeletonScale: 15,
        baseProductionRate: 1050.0,
        sparkleTrailBaseCount: 6,
        sparkleTrailScalingRatio: 0.25,
        maxSparkleTrailBurstCount: 100, 
        resourceType: 'sparkles',
        unlockId: 'resource_generator',
        statId: 'stat-bld-gen',
        maxAccumulator: 200,
        panel: {
            showLauncherList: false,
            showSpreadButton: false,
            showRandomizeButton: false,
        },
        zIndex: 10,
    },

    CATAPULT: {
        id: 'catapult',
        name: 'Catapult',
        description: 'Launches crowd members into the firework zone to catch sparkles',
        baseCost: 150,
        costRatio: 1.6,
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
        // Position — to the left of the crowd so launched members arc into the fireworks zone
        x: -1400,
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
            showSpreadButton: false,
            showRandomizeButton: false,
        },
    },

    DRONE_HUB: {
        id: 'drone_hub',
        name: 'Drone Hub',
        description: 'Periodically launches drones that collect firework particles',
        baseCost: 180,
        // Steeper than other buildings: a single hub is meant to be a meaningful,
        // somewhat scarce investment (each adds an intermittent drone), so the
        // player ends up with a handful of hubs — not dozens. Prevents the old
        // "buy so many hubs the sky is a permanent drone swarm" runaway.
        costRatio: 1.9,
        currency: 'gold',
        width: 40,
        height: 50,
        y: -435,
        color: { r: 0.2, g: 0.7, b: 1.0, a: 1 },
        texture: null,
        textureKey: null,
        skeletonUrl: 'assets/skeletons/drone_hub.json',
        skeletonScale: 20,
        // Base cadence: a 30s drone on a 60s cycle → 30s airborne, 30s downtime
        // (50% uptime) for a fresh, un-upgraded hub. Lifetime/interval upgrades
        // close that gap; only a fully-upgraded hub reaches ~100% uptime.
        baseSpawnInterval: 60,
        baseDroneLifetime: 30,
        baseDroneSpeed: 600,
        droneScale: 1,   // multiplier on DRONE_CONFIG.scaling.baseScale (1 = use config size as-is)
        droneColor: { r: 0.1, g: 0.65, b: 0.8, a: 1.0 },
        unlockId: 'drone_hub',
        statId: 'stat-bld-drone',
        panel: {
            showLauncherList: false,
            showSpreadButton: false,
            showRandomizeButton: false,
        },
        zIndex: 12,
    }
};
