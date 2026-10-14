import { doodleIcon } from '../doodleIcons.js';

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel settings-panel';
    panel.innerHTML = `
        <section class="settings-section">
            <h3>Sound</h3>
          <div class="settings-sound-card">
            <div class="settings-slider-row">
                <label for="music-volume">${doodleIcon('music')}Music</label>
                <span class="settings-volume"><span id="music-volume-value">15</span>%</span>
                <input type="range" id="music-volume" min="0" max="100" value="15" step="1">
            </div>
            <div class="settings-slider-row">
                <label for="sfx-volume">${doodleIcon('booms')}Booms</label>
                <span class="settings-volume"><span id="sfx-volume-value">15</span>%</span>
                <input type="range" id="sfx-volume" min="0" max="100" value="15" step="1">
            </div>
          </div>
        </section>
        <section class="settings-section">
            <h3>Screen</h3>
            <label class="settings-switch-row" for="toggle-floating-sparkle">
                <span>Sparkle pop-ups</span>
                <input type="checkbox" id="toggle-floating-sparkle" role="switch" checked>
                <span class="settings-switch-track" aria-hidden="true"></span>
            </label>
        </section>
        <section class="settings-section">
            <h3>Save</h3>
          <div class="settings-save-card">
            <div class="settings-save-status">${doodleIcon('save')}<span id="save-status" role="status">Saved just now</span></div>
            <div class="settings-save-actions">
                <button type="button" id="save-progress">Save</button>
                <button type="button" id="copy-save-code">Copy code</button>
                <button type="button" id="load-progress" aria-expanded="false" aria-controls="save-code-editor">Load code</button>
            </div>
            <div id="save-code-editor" class="save-code-editor" hidden>
                <label for="serialized-data">Paste your save code</label>
                <textarea id="serialized-data" rows="4" spellcheck="false" placeholder="Paste a previously copied code here"></textarea>
                <p>Press Load code again to restore it.</p>
            </div>
          </div>
        </section>
        <section class="settings-section settings-reset-section">
            <div class="settings-section-heading"><h3>Reset</h3><span>hold to confirm</span></div>
            <div class="settings-reset-actions">
                <button type="button" id="reset-launchers" class="danger-button hold-reset" aria-description="Hold for 1.2 seconds to open confirmation">Launchers</button>
                <button type="button" id="reset-upgrades" class="danger-button hold-reset" aria-description="Hold for 1.2 seconds to open confirmation">Upgrades</button>
                <button type="button" id="reset-game" class="danger-button hold-reset" aria-description="Hold for 1.2 seconds to open confirmation">All</button>
            </div>
            <span id="reset-hold-status" class="sr-only" role="status"></span>
        </section>
    `;
    container.appendChild(panel);
}
