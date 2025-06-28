import { FIREWORK_CONFIG } from '../config/config.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import * as Renderer2D from '../rendering/Renderer.js';

class Firework {
    constructor(x, y, components, renderer, viewHeight, trailEffect, particleSystem, targetY = null) {
        this.components = components;
        this.renderer = renderer;
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

        const minY = -viewHeight / 2 + FIREWORK_CONFIG.minExplosionHeightPercent * viewHeight;
        const maxY = -viewHeight / 2 + FIREWORK_CONFIG.maxExplosionHeightPercent * viewHeight;

        this.targetY = targetY || minY + Math.random() * (maxY - minY);

        this.lastTrailIndex = 0;
        const geometry = Renderer2D.buildCircle(.8);
        this.trailInstanceGroup = this.renderer.createInstancedGroup({
            vertices: geometry.vertices,
            indices: geometry.indices,
            maxInstances: FIREWORK_CONFIG.rocketTrailLength,
            zIndex: 0,
            blendMode: Renderer2D.BlendMode.ADDITIVE,
            useGlow: false,
        });
    }

    _hexToRgbA(hex) {
        if (!hex || typeof hex !== 'string') {
            console.warn(`Invalid hex color input: ${hex}. Using default black.`);
            return { r: 0, g: 0, b: 0, a: 1 };
        }

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255, a: 1 };
    }

    createRocket(x, y) {
        const geometry = Renderer2D.buildTriangle(6, 10);
        const rocket = this.renderer.createNormalShape({
            vertices: geometry.vertices,
            indices: geometry.indices,
            color: new Renderer2D.Color(1, 1, 1, 1),
            position: new Renderer2D.Vector2(x, y),
            rotation: 0,
            scale: new Renderer2D.Vector2(FIREWORK_CONFIG.rocketSize, FIREWORK_CONFIG.rocketSize),
            zIndex: -1,
            blendMode: Renderer2D.BlendMode.ADDITIVE,
            isStroke: false
        });

        return rocket;
    }

    update(delta) {
        if (!this.exploded) {
            this.rocket.position.y += FIREWORK_CONFIG.ascentSpeed * delta;

            if (this.trailParticles.length < FIREWORK_CONFIG.rocketTrailLength) {
                this.createTrailParticle(this.rocket.position.x, this.rocket.position.y);
            }
            else {
                for (let i = 0; i < this.trailParticles.length; i++) {
                    this.trailInstanceGroup.moveInstance(i, 0, FIREWORK_CONFIG.ascentSpeed * delta);
                }
            }

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
        switch (this.trailEffect) {
            case 'sparkle':
                const spread = 0.3;
                const offsetX = x + spread * Math.random();
                const offsetY = y + spread * Math.random();

                this.trailInstanceGroup.addInstance(
                    new Renderer2D.Vector2(offsetX, offsetY),
                    0,
                    new Renderer2D.Vector2(FIREWORK_CONFIG.rocketTrailSize, FIREWORK_CONFIG.rocketTrailSize),
                    new Renderer2D.Color(1, 1, 1, 1)
                );

                this.trailParticles.push({
                    index: this.lastTrailIndex,
                    createdAt: Date.now(),
                    initialOpacity: 1,
                });

                this.lastTrailIndex++;
                break;

            case 'rainbow':
                const hue = (Date.now() * 0.001) % 1;
                const color = this._hslToRgb(hue, 1, 0.5);

                this.trailInstanceGroup.addInstance(
                    new Renderer2D.Vector2(x, y),
                    0,
                    new Renderer2D.Vector2(FIREWORK_CONFIG.rocketTrailSize, FIREWORK_CONFIG.rocketTrailSize),
                    new Renderer2D.Color(color.r, color.g, color.b, 1)
                );

                this.trailParticles.push({
                    index: this.lastTrailIndex,
                    createdAt: Date.now(),
                    initialOpacity: 1,
                    hue: hue
                });

                this.lastTrailIndex++;
                break;

            case 'comet':
                this.trailInstanceGroup.addInstance(
                    new Renderer2D.Vector2(x, y),
                    0,
                    new Renderer2D.Vector2(FIREWORK_CONFIG.rocketTrailSize, FIREWORK_CONFIG.rocketTrailSize),
                    new Renderer2D.Color(1, 0.67, 0, 1)
                );

                this.trailParticles.push({
                    index: this.lastTrailIndex,
                    createdAt: Date.now(),
                    initialOpacity: 1,
                    scale: 1.0
                });

                this.lastTrailIndex++;
                break;

            case 'fade':
            default:
                this.trailInstanceGroup.addInstance(
                    new Renderer2D.Vector2(x, y),
                    0,
                    new Renderer2D.Vector2(FIREWORK_CONFIG.rocketTrailSize, FIREWORK_CONFIG.rocketTrailSize),
                    new Renderer2D.Color(1, 1, 1, 0.8)
                );

                this.trailParticles.push({
                    index: this.lastTrailIndex,
                    createdAt: Date.now(),
                    initialOpacity: 0.8
                });

                this.lastTrailIndex++;
                break;
        }
    }

    updateTrailParticles(delta) {
        const now = Date.now();
        const flickerSpeed = 8;

        this.trailParticles.forEach((particle, index) => {
            const age = index / this.trailParticles.length;
            switch (this.trailEffect) {
                case 'sparkle':
                    this.trailInstanceGroup.updateInstanceScale(
                        particle.index,
                        FIREWORK_CONFIG.rocketTrailSize * (Math.random() * 0.8) * (age *2) + 0.3,
                        FIREWORK_CONFIG.rocketTrailSize * (Math.random() * 0.8) * (age *2) + 0.3
                    );
                    this.trailInstanceGroup.updateInstanceColor(
                        particle.index,
                        1, 1, 1,
                        particle.initialOpacity
                    );
                    break;

                case 'rainbow':
                    const groupPhase = (now * flickerSpeed + index * 1000) / 1000;
                    const groupHue = (groupPhase + index * 0.1) % 1;
                    const color = this._hslToRgb(groupHue, 1, 0.5);

                    this.trailInstanceGroup.updateInstanceColor(
                        particle.index,
                        color.r, color.g, color.b,
                        particle.initialOpacity * (age)
                    );
                    break;

                case 'comet':
                    const scale = FIREWORK_CONFIG.rocketTrailSize * (1.0 - (age * 0.5));
                    this.trailInstanceGroup.updateInstanceScale(
                        particle.index,
                        scale,
                        scale
                    );
                    this.trailInstanceGroup.updateInstanceColor(
                        particle.index,
                        1, 0.67, 0,
                        particle.initialOpacity * (age)
                    );
                    break;

                case 'fade':
                default:
                    this.trailInstanceGroup.updateInstanceColor(
                        particle.index,
                        1, 1, 1,
                        particle.initialOpacity * (age)
                    );
                    break;
            }
        });
    }

    _hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return { r, g, b };
    }

    explode() {
        this.alive = false;
        if (this.rocket) this.renderer.removeNormalShape(this.rocket);
        if (this.trailInstanceGroup) { this.renderer.removeInstancedGroup(this.trailInstanceGroup); }

        this.trailParticles = [];

        this.components.forEach(component => {
            const particleCount = Math.floor(FIREWORK_CONFIG.particleDensity);
            const pattern = component.pattern;
            const gravity = FIREWORK_CONFIG.gravityMultiplier * FIREWORK_CONFIG.patternGravities[pattern] || FIREWORK_CONFIG.patternGravities.default;
            const friction = FIREWORK_CONFIG.patternFriction[pattern] + FIREWORK_CONFIG.baseFriction;
            const speed = FIREWORK_CONFIG.baseSpeed;

            const primaryHex = component.color || '#FFFFFF';
            const parsedPrimaryColor = this._hexToRgbA(primaryHex);
            const color = new Renderer2D.Color(parsedPrimaryColor.r, parsedPrimaryColor.g, parsedPrimaryColor.b, parsedPrimaryColor.a);
            const parsedGradientFinalColor = this._hexToRgbA(component.gradientFinalColor || primaryHex);
            const gradientFinalColor = new Renderer2D.Color(parsedGradientFinalColor.r, parsedGradientFinalColor.g, parsedGradientFinalColor.b, parsedGradientFinalColor.a);
            let secondaryColor;
            if (component.secondaryColor) {
                const parsedSecondaryColor = this._hexToRgbA(component.secondaryColor);
                secondaryColor = new Renderer2D.Color(parsedSecondaryColor.r, parsedSecondaryColor.g, parsedSecondaryColor.b, parsedSecondaryColor.a);
            } else {
                secondaryColor = new Renderer2D.Color(1, 0, 0, 0.9);
            }

            const size = FIREWORK_CONFIG.particleSize * component.size;
            const rocketPos = this.rocket.position.clone();
            const velocity = new Renderer2D.Vector2();
            const acceleration = new Renderer2D.Vector2();
            const shape = component.shape;
            const spread = component.spread;

            switch (pattern) {
                case 'solidsphere':
                case 'spherical':
                    {
                        const layers = pattern === 'solidsphere' ? 6 : 1;
                        const radius = pattern === 'solidsphere' ? spread * 0.5 : spread * 1.5;
                        for (let layer = 0; layer < layers; layer++) {
                            // distribute less particles in the inner layers from the max particles count
                            const particlesThisLayer = (particleCount / layers) * (layer + 1 / layers);
                            const risingVelocity = pattern === 'solidsphere' ? 150 : 50;

                            for (let i = 0; i < particlesThisLayer; i++) {
                                const angle = (i / particlesThisLayer) * Math.PI * 2;
                                const magnitude = (speed * (0.8 + Math.random() * 0.4) * radius) * (layer + 1 / layers);
                                velocity.set(
                                    Math.cos(angle) * magnitude,
                                    Math.sin(angle) * magnitude + risingVelocity
                                );
                                const index = this.particleSystem.addParticle(
                                    rocketPos.clone(),
                                    velocity.clone(),
                                    color,
                                    size,
                                    component.lifetime,
                                    gravity * (0.8 + Math.random() * 0.4),
                                    shape,
                                    acceleration,
                                    component.enableTrail,
                                    component.trailLength,
                                    component.trailWidth,
                                    friction,
                                    component.glowStrength,
                                    component.blurStrength,
                                    null,
                                    component.enableColorGradient,
                                    gradientFinalColor,
                                    component.gradientStartTime,
                                    component.gradientDuration
                                );
                                if (index !== -1) this.particles[shape].add(index);
                            }
                        }
                        break;
                    }
                case 'ring':
                    {
                        for (let i = 0; i < particleCount; i++) {
                            const angle = (i / particleCount) * Math.PI * 2;
                            const magnitude = speed * spread * 3;
                            const risingVelocity = 100;
                            velocity.set(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude + risingVelocity
                            );
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity * (0.9 + Math.random() * 0.1),
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'burst':
                    {
                        for (let i = 0; i < particleCount; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const magnitude = speed * Math.random() * spread * 2;
                            const risingVelocity = 100;
                            velocity.set(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude + risingVelocity
                            );
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity,
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'palm':
                    {
                        const branches = 8;
                        const particlesPerBranch = Math.floor(particleCount / branches);
                        for (let i = 0; i < particleCount; i++) {
                            const branch = i % branches;
                            const particleInBranch = Math.floor(i / branches);
                            const baseAngle = (branch / branches) * Math.PI * 2;
                            const angleSpread = 0.3 * (particleInBranch / particlesPerBranch);
                            const angle = baseAngle + (Math.random() - 0.5) * angleSpread;
                            const magnitude = speed * (1 + particleInBranch / particlesPerBranch) * spread * 2.5;
                            velocity.set(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude
                            );
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity,
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'willow':
                    {
                        const emissionAngle = 1;
                        for (let i = 0; i < particleCount; i++) {
                            const angleOffset = (Math.random() * 1.2 - 0.5) * emissionAngle;
                            const angle = (-Math.PI / 2) + angleOffset;
                            const horizontalDrift = (Math.random() - 0.5) * 30;
                            const initialSpeed = speed * (0.5 + Math.random() * 0.1);
                            velocity.set(
                                (Math.cos(angle) * initialSpeed + horizontalDrift) * spread,
                                -Math.sin(angle) * initialSpeed * 0.8
                            );
                            const initialOffset = new Renderer2D.Vector2(i * 0.2 + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20);
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone().add(initialOffset),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity,
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'christmasTree':
                    {
                        const baseWidth = spread * 2;
                        const baseHeight = spread * 3;
                        const trunkWidth = baseWidth * 0.2;
                        const trunkHeight = baseHeight * 0.2;
                        const triangleScales = [1, 0.7, 0.4];
                        const triangleHeights = [baseHeight * 0.4, baseHeight * 0.3, baseHeight * 0.2];
                        const horizontalLinesCount = 3;

                        //  trunk
                        const trunkParticles = Math.floor(particleCount * 0.2);
                        const trunkRows = Math.floor(Math.sqrt(trunkParticles));
                        const trunkCols = Math.floor(trunkParticles / trunkRows);

                        for (let row = 0; row < trunkRows; row++) {
                            for (let col = 0; col < trunkCols; col++) {
                                const x = (col / (trunkCols - 1) - 0.5) * trunkWidth;
                                const y = (row / trunkRows) * trunkHeight;
                                velocity.set(
                                    x * speed,
                                    y * speed
                                ); 
                                const index = this.particleSystem.addParticle(
                                    rocketPos.clone(),
                                    velocity.clone(),
                                    secondaryColor,
                                    size,
                                    component.lifetime,
                                    gravity,
                                    shape,
                                    acceleration,
                                    component.enableTrail,
                                    component.trailLength,
                                    component.trailWidth,
                                    friction,
                                    component.glowStrength,
                                    component.blurStrength,
                                    null,
                                    component.enableColorGradient,
                                    gradientFinalColor,
                                    component.gradientStartTime,
                                    component.gradientDuration
                                );
                                if (index !== -1) this.particles[shape].add(index);
                            }
                        }

                        const triangleParticles = Math.floor((particleCount - trunkParticles) / triangleScales.length);
                        const edgeParticles = Math.floor(Math.sqrt(triangleParticles) * 2);

                        let currentBaseY = trunkHeight;

                        triangleScales.forEach((scale, triangleIndex) => {
                            const triangleWidth = baseWidth * scale;
                            const triangleHeight = triangleHeights[triangleIndex];
                            const baseY = currentBaseY;
                            // left edge
                            for (let i = 0; i < edgeParticles; i++) {
                                const progress = i / (edgeParticles - 1);
                                const x = (-0.5 + progress * 0.5) * triangleWidth;
                                const y = baseY + progress * triangleHeight;
                                velocity.set(
                                    x * speed,
                                    y * speed
                                ); 
                                const index = this.particleSystem.addParticle(
                                    rocketPos.clone(),
                                    velocity.clone(),
                                    color,
                                    size,
                                    component.lifetime,
                                    gravity * (0.8 + Math.random() * 0.4),
                                    shape,
                                    acceleration,
                                    component.enableTrail,
                                    component.trailLength,
                                    component.trailWidth,
                                    friction,
                                    component.glowStrength,
                                    component.blurStrength,
                                    null,
                                    component.enableColorGradient,
                                    gradientFinalColor,
                                    component.gradientStartTime,
                                    component.gradientDuration
                                );
                                if (index !== -1) this.particles[shape].add(index);
                            }                       
                             //  right edge
                            for (let i = 0; i < edgeParticles; i++) {
                                const progress = i / (edgeParticles - 1);
                                const x = (0.5 - progress * 0.5) * triangleWidth;
                                const y = baseY + progress * triangleHeight;
                                velocity.set(
                                    x * speed,
                                    y * speed
                                );
                                const index = this.particleSystem.addParticle(
                                    rocketPos.clone(),
                                    velocity.clone(),
                                    color,
                                    size,
                                    component.lifetime,
                                    gravity * (0.9 + Math.random() * 0.1),
                                    shape,
                                    acceleration,
                                    component.enableTrail,
                                    component.trailLength,
                                    component.trailWidth,
                                    friction,
                                    component.glowStrength,
                                    component.blurStrength,
                                    null,
                                    component.enableColorGradient,
                                    gradientFinalColor,
                                    component.gradientStartTime,
                                    component.gradientDuration
                                );
                                if (index !== -1) this.particles[shape].add(index);
                            }

                            //  horizontal lines
                            for (let line = 0; line <= horizontalLinesCount; line++) {
                                const lineProgress = line / horizontalLinesCount;
                                const y = baseY + lineProgress * triangleHeight;
                                const currentWidth = triangleWidth * (1 - lineProgress);
                                const lineParticles = Math.floor(edgeParticles * 0.5 * (1 - lineProgress) + 3); for (let i = 0; i < lineParticles; i++) {
                                    const x = ((i / (lineParticles - 1)) - 0.5) * currentWidth;
                                    velocity.set(
                                        x * speed,
                                        y * speed
                                    );
                                    const index = this.particleSystem.addParticle(
                                        rocketPos.clone(),
                                        velocity.clone(),
                                        color,
                                        size,
                                        component.lifetime,
                                        gravity,
                                        shape,
                                        acceleration,
                                        component.enableTrail,
                                        component.trailLength,
                                        component.trailWidth,
                                        friction,
                                        component.glowStrength,
                                        component.blurStrength,
                                        null,
                                        component.enableColorGradient,
                                        gradientFinalColor,
                                        component.gradientStartTime,
                                        component.gradientDuration
                                    );
                                    if (index !== -1) this.particles[shape].add(index);
                                }
                            }

                            currentBaseY += triangleHeight;
                        });
                        break;
                    }
                case 'heart':
                    {
                        const heartScale = spread;
                        for (let i = 0; i < particleCount; i++) {
                            const t = (i / particleCount) * Math.PI * 2;
                            const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
                            const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                            const angle = Math.atan2(yOffset, xOffset);
                            const magnitude = speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.15;
                            const risingVelocity = 300;
                            velocity.set(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude + risingVelocity
                            ); 
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity * (0.9 + Math.random() * 0.1),
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'brokenHeart':
                    {
                        const heartScale = spread;
                        const pivotOffset = new Renderer2D.Vector2(0, -heartScale * 30);

                        for (let i = 0; i < particleCount; i++) {
                            const t = (i / particleCount) * Math.PI * 2;
                            const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
                            const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

                            const particleOffset = new Renderer2D.Vector2(xOffset, yOffset);

                            const angle = Math.atan2(yOffset, xOffset);
                            const magnitude = speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.1;
                            const unbrokenHeartVelocity = new Renderer2D.Vector2(
                                Math.cos(angle) * magnitude,
                                Math.sin(angle) * magnitude
                            );

                            const pivotToParticle = particleOffset.clone();
                            pivotToParticle.subtract(pivotOffset);
                            const rotation = new Renderer2D.Vector2(pivotToParticle.y, -pivotToParticle.x);

                            const sign = (xOffset > 0) ? 2 : -2;
                            const rotationSpeed = sign;
                            rotation.scale(rotationSpeed); 
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                unbrokenHeartVelocity,
                                color,
                                size,
                                component.lifetime,
                                gravity * 1.3,
                                shape,
                                rotation,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'brocade':
                case 'star':
                    {
                        const spikes = pattern === 'brocade' ? 10 : 5;
                        const outerRadius = speed * spread *1.5;
                        const innerRadius = speed * 0.5 * spread*1.5;
                        const pointsPerStar = spikes * 2;
                        const risingVelocity = 30;
                        for (let i = 0; i < particleCount; i++) {
                            const starPoint = i % pointsPerStar;
                            const starCopy = Math.floor(i / pointsPerStar);
                            let radius = (starPoint % 2 === 0) ? outerRadius : innerRadius;
                            let angle = (starPoint / pointsPerStar) * Math.PI * 2;

                            if (i > pointsPerStar && (starPoint % 2 === 0)) {
                                radius = outerRadius * (1 + (Math.random() * 0.2 - 0.1));
                            }

                            const radiusVariation = 1 + (Math.random() * 0.5 - 0.2) * (starCopy > 0 ? 1 : 0);
                            const angleVariation = (Math.random() * 0.2 - 0.2) * (starCopy > 0 ? 1 : 0); velocity.set(
                                Math.cos(angle + angleVariation) * radius * radiusVariation,
                                Math.sin(angle + angleVariation) * radius * radiusVariation + risingVelocity
                            );

                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                velocity.clone(),
                                color,
                                size,
                                component.lifetime,
                                gravity,
                                shape,
                                acceleration,
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'spinner':
                    {
                        const explosionCenter = this.rocket.position.clone();
                        const numArms = 20;
                        const particlesPerArm = Math.floor(particleCount / numArms);
                        for (let i = 0; i < particleCount; i++) {
                            const armIndex = Math.floor(i / particlesPerArm);
                            let currentAngle = (armIndex / numArms) * Math.PI * 2 + (Math.random() - 0.5) * 10;
                            const maxRadius = spread * 50 + (i % particlesPerArm) * 10;

                            const radialSpeed = spread * 30 + (Math.random() - 0.5) * 10;
                            let currentRadius = 0;

                            const spinSpeed = 3;

                            const updateFn = (pState, delta) => {
                                // soft ease into  max radius
                                currentRadius = currentRadius + (maxRadius - currentRadius) * delta;
                                if (currentRadius > - maxRadius) {
                                    currentRadius += radialSpeed * delta * 0.1;
                                }
                                currentRadius += Math.random() * 200 * delta;
                                currentAngle += spinSpeed * delta;

                                pState.position.x = explosionCenter.x + Math.cos(currentAngle) * currentRadius;
                                pState.position.y = explosionCenter.y + Math.sin(currentAngle) * currentRadius;
                            };
                            const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                new Renderer2D.Vector2(0, 0),
                                color,
                                size,
                                component.lifetime,
                                gravity * 100,
                                shape,
                                new Renderer2D.Vector2(),
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                updateFn,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'spinningtails':
                    {
                        const explosionCenter = this.rocket.position.clone();
                        const numArms = 7;
                        const particlesPerArm = Math.floor(particleCount / numArms);

                        for (let i = 0; i < particleCount; i++) {
                            const armIndex = Math.floor(i / particlesPerArm);
                            let currentAngle = (armIndex / numArms) * Math.PI * 2;

                            const radialSpeed = speed * 2 * (0.1 + Math.random() * 0.4);
                            let currentRadius = (i % particlesPerArm) * 0.02 * spread;
                            const maxRadius = spread * 1000 + (i % particlesPerArm) * 5;
                            const spinSpeed = 2.5;

                            const updateFn = (pState, delta) => {
                                currentRadius += pState.velocity.length() * delta * (i + 1 % particlesPerArm + 1) * 0.02;
                                if (currentRadius > maxRadius) {
                                    currentRadius = maxRadius;
                                }
                                currentAngle += spinSpeed * delta;

                                pState.position.x = explosionCenter.x + Math.cos(currentAngle + i * 2) * currentRadius;
                                pState.position.y = explosionCenter.y + Math.sin(currentAngle + i * 2) * currentRadius;

                            }; const index = this.particleSystem.addParticle(
                                rocketPos.clone(),
                                new Renderer2D.Vector2(10, 10),
                                color,
                                size,
                                component.lifetime,
                                gravity * 100,
                                shape,
                                new Renderer2D.Vector2(),
                                component.enableTrail,
                                component.trailLength,
                                component.trailWidth,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                updateFn,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                        break;
                    }
                case 'helix':
                    const helixRadius = 3 * spread;
                    const riseSpeed = speed * 0.1 * spread;
                    const rotationSpeed = 2;
                    const particlesPerStream = 100;
                    const verticalSpacing = 0.7 * spread;
                    const spreadFactor = 0.1;

                    for (let stream = 0; stream < 2; stream++) {
                        const streamOffset = stream * Math.PI;
                        for (let i = 0; i < particlesPerStream; i++) {
                            const t = (i / particlesPerStream) * Math.PI * 2;
                            const angle = t + streamOffset;

                            const randomSpread = (Math.random() - 0.5) * spreadFactor;


                            velocity.set(
                                -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread),
                                riseSpeed * 10
                            );
                            const particleColor = new Renderer2D.Color();
                            if (stream === 1) {
                                particleColor.copy(secondaryColor);
                            } else {
                                particleColor.copy(color);
                            }
                            acceleration.set(
                                -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) * 3,
                                riseSpeed * (1 + randomSpread) - i * verticalSpacing
                            ); 
                            const index = this.particleSystem.addParticle(
                                rocketPos,
                                velocity,
                                particleColor,
                                size,
                                component.lifetime,
                                gravity * 0.2,
                                shape,
                                acceleration,
                                false,
                                0,
                                0,
                                friction,
                                component.glowStrength,
                                component.blurStrength,
                                null,
                                component.enableColorGradient,
                                gradientFinalColor,
                                component.gradientStartTime,
                                component.gradientDuration
                            );
                            if (index !== -1) this.particles[shape].add(index);
                        }
                    }
                    break;

                default:
                    for (let i = 0; i < particleCount; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const magnitude = speed * spread;
                        velocity.set(
                            Math.cos(angle) * magnitude,
                            Math.sin(angle) * magnitude
                        ); const index = this.particleSystem.addParticle(
                            rocketPos.clone(),
                            velocity.clone(),
                            color,
                            size,
                            component.lifetime,
                            gravity,
                            shape,
                            acceleration,
                            component.enableTrail,
                            component.trailLength,
                            component.trailWidth,
                            friction,
                            component.glowStrength,
                            component.blurStrength,
                            null,
                            component.enableColorGradient,
                            gradientFinalColor,
                            component.gradientStartTime,
                            component.gradientDuration
                        );
                        if (index !== -1) this.particles[shape].add(index);
                    }
            }
        });
        this.exploded = true;
    }

    dispose() {
        if (this.rocket) {
            this.renderer.removeNormalShape(this.rocket);
            this.rocket = null;
        }

        if (this.trailInstanceGroup) {
            this.renderer.removeInstancedGroup(this.trailInstanceGroup);
            this.trailInstanceGroup = null;
        }

        this.trailParticles = [];

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape].clear();
        });

        this.alive = false;
    }
}

export default Firework;
