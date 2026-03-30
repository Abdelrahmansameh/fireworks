import { FIREWORK_CONFIG, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
const { BlendMode, Color, Vector2 } = Renderer2D;

class InstancedParticleSystem {
    constructor(renderer, profiler) {
        this.profiler = profiler;
        this.renderer = renderer;

        this.maxParticles = FIREWORK_CONFIG.maxParticles;
        this.pendingTrailsStride = 10;
        this.pendingTrailsData = new Float32Array(this.maxParticles * this.pendingTrailsStride);
        this.pendingTrailsCount = 0;
        this.meshes = {};
        this.activeCounts = {};
        this.instanceData = {};
        this.particleUpdateFns = {};
        this.particleState = {};

        this.positionIdx = 0;
        this.velocityIdx = 2;
        this.accelerationIdx = 4;
        this.colorIdx = 6;
        this.scaleIdx = 10;
        this.lifetimeIdx = 12;
        this.initialLifetimeIdx = 13;
        this.gravityIdx = 14;
        this.rotationIdx = 15;
        this.frictionIdx = 16;
        // gradient properties
        this.enableColorGradientIdx = 17;
        this.originalColorRIdx = 18;
        this.originalColorGIdx = 19;
        this.originalColorBIdx = 20;
        this.originalColorAIdx = 21;
        this.gradientFinalColorRIdx = 22;
        this.gradientFinalColorGIdx = 23;
        this.gradientFinalColorBIdx = 24;
        this.gradientFinalColorAIdx = 25;
        this.gradientStartTimeIdx = 26;
        this.gradientDurationIdx = 27;
        // Trail system indices
        this.trailTimerIdx = 28;           // accumulator for spawn timing
        this.particleTypeIdx = 29;         // PARTICLE_TYPES int (0=default,1=firework explosion,2=trail,3=rocket trail,4=ui,5=resgen)
        this.trailCurrentCountIdx = 30;    
        this.strideFloats = 31;

        const geometries = {
            sphere: Renderer2D.buildCircle(1),
            star: Renderer2D.buildStar(),
            ring: Renderer2D.buildRing(),
            crystalDroplet: Renderer2D.buildDroplet(),
            sliceBurst: Renderer2D.buildSliceBurst(),
            triangle: Renderer2D.buildTriangle(1, Math.sqrt(3) / 2),
        };

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const g = geometries[shape] || geometries.sphere;
            this.meshes[shape] = this.renderer.createInstancedGroup({
                vertices: g.vertices,
                indices: g.indices,
                maxInstances: this.maxParticles,
                blendMode: BlendMode.ADDITIVE,
                zIndex: 10,
            });
            this.activeCounts[shape] = 0;
            this.instanceData[shape] = new Float32Array(this.maxParticles * this.strideFloats).fill(0);
            this.particleUpdateFns[shape] = new Array(this.maxParticles).fill(null);
            this.particleState[shape] = {
                position: new Vector2(),
                velocity: new Vector2(),
                acceleration: new Vector2(),
                color: new Color(),
                scale: 0,
                lifetime: 0,
                initialLifetime: 0,
                gravity: 0,
                friction: 0,
                rotation: 0,
            };
        });

        this._frictionCache = new Map();

        this._randomPool = new Float32Array(4096);
        this._randomIdx = 4096; 
        this._refillRandomPool();

        this._trailPosVec = new Vector2(0, 0);
        this._trailVelVec = new Vector2(0, 0);
        this._trailAccVec = new Vector2(0, 0); 
        this._trailColor  = new Color(0, 0, 0, 0);
    }
    _refillRandomPool() {
        for (let i = 0; i < this._randomPool.length; i++) {
            this._randomPool[i] = Math.random();
        }
        this._randomIdx = 0;
    }

    _fastRandom() {
        if (this._randomIdx >= this._randomPool.length) this._randomIdx = 0;
        return this._randomPool[this._randomIdx++];
    }

    addParticle(position,
        velocity,
        color,
        scale,
        lifetime,
        gravity,
        shape = 'circle',
        acceleration = new Vector2(),
        friction = FIREWORK_CONFIG.baseFriction,
        updateFn = null,
        enableColorGradient = false,
        gradientFinalColor = null,
        gradientStartTime = 0.0,
        gradientDuration = 1.0,
        particleType = PARTICLE_TYPES.DEFAULT) {
        if (!this.meshes[shape]) shape = 'circle';
        const idx = this.activeCounts[shape];
        if (idx >= this.maxParticles) return -1;

        const base = idx * this.strideFloats;
        const d = this.instanceData[shape];

        d[base + this.positionIdx] = position.x;
        d[base + this.positionIdx + 1] = position.y;
        d[base + this.velocityIdx] = velocity.x;
        d[base + this.velocityIdx + 1] = velocity.y;
        d[base + this.accelerationIdx] = acceleration.x;
        d[base + this.accelerationIdx + 1] = acceleration.y;
        d[base + this.colorIdx] = color.r;
        d[base + this.colorIdx + 1] = color.g;
        d[base + this.colorIdx + 2] = color.b;
        d[base + this.colorIdx + 3] = color.a;
        d[base + this.scaleIdx] = scale;
        d[base + this.lifetimeIdx] = lifetime;
        d[base + this.initialLifetimeIdx] = lifetime;
        d[base + this.gravityIdx] = gravity;
        d[base + this.frictionIdx] = friction;

        const dir = velocity.clone().normalize().scale(-1);
        d[base + this.rotationIdx] = dir.getAngle();
        this.meshes[shape].addInstanceRaw(
            position.x,
            position.y,
            d[base + this.rotationIdx],
            scale,
            scale,
            color.r,
            color.g,
            color.b,
            color.a
        );

        if (enableColorGradient && gradientFinalColor) {
            d[base + this.enableColorGradientIdx] = 1.0;
            d[base + this.originalColorRIdx] = color.r;
            d[base + this.originalColorGIdx] = color.g;
            d[base + this.originalColorBIdx] = color.b;
            d[base + this.originalColorAIdx] = color.a;
            d[base + this.gradientFinalColorRIdx] = gradientFinalColor.r;
            d[base + this.gradientFinalColorGIdx] = gradientFinalColor.g;
            d[base + this.gradientFinalColorBIdx] = gradientFinalColor.b;
            d[base + this.gradientFinalColorAIdx] = gradientFinalColor.a;
            d[base + this.gradientStartTimeIdx] = gradientStartTime;
            d[base + this.gradientDurationIdx] = gradientDuration;
        }
        else {
            d[base + this.enableColorGradientIdx] = 0.0;
        }

        // Initialize trail data
        d[base + this.trailTimerIdx] = 0.0;
        d[base + this.particleTypeIdx] = particleType;
        d[base + this.trailCurrentCountIdx] = 0.0;

        this.particleUpdateFns[shape][idx] = updateFn;
        this.activeCounts[shape]++;
        return idx;
    }

    update(delta) {
        if (!delta) return;
        this.profiler?.startFunction?.('particleSystemUpdate');

        
        this._frictionCache.clear();

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            if (!this.instanceData[shape]) return;

            const d = this.instanceData[shape];
            const grp = this.meshes[shape];
            const gpu = grp.instanceData;
            const sStr = this.strideFloats;
            const gStr = grp.instanceStrideFloats;
            const updateFns = this.particleUpdateFns[shape];
            const state = this.particleState[shape];

            let count = this.activeCounts[shape];
            for (let i = 0; i < count; i++) {
                const sBase = i * sStr, gBase = i * gStr;

                const updateFn = updateFns[i];
                if (updateFn) {
                    state.position.set(d[sBase + this.positionIdx], d[sBase + this.positionIdx + 1]);
                    state.velocity.set(d[sBase + this.velocityIdx], d[sBase + this.velocityIdx + 1]);
                    state.acceleration.set(d[sBase + this.accelerationIdx], d[sBase + this.accelerationIdx + 1]);
                    state.color.r = d[sBase + this.colorIdx];
                    state.color.g = d[sBase + this.colorIdx + 1];
                    state.color.b = d[sBase + this.colorIdx + 2];
                    state.color.a = d[sBase + this.colorIdx + 3];
                    state.rotation = d[sBase + this.rotationIdx];
                    state.lifetime = d[sBase + this.lifetimeIdx];
                    updateFn(state, delta);
                    d[sBase + this.positionIdx] = state.position.x;
                    d[sBase + this.positionIdx + 1] = state.position.y;
                    d[sBase + this.velocityIdx] = state.velocity.x;
                    d[sBase + this.velocityIdx + 1] = state.velocity.y;
                    d[sBase + this.accelerationIdx] = state.acceleration.x;
                    d[sBase + this.accelerationIdx + 1] = state.acceleration.y;
                    d[sBase + this.rotationIdx] = state.rotation;
                    d[sBase + this.lifetimeIdx] = state.lifetime;
                    d[sBase + this.colorIdx] = state.color.r;
                    d[sBase + this.colorIdx + 1] = state.color.g;
                    d[sBase + this.colorIdx + 2] = state.color.b;
                    d[sBase + this.colorIdx + 3] = state.color.a;
                }

                d[sBase + this.lifetimeIdx] -= delta;
                if (d[sBase + this.lifetimeIdx] <= 0) {
                    const lastIdx = count - 1;

                    if (i !== lastIdx) {
                        const sLast = lastIdx * sStr, gLast = lastIdx * gStr;
                        d.set(d.subarray(sLast, sLast + sStr), sBase);
                        gpu.set(gpu.subarray(gLast, gLast + gStr), gBase);
                        updateFns[i] = updateFns[lastIdx];
                    }

                    updateFns[lastIdx] = null;

                    count--; i--;
                    continue;
                }

                const f = d[sBase + this.frictionIdx];
                let _fc = this._frictionCache.get(f);
                if (!_fc) {
                    _fc = {
                        hf: Math.exp(-f * delta),
                        vf: Math.exp(-f * FIREWORK_CONFIG.verticalFrictionMultiplier * delta)
                    };
                    this._frictionCache.set(f, _fc);
                }
                const hf = _fc.hf, vf = _fc.vf;
                d[sBase + this.velocityIdx] += d[sBase + this.accelerationIdx] * delta;
                d[sBase + this.velocityIdx + 1] += (d[sBase + this.accelerationIdx + 1]
                    - d[sBase + this.gravityIdx]) * delta;
                d[sBase + this.velocityIdx] *= hf;
                d[sBase + this.velocityIdx + 1] *= vf;
                d[sBase + this.positionIdx] += d[sBase + this.velocityIdx] * delta;
                d[sBase + this.positionIdx + 1] += d[sBase + this.velocityIdx + 1] * delta;
                const n = d[sBase + this.lifetimeIdx] / d[sBase + this.initialLifetimeIdx];
                d[sBase + this.colorIdx + 3] = (n * n) * (2 * this._fastRandom());
                if (d[sBase + this.enableColorGradientIdx] > 0.5) {
                    const normalizedLifetime = 1 - n;
                    const gradientStartTime = d[sBase + this.gradientStartTimeIdx];
                    const gradientDuration = d[sBase + this.gradientDurationIdx];

                    const safeDuration = Math.max(0.01, gradientDuration);
                    const gradientEndTime = gradientStartTime + safeDuration;

                    if (normalizedLifetime >= gradientStartTime && normalizedLifetime <= gradientEndTime) {
                        const gradientProgress = (normalizedLifetime - gradientStartTime) / safeDuration;

                        const originalR = d[sBase + this.originalColorRIdx];
                        const originalG = d[sBase + this.originalColorGIdx];
                        const originalB = d[sBase + this.originalColorBIdx];

                        const finalR = d[sBase + this.gradientFinalColorRIdx];
                        const finalG = d[sBase + this.gradientFinalColorGIdx];
                        const finalB = d[sBase + this.gradientFinalColorBIdx];

                        d[sBase + this.colorIdx] = originalR + (finalR - originalR) * gradientProgress;
                        d[sBase + this.colorIdx + 1] = originalG + (finalG - originalG) * gradientProgress;
                        d[sBase + this.colorIdx + 2] = originalB + (finalB - originalB) * gradientProgress;
                    }
                }

                // Trail spawning logic — only firework explosion particles spawn trails
                const particleType = d[sBase + this.particleTypeIdx];

                if (FIREWORK_CONFIG.trails.enabled && particleType === PARTICLE_TYPES.FIREWORK_EXPLOSION) {
                    d[sBase + this.trailTimerIdx] += delta;
                    const currentCount = d[sBase + this.trailCurrentCountIdx];

                    if (d[sBase + this.trailTimerIdx] >= FIREWORK_CONFIG.trails.spawnRate
                        && currentCount < FIREWORK_CONFIG.trails.maxCount) {
                        d[sBase + this.trailTimerIdx] = 0.0;
                        d[sBase + this.trailCurrentCountIdx]++;

                        // Queue trail particle for spawning after the update loop.
                        const velocitySpread = FIREWORK_CONFIG.trails.velocitySpread;
                        if (this.pendingTrailsCount < this.maxParticles) {
                            const tBase = this.pendingTrailsCount * this.pendingTrailsStride;
                            this.pendingTrailsData[tBase + 0] = d[sBase + this.positionIdx];
                            this.pendingTrailsData[tBase + 1] = d[sBase + this.positionIdx + 1];
                            this.pendingTrailsData[tBase + 2] = (this._fastRandom() - 0.5) * 2 * velocitySpread;
                            this.pendingTrailsData[tBase + 3] = (this._fastRandom() - 0.5) * 2 * velocitySpread;
                            this.pendingTrailsData[tBase + 4] = d[sBase + this.colorIdx];
                            this.pendingTrailsData[tBase + 5] = d[sBase + this.colorIdx + 1];
                            this.pendingTrailsData[tBase + 6] = d[sBase + this.colorIdx + 2];
                            this.pendingTrailsData[tBase + 7] = d[sBase + this.colorIdx + 3] * FIREWORK_CONFIG.trails.alphaMultiplier;
                            this.pendingTrailsData[tBase + 8] = FIREWORK_CONFIG.trails.size;
                            this.pendingTrailsData[tBase + 9] = FIREWORK_CONFIG.trails.lifetime * n;
                            this.pendingTrailsCount++;
                        }
                    }
                }

                gpu[gBase + 0] = d[sBase + this.positionIdx];
                gpu[gBase + 1] = d[sBase + this.positionIdx + 1];
                gpu[gBase + 2] = d[sBase + this.rotationIdx];
                gpu[gBase + 3] = d[sBase + this.scaleIdx];
                gpu[gBase + 4] = d[sBase + this.scaleIdx];
                gpu[gBase + 5] = d[sBase + this.colorIdx];
                gpu[gBase + 6] = d[sBase + this.colorIdx + 1];
                gpu[gBase + 7] = d[sBase + this.colorIdx + 2];
                gpu[gBase + 8] = d[sBase + this.colorIdx + 3];
            }

            this.activeCounts[shape] = count;
            grp.instanceCount = count;
        });

        // Spawn all queued trail particles after the main update loop.
        for (let i = 0; i < this.pendingTrailsCount; i++) {
            const tBase = i * this.pendingTrailsStride;
            this._trailPosVec.x = this.pendingTrailsData[tBase + 0];
            this._trailPosVec.y = this.pendingTrailsData[tBase + 1];
            this._trailVelVec.x = this.pendingTrailsData[tBase + 2];
            this._trailVelVec.y = this.pendingTrailsData[tBase + 3];
            this._trailColor.r  = this.pendingTrailsData[tBase + 4];
            this._trailColor.g  = this.pendingTrailsData[tBase + 5];
            this._trailColor.b  = this.pendingTrailsData[tBase + 6];
            this._trailColor.a  = this.pendingTrailsData[tBase + 7];
            this.addParticle(
                this._trailPosVec,
                this._trailVelVec,
                this._trailColor,
                this.pendingTrailsData[tBase + 8],
                this.pendingTrailsData[tBase + 9],
                FIREWORK_CONFIG.trails.gravity,
                FIREWORK_CONFIG.trails.shape,
                this._trailAccVec, 
                FIREWORK_CONFIG.trails.friction,
                null, // no update function
                false, // no gradient
                null,
                0.0,
                1.0,
                PARTICLE_TYPES.TRAIL // mark as trail so it won't chain-spawn more trails
            );
        }
        this.pendingTrailsCount = 0;

        this.profiler?.endFunction?.('particleSystemUpdate');
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
            this.activeCounts[shape] = 0;
            if (this.meshes[shape]) this.meshes[shape].instanceCount = 0;
            if (this.particleUpdateFns[shape]) {
                this.particleUpdateFns[shape].fill(null);
            }
        });
    }

    dispose() {
        FIREWORK_CONFIG.supportedShapes.forEach(shape =>
            this.renderer.removeInstancedGroup(this.meshes[shape])
        );
    }
}

export default InstancedParticleSystem;
