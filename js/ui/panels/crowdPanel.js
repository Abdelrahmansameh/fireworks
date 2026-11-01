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
            <div class="crowd-progress-label" id="crowd-firework-progress"><span class="crowd-progress-title">Next fan</span><span id="current-sps">0</span><span class="crowd-progress-divider">/</span><span id="next-threshold">â€”</span></div>
            <p id="crowd-full" hidden>Full house!</p>
            <div class="progress-container" role="progressbar" aria-label="Progress toward the next fan" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div id="threshold-progress" class="progress-bar"></div>
            </div>
        </div>
      </div>
        <div id="jetpack-shop" class="building-buy-card" hidden>
            <span class="building-badge">${doodleIcon('crowd')}</span>
            <div class="building-buy-copy"><h3>Jetpack fans</h3><p>Fans fly around catching sparkles.</p></div>
            <span class="building-owned">Owned: <span id="jetpack-count">0</span></span>
            <button type="button" id="buy-jetpack" class="building-buy-button" aria-label="Buy a jetpack">${doodleIcon('gold')}<span id="jetpack-cost">0</span></button>
        </div>
        <div id="cultist-shop" class="building-buy-card" hidden>
            <span class="building-badge">${doodleIcon('cultist')}</span>
            <div class="building-buy-copy"><h3>Cultists</h3><p id="cultist-description">Rituals conjure sparkles.</p></div>
            <span class="building-owned">Owned: <span id="cultist-count">0</span></span>
            <button type="button" id="buy-cultist" class="building-buy-button" aria-label="Recruit a cultist">${doodleIcon('gold')}<span id="cultist-cost">0</span></button>
        </div>
    `;
    container.appendChild(panel);
}
