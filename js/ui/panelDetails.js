import { BUILDING_TYPES } from '../config/BuildingConfig.js';
import { fireworksForCrowd } from '../systems/ProductionRates.js';

const compact = value => new Intl.NumberFormat('en', {
    notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: value < 100 ? 1 : 0,
}).format(Number.isFinite(value) ? value : 0);

const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element && element.textContent !== String(value)) element.textContent = value;
};

/** Additional presentation behavior, initialized once after the live game. */
export function initializePanelDetails(game) {
    if (game._disposePanelDetails) game._disposePanelDetails();
    const removers = [];
    const on = (element, name, callback, options) => {
        if (!element) return;
        element.addEventListener(name, callback, options);
        removers.push(() => element.removeEventListener(name, callback, options));
    };
    const notify = message => game.ui?.showNotification(message);
    let lastSavedAt = Date.now();
    const originalSave = game.saveProgress;
    const observedSave = function (...args) {
        const result = originalSave.apply(this, args);
        if (!this.headless && !this._isRestoring) lastSavedAt = Date.now();
        return result;
    };
    game.saveProgress = observedSave;

    // Save writes to the same storage as autosave. Copy exports the existing format.
    on(document.getElementById('save-progress'), 'click', event => {
        event.stopImmediatePropagation();
        try {
            game.saveProgress();
            setText('save-status', 'Saved just now');
            notify('Progress saved!');
        } catch (error) {
            notify('Could not save progress.');
            console.error(error);
        }
    }, true);

    on(document.getElementById('copy-save-code'), 'click', async () => {
        const textarea = document.getElementById('serialized-data');
        const data = game.serializeGameData();
        textarea.value = data;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
            await navigator.clipboard.writeText(data);
            notify('Save code copied!');
        } catch {
            const editor = document.getElementById('save-code-editor');
            const loadButton = document.getElementById('load-progress');
            editor.hidden = false;
            loadButton.setAttribute('aria-expanded', 'true');
            textarea.focus();
            textarea.select();
            notify(document.execCommand('copy') ? 'Save code copied!' : 'Select and copy your save code.');
        }
    });

    on(document.getElementById('load-progress'), 'click', event => {
        const editor = document.getElementById('save-code-editor');
        if (editor.hidden) {
            event.stopImmediatePropagation();
            editor.hidden = false;
            event.currentTarget.setAttribute('aria-expanded', 'true');
            document.getElementById('serialized-data').focus();
        }
    }, true);

    // A completed pointer or keyboard hold dispatches the existing confirmation.
    document.querySelectorAll('.hold-reset').forEach(button => {
        let timer = null;
        let allowConfirmation = false;
        let holding = false;
        let completed = false;
        let activePointer = null;
        const cancel = () => {
            clearTimeout(timer);
            timer = null;
            holding = false;
            activePointer = null;
            button.classList.remove('is-holding');
        };
        const start = () => {
            cancel();
            holding = true;
            completed = false;
            button.classList.add('is-holding');
            setText('reset-hold-status', `Keep holding ${button.textContent} for 1.2 seconds.`);
            timer = setTimeout(() => {
                holding = false;
                completed = true;
                button.classList.remove('is-holding');
                allowConfirmation = true;
                setText('reset-hold-status', 'Hold complete. Confirm the reset.');
                button.click();
                allowConfirmation = false;
            }, 1200);
        };
        on(button, 'click', event => {
            if (!allowConfirmation) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!completed) setText('reset-hold-status', 'Hold for 1.2 seconds to confirm.');
            }
        }, true);
        on(button, 'pointerdown', event => {
            if (event.button !== 0) return;
            start();
            activePointer = event.pointerId;
            button.setPointerCapture?.(event.pointerId);
        });
        on(button, 'pointermove', event => {
            if (!holding || activePointer !== event.pointerId) return;
            const bounds = button.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) cancel();
        });
        ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(name => on(button, name, cancel));
        on(button, 'keydown', event => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            if (!event.repeat && !holding) start();
        });
        on(button, 'keyup', event => {
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                cancel();
            }
        });
        removers.push(cancel);
    });

    function refresh() {
        const seconds = Math.max(0, Math.floor((Date.now() - lastSavedAt) / 1000));
        setText('save-status', seconds < 2 ? 'Saved just now' : seconds < 60 ? `Saved ${seconds}s ago` : `Saved ${Math.floor(seconds / 60)}m ago`);

        for (const [key, type] of Object.entries(BUILDING_TYPES)) {
            const count = game.buildingManager.getBuildingsByType(key).length;
            const tile = document.querySelector(`[data-building-count="${key}"]`);
            if (tile) {
                tile.textContent = count;
                const unlocked = game.isBuildingTypeUnlocked(key);
                tile.hidden = !unlocked;
                const tab = tile.closest('.building-type-tab');
                tab?.querySelector('.building-tile-lock')?.toggleAttribute('hidden', unlocked);
                tab?.setAttribute('aria-label', `${tab.title}, ${unlocked ? count : 'locked'}`);
                tab?.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
                const button = document.getElementById(`buy-${type.id}`);
                button?.setAttribute('aria-label', `Buy ${type.name} for ${game.buildingManager.getBuyCost(key)} ${type.currency}`);
            }
            const empty = document.querySelector(`[data-building-empty="${key}"]`);
            if (empty) empty.hidden = count > 0;
            const description = document.querySelector(`[data-building-description="${key}"]`);
            if (!description) continue;
            if (key === 'AUTO_LAUNCHER') description.textContent = `Fires every ${(type.baseSpawnInterval * (game.launcherStats?.spawnIntervalMultiplier ?? 1)).toFixed(1)}s`;
            if (key === 'RESOURCE_GENERATOR') description.textContent = `Makes ${compact(type.baseProductionRate * (game.generatorStats?.productionRateMultiplier ?? 1) * (game.baseSparkleMultiplier ?? 1))} sparkles/s`;
            if (key === 'CATAPULT') description.textContent = `Throws a fan every ${((type.baseFireInterval ?? type.fireInterval) * (game.catapultStats?.fireIntervalMultiplier ?? 1)).toFixed(1)}s`;
            if (key === 'DRONE_HUB') description.textContent = `Sends a drone every ${(type.baseSpawnInterval * (game.droneHubStats?.spawnIntervalMultiplier ?? 1)).toFixed(1)}s`;
        }

        const tracker = game.statsTracker;
        if (!tracker) return;
        const total = tracker.getRollingRate('sparkles');
        const sources = ['auto_launcher', 'resource_generator', 'crowd_catch', 'manual', 'drone'];
        const rates = Object.fromEntries(sources.map(source => [source, tracker.getRollingRate('sparkles', source)]));
        rates.other = Math.max(0, total - Object.values(rates).reduce((sum, rate) => sum + rate, 0));
        setText('stats-sparkles-hero', compact(total));
        setText('stats-gold-hero', compact(tracker.getRollingRate('gold')));
        setText('stats-fireworks-hero', compact(tracker.getFireworksPerSecond()));
        setText('crowd-gold-rate', `+${compact(tracker.getRollingRate('gold', 'crowd'))}/s`);
        setText('stats-other-rate', compact(rates.other));
        document.querySelectorAll('[data-source-rate]').forEach(element => { element.textContent = compact(rates[element.dataset.sourceRate]); });
        document.querySelectorAll('[data-production-source]').forEach(element => {
            const rate = rates[element.dataset.productionSource];
            element.style.width = `${total > 0 ? (rate / total) * 100 : 0}%`;
        });
        document.getElementById('stats-drones-row').hidden = rates.drone <= 0;
        document.getElementById('stats-other-row').hidden = rates.other < 0.01;
        document.querySelector('.stats-production-bar')?.setAttribute('aria-label', `Sparkle production: ${sources.map(source => `${source.replaceAll('_', ' ')} ${compact(rates[source])} per second`).join(', ')}`);

        const count = game.crowd?.people.length ?? 0;
        const next = fireworksForCrowd(count + 1, game);
        const current = Math.max(0, fireworksForCrowd(count, game));
        const progress = Number.isFinite(next) ? Math.max(0, Math.min(100, (game.fireworkSystem.fireworkCount - current) / Math.max(0.000001, next - current) * 100)) : 100;
        document.querySelector('.crowd-panel [role="progressbar"]')?.setAttribute('aria-valuenow', String(Math.round(progress)));
    }

    refresh();
    const interval = setInterval(refresh, 250);
    const dispose = () => {
        clearInterval(interval);
        removers.forEach(remove => remove());
        if (game.saveProgress === observedSave) game.saveProgress = originalSave;
        delete game._disposePanelDetails;
    };
    game._disposePanelDetails = dispose;
    return dispose;
}
