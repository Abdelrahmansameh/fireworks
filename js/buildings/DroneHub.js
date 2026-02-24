import Building from './Building.js';
import { GAME_BOUNDS, DRONE_CONFIG } from '../config/config.js';

/**
 * DroneHub – a building that periodically spawns drones into the world.
 *
 * Level scaling (building upgrades):
 *   - Spawn interval shrinks by `spawnIntervalRatio` per level.
 *
 * Drone stats (lifetime, speed, collection radius, max count) are controlled
 * exclusively by global upgrades purchased in the Upgrades tab, which modify
 * `game.droneStats`.
 */
class DroneHub extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'DRONE_HUB', x, y, data);

        // How many seconds between each drone spawn
        this.spawnInterval = data.spawnInterval ?? this.config.baseSpawnInterval;

        // Stagger initial spawn so all hubs don't fire at once
        this.accumulator = data.accumulator ?? (Math.random() * this.spawnInterval);

        // Per-drone options derived from current level
        this._updateDroneOptions();
    }

    /** Rebuild drone options from base config + global upgrade multipliers. */
    _updateDroneOptions() {
        const cfg = this.config;
        const ds  = this.game.droneStats ?? {};

        this.droneOptions = {
            lifetime:         cfg.baseDroneLifetime  * (ds.lifetimeMultiplier         ?? 1),
            speed:            cfg.baseDroneSpeed     * (ds.speedMultiplier             ?? 1),
            collectionRadius: DRONE_CONFIG.collectionRadius * (ds.collectionRadiusMultiplier ?? 1),
            color:            cfg.droneColor,
            scale:            cfg.droneScale,
            launchAngleDeg:   DRONE_CONFIG.spawnLaunchAngleDeg,
        };
    }

    update(deltaTime) {
        this.accumulator += deltaTime;

        if (this.accumulator >= this.spawnInterval) {
            this._spawnDrone();
            this.accumulator -= this.spawnInterval;
        }
    }

    _spawnDrone() {
        const droneSystem = this.game.droneSystem;
        if (!droneSystem) return;

        // Always recalculate so that global drone upgrades are reflected immediately
        this._updateDroneOptions();

        // Spawn slightly above the building so it's visually clear where it came from
        const spawnX = this.x + (Math.random() - 0.5) * this.config.width;
        const spawnY = this.y + this.config.height * 0.6;

        droneSystem.spawnDrone(spawnX, spawnY, this.droneOptions);
    }

    onUpgrade() {
        // Building upgrades only reduce the spawn interval
        this.spawnInterval *= this.config.spawnIntervalRatio;
        // Refresh drone options so any current global upgrades are reflected
        this._updateDroneOptions();
    }

    /** How many drones per second this hub spawns. */
    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    serialize() {
        return {
            ...super.serialize(),
            spawnInterval: this.spawnInterval,
            accumulator:   this.accumulator,
        };
    }
}

export default DroneHub;
