/**
 * FloatingSparkleNumber
 *
 * A single "+N" sparkle counter that floats near the cursor when fireworks are
 * launched. Rapid launches accumulate into the same element (the number ticks
 * up and the element pops); once launches stop the element fades up and away.
 *
 * One element is alive at a time. All state lives here — UIManager just calls
 * `add()`. No timeout/dataset juggling leaks into the rest of the UI.
 */

const COMBO_WINDOW_MS = 700;   // launches within this window accumulate
const FADE_DELAY_MS = 550;     // idle time before the number starts fading
const FADE_DURATION_MS = 650;  // how long the fade-up animation runs
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.6;
const SCALE_STEP = 0.04;       // growth per accumulated launch

function toCssColor(color) {
    if (!color) return null;
    if (typeof color === 'string') return color;
    if (typeof color.r === 'number') {
        const c = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        return `rgb(${c(color.r)}, ${c(color.g)}, ${c(color.b)})`;
    }
    return null;
}

function formatCount(n) {
    if (n < 1000) return Math.floor(n).toString();
    for (const [div, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
        if (n >= div) {
            const val = n / div;
            const str = (val < 10 ? val.toFixed(2) : val < 100 ? val.toFixed(1) : Math.floor(val).toString())
                .replace(/\.?0+$/, '');
            return str + suffix;
        }
    }
}

export class FloatingSparkleNumber {
    constructor(game) {
        this.game = game;
        this.enabled = true;

        this.el = null;        // the live floating element, or null
        this.total = 0;        // accumulated sparkles on the live element
        this.scale = MIN_SCALE;
        this.lastAddTime = 0;
        this.fadeTimer = null;
        this.removeTimer = null;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) this._remove();
    }

    /**
     * Show / accumulate a sparkle gain at a screen position.
     * @param {number} screenX
     * @param {number} screenY
     * @param {number} amount  sparkles earned by this launch
     * @param {string|{r,g,b}|null} color  rocket color (CSS string or 0..1 rgb)
     */
    add(screenX, screenY, amount, color = null) {
        if (!this.enabled || this.game.hideFloatingSparkles) return;
        if (!(amount > 0)) return;

        const now = performance.now();
        const isCombo = this.el && (now - this.lastAddTime) < COMBO_WINDOW_MS;
        this.lastAddTime = now;

        if (!isCombo) {
            this._remove();
            this.total = 0;
            this.scale = MIN_SCALE;
            this.el = this._createElement();
            document.body.appendChild(this.el);
        }

        this.total += amount;
        this.scale = Math.min(MAX_SCALE, this.scale + (isCombo ? SCALE_STEP : 0));

        const inner = this.el.firstChild;
        inner.textContent = `+${formatCount(this.total)}`;

        this.el.style.left = `${screenX}px`;
        this.el.style.top = `${screenY}px`;
        this.el.style.setProperty('--fsn-scale', this.scale.toFixed(3));
        const css = toCssColor(color);
        if (css) this.el.style.color = css;

        // Restart the pop animation.
        inner.classList.remove('pop');
        void inner.offsetWidth; // reflow so the animation replays
        inner.classList.add('pop');

        this._scheduleFade();
    }

    _createElement() {
        const el = document.createElement('div');
        el.className = 'floating-sparkle';
        el.style.setProperty('--fsn-scale', MIN_SCALE.toFixed(3));
        const inner = document.createElement('span');
        inner.className = 'floating-sparkle-inner';
        el.appendChild(inner);
        return el;
    }

    _scheduleFade() {
        clearTimeout(this.fadeTimer);
        clearTimeout(this.removeTimer);
        const el = this.el;
        this.fadeTimer = setTimeout(() => {
            if (el) el.classList.add('fading');
            this.removeTimer = setTimeout(() => {
                if (this.el === el) this._remove();
            }, FADE_DURATION_MS);
        }, FADE_DELAY_MS);
    }

    _remove() {
        clearTimeout(this.fadeTimer);
        clearTimeout(this.removeTimer);
        this.fadeTimer = null;
        this.removeTimer = null;
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }
}
