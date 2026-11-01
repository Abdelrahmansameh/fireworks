/**
 * WorldRuler.js
 * Dev tool: place two markers on the game canvas and read the distance
 * between them in world units. Markers stay pinned to world space as the
 * camera pans/zooms, and can be dragged after placement.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class WorldRuler {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.points = [];          // world-space { x, y }, max 2
        this.dragIndex = -1;
        this.onChange = null;      // (ruler) => void, for the panel readout

        this.svg = document.createElementNS(SVG_NS, 'svg');
        Object.assign(this.svg.style, {
            position: 'fixed', inset: '0', width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '9999', display: 'none',
        });
        this.svg.innerHTML = `
            <line class="ruler-line" stroke="#000" stroke-opacity="0.6" stroke-width="4" />
            <line class="ruler-line" stroke="#ffe14d" stroke-width="2" stroke-dasharray="6 4" />
            <g class="ruler-marker"><circle r="7" fill="#ffe14d" stroke="#000" stroke-width="2" /><text dy="-12">A</text></g>
            <g class="ruler-marker"><circle r="7" fill="#4dd8ff" stroke="#000" stroke-width="2" /><text dy="-12">B</text></g>
            <text class="ruler-label"></text>
        `;
        for (const t of this.svg.querySelectorAll('text')) {
            Object.assign(t.style, {
                font: 'bold 13px monospace', fill: '#fff', paintOrder: 'stroke',
                stroke: '#000', strokeWidth: '3px', textAnchor: 'middle',
            });
        }
        this.lines = this.svg.querySelectorAll('.ruler-line');
        this.markers = [...this.svg.querySelectorAll('.ruler-marker')];
        this.label = this.svg.querySelector('.ruler-label');
        this.markers.forEach((m, i) => {
            m.style.cursor = 'grab';
            m.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dragIndex = i;
            });
        });
        document.body.appendChild(this.svg);

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = () => { this.dragIndex = -1; };
        this._onKeyDown = (e) => { if (e.key === 'Escape') this.setActive(false); };
        this._tick = this._tick.bind(this);
    }

    setActive(active) {
        if (this.active === active) return;
        this.active = active;
        this.svg.style.display = active ? 'block' : 'none';
        const canvas = document.getElementById('game-canvas');
        if (canvas) canvas.style.cursor = active ? 'crosshair' : '';
        if (active) {
            // Capture phase so placement clicks never reach gameplay handlers.
            window.addEventListener('pointerdown', this._onPointerDown, true);
            window.addEventListener('pointermove', this._onPointerMove);
            window.addEventListener('pointerup', this._onPointerUp);
            window.addEventListener('keydown', this._onKeyDown);
            this._raf = requestAnimationFrame(this._tick);
        } else {
            window.removeEventListener('pointerdown', this._onPointerDown, true);
            window.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            window.removeEventListener('keydown', this._onKeyDown);
            cancelAnimationFrame(this._raf);
            this.dragIndex = -1;
        }
        this.onChange?.(this);
    }

    clear() {
        this.points = [];
        this.onChange?.(this);
    }

    /** { dx, dy, distance } in world units, or null until both markers exist. */
    getMeasurement() {
        if (this.points.length < 2) return null;
        const [a, b] = this.points;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return { a, b, dx, dy, distance: Math.hypot(dx, dy) };
    }

    _onPointerDown(e) {
        if (e.target?.id !== 'game-canvas' || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const p = this.game.screenToWorld(e.clientX, e.clientY);
        if (this.points.length >= 2) this.points = [];
        this.points.push({ x: p.x, y: p.y });
        // Keep dragging the marker just placed so press-drag-release works too.
        this.dragIndex = this.points.length - 1;
        this.onChange?.(this);
    }

    _onPointerMove(e) {
        if (this.dragIndex < 0) return;
        const p = this.game.screenToWorld(e.clientX, e.clientY);
        this.points[this.dragIndex] = { x: p.x, y: p.y };
        this.onChange?.(this);
    }

    _tick() {
        if (!this.active) return;
        this._draw();
        this._raf = requestAnimationFrame(this._tick);
    }

    _draw() {
        const r = this.game.renderer2D;
        const screen = this.points.map(p => r.worldToScreen(p.x, p.y));
        this.markers.forEach((m, i) => {
            const s = screen[i];
            m.style.display = s ? '' : 'none';
            m.style.pointerEvents = s ? 'auto' : 'none';
            if (s) m.setAttribute('transform', `translate(${s.x} ${s.y})`);
        });
        const m = this.getMeasurement();
        for (const line of this.lines) {
            line.style.display = m ? '' : 'none';
            if (m) {
                line.setAttribute('x1', screen[0].x); line.setAttribute('y1', screen[0].y);
                line.setAttribute('x2', screen[1].x); line.setAttribute('y2', screen[1].y);
            }
        }
        this.label.style.display = m ? '' : 'none';
        if (m) {
            this.label.setAttribute('x', (screen[0].x + screen[1].x) / 2);
            this.label.setAttribute('y', (screen[0].y + screen[1].y) / 2 - 10);
            this.label.textContent = `${m.distance.toFixed(2)} u`;
        }
    }
}
