import { buildTexturedSquare, BlendMode } from '../rendering/Renderer.js';

/**
 * SmokeSystem.js
 *
 * High-performance instanced smoke VFX.
 *
 * Design:
 *  - All particle state lives in flat Float32Arrays (SOA layout) → cache-friendly
 *  - Uses InstancedGroup.addInstanceRaw() → zero per-frame heap allocation
 *  - Free-list recycling → no GC pressure during runtime
 *  - Procedural soft-circle texture with Gaussian falloff (no external assets needed)
 *  - Multiple independent Emitter objects can be managed by one SmokeSystem
 *
 * Usage:
 *   const smoke = new SmokeSystem(renderer, { maxParticles: 4000 });
 *
 *   const emitter = smoke.createEmitter({
 *       x: 400, y: 300,
 *       rate: 15,           // particles / second
 *       spread: 0.6,        // radians half-angle
 *       direction: -Math.PI / 2,  // upward
 *       speed: [20, 60],
 *       lifetime: [1.5, 3.0],
 *       startScale: [8, 18],
 *       endScale: [40, 80],
 *       startAlpha: [0.25, 0.55],
 *       colorVariants: [
 *           [0.75, 0.75, 0.75],   // light grey
 *           [0.55, 0.55, 0.55],   // mid grey
 *           [0.35, 0.35, 0.35],   // dark grey
 *       ],
 *       turbulence: 12,     // random horizontal force
 *   });
 *
 *   // Each frame:
 *   smoke.update(deltaSeconds);
 *
 *   // Move / toggle an emitter:
 *   emitter.x = newX;
 *   emitter.active = false;
 *
 *   // Remove when done:
 *   smoke.removeEmitter(emitter);
 *   smoke.destroy();
 */

// ─────────────────────────────────────────────────────────────────────────────
// Particle field offsets inside the per-particle Float32 block (stride = 14)
// ─────────────────────────────────────────────────────────────────────────────
const STRIDE    = 14;
const F_X       = 0;
const F_Y       = 1;
const F_VX      = 2;
const F_VY      = 3;
const F_ROT     = 4;
const F_ROT_V   = 5;   // rotation velocity (rad/s)
const F_LIFE    = 6;   // current lifetime remaining
const F_MAX_LIFE= 7;   // initial lifetime
const F_SS      = 8;   // startScale
const F_ES      = 9;   // endScale
const F_SA      = 10;  // startAlpha
const F_R       = 11;  // colour R
const F_G       = 12;  // colour G
const F_B       = 13;  // colour B

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function rand(a, b) {
    return a + Math.random() * (b - a);
}
function randArr(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural smoke texture
// Creates a 128×128 soft-circle with Gaussian-falloff alpha channel.
// ─────────────────────────────────────────────────────────────────────────────
function createSmokeTexture(gl, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    // Layered radial gradients for a more organic, wispy look
    const layers = [
        { ox: 0,          oy: 0,          r: half,        a0: 0.90, a1: 0.0 },
        { ox:  half*0.15, oy: -half*0.10, r: half * 0.70, a0: 0.55, a1: 0.0 },
        { ox: -half*0.20, oy:  half*0.12, r: half * 0.60, a0: 0.40, a1: 0.0 },
    ];

    for (const { ox, oy, r, a0, a1 } of layers) {
        const cx = half + ox, cy = half + oy;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,   `rgba(255,255,255,${a0})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${(a0 + a1) * 0.4})`);
        grad.addColorStop(1,   `rgba(255,255,255,${a1})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Wrap in the same shape the renderer expects: { texture, width, height }
    return { texture: tex, width: size, height: size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Emitter config defaults
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_EMITTER = {
    x: 0,
    y: 0,
    active: true,
    rate: 10,
    direction: -Math.PI / 2,        // straight up
    spread: Math.PI / 4,
    speed: [30, 80],
    lifetime: [1.5, 3.5],
    startScale: [10, 22],
    endScale: [55, 100],
    startAlpha: [0.20, 0.50],
    turbulence: 15,
    colorVariants: [
        [0.78, 0.78, 0.78],
        [0.60, 0.60, 0.60],
        [0.42, 0.42, 0.42],
    ],
    gravity: -8,                    // upward drift (negative = up in canvas coords)
};

// ─────────────────────────────────────────────────────────────────────────────
// SmokeSystem
// ─────────────────────────────────────────────────────────────────────────────
export class SmokeSystem {
    /**
     * @param {import('../rendering/Renderer.js').Renderer2D} renderer
     * @param {{ maxParticles?: number, zIndex?: number, textureSize?: number }} opts
     */
    constructor(renderer, opts = {}) {
        this._renderer  = renderer;
        this._maxP      = opts.maxParticles ?? 4000;
        this._emitters  = [];

        // ── typed-array particle state (SOA) ──────────────────────────────────
        this._data   = new Float32Array(this._maxP * STRIDE);
        this._alive  = new Uint8Array(this._maxP);
        this._free   = new Int32Array(this._maxP);
        this._freeHead = this._maxP - 1;
        for (let i = 0; i < this._maxP; i++) this._free[i] = i;

        // ── smoke texture ─────────────────────────────────────────────────────
        const gl = renderer.gl;
        this._tex = createSmokeTexture(gl, opts.textureSize ?? 128);

        // ── instanced group (unit quad with UVs) ──────────────────────────────
        const quad = buildTexturedSquare(1, 1);

        this._group = renderer.createInstancedGroup({
            vertices:     quad.vertices,
            indices:      quad.indices,
            texCoords:    quad.texCoords,
            texture:      this._tex,
            maxInstances: this._maxP,
            zIndex:       opts.zIndex ?? 50,
            blendMode:    BlendMode.NORMAL,
        });

        // ── per-emitter sub-second accumulator ──────────────────────────────
        this._accumulators = new WeakMap();
    }

    // ── public API ───────────────────────────────────────────────────────────

    /**
     * Create and register a new emitter.
     * @param {Partial<typeof DEFAULT_EMITTER>} config
     * @returns {object} Emitter handle – mutate its properties at any time.
     */
    createEmitter(config = {}) {
        const emitter = Object.assign({}, DEFAULT_EMITTER, config);
        this._emitters.push(emitter);
        this._accumulators.set(emitter, 0);
        return emitter;
    }

    /** Remove an emitter (already-spawned particles keep playing out). */
    removeEmitter(emitter) {
        const i = this._emitters.indexOf(emitter);
        if (i !== -1) this._emitters.splice(i, 1);
    }

    /**
     * Call once per frame before renderer.drawFrame().
     * @param {number} dt  Delta time in seconds.
     */
    update(dt) {
        // ── spawn from each active emitter ────────────────────────────────
        for (const em of this._emitters) {
            if (!em.active) continue;

            let acc = this._accumulators.get(em) + em.rate * dt;
            const toSpawn = Math.floor(acc);
            this._accumulators.set(em, acc - toSpawn);

            for (let s = 0; s < toSpawn; s++) {
                this._spawn(em);
            }
        }

        // ── update live particles & rebuild instanced buffer ─────────────
        this._group.clear();

        for (let i = 0; i < this._maxP; i++) {
            if (!this._alive[i]) continue;

            const base = i * STRIDE;
            const d    = this._data;

            d[base + F_LIFE] -= dt;
            if (d[base + F_LIFE] <= 0) {
                this._kill(i);
                continue;
            }

            // integrate – add small per-frame random turbulence to X
            const turbX = (Math.random() - 0.5) * 50;   // ±25 px/s variance
            d[base + F_X]   += (d[base + F_VX] + turbX) * dt;
            d[base + F_Y]   += d[base + F_VY] * dt;
            d[base + F_ROT] += d[base + F_ROT_V] * dt;

            // normalised age [0 → 1]  (0 = just born, 1 = about to die)
            const t = 1 - d[base + F_LIFE] / d[base + F_MAX_LIFE];

            const scale = d[base + F_SS] + (d[base + F_ES] - d[base + F_SS]) * t;

            // alpha: fade-in briefly, then fade-out
            const fadeIn  = Math.min(t * 6, 1);          // full alpha by t=0.17
            const fadeOut = 1 - Math.max((t - 0.4) / 0.6, 0); // fade from t=0.4
            const alpha   = d[base + F_SA] * fadeIn * fadeOut;

            this._group.addInstanceRaw(
                d[base + F_X],
                d[base + F_Y],
                d[base + F_ROT],
                scale, scale,
                d[base + F_R],
                d[base + F_G],
                d[base + F_B],
                alpha,
                0, 0  // no glow/blur
            );
        }
    }

    /** Free all GPU resources. */
    destroy() {
        this._renderer.removeInstancedGroup(this._group);
        this._renderer.gl.deleteTexture(this._tex.texture);
        this._emitters.length = 0;
    }

    // ── internal ─────────────────────────────────────────────────────────────

    _spawn(em) {
        if (this._freeHead < 0) return;   // pool exhausted
        const i    = this._free[this._freeHead--];
        const base = i * STRIDE;
        const d    = this._data;

        const angle = em.direction + rand(-em.spread, em.spread);
        const spd   = rand(...em.speed);
        const life  = rand(...em.lifetime);
        const ss    = rand(...em.startScale);
        const es    = rand(...em.endScale);
        const sa    = rand(...em.startAlpha);
        const col   = randArr(em.colorVariants);

        d[base + F_X]        = em.x + rand(-4, 4);
        d[base + F_Y]        = em.y + rand(-4, 4);
        d[base + F_VX]       = Math.cos(angle) * spd + rand(-em.turbulence, em.turbulence);
        d[base + F_VY]       = Math.sin(angle) * spd + (em.gravity ?? 0);
        d[base + F_ROT]      = rand(0, Math.PI * 2);
        d[base + F_ROT_V]    = rand(-0.4, 0.4);
        d[base + F_LIFE]     = life;
        d[base + F_MAX_LIFE] = life;
        d[base + F_SS]       = ss;
        d[base + F_ES]       = es;
        d[base + F_SA]       = sa;
        d[base + F_R]        = col[0];
        d[base + F_G]        = col[1];
        d[base + F_B]        = col[2];

        this._alive[i] = 1;
    }

    _kill(i) {
        this._alive[i] = 0;
        this._free[++this._freeHead] = i;
    }
}
