/**
 * settingsPanel.js
 * Renders the Settings tab — static fields moved out of index.html into JS.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <h3>Options</h3>
        <div class="recipes-option">
            <label>Music Volume: <span id="music-volume-value">15</span>%</label>
            <input type="range" id="music-volume" min="0" max="100" value="15" step="1">
        </div>
        <div class="recipes-option">
            <label>SFX Volume: <span id="sfx-volume-value">15</span>%</label>
            <input type="range" id="sfx-volume" min="0" max="100" value="15" step="1">
        </div>
        <div class="recipes-option">
            <label><input type="checkbox" id="toggle-floating-sparkle" checked> Show Floating Sparkle Counter</label>
        </div>
        <h3>Save / Load</h3>
        <button id="save-progress">Save Progress</button>
        <div class="recipes-option">
            <label>Serialized Data (copy/paste):</label>
            <textarea id="serialized-data" style="width:100%;height:100px;"></textarea>
        </div>
        <button id="load-progress">Load Progress</button>
        <br>
        <button id="reset-launchers" class="danger-button">Reset All Auto-Launchers</button>
        <br>
        <button id="reset-upgrades" class="danger-button">Reset All Upgrades</button>
        <br>
        <button id="reset-game" class="danger-button">Reset Everything</button>
    `;

    container.appendChild(panel);
}
