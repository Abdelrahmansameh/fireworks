import { PROCEDURAL_BACKGROUND_CONFIG } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';

class ProcduralBackground {
    constructor(renderer, config = PROCEDURAL_BACKGROUND_CONFIG) {
        this.renderer = renderer;
        this.config = config;
        this.shapes = [];
    }

    generate() {
        this.dispose();

        this._buildSky();
        this._buildStars();
        this._buildTrees();
        this._buildGround();
    }

    dispose() {
        for (const shape of this.shapes) {
            this.renderer.removeNormalShape(shape);
        }
        this.shapes.length = 0;
    }

    _buildSky() {
        const { world, sky, zIndex } = this.config;
        const bands = Math.max(1, Math.floor(sky.gradientBands));
        const ySpan = world.skyTopY - world.groundY;

        for (let i = 0; i < bands; i++) {
            const t0 = i / bands;
            const t1 = (i + 1) / bands;
            const tMid = (t0 + t1) * 0.5;
            const y0 = world.groundY + ySpan * t0;
            const y1 = world.groundY + ySpan * t1;
            const color = this._sampleSkyColor(tMid);

            this._addRect(
                world.xMin,
                y0,
                world.xMax,
                y1,
                color,
                zIndex.sky
            );
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

    _buildStars() {
        const { world, stars, zIndex } = this.config;
        const rng = this._createRng(this.config.seed ^ 0xA1B2C3D4);
        const distributionJitter = stars.distributionJitter ?? 0.9;

        const yMin = world.horizonY + stars.minYFromHorizon;
        const yMax = world.skyTopY - stars.maxYFromSkyTop;
        const minY = Math.min(yMin, yMax);
        const maxY = Math.max(yMin, yMax);
        const xPositions = this._generateJitteredPositions(
            rng,
            stars.count,
            world.xMin,
            world.xMax,
            distributionJitter
        );
        const yPositions = this._generateJitteredPositions(
            rng,
            stars.count,
            minY,
            maxY,
            distributionJitter
        );

        this._shuffleInPlace(rng, xPositions);
        this._shuffleInPlace(rng, yPositions);

        for (let i = 0; i < stars.count; i++) {
            const x = xPositions[i];
            const y = yPositions[i];
            const size = this._randRange(rng, stars.minSize, stars.maxSize);
            const alpha = this._randRange(rng, stars.minAlpha, stars.maxAlpha);
            const brightness = this._randRange(rng, stars.minBrightness, stars.maxBrightness);

            const isFourPoint = rng() < 0.58;
            const points = isFourPoint ? 4 : 5;
            const outerRadius = size * this._randRange(rng, 0.7, 0.95);
            const innerRadius = outerRadius * this._randRange(rng, 0.2, 0.44);
            const rotation = this._randRange(rng, 0, Math.PI * 2);

            const starColor = new Renderer2D.Color(brightness, brightness, brightness, alpha);
            const starVerts = this._buildStarVertices(x, y, outerRadius, innerRadius, points, rotation);
            this._addPolygon(starVerts, starColor, zIndex.stars);

            const haloRadius = outerRadius * this._randRange(rng, 1.3, 1.85);
            const haloInnerRadius = haloRadius * this._randRange(rng, 0.42, 0.62);
            const haloAlpha = alpha * this._randRange(rng, 0.12, 0.26);
            const haloColor = new Renderer2D.Color(brightness, brightness, brightness, haloAlpha);
            const haloVerts = this._buildStarVertices(
                x,
                y,
                haloRadius,
                haloInnerRadius,
                4,
                rotation + Math.PI * 0.25
            );
            this._addPolygon(haloVerts, haloColor, zIndex.stars, Renderer2D.BlendMode.ADDITIVE);

            if (rng() < 0.28) {
                const sparkleOuterRadius = outerRadius * this._randRange(rng, 1.8, 2.7);
                const sparkleInnerRadius = sparkleOuterRadius * this._randRange(rng, 0.08, 0.16);
                const sparkleAlpha = alpha * this._randRange(rng, 0.09, 0.18);
                const sparkleColor = new Renderer2D.Color(brightness, brightness, brightness, sparkleAlpha);
                const sparkleVerts = this._buildStarVertices(
                    x,
                    y,
                    sparkleOuterRadius,
                    sparkleInnerRadius,
                    4,
                    rotation + Math.PI * 0.25
                );
                this._addPolygon(sparkleVerts, sparkleColor, zIndex.stars, Renderer2D.BlendMode.ADDITIVE);
            }
        }
    }

    _buildTrees() {
        const { world, trees, zIndex } = this.config;
        const baseSeed = this.config.seed ^ 0x9E3779B9;
        const layerZOrder = [zIndex.treesFar, zIndex.treesMid, zIndex.treesNear];

        for (let layerIndex = 0; layerIndex < trees.layers.length; layerIndex++) {
            const layer = trees.layers[layerIndex];
            const rng = this._createRng(baseSeed + layerIndex * 1013);
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
                const baseY = world.horizonY + this._randRange(rng, -layer.baseYJitter, layer.baseYJitter);
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

            const yBase = Math.max(lastY + tierStep * 0.15, foliageBottomY + tierStep * i);
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
        const bottomY = world.groundY - world.groundDepth;

        this._addRect(
            world.xMin,
            bottomY,
            world.xMax,
            world.groundY,
            new Renderer2D.Color(ground.color.r, ground.color.g, ground.color.b, ground.color.a),
            zIndex.ground
        );

        this._addRect(
            world.xMin,
            world.groundY,
            world.xMax,
            world.groundY + ground.rimHeight,
            new Renderer2D.Color(ground.rimColor.r, ground.rimColor.g, ground.rimColor.b, ground.rimColor.a),
            zIndex.groundRim
        );
    }

    _addRect(x0, y0, x1, y1, color, zIndex) {
        const geom = Renderer2D.buildPolygon([
            x0, y0,
            x1, y0,
            x1, y1,
            x0, y1,
        ]);

        const shape = this.renderer.createNormalShape({
            vertices: geom.vertices,
            indices: geom.indices,
            color,
            position: new Renderer2D.Vector2(0, 0),
            rotation: 0,
            scale: new Renderer2D.Vector2(1, 1),
            zIndex,
            blendMode: Renderer2D.BlendMode.NORMAL,
            isStroke: false,
        });

        this.shapes.push(shape);
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

    _createRng(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
}

export default ProcduralBackground;
