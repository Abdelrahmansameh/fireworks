import { FIREWORK_CONFIG } from '../config/config.js';

class InstancedParticleSystem {
    constructor(scene, maxParticles = 10000) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.meshes = {};
        this.activeCounts = {};

        const geometries = {
            sphere: new THREE.SphereGeometry(1, 8, 8),
            star: this.createStarGeometry(),
            ring: new THREE.RingGeometry(0.5, 1, 8),
            crystalDroplet: this.createCrystalDropletGeometry(),
            sliceBurst: this.createSliceBurstGeometry()
        };

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            const geometry = geometries[shape];
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

            this.meshes[shape] = instancedMesh;
            this.activeCounts[shape] = 0;
            scene.add(instancedMesh);
        });

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

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.positions[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Vector3());
            this.velocities[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Vector3());
            this.accelerations[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Vector3()); 
            this.colors[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Color());
            this.scales[shape] = new Float32Array(maxParticles);
            this.lifetimes[shape] = new Float32Array(maxParticles);
            this.initialLifetimes[shape] = new Float32Array(maxParticles);
            this.gravities[shape] = new Float32Array(maxParticles);
            this.alphas[shape] = new Float32Array(maxParticles).fill(1.0);
            this.rotations[shape] = new Array(maxParticles).fill(null).map(() => new THREE.Quaternion());
        });

        this.matrix = new THREE.Matrix4();
        this.tempData = {};
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.tempData[shape] = {
                matrix: new THREE.Matrix4(),
                color: new THREE.Color()
            };
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

    addParticle(position, velocity, color, scale, lifetime, gravity, shape = 'sphere', acceleration = new THREE.Vector3()) {
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
        this.scales[shape][index] = scale;
        this.lifetimes[shape][index] = lifetime;
        this.initialLifetimes[shape][index] = lifetime;
        this.gravities[shape][index] = gravity;
        this.alphas[shape][index] = 1.0;

        const normalizedVelocity = velocity.clone().normalize();
        const targetDir = normalizedVelocity.clone().multiplyScalar(-1);
        const defaultFront = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultFront, targetDir);
        this.rotations[shape][index].copy(quaternion);

        this.updateParticleTransform(shape, index);

        this.activeCounts[shape]++;
        return index;
    }

    updateParticleTransform(shape, index) {
        const position = this.positions[shape][index].clone();
        const quaternion = this.rotations[shape][index].clone();

        this.matrix.makeRotationFromQuaternion(quaternion);

        const scale = this.scales[shape][index];
        this.matrix.scale(new THREE.Vector3(scale, scale, scale));

        this.matrix.setPosition(position.x, position.y, position.z);

        this.meshes[shape].setMatrixAt(index, this.matrix);

        this.tempData[shape].color.copy(this.colors[shape][index]);
        this.tempData[shape].color.multiplyScalar(this.alphas[shape][index]);
        this.meshes[shape].setColorAt(index, this.tempData[shape].color);
    }

    update(delta) {
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            let nextFreeIndex = 0;
            const activeCount = this.activeCounts[shape];

            for (let i = 0; i < activeCount; i++) {
                this.lifetimes[shape][i] -= delta;

                if (this.lifetimes[shape][i] > 0) {
                    if (i !== nextFreeIndex) {
                        this.positions[shape][nextFreeIndex].copy(this.positions[shape][i]);
                        this.velocities[shape][nextFreeIndex].copy(this.velocities[shape][i]);
                        this.accelerations[shape][nextFreeIndex].copy(this.accelerations[shape][i]);  // Copy acceleration
                        this.colors[shape][nextFreeIndex].copy(this.colors[shape][i]);
                        this.scales[shape][nextFreeIndex] = this.scales[shape][i];
                        this.lifetimes[shape][nextFreeIndex] = this.lifetimes[shape][i];
                        this.initialLifetimes[shape][nextFreeIndex] = this.initialLifetimes[shape][i];
                        this.gravities[shape][nextFreeIndex] = this.gravities[shape][i];
                        this.alphas[shape][nextFreeIndex] = this.alphas[shape][i];
                        this.rotations[shape][nextFreeIndex].copy(this.rotations[shape][i]);
                    }

                    this.velocities[shape][nextFreeIndex].addScaledVector(
                        this.accelerations[shape][nextFreeIndex],  // Use acceleration
                        delta
                    );
                    this.velocities[shape][nextFreeIndex].y -= this.gravities[shape][nextFreeIndex] * delta;
                    this.positions[shape][nextFreeIndex].addScaledVector(
                        this.velocities[shape][nextFreeIndex],
                        delta
                    );

                    const normalizedLifetime = this.lifetimes[shape][nextFreeIndex] /
                        this.initialLifetimes[shape][nextFreeIndex];
                    this.alphas[shape][nextFreeIndex] = Math.pow(normalizedLifetime, 3);

                    this.updateParticleTransform(shape, nextFreeIndex);
                    nextFreeIndex++;
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
    }

    dispose() {
        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.scene.remove(this.meshes[shape]);
            this.meshes[shape].geometry.dispose();
            this.meshes[shape].material.dispose();
            this.rotations[shape] = null;
        });
    }

    clear() {
        Object.keys(this.activeCounts).forEach(shape => {
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
