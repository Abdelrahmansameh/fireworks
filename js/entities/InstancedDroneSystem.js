import { DRONE_CONFIG, GAME_BOUNDS, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose } from '../animation/SkeletonAnimator.js';
const { BlendMode } = Renderer2D;

// Permanent jetpack crowd members share an instanced, animated skeleton.
const CROWD_SKELETON_URL = 'assets/skeletons/crowd.json';
const JETPACK_SKELETON_URL = 'assets/skeletons/jetpack.json';
// Phase-shift animations to keep flyers from moving in lockstep.
const PHASE_BUCKETS = 6;

// CPU buffer layout (strideFloats = 19)
// 0:px  1:py  2:vx  3:vy  4:targX  5:targY  6:wanderTimer
// 7:lifetime  8:initialLifetime  9:currentSpeed  10:radius
// 11:rotation  12:maxSpeed  13:r  14:g  15:b  16:a  17:trailTimer  18:oscPhase

class InstancedDroneSystem {
    constructor(renderer, particleSystem) {
        this.renderer = renderer;
        this.particleSystem = particleSystem;

        this.maxDrones = DRONE_CONFIG.maxDrones;
        // Match the maximum number of purchasable jetpacks.
        this.capacity = Math.max(128, this.maxDrones);
        this.desiredCount = 0;
        this._upgradeStats = {};
        this._disposed = false;
        this.strideFloats = 19;
        this.data = new Float32Array(this.capacity * this.strideFloats);
        this.count = 0;

        // Per-drone live objects captured by pull closures:
        //   { x, y, active: bool, collected: int, scale: number }
        this.droneRefs = new Array(this.capacity).fill(null);

        // Throttle: only scan for particles every N frames
        this._scanFrameCounter = 0;

        // Cached shape keys from the particle system (set once on first update)
        this._shapes = null;

        // Field offsets into the CPU buffer
        this.PX = 0; this.PY = 1;
        this.VX = 2; this.VY = 3;
        this.TX = 4; this.TY = 5;
        this.WANDER_TIMER = 6;
        this.LIFETIME = 7;
        this.INITIAL_LIFETIME = 8;
        this.CURRENT_SPEED = 9;   // scalar speed used by vehicular physics
        this.RADIUS = 10;
        this.ROTATION = 11;
        this.SPEED = 12;
        this.CR = 13; this.CG = 14; this.CB = 15; this.CA = 16;
        this.TRAIL_TIMER = 17;
        this.OSC_PHASE = 18;

        // ── Skeleton rendering ──────────────────────────────────────
        // The instanced group + per-part metadata are created once the skeleton
        // JSON loads. Owned jetpacks are queued until the mesh is ready.
        this.mesh = null;
        this.skeleton = null;
        this.animData = null;
        this.flyClip = null;
        this.partsPerDrone = 0;
        this._partMeta = null;        // precomputed per-part static data
        this._globalAnimTimer = 0;
        this._phasePoses = new Array(PHASE_BUCKETS).fill(null);
        this._initSkeleton();

        // ── Spatial grid for particle collection ────────────────────
        // Built once per scan frame and queried per-drone, so the cost of
        // finding collectable particles is O(particles + drones·cells) instead
        // of the naive O(drones·particles).
        // One-cell margin on every side so particles just outside the play
        // bounds (but within an edge drone's reach) still get bucketed.
        this._gridCellSize = DRONE_CONFIG.collectionRadius;
        this._gridX0 = GAME_BOUNDS.LAUNCHER_MIN_X - this._gridCellSize;
        this._gridY0 = GAME_BOUNDS.WORLD_LAUNCHER_Y - this._gridCellSize;
        this._gridCols = Math.ceil(
            (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X) / this._gridCellSize) + 3;
        this._gridRows = Math.ceil(
            (GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - GAME_BOUNDS.WORLD_LAUNCHER_Y) / this._gridCellSize) + 3;
        // Each cell is a flat array storing [shapeIdx, particleIdx, x, y] tuples.
        // Arrays are reused across frames (length reset, capacity retained).
        this._grid = new Array(this._gridCols * this._gridRows);
        for (let c = 0; c < this._grid.length; c++) this._grid[c] = [];
    }

    /**
     * Load the drone skeleton + animation, then build the instanced group that
     * holds capacity·partsPerDrone part-instances. Mirrors the crowd's approach.
     */
    async _initSkeleton() {
        try {
            const [crowd, prop] = await Promise.all([
                SkeletonData.load(CROWD_SKELETON_URL),
                SkeletonData.load(JETPACK_SKELETON_URL),
            ]);
            // Attach the reusable prop to the same body used by ordinary fans.
            const propParts = prop.skeleton.parts.filter(part => part.id !== 'jetpack_root')
                .map(part => ({ ...part, parentId: part.parentId === 'jetpack_root' ? 'body' : part.parentId }));
            this.skeleton = new SkeletonData([...crowd.skeleton.parts, ...propParts]);
            const fly = crowd.rawAnimations.fly;
            this.animData = new AnimationData({ fly: {
                ...fly, tracks: { ...fly.tracks, ...prop.rawAnimations.fly.tracks },
            } });
        } catch (e) {
            console.warn('jetpack crowd skeleton failed to load, using minimal fallback:', e);
            this.skeleton = new SkeletonData([
                { id: 'body', parentId: null, width: 1.4, height: 0.6, anchorX: 0, anchorY: 0, relX: 0, relY: 0, color: '63ffe4' }
            ]);
            this.animData = new AnimationData({ fly: { duration: 1, loop: true, tracks: {} } });
        }

        if (this._disposed) return;
        this.flyClip = this.animData.getClip('fly');
        this.partsPerDrone = this.skeleton.partCount;

        // Precompute static per-part data so the per-frame write loop is cheap.
        // drawOffset orders parts back-to-front (by z) within each drone's slot.
        const parts = this.skeleton.parts;
        const colors = this.skeleton.partColors;
        const drawIndexMap = this.skeleton.drawIndexMap;
        this._partMeta = parts.map((part, i) => ({
            id: part.id,
            width: part.width,
            height: part.height,
            anchorOffX: part.anchorX * part.width,
            anchorOffY: part.anchorY * part.height,
            r: colors[i].r,
            g: colors[i].g,
            b: colors[i].b,
            a: colors[i].a !== undefined ? colors[i].a : 1,
            drawOffset: drawIndexMap ? (drawIndexMap.get(part.id) || 0) : i,
        }));

        const geometry = Renderer2D.buildTexturedSquare(1, 1);
        this.mesh = this.renderer.createInstancedGroup({
            vertices: geometry.vertices,
            indices: geometry.indices,
            texCoords: geometry.texCoords,
            texture: null,
            maxInstances: this.capacity * this.partsPerDrone,
            blendMode: BlendMode.NORMAL,
            zIndex: 2000,
        });
        this.setCount(this.desiredCount, this._upgradeStats);
    }

    /**
     * Write all part-instances for one drone into the GPU buffer. The skeleton
     * is a side-view drone authored facing +X and standing upright; rather than
     * tumbling to its velocity heading, the rig stays upright, mirrors via
     * `flipX` to face its travel direction, and leans by a small `tilt`. Writes
     * directly into instanceData (bypassing the per-instance setters' bounds
     * guard, as the legacy drone renderer did).
     *
     * @param {Map} basePose — a phase-bucketed pose from computePose()
     * @param {number} flipX — +1 (facing right) or -1 (facing left)
     * @param {number} tilt — small body lean in radians
     * @param {number} wx,wy — drone world position
     * @param {number} scale — drone render scale
     * @param {number} baseInstanceIndex — first instance slot for this drone
     */
    _writeDronePose(basePose, flipX, tilt, wx, wy, scale, baseInstanceIndex, thrust = 1) {
        const meta = this._partMeta;
        const gpu = this.mesh.instanceData;
        const gStr = this.mesh.instanceStrideFloats;
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);

        for (let i = 0; i < meta.length; i++) {
            const m = meta[i];
            const tf = basePose.get(m.id);
            if (!tf) continue;

            const localRot = tf.rotation;
            const cosR = Math.cos(localRot);
            const sinR = Math.sin(localRot);

            // Skeleton-local draw centre (anchor-corrected), mirror horizontally
            // by flipX, then apply the small body tilt and place at world pos.
            const meshLocalX = tf.x - (m.anchorOffX * cosR - m.anchorOffY * sinR);
            const meshLocalY = tf.y - (m.anchorOffX * sinR + m.anchorOffY * cosR);
            const mlx = meshLocalX * flipX;
            const dmx = mlx * cosT - meshLocalY * sinT;
            const dmy = mlx * sinT + meshLocalY * cosT;

            const base = (baseInstanceIndex + m.drawOffset) * gStr;
            gpu[base + 0] = wx + dmx * scale;
            gpu[base + 1] = wy + dmy * scale;
            gpu[base + 2] = localRot * flipX + tilt;
            gpu[base + 3] = m.width * scale * (tf.scaleX ?? 1);
            gpu[base + 4] = m.height * scale * (tf.scaleY ?? 1) * (m.id.startsWith('flame_') ? thrust : 1);
            gpu[base + 5] = m.r * (tf.r ?? 1);
            gpu[base + 6] = m.g * (tf.g ?? 1);
            gpu[base + 7] = m.b * (tf.b ?? 1);
            gpu[base + 8] = m.a * (tf.a ?? 1) * (m.id.startsWith('flame_') ? thrust : 1);
        }
    }

    /**
     * Rebuild the spatial grid from the currently-collectable particles.
     * Called once per scan frame, before the per-drone loop.
     */
    _buildSpatialGrid() {
        const ps = this.particleSystem;
        const cfg = DRONE_CONFIG;
        const grid = this._grid;
        const cs = this._gridCellSize;
        const gx0 = this._gridX0, gy0 = this._gridY0;
        const cols = this._gridCols, rows = this._gridRows;

        for (let c = 0; c < grid.length; c++) grid[c].length = 0;

        const sStr = ps.strideFloats;
        const pTypeIdx = ps.particleTypeIdx;
        const pPosIdx = ps.positionIdx;
        const initLifeIdx = ps.initialLifetimeIdx;
        const lifeIdx = ps.lifetimeIdx;
        const minAge = cfg.minParticleAge;

        for (let si = 0; si < this._shapes.length; si++) {
            const shape = this._shapes[si];
            const sd = ps.instanceData[shape];
            if (!sd) continue;
            const pCount = ps.activeCounts[shape];
            if (pCount === 0) continue;

            for (let pi = 0; pi < pCount; pi++) {
                const pBase = pi * sStr;

                // Only collect firework-explosion particles that are old enough
                if (sd[pBase + pTypeIdx] !== PARTICLE_TYPES.FIREWORK_EXPLOSION) continue;
                if (sd[pBase + initLifeIdx] - sd[pBase + lifeIdx] < minAge) continue;

                const x = sd[pBase + pPosIdx];
                const y = sd[pBase + pPosIdx + 1];

                const cx = Math.floor((x - gx0) / cs);
                if (cx < 0 || cx >= cols) continue;
                const cy = Math.floor((y - gy0) / cs);
                if (cy < 0 || cy >= rows) continue;

                const bucket = grid[cy * cols + cx];
                bucket.push(si, pi, x, y);
            }
        }
    }

    // Pick a random world position within the playable area
    _randomWanderTarget() {
        const x = GAME_BOUNDS.LAUNCHER_MIN_X
            + Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X);
        const y = GAME_BOUNDS.WORLD_LAUNCHER_Y
            + Math.random() * (GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - GAME_BOUNDS.WORLD_LAUNCHER_Y);
        return { x, y };
    }

    /**
     * Spawn a new drone at world position (x, y).
     * Returns the drone index, or -1 if at capacity.
     */
    spawnDrone(x, y, options = {}) {
        // Owned flyers are queued by setCount until the skeleton finishes loading.
        if (!this.mesh) return -1;
        if (this.count >= Math.min(this.maxDrones, this.capacity)) return -1;

        const i = this.count;
        const base = i * this.strideFloats;
        const d = this.data;
        const cfg = DRONE_CONFIG;

        const lifetime = Infinity;
        const color = options.color ?? cfg.color;
        // Match the scale and small size variation of ground crowd members.
        const baseScale = 6.7 + Math.random() * 0.4;
        const scale = options.scale ?? (baseScale * (options.scaleMultiplier ?? 1));
        const radius = options.collectionRadius ?? cfg.collectionRadius;
        const speed = options.speed ?? cfg.wanderSpeed;

        // Compute initial launch direction if an angle is specified (degrees from vertical upward)
        const launchAngleDeg = options.launchAngleDeg ?? 0;
        const launchAngleRad = launchAngleDeg * Math.PI / 180;
        const launchDirX = (Math.random() < 0.5 ? -1 : 1) * Math.sin(launchAngleRad);
        const launchDirY = Math.cos(launchAngleRad);
        const wt = launchAngleDeg !== 0
            ? { x: x + launchDirX * 600, y: y + launchDirY * 600 }
            : this._randomWanderTarget();

        d[base + this.PX] = x;
        d[base + this.PY] = y;
        d[base + this.VX] = 0;
        d[base + this.VY] = 0;
        d[base + this.TX] = wt.x;
        d[base + this.TY] = wt.y;
        d[base + this.WANDER_TIMER] = cfg.wanderTargetChangeTime;
        d[base + this.LIFETIME] = lifetime;
        d[base + this.INITIAL_LIFETIME] = lifetime;
        d[base + this.CURRENT_SPEED] = 300;   // start from rest
        d[base + this.RADIUS] = radius;
        d[base + this.ROTATION] = Math.atan2(launchDirY, launchDirX);
        d[base + this.SPEED] = speed;
        d[base + this.CR] = color.r;
        d[base + this.CG] = color.g;
        d[base + this.CB] = color.b;
        d[base + this.CA] = color.a;
        d[base + this.TRAIL_TIMER] = 0;
        d[base + this.OSC_PHASE] = Math.random() * Math.PI * 2; // random phase offset

        // phaseBucket de-syncs rotor/core animation across drones; it travels
        // with the drone through swap-removes (droneRefs are moved, not indices).
        this.droneRefs[i] = {
            x, y, active: true, collected: 0, collectedValue: 0, lifetime, scale,
            baseLifetime: options.baseLifetime ?? lifetime,
            baseSpeed: options.baseSpeed ?? speed,
            baseRadius: options.baseRadius ?? radius,
            phaseBucket: Math.floor(Math.random() * PHASE_BUCKETS),
        };

        // GPU part-instances are written every frame in update(); nothing to
        // initialise here. instanceCount is set from `count` at the end of update.

        this.count++;
        return i;
    }

    /** Keep the visible permanent flyers in sync with the owned jetpack count. */
    setCount(count, stats = this._upgradeStats) {
        this.desiredCount = Math.min(this.capacity, Math.max(0, Math.floor(Number(count) || 0)));
        this._upgradeStats = stats || {};
        this.maxDrones = this.capacity;
        if (!this.mesh) return;
        while (this.count > this.desiredCount) {
            const ref = this.droneRefs[--this.count];
            if (ref) ref.active = false;
            this.droneRefs[this.count] = null;
        }
        while (this.count < this.desiredCount) {
            const x = GAME_BOUNDS.LAUNCHER_MIN_X + Math.random() * (GAME_BOUNDS.LAUNCHER_MAX_X - GAME_BOUNDS.LAUNCHER_MIN_X);
            if (this.spawnDrone(x, GAME_BOUNDS.WORLD_LAUNCHER_Y) < 0) break;
        }
        this.mesh.instanceCount = this.count * this.partsPerDrone;
        this.applyUpgradeStats(this._upgradeStats);
    }

    /** Apply speed and collection upgrades to flyers already in the sky. */
    applyUpgradeStats(stats) {
        this._upgradeStats = stats || {};
        for (let i = 0; i < this.count; i++) {
            const base = i * this.strideFloats;
            const ref = this.droneRefs[i];
            this.data[base + this.SPEED] = ref.baseSpeed * (stats.speedMultiplier ?? 1);
            this.data[base + this.RADIUS] = ref.baseRadius * (stats.collectionRadiusMultiplier ?? 1);
        }
    }

    /**
     * Update all drones.
     * @param {number} delta  Seconds since last frame.
     * @param {function} onAwardSparkles  Called with (sparkleAmount, particleCount)
     *   as drones collect — at most once per frame (collections are batched).
     */
    update(delta, onAwardSparkles) {
        // Nothing to do until the skeleton has loaded its instanced group.
        if (!this.mesh || this.count === 0) return;

        const d = this.data;
        const cfg = DRONE_CONFIG;
        const ps = this.particleSystem;

        // Cache shape list once
        if (!this._shapes) {
            this._shapes = Object.keys(ps.instanceData);
        }

        // ── Animation poses ──────────────────────────────────────────
        // Compute one pose per phase bucket this frame; each drone samples the
        // bucket it was assigned at spawn. O(PHASE_BUCKETS) instead of O(drones).
        const clipDur = this.flyClip ? this.flyClip.duration : 1;
        this._globalAnimTimer = (this._globalAnimTimer + delta) % clipDur;
        for (let k = 0; k < PHASE_BUCKETS; k++) {
            const t = (this._globalAnimTimer + (k / PHASE_BUCKETS) * clipDur) % clipDur;
            this._phasePoses[k] = computePose(this.skeleton, this.flyClip, t);
        }

        this._scanFrameCounter++;
        const doScan = (this._scanFrameCounter % cfg.scanInterval) === 0;

        // Build the shared spatial grid once for this scan frame so each drone
        // can query only the particles near it.
        if (doScan) this._buildSpatialGrid();

        // Particles collected across all drones this frame (awarded once below).
        let frameCollected = 0;
        let frameCollectedValue = 0;

        for (let i = 0; i < this.count; i++) {
            const base = i * this.strideFloats;
            const ref = this.droneRefs[i];

            // ── Drain collections ────────────────────────────────────
            // Pull closures (run inside particleSystem.update, earlier in the
            // frame) increment ref.collected; award continuously rather than
            // as a lump on despawn so income and the stats-panel rate are live.
            if (ref.collected > 0) {
                frameCollected += ref.collected;
                frameCollectedValue += ref.collectedValue;
                ref.collectedValue = 0;
                ref.collected = 0;
            }

            // ── Wander steering ──────────────────────────────────────
            d[base + this.WANDER_TIMER] -= delta;

            let dx = d[base + this.TX] - d[base + this.PX];
            let dy = d[base + this.TY] - d[base + this.PY];

            const _px = d[base + this.PX];
            const _py = d[base + this.PY];
            let isOutOfBounds = false;

            if (_px < GAME_BOUNDS.LAUNCHER_MIN_X || _px > GAME_BOUNDS.LAUNCHER_MAX_X
                || _py < GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y || _py > GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y) {
                const safeX = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X + 150,
                    Math.min(_px, GAME_BOUNDS.LAUNCHER_MAX_X - 150));
                const safeY = Math.max(GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y + 50,
                    Math.min(_py, GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y - 50));
                d[base + this.TX] = safeX;
                d[base + this.TY] = safeY;
                d[base + this.WANDER_TIMER] = cfg.wanderTargetChangeTime; // prevent wander override while correcting
                dx = safeX - _px;
                dy = safeY - _py;
                isOutOfBounds = true;
            } else {
                const distToTargetCheck = Math.sqrt(dx * dx + dy * dy);
                if (distToTargetCheck < 80 || d[base + this.WANDER_TIMER] <= 0) {
                    const wt = this._randomWanderTarget();
                    d[base + this.TX] = wt.x;
                    d[base + this.TY] = wt.y;
                    d[base + this.WANDER_TIMER] = cfg.wanderTargetChangeTime + (Math.random() - 0.5) * 1.5;
                    dx = d[base + this.TX] - d[base + this.PX];
                    dy = d[base + this.TY] - d[base + this.PY];
                }
            }

            // Jetpack flight has inertia: steer sideways gradually and pulse the
            // motor against gravity to gain height, coasting when descending.
            const maxSpeed = d[base + this.SPEED];
            const vx0 = d[base + this.VX];
            const vy0 = d[base + this.VY];
            const targetVX = Math.max(-maxSpeed, Math.min(maxSpeed, dx * 0.65));
            const horizontalAccel = Math.max(-320, Math.min(320, (targetVX - vx0) * 1.4));
            d[base + this.VX] += horizontalAccel * delta;

            // Aim for a vertical speed based on distance, with hysteresis to
            // avoid rapidly switching the engine around the target altitude.
            const targetVY = Math.max(-maxSpeed * 0.65, Math.min(maxSpeed * 0.8, dy * 0.55));
            if (vy0 < targetVY - 25) ref.engineActive = true;
            else if (vy0 > targetVY + 25) ref.engineActive = false;
            d[base + this.VY] = Math.max(-maxSpeed * 0.8, Math.min(maxSpeed, vy0 + ((ref.engineActive ? 480 : 0) - 240) * delta));
            const isTurning = Math.abs(targetVX - vx0) > maxSpeed * 0.7;

            // Integrate position
            d[base + this.PX] += d[base + this.VX] * delta;
            d[base + this.PY] += d[base + this.VY] * delta;

            // Clamp to world bounds
            d[base + this.PX] = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X,
                Math.min(d[base + this.PX], GAME_BOUNDS.LAUNCHER_MAX_X));
            d[base + this.PY] = Math.max(GAME_BOUNDS.WORLD_LAUNCHER_Y,
                Math.min(d[base + this.PY], GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y));

            if ((d[base + this.PX] <= GAME_BOUNDS.LAUNCHER_MIN_X && d[base + this.VX] < 0)
                || (d[base + this.PX] >= GAME_BOUNDS.LAUNCHER_MAX_X && d[base + this.VX] > 0)) d[base + this.VX] = 0;
            if ((d[base + this.PY] <= GAME_BOUNDS.WORLD_LAUNCHER_Y && d[base + this.VY] < 0)
                || (d[base + this.PY] >= GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y && d[base + this.VY] > 0)) d[base + this.VY] = 0;

            // ── Upright facing + lean ─────────────────────────────────
            // Side-view drone: don't tumble to the heading. Mirror left/right
            // to face travel (with a dead-band so it doesn't flicker near zero
            // horizontal speed) and lean slightly into horizontal motion.
            const vx = d[base + this.VX];
            const vy = d[base + this.VY];
            // A small dead band prevents flickering around level flight. The
            // 0.3 second ramp is the ignition/extinguishing transition.
            if (vy < -10) ref.thrustOn = false;
            else if (vy > 10) ref.thrustOn = true;
            const thrustTarget = ref.thrustOn === false ? 0 : 1;
            ref.thrust = Math.max(0, Math.min(1, (ref.thrust ?? 1) + (thrustTarget ? 1 : -1) * delta / 0.3));
            let flipX = ref.flipX || 1;
            if (vx > 30) flipX = 1;
            else if (vx < -30) flipX = -1;
            ref.flipX = flipX;
            // Lean: tip the nose toward the direction of travel, capped. Sign is
            // mirrored by flipX so it always leans "forward" in screen space.
            const targetTilt = -flipX * Math.min(0.32, Math.abs(vx) * 0.0004);
            ref.tilt = (ref.tilt ?? 0) + (targetTilt - (ref.tilt ?? 0)) * Math.min(1, delta * 6);
            // Sync the live ref position so pull closures are current
            ref.x = d[base + this.PX];
            ref.y = d[base + this.PY];

            // ── Drone trail ──────────────────────────────────────────
            // Trails act as thrusters: suppress them while the drone is turning
            const trailCfg = cfg.droneTrails;
            if (trailCfg.enabled && ref.thrust > 0.5) {
                d[base + this.TRAIL_TIMER] -= delta;
                if (d[base + this.TRAIL_TIMER] <= 0 && !isTurning) {
                    d[base + this.TRAIL_TIMER] += trailCfg.spawnRate;

                    const sc = ref.scale;

                    // Downwash: the side-view drone is upright, so trail puffs eject
                    // downward from just below the body (rotor wash), with a slight
                    // backward bias opposite the travel direction.
                    const tailX = d[base + this.PX] - flipX * 0.15 * sc;
                    const tailY = d[base + this.PY] - 0.5 * sc;

                    // Eject mostly downward (−Y), nudged backward by heading.
                    const baseAngle = -Math.PI / 2 - flipX * 0.25;
                    const coneHalf = trailCfg.coneAngle * (Math.PI / 180);

                    const dr = d[base + this.CR];
                    const dg = d[base + this.CG];
                    const db = d[base + this.CB];

                    for (let t = 0; t < trailCfg.perBurst; t++) {
                        const angle = baseAngle + (Math.random() - 0.5) * 2 * coneHalf;
                        const speed = trailCfg.speed * (0.6 + Math.random() * 0.8);
                        ps.addParticle(
                            new Renderer2D.Vector2(tailX, tailY),
                            new Renderer2D.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed),
                            new Renderer2D.Color(trailCfg.color.r, trailCfg.color.g, trailCfg.color.b, trailCfg.alphaMultiplier),
                            trailCfg.size,
                            trailCfg.lifetime,
                            trailCfg.gravity,
                            trailCfg.shape,
                            new Renderer2D.Vector2(0, 0),
                            trailCfg.friction,
                            0,    // no glow
                            0,    // no blur
                            null, // no update fn
                            false, // no gradient
                            null,
                            0.0,
                            1.0,
                            PARTICLE_TYPES.TRAIL
                        );
                    }
                }
            }

            // ── Particle scan ────────────────────────────────────────
            if (doScan) {
                const droneX = d[base + this.PX];
                const droneY = d[base + this.PY];
                const radius = d[base + this.RADIUS];
                const droneRef = ref; // captured by pull closure

                // Query only the grid cells overlapping this drone's radius.
                const cs = this._gridCellSize;
                const cols = this._gridCols, rows = this._gridRows;
                const gx0 = this._gridX0, gy0 = this._gridY0;
                const grid = this._grid;

                let mincx = Math.floor((droneX - radius - gx0) / cs);
                if (mincx < 0) mincx = 0;
                let maxcx = Math.floor((droneX + radius - gx0) / cs);
                if (maxcx >= cols) maxcx = cols - 1;
                let mincy = Math.floor((droneY - radius - gy0) / cs);
                if (mincy < 0) mincy = 0;
                let maxcy = Math.floor((droneY + radius - gy0) / cs);
                if (maxcy >= rows) maxcy = rows - 1;

                for (let cy = mincy; cy <= maxcy; cy++) {
                    const rowBase = cy * cols;
                    for (let cx = mincx; cx <= maxcx; cx++) {
                        const bucket = grid[rowBase + cx];
                        for (let e = 0; e < bucket.length; e += 4) {
                            const pdx = bucket[e + 2] - droneX;
                            if (pdx > radius || pdx < -radius) continue;
                            const pdy = bucket[e + 3] - droneY;
                            if (pdy > radius || pdy < -radius) continue;

                            const pi = bucket[e + 1];
                            const updateFns = ps.particleUpdateFns[this._shapes[bucket[e]]];

                            // Don't override a pull that's already in progress
                            const existingFn = updateFns[pi];
                            if (existingFn && (existingFn._isDronePull || existingFn._isCrowdPull)) continue;

                            const sd = ps.instanceData[this._shapes[bucket[e]]];
                            const sparkleValue = sd[pi * ps.strideFloats + ps.sparkleValueIdx] || 0;

                            // Build pull closure — captures droneRef (live object)
                            let pullElapsed = 0;
                            const pullFn = (state, delta) => {
                            if (!droneRef.active) return;
                            pullElapsed += delta;

                            const ex = droneRef.x - state.position.x;
                            const ey = droneRef.y - state.position.y;
                            const eDist = Math.sqrt(ex * ex + ey * ey);

                            if (eDist < cfg.arrivalThreshold || pullElapsed >= cfg.maxCaptureTime) {
                                // Particle reached the drone (or timed out) — collect it
                                droneRef.collected++;
                                droneRef.collectedValue += sparkleValue;
                                state.lifetime = 0; // kill particle
                                return;
                            }
                            state.alpha = pullElapsed / cfg.maxCaptureTime; 
                            state.scale = pullElapsed / cfg.maxCaptureTime;

                            state.lifetime = 1.0;
                            // Accelerate toward drone
                            const eInv = 1 / eDist;
                            state.velocity.x += ex * eInv * cfg.pullForce * delta;
                            state.velocity.y += ey * eInv * cfg.pullForce * delta;

                            // Shift color toward warm gold/white
                            state.color.r += 0.5 * delta;
                            state.color.g += 0.5 * delta;
                            state.color.b += 0.5 * delta;
                        };
                        pullFn._isDronePull = true;

                            updateFns[pi] = pullFn;
                        }
                    }
                }
            }  // doScan

            // Pose the drone upright, flipped to face travel and leaning into it.
            const pose = this._phasePoses[ref.phaseBucket] || this._phasePoses[0];
            this._writeDronePose(
                pose,
                ref.flipX || 1,
                ref.tilt || 0,
                d[base + this.PX],
                d[base + this.PY],
                ref.scale,
                i * this.partsPerDrone,
                ref.thrust
            );
        }

        if (frameCollected > 0) {
            onAwardSparkles(frameCollectedValue * cfg.sparklesPerParticle, frameCollected);
        }

        this.mesh.instanceCount = this.count * this.partsPerDrone;
    }

    /**
     * Despawn all drones instantly (e.g. on game reset).
     */
    clear() {
        this.desiredCount = 0;
        for (let i = 0; i < this.count; i++) {
            if (this.droneRefs[i]) this.droneRefs[i].active = false;
        }
        this.count = 0;
        if (this.mesh) this.mesh.instanceCount = 0;
    }

    dispose() {
        this._disposed = true;
        this.clear();
        if (this.mesh) this.renderer.removeInstancedGroup(this.mesh);
        this.mesh = null;
    }
}

export default InstancedDroneSystem;
