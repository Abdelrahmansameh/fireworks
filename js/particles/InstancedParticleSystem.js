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
            sphere: Renderer2D.buildCircle(1),
            star: Renderer2D.buildStar(),
            ring: Renderer2D.buildRing(),
            crystalDroplet: Renderer2D.buildDroplet(),
            sliceBurst: Renderer2D.buildSliceBurst(),
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
            this.instanceData[shape] = new Float32Array(this.maxParticles * 35).fill(0);
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
        this.trailGlowStrengthIdx = 22;
        this.trailBlurStrengthIdx = 23;        
        // gradient properties
        this.enableColorGradientIdx = 24;
        this.originalColorRIdx = 25;
        this.originalColorGIdx = 26;
        this.originalColorBIdx = 27;
        this.originalColorAIdx = 28;
        this.gradientFinalColorRIdx = 29;
        this.gradientFinalColorGIdx = 30;
        this.gradientFinalColorBIdx = 31;
        this.gradientFinalColorAIdx = 32;
        this.gradientStartTimeIdx = 33;
        this.gradientDurationIdx = 34;

        this.strideFloats = 35;
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
        glowStrength = 0,
        blurStrength = 0,
        updateFn = null,
        enableColorGradient = false,
        gradientFinalColor = null,
        gradientStartTime = 0.0,
        gradientDuration = 1.0) 
        {
        if (!this.meshes[shape]) shape = 'circle';
        const idx = this.activeCounts[shape];
        if (idx >= this.maxParticles) return -1;

        if (enableTrail) {
            trailLength = Math.max(1, Math.round(trailLength));
        }

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
            color.a,
            glowStrength,
            blurStrength
        );

        if (enableTrail) {
            d[base + this.hasTrailIdx] = 1.0;
            d[base + this.trailLengthIdx] = trailLength;
            d[base + this.trailWidthIdx] = trailWidth;
            d[base + this.trailHeadIndexIdx] = 1;
            d[base + this.trailPointsCountIdx] = 1;
            d[base + this.trailGlowStrengthIdx] = glowStrength;
            d[base + this.trailBlurStrengthIdx] = blurStrength;

            const trailBuffer = this.trailPoints[shape];
            const trailStartIndex = idx * this.maxTrailPoints * 2;
            trailBuffer[trailStartIndex] = position.x;
            trailBuffer[trailStartIndex + 1] = position.y;
        } 
        else {
            d[base + this.hasTrailIdx] = 0.0;
        }        // Store gradient data
        if (enableColorGradient && gradientFinalColor) {
            d[base + this.enableColorGradientIdx] = 1.0;
            // Store original color
            d[base + this.originalColorRIdx] = color.r;
            d[base + this.originalColorGIdx] = color.g;
            d[base + this.originalColorBIdx] = color.b;
            d[base + this.originalColorAIdx] = color.a;
            // Store final gradient color
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
                d[sBase + this.positionIdx + 1] += d[sBase + this.velocityIdx + 1] * delta;                const n = d[sBase + this.lifetimeIdx] / d[sBase + this.initialLifetimeIdx];
                d[sBase + this.colorIdx + 3] = (n * n) * (2 * Math.random());               
                if (d[sBase + this.enableColorGradientIdx] > 0.5) {
                    const normalizedLifetime = 1 - n; // 0 = dead, 1 = just born
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

                    if (dist > this.trailDistBetweenPoints) {
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
                const headIdx = d[sBase + this.trailHeadIndexIdx];                const trailStartIndex = i * this.maxTrailPoints * 2;                // Get colors for trail rendering
                let baseColorR, baseColorG, baseColorB;
                let currentParticleColorR, currentParticleColorG, currentParticleColorB;
                let hasGradient = false;
                let trailGradientProgress = 0;
                
                if (d[sBase + this.enableColorGradientIdx] > 0.5) {
                    baseColorR = d[sBase + this.originalColorRIdx];
                    baseColorG = d[sBase + this.originalColorGIdx];
                    baseColorB = d[sBase + this.originalColorBIdx];
                    
                    currentParticleColorR = d[sBase + this.colorIdx];
                    currentParticleColorG = d[sBase + this.colorIdx + 1];
                    currentParticleColorB = d[sBase + this.colorIdx + 2];
                    
                    const normalizedLifetime = 1 - (lifetime / initialLifetime); // 0 = just born, 1 = dead
                    const gradientStartTime = d[sBase + this.gradientStartTimeIdx];
                    const gradientDuration = d[sBase + this.gradientDurationIdx];
                    const trailGradientDuration = gradientDuration * 2; // Trail takes twice as long
                    
                    if (normalizedLifetime >= gradientStartTime) {
                        trailGradientProgress = Math.min(1, (normalizedLifetime - gradientStartTime) / trailGradientDuration);
                        hasGradient = true;
                    }
                } 
                else {
                    baseColorR = d[sBase + this.colorIdx];
                    baseColorG = d[sBase + this.colorIdx + 1];
                    baseColorB = d[sBase + this.colorIdx + 2];
                }

                const lifeNorm = lifetime / initialLifetime;
                const fadeAlpha = lifeNorm * lifeNorm * lifeNorm;                for (let j = 0; j < pointsCount - 1; j++) {
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
                    const mx = (ax + bx) * 0.5;                    const my = (ay + by) * 0.5;
                    
                    let segmentColorR, segmentColorG, segmentColorB;
                    if (hasGradient && trailGradientProgress > 0) {

                        const segmentPositionFromTail = j / Math.max(1, pointsCount - 2);

                        if (segmentPositionFromTail >= (1 - trailGradientProgress)) {
                            segmentColorR = currentParticleColorR;
                            segmentColorG = currentParticleColorG;
                            segmentColorB = currentParticleColorB;
                        } 
                        else {
                            segmentColorR = baseColorR;
                            segmentColorG = baseColorG;
                            segmentColorB = baseColorB;
                        }
                    } 
                    else {
                        segmentColorR = baseColorR;
                        segmentColorG = baseColorG;
                        segmentColorB = baseColorB;
                    }

                    this.trailGroup.addInstanceRaw(
                        mx, my,
                        ang,
                        trailWidth, len,
                        segmentColorR, segmentColorG, segmentColorB, fadeAlpha * 2 * Math.random(), d[sBase + this.trailGlowStrengthIdx], d[sBase + this.trailBlurStrengthIdx]
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
