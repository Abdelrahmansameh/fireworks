import { FIREWORK_CONFIG } from '../config/config.js';
import { createDebugCross } from '../utils/debug.js';
import * as Renderer2D from '../rendering/Renderer.js';

class InstancedParticleSystem {
    constructor(scene, renderer, profiler) {
        this.profiler = profiler;
        this.scene = scene;
        this.renderer = renderer;
        this.maxParticles = FIREWORK_CONFIG.maxParticles || 1000000; // Default to 1 million if not set

        this.meshes = {};
        this.activeCounts = {};
        this.instanceData = {};

                /*
        this.activeTrails = new Map();
        this.maxTrails = maxParticles * 2;
        this.maxTrailPoints = 8;
        this.trailUpdateInterval = 50;
*/

        const geometries = {
            sphere: Renderer2D.buildCircle(1),
            star: Renderer2D.buildStar(),
            ring: Renderer2D.buildRing(),
            crystalDroplet: Renderer2D.buildDroplet(),
            sliceBurst: Renderer2D.buildTriangle(),
        };

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const geometry = geometries[shape];

            this.meshes[shape] = this.renderer.createInstancedGroup({
                vertices: geometry.vertices,
                indices: geometry.indices,
                maxInstances: this.maxParticles,
                zIndex: 10,
                blendMode: Renderer2D.BlendMode.ADDITIVE
            });

            this.activeCounts[shape] = 0;
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
        this.instanceFloats = this.frictionIdx + 1;

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.instanceData[shape] = new Float32Array(this.maxParticles * this.instanceFloats).fill(0.0);
        });
    }

    createStarGeometry() {
        const shape = new THREE.Shape();
        const outerRadius = 2;
        const innerRadius = 1;
        const spikes = 5;
        const step = Math.PI / spikes;

        shape.moveTo(outerRadius, 0);
        for (let i = 0; i < spikes * 2; i++) {
            const radius = (i % 2 === 0) ? outerRadius : innerRadius;
            const angle = i * step;
            shape.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
        }
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }

    createCrystalDropletGeometry() {
        const shape = new THREE.Shape();
        const width = 2;
        const height = 5;

        shape.moveTo(0, 0);
        shape.bezierCurveTo(width / 2, height / 2, width / 2, height, 0, height);
        shape.bezierCurveTo(-width / 2, height, -width / 2, height / 2, 0, 0);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }

    createSliceBurstGeometry(base = 1, height = 5) {
        const shape = new THREE.Shape();

        shape.moveTo(-base / 2, 0);
        shape.lineTo(base / 2, 0);
        shape.lineTo(0, -height);
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }
/*
    createTrailGeometry(points, explosionCenterPosition, maxCurveLength = 1) {
        const geometry = new THREE.BufferGeometry();
        this.fillTrailGeometryPositions(geometry, points, explosionCenterPosition, maxCurveLength);
        return geometry;
    }

    fillTrailGeometryPositions(geometry, points, explosionCenterPosition, maxCurveLength = 1) {
        if (points.length < 2) return null;

        const relativePoints = points.map(p => p.clone().sub(explosionCenterPosition));

        const curve = new THREE.CatmullRomCurve3(relativePoints, false, 'centripetal');

        const fullSegments = 50;
        const usedSegments = Math.ceil(maxCurveLength * fullSegments);

        const positions = new Float32Array((usedSegments + 1) * 3);

        for (let i = 0; i <= usedSegments; i++) {
            const t = i / fullSegments;
            const point = curve.getPoint(t);
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        return geometry;
    }

    updateTrailGeometry(trail, points, explosionCenterPosition, maxCurveLength) {
        this.profiler.startFunction('updateParticleTrailGeometry');
        const newGeometry = this.createTrailGeometry(points, explosionCenterPosition, maxCurveLength);
        if (newGeometry) {
            trail.geometry.dispose();
            trail.geometry = newGeometry;
        }
        this.profiler.endFunction('updateParticleTrailGeometry');
    }

    createTrailForParticle(shape, index, position, velocity, color) {
        if (this.activeTrails.size >= this.maxTrails) {
            return null;
        }

        const points = [
            position.clone(),
            position.clone(),
        ];

        const geometry = this.createTrailGeometry(points, points[0]);
        if (!geometry) return null;

        const material = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            color: color,
            linewidth: 1
        });

        const trail = new THREE.Line(geometry, material);
        trail.position.copy(position);

        const trailKey = `${shape}-${index}`;
        this.activeTrails.set(trailKey, {
            mesh: trail,
            points: points,
            lastUpdate: performance.now(),
            explosionCenterPosition: position.clone(),
            trailUpdateInterval: this.trailUpdateInterval,
            offset: 0,
        });

        this.scene.add(trail);
        return trail;
    }

    removeTrail(shape, index) {
        const trailKey = `${shape}-${index}`;
        const trailData = this.activeTrails.get(trailKey);
        if (trailData) {
            this.scene.remove(trailData.mesh);
            trailData.mesh.geometry.dispose();
            trailData.mesh.material.dispose();
            this.activeTrails.delete(trailKey);
        }
    }
*/

    addParticle(position, velocity, color, scale, lifetime, gravity, shape = 'sphere', acceleration = new THREE.Vector3(), enableTrail = true, friction = FIREWORK_CONFIG.baseFriction) {
        if (!FIREWORK_CONFIG.supportedShapes.includes(shape)) {
            shape = 'sphere';
        }

        const activeCount = this.activeCounts[shape];
        if (activeCount >= this.maxParticles) 
            return -1;

        const index = activeCount;
        const base = index * this.instanceFloats;


       const data = this.instanceData[shape];
        data[base + this.positionIdx]            = position.x;
        data[base + this.positionIdx + 1]        = position.y;
        data[base + this.velocityIdx]            = velocity.x;
        data[base + this.velocityIdx + 1]        = velocity.y;
        data[base + this.accelerationIdx]        = acceleration.x;
        data[base + this.accelerationIdx + 1]    = acceleration.y;
        data[base + this.colorIdx]               = color.r;
        data[base + this.colorIdx + 1]           = color.g;
        data[base + this.colorIdx + 2]           = color.b;
        data[base + this.colorIdx + 3]           = color.a;
        data[base + this.scaleIdx]               = scale;
        data[base + this.lifetimeIdx]            = lifetime;
        data[base + this.initialLifetimeIdx]     = lifetime;
        data[base + this.gravityIdx]             = gravity;
        data[base + this.frictionIdx]            = friction; 

        const rot = velocity.clone().normalize().scale(-1).getAngle();
        data[base + this.rotationIdx]            = rot;

        const normalizedVelocity = velocity.clone().normalize();
        const targetDir = normalizedVelocity.clone().scale(-1);
        this.instanceData[shape][base + this.rotationIdx] = targetDir.getAngle();

        this.meshes[shape].addInstance(position, rot, new Renderer2D.Vector2(scale, scale), color);

        /* if (enableTrail) {
             this.createTrailForParticle(shape, index, position, velocity, color);
         }*/

        this.activeCounts[shape]++;
        return index;
    }

     updateParticle(shape, index) {
        const base = index * this.instanceFloats;
        const group = this.meshes[shape];
        const gBase = index * group.instanceStrideFloats;
        const sim   = this.instanceData[shape];
        const gpu   = group.instanceData;

        gpu[gBase + 0] = sim[base + this.positionIdx];
        gpu[gBase + 1] = sim[base + this.positionIdx + 1];
        gpu[gBase + 2] = sim[base + this.rotationIdx];
        gpu[gBase + 3] = sim[base + this.scaleIdx];
        gpu[gBase + 4] = sim[base + this.scaleIdx];
        gpu[gBase + 5] = sim[base + this.colorIdx];
        gpu[gBase + 6] = sim[base + this.colorIdx + 1];
        gpu[gBase + 7] = sim[base + this.colorIdx + 2];
        gpu[gBase + 8] = sim[base + this.colorIdx + 3];
    }
    update(delta) {
        if (!delta) return;
        const now = performance.now();

        this.profiler?.startFunction?.('particleSystemUpdate');

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const group       = this.meshes[shape];
            const sim         = this.instanceData[shape];
            const gpu         = group.instanceData;         
            const simStride   = this.instanceFloats;        
            const gpuStride   = group.instanceStrideFloats; 

            let active = this.activeCounts[shape];

            for (let i = 0; i < active; i++) {
                const sBase = i * simStride;
                const gBase = i * gpuStride;

                sim[sBase + this.lifetimeIdx] -= delta;
                if (sim[sBase + this.lifetimeIdx] <= 0) {
                    const last = active - 1;
                    const sLastBase = last * simStride;
                    const gLastBase = last * gpuStride;

                    if (last !== i) {
                        sim.set(sim.subarray(sLastBase, sLastBase + simStride), sBase);
                        gpu.set(gpu.subarray(gLastBase, gLastBase + gpuStride), gBase);
                    }
                    active--;
                    i--;
                    continue;
                }

                const friction     = sim[sBase + this.frictionIdx]; 
                const horizontalFrictionFac  = 1 - friction * delta;          
                const verticalFrictionFact = 1 - friction * FIREWORK_CONFIG.verticalFrictionMultiplier * delta;
                sim[sBase + this.velocityIdx]     += sim[sBase + this.accelerationIdx] * delta;
                sim[sBase + this.velocityIdx + 1] += (sim[sBase + this.accelerationIdx + 1] - sim[sBase + this.gravityIdx]) * delta;

                sim[sBase + this.velocityIdx]     *= horizontalFrictionFac;
                sim[sBase + this.velocityIdx + 1] *= verticalFrictionFact;

                sim[sBase + this.positionIdx]     += sim[sBase + this.velocityIdx]     * delta;
                sim[sBase + this.positionIdx + 1] += sim[sBase + this.velocityIdx + 1] * delta;

                // ── alpha based on life³ ─────────────────────────────────────────
                const lifeNorm = sim[sBase + this.lifetimeIdx] / sim[sBase + this.initialLifetimeIdx];
                sim[sBase + this.colorIdx + 3] = lifeNorm * lifeNorm * lifeNorm; 

                gpu[gBase + 0] = sim[sBase + this.positionIdx];
                gpu[gBase + 1] = sim[sBase + this.positionIdx + 1];
                gpu[gBase + 2] = sim[sBase + this.rotationIdx];
                gpu[gBase + 3] = sim[sBase + this.scaleIdx];
                gpu[gBase + 4] = sim[sBase + this.scaleIdx];
                gpu[gBase + 5] = sim[sBase + this.colorIdx];
                gpu[gBase + 6] = sim[sBase + this.colorIdx + 1];
                gpu[gBase + 7] = sim[sBase + this.colorIdx + 2];
                gpu[gBase + 8] = sim[sBase + this.colorIdx + 3];

                // const trailKey = `${shape}-${i}`; …
            }

            this.activeCounts[shape] = active;
            group.instanceCount = active; 
        });

        this.profiler?.endFunction?.('particleSystemUpdate');
    }


    dispose() {
        /*
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.scene.remove(this.meshes[shape]);
            this.meshes[shape].geometry.dispose();
            this.meshes[shape].material.dispose();
            this.rotations[shape] = null;
        });
    
        for (const trail of this.activeTrails.values()) {
            this.scene.remove(trail.mesh);
            trail.mesh.geometry.dispose();
            trail.mesh.material.dispose();
        }
        this.activeTrails.clear();*/
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
            const activeCount = this.activeCounts[shape];
            for (let i = 0; i < activeCount; i++) {
               // this.removeTrail(shape, i);
            }

            this.activeCounts[shape] = 0;
            this.meshes[shape].instanceMatrix.needsUpdate = true;
            if (this.meshes[shape].instanceColor) {
                this.meshes[shape].instanceColor.needsUpdate = true;
            }
        });
    }
}

export default InstancedParticleSystem;
