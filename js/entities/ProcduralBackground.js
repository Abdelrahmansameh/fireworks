import { PROCEDURAL_BACKGROUND_CONFIG } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { createRng } from '../utils/random.js';
import BackgroundScenery from './BackgroundScenery.js';

// Stars share a few instanced meshes instead of one draw call per shape.
// Inner-radius ratios snap to buckets so each mesh covers many stars.
const STAR_GROUP_CAPACITY = 1024;
const STAR_RATIO_BUCKETS = 4;
// Stars fill square tiles of N×N cells, one star per cell, so the field stays
// even wherever the camera goes. Tiles are seeded by coordinate and built once.
const STAR_TILE_CELLS = 8;

class ProcduralBackground {
    constructor(renderer, config = PROCEDURAL_BACKGROUND_CONFIG) {
        this.renderer = renderer;
        this.config = config;
        this.shapes = [];
        this.skyBands = [];
        this.coverageBounds = null;
        this.twinkleStars = [];
        this.twinkleTime = 0;
        this.starMeshes = new Map();
        this.starTiles = new Set();
        this.scenery = null;
        this.lightSurfaces = [];
    }

    generate() {
        this.dispose();

        const { world } = this.config;
        const padding = Math.max(1, world.verticalSafeZone ?? 1080);
        this.coverageBounds = {
            left: world.xMin,
            right: world.xMax,
            top: world.skyTopY + padding,
            bottom: world.groundY - world.groundDepth - padding,
        };

        this._buildSky();
        this._buildStars(this.coverageBounds);
        this.scenery = new BackgroundScenery(this);
        this.scenery.build();
        this.lightSurfaces = this.scenery.lightSurfaces;
        this._buildTrees();
        this._buildGround();
        this.ensureCoverage();
    }

    dispose() {
        this.scenery?.dispose();
        this.scenery = null;
        this.lightSurfaces = [];
        for (const shape of this.shapes) {
            this.renderer.removeNormalShape(shape);
        }
        this.shapes.length = 0;
        for (const mesh of this.starMeshes.values()) {
            for (const group of mesh.groups) {
                this.renderer.removeInstancedGroup(group);
            }
        }
        this.starMeshes.clear();
        this.starTiles.clear();
        this.skyBands.length = 0;
        this.skySafetyShape = null;
        this.groundShape = null;
        this.groundRimShape = null;
        this.coverageBounds = null;
        this.twinkleStars.length = 0;
    }

    /** Extend the background before drawing, including during camera moves or pauses. */
    ensureCoverage() {
        const bounds = this.coverageBounds;
        const visible = this.renderer.getVisibleWorldBounds?.();
        if (!bounds || !visible || !Object.values(visible).every(Number.isFinite)) {
            return;
        }

        const { world, ground } = this.config;
        const padding = Math.max(1, world.verticalSafeZone ?? 1080);
        const left = Math.min(bounds.left, visible.left - padding);
        const right = Math.max(bounds.right, visible.right + padding);
        const top = Math.max(bounds.top, Math.ceil((visible.top + padding) / 500) * 500);
        const bottom = Math.min(bounds.bottom, visible.bottom - padding);
        if (left === bounds.left && right === bounds.right && top === bounds.top && bottom === bounds.bottom) {
            return;
        }

        Object.assign(bounds, { left, right, top, bottom });
        this._buildStars(bounds);
        this._setRectBounds(this.skySafetyShape, left, world.skyTopY - 1, right, top);
        for (const shape of this.skyBands) {
            shape.position.x = left;
            shape.scale.x = right - left;
        }
        this._setRectBounds(this.groundShape, left, bottom, right, world.groundY);
        this._setRectBounds(this.groundRimShape, left, bottom, right, world.groundY + ground.rimHeight);
        this.scenery?.ensureCoverage(bounds);
    }

    update(deltaTime, particleSystem = null, fireworks = []) {
        this.scenery?.update(deltaTime, particleSystem, fireworks);
        const stars = this.config.stars;
        if (!stars?.twinkleEnabled || this.twinkleStars.length === 0) {
            return;
        }

        this.twinkleTime += Math.max(0, deltaTime);

        for (const twinkle of this.twinkleStars) {
            const t = this.twinkleTime * twinkle.speed + twinkle.phase;
            const primary = Math.sin(t) * 0.5 + 0.5;
            const secondary = Math.sin(t * 2.17 + twinkle.phase * 1.31) * 0.5 + 0.5;
            const signal = primary * 0.72 + secondary * 0.28;
            const brightnessScale = 1 - twinkle.amplitude * 0.5 + twinkle.amplitude * signal;
            const alphaScale = 1 + (brightnessScale - 1) * twinkle.alphaInfluence;

            const brightness = this._clamp01(twinkle.baseBrightness * brightnessScale);
            const alpha = this._clamp01(twinkle.baseAlpha * alphaScale);
            twinkle.group.updateInstanceColor(twinkle.index, brightness, brightness, brightness, alpha);
        }
    }

    resetLighting() {
        this.scenery?.resetLighting();
    }

    _buildSky() {
        const { world, sky, zIndex } = this.config;
        const bands = Math.max(1, Math.floor(sky.gradientBands));
        const ySpan = world.skyTopY - world.groundY;

        // Keep the normal gradient and stars in place; continue its upper color
        // into a safety zone rather than stretching the scene vertically.
        this.skySafetyShape = this._addRect(
            world.xMin,
            world.skyTopY - 1,
            world.xMax,
            this.coverageBounds.top,
            this._sampleSkyColor(1),
            zIndex.sky
        );

        for (let i = 0; i < bands; i++) {
            const t0 = i / bands;
            const t1 = (i + 1) / bands;
            const tMid = (t0 + t1) * 0.5;
            const y0 = world.groundY + ySpan * t0;
            const y1 = world.groundY + ySpan * t1;
            const color = this._sampleSkyColor(tMid);

            this.skyBands.push(this._addRect(
                world.xMin,
                y0,
                world.xMax,
                y1,
                color,
                zIndex.sky
            ));
        }
    }

    _sampleSkyColor(t) {
        const sky = this.config.sky;
        const midStop = this._clamp01(sky.midStop);

        if (t <= midStop) {
            const localT = midStop <= 0 ? 0 : t / midStop;
            return this._lerpColor(sky.bottomColor, sky.midColor, localT);
        }

        const upperSpan = 1 - midStop;
        const localT = upperSpan <= 0 ? 1 : (t - midStop) / upperSpan;
        return this._lerpColor(sky.midColor, sky.topColor, localT);
    }

    /** Build every star tile overlapping the bounds that does not exist yet. */
    _buildStars(bounds) {
        const { world, stars } = this.config;
        const starBottom = world.horizonY + stars.minYFromHorizon;
        // Keep the original sky's average density: `count` stars over its span.
        const referenceHeight = Math.max(1, world.skyTopY - stars.maxYFromSkyTop - starBottom);
        const cellSize = Math.sqrt((world.xMax - world.xMin) * referenceHeight / stars.count);
        const tileSize = cellSize * STAR_TILE_CELLS;
        const firstX = Math.floor(bounds.left / tileSize);
        const lastX = Math.floor(bounds.right / tileSize);
        const lastY = Math.floor((bounds.top - starBottom) / tileSize);
        for (let tx = firstX; tx <= lastX; tx++) {
            for (let ty = 0; ty <= lastY; ty++) {
                const key = `${tx},${ty}`;
                if (this.starTiles.has(key)) continue;
                this.starTiles.add(key);
                this._buildStarTile(tx * tileSize, starBottom + ty * tileSize, cellSize,
                    createRng((this.config.seed ^ 0xA1B2C3D4 ^ Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0),
                    starBottom, referenceHeight);
            }
        }
    }

    _buildStarTile(x0, y0, cellSize, rng, starBottom, fadeHeight) {
        const { stars, zIndex } = this.config;
        const twinkleMinSpeed = stars.twinkleMinSpeed ?? 0.35;
        const twinkleMaxSpeed = stars.twinkleMaxSpeed ?? 1.6;
        const twinkleMinAmount = stars.twinkleMinAmount ?? 0.1;
        const twinkleMaxAmount = stars.twinkleMaxAmount ?? 0.45;
        const twinkleAlphaInfluence = stars.twinkleAlphaInfluence ?? 0.55;

        for (let cell = 0; cell < STAR_TILE_CELLS * STAR_TILE_CELLS; cell++) {
            const x = x0 + (cell % STAR_TILE_CELLS + rng()) * cellSize;
            const y = y0 + (Math.floor(cell / STAR_TILE_CELLS) + rng()) * cellSize;
            // Thin the field toward the horizon.
            if (rng() > (y - starBottom) / fadeHeight) continue;
            const size = this._randRange(rng, stars.minSize, stars.maxSize);
            const alpha = this._randRange(rng, stars.minAlpha, stars.maxAlpha);
            const brightness = this._randRange(rng, stars.minBrightness, stars.maxBrightness);

            const isFourPoint = rng() < 0.58;
            const points = isFourPoint ? 4 : 5;
            const outerRadius = size * this._randRange(rng, 0.7, 0.95);
            const innerRatio = this._randRange(rng, 0.2, 0.44);
            const rotation = this._randRange(rng, 0, Math.PI * 2);

            const phase = this._randRange(rng, 0, Math.PI * 2);
            const twinkleSpeed = this._randRange(rng, twinkleMinSpeed, twinkleMaxSpeed);
            const twinkleAmplitude = this._randRange(rng, twinkleMinAmount, twinkleMaxAmount);

            const core =this._addStarInstance(x, y, outerRadius, points, innerRatio, 0.2, 0.44,
                rotation, brightness, alpha, zIndex.stars, Renderer2D.BlendMode.NORMAL);
            this._registerTwinkle(core, brightness, alpha, phase, twinkleSpeed, twinkleAmplitude, twinkleAlphaInfluence);

            // Glows draw just above every core, as additive layers over the star.
            const haloRadius = outerRadius * this._randRange(rng, 1.3, 1.85);
            const haloRatio = this._randRange(rng, 0.42, 0.62);
            const haloAlpha = alpha * this._randRange(rng, 0.12, 0.26);
            const halo = this._addStarInstance(x, y, haloRadius, 4, haloRatio, 0.42, 0.62,
                rotation, brightness, haloAlpha, zIndex.stars + 0.1, Renderer2D.BlendMode.ADDITIVE);
            this._registerTwinkle(halo, brightness, haloAlpha, phase + 0.37, twinkleSpeed * 1.1, twinkleAmplitude * 0.7, twinkleAlphaInfluence * 0.75);

            if (rng() < 0.28) {
                const sparkleRadius = outerRadius * this._randRange(rng, 1.8, 2.7);
                const sparkleRatio = this._randRange(rng, 0.08, 0.16);
                const sparkleAlpha = alpha * this._randRange(rng, 0.09, 0.18);
                const sparkle = this._addStarInstance(x, y, sparkleRadius, 4, sparkleRatio, 0.08, 0.16,
                    rotation, brightness, sparkleAlpha, zIndex.stars + 0.2, Renderer2D.BlendMode.ADDITIVE);
                this._registerTwinkle(sparkle, brightness, sparkleAlpha, phase + 1.11, twinkleSpeed * 1.35, twinkleAmplitude * 1.15, twinkleAlphaInfluence * 0.9);
            }
        }
    }

    /** Add one star to the shared mesh for its shape and blend mode. */
    _addStarInstance(x, y, radius, points, innerRatio, minRatio, maxRatio, rotation, brightness, alpha, zIndex, blendMode) {
        const bucket = Math.min(STAR_RATIO_BUCKETS - 1,
            Math.max(0, Math.floor((innerRatio - minRatio) / (maxRatio - minRatio) * STAR_RATIO_BUCKETS)));
        const ratio = minRatio + (bucket + 0.5) * (maxRatio - minRatio) / STAR_RATIO_BUCKETS;
        const key = `${points}:${ratio.toFixed(3)}:${blendMode}:${zIndex}`;

        let mesh = this.starMeshes.get(key);
        if (!mesh) {
            mesh = {
                geom: Renderer2D.buildPolygon(this._buildStarVertices(0, 0, 1, ratio, points)),
                groups: [],
            };
            this.starMeshes.set(key, mesh);
        }

        let group = mesh.groups[mesh.groups.length - 1];
        if (!group || group.instanceCount >= group.maxInstances) {
            group = this.renderer.createInstancedGroup({
                vertices: mesh.geom.vertices,
                indices: mesh.geom.indices,
                maxInstances: STAR_GROUP_CAPACITY,
                zIndex,
                blendMode,
            });
            mesh.groups.push(group);
        }

        const index = group.instanceCount;
        group.addInstanceRaw(x, y, rotation, radius, radius, brightness, brightness, brightness, alpha);
        return { group, index };
    }

    _registerTwinkle({ group, index }, baseBrightness, baseAlpha, phase, speed, amplitude, alphaInfluence) {
        if (!this.config.stars?.twinkleEnabled) {
            return;
        }

        this.twinkleStars.push({
            group,
            index,
            baseBrightness,
            baseAlpha,
            phase,
            speed,
            amplitude,
            alphaInfluence,
        });
    }

    _buildTrees() {
        const { world, trees, zIndex } = this.config;
        const baseSeed = this.config.seed ^ 0x9E3779B9;
        const layerZOrder = [zIndex.treesFar, zIndex.treesMid, zIndex.treesNear];

        for (let layerIndex = 0; layerIndex < trees.layers.length; layerIndex++) {
            const layer = trees.layers[layerIndex];
            const rng = createRng(baseSeed + layerIndex * 1013);
            const treeList = [];
            const distributionJitter = layer.distributionJitter ?? 0.75;
            const xPositions = this._generateJitteredPositions(
                rng,
                layer.treeCount,
                world.xMin,
                world.xMax,
                distributionJitter
            );
            this._shuffleInPlace(rng, xPositions);

            for (let i = 0; i < layer.treeCount; i++) {
                const x = xPositions[i];
                const baseY = layer.baseY + this._randRange(rng, -layer.baseYJitter, layer.baseYJitter);
                const width = this._randRange(rng, layer.widthMin, layer.widthMax);
                const height = this._randRange(rng, layer.heightMin, layer.heightMax);
                const tierCount = Math.floor(this._randRange(rng, layer.tierCountMin, layer.tierCountMax + 1));
                const trunkHeightRatio = this._randRange(rng, layer.trunkHeightRatioMin, layer.trunkHeightRatioMax);
                const trunkWidthRatio = this._randRange(rng, layer.trunkWidthRatioMin, layer.trunkWidthRatioMax);
                const tierInnerRatio = this._randRange(rng, layer.tierInnerRatioMin, layer.tierInnerRatioMax);
                const tipLeanRatio = this._randRange(rng, layer.tipLeanRatioMin, layer.tipLeanRatioMax);
                const widthCurvePower = this._randRange(rng, layer.widthCurvePowerMin, layer.widthCurvePowerMax);

                const treeVertices = this._buildTreeVertices({
                    rng,
                    x,
                    baseY,
                    width,
                    height,
                    tierCount,
                    trunkHeightRatio,
                    trunkWidthRatio,
                    tierInnerRatio,
                    tierHeightJitterRatio: layer.tierHeightJitterRatio,
                    tierWidthJitterRatio: layer.tierWidthJitterRatio,
                    edgeJitter: layer.edgeJitter,
                    tipLeanRatio,
                    widthCurvePower,
                });

                treeList.push(treeVertices);
            }

            treeList.sort((a, b) => a[0] - b[0]);
            const treeLayerZ = layerZOrder[layerIndex] ?? zIndex.treesNear;

            for (const treeVertices of treeList) {
                const geom = Renderer2D.buildPolygon(treeVertices);
                const shape = this.renderer.createNormalShape({
                    vertices: geom.vertices,
                    indices: geom.indices,
                    color: new Renderer2D.Color(layer.color.r, layer.color.g, layer.color.b, layer.color.a),
                    position: new Renderer2D.Vector2(0, 0),
                    rotation: 0,
                    scale: new Renderer2D.Vector2(1, 1),
                    zIndex: treeLayerZ,
                    blendMode: Renderer2D.BlendMode.NORMAL,
                    isStroke: false,
                });
                this.shapes.push(shape);
            }
        }
    }

    _buildTreeVertices({
        rng,
        x,
        baseY,
        width,
        height,
        tierCount,
        trunkHeightRatio,
        trunkWidthRatio,
        tierInnerRatio,
        tierHeightJitterRatio,
        tierWidthJitterRatio,
        edgeJitter,
        tipLeanRatio,
        widthCurvePower,
    }) {
        const tiers = Math.max(3, tierCount);
        const trunkHeight = height * trunkHeightRatio;
        const foliageBottomY = baseY + trunkHeight;
        const foliageHeight = height - trunkHeight;
        const trunkHalfWidth = width * trunkWidthRatio * 0.5;
        const maxHalfWidth = width * 0.5;
        const tipX = x + width * tipLeanRatio;
        const tipY = baseY + height;
        const tierStep = foliageHeight / tiers;

        const leftChain = [];
        const rightChain = [];
        let lastY = foliageBottomY;

        for (let i = 0; i < tiers; i++) {
            const t = i / tiers;
            const nextT = (i + 1) / tiers;
            const outerBase = maxHalfWidth * Math.pow(1 - t, widthCurvePower);
            const outerHalf = Math.max(
                trunkHalfWidth * 1.35,
                outerBase * (1 + this._randRange(rng, -tierWidthJitterRatio, tierWidthJitterRatio))
            );
            const innerHalf = Math.max(trunkHalfWidth * 1.05, outerHalf * tierInnerRatio);

            const yBase = i === 0
                ? foliageBottomY
                : Math.max(lastY + tierStep * 0.15, foliageBottomY + tierStep * i);
            const yPeakBase = foliageBottomY + tierStep * nextT;
            const yJitter = tierStep * tierHeightJitterRatio;
            const yPeak = Math.max(
                yBase + tierStep * 0.2,
                yPeakBase + this._randRange(rng, -yJitter, yJitter)
            );

            leftChain.push([
                x - outerHalf + this._randRange(rng, -edgeJitter, edgeJitter),
                yBase,
            ]);
            leftChain.push([
                x - innerHalf + this._randRange(rng, -edgeJitter * 0.45, edgeJitter * 0.45),
                yPeak,
            ]);

            rightChain.push([
                x + innerHalf + this._randRange(rng, -edgeJitter * 0.45, edgeJitter * 0.45),
                yPeak,
            ]);
            rightChain.push([
                x + outerHalf + this._randRange(rng, -edgeJitter, edgeJitter),
                yBase,
            ]);

            lastY = yPeak;
        }

        const points = [];
        points.push([x - trunkHalfWidth, baseY]);
        points.push([x - trunkHalfWidth, foliageBottomY]);

        for (const p of leftChain) {
            points.push(p);
        }

        points.push([tipX, tipY]);

        for (let i = rightChain.length - 1; i >= 0; i--) {
            points.push(rightChain[i]);
        }

        points.push([x + trunkHalfWidth, foliageBottomY]);
        points.push([x + trunkHalfWidth, baseY]);

        const flat = [];
        for (const point of points) {
            flat.push(point[0], point[1]);
        }
        return flat;
    }

    _buildGround() {
        const { world, ground, zIndex } = this.config;
        const bottomY = this.coverageBounds.bottom;

        this.groundShape = this._addRect(
            world.xMin,
            bottomY,
            world.xMax,
            world.groundY,
            new Renderer2D.Color(ground.color.r, ground.color.g, ground.color.b, ground.color.a),
            zIndex.ground
        );

        this.groundRimShape = this._addRect(
            world.xMin,
            bottomY,
            world.xMax,
            world.groundY + ground.rimHeight,
            new Renderer2D.Color(ground.rimColor.r, ground.rimColor.g, ground.rimColor.b, ground.rimColor.a),
            zIndex.groundRim
        );
    }

    _addRect(x0, y0, x1, y1, color, zIndex) {
        const geom = Renderer2D.buildPolygon([
            0, 0,
            1, 0,
            1, 1,
            0, 1,
        ]);

        const shape = this.renderer.createNormalShape({
            vertices: geom.vertices,
            indices: geom.indices,
            color,
            position: new Renderer2D.Vector2(x0, y0),
            rotation: 0,
            scale: new Renderer2D.Vector2(x1 - x0, y1 - y0),
            zIndex,
            blendMode: Renderer2D.BlendMode.NORMAL,
            isStroke: false,
        });

        this.shapes.push(shape);
        return shape;
    }

    _setRectBounds(shape, x0, y0, x1, y1) {
        shape.position.set(x0, y0);
        shape.scale.set(x1 - x0, y1 - y0);
    }

    _addPolygon(points, color, zIndex, blendMode = Renderer2D.BlendMode.NORMAL) {
        const geom = Renderer2D.buildPolygon(points);

        const shape = this.renderer.createNormalShape({
            vertices: geom.vertices,
            indices: geom.indices,
            color,
            position: new Renderer2D.Vector2(0, 0),
            rotation: 0,
            scale: new Renderer2D.Vector2(1, 1),
            zIndex,
            blendMode,
            isStroke: false,
        });

        this.shapes.push(shape);
        return shape;
    }

    _buildStarVertices(cx, cy, outerRadius, innerRadius, points, rotation = 0) {
        const spikeCount = Math.max(3, Math.floor(points));
        const totalVertices = spikeCount * 2;
        const vertices = [];

        for (let i = 0; i < totalVertices; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = rotation + (i / totalVertices) * Math.PI * 2;
            vertices.push(
                cx + Math.cos(angle) * radius,
                cy + Math.sin(angle) * radius
            );
        }

        return vertices;
    }

    _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    _lerpColor(c1, c2, t) {
        const tc = this._clamp01(t);
        return new Renderer2D.Color(
            this._lerp(c1.r, c2.r, tc),
            this._lerp(c1.g, c2.g, tc),
            this._lerp(c1.b, c2.b, tc),
            this._lerp(c1.a, c2.a, tc)
        );
    }

    _clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    _randRange(rng, min, max) {
        return min + (max - min) * rng();
    }

    _generateJitteredPositions(rng, count, min, max, jitterStrength = 1) {
        const positions = [];
        const total = Math.max(1, Math.floor(count));
        const span = max - min;
        const step = span / total;
        const jitter = Math.max(0, Math.min(1, jitterStrength));
        const jitterAmount = step * 0.5 * jitter;

        for (let i = 0; i < total; i++) {
            const center = min + step * (i + 0.5);
            const offset = this._randRange(rng, -jitterAmount, jitterAmount);
            positions.push(Math.max(min, Math.min(max, center + offset)));
        }

        return positions;
    }

    _shuffleInPlace(rng, values) {
        for (let i = values.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = values[i];
            values[i] = values[j];
            values[j] = tmp;
        }
    }
}

export default ProcduralBackground;
