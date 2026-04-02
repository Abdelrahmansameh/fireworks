export const AUTO_LAUNCHER_COST_BASE = 10;
export const AUTO_LAUNCHER_COST_RATIO = 1.2;

// How long (seconds) the world-side colour-pulse highlight lasts when a
// launcher card is clicked from the buildings menu.
export const LAUNCHER_WORLD_HIGHLIGHT_DURATION = 2.5;

export const BUILDING_TYPES = {
    AUTO_LAUNCHER: {
        id: 'auto_launcher',
        name: 'Auto Launcher',
        description: 'Automatically launches fireworks',
        baseCost: 10,
        costRatio: 1.2,
        currency: 'sparkles',
        width: 25,
        height: 40,
        color: { r: 95 / 255, g: 101 / 255, b: 180 / 255, a: 1 },
        texture: null,
        textureKey: null,
        baseSpawnInterval: 5,
        // UI metadata
        unlockId: 'buildings_tab',
        statId: 'stat-bld-auto',
        panel: {
            showLauncherList: true,
            showSpreadButton: true,
            showRandomizeButton: true,
        },
    },
    RESOURCE_GENERATOR: {
        id: 'resource_generator',
        name: 'Sparkle Generator',
        description: 'Passively generates sparkles over time',
        baseCost: 50,
        costRatio: 1.3,
        currency: 'gold',
        width: 25,
        height: 30,
        color: { r: 1, g: 0.84, b: 0, a: 1 },
        texture: null,
        textureKey: null,
        baseProductionRate: 0.5,
        resourceType: 'sparkles',
        // UI metadata
        unlockId: 'resource_generator',
        statId: 'stat-bld-gen',
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
        baseCost: 75,
        costRatio: 1.4,
        currency: 'gold',
        width: 40,
        height: 50,
        color: { r: 0.2, g: 0.7, b: 1.0, a: 1 },
        texture: null,
        textureKey: null,
        // Spawn interval (seconds) between drone launches
        baseSpawnInterval: 12,
        // Drone base stats (global upgrades apply multipliers on top of these)
        baseDroneLifetime: 10,
        baseDroneSpeed: 600,
        droneScale: 16,
        droneColor: { r: 0.1, g: 0.65, b: 0.8, a: 1.0 },
        // UI metadata
        unlockId: 'drone_hub',
        statId: 'stat-bld-drone',
        panel: {
            showLauncherList: false,
            showSpreadButton: false,
            showRandomizeButton: false,
        },
    }
};
