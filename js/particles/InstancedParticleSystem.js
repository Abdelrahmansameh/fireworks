import { FIREWORK_CONFIG } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
const { BlendMode, Color, Vector2 } = Renderer2D;

class InstancedParticleSystem {
    constructor(renderer, profiler) {
        this.profiler = profiler;
        this.renderer = renderer;

        this.maxParticles = FIREWORK_CONFIG.maxParticles;
        this.maxTrailPoints = FIREWORK_CONFIG.trailMaxPoints;
        this.trailWidth = FIREWORK_CONFIG.trailWidth;
        this.trailDistBetweenPoints = FIREWORK_CONFIG.trailDistBetweenPoints;
        this.meshes = {};
        this.activeCounts = {};
        this.instanceData = {};
        this.trailPoints = {};
        this.particleUpdateFns = {};
        this.particleState = {};

        const quadVerts = new Float32Array([
            -0.5, 0,    // bottom-left
            0.5, 0,    // bottom-right
            0.5, 1,    // top-right
            -0.5, 1,    // top-left
        ]);
        const quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.trailGroup = this.renderer.createInstancedGroup({
            vertices: quadVerts,
            indices: quadIdx,
            maxInstances: this.maxParticles,
            blendMode: BlendMode.ADDITIVE,
            zIndex: 5,
            useGlow: false,
        });

        const geometries = {
            circle: Renderer2D.buildCircle(1),
            star: Renderer2D.buildStar(),
            triangle: Renderer2D.buildTriangle(),
            square: Renderer2D.buildRing(0.7,0.7), // hack for a square
            droplet: Renderer2D.buildDroplet(),
        };

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const g = geometries[shape] || geometries.circle;
            this.meshes[shape] = this.renderer.createInstancedGroup({
                vertices: g.vertices,
                indices: g.indices,
                maxInstances: this.maxParticles,
                blendMode: BlendMode.ADDITIVE,
                zIndex: 10,
            });
            this.activeCounts[shape] = 0;
            this.instanceData[shape] = new Float32Array(this.maxParticles * 22).fill(0);
            this.trailPoints[shape] = new Float32Array(this.maxParticles * this.maxTrailPoints * 2);
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
        
        // trail properties
        this.hasTrailIdx = 17;
        this.trailLengthIdx = 18;
        this.trailWidthIdx = 19;
        this.trailHeadIndexIdx = 20;
        this.trailPointsCountIdx = 21;

        this.strideFloats = 22;
    }

    addParticle(position, 
        velocity, 
        color, 
        scale, 
        lifetime, 
        gravity,
        shape = 'circle', 
        acceleration = new Vector2(),
        enableTrail = true,
        trailLength = 4, 
        trailWidth = 1.5, 
        friction = FIREWORK_CONFIG.baseFriction,
        updateFn = null) {
        if (!this.meshes[shape]) shape = 'circle';
        const idx = this.activeCounts[shape];
        if (idx >= this.maxParticles) return -1;

        trailLength = Math.min(trailLength, this.maxTrailPoints);

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

        if (enableTrail) {
            d[base + this.hasTrailIdx] = 1.0;
            d[base + this.trailLengthIdx] = trailLength;
            d[base + this.trailWidthIdx] = trailWidth;
            d[base + this.trailHeadIndexIdx] = 1;
            d[base + this.trailPointsCountIdx] = 1;

            const trailBuffer = this.trailPoints[shape];
            const trailStartIndex = idx * this.maxTrailPoints * 2;
            trailBuffer[trailStartIndex] = position.x;
            trailBuffer[trailStartIndex + 1] = position.y;
        } else {
            d[base + this.hasTrailIdx] = 0.0;
        }

        this.particleUpdateFns[shape][idx] = updateFn;
        this.activeCounts[shape]++;
        return idx;
    }

    update(delta) {
        if (!delta) return;
        this.profiler?.startFunction?.('particleSystemUpdate');

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            if (!this.instanceData[shape]) return;

            const d = this.instanceData[shape];
            const trailBuffer = this.trailPoints[shape];
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
                    updateFn(state, delta);
                    d[sBase + this.positionIdx] = state.position.x;
                    d[sBase + this.positionIdx + 1] = state.position.y;
                    d[sBase + this.velocityIdx] = state.velocity.x;
                    d[sBase + this.velocityIdx + 1] = state.velocity.y;
                    d[sBase + this.accelerationIdx] = state.acceleration.x;
                    d[sBase + this.accelerationIdx + 1] = state.acceleration.y;
                }

                d[sBase + this.lifetimeIdx] -= delta;
                if (d[sBase + this.lifetimeIdx] <= 0) {
                    const lastIdx = count - 1;
                    const trailSegmentSize = this.maxTrailPoints * 2;

                    if (i !== lastIdx) {
                        const sLast = lastIdx * sStr, gLast = lastIdx * gStr;
                        d.set(d.subarray(sLast, sLast + sStr), sBase);
                        gpu.set(gpu.subarray(gLast, gLast + gStr), gBase);

                        const lastTrailOffset = lastIdx * trailSegmentSize;
                        const deadTrailOffset = i * trailSegmentSize;
                        trailBuffer.copyWithin(deadTrailOffset, lastTrailOffset, lastTrailOffset + trailSegmentSize);
                        updateFns[i] = updateFns[lastIdx];
                    }
                    
                    const lastTrailOffset = lastIdx * trailSegmentSize;
                    trailBuffer.fill(0, lastTrailOffset, lastTrailOffset + trailSegmentSize);
                    updateFns[lastIdx] = null;

                    count--; i--;
                    continue;
                }

                const f = d[sBase + this.frictionIdx];
                const hf = 1 - f * delta;
                const vf = 1 - f * FIREWORK_CONFIG.verticalFrictionMultiplier * delta;
                d[sBase + this.velocityIdx] += d[sBase + this.accelerationIdx] * delta;
                d[sBase + this.velocityIdx + 1] += (d[sBase + this.accelerationIdx + 1]
                    - d[sBase + this.gravityIdx]) * delta;
                d[sBase + this.velocityIdx] *= hf;
                d[sBase + this.velocityIdx + 1] *= vf;
                d[sBase + this.positionIdx] += d[sBase + this.velocityIdx] * delta;
                d[sBase + this.positionIdx + 1] += d[sBase + this.velocityIdx + 1] * delta;

                const n = d[sBase + this.lifetimeIdx] / d[sBase + this.initialLifetimeIdx];
                d[sBase + this.colorIdx + 3] = (n * n) * (2 * Math.random());

                gpu[gBase + 0] = d[sBase + this.positionIdx];
                gpu[gBase + 1] = d[sBase + this.positionIdx + 1];
                gpu[gBase + 2] = d[sBase + this.rotationIdx];
                gpu[gBase + 3] = d[sBase + this.scaleIdx];
                gpu[gBase + 4] = d[sBase + this.scaleIdx];
                gpu[gBase + 5] = d[sBase + this.colorIdx];
                gpu[gBase + 6] = d[sBase + this.colorIdx + 1];
                gpu[gBase + 7] = d[sBase + this.colorIdx + 2];
                gpu[gBase + 8] = d[sBase + this.colorIdx + 3];

                if (d[sBase + this.hasTrailIdx] > 0.5) {
                    const trailLength = d[sBase + this.trailLengthIdx];
                    const trailStartIndex = i * this.maxTrailPoints * 2;
                    let headIdx = d[sBase + this.trailHeadIndexIdx];
                    
                    const lastPointLocalIdx = (headIdx - 1 + trailLength) % trailLength;
                    const lastPointAbsIdx = trailStartIndex + lastPointLocalIdx * 2;

                    const dx = d[sBase + this.positionIdx] - trailBuffer[lastPointAbsIdx];
                    const dy = d[sBase + this.positionIdx + 1] - trailBuffer[lastPointAbsIdx + 1];
                    const dist = Math.hypot(dx, dy);

                    if(dist > this.trailDistBetweenPoints){
                        const newPointAbsIdx = trailStartIndex + headIdx * 2;
                        trailBuffer[newPointAbsIdx] = d[sBase + this.positionIdx];
                        trailBuffer[newPointAbsIdx + 1] = d[sBase + this.positionIdx + 1];
                        
                        d[sBase + this.trailHeadIndexIdx] = (headIdx + 1) % trailLength;
                        d[sBase + this.trailPointsCountIdx] = Math.min(trailLength, d[sBase + this.trailPointsCountIdx] + 1);
                    }
                }
            }

            this.activeCounts[shape] = count;
            grp.instanceCount = count;
        });

        this.profiler?.startFunction?.('updateTrails');
        this.trailGroup.clear();
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            if (!this.instanceData[shape]) return;
            const d = this.instanceData[shape];
            const trailBuffer = this.trailPoints[shape];
            const count = this.activeCounts[shape];
            const sStr = this.strideFloats;

            for (let i = 0; i < count; i++) {
                const sBase = i * sStr;
                if (d[sBase + this.hasTrailIdx] < 0.5) continue;

                const lifetime = d[sBase + this.lifetimeIdx];
                const initialLifetime = d[sBase + this.initialLifetimeIdx];
                const trailWidth = d[sBase + this.trailWidthIdx];
                const trailLength = d[sBase + this.trailLengthIdx];
                const pointsCount = d[sBase + this.trailPointsCountIdx];
                const headIdx = d[sBase + this.trailHeadIndexIdx];
                const trailStartIndex = i * this.maxTrailPoints * 2;
                
                const colorR = d[sBase + this.colorIdx];
                const colorG = d[sBase + this.colorIdx + 1];
                const colorB = d[sBase + this.colorIdx + 2];

                const lifeNorm = lifetime / initialLifetime;
                const fadeAlpha = lifeNorm * lifeNorm * lifeNorm;

                for (let j = 0; j < pointsCount - 1; j++) {
                    const p1_local_idx = (headIdx - pointsCount + j + trailLength) % trailLength;
                    const p2_local_idx = (headIdx - pointsCount + j + 1 + trailLength) % trailLength;

                    const p1_abs_idx = trailStartIndex + p1_local_idx * 2;
                    const p2_abs_idx = trailStartIndex + p2_local_idx * 2;

                    const ax = trailBuffer[p1_abs_idx];
                    const ay = trailBuffer[p1_abs_idx + 1];
                    const bx = trailBuffer[p2_abs_idx];
                    const by = trailBuffer[p2_abs_idx + 1];

                    const dx = bx - ax, dy = by - ay;
                    const len = Math.hypot(dx, dy);
                    if (len < 0.001) continue;
                    
                    const ang = Math.atan2(dy, dx) - Math.PI * 0.5;
                    const mx = (ax + bx) * 0.5;
                    const my = (ay + by) * 0.5;

                    this.trailGroup.addInstanceRaw(
                        mx, my,
                        ang,
                        trailWidth, len,
                        colorR, colorG, colorB, fadeAlpha * (2 * Math.random())
                    );
                }
            }
        });
        this.profiler?.endFunction?.('updateTrails');

        this.profiler?.endFunction?.('particleSystemUpdate');
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
            this.activeCounts[shape] = 0;
            if (this.meshes[shape]) this.meshes[shape].instanceCount = 0;
            if (this.trailPoints[shape]) {
                this.trailPoints[shape].fill(0);
            }
            if (this.particleUpdateFns[shape]) {
                this.particleUpdateFns[shape].fill(null);
            }
        });
        this.trailGroup.clear();
    }

    dispose() {
        FIREWORK_CONFIG.supportedShapes.forEach(shape =>
            this.renderer.removeInstancedGroup(this.meshes[shape])
        );
        this.renderer.removeInstancedGroup(this.trailGroup);
    }
}

export default InstancedParticleSystem;
