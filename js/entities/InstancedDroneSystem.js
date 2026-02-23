import { DRONE_CONFIG, GAME_BOUNDS, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
const { BlendMode } = Renderer2D;

// Narrow elongated diamond/arrowhead pointing in +X direction.
// When rotation = atan2(vy, vx), the drone faces its movement direction.
function buildDroneMesh() {
    const vertices = new Float32Array([
        1.0, 0.0,   // 0 – front tip
        0.05, 0.45, // 1 – upper wing tip
        -0.55, 0.18, // 2 – upper back shoulder
        -0.8, 0.0,  // 3 – tail
        -0.55, -0.12, // 4 – lower back shoulder
        0.05, -0.30, // 5 – lower wing tip
    ]);
    // Four triangles fanning from front tip
    const indices = new Uint16Array([
        0, 1, 2,
        0, 2, 3,
        0, 3, 4,
        0, 4, 5,
    ]);
    return { vertices, indices };
}

// CPU buffer layout (strideFloats = 19)
// 0:px  1:py  2:vx  3:vy  4:targX  5:targY  6:wanderTimer
// 7:lifetime  8:initialLifetime  9:currentSpeed  10:radius
// 11:rotation  12:maxSpeed  13:r  14:g  15:b  16:a  17:trailTimer  18:oscPhase

class InstancedDroneSystem {
    constructor(renderer, particleSystem) {
        this.renderer = renderer;
        this.particleSystem = particleSystem;

        this.maxDrones = DRONE_CONFIG.maxDrones;
        this.strideFloats = 19;
        this.data = new Float32Array(this.maxDrones * this.strideFloats);
        this.count = 0;

        // Per-drone live objects captured by pull closures:
        //   { x, y, active: bool, collected: int, scale: number }
        this.droneRefs = new Array(this.maxDrones).fill(null);

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

        // Create the WebGL instanced mesh
        const mesh = buildDroneMesh();
        this.mesh = this.renderer.createInstancedGroup({
            vertices: mesh.vertices,
            indices: mesh.indices,
            maxInstances: this.maxDrones,
            blendMode: BlendMode.ADDITIVE,
            zIndex: 2000,
        });
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
        if (this.count >= this.maxDrones) return -1;

        const i = this.count;
        const base = i * this.strideFloats;
        const d = this.data;
        const cfg = DRONE_CONFIG;

        const lifetime = options.lifetime ?? cfg.defaultLifetime;
        const color = options.color ?? cfg.color;
        const scale = options.scale ?? cfg.defaultScale;
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

        this.droneRefs[i] = { x, y, active: true, collected: 0, scale };

        // Initialise the GPU slot (addInstanceRaw appends at current instanceCount)
        this.mesh.addInstanceRaw(
            x, y,
            0,
            scale, scale,
            color.r, color.g, color.b, color.a,
            DRONE_CONFIG.glowStrength,
            0
        );

        this.count++;
        return i;
    }

    /**
     * Update all drones.
     * @param {number} delta  Seconds since last frame.
     * @param {function} onAwardSparkles  Called with (sparkleAmount) when a drone collects.
     */
    update(delta, onAwardSparkles) {
        if (this.count === 0) return;

        const d = this.data;
        const cfg = DRONE_CONFIG;
        const ps = this.particleSystem;

        // Cache shape list once
        if (!this._shapes) {
            this._shapes = Object.keys(ps.instanceData);
        }

        const gpu = this.mesh.instanceData;
        const gStr = this.mesh.instanceStrideFloats;

        const now = performance.now();
        this._scanFrameCounter++;
        const doScan = (this._scanFrameCounter % cfg.scanInterval) === 0;

        for (let i = 0; i < this.count; i++) {
            const base = i * this.strideFloats;
            const gBase = i * gStr;
            const ref = this.droneRefs[i];

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

            const distToTarget = Math.sqrt(dx * dx + dy * dy);

            // ── Vehicular speed & steering ───────────────────────────
            const maxSpeed = d[base + this.SPEED];
            let currentSpeed = d[base + this.CURRENT_SPEED];
            const invDist = distToTarget > 0.01 ? 1 / distToTarget : 0;

            // Desired unit direction toward target
            const desiredDirX = dx * invDist;
            const desiredDirY = dy * invDist;

            // Current heading unit vector derived from actual velocity
            const curVX = d[base + this.VX];
            const curVY = d[base + this.VY];
            const curSpeedMag = Math.sqrt(curVX * curVX + curVY * curVY);
            const headingX = curSpeedMag > 0.5 ? curVX / curSpeedMag : desiredDirX;
            const headingY = curSpeedMag > 0.5 ? curVY / curSpeedMag : desiredDirY;

            // Dot product: how aligned is current heading with desired direction?
            const alignDot = headingX * desiredDirX + headingY * desiredDirY;

            // Brake when a large direction change is needed, cruise otherwise
            const isTurning = alignDot < cfg.turnThresholdDot;
            const targetSpeed = isTurning ? cfg.minTurnSpeed : maxSpeed;

            // Accelerate or decelerate toward target speed
            if (currentSpeed < targetSpeed) {
                currentSpeed = Math.min(currentSpeed + cfg.acceleration * delta, targetSpeed);
            } else {
                currentSpeed = Math.max(currentSpeed - cfg.deceleration * delta, targetSpeed);
            }
            d[base + this.CURRENT_SPEED] = currentSpeed;

            const steerRate = isOutOfBounds ? cfg.steerRateHigh : cfg.steerRateLow;
            const steerK = 1 - Math.exp(-steerRate * delta);

            // ── Sine-wave oscillation (perpendicular to heading) ────
            d[base + this.OSC_PHASE] += delta * cfg.oscillationFrequency * Math.PI * 2;
            // Perpendicular unit vector to desired direction: (-y, x)
            const perpX = -desiredDirY;
            const perpY = desiredDirX;
            // Suppress oscillation mid-turn so it doesn't fight the steering
            const oscScale = isTurning ? 0.0 : Math.sin(d[base + this.OSC_PHASE]);
            const oscVX = perpX * oscScale * cfg.oscillationAmplitude;
            const oscVY = perpY * oscScale * cfg.oscillationAmplitude;

            // Drive velocity toward (desiredDir * currentSpeed) + oscillation
            const targetVX = desiredDirX * currentSpeed;
            const targetVY = desiredDirY * currentSpeed;
            // safety in case current speed is close to 0
            if (currentSpeed < 5) {
                targetVX = desiredDirX * 1;
                targetVY = desiredDirY * 1;
            }

            d[base + this.VX] += (targetVX - d[base + this.VX]) * steerK + oscVX * delta;
            d[base + this.VY] += (targetVY - d[base + this.VY]) * steerK + oscVY * delta;

            // Integrate position
            d[base + this.PX] += d[base + this.VX] * delta;
            d[base + this.PY] += d[base + this.VY] * delta;

            // Clamp to world bounds
            d[base + this.PX] = Math.max(GAME_BOUNDS.LAUNCHER_MIN_X,
                Math.min(d[base + this.PX], GAME_BOUNDS.LAUNCHER_MAX_X));
            d[base + this.PY] = Math.max(GAME_BOUNDS.WORLD_LAUNCHER_Y,
                Math.min(d[base + this.PY], GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y));

            // ── Visual rotation lag ───────────────────────────────────
            // Body rotates toward velocity direction at a capped angular rate
            const vx = d[base + this.VX];
            const vy = d[base + this.VY];
            if (vx * vx + vy * vy > 1) {
                d[base + this.ROTATION] = Math.atan2(vy, vx);
            }
            // Sync the live ref position so pull closures are current
            ref.x = d[base + this.PX];
            ref.y = d[base + this.PY];

            // ── Drone trail ──────────────────────────────────────────
            // Trails act as thrusters: suppress them while the drone is turning
            const trailCfg = cfg.droneTrails;
            if (trailCfg.enabled) {
                d[base + this.TRAIL_TIMER] -= delta;
                if (d[base + this.TRAIL_TIMER] <= 0 && !isTurning) {
                    d[base + this.TRAIL_TIMER] += trailCfg.spawnRate;

                    const rot = d[base + this.ROTATION];
                    const sc = ref.scale;

                    // Drone tail is at local (-0.60, 0) — transform to world space
                    const tailX = d[base + this.PX] + Math.cos(rot) * (-0.60 * sc);
                    const tailY = d[base + this.PY] + Math.sin(rot) * (-0.60 * sc);

                    // Eject direction: opposite to drone facing (backward away from tail)
                    const baseAngle = rot + Math.PI;
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

                for (let si = 0; si < this._shapes.length; si++) {
                    const shape = this._shapes[si];
                    const sd = ps.instanceData[shape];
                    if (!sd) continue;

                    const pCount = ps.activeCounts[shape];
                    if (pCount === 0) continue;

                    const sStr = ps.strideFloats;
                    const updateFns = ps.particleUpdateFns[shape];
                    const pTypeIdx = ps.particleTypeIdx;
                    const pPosIdx = ps.positionIdx;

                    for (let pi = 0; pi < pCount; pi++) {
                        const pBase = pi * sStr;

                        // Only collect firework-explosion particles
                        if (sd[pBase + pTypeIdx] !== PARTICLE_TYPES.FIREWORK_EXPLOSION) continue;

                        // Skip particles that haven't been alive long enough
                        const pAge = sd[pBase + ps.initialLifetimeIdx] - sd[pBase + ps.lifetimeIdx];
                        if (pAge < cfg.minParticleAge) continue;

                        const pdx = sd[pBase + pPosIdx] - droneX;
                        if (pdx > radius || pdx < -radius) continue;
                        const pdy = sd[pBase + pPosIdx + 1] - droneY;
                        if (pdy > radius || pdy < -radius) continue;

                        // Don't override a pull that's already in progress
                        const existingFn = updateFns[pi];
                        if (existingFn && existingFn._isDronePull) continue;

                        // Build pull closure — captures droneRef (live object)
                        let pullElapsed = 0;
                        const pullFn = (state, delta) => {
                            if (!droneRef.active) return;
                            // todo, if you have very low fps you wont get
                            if (droneRef.lifetime <= 0.2) 
                            {                                
                                droneRef.collected++;
                                state.lifetime = 0;
                                return;
                            }
                            pullElapsed += delta;

                            const ex = droneRef.x - state.position.x;
                            const ey = droneRef.y - state.position.y;
                            const eDist = Math.sqrt(ex * ex + ey * ey);

                            if (eDist < cfg.arrivalThreshold || pullElapsed >= cfg.maxCaptureTime) {
                                // Particle reached the drone (or timed out) — collect it
                                droneRef.collected++;
                                state.lifetime = 0; // kill particle
                                return;
                            }
                            state.alpha = pullElapsed / cfg.maxCaptureTime; 
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
            }  // doScan

            // ── Lifetime ─────────────────────────────────────────────
            d[base + this.LIFETIME] -= delta;
            if (d[base + this.LIFETIME] <= 0) {
                ref.active = false;
                const sparkles = ref.collected * cfg.sparklesPerParticle;
                if (sparkles > 0) onAwardSparkles(sparkles);

                // Swap-remove
                const lastIdx = this.count - 1;
                if (i !== lastIdx) {
                    const lastBase = lastIdx * this.strideFloats;
                    const gLast = lastIdx * gStr;
                    d.set(d.subarray(lastBase, lastBase + this.strideFloats), base);
                    gpu.set(gpu.subarray(gLast, gLast + gStr), gBase);
                    this.droneRefs[i] = this.droneRefs[lastIdx];
                }
                this.droneRefs[lastIdx] = null;
                this.count--;
                this.mesh.instanceCount = this.count;
                i--;
                continue;
            }

            // ── Write GPU slot ───────────────────────────────────────
            // Gentle pulse so drones are visually distinct from static objects
            const pulse = 1.0 + 0.45 * Math.sin(now * 0.003 + i * 1.3);
            const alpha =  pulse;

            gpu[gBase + 0] = d[base + this.PX];
            gpu[gBase + 1] = d[base + this.PY];
            gpu[gBase + 2] = d[base + this.ROTATION];
            const sc = ref.scale;
            gpu[gBase + 3] = sc;
            gpu[gBase + 4] = sc;
            gpu[gBase + 5] = d[base + this.CR];
            gpu[gBase + 6] = d[base + this.CG];
            gpu[gBase + 7] = d[base + this.CB];
            gpu[gBase + 8] = alpha;
            // gpu[gBase + 9] = glowStrength  (written once in addInstanceRaw, not updated per-frame)
        }

        this.mesh.instanceCount = this.count;
    }

    /**
     * Despawn all drones instantly (e.g. on game reset).
     */
    clear() {
        for (let i = 0; i < this.count; i++) {
            if (this.droneRefs[i]) this.droneRefs[i].active = false;
        }
        this.count = 0;
        this.mesh.instanceCount = 0;
    }

    dispose() {
        this.clear();
        this.renderer.removeInstancedGroup(this.mesh);
    }
}

export default InstancedDroneSystem;
