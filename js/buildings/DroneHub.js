import Building from './Building.js';
import { GAME_BOUNDS, DRONE_CONFIG } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances, computeSkeletonOutlinePoints } from '../animation/SkeletonAnimator.js';

/**
 * DroneHub – a building that periodically spawns drones into the world.
 *
 * Drone stats (lifetime, speed, collection radius, max count) are controlled
 * exclusively by global upgrades purchased in the Upgrades tab, which modify
 * `game.droneStats`. The spawn interval is controlled by the global
 * `drone_hub_spawn_rate` upgrade via `game.droneHubStats`.
 */
class DroneHub extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'DRONE_HUB', x, y, data);

        // Stagger initial spawn so all hubs don't fire at once
        this.accumulator = data.accumulator ?? (Math.random() * this.config.baseSpawnInterval);

        // Per-drone options derived from current level
        this._updateDroneOptions();

        // Skeleton rendering state
        this._skeleton = null;
        this._animData = null;
        this._instancedGroup = null;
        this._animTimer = Math.random() * 3;
        this._clipName = 'idle';

        this._loadSkeleton();
    }

    createMesh() {
        // Use skeleton rendering instead of the legacy colored rectangle
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
        super.update(deltaTime);

        this._animTimer += deltaTime;
        if (this._skeleton && this._instancedGroup) {
            this._renderFrame();
        }

        this.accumulator += deltaTime;

        if (this.accumulator >= this.spawnInterval) {
            this._spawnDrone();
            this.accumulator -= this.spawnInterval;
        }
    }

    _spawnDrone() {
        const droneSystem = this.game.droneSystem;
        if (!droneSystem) return;

        // Recalculate so that global upgrades are always reflected
        this._updateDroneOptions();

        // Spawn slightly above the building so it's visually clear where it came from
        const spawnX = this.x + (Math.random() - 0.5) * this.config.width;
        const spawnY = this.y + this.config.height * 0.6;

        droneSystem.spawnDrone(spawnX, spawnY, this.droneOptions);
    }

    get spawnInterval() {
        return this.config.baseSpawnInterval * (this.game.droneHubStats?.spawnIntervalMultiplier ?? 1);
    }

    /** How many drones per second this hub spawns. */
    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    async _loadSkeleton() {
        try {
            const url = this.config.skeletonUrl;
            if (!url) return;
            const { skeleton, rawAnimations } = await SkeletonData.load(url);
            this._skeleton = skeleton;
            this._animData = new AnimationData(rawAnimations);
        } catch (e) {
            console.error('DroneHub: failed to load skeleton', e);
            return;
        }

        try {
            const geometry = Renderer2D.buildTexturedSquare(1, 1);
            this._instancedGroup = this.game.renderer2D.createInstancedGroup({
                vertices: geometry.vertices,
                indices: geometry.indices,
                texCoords: geometry.texCoords,
                texture: null,
                maxInstances: this._skeleton.partCount,
                zIndex: this.config.zIndex || 12,
                blendMode: Renderer2D.BlendMode.NORMAL,
            });

            for (let i = 0; i < this._skeleton.partCount; i++) {
                this._instancedGroup.addInstanceRaw(this.x, this.y, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
            }

            this._renderFrame();
        } catch (e) {
            console.error('DroneHub: failed to create instanced group', e);
        }
    }

    _renderFrame() {
        if (!this._skeleton || !this._instancedGroup) return;

        const clip = this._animData ? this._animData.getClip(this._clipName) : null;
        const time = clip
            ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
            : 0;

        const pose = computePose(this._skeleton, clip, time);

        applyPoseToInstances(
            this._skeleton, pose, this._instancedGroup,
            0,
            this.x, this.y,
            this.config.skeletonScale,
            1
        );
    }

    /** Return the world-space convex hull outline of this building's skeleton at its current pose. */
    getSkeletonOutlinePoints() {
        if (!this._skeleton || !this._animData) return null;

        const clip = this._animData ? this._animData.getClip(this._clipName) : null;
        const time = clip
            ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
            : 0;

        const pose = computePose(this._skeleton, clip, time);
        return computeSkeletonOutlinePoints(this._skeleton, pose, this.x, this.y, this.config.skeletonScale ?? 1, 1);
    }

    destroy() {
        if (this._instancedGroup) {
            this.game.renderer2D.removeInstancedGroup(this._instancedGroup);
            this._instancedGroup = null;
        }
        this._skeleton = null;
        this._animData = null;
        super.destroy();
    }

    serialize() {
        return {
            ...super.serialize(),
            accumulator: this.accumulator,
        };
    }
}

export default DroneHub;
