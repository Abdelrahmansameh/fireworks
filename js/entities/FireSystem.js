import { buildTexturedSquare, BlendMode } from '../rendering/Renderer.js';

/**
 * FireSystem.js
 *
 * High-performance instanced fire + ember VFX.
 *
 * Design:
 *  - SOA typed-array particle state → cache-friendly iteration
 *  - Free-list pool → zero GC pressure during runtime
 *  - addInstanceRaw() → no per-frame heap allocation
 *  - Two draw layers: flame layer (ADDITIVE) + ember layer (ADDITIVE)
 *  - Procedural fire-glow texture (no external asset required)
 *  - Temperature-driven color gradient:
 *      t=0   white / pale-yellow   (core, just born)
 *      t=0.3 bright orange-yellow
 *      t=0.6 deep orange-red
 *      t=1.0 dark red → alpha fades to 0
 *  - Multiple independent emitters managed by one FireSystem instance
 *
 * Usage:
 *   const fire = new FireSystem(renderer, { maxFlames: 3000, maxEmbers: 1000 });
 *
 *   const emitter = fire.createEmitter({
 *       x: 400, y: 400,
 *       rate: 60,
 *       spread: 0.5,
 *       speed: [60, 130],
 *       lifetime: [0.6, 1.4],
 *       startScale: [14, 28],
 *       peakScale: [24, 48],
 *       endScale: [4, 10],
 *       startAlpha: [0.7, 1.0],
 *       aspectRatio: [0.30, 0.50],
 *       turbFreq: [3, 8],
 *       gravity: -20,
 *       emberRate: 8,
 *   });
 *
 *   // Each frame:
 *   fire.update(dt);
 *
 *   // Reposition / toggle:
 *   emitter.x = newX;
 *   emitter.active = false;
 *
 *   // Cleanup:
 *   fire.removeEmitter(emitter);
 *   fire.destroy();
 */

// ─────────────────────────────────────────────────────────────────────────────
// Flame particle layout  (stride = 10)
// ─────────────────────────────────────────────────────────────────────────────
const FLAME_STRIDE   = 15;
const FF_X           = 0;
const FF_Y           = 1;
const FF_VX          = 2;
const FF_VY          = 3;
const FF_ROT         = 4;
const FF_ROT_V       = 5;
const FF_LIFE        = 6;
const FF_MAX_LIFE    = 7;
const FF_TEMP        = 8;   // "temperature" [0.5–1.0]: affects peak brightness
const FF_BASE_SCALE  = 9;   // peak Y-scale (height)
const FF_ASPECT      = 10;  // scaleX = scaleY * aspect  (0.25–0.55 → narrow flame)
const FF_TURB_PHASE  = 11;  // per-particle sinusoidal sway phase (rad)
const FF_TURB_FREQ   = 12;  // per-particle sway frequency (rad/s)
const FF_SPAWN_CX    = 13;  // emitter center X at spawn — convergence reference axis
const FF_CONVERGENCE = 14;  // centripetal pull strength (outer particles get more)

// ─────────────────────────────────────────────────────────────────────────────
// Ember particle layout  (stride = 9)
// ─────────────────────────────────────────────────────────────────────────────
const EMBER_STRIDE  = 9;
const FE_X          = 0;
const FE_Y          = 1;
const FE_VX         = 2;
const FE_VY         = 3;
const FE_ROT        = 4;
const FE_ROT_V      = 5;
const FE_LIFE       = 6;
const FE_MAX_LIFE   = 7;
const FE_SIZE       = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function rand(a, b)    { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ─────────────────────────────────────────────────────────────────────────────
// Procedural fire-glow texture
//   A soft radial gradient: bright white core → orange halo → transparent edge.
//   Drawn entirely on a 2D canvas and uploaded as a GL texture.
// ─────────────────────────────────────────────────────────────────────────────
function createFireTexture(gl, size = 128) {
    const canvas  = document.createElement('canvas');
    canvas.width  = canvas.height = size;
    const ctx     = canvas.getContext('2d');
    const cx      = size / 2;
    // tip at top (small Y), fat base at bottom (large Y)
    const tipY    = size * 0.04;
    const baseY   = size * 0.84;
    const halfW   = size * 0.38;  // half-width at the widest point

    // ── Teardrop clip path ────────────────────────────────────────────────
    // Pointed tip at top, rounded base at bottom.
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.bezierCurveTo(cx + halfW * 1.1, size * 0.28, cx + halfW, baseY, cx, baseY);
    ctx.bezierCurveTo(cx - halfW,       baseY,        cx - halfW * 1.1, size * 0.28, cx, tipY);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    // Outer colour fill: hot base (yellow-white) → orange → deep red → transparent tip
    const outer = ctx.createRadialGradient(cx, baseY * 0.88, 0, cx, baseY * 0.80, size * 0.72);
    outer.addColorStop(0.00, 'rgba(255, 255, 220, 0.98)');
    outer.addColorStop(0.18, 'rgba(255, 200,  40, 0.90)');
    outer.addColorStop(0.42, 'rgba(255,  60,   0, 0.65)');
    outer.addColorStop(0.68, 'rgba(180,  15,   0, 0.28)');
    outer.addColorStop(1.00, 'rgba( 80,   0,   0, 0.00)');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, size, size);

    // Bright inner core — offset toward base so the root looks hottest
    const inner = ctx.createRadialGradient(cx, baseY * 0.76, 0, cx, baseY * 0.76, size * 0.22);
    inner.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
    inner.addColorStop(0.4, 'rgba(255, 255, 200, 0.38)');
    inner.addColorStop(1.0, 'rgba(255, 200,  60, 0.00)');
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, size, size);

    ctx.restore(); // end clip

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture: tex, width: size, height: size };
}

// Ember texture: tiny bright dot
function createEmberTexture(gl, size = 32) {
    const canvas  = document.createElement('canvas');
    canvas.width  = canvas.height = size;
    const ctx     = canvas.getContext('2d');
    const half    = size / 2;

    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0.00, 'rgba(255, 255, 200, 1.0)');
    g.addColorStop(0.30, 'rgba(255, 140, 20,  0.9)');
    g.addColorStop(0.65, 'rgba(200, 40,  0,   0.4)');
    g.addColorStop(1.00, 'rgba(100, 0,   0,   0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture: tex, width: size, height: size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Temperature → color  (pure function, no alloc)
//   t : normalised age [0→1]
//   temp : emitter "heat" [0.5→1.0]
//   out : [r, g, b] written into the provided 3-element array
// ─────────────────────────────────────────────────────────────────────────────
const _col = new Float32Array(3);
function tempToColor(t, temp) {
    // Colour ramp: white-yellow → orange → red → dark red
    //   stop 0 (t=0):   [1.0, 1.0, 0.9*temp]
    //   stop 1 (t=0.25):[1.0, 0.7*temp, 0.05]
    //   stop 2 (t=0.55):[0.9, 0.22, 0.02]
    //   stop 3 (t=1):   [0.5, 0.05, 0.0]

    if (t < 0.25) {
        const f = t / 0.25;
        _col[0] = 1.0;
        _col[1] = 1.0  + f * (0.7 * temp - 1.0);
        _col[2] = 0.9 * temp * (1 - f) + 0.05 * f;
    } else if (t < 0.55) {
        const f = (t - 0.25) / 0.30;
        _col[0] = 1.0  + f * (0.9 - 1.0);
        _col[1] = 0.7 * temp * (1 - f) + 0.22 * f;
        _col[2] = 0.05 * (1 - f) + 0.02 * f;
    } else {
        const f = (t - 0.55) / 0.45;
        _col[0] = 0.9  + f * (0.5 - 0.9);
        _col[1] = 0.22 + f * (0.05 - 0.22);
        _col[2] = 0.02 * (1 - f);
    }
    return _col;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emitter defaults
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_EMITTER = {
    x: 0,
    y: 0,
    active: true,
    /** Flame particles per second */
    rate: 60,
    /** Upward launch direction (default = straight up in canvas Y-down coords) */
    direction: -Math.PI / 2,
    /** Half-angle spread in radians (tight = more vertical flames) */
    spread: 0.20,
    /** [min, max] launch speed (px/s) */
    speed: [60, 130],
    /** [min, max] flame lifetime (s) */
    lifetime: [0.55, 1.3],
    /** [min, max] scale at birth */
    startScale: [14, 28],
    /** [min, max] scale at peak (~30% into life) */
    peakScale: [24, 46],
    /** [min, max] scale at death */
    endScale: [3, 10],
    /** [min, max] alpha at birth (additive so keep ≤ 1) */
    startAlpha: [0.65, 1.0],
    /** [min, max] scaleX / scaleY ratio — keep < 1 for elongated flame shapes */
    aspectRatio: [0.30, 0.52],
    /** Sinusoidal sway frequency range [min, max] cycles/sec */
    turbFreq: [3, 8],
    /** Sinusoidal sway amplitude (px) — scales with particle size automatically */
    turbAmp: 0.28,
    /**
     * How strongly lateral particles are pulled back to the center axis over
     * their lifetime.  0 = no pull.  Good range: 4–18.
     * Pull is near-zero at birth and ramps up as t^2.5 toward death,
     * so early flight is free but all paths converge to a point at the tip.
     * Particles further from the center axis at spawn receive proportionally
     * stronger pull.
     */
    convergence: 10,
    /** Vertical acceleration (px/s²), negative = upward */
    gravity: -18,
    /** Embers per second (0 = disabled) */
    emberRate: 6,
    /** [min, max] ember lifetime (s) */
    emberLifetime: [1.2, 2.8],
    /** [min, max] ember pixel size */
    emberSize: [2, 5],
    /** [min, max] ember launch speed */
    emberSpeed: [30, 90],
    /** Heat [0.5–1.0]: affects core brightness & colour saturation */
    heat: 0.85,
    /** Width of the emitter base (px) — randomises spawn X within ±width/2 */
    width: 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// FireSystem
// ─────────────────────────────────────────────────────────────────────────────
export class FireSystem {
    /**
     * @param {import('../rendering/Renderer.js').Renderer2D} renderer
     * @param {{
     *   maxFlames?:  number,
     *   maxEmbers?:  number,
     *   zIndex?:     number,
     *   textureSize?: number,
     * }} opts
     */
    constructor(renderer, opts = {}) {
        this._renderer = renderer;
        this._maxF     = opts.maxFlames  ?? 3000;
        this._maxE     = opts.maxEmbers  ?? 800;
        this._turbAmp  = opts.turbAmp    ?? 0.28;  // global sway amplitude multiplier
        this._emitters = [];

        const gl = renderer.gl;

        // ── flame pool (SOA) ──────────────────────────────────────────────
        this._fData  = new Float32Array(this._maxF * FLAME_STRIDE);
        this._fAlive = new Uint8Array(this._maxF);
        this._fFree  = new Int32Array(this._maxF);
        this._fHead  = this._maxF - 1;
        for (let i = 0; i < this._maxF; i++) this._fFree[i] = i;

        // ── ember pool (SOA) ──────────────────────────────────────────────
        this._eData  = new Float32Array(this._maxE * EMBER_STRIDE);
        this._eAlive = new Uint8Array(this._maxE);
        this._eFree  = new Int32Array(this._maxE);
        this._eHead  = this._maxE - 1;
        for (let i = 0; i < this._maxE; i++) this._eFree[i] = i;

        // ── textures ──────────────────────────────────────────────────────
        this._fireTex  = createFireTexture(gl, opts.textureSize ?? 128);
        this._emberTex = createEmberTexture(gl, 32);

        // ── instanced groups ──────────────────────────────────────────────
        const quad = buildTexturedSquare(1, 1);
        const zBase = opts.zIndex ?? 40;

        this._flameGroup = renderer.createInstancedGroup({
            vertices:     quad.vertices,
            indices:      quad.indices,
            texCoords:    quad.texCoords,
            texture:      this._fireTex,
            maxInstances: this._maxF,
            zIndex:       zBase,
            blendMode:    BlendMode.ADDITIVE,
        });

        this._emberGroup = renderer.createInstancedGroup({
            vertices:     quad.vertices,
            indices:      quad.indices,
            texCoords:    quad.texCoords,
            texture:      this._emberTex,
            maxInstances: this._maxE,
            zIndex:       zBase + 1,
            blendMode:    BlendMode.ADDITIVE,
        });

        // ── per-emitter spawn accumulators ────────────────────────────────
        this._accFlame = new WeakMap();
        this._accEmber = new WeakMap();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Create and register a new fire emitter.
     * @param {Partial<typeof DEFAULT_EMITTER>} config
     * @returns {object} Handle whose properties can be mutated at any time.
     */
    createEmitter(config = {}) {
        const em = Object.assign({}, DEFAULT_EMITTER, config);
        this._emitters.push(em);
        this._accFlame.set(em, 0);
        this._accEmber.set(em, 0);
        return em;
    }

    /** Remove an emitter; existing particles play out naturally. */
    removeEmitter(em) {
        const i = this._emitters.indexOf(em);
        if (i !== -1) this._emitters.splice(i, 1);
    }

    /**
     * Call once per frame before renderer.drawFrame().
     * @param {number} dt  Delta time in seconds.
     */
    update(dt) {
        this._spawnAll(dt);
        this._updateFlames(dt);
        this._updateEmbers(dt);
    }

    /** Release all GPU resources. */
    destroy() {
        const gl = this._renderer.gl;
        this._renderer.removeInstancedGroup(this._flameGroup);
        this._renderer.removeInstancedGroup(this._emberGroup);
        gl.deleteTexture(this._fireTex.texture);
        gl.deleteTexture(this._emberTex.texture);
        this._emitters.length = 0;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    _spawnAll(dt) {
        for (const em of this._emitters) {
            if (!em.active) continue;

            // flames
            let accF = this._accFlame.get(em) + em.rate * dt;
            const nF = Math.floor(accF);
            this._accFlame.set(em, accF - nF);
            for (let s = 0; s < nF; s++) this._spawnFlame(em);

            // embers
            if (em.emberRate > 0) {
                let accE = this._accEmber.get(em) + em.emberRate * dt;
                const nE = Math.floor(accE);
                this._accEmber.set(em, accE - nE);
                for (let s = 0; s < nE; s++) this._spawnEmber(em);
            }
        }
    }

    _spawnFlame(em) {
        if (this._fHead < 0) return;
        const i    = this._fFree[this._fHead--];
        const base = i * FLAME_STRIDE;
        const d    = this._fData;

        const angle = em.direction + rand(-em.spread, em.spread);
        const spd   = rand(...em.speed);
        const life  = rand(...em.lifetime);
        const ps    = rand(...em.peakScale);

        const spawnX = em.x + rand(-em.width * 0.5, em.width * 0.5);
        // How far this particle is from the center axis, normalised by half-width
        // (clamped so even zero-width emitters work).  Outer = 1, center = 0.
        const halfW   = Math.max(em.width * 0.5, 1);
        const lateral = (spawnX - em.x) / halfW;   // [-1, 1]

        d[base + FF_X]          = spawnX;
        d[base + FF_Y]          = em.y + rand(-2, 2);
        d[base + FF_VX]         = Math.cos(angle) * spd * 0.35; // mostly vertical
        d[base + FF_VY]         = Math.sin(angle) * spd + em.gravity * rand(0.7, 1.0);
        // Very little rotation — keeps the teardrop shape upright
        d[base + FF_ROT]        = rand(-0.06, 0.06);
        d[base + FF_ROT_V]      = rand(-0.12, 0.12);
        d[base + FF_LIFE]       = life;
        d[base + FF_MAX_LIFE]   = life;
        d[base + FF_TEMP]       = em.heat * rand(0.85, 1.0);
        d[base + FF_BASE_SCALE] = ps;
        d[base + FF_ASPECT]     = rand(...em.aspectRatio);
        d[base + FF_TURB_PHASE] = rand(0, Math.PI * 2);
        d[base + FF_TURB_FREQ]  = rand(...em.turbFreq) * Math.PI * 2; // → rad/s
        d[base + FF_SPAWN_CX]   = em.x;
        // Convergence strength: proportional to lateral offset squared so center
        // particles are nearly undisturbed while outer ones are pulled hard.
        d[base + FF_CONVERGENCE] = em.convergence * (lateral * lateral);

        this._fAlive[i] = 1;
    }

    _spawnEmber(em) {
        if (this._eHead < 0) return;
        const i    = this._eFree[this._eHead--];
        const base = i * EMBER_STRIDE;
        const d    = this._eData;

        // Embers shoot outward at random angles with some upward bias
        const angle = em.direction + rand(-Math.PI * 0.4, Math.PI * 0.4);
        const spd   = rand(...em.emberSpeed);
        const life  = rand(...em.emberLifetime);

        d[base + FE_X]        = em.x + rand(-em.width * 0.4, em.width * 0.4);
        d[base + FE_Y]        = em.y + rand(-em.width * 0.2, em.width * 0.2);
        d[base + FE_VX]       = Math.cos(angle) * spd;
        d[base + FE_VY]       = Math.sin(angle) * spd;
        d[base + FE_ROT]      = rand(0, Math.PI * 2);
        d[base + FE_ROT_V]    = rand(-3, 3);
        d[base + FE_LIFE]     = life;
        d[base + FE_MAX_LIFE] = life;
        d[base + FE_SIZE]     = rand(...em.emberSize);

        this._eAlive[i] = 1;
    }

    _updateFlames(dt) {
        this._flameGroup.clear();
        const d = this._fData;

        for (let i = 0; i < this._maxF; i++) {
            if (!this._fAlive[i]) continue;

            const base = i * FLAME_STRIDE;

            d[base + FF_LIFE] -= dt;
            if (d[base + FF_LIFE] <= 0) {
                this._fAlive[i] = 0;
                this._fFree[++this._fHead] = i;
                continue;
            }

            // normalised age [0 → 1]
            const t    = 1 - d[base + FF_LIFE] / d[base + FF_MAX_LIFE];

            // ── Convergence: pull lateral particles toward the center axis ──
            // ease = t^2.5  — near 0 at birth, ramps steeply near death
            const ease = t * t * Math.sqrt(t);  // t^2.5
            const dx   = d[base + FF_X] - d[base + FF_SPAWN_CX];
            // centripetal acceleration — proportional to current offset and strength
            const ax   = -dx * d[base + FF_CONVERGENCE] * ease * 60;
            d[base + FF_VX] += ax * dt;

            // Sinusoidal sway — amplitude grows with age so tips flicker more
            const elapsed = d[base + FF_MAX_LIFE] - d[base + FF_LIFE];
            const sway    = Math.sin(elapsed * d[base + FF_TURB_FREQ] + d[base + FF_TURB_PHASE])
                            * d[base + FF_BASE_SCALE] * d[base + FF_ASPECT] * this._turbAmp
                            * (0.6 + t * 1.4);

            d[base + FF_X]   += (d[base + FF_VX] + sway) * dt;
            d[base + FF_Y]   += d[base + FF_VY] * dt;
            d[base + FF_ROT] += d[base + FF_ROT_V] * dt;

            // gentle horizontal drag (also helps prevent convergence overshoot)
            d[base + FF_VX] *= 1 - dt * (2.0 + ease * 6.0);

            const temp = d[base + FF_TEMP];

            // scaleY = height, scaleX = height * aspect  →  tall narrow flame
            let scaleY;
            if (t < 0.3) {
                scaleY = d[base + FF_BASE_SCALE] * (t / 0.3);
            } else {
                scaleY = d[base + FF_BASE_SCALE] * (1 - (t - 0.3) / 0.7);
            }
            scaleY = Math.max(scaleY, 0.5);
            // as the flame ages it widens slightly (loses its thin tip)
            const scaleX = scaleY * d[base + FF_ASPECT] * (1 + t * 0.45);

            // alpha: quick fade-in, sustained, then fade-out at end
            const fadeIn  = Math.min(t * 8, 1.0);
            const fadeOut = 1 - Math.max((t - 0.55) / 0.45, 0);
            const alpha   = clamp(fadeIn * fadeOut, 0, 1);

            const col = tempToColor(t, temp);

            this._flameGroup.addInstanceRaw(
                d[base + FF_X],
                d[base + FF_Y],
                d[base + FF_ROT],
                scaleX, scaleY,   // narrow × tall
                col[0], col[1], col[2],
                alpha,
                0, 0
            );
        }
    }

    _updateEmbers(dt) {
        this._emberGroup.clear();
        const d = this._eData;

        for (let i = 0; i < this._maxE; i++) {
            if (!this._eAlive[i]) continue;

            const base = i * EMBER_STRIDE;

            d[base + FE_LIFE] -= dt;
            if (d[base + FE_LIFE] <= 0) {
                this._eAlive[i] = 0;
                this._eFree[++this._eHead] = i;
                continue;
            }

            // gravity pulls embers down gently
            d[base + FE_VY]  += 60 * dt;
            d[base + FE_VX]  *= 1 - dt * 0.4;

            d[base + FE_X]   += d[base + FE_VX] * dt;
            d[base + FE_Y]   += d[base + FE_VY] * dt;
            d[base + FE_ROT] += d[base + FE_ROT_V] * dt;

            const t     = 1 - d[base + FE_LIFE] / d[base + FE_MAX_LIFE];
            const size  = d[base + FE_SIZE] * (1 - t * 0.6);

            // embers: bright at birth, cool to orange-red, then fade
            const fadeOut = 1 - Math.max((t - 0.5) / 0.5, 0);
            const alpha   = clamp(Math.min(t * 30, 1.0) * fadeOut, 0, 1);

            // colour: yellow-white → orange → dark red
            const r = 1.0;
            const g = clamp(0.9 - t * 0.8, 0.05, 0.9);
            const b = clamp(0.3 - t * 0.3, 0.0,  0.3);

            this._emberGroup.addInstanceRaw(
                d[base + FE_X],
                d[base + FE_Y],
                d[base + FE_ROT],
                size, size,
                r, g, b,
                alpha,
                0, 0
            );
        }
    }
}
