import * as Renderer2D from '../rendering/Renderer.js';
import { hexToRgb } from '../animation/SkeletonData.js';

const { BlendMode, buildCircle, buildRing, buildPolygon } = Renderer2D;

// A ground portal drawn from instanced shapes.
// The ground is seen at a slight angle, so every circle is squashed by PERSPECTIVE.
const PERSPECTIVE = 0.3;
const RADIUS = 28;
const DEEP = hexToRgb('0b0d18');
const DEFAULT_COLOR = hexToRgb('8a8fe0');
const FIRE_FLASH_DURATION = 0.6;
const RIPPLE_COUNT = 3;
// Shot squish: a damped wobble that starts wide and flat, then springs back.
const SQUISH_AMOUNT = 0.26;
const SQUISH_DAMPING = 3.5;
const SQUISH_FREQUENCY = 11;
// Per-second rate of the blend toward the next recipe's colour (~95% in one second).
const COLOR_BLEND_RATE = 3;

const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

class PortalVisual {
    constructor(renderer, zIndex) {
        this._renderer = renderer;
        this._time = Math.random() * 10;
        this._flash = 0;
        this._shotAge = Infinity;
        this._sparks = [];
        // The shown colour eases toward the target once each shot's pulse is over.
        this._color = null;
        this._targetColor = DEFAULT_COLOR;
        this._groups = [];

        // Low segment counts keep the flat, faceted look of the scenery.
        const create = (geometry, z, blendMode = BlendMode.NORMAL, texture = null) => {
            const group = renderer.createInstancedGroup({ ...geometry, texture, maxInstances: 32, zIndex: z, blendMode });
            this._groups.push(group);
            return group;
        };
        // Fractional z keeps the layers ordered: base, ripples, then the inner swirl.
        this._ellipses = create(buildCircle(1, 16), zIndex);
        this._ripples = create(buildRing(1, 0.8, 16), zIndex + 0.3);
        this._inner = create(buildCircle(1, 16), zIndex + 0.6);
        this._sparkShapes = create(buildPolygon([[0, 1], [0.55, 0], [0, -1], [-0.55, 0]]), zIndex + 1, BlendMode.ADDITIVE);
    }

    /** Sets the colour to blend toward; the very first colour applies at once. */
    setColor(hex) {
        this._targetColor = hex ? hexToRgb(hex) : DEFAULT_COLOR;
        if (!this._color) this._color = this._targetColor;
    }

    /** A soft brightening and a few sparks as a rocket leaves the portal. */
    fire(x, y) {
        this._flash = FIRE_FLASH_DURATION;
        this._shotAge = 0;
        for (let i = 0; i < 3; i++) {
            this._sparks.push({
                x: x + (Math.random() - 0.5) * RADIUS,
                y: y + (Math.random() - 0.5) * RADIUS * PERSPECTIVE,
                vy: 30 + Math.random() * 30,
                life: 0.5 + Math.random() * 0.3,
                age: 0,
            });
        }
    }

    /** Does a world point fall on the portal's ground ellipse (with some grab margin)? */
    contains(cx, cy, x, y) {
        const dx = (x - cx) / (RADIUS + 8);
        const dy = (y - cy) / ((RADIUS + 8) * PERSPECTIVE + 10);
        return dx * dx + dy * dy <= 1;
    }

    outlinePoints(cx, cy) {
        const points = [];
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            points.push({ x: cx + Math.cos(angle) * (RADIUS + 2), y: cy + Math.sin(angle) * (RADIUS + 2) * PERSPECTIVE });
        }
        return points;
    }

    update(dt, cx, cy, highlight = 0) {
        this._time += dt;
        this._flash = Math.max(0, this._flash - dt);
        this._shotAge += dt;
        // Hold the fired colour through the pulse, then blend to the next one.
        if (!this._color) this._color = this._targetColor;
        if (this._flash === 0) this._color = mix(this._color, this._targetColor, 1 - Math.exp(-COLOR_BLEND_RATE * dt));
        const t = this._time;
        const flash = this._flash / FIRE_FLASH_DURATION;
        const color = this._color;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
        const lift = flash * 0.15 + highlight * 0.2;

        // Idle breathing plus the shot squish; sx/sy scale every layer.
        // Before the first shot _shotAge is Infinity, and cos(Infinity) is NaN.
        const squish = Number.isFinite(this._shotAge)
            ? SQUISH_AMOUNT * Math.exp(-SQUISH_DAMPING * this._shotAge) * Math.cos(SQUISH_FREQUENCY * this._shotAge)
            : 0;
        const sx = (1 + 0.015 * Math.sin(t * 2.1)) * (1 + squish);
        const sy = (1 + 0.04 * Math.sin(t * 2.1 + 1)) * (1 - squish * 1.4);
        const ry = PERSPECTIVE * sy;

        // A soft edge, then the dark void.
        const e = this._ellipses;
        e.clear();
        const edge = mix(DEEP, color, 0.7 + lift);
        e.addInstanceRaw(cx, cy, 0, RADIUS * sx, RADIUS * ry, edge.r, edge.g, edge.b, 1);
        const deep = mix(DEEP, color, 0.3 + lift);
        e.addInstanceRaw(cx, cy - 0.8, 0, (RADIUS - 4) * sx, (RADIUS - 4) * ry - 0.6, deep.r, deep.g, deep.b, 1);

        // Ripples sink from the edge toward the centre, brightest midway.
        const ripples = this._ripples;
        ripples.clear();
        for (let i = 0; i < RIPPLE_COUNT; i++) {
            const phase = (t * 0.45 + i / RIPPLE_COUNT) % 1;
            const radius = (RADIUS - 5) * (1 - phase * 0.75);
            const tone = mix(deep, color, 0.35 * Math.sin(phase * Math.PI) + lift);
            ripples.addInstanceRaw(cx, cy - 0.8 - phase * 0.6, 0, radius * sx, radius * ry, tone.r, tone.g, tone.b, 1);
        }

        // The swirl and core drift around the centre in opposite directions.
        const inner = this._inner;
        inner.clear();
        const swirl = mix(DEEP, color, 0.48 + pulse * 0.06 + lift);
        const swirlRadius = (RADIUS - 11) * (0.95 + pulse * 0.05);
        inner.addInstanceRaw(cx + Math.cos(t * 1.1) * 1.5, cy - 1.2 + Math.sin(t * 1.1) * 0.4, 0,
            swirlRadius * sx, swirlRadius * ry, swirl.r, swirl.g, swirl.b, 1);
        const core = mix(DEEP, color, 0.62 + lift);
        inner.addInstanceRaw(cx - Math.cos(t * 1.7) * 1.2, cy - 1.4 - Math.sin(t * 1.7) * 0.3, 0,
            swirlRadius * 0.45 * sx, swirlRadius * 0.45 * ry, core.r, core.g, core.b, 1);

        // Sparks rise briefly after each shot.
        const sparkShapes = this._sparkShapes;
        sparkShapes.clear();
        for (let i = this._sparks.length - 1; i >= 0; i--) {
            const spark = this._sparks[i];
            spark.age += dt;
            if (spark.age >= spark.life) { this._sparks.splice(i, 1); continue; }
            spark.y += spark.vy * dt;
            const fade = 1 - spark.age / spark.life;
            sparkShapes.addInstanceRaw(spark.x, spark.y, 0, 1.3, 2.4, color.r, color.g, color.b, fade * 0.6);
        }
    }

    destroy() {
        for (const group of this._groups) this._renderer.removeInstancedGroup(group);
        this._groups = [];
    }
}

export default PortalVisual;
