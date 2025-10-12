import { FIREWORK_CONFIG, GAME_BOUNDS } from '../config/config.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { recipeMap } from './patterns/index.js';

class Firework {
    constructor(x, y, components, renderer, trailEffect, particleSystem, targetY = null) {
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

        const minY = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y;
        const maxY = GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y;

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

    _getFirstComponentColor() {
        if (this.components && this.components.length > 0 && this.components[0].color) {
            return this._hexToRgbA(this.components[0].color);
        }
        return { r: 1, g: 1, b: 1, a: 1 }; 
    }

    createRocket(x, y) {
        const geometry = Renderer2D.buildTriangle(6, 10);
        
        const firstComponentColor = this._getFirstComponentColor();
        const rocketColor = new Renderer2D.Color(firstComponentColor.r, firstComponentColor.g, firstComponentColor.b, 1);
        
        const rocket = this.renderer.createNormalShape({
            vertices: geometry.vertices,
            indices: geometry.indices,
            color: rocketColor,
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
                const firstComponentColor = this._getFirstComponentColor();
                this.trailInstanceGroup.addInstance(
                    new Renderer2D.Vector2(x, y),
                    0,
                    new Renderer2D.Vector2(FIREWORK_CONFIG.rocketTrailSize, FIREWORK_CONFIG.rocketTrailSize),
                    new Renderer2D.Color(firstComponentColor.r, firstComponentColor.g, firstComponentColor.b, 0.8)
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
                    const firstComponentColor = this._getFirstComponentColor();
                    this.trailInstanceGroup.updateInstanceColor(
                        particle.index,
                        firstComponentColor.r, firstComponentColor.g, firstComponentColor.b,
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
        this.exploded = true;
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
            this.particleSystem.addGlow(this.rocket.position, 
                                        color,  
                                        component.glowStrength,
                                        500* component.glowStrength,
                                        0.6,
                                        component.glowStrength,
                                        0);

            const sharedCtx = {
                rocketPos,
                particleCount,
                speed,
                spread,
                gravity,
                friction,
                size,
                component,
                secondaryColor,
                primaryColor: color,
            };

            const recipe = recipeMap[pattern];
            if (recipe) {
                const total = (typeof recipe.count === 'function') ? recipe.count(sharedCtx) : recipe.count;
                for (let i = 0; i < total; i++) {
                    const initial = recipe.calcInitialState(i, { ...sharedCtx, index: i, total });

                    const pos = initial.pos || rocketPos.clone();
                    const vel = initial.vel || new Renderer2D.Vector2();
                    const accel = initial.accel || new Renderer2D.Vector2();
                    const updateFn = initial.updateFn || null;
                    const particleColor = initial.color || color;
                    const g = (initial.gravity !== undefined) ? initial.gravity : gravity;

                    const index = this.particleSystem.addParticle(
                        pos.clone(),
                        vel.clone(),
                        particleColor,
                        size,
                        component.lifetime,
                        g,
                        shape,
                        accel,
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
                return;
            }
        });
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
