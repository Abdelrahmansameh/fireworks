import { FIREWORK_CONFIG } from '../config/config.js';
import { createDebugCross } from '../utils/debug.js';
import * as Renderer2D from '../rendering/Renderer.js';

class InstancedParticleSystem {
    constructor(scene, renderer, maxParticles = 10000, profiler) {
        this.profiler = profiler;

        this.scene = scene;

        this.renderer = renderer;

        this.maxParticles = maxParticles;
        this.meshes = {};
        this.activeCounts = {};

        this.activeTrails = new Map();
        this.maxTrails = maxParticles * 2;
        this.maxTrailPoints = 8;
        this.trailUpdateInterval = 50;

        this.instanceData = {};

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
                maxInstances: maxParticles,
                zIndex: 0,
                blendMode: Renderer2D.BlendMode.NORMAL
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
            this.instanceData[shape] = new Float32Array(maxParticles * this.instanceFloats).fill(0.0);
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


    addParticle(position, velocity, color, scale, lifetime, gravity, shape = 'sphere', acceleration = new THREE.Vector3(), enableTrail = true, friction = FIREWORK_CONFIG.baseFriction) {
        if (!FIREWORK_CONFIG.supportedShapes.includes(shape)) {
            shape = 'sphere';
        }

        const activeCount = this.activeCounts[shape];
        if (activeCount >= this.maxParticles) return -1;

        const index = activeCount;

        const base = index * this.instanceFloats;


        this.instanceData[shape][base + this.positionIdx] = position.x;
        this.instanceData[shape][base + this.positionIdx + 1] = position.y;
        this.instanceData[shape][base + this.velocityIdx] = velocity.x;
        this.instanceData[shape][base + this.velocityIdx + 1] = velocity.y;
        this.instanceData[shape][base + this.accelerationIdx] = acceleration.x;
        this.instanceData[shape][base + this.accelerationIdx + 1] = acceleration.y;
        this.instanceData[shape][base + this.colorIdx] = color.r;
        this.instanceData[shape][base + this.colorIdx + 1] = color.g;
        this.instanceData[shape][base + this.colorIdx + 2] = color.b;
        this.instanceData[shape][base + this.colorIdx + 3] = color.a;
        this.instanceData[shape][base + this.scaleIdx] = scale;
        this.instanceData[shape][base + this.lifetimeIdx] = lifetime;
        this.instanceData[shape][base + this.initialLifetimeIdx] = lifetime;
        this.instanceData[shape][base + this.gravityIdx] = gravity;
        this.instanceData[shape][base + this.frictionIdx] = Math.max(0.0, Math.min(1.0, 1 - friction));

        const normalizedVelocity = velocity.clone().normalize();
        const targetDir = normalizedVelocity.clone().scale(-1);
        this.instanceData[shape][base + this.rotationIdx] = targetDir.getAngle();

        this.meshes[shape].addInstance(position, this.instanceData[shape][base + this.rotationIdx], scale, color);

        this.updateParticle(shape, index);

        /* if (enableTrail) {
             this.createTrailForParticle(shape, index, position, velocity, color);
         }*/

        this.activeCounts[shape]++;
        return index;
    }

    updateParticle(shape, index) {
        const base = index * this.instanceFloats;

        this.meshes[shape].updateInstancePosition(index,
            this.instanceData[shape][base + this.positionIdx],
            this.instanceData[shape][base + this.positionIdx + 1]
        );

        this.meshes[shape].updateInstanceRotation(index,
            this.instanceData[shape][base + this.rotationIdx]
        );

        this.meshes[shape].updateInstanceColor(index,
            this.instanceData[shape][base + this.colorIdx],
            this.instanceData[shape][base + this.colorIdx + 1],
            this.instanceData[shape][base + this.colorIdx + 2],
            this.instanceData[shape][base + this.colorIdx + 3]
        );

        this.meshes[shape].updateInstanceScale(index,
            this.instanceData[shape][base + this.scaleIdx],
            this.instanceData[shape][base + this.scaleIdx]
        );
    }

    update(delta) {
        this.profiler.startFunction('particleSystemUpdate');
        const now = performance.now();

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            let activeCount = this.activeCounts[shape];
            for (let i = 0; i < activeCount; i++) {
                this.profiler.startFunction('particleProcessing');

                const base = i * this.instanceFloats;

                this.instanceData[shape][base + this.lifetimeIdx] -= delta;
                let isAlive = this.instanceData[shape][base + this.lifetimeIdx] > 0;

                this.profiler.startFunction('removeInstanceData');
                if (!isAlive) {
                    // swap with last instance data to match renderer instance
                    const lastIndex = activeCount - 1;
                    const lastIndexBase = lastIndex * this.instanceFloats;
                    this.profiler.startFunction('shiftInstanceData');
                    this.instanceData[shape][base + this.positionIdx] = this.instanceData[shape][lastIndexBase + this.positionIdx];
                    this.instanceData[shape][base + this.positionIdx + 1] = this.instanceData[shape][lastIndexBase + this.positionIdx + 1];
                    this.instanceData[shape][base + this.velocityIdx] = this.instanceData[shape][lastIndexBase + this.velocityIdx];
                    this.instanceData[shape][base + this.velocityIdx + 1] = this.instanceData[shape][lastIndexBase + this.velocityIdx + 1];
                    this.instanceData[shape][base + this.accelerationIdx] = this.instanceData[shape][lastIndexBase + this.accelerationIdx];
                    this.instanceData[shape][base + this.accelerationIdx + 1] = this.instanceData[shape][lastIndexBase + this.accelerationIdx + 1];
                    this.instanceData[shape][base + this.colorIdx] = this.instanceData[shape][lastIndexBase + this.colorIdx];
                    this.instanceData[shape][base + this.colorIdx + 1] = this.instanceData[shape][lastIndexBase + this.colorIdx + 1];
                    this.instanceData[shape][base + this.colorIdx + 2] = this.instanceData[shape][lastIndexBase + this.colorIdx + 2];
                    this.instanceData[shape][base + this.colorIdx + 3] = this.instanceData[shape][lastIndexBase + this.colorIdx + 3];
                    this.instanceData[shape][base + this.scaleIdx] = this.instanceData[shape][lastIndexBase + this.scaleIdx];
                    this.instanceData[shape][base + this.lifetimeIdx] = this.instanceData[shape][lastIndexBase + this.lifetimeIdx];
                    this.instanceData[shape][base + this.initialLifetimeIdx] = this.instanceData[shape][lastIndexBase + this.initialLifetimeIdx];
                    this.instanceData[shape][base + this.gravityIdx] = this.instanceData[shape][lastIndexBase + this.gravityIdx];
                    this.instanceData[shape][base + this.rotationIdx] = this.instanceData[shape][lastIndexBase + this.rotationIdx];
                    this.instanceData[shape][base + this.frictionIdx] = this.instanceData[shape][lastIndexBase + this.frictionIdx];
                    this.profiler.endFunction('shiftInstanceData');

                    const oldTrailKey = `${shape}-${lastIndex}`;
                    const newTrailKey = `${shape}-${i}`;
                    const trailData = this.activeTrails.get(oldTrailKey);
                    if (trailData) {
                        this.activeTrails.delete(oldTrailKey);
                        this.activeTrails.set(newTrailKey, trailData);
                    }

                    this.removeTrail(shape, i);
                    this.meshes[shape].removeInstance(i);
                    activeCount--;
                }
                if (i >= activeCount) {
                    break;
                }
                this.profiler.endFunction('removeInstanceData');

                this.profiler.startFunction('particlePhysicsUpdate');
                const frictionFactor = Math.pow(this.instanceData[shape][base + this.frictionIdx], delta);

                this.instanceData[shape][base + this.velocityIdx] +=
                    (this.instanceData[shape][base + this.accelerationIdx] * delta) * frictionFactor;

                this.instanceData[shape][base + this.velocityIdx + 1] +=
                    ((this.instanceData[shape][base + this.accelerationIdx + 1] * delta) - (this.instanceData[shape][base + this.gravityIdx] * delta)) * frictionFactor;

                this.instanceData[shape][base + this.positionIdx] += this.instanceData[shape][base + this.velocityIdx] * delta;
                this.instanceData[shape][base + this.positionIdx + 1] += this.instanceData[shape][base + this.velocityIdx + 1] * delta;
                this.profiler.endFunction('particlePhysicsUpdate');

                this.profiler.startFunction('alphaCalculation');
                const normalizedLifetime = this.instanceData[shape][base + this.lifetimeIdx] /
                    this.instanceData[shape][base + this.initialLifetimeIdx];
                this.instanceData[shape][base + this.colorIdx + 3] = Math.pow(normalizedLifetime, 3);
                this.profiler.endFunction('alphaCalculation');

                this.profiler.startFunction('updateParticle');
                this.updateParticle(shape, i);
                this.profiler.endFunction('updateParticle');

                this.profiler.startFunction('trailKeyGeneration');
                const trailKey = `${shape}-${i}`;
                const trailData = this.activeTrails.get(trailKey);
                this.profiler.endFunction('trailKeyGeneration');

                this.profiler.startFunction('updateParticleTrail');
                if (trailData && trailData.points.length > 0) {
                    if (now - trailData.lastUpdate >= trailData.trailUpdateInterval) {
                        trailData.points.push(this.instanceData[shape][base + this.positionIdx].clone());
                        if (trailData.points.length > this.maxTrailPoints) {
                            trailData.points.shift();
                        }

                        this.updateTrailGeometry(trailData.mesh, trailData.points, trailData.points[0], 1);

                        trailData.offset = trailData.points[0].clone().sub(trailData.points[trailData.points.length - 1])
                        trailData.lastUpdate = now;
                    }

                    trailData.mesh.material.opacity = normalizedLifetime;
                    trailData.mesh.position.copy(this.instanceData[shape][base + this.positionIdx].clone().add(trailData.offset));
                }
                this.profiler.endFunction('updateParticleTrail');

                this.profiler.endFunction('particleProcessing');
            }
            this.activeCounts[shape] = activeCount;
        });

        this.profiler.endFunction('particleSystemUpdate');
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
                this.removeTrail(shape, i);
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
