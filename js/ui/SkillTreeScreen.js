/**
 * SkillTreeScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen skill-tree overlay — completely isolated from the game canvas.
 *
 * Isolation strategy
 * ──────────────────
 * • A single `#skill-tree-screen` div sits at z-index 9999 with
 *   `position:fixed; inset:0`.  While visible it intercepts ALL pointer
 *   events, so nothing reaches the game layer beneath.
 * • open() hides #game-container and .top-bar-container so the live game
 *   canvas isn't visible behind the tree.
 * • close() restores those elements. The game loop keeps running untouched.
 * • All event listeners are scoped to the screen's own canvas / elements.
 *   No global side-effects leak into or out of the skill tree.
 *
 * Rendering
 * ─────────
 * • Uses a plain Canvas 2D context (device-pixel-ratio aware) with its own
 *   requestAnimationFrame loop that only runs while the screen is open.
 * • Tree-space → screen-space via panX/panY/zoom; drag to pan, wheel to zoom.
 * • Tooltip is a DOM element (position:fixed) layered on the canvas.
 */

import { SKILL_TREE_CONFIG } from './SkillTreeConfig.js';

// ── Constants ────────────────────────────────────────────────────────────────

const NODE_RADIUS = 23;   // tree-space pixels — scale with zoom (reduced)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.82;

// ── SkillTreeScreen ──────────────────────────────────────────────────────────

export class SkillTreeScreen {

    constructor(game) {
        this.game = game;
        this.isOpen = false;

        // View state
        this.panX = 0;
        this.panY = 0;
        this.zoom = DEFAULT_ZOOM;

        // Interaction state
        this._raf = null;
        this._time = 0;
        this._hoveredId = null;
        this._isDragging = false;
        this._dragMoved = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._lastMouseX = 0;
        this._lastMouseY = 0;
        this._lastClientX = 0;
        this._lastClientY = 0;

        this._buildDOM();
        this._bindEvents();
    }

    // ── DOM construction ─────────────────────────────────────────────────────

    _buildDOM() {
        // Main overlay -------------------------------------------------------
        this.container = document.createElement('div');
        this.container.id = 'skill-tree-screen';

        // Canvas (fills the entire overlay) ----------------------------------
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'skill-tree-canvas';
        this.ctx = this.canvas.getContext('2d');

        // Back button --------------------------------------------------------
        this.backBtn = document.createElement('button');
        this.backBtn.id = 'skill-tree-back';
        this.backBtn.textContent = '← Back to Game';

        // Resource display ---------------------------------------------------
        this.resourceDisplay = document.createElement('div');
        this.resourceDisplay.id = 'skill-tree-resources';

        // Tooltip (DOM, position:fixed so it always floats above canvas) -----
        this.tooltip = document.createElement('div');
        this.tooltip.id = 'skill-tree-tooltip';


        // Assemble -----------------------------------------------------------
        this.container.appendChild(this.canvas);
        this.container.appendChild(this.backBtn);
        this.container.appendChild(this.resourceDisplay);
        // Tooltip is appended to body so position:fixed works without stacking issues
        document.body.appendChild(this.tooltip);
        document.body.appendChild(this.container);
    }



    // ── Event binding ────────────────────────────────────────────────────────

    _bindEvents() {
        // Back button
        this.backBtn.addEventListener('click', () => this.close());

        // Escape key — scoped check so it only fires when open
        document.addEventListener('keydown', (e) => {
            if (this.isOpen && e.key === 'Escape') {
                e.stopPropagation();
                this.close();
            }
        });

        // Zoom on wheel
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const W = this.canvas.width / this._dpr();
            const H = this.canvas.height / this._dpr();

            // Keep the tree point under the mouse stationary
            const txBefore = (mx - W / 2 - this.panX) / this.zoom;
            const tyBefore = (my - H / 2 - this.panY) / this.zoom;
            this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
            this.panX = mx - W / 2 - txBefore * this.zoom;
            this.panY = my - H / 2 - tyBefore * this.zoom;
        }, { passive: false });

        // Pan drag
        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            this._isDragging = true;
            this._dragMoved = false;
            this._dragStartX = e.clientX;
            this._dragStartY = e.clientY;
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.cursor = 'grabbing';
        });

        this.canvas.addEventListener('pointermove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (this._isDragging) {
                const dx = e.clientX - this._lastMouseX;
                const dy = e.clientY - this._lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this._lastMouseX = e.clientX;
                this._lastMouseY = e.clientY;
                if (Math.abs(e.clientX - this._dragStartX) > 4 ||
                    Math.abs(e.clientY - this._dragStartY) > 4) {
                    this._dragMoved = true;
                }
                // Hide tooltip while panning
                this._hoveredId = null;
                this.tooltip.style.display = 'none';
            } else {
                this._updateHover(mx, my, e.clientX, e.clientY);
            }
        });

        this.canvas.addEventListener('pointerup', (e) => {
            const moved = this._dragMoved;
            this._isDragging = false;
            this._dragMoved = false;
            this.canvas.style.cursor = 'grab';

            if (!moved) {
                // Treat as a tap/click
                const rect = this.canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const nodeId = this._hitTest(mx, my);
                if (nodeId) this._onNodeClick(nodeId);
            }
        });

        this.canvas.addEventListener('pointercancel', () => {
            this._isDragging = false;
            this._dragMoved = false;
            this.canvas.style.cursor = 'grab';
        });

        this.canvas.addEventListener('pointerleave', () => {
            if (!this._isDragging) {
                this._hoveredId = null;
                this.tooltip.style.display = 'none';
            }
        });

        // Re-size canvas when window resizes
        window.addEventListener('resize', () => {
            if (this.isOpen) this._resize();
        });
    }

    // ── Public API ───────────────────────────────────────────────────────────

    open() {
        this.isOpen = true;
        this.container.style.display = 'block';
        this.tooltip.style.display = 'none';
        this._hoveredId = null;

        // Isolate from game layer
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'none';
        document.querySelectorAll('.top-bar-container')
            .forEach(el => el.style.display = 'none');

        this._resize();
        this._updateResourceDisplay();
        this._startLoop();
    }

    close() {
        this.isOpen = false;
        this.container.style.display = 'none';
        this.tooltip.style.display = 'none';
        this._hoveredId = null;
        this._stopLoop();

        // Restore game layer
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'block';
        document.querySelectorAll('.top-bar-container')
            .forEach(el => el.style.display = '');
    }

    /** Called by UIManager.renderUpgrades() when the tree is open. */
    refresh() {
        this._updateResourceDisplay();
        // If a tooltip is currently shown, re-render its contents so text
        // (cost / level etc.) updates immediately after a purchase.
        if (this._hoveredId) {
            const cx = this._lastClientX || Math.round(window.innerWidth / 2);
            const cy = this._lastClientY || Math.round(window.innerHeight / 2);
            this._showTooltip(this._hoveredId, cx, cy);
        }
    }

    // ── Sizing ───────────────────────────────────────────────────────────────

    _dpr() { return window.devicePixelRatio || 1; }

    _resize() {
        const dpr = this._dpr();
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
    }

    // ── Render loop ──────────────────────────────────────────────────────────

    _startLoop() {
        const loop = (ts) => {
            if (!this.isOpen) return;
            this._time = ts;
            this._render();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    _stopLoop() {
        if (this._raf != null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    // ── Core render ──────────────────────────────────────────────────────────

    _render() {
        const ctx = this.ctx;
        const dpr = this._dpr();
        const W = this.canvas.width / dpr;
        const H = this.canvas.height / dpr;

        // Always start from a clean DPR-scaled transform
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        this._drawBackground(ctx, W, H);
        this._drawEdges(ctx, W, H);
        this._drawNodes(ctx, W, H);
    }

    // ── Background ───────────────────────────────────────────────────────────

    _drawBackground(ctx, W, H) {
        // Deep-space gradient
        const grad = ctx.createRadialGradient(
            W * 0.5, H * 0.5, 0,
            W * 0.5, H * 0.5, Math.max(W, H) * 0.75
        );
        grad.addColorStop(0, '#0b0f1e');
        grad.addColorStop(1, '#020408');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Deterministic stars (seeded so they never jitter)
        let seed = 7919;
        const lcg = () => { seed = ((seed * 214013 + 2531011) >>> 0); return (seed & 0xFFFF) / 0xFFFF; };
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        for (let i = 0; i < 130; i++) {
            const px = lcg() * W;
            const py = lcg() * H;
            const pr = lcg() * 1.3 + 0.25;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Subtle vignette
        const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.28, W * 0.5, H * 0.5, H * 0.75);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    }

    // ── Coordinate helpers ───────────────────────────────────────────────────

    /** Convert tree-space (tx,ty) → CSS-pixel screen position. */
    _toScreen(tx, ty, W, H) {
        return {
            x: W * 0.5 + this.panX + tx * this.zoom,
            y: H * 0.5 + this.panY + ty * this.zoom,
        };
    }

    /** Convert CSS-pixel screen position → tree-space. */
    _toTree(sx, sy, W, H) {
        return {
            x: (sx - W * 0.5 - this.panX) / this.zoom,
            y: (sy - H * 0.5 - this.panY) / this.zoom,
        };
    }

    // ── Edges ────────────────────────────────────────────────────────────────

    _drawEdges(ctx, W, H) {
        const cfg = SKILL_TREE_CONFIG;

        for (const [id, node] of Object.entries(cfg.nodes)) {
            const childState = this._getNodeState(id);
            if (childState === 'hidden') continue;

            const parentId = node.treeParent;
            if (parentId === 'ROOT') continue;

            const parentPos = cfg.nodes[parentId];
            if (!parentPos) continue;

            const parentState = this._getNodeState(parentId);
            const from = this._toScreen(parentPos.x, parentPos.y, W, H);
            const to = this._toScreen(node.x, node.y, W, H);
            const branchColor = cfg.branches[node.branch]?.color ?? '#888';

            const alpha = (childState === 'locked' || childState === 'insufficient') ? 0.25
                : (parentState === 'maxed' || parentState === 'available' || parentState === 'partial') ? 0.75
                    : 0.35;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Smooth S-curve bezier
            const cpX1 = from.x;
            const cpY1 = from.y + (to.y - from.y) * 0.5;
            const cpX2 = to.x;
            const cpY2 = from.y + (to.y - from.y) * 0.5;

            // Glowing line
            ctx.shadowColor = branchColor;
            ctx.shadowBlur = 6 * this.zoom;

            const lineGrad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
            lineGrad.addColorStop(0, branchColor + 'cc');
            lineGrad.addColorStop(1, branchColor + '44');

            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 2.5 * this.zoom;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, to.x, to.y);
            ctx.stroke();

            ctx.restore();
        }
    }

    // ── Nodes ────────────────────────────────────────────────────────────────

    _drawNodes(ctx, W, H) {
        const t = this._time * 0.001; // seconds

        // Upgrade nodes
        for (const [id, node] of Object.entries(SKILL_TREE_CONFIG.nodes)) {
            const state = this._getNodeState(id);
            if (state === 'hidden') continue;
            const s = this._toScreen(node.x, node.y, W, H);
            this._drawUpgradeNode(ctx, id, node, state, s.x, s.y, t);
        }
    }

    // ── Upgrade node ─────────────────────────────────────────────────────────

    _drawUpgradeNode(ctx, id, layout, state, sx, sy, t) {
        const progression = this.game.progression;
        const def = progression.getUpgradeDef(id);
        const level = def ? progression.getUpgradeLevel(id) : 0;
        const maxLevel = def?.maxLevel ?? 1;
        const branchColor = SKILL_TREE_CONFIG.branches[layout.branch]?.color ?? '#888';
        const r = NODE_RADIUS * this.zoom;
        const isHovered = this._hoveredId === id;
        // Simple hash so nodes pulse at slightly different phases
        const phaseOffset = (id.charCodeAt(0) + id.charCodeAt(id.length - 1)) * 0.37;

        ctx.save();

        // ── Visual parameters per state ──────────────────────────────────
        let alpha = 1;
        let fillColor = '#0d1117';
        let borderColor = branchColor;
        let borderWidth = 2;
        let shadowColor = null;
        let shadowBlur = 0;

        switch (state) {
            case 'available': {
                const pulse = 0.55 + 0.45 * Math.sin(t * 2.4 + phaseOffset);
                shadowColor = branchColor;
                shadowBlur = (16 + 12 * pulse) * this.zoom;
                borderWidth = 2.5;
                break;
            }
            case 'partial': {
                const pulse = 0.65 + 0.35 * Math.sin(t * 1.8 + phaseOffset);
                shadowColor = branchColor;
                shadowBlur = (10 + 8 * pulse) * this.zoom;
                borderWidth = 2.5;
                fillColor = '#0e1520';
                break;
            }
            case 'partial_insufficient':
                alpha = 0.55;
                borderColor = branchColor + '88';
                fillColor = '#0e1520';
                break;
            case 'insufficient':
                alpha = 0.45;
                borderColor = branchColor + '55';
                break;
            case 'locked':
                alpha = 0.28;
                borderColor = '#444';
                fillColor = '#080a0f';
                break;
            case 'maxed':
                const pulse = 0.55 + 0.45 * Math.sin(t * 2.4 + phaseOffset);
                shadowColor = branchColor;
                shadowBlur = (16 + 12 * pulse) * this.zoom;
                borderWidth = 2.5;
                break;
        }

        if (isHovered && state !== 'locked') {
            shadowColor = branchColor;
            shadowBlur = Math.max(shadowBlur, 22 * this.zoom);
            borderWidth = Math.max(borderWidth, 3);
        }

        ctx.globalAlpha = alpha;

        // ── Glow ─────────────────────────────────────────────────────────
        if (shadowColor && shadowBlur > 0) {
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
        }

        // ── Circle fill ──────────────────────────────────────────────────
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ── Circle border ────────────────────────────────────────────────
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth * this.zoom;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();

        // ── Level-progress arc (for partial / partial_insufficient / maxed) ─
        if (level > 0) {
            const fraction = level / maxLevel;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = branchColor + 'bb';
            ctx.lineWidth = 4 * this.zoom;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(sx, sy, r + 4 * this.zoom, -Math.PI * 0.5,
                -Math.PI * 0.5 + fraction * Math.PI * 2);
            ctx.stroke();
        }


        ctx.restore();
    }

    // ── Node state ───────────────────────────────────────────────────────────

    /**
     * Returns one of:
     *   'hidden'               — treeParent not purchased; node not drawn
     *   'locked'               — game-requirement not met; shown very dimly
     *   'insufficient'         — requirements met, level 0, can't afford
     *   'available'            — can purchase right now; highlighted + glowing
     *   'partial'              — level > 0, can still buy more; highlighted
     *   'partial_insufficient' — level > 0, but can't afford next level; dim
     *   'maxed'                — all levels purchased; golden
     */
    _getNodeState(id) {
        const layout = SKILL_TREE_CONFIG.nodes[id];
        if (!layout) return 'hidden';

        // Tree-parent gate: hide until direct visual parent is purchased
        if (layout.treeParent !== 'ROOT') {
            if (this.game.progression.getUpgradeLevel(layout.treeParent) < 1) return 'hidden';
        }

        const progression = this.game.progression;
        const def = progression.getUpgradeDef(id);
        if (!def) return 'hidden';

        const level = progression.getUpgradeLevel(id);
        const maxLevel = def.maxLevel ?? 1;

        if (level >= maxLevel) return 'maxed';

       
        const { visible } = progression.isVisible(id, this.game);
        if (!visible) return 'hidden';

        const { ok, reason } = progression.canPurchase(id, this.game);
        if (ok) return level > 0 ? 'partial' : 'available';

        // Only money is the issue
        if (reason === `Not enough ${def.currency}`) {
            return level > 0 ? 'partial_insufficient' : 'insufficient';
        }

        return 'locked';
    }

    // ── Hit testing ──────────────────────────────────────────────────────────

    _hitTest(screenX, screenY) {
        const dpr = this._dpr();
        const W = this.canvas.width / dpr;
        const H = this.canvas.height / dpr;

        for (const [id, node] of Object.entries(SKILL_TREE_CONFIG.nodes)) {
            if (this._getNodeState(id) === 'hidden') continue;
            const s = this._toScreen(node.x, node.y, W, H);
            const r = NODE_RADIUS * this.zoom;
            const dx = screenX - s.x;
            const dy = screenY - s.y;
            if (dx * dx + dy * dy <= r * r) return id;
        }
        return null;
    }

    // ── Hover / tooltip ──────────────────────────────────────────────────────

    _updateHover(canvasX, canvasY, clientX, clientY) {
        // remember last client coords so tooltip can be refreshed programmatically
        this._lastClientX = clientX;
        this._lastClientY = clientY;
        const newHovered = this._hitTest(canvasX, canvasY);

        if (newHovered !== this._hoveredId) {
            this._hoveredId = newHovered;
            if (newHovered) {
                this._showTooltip(newHovered, clientX, clientY);
            } else {
                this.tooltip.style.display = 'none';
            }
        } else if (newHovered) {
            this._positionTooltip(clientX, clientY);
        }
    }

    _showTooltip(id, clientX, clientY) {
        const progression = this.game.progression;
        const def = progression.getUpgradeDef(id);
        if (!def) return;

        const state = this._getNodeState(id);
        const level = progression.getUpgradeLevel(id);
        const maxLevel = def.maxLevel ?? 1;
        const cost = progression.getUpgradeCost(id);
        const layout = SKILL_TREE_CONFIG.nodes[id];
        const branchColor = SKILL_TREE_CONFIG.branches[layout?.branch]?.color ?? '#45a29e';
        const branchLabel = SKILL_TREE_CONFIG.branches[layout?.branch]?.label ?? '';

        let ctaHTML = '';


        const costHTML = (state !== 'maxed')
            ? `<div class="stt-cost">Cost: <strong>${cost.toLocaleString()}</strong> <em>${def.currency}</em></div>`
            : '';

        this.tooltip.innerHTML = `
            <div class="stt-name"  style="color:${branchColor}">${def.name}</div>
            <div class="stt-desc">${def.desc}</div>
            <div class="stt-level">Level ${level} / ${maxLevel}</div>
            ${costHTML}
            ${ctaHTML}
        `;

        // Set tooltip glow border to branch colour
        this.tooltip.style.borderColor = branchColor + '77';
        this.tooltip.style.boxShadow =
            `0 4px 28px rgba(0,0,0,0.65), 0 0 14px ${branchColor}22`;
        this.tooltip.style.display = 'block';
        this._positionTooltip(clientX, clientY);
    }

    _positionTooltip(clientX, clientY) {
        const MARGIN = 18;
        const tipW = this.tooltip.offsetWidth || 220;
        const tipH = this.tooltip.offsetHeight || 130;
        let tx = clientX + MARGIN;
        let ty = clientY - tipH * 0.5;

        if (tx + tipW > window.innerWidth - MARGIN) tx = clientX - tipW - MARGIN;
        if (ty < MARGIN) ty = MARGIN;
        if (ty + tipH > window.innerHeight - MARGIN) ty = window.innerHeight - tipH - MARGIN;

        this.tooltip.style.left = tx + 'px';
        this.tooltip.style.top = ty + 'px';
    }

    // ── Node click ───────────────────────────────────────────────────────────

    _onNodeClick(id) {
        const state = this._getNodeState(id);
        if (state === 'available' || state === 'partial') {
            this.game.buyUpgrade(id);
        }
        // other states: no-op (game.showNotification handles it if needed)
    }

    // ── Resource display ─────────────────────────────────────────────────────

    _updateResourceDisplay() {
        try {
            const sparkles = this.game.resourceManager.resources.sparkles;
            const gold = this.game.resourceManager.resources.gold;
            this.resourceDisplay.innerHTML = `
                <div class="str-row">
                    <span class="str-icon">✦</span>
                    <span class="str-amount">${sparkles.formatAmount()}</span>
                </div>
                <div class="str-row">
                    <span class="str-icon str-gold">◈</span>
                    <span class="str-amount">${gold.formatAmount()}</span>
                </div>
            `;
        } catch (_) {
            // Game may not be fully initialised on first call
        }
    }
}
