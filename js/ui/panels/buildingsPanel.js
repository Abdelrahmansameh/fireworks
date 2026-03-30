/**
 * buildingsPanel.js
 * Renders and updates the Buildings tab.
 *
 * Generated element ids follow the derived pattern from BUILDING_TYPES:
 *   buy button : buy-${type.id}           e.g. "buy-auto_launcher"
 *   count span : ${type.id}-count         e.g. "auto_launcher-count"
 *   cost span  : ${type.id}-cost          e.g. "auto_launcher-cost"
 *   stats div  : ${type.id}-stats         e.g. "auto_launcher-stats"
 *   list div   : ${type.id}-list          e.g. "auto_launcher-list"
 */
import { BUILDING_TYPES } from '../../config/BuildingConfig.js';

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = '<h2 class="panel-title">Manage Buildings</h2>';

    // ── Building type sub-tab bar ──────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'building-type-tabs';

    let firstType = true;
    for (const [key, type] of Object.entries(BUILDING_TYPES)) {
        const btn = document.createElement('button');
        btn.className = 'building-type-tab' + (firstType ? ' active' : '');
        btn.setAttribute('data-building-type', key);

        // Hidden until the progression system unlocks it (AUTO_LAUNCHER visible by default)
        if (!firstType) btn.style.display = 'none';

        btn.textContent = type.name + 's'; // e.g. "Auto Launchers"
        tabBar.appendChild(btn);
        firstType = false;
    }
    panel.appendChild(tabBar);

    // ── One section per building type ─────────────────────────────────────
    let firstSection = true;
    for (const [key, type] of Object.entries(BUILDING_TYPES)) {
        const section = document.createElement('div');
        section.className = 'building-section' + (firstSection ? ' active' : '');
        section.setAttribute('data-building-type', key);

        const buySection = document.createElement('div');
        buySection.className = 'building-buy-section';

        buySection.innerHTML = `
            <h3>${type.name}s Owned: <span id="${type.id}-count">0</span></h3>
            <p>Cost: <span id="${type.id}-cost">${type.baseCost}</span> ${type.currency}</p>
            ${type.description ? `<p class="building-description">${type.description}</p>` : ''}
            <button id="buy-${type.id}">Buy ${type.name}</button>
            ${type.panel.showSpreadButton      ? '<button id="spread-launchers">Spread Launchers Evenly</button>' : ''}
            ${type.panel.showRandomizeButton   ? '<button id="randomize-launcher-recipes">Assign random to all Launchers</button>' : ''}
            <div id="${type.id}-stats"></div>
        `;

        section.appendChild(buySection);

        if (type.panel.showLauncherList) {
            const listDiv = document.createElement('div');
            listDiv.id = `${type.id}-list`;
            section.appendChild(listDiv);
        }

        panel.appendChild(section);
        firstSection = false;
    }

    container.appendChild(panel);
}
