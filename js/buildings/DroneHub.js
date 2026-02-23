import Building from './Building.js';
import { GAME_BOUNDS, DRONE_CONFIG } from '../config/config.js';

/**
 * DroneHub – a building that periodically spawns drones into the world.
 *
 * Each drone will wander the sky collecting firework explosion particles and
 * converting them into sparkles, just like a manually-spawned drone.
 *
 * Level scaling:
 *   - Spawn interval shrinks by `spawnIntervalRatio` per level.
 *   - Drone lifetime grows by `droneLifetimeRatio` per level.
 *   - Drone speed grows by `droneSpeedRatio` per level.
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

    /** Recalculate the drone options that scale with level. */
    _updateDroneOptions() {
        const cfg = this.config;
        const lvl = this.level - 1; // 0-based exponent

        this.droneLifetime = cfg.baseDroneLifetime * Math.pow(cfg.droneLifetimeRatio, lvl);
        this.droneSpeed    = cfg.baseDroneSpeed    * Math.pow(cfg.droneSpeedRatio,    lvl);

        this.droneOptions = {
            lifetime:       this.droneLifetime,
            speed:          this.droneSpeed,
            color:          cfg.droneColor,
            scale:          cfg.droneScale,
            launchAngleDeg: DRONE_CONFIG.spawnLaunchAngleDeg,
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

        // Spawn slightly above the building so it's visually clear where it came from
        const spawnX = this.x + (Math.random() - 0.5) * this.config.width;
        const spawnY = this.y + this.config.height * 0.6;

        droneSystem.spawnDrone(spawnX, spawnY, this.droneOptions);
    }

    onUpgrade() {
        // Reduce spawn interval each level
        this.spawnInterval *= this.config.spawnIntervalRatio;
        // Improve drone stats each level
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
