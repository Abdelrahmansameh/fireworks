import { doodleIcon } from '../doodleIcons.js';

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel crowd-panel';
    panel.innerHTML = `
      <div class="crowd-overview-card">
        <div class="crowd-summary">
            <div class="crowd-size"><span id="crowd-count">0</span><span id="crowd-count-label">fans</span></div>
            <span class="crowd-income">${doodleIcon('gold')}<span id="crowd-gold-rate">+0/s</span></span>
        </div>
        <div class="crowd-next-fan">
            <div class="crowd-progress-label" id="crowd-firework-progress"><span class="crowd-progress-title">Next fan</span><span id="current-sps">0</span><span class="crowd-progress-divider">/</span><span id="next-threshold">—</span></div>
            <p id="crowd-arrival-countdown" role="status" hidden></p>
            <p id="crowd-full" hidden>Full house!</p>
            <div class="progress-container" role="progressbar" aria-label="Progress toward the next fan" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div id="threshold-progress" class="progress-bar"></div>
            </div>
        </div>
      </div>
        <div id="crowd-gold-upgrade" class="upgrade-card" hidden>
            <div id="crowd-gold-upgrade-name"></div>
            <div id="crowd-gold-upgrade-effect"></div>
            <button type="button" id="crowd-gold-upgrade-buy" class="upgrade-buy-button" data-upgrade-id="crowd_fireworks"></button>
        </div>
    `;
    container.appendChild(panel);
}
