import * as R from '../rendering/Renderer.js';
const { BlendMode, buildTexturedSquare } = R;
import cfg from './CursorParticlesConfig.js';


class CursorParticles {
    constructor(renderer) {
        this._renderer = renderer;
        this._group = null;

        this.mouseX = cfg.OFFSCREEN_CLIENT_NEG; // CSS clientX / clientY
        this.mouseY = cfg.OFFSCREEN_CLIENT_NEG;
        this._prevX = cfg.OFFSCREEN_CLIENT_NEG;
        this._prevY = cfg.OFFSCREEN_CLIENT_NEG;
        this._particles = [];
        this._idleTimer = 0;
        this._overUI = false;

        // Start with hidden cursor; will restore when over UI elements
        document.documentElement.classList.add('cursor-hidden');

        // Use pointermove so position updates reliably even when a mouse button is held
        window.addEventListener('pointermove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;

            // Detect if the pointer is over a UI element (anything outside the game canvas)
            const overUI = !!e.target.closest('#ui-root, #overlay, #confirmation-dialog, #notification');
            if (overUI !== this._overUI) {
                this._overUI = overUI;
                document.documentElement.classList.toggle('cursor-hidden', !overUI);
            }
        });

        this._init();
    }

    // -----------------------------------------------------------------------

    async _init() {
        const r = this._renderer;
        await r.loadTexture('assets/glow.png', 'cursor_glow');
        const tex = r.getTexture('cursor_glow');
        const quad = buildTexturedSquare(cfg.SPRITE_QUAD_SIZE, cfg.SPRITE_QUAD_SIZE);
        this._group = r.createInstancedGroup({
            vertices: quad.vertices,
            indices: quad.indices,
            texCoords: quad.texCoords,
            texture: tex,
            maxInstances: cfg.GROUP_MAX_INSTANCES,
            blendMode: BlendMode.ADDITIVE,
            zIndex: cfg.GROUP_Z_INDEX,
        });
    }

    /** Convert CSS screen coords to world coords. */
    _toWorld(cssX, cssY) {
        return this._renderer.screenToCanvas(cssX, cssY);
    }

    /**
     * Spawn `count` sparkle particles at world position (wx, wy).
     * vxBias / vyBias are in world units (Y-up).
     */
    _spawnAt(wx, wy, vxBias = 0, vyBias = 0, count = cfg.DEFAULT_SPAWN_COUNT) {
        for (let i = 0; i < count; i++) {
            if (this._particles.length >= cfg.MAX_PARTICLES) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = cfg.PARTICLE_SPEED_BASE + Math.random() * cfg.PARTICLE_SPEED_VAR;
            const isGold = Math.random() < cfg.GOLD_PROBABILITY;
            const color = isGold ? cfg.COLOR_GOLD : cfg.COLOR_DEFAULT;
            this._particles.push({
                x: wx,
                y: wy,
                vx: Math.cos(angle) * speed + vxBias * cfg.SPAWN_BIAS_SCALE,
                vy: Math.sin(angle) * speed + vyBias * cfg.SPAWN_BIAS_SCALE,
                life: cfg.PARTICLE_LIFE_BASE + Math.random() * cfg.PARTICLE_LIFE_VAR,
                decay: cfg.PARTICLE_DECAY_BASE + Math.random() * cfg.PARTICLE_DECAY_VAR,
                size: cfg.PARTICLE_SIZE_BASE + Math.random() * cfg.PARTICLE_SIZE_VAR,
                r: color[0],
                g: color[1],
                b: color[2],
            });
        }
    }

    // -----------------------------------------------------------------------

    update(dt) {
        if (!this._group) return;

        const mx = this.mouseX;
        const my = this.mouseY;
        const offscreen = mx < cfg.OFFSCREEN_X_THRESHOLD;

        if (!offscreen && !this._overUI) {
            // Initialise prev position on first valid frame
            if (this._prevX < cfg.PREV_INIT_THRESHOLD) {
                this._prevX = mx;
                this._prevY = my;
            }

            // ---- Movement trail ----
            const dx = mx - this._prevX; // CSS pixels, X-right
            const dy = my - this._prevY; // CSS pixels, Y-down
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > cfg.MOVEMENT_DIST_THRESHOLD) {
                const steps = Math.min(Math.ceil(dist / cfg.MOVEMENT_STEP_DIV), cfg.MOVEMENT_MAX_STEPS);
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const sp = this._toWorld(
                        this._prevX + dx * t,
                        this._prevY + dy * t,
                    );
                    // Negate dy for world Y-up: screen-down = world-negative-Y
                    this._spawnAt(sp.x, sp.y, dx * cfg.MOVEMENT_BIAS_SCALE, -dy * cfg.MOVEMENT_BIAS_SCALE, cfg.SPAWN_MOVEMENT_COUNT);
                }
                this._prevX = mx;
                this._prevY = my;
            }

            this._idleTimer += dt;
            if (this._idleTimer > cfg.IDLE_SPAWN_INTERVAL) {
                this._idleTimer = 0;
                const wp = this._toWorld(mx, my);
                this._spawnAt(wp.x, wp.y, 0, 0, cfg.SPAWN_IDLE_COUNT);
            }
        }

        

        // ---- Integrate & age particles ----
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= cfg.GRAVITY * dt;                         // gravity pulls down (world Y-up)
            const f = Math.pow(cfg.FRICTION_BASE, dt * cfg.FRICTION_FPS);       // velocity friction
            p.vx *= f;
            p.vy *= f;
            p.life -= p.decay * dt;
            if (p.life <= 0) this._particles.splice(i, 1);
        }

        // ---- Fill instanced group ----
        this._group.clear();

        for (const p of this._particles) {
            const alpha = p.life * p.life; // ease-out
            if (alpha <= 0) continue;
            const s = p.size * (cfg.SIZE_LIFE_MIN + p.life * cfg.SIZE_LIFE_MAX) * cfg.SIZE_SCALE;
            this._group.addInstanceRaw(p.x, p.y, 0, s, s, p.r, p.g, p.b, alpha);
        }

        // ---- Cursor glow dot ----
        if (!offscreen && !this._overUI) {
            const wp = this._toWorld(mx, my);
            // Soft outer halo (slightly whitened)
            this._group.addInstanceRaw(
                wp.x,
                wp.y,
                0,
                cfg.GLOW_OUTER_SIZE,
                cfg.GLOW_OUTER_SIZE,
                cfg.GLOW_OUTER_COLOR[0],
                cfg.GLOW_OUTER_COLOR[1],
                cfg.GLOW_OUTER_COLOR[2],
                cfg.GLOW_OUTER_ALPHA,
            );
            // Bright core
            this._group.addInstanceRaw(
                wp.x,
                wp.y,
                0,
                cfg.GLOW_CORE_SIZE,
                cfg.GLOW_CORE_SIZE,
                cfg.GLOW_CORE_COLOR[0],
                cfg.GLOW_CORE_COLOR[1],
                cfg.GLOW_CORE_COLOR[2],
                cfg.GLOW_CORE_ALPHA,
            );
            
        }
    }

    render() {
        // Rendering is handled automatically by renderer2D.drawFrame()
        // via the registered instanced group.
    }
}

export default CursorParticles;
