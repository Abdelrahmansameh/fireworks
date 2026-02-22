import { FIREWORK_CONFIG } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
const { BlendMode, Color, Vector2 } = Renderer2D;

class InstancedParticleSystem {
    constructor(renderer, profiler) {
        this.profiler = profiler;
        this.renderer = renderer;
        this.glows = [];
        this.pendingTrails = []; // Queue for trail particles to spawn after update loop

        this.renderer.loadTexture('assets/glow.png', 'glow');

        this.maxParticles = FIREWORK_CONFIG.maxParticles;
        this.meshes = {};
        this.activeCounts = {};
        this.instanceData = {};
        this.particleUpdateFns = {};
        this.particleState = {};

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
            this.instanceData[shape] = new Float32Array(this.maxParticles * 24).fill(0);
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
        this.isTrailParticleIdx = 29;      // 1.0 if this IS a trail
        this.trailCurrentCountIdx = 30;    // current trail count

        this.strideFloats = 31;
    }
    addGlow(position, color, initialSize, finalSize, lifetime, initialAlpha, finalAlpha) {
        const glowTexture = this.renderer.getTexture('glow');
        if (!glowTexture) return;

        const glowShape = this.renderer.createNormalShape({
            ...Renderer2D.buildTexturedSquare(initialSize, initialSize),
            texture: glowTexture,
            position: new Vector2(position.x, position.y),
            color: new Color(color.r, color.g, color.b, 0.5),
            blendMode: BlendMode.ADDITIVE,
            zIndex: -500
        });

        this.glows.push({
            shape: glowShape,
            lifetime: lifetime,
            initialLifetime: lifetime,
            initialSize: initialSize,
            finalSize: finalSize,
            initialAlpha: initialAlpha,
            finalAlpha: finalAlpha,
        });
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
        glowStrength = 0,
        blurStrength = 0,
        updateFn = null,
        enableColorGradient = false,
        gradientFinalColor = null,
        gradientStartTime = 0.0,
        gradientDuration = 1.0,
        isTrailParticle = false) {
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
            color.a,
            glowStrength,
            blurStrength
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
        d[base + this.isTrailParticleIdx] = isTrailParticle ? 1.0 : 0.0;
        d[base + this.trailCurrentCountIdx] = 0.0;

        this.particleUpdateFns[shape][idx] = updateFn;
        this.activeCounts[shape]++;
        return idx;
    }

    update(delta) {
        if (!delta) return;
        this.profiler?.startFunction?.('particleSystemUpdate');

        for (let i = this.glows.length - 1; i >= 0; i--) {
            const glow = this.glows[i];
            glow.lifetime -= delta;

            if (glow.lifetime <= 0) {
                this.renderer.removeNormalShape(glow.shape);
                this.glows.splice(i, 1);
            } else {
                const lifePercent = glow.lifetime / glow.initialLifetime;
                glow.shape.color.a = glow.initialAlpha + ((glow.finalAlpha - glow.initialAlpha) * (1 - lifePercent));
                const currentSize = glow.initialSize + ((glow.finalSize - glow.initialSize) * (1 - lifePercent));
                glow.shape.scale.set(currentSize, currentSize);
            }
        }

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
                    state.rotation = d[sBase + this.rotationIdx];
                    updateFn(state, delta);
                    d[sBase + this.positionIdx] = state.position.x;
                    d[sBase + this.positionIdx + 1] = state.position.y;
                    d[sBase + this.velocityIdx] = state.velocity.x;
                    d[sBase + this.velocityIdx + 1] = state.velocity.y;
                    d[sBase + this.accelerationIdx] = state.acceleration.x;
                    d[sBase + this.accelerationIdx + 1] = state.acceleration.y;
                    d[sBase + this.rotationIdx] = state.rotation;
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
                const hf = Math.exp(-f * delta);
                const vf = Math.exp(-f * FIREWORK_CONFIG.verticalFrictionMultiplier * delta);
                d[sBase + this.velocityIdx] += d[sBase + this.accelerationIdx] * delta;
                d[sBase + this.velocityIdx + 1] += (d[sBase + this.accelerationIdx + 1]
                    - d[sBase + this.gravityIdx]) * delta;
                d[sBase + this.velocityIdx] *= hf;
                d[sBase + this.velocityIdx + 1] *= vf;
                d[sBase + this.positionIdx] += d[sBase + this.velocityIdx] * delta;
                d[sBase + this.positionIdx + 1] += d[sBase + this.velocityIdx + 1] * delta;
                const n = d[sBase + this.lifetimeIdx] / d[sBase + this.initialLifetimeIdx];
                d[sBase + this.colorIdx + 3] = (n * n) * (2 * Math.random());
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

                // Trail spawning logic - queue trails instead of spawning immediately
                const isTrail = d[sBase + this.isTrailParticleIdx] > 0.5;

                if (FIREWORK_CONFIG.trails.enabled && !isTrail) {
                    d[sBase + this.trailTimerIdx] += delta;
                    const currentCount = d[sBase + this.trailCurrentCountIdx];

                    if (d[sBase + this.trailTimerIdx] >= FIREWORK_CONFIG.trails.spawnRate
                        && currentCount < FIREWORK_CONFIG.trails.maxCount) {
                        d[sBase + this.trailTimerIdx] = 0.0;
                        d[sBase + this.trailCurrentCountIdx]++;

                        // Queue trail particle for spawning after the update loop
                        const trailSize = FIREWORK_CONFIG.trails.size;
                        const trailColor = new Color(
                            d[sBase + this.colorIdx],
                            d[sBase + this.colorIdx + 1],
                            d[sBase + this.colorIdx + 2],
                            d[sBase + this.colorIdx + 3] * FIREWORK_CONFIG.trails.alphaMultiplier
                        );

                        // Get the particle's velocity to determine the trail direction
                        const velX = d[sBase + this.velocityIdx];
                        const velY = d[sBase + this.velocityIdx + 1];
                        const speed = Math.sqrt(velX * velX + velY * velY);

                        // Calculate spawn position along a line opposite to velocity
                        // Spawn along a line representing the particle's "past"

                        let trailSpawnX = d[sBase + this.positionIdx];
                        let trailSpawnY = d[sBase + this.positionIdx + 1];
                        /*
                        if (speed > 0.01) {
                                                const trailLineLength = Math.max(20, speed * 0.05); // Scale with velocity
                        const randomOffset = Math.random(); // 0 to 1
                        
                            // Normalize velocity and reverse it
                            const dirX = -velX / speed;
                            const dirY = -velY / speed;
                            
                            // Spawn along the line from current position backwards
                            trailSpawnX += dirX * trailLineLength * randomOffset;
                            trailSpawnY += dirY * trailLineLength * randomOffset;
                        }*/

                        // Generate random initial velocity
                        const velocitySpread = FIREWORK_CONFIG.trails.velocitySpread;
                        const randomVelX = (Math.random() - 0.5) * 2 * velocitySpread;
                        const randomVelY = (Math.random() - 0.5) * 2 * velocitySpread;

                        this.pendingTrails.push({
                            position: new Vector2(trailSpawnX, trailSpawnY),
                            velocity: new Vector2(randomVelX, randomVelY),
                            color: trailColor,
                            size: trailSize,
                            lifetime: FIREWORK_CONFIG.trails.lifetime * n
                        });
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

        // Spawn all queued trail particles after the main update loop
        while (this.pendingTrails.length > 0) {
            const trail = this.pendingTrails.pop();
            this.addParticle(
                trail.position,
                trail.velocity,
                trail.color,
                trail.size,
                trail.lifetime,
                FIREWORK_CONFIG.trails.gravity,
                FIREWORK_CONFIG.trails.shape,
                new Vector2(0, 0),
                FIREWORK_CONFIG.trails.friction,
                0, // no glow
                0, // no blur
                null, // no update function
                false, // no gradient
                null,
                0.0,
                1.0,
                true // this IS a trail particle
            );
        }

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
        this.glows.forEach(glow => {
            this.renderer.removeNormalShape(glow.shape);
        });
        this.glows = [];
        FIREWORK_CONFIG.supportedShapes.forEach(shape =>
            this.renderer.removeInstancedGroup(this.meshes[shape])
        );
    }
}

export default InstancedParticleSystem;
