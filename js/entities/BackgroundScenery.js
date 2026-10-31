import { Color } from '../rendering/Renderer.js';
import { PARTICLE_TYPES } from '../config/ParticleConfig.js';
import { createRng } from '../utils/random.js';
import { buildPrimitiveLandmarks } from './PrimitiveLandmarks.js';
import BackgroundWater from './BackgroundWater.js';

// Broad, irregular silhouettes share the launchers' simple geometry. Geometry
// stays cached while material lighting and the river's instanced currents move.
export default class BackgroundScenery {
    constructor(background) {
        this.background = background;
        this.renderer = background.renderer;
        this.config = background.config;
        this.lightSurfaces = [];
        this.waterBands = [];
        this.emitters = [];
        this.time = 0;
        this.waterMotion = null;
    }

    build() {
        this._buildMountains();
        this._buildLandmarks();
        this._buildWater();
        this._buildShore();
    }

    _polygon(points, color, zIndex, reflectivity = 0.5, normalX = 0) {
        const shape = this.background._addPolygon(points, new Color(color.r, color.g, color.b, color.a ?? 1), zIndex);
        if (zIndex < this.config.zIndex.water) {
            shape.reflectsInWater = true;
            shape.reflectionOpacity = 0.22;
        }
        let x = 0;
        let y = 0;
        for (let i = 0; i < points.length; i += 2) {
            x += points[i];
            y += points[i + 1];
        }
        this.lightSurfaces.push({ shape, baseColor: shape.color.clone(),
            x: x / (points.length / 2), y: y / (points.length / 2), reflectivity, normalX });
        return shape;
    }

    _rect(x, y, width, height, color, zIndex, reflectivity = 0.6) {
        return this._polygon([x, y, x + width, y, x + width, y + height, x, y + height],
            color, zIndex, reflectivity);
    }

    _shade(color, amount) {
        return { r: color.r * amount, g: color.g * amount, b: color.b * amount, a: 1 };
    }

    _buildMountains() {
        const { mountains, world, water, zIndex } = this.config;
        if (!mountains?.enabled) return;
        const rng = createRng(this.config.seed ^ 0x47A9C3);
        const baseY = water?.surfaceY ?? world.horizonY;
        for (let layer = 0; layer < 2; layer++) {
            const far = layer === 0;
            const spacing = far ? mountains.farSpacing : mountains.nearSpacing;
            const color = far ? mountains.farColor : mountains.nearColor;
            const minHeight = far ? mountains.farHeightMin : mountains.nearHeightMin;
            const maxHeight = far ? mountains.farHeightMax : mountains.nearHeightMax;
            const z = far ? zIndex.mountainsFar : zIndex.mountainsNear;
            for (let x = world.xMin - spacing; x < world.xMax + spacing; x += spacing) {
                const width = spacing * (1.3 + rng() * 0.45);
                const height = minHeight + rng() * (maxHeight - minHeight);
                // Broad shoulders, saddles and broken summits read as natural
                // ridges without adding fine detail or a symmetrical apex.
                const profiles = [
                    [[0, 0], [.10, .22], [.23, .60], [.35, .68], [.44, .92], [.54, 1], [.64, .89], [.73, .56], [.86, .43], [1, 0]],
                    [[0, 0], [.12, .29], [.25, .79], [.34, .84], [.44, .70], [.57, .92], [.66, .88], [.76, .46], [.88, .37], [1, 0]],
                    [[0, 0], [.10, .18], [.23, .49], [.35, .54], [.47, .86], [.57, .89], [.68, .68], [.77, .72], [.89, .31], [1, 0]],
                ];
                const profile = profiles[Math.floor(rng() * profiles.length)];
                const ridge = profile.map(([px, py], index) => [
                    x + width * (px + (index > 0 && index < profile.length - 1 ? (rng() - .5) * .035 : 0)),
                    baseY + height * (py + (py > 0 ? (rng() - .5) * .08 : 0)),
                ]);
                const shape = this._polygon(ridge.flat(), color, z, far ? .25 : .43, -.25);
                // Give large faces a broad sampling footprint, so a nearby
                // flash doesn't repaint an entire distant mountain uniformly.
                const surface = this.lightSurfaces.at(-1);
                surface.width = width;
                surface.height = height;
                surface.shape = shape;
                this._polygon([...ridge.slice(2, 5), [x + width * .52, baseY + height * .27],
                    [x + width * .31, baseY + height * .17]].flat(),
                    this._shade(color, 1.08), z, far ? .28 : .48, -.5);
                this._polygon([...ridge.slice(5, 8), [x + width * .83, baseY + height * .14],
                    [x + width * .62, baseY + height * .25]].flat(),
                    this._shade(color, .88), z, far ? .2 : .34, .5);
            }
        }
    }

    _buildLandmarks() {
        buildPrimitiveLandmarks(this);
    }

    _buildWater() {
        const { water, world, zIndex } = this.config;
        if (!water?.enabled) return;
        for (let i = 0; i < water.bands; i++) {
            const t0 = i / water.bands;
            const t1 = (i + 1) / water.bands;
            const color = this.background._lerpColor(water.bottomColor, water.topColor, (t0 + t1) / 2);
            const shape = this.background._addRect(world.xMin,
                water.bottomY + (water.surfaceY - water.bottomY) * t0, world.xMax,
                water.bottomY + (water.surfaceY - water.bottomY) * t1, color, zIndex.water);
            this.waterBands.push(shape);
            shape.isWaterSurface = true;
        }
        this.reflection = { left: world.xMin, right: world.xMax,
            surfaceY: water.surfaceY, bottomY: water.bottomY, zIndex: zIndex.waterReflections,
            verticalScale: water.reflectionScale, opacity: water.reflectionOpacity, time: 0 };
        this.renderer.setWaterReflection?.(this.reflection);
        this.waterMotion = new BackgroundWater(this);
    }

    _buildShore() {
        const { world, water, ground, zIndex } = this.config;
        if (!water?.enabled) return;
        const rng = createRng(this.config.seed ^ 0x81B275);
        const bank = { r: 28 / 255, g: 38 / 255, b: 48 / 255, a: 1 };
        const front = ground.rimColor;
        for (let x = world.xMin; x < world.xMax; x += 220) {
            const height = 4 + rng() * 9;
            this._polygon([x, water.surfaceY - 2, x, water.surfaceY + height,
                x + 85, water.surfaceY + height + rng() * 7, x + 220, water.surfaceY + 3,
                x + 220, water.surfaceY - 2], bank, zIndex.landmarks + 0.5, 0.9);
            this._polygon([x, water.bottomY - 3, x + 220, water.bottomY - 3,
                x + 220, water.bottomY + 4, x + 80, water.bottomY + 5 + rng() * 8,
                x, water.bottomY + 3], front, zIndex.shoreline, 1);
        }
    }

    ensureCoverage(bounds) {
        for (const shape of this.waterBands) {
            shape.position.x = bounds.left;
            shape.scale.x = bounds.right - bounds.left;
        }
        if (this.reflection) {
            this.reflection.left = bounds.left;
            this.reflection.right = bounds.right;
            this.renderer.setWaterReflection?.(this.reflection);
        }
        this.waterMotion?.ensureCoverage(bounds);
    }

    _addEmitter(x, y, r, g, b, weight) {
        const settings = this.config.lighting;
        const cellX = Math.floor(x / 240);
        const cellY = Math.floor(y / 200);
        let emitter = this.emitters.find(e => e.cellX === cellX && e.cellY === cellY);
        if (!emitter) {
            if (this.emitters.length >= settings.maxEmitters) return;
            emitter = { cellX, cellY, x: 0, y: 0, r: 0, g: 0, b: 0, weight: 0 };
            this.emitters.push(emitter);
        }
        emitter.x += x * weight;
        emitter.y += y * weight;
        emitter.r += r * weight;
        emitter.g += g * weight;
        emitter.b += b * weight;
        emitter.weight += weight;
    }

    _sampleLights(particleSystem, fireworks) {
        this.emitters.length = 0;
        const settings = this.config.lighting;
        const bounds = this.renderer.getVisibleWorldBounds();
        const inRange = (x, y) => x > bounds.left - settings.radius && x < bounds.right + settings.radius
            && y > (this.config.water?.surfaceY ?? this.config.world.groundY) && y < bounds.top + settings.radius;
        if (particleSystem) {
            // Give bursts first choice of the bounded light pool. A busy set of
            // weaker rocket trails must not crowd out a newly exploding color.
            for (const explosionPass of [true, false]) {
                for (const shape of Object.keys(particleSystem.activeCounts)) {
                    const count = particleSystem.activeCounts[shape];
                    const data = particleSystem.instanceData[shape];
                    const sampleCount = Math.min(count, settings.samplesPerShape);
                    for (let sample = 0; sample < sampleCount; sample++) {
                        const offset = Math.floor(sample * count / sampleCount) * particleSystem.strideFloats;
                        const type = data[offset + particleSystem.particleTypeIdx];
                        const explosion = type === PARTICLE_TYPES.FIREWORK_EXPLOSION;
                        if (explosion !== explosionPass || (!explosion && type !== PARTICLE_TYPES.TRAIL
                            && type !== PARTICLE_TYPES.ROCKET_TRAIL)) continue;
                        const x = data[offset];
                        const y = data[offset + 1];
                        const c = offset + particleSystem.colorIdx;
                        if (!inRange(x, y) || data[c + 3] < 0.03) continue;
                        this._addEmitter(x, y, data[c], data[c + 1], data[c + 2],
                            data[c + 3] * (explosion ? 0.55 : 0.12));
                    }
                }
            }
        }
        for (const firework of fireworks) {
            if (firework.exploded || !firework.rocket) continue;
            const { position, color } = firework.rocket;
            if (inRange(position.x, position.y)) this._addEmitter(position.x, position.y, color.r, color.g, color.b, color.a * 0.35);
        }
        for (const emitter of this.emitters) {
            const inverseWeight = 1 / emitter.weight;
            for (const key of ['x', 'y', 'r', 'g', 'b']) emitter[key] *= inverseWeight;
            emitter.intensity = 1 - Math.exp(-emitter.weight);
        }
    }

    update(deltaTime, particleSystem, fireworks = []) {
        this.time += Math.max(0, deltaTime);
        if (this.reflection) {
            this.reflection.time = this.time;
            this.renderer.setWaterReflection?.(this.reflection);
        }
        const settings = this.config.lighting;
        if (settings?.enabled) this._sampleLights(particleSystem, fireworks);
        else this.emitters.length = 0;
        this.waterMotion?.update(this.time, this.emitters);
        if (!settings?.enabled) return;
        const radiusSquared = settings.radius * settings.radius;
        const attack = 1 - Math.exp(-deltaTime * settings.attack);
        const decay = 1 - Math.exp(-deltaTime * settings.decay);
        for (const surface of this.lightSurfaces) {
            let sumR = 0, sumG = 0, sumB = 0;
            let sumEnergy = 0, maxEnergy = 0;
            for (const emitter of this.emitters) {
                const dx = emitter.x - surface.x;
                const dy = (emitter.y - surface.y) * 0.7;
                const distanceSquared = dx * dx + dy * dy;
                const falloff = Math.max(0, 1 - distanceSquared / radiusSquared);
                let falloffSquared = falloff * falloff;
                if (surface.width) {
                    const offset = surface.width * .27;
                    const left = Math.max(0, 1 - ((dx - offset) ** 2 + dy * dy) / radiusSquared);
                    const right = Math.max(0, 1 - ((dx + offset) ** 2 + dy * dy) / radiusSquared);
                    falloffSquared = falloffSquared * .5 + (left * left + right * right) * .25;
                }
                if (falloffSquared === 0) continue;
                const facing = 0.65 + 0.35 * Math.max(0,
                    (dx * surface.normalX + dy * 0.7) / Math.max(1, Math.sqrt(distanceSquared)));
                const influence = falloffSquared * facing * emitter.intensity;
                // Nearby lights choose the hue. Additional bursts contribute
                // less exposure, so mixed finales retain the night palette.
                const hueInfluence = influence * influence;
                sumR += emitter.r * hueInfluence;
                sumG += emitter.g * hueInfluence;
                sumB += emitter.b * hueInfluence;
                sumEnergy += influence;
                maxEnergy = Math.max(maxEnergy, influence);
            }
            const energy = maxEnergy + .25 * (sumEnergy - maxEnergy);
            const exposure = 1 - Math.exp(-energy * settings.strength);
            const response = Math.min(.78, surface.reflectivity * .7);
            const blend = exposure * response;
            const hueMax = Math.max(sumR, sumG, sumB, .00001);
            const brightness = .30 + .12 * Math.min(1.1, surface.reflectivity);
            const base = surface.baseColor;
            const r = base.r * (1 - blend) + brightness * (.16 + .84 * sumR / hueMax) * blend;
            const g = base.g * (1 - blend) + brightness * (.16 + .84 * sumG / hueMax) * blend;
            const b = base.b * (1 - blend) + brightness * (.16 + .84 * sumB / hueMax) * blend;
            const color = surface.shape.color;
            color.r += (r - color.r) * (r > color.r ? attack : decay);
            color.g += (g - color.g) * (g > color.g ? attack : decay);
            color.b += (b - color.b) * (b > color.b ? attack : decay);
        }
    }

    resetLighting() {
        this.emitters.length = 0;
        for (const { shape, baseColor } of this.lightSurfaces) shape.color.copy(baseColor);
        this.waterMotion?.update(this.time, []);
    }

    dispose() {
        this.renderer.setWaterReflection?.(null);
        this.waterMotion?.dispose();
        this.lightSurfaces.length = 0;
        this.waterBands.length = 0;
        this.emitters.length = 0;
    }
}
