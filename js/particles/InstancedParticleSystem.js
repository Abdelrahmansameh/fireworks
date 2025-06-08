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

        // trails: Map< "shape-idx", { points: Vector2[], color: Color, lastUpdate:number } >
        this.activeTrails = new Map();

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
            sliceBurst: Renderer2D.buildTriangle(),
        };
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const g = geometries[shape];
            this.meshes[shape] = this.renderer.createInstancedGroup({
                vertices: g.vertices,
                indices: g.indices,
                maxInstances: this.maxParticles,
                blendMode: BlendMode.ADDITIVE,
                zIndex: 10,
            });
            this.activeCounts[shape] = 0;
            this.instanceData[shape] = new Float32Array(this.maxParticles * 17).fill(0);
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
        this.strideFloats = 17;
    }

    createTrailEntry(shape, idx, position, color) {
        const key = `${shape}-${idx}`;
        const particleBase = idx * this.strideFloats;
        const particleLifetime = this.instanceData[shape][particleBase + this.lifetimeIdx];
        
        this.activeTrails.set(key, {
            points: [position.clone(), position.clone()],
            color: color.clone(),
            lastUpdate: performance.now() - this.trailInterval,
            lifetime: particleLifetime,
            initialLifetime: particleLifetime
        });
    }

    addParticle(position, velocity, color, scale, lifetime, gravity,
        shape = 'sphere', acceleration = new Vector2(),
        enableTrail = true, friction = FIREWORK_CONFIG.baseFriction) {
        if (!FIREWORK_CONFIG.supportedShapes.includes(shape)) shape = 'sphere';
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

        this.meshes[shape].addInstance(
            position,
            d[base + this.rotationIdx],
            new Vector2(scale, scale),
            color
        );

        if (enableTrail) this.createTrailEntry(shape, idx, position, color);
        this.activeCounts[shape]++;
        return idx;
    }

    update(delta) {
        if (!delta) return;
        this.profiler?.startFunction?.('particleSystemUpdate');

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const d = this.instanceData[shape];
            const grp = this.meshes[shape];
            const gpu = grp.instanceData;
            const sStr = this.strideFloats;
            const gStr = grp.instanceStrideFloats;

            let count = this.activeCounts[shape];
            for (let i = 0; i < count; i++) {
                const sBase = i * sStr, gBase = i * gStr;

                d[sBase + this.lifetimeIdx] -= delta;
                if (d[sBase + this.lifetimeIdx] <= 0) {
                    const deadKey = `${shape}-${i}`;
                    this.activeTrails.delete(deadKey);

                    const lastIdx = count - 1;
                    const lastKey = `${shape}-${lastIdx}`;
                    const lastTrail = this.activeTrails.get(lastKey);

                    if (i !== lastIdx) {
                        const sLast = lastIdx * sStr, gLast = lastIdx * gStr;
                        d.set(d.subarray(sLast, sLast + sStr), sBase);
                        gpu.set(gpu.subarray(gLast, gLast + gStr), gBase);
                        if (lastTrail) {
                            this.activeTrails.set(deadKey, lastTrail);
                            this.activeTrails.delete(lastKey);
                        }
                    }
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
                d[sBase + this.colorIdx + 3] = n * n * n;

                gpu[gBase + 0] = d[sBase + this.positionIdx];
                gpu[gBase + 1] = d[sBase + this.positionIdx + 1];
                gpu[gBase + 2] = d[sBase + this.rotationIdx];
                gpu[gBase + 3] = d[sBase + this.scaleIdx];
                gpu[gBase + 4] = d[sBase + this.scaleIdx];
                gpu[gBase + 5] = d[sBase + this.colorIdx];
                gpu[gBase + 6] = d[sBase + this.colorIdx + 1];
                gpu[gBase + 7] = d[sBase + this.colorIdx + 2];
                gpu[gBase + 8] = d[sBase + this.colorIdx + 3];

                const key = `${shape}-${i}`;
                const trail = this.activeTrails.get(key);
                if (trail) {
                    trail.lifetime = d[sBase + this.lifetimeIdx];
                    
                    const now = performance.now();
                    const lastPoint = trail.points[trail.points.length - 1];
                    if (lastPoint && lastPoint.distanceTo(new Vector2(
                        d[sBase + this.positionIdx],
                        d[sBase + this.positionIdx + 1]
                    )) > this.trailDistBetweenPoints) {
                        trail.points.push(new Vector2(
                            d[sBase + this.positionIdx],
                            d[sBase + this.positionIdx + 1]
                        ));
                        if (trail.points.length > this.maxTrailPoints) {
                            trail.points.shift();
                        }
                        trail.lastUpdate = now;
                    };
                }
            }

            this.activeCounts[shape] = count;
            grp.instanceCount = count;
        });

        this.profiler?.startFunction?.('updateTrails');
        this.trailGroup.clear();
        for (const { points, color, lifetime, initialLifetime } of this.activeTrails.values()) {
            const lifeNorm = lifetime / initialLifetime;
            const fadeAlpha = lifeNorm * lifeNorm * lifeNorm;
            
            for (let j = 1; j < points.length; j++) {
                const a = points[j - 1], b = points[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                const ang = Math.atan2(dy, dx) - Math.PI * 0.5;
                const mx = (a.x + b.x) * 0.5;
                const my = (a.y + b.y) * 0.5;

                this.trailGroup.addInstance(
                    new Vector2(mx, my),
                    ang,
                    new Vector2(this.trailWidth, len),
                    new Color(color.r, color.g, color.b, fadeAlpha *1.2)
                );
            }
        }
        this.profiler?.endFunction?.('updateTrails');

        this.profiler?.endFunction?.('particleSystemUpdate');
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
            this.activeCounts[shape] = 0;
            this.meshes[shape].instanceCount = 0;
        });
        this.trailGroup.clear();
        this.activeTrails.clear();
    }

    dispose() {
        FIREWORK_CONFIG.supportedShapes.forEach(shape =>
            this.renderer.removeInstancedGroup(this.meshes[shape])
        );
        this.renderer.removeInstancedGroup(this.trailGroup);
        this.activeTrails.clear();
    }
}

export default InstancedParticleSystem;
