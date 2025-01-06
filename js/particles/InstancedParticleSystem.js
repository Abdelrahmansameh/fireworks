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

        this.positions = {};
        this.velocities = {};
        this.accelerations = {};
        this.colors = {};
        this.scales = {};
        this.lifetimes = {};
        this.initialLifetimes = {};
        this.gravities = {};
        this.alphas = {};
        this.rotations = {};
        this.frictions = {};

        const geometries = {
            sphere: Renderer2D.buildCircle(50, 32),
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

            /*
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });

            const instancedMesh = new THREE.InstancedMesh(
                geometry,
                material,
                maxParticles
            );

            instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(maxParticles * 3),
                3
            );

            instancedMesh.frustumCulled = false;

            scene.add(instancedMesh);*/
        });

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.positions[shape] = new Array(maxParticles).fill(null).map(() => new Renderer2D.Vector2(0, 0));
            this.velocities[shape] = new Array(maxParticles).fill(null).map(() => new Renderer2D.Vector2(0, 0));
            this.accelerations[shape] = new Array(maxParticles).fill(null).map(() => new Renderer2D.Vector2(0, 0));
            this.colors[shape] = new Array(maxParticles).fill(null).map(() => new Renderer2D.Color(1, 1, 1, 1));
            this.scales[shape] = new Array(maxParticles).fill(null).map(() => new Renderer2D.Vector2(1, 1));
            this.lifetimes[shape] = new Float32Array(maxParticles);
            this.initialLifetimes[shape] = new Float32Array(maxParticles);
            this.gravities[shape] = new Float32Array(maxParticles);
            this.alphas[shape] = new Float32Array(maxParticles).fill(1.0);
            this.rotations[shape] = new Array(maxParticles).fill(null).map(() => 0);
            this.frictions[shape] = new Float32Array(maxParticles).fill(0.0);
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

        this.positions[shape][index].copy(position);
        this.velocities[shape][index].copy(velocity);
        this.accelerations[shape][index].copy(acceleration);
        this.colors[shape][index].copy(color);
        this.scales[shape][index] = new Renderer2D.Vector2(scale, scale);
        this.lifetimes[shape][index] = lifetime;
        this.initialLifetimes[shape][index] = lifetime;
        this.gravities[shape][index] = gravity;
        this.alphas[shape][index] = 1.0;
        this.frictions[shape][index] = Math.max(0.0, Math.min(1.0, 1 - friction));

        const normalizedVelocity = velocity.clone().normalize();
        const targetDir = normalizedVelocity.clone().scale(-1);
        this.rotations[shape][index] = targetDir.getAngle();

        this.meshes[shape].addInstance(position, this.rotations[shape][index], scale, color);

        this.updateParticleTransform(shape, index);

        /* if (enableTrail) {
             this.createTrailForParticle(shape, index, position, velocity, color);
         }*/

        this.activeCounts[shape]++;
        return index;
    }

    updateParticleTransform(shape, index) {
        const position = this.positions[shape][index];
        const rotation = this.rotations[shape][index];
        const scale = this.scales[shape][index];
        const color = this.colors[shape][index];

        this.meshes[shape].updateInstance(index, {
            position: position,
            rotation: rotation,
            scale: scale,
            color: color
        });

    }

    update(delta) {
        this.profiler.startFunction('particleSystemUpdate');
        const now = performance.now();

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            let nextFreeIndex = 0;
            const activeCount = this.activeCounts[shape];

            for (let i = 0; i < activeCount; i++) {
                this.lifetimes[shape][i] -= delta;

                if (this.lifetimes[shape][i] > 0) {
                    if (i !== nextFreeIndex) {
                        this.profiler.startFunction('shiftParticleMatrix');
                        this.positions[shape][nextFreeIndex].copy(this.positions[shape][i]);
                        this.velocities[shape][nextFreeIndex].copy(this.velocities[shape][i]);
                        this.accelerations[shape][nextFreeIndex].copy(this.accelerations[shape][i]);
                        this.colors[shape][nextFreeIndex].copy(this.colors[shape][i]);
                        this.scales[shape][nextFreeIndex] = this.scales[shape][i];
                        this.lifetimes[shape][nextFreeIndex] = this.lifetimes[shape][i];
                        this.initialLifetimes[shape][nextFreeIndex] = this.initialLifetimes[shape][i];
                        this.gravities[shape][nextFreeIndex] = this.gravities[shape][i];
                        this.alphas[shape][nextFreeIndex] = this.alphas[shape][i];
                        this.rotations[shape][nextFreeIndex] = (this.rotations[shape][i]);
                        this.frictions[shape][nextFreeIndex] = this.frictions[shape][i];

                        const oldTrailKey = `${shape}-${i}`;
                        const newTrailKey = `${shape}-${nextFreeIndex}`;
                        const trailData = this.activeTrails.get(oldTrailKey);
                        if (trailData) {
                            this.activeTrails.delete(oldTrailKey);
                            this.activeTrails.set(newTrailKey, trailData);
                        }
                        this.profiler.endFunction('shiftParticleMatrix');
                    }

                    this.profiler.startFunction('particlePhysicsUpdate');
                    this.velocities[shape][nextFreeIndex].addScaledVector(
                        this.accelerations[shape][nextFreeIndex],
                        delta
                    );
                    this.velocities[shape][nextFreeIndex].y -= this.gravities[shape][nextFreeIndex] * delta;

                    const frictionFactor = Math.pow(this.frictions[shape][nextFreeIndex], delta);
                    this.velocities[shape][nextFreeIndex].scale(frictionFactor);

                    this.positions[shape][nextFreeIndex].addScaledVector(
                        this.velocities[shape][nextFreeIndex],
                        delta
                    );
                    this.profiler.endFunction('particlePhysicsUpdate');

                    const normalizedLifetime = this.lifetimes[shape][nextFreeIndex] /
                        this.initialLifetimes[shape][nextFreeIndex];
                    this.alphas[shape][nextFreeIndex] = Math.pow(normalizedLifetime, 3);

                    this.profiler.startFunction('updateParticleTransform');
                    this.updateParticleTransform(shape, nextFreeIndex);
                    this.profiler.endFunction('updateParticleTransform');

                    this.profiler.startFunction('updateParticleTrail');

                    const trailKey = `${shape}-${nextFreeIndex}`;
                    const trailData = this.activeTrails.get(trailKey);

                    if (trailData && trailData.points.length > 0) {
                        if (now - trailData.lastUpdate >= trailData.trailUpdateInterval) {
                            trailData.points.push(this.positions[shape][nextFreeIndex].clone());
                            if (trailData.points.length > this.maxTrailPoints) {
                                trailData.points.shift();
                            }

                            this.updateTrailGeometry(trailData.mesh, trailData.points, trailData.points[0], 1);

                            trailData.offset = trailData.points[0].clone().sub(trailData.points[trailData.points.length - 1])
                            trailData.lastUpdate = now;
                        }

                        trailData.mesh.material.opacity = normalizedLifetime;
                        trailData.mesh.position.copy(this.positions[shape][nextFreeIndex].clone().add(trailData.offset));
                    }

                    this.profiler.endFunction('updateParticleTrail');

                    nextFreeIndex++;
                } else {
                    this.removeTrail(shape, i);
                }
            }

            this.activeCounts[shape] = nextFreeIndex;
            this.meshes[shape].count = nextFreeIndex;

            if (this.meshes[shape].instanceMatrix) {
                this.meshes[shape].instanceMatrix.needsUpdate = true;
            }
            if (this.meshes[shape].instanceColor) {
                this.meshes[shape].instanceColor.needsUpdate = true;
            }
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
            this.meshes[shape].count = 0;
            this.meshes[shape].instanceMatrix.needsUpdate = true;
            if (this.meshes[shape].instanceColor) {
                this.meshes[shape].instanceColor.needsUpdate = true;
            }
        });
    }
}

export default InstancedParticleSystem;
