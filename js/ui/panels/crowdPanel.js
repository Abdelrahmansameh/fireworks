/**
 * crowdPanel.js
 * Renders the Crowd tab.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <div id="crowd-gold-upgrade" class="upgrade-card" hidden>
            <div id="crowd-gold-upgrade-name"></div>
            <div id="crowd-gold-upgrade-effect"></div>
            <button id="crowd-gold-upgrade-buy" class="upgrade-buy-button" data-upgrade-id="crowd_fireworks"></button>
        </div>
        <div class="crowd-info">
            <h3>Fans: <span id="crowd-count">0</span></h3>
            <p>Fans toss gold.</p>
            <p>Fireworks launched: <span id="current-sps">0</span></p>
            <p>Next fan: <span id="next-threshold">—</span> fireworks</p>
            <p id="crowd-full" hidden>Full house!</p>
            <div class="progress-container">
                <div id="threshold-progress" class="progress-bar"></div>
            </div>
        </div>
    `;

    container.appendChild(panel);
}
