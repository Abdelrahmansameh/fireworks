import { BUILDING_TYPES } from '../../config/BuildingConfig.js';
import { doodleIcon } from '../doodleIcons.js';

const DISPLAY = {
    AUTO_LAUNCHER: { label: 'Launchers', icon: 'launcher', title: 'Auto Launcher' },
    RESOURCE_GENERATOR: { label: 'Generators', icon: 'generator', title: 'Sparkle Generator' },
    CATAPULT: { label: 'Catapults', icon: 'catapult', title: 'Catapult' },
    DRONE_HUB: { label: 'Drone hub', icon: 'drone', title: 'Drone Hub' },
};

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel buildings-panel';
    const tabs = document.createElement('div');
    tabs.className = 'building-type-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Building types');

    Object.entries(BUILDING_TYPES).forEach(([key, type], index) => {
        const display = DISPLAY[key];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `building-type-tab${index === 0 ? ' active' : ''}`;
        button.dataset.buildingType = key;
        button.title = display.label;
        button.setAttribute('aria-label', display.label);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        button.innerHTML = `${doodleIcon(display.icon)}<span class="building-tile-count" data-building-count="${key}">0</span><span class="building-tile-lock" hidden>${doodleIcon('locked')}</span>`;
        tabs.appendChild(button);
    });
    panel.appendChild(tabs);

    Object.entries(BUILDING_TYPES).forEach(([key, type], index) => {
        const display = DISPLAY[key];
        const section = document.createElement('div');
        section.className = `building-section${index === 0 ? ' active' : ''}`;
        section.dataset.buildingType = key;
        section.innerHTML = `
            <div class="building-buy-section building-buy-card">
                <span class="building-badge">${doodleIcon(display.icon)}</span>
                <div class="building-buy-copy">
                    <h3>${display.title}</h3>
                    <p class="building-production" data-building-description="${key}">${type.description}</p>
                </div>
                <span class="building-owned">×<span id="${type.id}-count">0</span></span>
                <button type="button" id="buy-${type.id}" class="building-buy-button" aria-label="Buy ${type.name}">
                    ${doodleIcon(type.currency === 'sparkles' ? 'sparkle' : 'gold')}
                    <span id="${type.id}-cost">${type.baseCost}</span>
                </button>
            </div>
            ${type.panel.showLauncherList ? `
              <div class="building-launcher-section">
                <div class="building-list-heading"><h3>Launchers</h3></div>
                <div class="building-list-tools">
                    ${type.panel.showSpreadButton ? `<button type="button" id="spread-launchers">${doodleIcon('spread')}<span>Spread out</span></button>` : ''}
                    ${type.panel.showRandomizeButton ? `<button type="button" id="randomize-launcher-recipes">${doodleIcon('shuffle')}<span>Mix all</span></button>` : ''}
                </div>
                <div id="${type.id}-list" class="building-launcher-list"></div>
                <p class="building-empty-state" data-building-empty="${key}">Your launchers will appear here.</p>
              </div>
            ` : ''}
            ${key === 'AUTO_LAUNCHER' ? `<div id="${type.id}-stats" hidden></div>` : `<details class="building-extra-stats"><summary>Details</summary><div id="${type.id}-stats"></div></details>`}
        `;
        panel.appendChild(section);
    });
    container.appendChild(panel);
}
