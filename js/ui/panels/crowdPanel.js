import { doodleIcon } from '../doodleIcons.js';

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel crowd-panel';
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
        <div id="flyer-shop" class="building-buy-card" hidden>
            <span class="building-badge">${doodleIcon('crowd')}</span>
            <div class="building-buy-copy"><h3>Flying cultists</h3><p>They blast sparkles from their palms to fly, catching bursts.</p></div>
            <span class="building-owned">Owned: <span id="flyer-count">0</span></span>
            <button type="button" id="buy-flyer" class="building-buy-button" aria-label="Buy a flying cultist">${doodleIcon('gold')}<span id="flyer-cost">0</span></button>
        </div>
        <div id="cultist-shop" class="building-buy-card" hidden>
            <span class="building-badge">${doodleIcon('cultist')}</span>
            <div class="building-buy-copy"><h3>Cultists</h3><p id="cultist-description">Rituals conjure sparkles.</p></div>
            <span class="building-owned">Owned: <span id="cultist-count">0</span></span>
            <button type="button" id="buy-cultist" class="building-buy-button" aria-label="Recruit a cultist">${doodleIcon('gold')}<span id="cultist-cost">0</span></button>
        </div>
        <div id="miner-shop" class="building-buy-card" hidden>
            <span class="building-badge">${doodleIcon('miner')}</span>
            <div class="building-buy-copy"><h3>Gold miners</h3><p id="miner-description">They dig gold out of the mountains.</p></div>
            <span class="building-owned">Owned: <span id="miner-count">0</span></span>
            <button type="button" id="buy-miner" class="building-buy-button" aria-label="Hire a miner">${doodleIcon('gold')}<span id="miner-cost">0</span></button>
        </div>
    `;
    container.appendChild(panel);
}
