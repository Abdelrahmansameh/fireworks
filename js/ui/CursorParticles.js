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

        // Grab / skeleton outline mode
        this._grabOutlinePoints = null;  // {x,y}[] hull when grabbing, null otherwise
        this._outlinePerimLength = 0;
        this._outlineSpawnAccum = 0;

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

        // Debug overlay — 2D canvas drawn over the WebGL canvas
        // Enable from the browser console: window.debugSkeletonOutline = true
        this._debugCanvas = null;
        this._debugCtx = null;
        this._initDebugCanvas();
    }

    _initDebugCanvas() {
        const glCanvas = this._renderer.canvas;
        const dbg = document.createElement('canvas');
        dbg.style.position = 'absolute';
        dbg.style.top = '0';
        dbg.style.left = '0';
        dbg.style.pointerEvents = 'none';
        dbg.style.zIndex = '9998';
        glCanvas.parentElement?.appendChild(dbg);
        this._debugCanvas = dbg;
        this._debugCtx = dbg.getContext('2d');
        this._resizeDebugCanvas();
        window.addEventListener('resize', () => this._resizeDebugCanvas());
    }

    _resizeDebugCanvas() {
        if (!this._debugCanvas) return;
        const glCanvas = this._renderer.canvas;
        const rect = glCanvas.getBoundingClientRect();
        this._debugCanvas.width  = rect.width;
        this._debugCanvas.height = rect.height;
        this._debugCanvas.style.width  = rect.width  + 'px';
        this._debugCanvas.style.height = rect.height + 'px';
    }

    // -----------------------------------------------------------------------

    /**
     * Set (or clear) the skeleton outline to use for grab-mode particle spawning.
     * @param {{x:number,y:number}[]|null} points — convex hull vertices, or null to disable
     */
    setGrabOutline(points) {
        const newPoints = (points && points.length >= 2) ? points : null;
        // Only reset the accumulator when switching between grab/no-grab, not every frame
        const wasGrabbing = this._grabOutlinePoints !== null;
        const isGrabbing  = newPoints !== null;
        if (!wasGrabbing && isGrabbing) {
            this._outlineSpawnAccum = 0;
        }
        this._grabOutlinePoints = newPoints;
        if (!this._grabOutlinePoints) {
            this._outlinePerimLength = 0;
            return;
        }
        // Cache total perimeter length for uniform sampling
        let len = 0;
        const pts = this._grabOutlinePoints;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            len += Math.sqrt(dx * dx + dy * dy);
        }
        this._outlinePerimLength = len;
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

        if (!offscreen && !this._overUI && !this._grabOutlinePoints) {
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

        // ---- Skeleton outline grab spawning ----
        if (this._grabOutlinePoints && this._outlinePerimLength > 0) {
            this._outlineSpawnAccum += dt;
            const spawnCount = Math.floor(this._outlineSpawnAccum * cfg.OUTLINE_SPAWN_RATE);
            if (spawnCount > 0) {
                this._outlineSpawnAccum -= spawnCount / cfg.OUTLINE_SPAWN_RATE;
                const pts = this._grabOutlinePoints;
                const n = pts.length;
                for (let s = 0; s < spawnCount; s++) {
                    if (this._particles.length >= cfg.MAX_PARTICLES) break;
                    // Pick a random distance along the perimeter
                    let target = Math.random() * this._outlinePerimLength;
                    let traveled = 0;
                    for (let i = 0; i < n; i++) {
                        const a = pts[i];
                        const b = pts[(i + 1) % n];
                        const edgeDx = b.x - a.x;
                        const edgeDy = b.y - a.y;
                        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
                        if (traveled + edgeLen >= target || i === n - 1) {
                            const t = edgeLen > 0 ? (target - traveled) / edgeLen : 0;
                            const spawnX = a.x + edgeDx * t;
                            const spawnY = a.y + edgeDy * t;
                            // Outward normal: right-perpendicular of CCW edge (y-up)
                            const nx = edgeLen > 0 ?  edgeDy / edgeLen : 0;
                            const ny = edgeLen > 0 ? -edgeDx / edgeLen : 1;
                            const isWhite = Math.random() < cfg.OUTLINE_COLOR_WHITE_PROB;
                            const col = isWhite ? cfg.OUTLINE_COLOR_WHITE : cfg.OUTLINE_COLOR_CYAN;
                            const speed = cfg.OUTLINE_PARTICLE_SPEED + Math.random() * cfg.OUTLINE_PARTICLE_SPEED_VAR;
                            this._particles.push({
                                x: spawnX,
                                y: spawnY,
                                vx: nx * speed,
                                vy: ny * speed,
                                life: cfg.OUTLINE_PARTICLE_LIFE,
                                decay: cfg.OUTLINE_PARTICLE_DECAY,
                                size: cfg.OUTLINE_PARTICLE_SIZE + Math.random() * cfg.OUTLINE_PARTICLE_SIZE_VAR,
                                r: col[0], g: col[1], b: col[2],
                            });
                            break;
                        }
                        traveled += edgeLen;
                    }
                }
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

        // ---- Cursor glow dot (hidden in outline/grab mode) ----
        if (!offscreen && !this._overUI && !this._grabOutlinePoints) {
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

        // ---- Debug: draw convex hull outline (enable with: window.debugSkeletonOutline = true) ----
        const ctx = this._debugCtx;
        if (!ctx) return;
        ctx.clearRect(0, 0, this._debugCanvas.width, this._debugCanvas.height);

        if (!window.debugSkeletonOutline) return;
        if (!this._grabOutlinePoints || this._grabOutlinePoints.length < 2) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (let i = 0; i < this._grabOutlinePoints.length; i++) {
            const p = this._grabOutlinePoints[i];
            const s = this._renderer.worldToScreen(p.x, p.y);
            // worldToScreen returns client coords; offset by canvas rect
            const rect = this._renderer.canvas.getBoundingClientRect();
            const sx = s.x - rect.left;
            const sy = s.y - rect.top;
            if (i === 0) ctx.moveTo(sx, sy);
            else         ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw a small dot at each hull vertex
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 80, 255, 0.95)';
        for (const p of this._grabOutlinePoints) {
            const s = this._renderer.worldToScreen(p.x, p.y);
            const rect = this._renderer.canvas.getBoundingClientRect();
            ctx.beginPath();
            ctx.arc(s.x - rect.left, s.y - rect.top, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

export default CursorParticles;
