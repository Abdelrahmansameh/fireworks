import * as R from '../rendering/Renderer.js';
const { BlendMode, buildTexturedSquare } = R;
import cfg from './CursorParticlesConfig.js';


class CursorParticles {
    constructor(renderer) {
        this._renderer = renderer;
        this._group = null;

        this.mouseX = cfg.OFFSCREEN_CLIENT_NEG;
        this.mouseY = cfg.OFFSCREEN_CLIENT_NEG;
        this._prevX = cfg.OFFSCREEN_CLIENT_NEG;
        this._prevY = cfg.OFFSCREEN_CLIENT_NEG;
        this._particles = [];
        this._idleTimer = 0;
        this._overUI = false;

        this._grabOutlinePoints = null;
        this._outlinePerimLength = 0;
        this._outlineSpawnAccum = 0;

        // Click pulse state (visual feedback on pointerdown)
        this._clickPulseTimer = 0; // seconds remaining for the click pulse

        document.documentElement.classList.add('cursor-hidden');

        window.addEventListener('pointermove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;

            const overUI = !!e.target.closest('#ui-root, #overlay, #confirmation-dialog, #notification');
            if (overUI && !this._overUI) {
                this._prevX = null;
                this._prevY = null;
            }
            if (overUI !== this._overUI) {
                this._overUI = overUI;
                document.documentElement.classList.toggle('cursor-hidden', !overUI);
            }
        });

        // Pointer down: create a small burst and trigger a pulse
        window.addEventListener('pointerdown', (e) => {
            const overUI = !!e.target.closest('#ui-root, #overlay, #confirmation-dialog, #notification');
            if (overUI) return;
            const wp = this._toWorld(e.clientX, e.clientY);
            this._spawnClick(wp.x, wp.y);
            this._clickPulseTimer = cfg.CLICK_PULSE_DURATION;
        });

        this._init();

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
        this._debugCanvas.width = rect.width;
        this._debugCanvas.height = rect.height;
        this._debugCanvas.style.width = rect.width + 'px';
        this._debugCanvas.style.height = rect.height + 'px';
    }


    setGrabOutline(points) {
        const newPoints = (points && points.length >= 2) ? points : null;
        const wasGrabbing = this._grabOutlinePoints !== null;
        const isGrabbing = newPoints !== null;
        if (!wasGrabbing && isGrabbing) {
            this._outlineSpawnAccum = 0;
        }
        this._grabOutlinePoints = newPoints;
        if (!this._grabOutlinePoints) {
            for (const p of this._particles) {
                if (p._outlinePending) {
                    delete p._outlinePending;
                    delete p._outlineTargetX; delete p._outlineTargetY;
                    delete p._outlineNormalX; delete p._outlineNormalY;
                }
            }
            this._outlinePerimLength = 0;
            return;
        }
        this._prevX = null;
        this._prevY = null;
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
        if (!wasGrabbing && isGrabbing) {
            const pts = this._grabOutlinePoints;
            const n = pts.length;
            for (let pi = 0; pi < this._particles.length; pi++) {
                const p = this._particles[pi];
                let bestDist2 = Infinity;
                let tgtX = 0, tgtY = 0, nx = 0, ny = 1;
                for (let j = 0; j < n; j++) {
                    const a = pts[j];
                    const b = pts[(j + 1) % n];
                    const ex = b.x - a.x;
                    const ey = b.y - a.y;
                    const el2 = ex * ex + ey * ey;
                    let t = 0;
                    if (el2 > 0) {
                        t = ((p.x - a.x) * ex + (p.y - a.y) * ey) / el2;
                        if (t < 0) t = 0;
                        else if (t > 1) t = 1;
                    }
                    const projX = a.x + ex * t;
                    const projY = a.y + ey * t;
                    const dx = p.x - projX;
                    const dy = p.y - projY;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestDist2) {
                        bestDist2 = d2;
                        tgtX = projX; tgtY = projY;
                        const el = Math.sqrt(el2);
                        if (el > 0) {
                            nx = ey / el;
                            ny = -ex / el;
                        } else {
                            nx = 0; ny = 1;
                        }
                    }
                }
                p._outlineTargetX = tgtX;
                p._outlineTargetY = tgtY;
                p._outlineNormalX = nx;
                p._outlineNormalY = ny;
                p._outlinePending = true;
                const dx = tgtX - p.x;
                const dy = tgtY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    const approachSpeed = Math.min(cfg.OUTLINE_PARTICLE_SPEED * 0.8, dist * cfg.OUTLINE_APPROACH_SPEED_FACTOR);
                    p.vx = (dx / dist) * approachSpeed;
                    p.vy = (dy / dist) * approachSpeed;
                }
            }
        }
    }


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
        if (this._overUI) return;
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

    /** Spawn a click burst: larger, faster particles for immediate feedback. */
    _spawnClick(wx, wy) {
        if (this._overUI) return;
        const count = cfg.SPAWN_CLICK_COUNT || 12;
        for (let i = 0; i < count; i++) {
            if (this._particles.length >= cfg.MAX_PARTICLES) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = (cfg.PARTICLE_SPEED_BASE + (cfg.CLICK_PARTICLE_SPEED_BOOST || 120)) + Math.random() * (cfg.PARTICLE_SPEED_VAR + (cfg.CLICK_PARTICLE_SPEED_VAR || 80));
            const isGold = Math.random() < cfg.GOLD_PROBABILITY;
            const color = isGold ? cfg.COLOR_GOLD : cfg.COLOR_DEFAULT;
            this._particles.push({
                x: wx,
                y: wy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: cfg.CLICK_PARTICLE_LIFE || (cfg.PARTICLE_LIFE_BASE + 0.2),
                decay: cfg.CLICK_PARTICLE_DECAY || cfg.PARTICLE_DECAY_BASE,
                size: (cfg.PARTICLE_SIZE_BASE + Math.random() * cfg.PARTICLE_SIZE_VAR) * (cfg.CLICK_PARTICLE_SIZE_MULT || 1.6),
                r: color[0],
                g: color[1],
                b: color[2],
            });
        }
    }


    update(dt) {
        if (!this._group) return;

        const mx = this.mouseX;
        const my = this.mouseY;
        const offscreen = mx < cfg.OFFSCREEN_X_THRESHOLD;

        // Update click pulse timer
        if (this._clickPulseTimer > 0) {
            this._clickPulseTimer -= dt;
            if (this._clickPulseTimer < 0) this._clickPulseTimer = 0;
        }

        if (!offscreen && !this._grabOutlinePoints) {
            if (!this._prevX || !this._prevY) {
                this._prevX = mx;
                this._prevY = my;
            }
            
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
                            const nx = edgeLen > 0 ? edgeDy / edgeLen : 0;
                            const ny = edgeLen > 0 ? -edgeDx / edgeLen : 1;
                            const isGold = Math.random() < cfg.GOLD_PROBABILITY;
                            const col = isGold ? cfg.COLOR_GOLD : cfg.COLOR_DEFAULT;
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

            if (this._grabOutlinePoints && p._outlinePending) {
                const dxT = p._outlineTargetX - p.x;
                const dyT = p._outlineTargetY - p.y;
                const dist2T = dxT * dxT + dyT * dyT;
                const arrivalDist = cfg.OUTLINE_ARRIVAL_DIST;
                if (dist2T <= arrivalDist * arrivalDist) {
                    const nx = p._outlineNormalX ?? 0;
                    const ny = p._outlineNormalY ?? 1;
                    const speed = cfg.OUTLINE_PARTICLE_SPEED + Math.random() * cfg.OUTLINE_PARTICLE_SPEED_VAR;
                    p.x = p._outlineTargetX;
                    p.y = p._outlineTargetY;
                    p.vx = nx * speed;
                    p.vy = ny * speed;
                    p.life = cfg.OUTLINE_PARTICLE_LIFE;
                    p.decay = cfg.OUTLINE_PARTICLE_DECAY;
                    p.size = cfg.OUTLINE_PARTICLE_SIZE + Math.random() * cfg.OUTLINE_PARTICLE_SIZE_VAR;
                    const isGold = Math.random() < cfg.GOLD_PROBABILITY;
                    const col = isGold ? cfg.COLOR_GOLD : cfg.COLOR_DEFAULT;
                    p.r = col[0]; p.g = col[1]; p.b = col[2];
                    // Clear outline pending markers
                    delete p._outlinePending;
                    delete p._outlineTargetX; delete p._outlineTargetY;
                    delete p._outlineNormalX; delete p._outlineNormalY;
                } else {
                    // Continue approaching the target (speed scales with remaining distance, capped)
                    const dist = Math.sqrt(dist2T);
                    const approachSpeed = Math.min(cfg.OUTLINE_PARTICLE_SPEED * 0.8, dist * cfg.OUTLINE_APPROACH_SPEED_FACTOR);
                    p.vx = (dxT / dist) * approachSpeed;
                    p.vy = (dyT / dist) * approachSpeed;
                }
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const gravity = this._grabOutlinePoints && this._outlinePerimLength > 0 ? cfg.OUTLINE_GRAVITY : cfg.GRAVITY;
            p.vy -= gravity * dt;
            const f = Math.pow(cfg.FRICTION_BASE, dt * cfg.FRICTION_FPS);
            p.vx *= f;
            p.vy *= f;
            p.life -= p.decay * dt;
            if (p.life <= 0) this._particles.splice(i, 1);
        }

        this._group.clear();

        for (const p of this._particles) {
            const alpha = p.life * p.life;
            if (alpha <= 0) continue;
            const s = p.size * (cfg.SIZE_LIFE_MIN + p.life * cfg.SIZE_LIFE_MAX) * cfg.SIZE_SCALE;
            this._group.addInstanceRaw(p.x, p.y, 0, s, s, p.r, p.g, p.b, alpha);
        }

        if (!offscreen && !this._overUI ) {
            const wp = this._toWorld(mx, my);
            let sizeMult = this._grabOutlinePoints ? cfg.GLOW_MULITPLIER_OUTLINE : 1;
            // Expand glow briefly on click
            if (this._clickPulseTimer > 0) {
                const t = this._clickPulseTimer / cfg.CLICK_PULSE_DURATION;
                const clickMul = 1 + (cfg.CLICK_GLOW_MULTIPLIER || 1.2) * t;
                sizeMult = Math.max(sizeMult, clickMul);
            }
            // Optional pulse ring instance for visual feedback
            if (this._clickPulseTimer > 0) {
                const t = this._clickPulseTimer / cfg.CLICK_PULSE_DURATION;
                const pulseSize = (cfg.CLICK_GLOW_SIZE || 80) * t;
                const pulseAlpha = (cfg.CLICK_GLOW_ALPHA || 0.7) * t;
                this._group.addInstanceRaw(
                    wp.x,
                    wp.y,
                    0,
                    pulseSize,
                    pulseSize,
                    ...(cfg.CLICK_GLOW_COLOR || cfg.GLOW_OUTER_COLOR),
                    pulseAlpha,
                );
            }
            this._group.addInstanceRaw(
                wp.x,
                wp.y,
                0,
                cfg.GLOW_OUTER_SIZE * sizeMult,
                cfg.GLOW_OUTER_SIZE * sizeMult,
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
                cfg.GLOW_CORE_SIZE * sizeMult,
                cfg.GLOW_CORE_SIZE * sizeMult,
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
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
            else ctx.lineTo(sx, sy);
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
