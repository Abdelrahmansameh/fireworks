import { FIREWORK_CONFIG } from '../config/config.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';

class Firework {
    constructor(x, y, components, scene, camera, trailEffect, particleSystem) {
        this.scene = scene;
        this.camera = camera;
        this.components = components;
        this.trailEffect = trailEffect;
        this.particleSystem = particleSystem;
        this.exploded = false;
        this.alive = true;
        this.particles = {};

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape] = new Set();
        });

        this.rocket = this.createRocket(x, y);
        this.trailParticles = [];

        const distance = this.camera.position.z - this.rocket.position.z;
        const vFOV = this.camera.fov * Math.PI / 180;
        const viewHeight = 2 * Math.tan(vFOV / 2) * distance;

        const minY = -viewHeight / 2 + FIREWORK_CONFIG.minExplosionHeightPercent * viewHeight;
        const maxY = -viewHeight / 2 + FIREWORK_CONFIG.maxExplosionHeightPercent * viewHeight;

        this.targetY = minY + Math.random() * (maxY - minY);
    }

    createRocket(x, y) {
        const geometry = new THREE.SphereGeometry(FIREWORK_CONFIG.rocketSize, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const rocket = new THREE.Mesh(geometry, material);
        rocket.position.set(x, y, 0);
        this.scene.add(rocket);
        return rocket;
    }

    update(delta) {
        if (!this.exploded) {
            this.rocket.position.y += FIREWORK_CONFIG.ascentSpeed * delta;
            this.createTrailParticle(this.rocket.position.x, this.rocket.position.y);

            this.updateTrailParticles(delta);

            if (this.rocket.position.y >= this.targetY) {
                this.explode();
            }
        } else {
            this.alive = false;
            FIREWORK_CONFIG.supportedShapes.forEach(shape => {
                if (this.particles[shape].size > 0) {
                    this.alive = true;
                }
            });
        }
    }

    createTrailParticle(x, y) {
        let material;
        switch (this.trailEffect) {
            case 'sparkle':
                const groupSize = 5;  // Number of particles in each sparkle group
                const groupSpread = 0.3;  // How far particles spread from center
                const groupTime = Date.now();  // Shared timestamp for the group
                const groupId = Math.floor(groupTime / 100);  // Group identifier

                for (let i = 0; i < groupSize; i++) {
                    const angle = (Math.PI * 2 * i) / groupSize;
                    const offsetX = x + Math.cos(angle) * groupSpread * Math.random();
                    const offsetY = y + Math.sin(angle) * groupSpread * Math.random();

                    material = new THREE.PointsMaterial({
                        color: 0xffffff,
                        size: 0.2 + Math.random() * 0.2,
                        transparent: true,
                        opacity: 0.8,
                        blending: THREE.AdditiveBlending
                    });

                    const geometry = new THREE.BufferGeometry();
                    const positions = new Float32Array([offsetX, offsetY, 0]);
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    const particle = new THREE.Points(geometry, material);
                    this.scene.add(particle);

                    this.trailParticles.push({
                        mesh: particle,
                        createdAt: groupTime,
                        initialOpacity: 0.8,
                        groupId: groupId
                    });
                }
                break;

            case 'rainbow':
                const hue = (Date.now() * 0.001) % 1;
                const color = new THREE.Color();
                color.setHSL(hue, 1, 0.5);
                material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const sphere = new THREE.SphereGeometry(0.2, 4, 4);
                const mesh = new THREE.Mesh(sphere, material);
                mesh.position.set(x, y, 0);
                this.scene.add(mesh);
                this.trailParticles.push({
                    mesh: mesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8,
                    color: color.clone()
                });
                break;

            case 'comet':
                material = new THREE.MeshBasicMaterial({
                    color: 0xffaa00,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const cometGeometry = new THREE.SphereGeometry(0.3, 4, 4);
                const cometMesh = new THREE.Mesh(cometGeometry, material);
                cometMesh.position.set(x, y, 0);
                this.scene.add(cometMesh);
                this.trailParticles.push({
                    mesh: cometMesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8,
                    scale: 1.0
                });
                break;

            case 'fade':
            default:
                material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending
                });
                const defaultGeometry = new THREE.SphereGeometry(0.2, 4, 4);
                const defaultMesh = new THREE.Mesh(defaultGeometry, material);
                defaultMesh.position.set(x, y, 0);
                this.scene.add(defaultMesh);
                this.trailParticles.push({
                    mesh: defaultMesh,
                    createdAt: Date.now(),
                    initialOpacity: 0.8
                });
                break;
        }
    }

    updateTrailParticles(delta) {
        const now = Date.now();
        const flickerSpeed = 8;

        const groups = {};
        this.trailParticles.forEach(particle => {
            if (particle.groupId) {
                if (!groups[particle.groupId]) {
                    groups[particle.groupId] = [];
                }
                groups[particle.groupId].push(particle);
            }
        });

        this.trailParticles.forEach((particle, index) => {
            const age = (now - particle.createdAt) / 500;

            if (age >= 1) return;

            switch (this.trailEffect) {
                case 'sparkle':
                    if (particle.groupId) {
                        // Calculate a shared brightness for the group
                        const groupPhase = (now * flickerSpeed + particle.groupId * 1000) / 1000;
                        const groupBrightness = 0.3 + (Math.sin(groupPhase) * 0.5 + 0.5) * 0.7;

                        particle.mesh.material.size = (0.2 + Math.random() * 0.2) * (1 - age * 0.5);
                        particle.mesh.material.opacity = particle.initialOpacity * groupBrightness * (1 - age);
                    } else {
                        // Fallback for any particles without a group
                        particle.mesh.material.size = (0.3 + Math.random() * 0.3) * (1 - age);
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    }
                    break;

                case 'rainbow':
                    if (particle.groupId) {
                        // Calculate a shared hue for the group
                        const groupPhase = (now * flickerSpeed + particle.groupId * 1000) / 1000;
                        const groupHue = (groupPhase + index * 0.1) % 1;

                        particle.color.setHSL(groupHue, 1, 0.5);
                        particle.mesh.material.color = particle.color;
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    } else {
                        // Fallback for any particles without a group
                        const hue = ((now * 0.001) + index * 0.1) % 1;
                        particle.color.setHSL(hue, 1, 0.5);
                        particle.mesh.material.color = particle.color;
                        particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    }
                    break;

                case 'comet':
                    particle.scale = Math.max(0.0001, particle.scale * 1.1 * (1 - age));
                    particle.mesh.scale.set(particle.scale, particle.scale, particle.scale);
                    particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    particle.mesh.position.y += delta * 2;
                    break;

                case 'fade':
                default:
                    particle.mesh.material.opacity = particle.initialOpacity * (1 - age);
                    break;
            }
        });

        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const particle = this.trailParticles[i];
            if (Date.now() - particle.createdAt > 500) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
                this.trailParticles.splice(i, 1);
            }
        }
    }

    explode() {
        this.scene.remove(this.rocket);
        if (this.rocket.geometry) this.rocket.geometry.dispose();
        if (this.rocket.material) this.rocket.material.dispose();

        this.trailParticles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
            }
        });
        this.trailParticles = [];

        this.components.forEach(component => {
            const particleCount = Math.floor(FIREWORK_CONFIG.particleDensity * component.size);
            const pattern = component.pattern;
            const gravity = FIREWORK_CONFIG.patternGravities[pattern] || FIREWORK_CONFIG.patternGravities.default;
            const speed = FIREWORK_CONFIG.baseSpeed * component.size;
            const color = new THREE.Color(component.color);
            const secondaryColor = new THREE.Color(component.secondaryColor || '#00ff00');
            const size = FIREWORK_CONFIG.particleSize * component.size;
            const rocketPos = this.rocket.position.clone();
            const velocity = new THREE.Vector3();
            const acceleration = new THREE.Vector3();
            const shape = component.shape;
            const spread = component.spread;

            // Pattern explosion code unchanged from original, included fully

            switch (pattern) {
                case 'spherical':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = (i / particleCount) * Math.PI * 2;
                        const magnitude = speed * (0.8 + Math.random() * 0.4) * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity * (0.8 + Math.random() * 0.4),
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'ring':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = (i / particleCount) * Math.PI * 2;
                        const magnitude = speed * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity * (0.9 + Math.random() * 0.1),
                            shape, 
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'burst':
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const magnitude = speed * Math.random() * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'palm':
                    const branches = 8;
                    const particlesPerBranch = Math.floor(particleCount / branches);
                    for (let i = 0; i < particleCount; i++) {
                        const branch = i % branches;
                        const particleInBranch = Math.floor(i / branches);
                        const baseAngle = (branch / branches) * Math.PI * 2;
                        const angleSpread = 0.3 * (particleInBranch / particlesPerBranch);
                        const angle = baseAngle + (Math.random() - 0.5) * angleSpread;
                        const magnitude = speed * (1 + particleInBranch / particlesPerBranch) * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'willow':
                    const emissionAngle = 0.5;
                    for (let i = 0; i < particleCount; i++) {
                        const angleOffset = (Math.random() * 1.2 - 0.5) * emissionAngle;
                        const angle = (-Math.PI / 2) + angleOffset;
                        const horizontalDrift = (Math.random() - 0.5) * 10;
                        const initialSpeed = speed * (0.7 + Math.random() * 0.3) * spread;
                        velocity.set(
                            Math.cos(angle) * initialSpeed + horizontalDrift,
                            Math.sin(angle) * initialSpeed,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                case 'heart':
                    {
                        const heartScale = spread;
                        for (let i = 0; i < particleCount; i++) {
                            const t = (i / particleCount) * Math.PI * 2;
                            const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
                            const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                            const angle = Math.atan2(yOffset, xOffset);
                            const magnitude = speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.05;
                            velocity.set(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude,
                                0
                            );
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity * (0.9 + Math.random() * 0.1),
                                shape,
                                acceleration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                    case 'brokenHeart': {
                        const heartScale = spread;
                        
                        // Pick an approximate pivot near the bottom tip of the heart shape.
                        const pivotOffset = new THREE.Vector3(0, -heartScale * 30, 0);
                        const pivotPoint = rocketPos.clone().add(pivotOffset);
                    
                        const rotationAxis = new THREE.Vector3(0, 0, 1);
                        
                        for (let i = 0; i < particleCount; i++) {
                            // Parametric heart shape
                            const t = (i / particleCount) * Math.PI * 2;
                            const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
                            const yOffset = heartScale * (
                                13 * Math.cos(t)
                                - 5 * Math.cos(2 * t)
                                - 2 * Math.cos(3 * t)
                                - Math.cos(4 * t)
                            );
                    
                            const particlePos = rocketPos.clone().add(new THREE.Vector3(xOffset, yOffset, 0));
                            
                            const angle = Math.atan2(yOffset, xOffset);
                            const magnitude = speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.05;
                            const unbrokenHeartVelocity = new THREE.Vector3(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude,
                                0
                            );
                            
                            const pivotToParticle = particlePos.clone().sub(pivotPoint);
                            const rotation = new THREE.Vector3().crossVectors(pivotToParticle, rotationAxis);
                            const sign = (i < particleCount / 2) ? 1 : -1;
                            const rotationSpeed = 0.05 * sign;
                            rotation.multiplyScalar(rotationSpeed);
                    
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),  
                                unbrokenHeartVelocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity * 1.3,
                                shape, 
                                rotation
                            );
                            if (index !== -1) {
                                this.particles[shape].add(index);
                            }
                        }
                        break;
                    }
                case 'helix':
                    const helixRadius = 0.5;
                    const riseSpeed = speed * 0.1 * spread;
                    const rotationSpeed = 2;
                    const particlesPerStream = 100;
                    const verticalSpacing = 0.1;
                    const spreadFactor = 0.1;

                    for (let stream = 0; stream < 2; stream++) {
                        const streamOffset = stream * Math.PI;
                        for (let i = 0; i < particlesPerStream; i++) {
                            const t = (i / particlesPerStream) * Math.PI * 2;
                            const angle = t + streamOffset;

                            const randomSpread = (Math.random() - 0.5) * spreadFactor;
                            const offset = new THREE.Vector3(
                                Math.cos(angle) * helixRadius * (1 + randomSpread),
                                -i * verticalSpacing,
                                Math.sin(angle) * helixRadius * (1 + randomSpread)
                            );

                            velocity.set(
                                -Math.sin(angle) * rotationSpeed,
                                riseSpeed * (1 + randomSpread),
                                Math.cos(angle) * rotationSpeed
                            );
                            const particleColor = new THREE.Color();
                            if (stream === 1) {
                                particleColor.copy(secondaryColor);
                            } else {
                                particleColor.copy(color);
                            }

                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone().add(offset),
                                particleColor,
                                size,
                                component.lifetime,
                                gravity * 0.2,
                                shape,
                                acceleration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                    }
                    break;

                case 'star':
                    const spikes = 5;
                    const outerRadius = speed * spread;
                    const innerRadius = speed * 0.5 * spread;
                    const pointsPerStar = spikes * 2;

                    for (let i = 0; i < particleCount; i++) {
                        const starPoint = i % pointsPerStar;
                        const starCopy = Math.floor(i / pointsPerStar);
                        let radius = (starPoint % 2 === 0) ? outerRadius : innerRadius;
                        let angle = (starPoint / pointsPerStar) * Math.PI * 2;

                        if (i > pointsPerStar && (starPoint % 2 === 0)) {
                            radius = outerRadius * (1 + (Math.random() * 0.2 - 0.1));
                        }

                        const radiusVariation = 1 + (Math.random() * 0.2 - 0.1) * (starCopy > 0 ? 1 : 0);
                        const angleVariation = (Math.random() * 0.1 - 0.05) * (starCopy > 0 ? 1 : 0);

                        velocity.set(
                            Math.cos(angle + angleVariation) * radius * radiusVariation,
                            Math.sin(angle + angleVariation) * radius * radiusVariation,
                            0
                        );

                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
                    break;

                default:
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const magnitude = speed * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude,
                            0
                        );
                        const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
            }
        });
        this.exploded = true;
    }

    dispose() {
        if (this.rocket) {
            this.scene.remove(this.rocket);
            if (this.rocket.geometry) this.rocket.geometry.dispose();
            if (this.rocket.material) this.rocket.material.dispose();
            this.rocket = null;
        }

        this.trailParticles.forEach(particle => {
            if (particle.mesh) {
                this.scene.remove(particle.mesh);
                if (particle.mesh.geometry) particle.mesh.geometry.dispose();
                if (particle.mesh.material) {
                    if (particle.mesh.material.map) particle.mesh.material.map.dispose();
                    particle.mesh.material.dispose();
                }
            }
        });
        this.trailParticles = [];

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape].clear();
        });

        this.alive = false;
    }
}

export default Firework;
