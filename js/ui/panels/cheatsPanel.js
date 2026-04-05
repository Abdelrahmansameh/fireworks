/**
 * cheatsPanel.js
 * Renders the Cheats (Developer) tab — static fields moved out of index.html.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `

        <fieldset>
            <legend>Add Resources</legend>
            <div class="recipes-option">
                <label>Sparkles:</label>
                <input type="number" id="cheat-sparkles-amount" value="10000000" step="1000" min="0">
                <button id="cheat-add-sparkles">Add Sparkles</button>
            </div>
            <div class="recipes-option">
                <label>Gold:</label>
                <input type="number" id="cheat-gold-amount" value="1000000" step="100" min="0">
                <button id="cheat-add-gold">Add Gold</button>
            </div>
        </fieldset>

        <fieldset>
            <legend>Upgrades</legend>
            <button id="cheat-unlock-upgrades">Unlock All Upgrades</button>
            <button id="cheat-unlock-everything">Unlock Everything</button>
        </fieldset>

        <fieldset>
            <legend>Drones</legend>
            <div class="recipes-option">
                <label>Count:</label>
                <input type="number" id="cheat-drone-count" value="1" step="1" min="1" max="20">
                <button id="cheat-spawn-drone">Spawn Drone(s)</button>
            </div>
        </fieldset>
    `;

    container.appendChild(panel);
}
