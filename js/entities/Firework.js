import { FIREWORK_CONFIG, GAME_BOUNDS, PARTICLE_TYPES } from '../config/config.js';
import InstancedParticleSystem from '../particles/InstancedParticleSystem.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { recipeMap } from './patterns/index.js';

class Firework {
    constructor(x, y, components, renderer, particleSystem, targetY = null, audioManager = null) {
        this.components = components;
        this.renderer = renderer;
        this.particleSystem = particleSystem;
        this.audioManager = audioManager;
        this.exploded = false;
        this.alive = true;
        this.particles = {};

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape] = new Set();
        });

        this.rocket = this.createRocket(x, y);

        // Initialize per-rocket tilt/jitter configuration
        if (FIREWORK_CONFIG.rocketTilt && FIREWORK_CONFIG.rocketTilt.enabled) {
            const maxTiltDeg = FIREWORK_CONFIG.rocketTilt.maxAngleDeg || 0;
            const maxJitterDegPerSec = FIREWORK_CONFIG.rocketTilt.maxJitterChangeDegPerSecond || 0;
            this._maxTiltRad = (maxTiltDeg * Math.PI) / 180.0;
            this._maxJitterRadPerSec = (maxJitterDegPerSec * Math.PI) / 180.0;
            this.currentTiltRad = (Math.random() * 2 - 1) * this._maxTiltRad;
            if (this.rocket) this.rocket.rotation = this.currentTiltRad;
        } else {
            this._maxTiltRad = 0;
            this._maxJitterRadPerSec = 0;
            this.currentTiltRad = 0;
        }

        const minY = GAME_BOUNDS.WORLD_MIN_EXPLOSION_Y;
        const maxY = GAME_BOUNDS.WORLD_MAX_EXPLOSION_Y;

        this.targetY = targetY || minY + Math.random() * (maxY - minY);

        // Estimate time to explode (use vertical component if tilted)
        const verticalAscentSpeed = FIREWORK_CONFIG.rocketTilt && FIREWORK_CONFIG.rocketTilt.enabled
            ? FIREWORK_CONFIG.ascentSpeed * Math.cos(this.currentTiltRad)
            : FIREWORK_CONFIG.ascentSpeed;
        const timeToExplode = (this.targetY - y) / verticalAscentSpeed;
        if (this.audioManager) {
            const bounds = this.renderer.getVisibleWorldBounds();
            if (x >= bounds.left && x <= bounds.right && y >= bounds.bottom && y <= bounds.top) {
                this.audioManager.playFireworkSound(timeToExplode);
            }
        }

        this.rocketTrailTimer = 0;
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
            zIndex: -20,
            blendMode: Renderer2D.BlendMode.ADDITIVE,
            isStroke: false
        });

        return rocket;
    }

    update(delta) {
        if (!this.exploded) {
            // Update tilt jitter
            if (this._maxTiltRad > 0 && this._maxJitterRadPerSec > 0) {
                const maxChange = this._maxJitterRadPerSec * delta;
                this.currentTiltRad += (Math.random() * 2 - 1) * maxChange;
                // clamp
                if (this.currentTiltRad > this._maxTiltRad) this.currentTiltRad = this._maxTiltRad;
                if (this.currentTiltRad < -this._maxTiltRad) this.currentTiltRad = -this._maxTiltRad;
                if (this.rocket) this.rocket.rotation = this.currentTiltRad;
            }

            // Move rocket along its tilt angle (angle is relative to vertical)
            const ascent = FIREWORK_CONFIG.ascentSpeed * delta;
            const dx = Math.sin(this.currentTiltRad) * ascent;
            const dy = Math.cos(this.currentTiltRad) * ascent;
            this.rocket.position.x += dx;
            this.rocket.position.y += dy;

            if (FIREWORK_CONFIG.rocketTrails.enabled) {
                this.rocketTrailTimer += delta;

                if (this.rocketTrailTimer >= FIREWORK_CONFIG.rocketTrails.spawnRate) {
                    this.rocketTrailTimer = 0;

                    for (let i = 0; i < FIREWORK_CONFIG.rocketTrails.perBurst; i++) {
                        const rocketColor = this._getFirstComponentColor();
                        const trailColor = new Renderer2D.Color(
                            rocketColor.r,
                            rocketColor.g,
                            rocketColor.b,
                            rocketColor.a * FIREWORK_CONFIG.rocketTrails.alphaMultiplier
                        );

                        const spread = FIREWORK_CONFIG.rocketTrails.velocitySpread;
                        const randomVelX = (Math.random() - 0.5) * 2 * spread;
                        const randomVelY = (Math.random() - 0.5) * 2 * spread;
                        const randomXOffset = (Math.random() - 0.5) * 10; 
                        this.particleSystem.addParticle(
                            this.rocket.position.clone().add(new Renderer2D.Vector2(randomXOffset, 0)),
                            new Renderer2D.Vector2(randomVelX, randomVelY),
                            trailColor,
                            FIREWORK_CONFIG.rocketTrails.size,
                            FIREWORK_CONFIG.rocketTrails.lifetime,
                            FIREWORK_CONFIG.rocketTrails.gravity,
                            FIREWORK_CONFIG.rocketTrails.shape,
                            new Renderer2D.Vector2(0, 0),
                            FIREWORK_CONFIG.rocketTrails.friction,
                            0, // no glow
                            0, // no blur
                            null, // no update function
                            false, // no gradient
                            null,
                            0.0,
                            1.0,
                            PARTICLE_TYPES.ROCKET_TRAIL
                        );
                    }
                }
            }

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



        this.components.forEach(component => {
            const pattern = component.pattern;
            const particleCount = Math.floor(FIREWORK_CONFIG.patternParticleCounts[pattern] || FIREWORK_CONFIG.patternParticleCounts.default);
            const gravity = FIREWORK_CONFIG.gravityMultiplier * FIREWORK_CONFIG.patternGravities[pattern] || FIREWORK_CONFIG.patternGravities.default;
            const friction = (FIREWORK_CONFIG.patternFriction[pattern] !== undefined ? FIREWORK_CONFIG.patternFriction[pattern] : FIREWORK_CONFIG.patternFriction.default) + FIREWORK_CONFIG.baseFriction;
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
            const randomSeed = Math.random() * 2 - 1;
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
                randomSeed
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
                        friction,
                        updateFn,
                        component.enableColorGradient,
                        gradientFinalColor,
                        component.gradientStartTime,
                        component.gradientDuration,
                        PARTICLE_TYPES.FIREWORK_EXPLOSION
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

        FIREWORK_CONFIG.supportedShapes.forEach(shape => {
            this.particles[shape].clear();
        });

        this.alive = false;
    }
}

export default Firework;
