import { TABS } from './uiSchema.js';
import { doodleIcon } from './doodleIcons.js';
import { render as renderRecipes } from './panels/recipesPanel.js';
import { render as renderBuildings } from './panels/buildingsPanel.js';
import { render as renderCrowd } from './panels/crowdPanel.js';
import { render as renderUpgrades } from './panels/upgradesPanel.js';
import { render as renderStats } from './panels/statsPanel.js';
import { render as renderSettings } from './panels/settingsPanel.js';
import { render as renderCheats } from './panels/cheatsPanel.js';
import { render as renderBot } from './panels/botPanel.js';

const PANEL_RENDERERS = { recipes: renderRecipes, buildings: renderBuildings,
    crowd: renderCrowd, upgrades: renderUpgrades, stats: renderStats,
    settings: renderSettings, cheats: renderCheats, bot: renderBot };

/** Build all panel slots before the game binds its controls. */
export function buildChrome() {
    const root = document.getElementById('ui-root');
    const chrome = document.createElement('div');
    chrome.className = 'top-bar-container';
    chrome.innerHTML = `
        <button id="collapse-button" class="collapse-button" aria-label="Tuck the menu away" aria-controls="tab-list" aria-expanded="true"><span class="menu-collapse-icon">${doodleIcon('collapse')}</span><span class="menu-expand-icon">${doodleIcon('expand')}</span></button>
        <nav class="tab-bar" aria-label="Game menu">
            <div class="tabs" id="tab-list"></div>
        </nav>
        <div class="resource-counter">
            <div id="ressource-count" class="ressource-count expanded" role="group" aria-label="Wallet">
                <div class="wallet-card" aria-label="Sparkles">${doodleIcon('sparkle')}<div><span class="sparkle-total rc-num">0</span><span id="wallet-sparkles-rate" class="wallet-rate">+0/s</span></div></div>
                <div class="wallet-card" aria-label="Gold">${doodleIcon('gold')}<div><span class="gold-total rc-num">0</span><span id="wallet-gold-rate" class="wallet-rate">+0/s</span></div></div>
            </div>
        </div>
        <button id="show-menu" class="show-menu" aria-label="Show the menu" aria-controls="tab-list">${doodleIcon('show-menu')}</button>`;
    root.appendChild(chrome);

    const tabList = document.getElementById('tab-list');
    for (const tab of TABS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tab${['stats', 'settings', 'cheats', 'bot'].includes(tab.id) ? ' secondary-tab' : ''}`;
        btn.id = `${tab.id}-tab`;
        btn.dataset.tab = tab.id;
        btn.setAttribute('aria-label', tab.label);
        btn.setAttribute('aria-controls', `${tab.id}-content`);
        btn.setAttribute('aria-expanded', 'false');
        const icon = tab.id === 'recipes' ? 'fireworks' : tab.id;
        btn.innerHTML = `<span class="tab-icon-blob">${doodleIcon(icon)}</span><span class="tab-label">${tab.label}</span>${tab.id === 'upgrades' ? '<span class="tab-badge" id="upgrade-tab-count" hidden></span>' : ''}`;
        if (tab.id === 'stats') btn.classList.add('rail-bottom');
        if (tab.id === 'cheats') {
            const devGroup = document.createElement('div');
            devGroup.className = 'dev-group';
            const divider = document.createElement('div');
            divider.className = 'dev-divider';
            divider.textContent = 'DEV';
            devGroup.appendChild(divider);
            tabList.appendChild(devGroup);
        }
        if (tab.unlockId) btn.classList.add('unlock-hidden');
        if (['cheats', 'bot'].includes(tab.id)) tabList.querySelector('.dev-group').appendChild(btn);
        else tabList.appendChild(btn);

        const content = document.createElement('section');
        content.className = 'tab-content';
        content.id = `${tab.id}-content`;
        content.setAttribute('aria-label', tab.label);
        content.innerHTML = `<button class="sheet-handle" aria-label="Expand ${tab.label} panel"><span></span></button>
            <header class="panel-header"><h1>${tab.label}</h1><button class="panel-close" aria-label="Close ${tab.label}">${doodleIcon('close')}</button></header>
            ${['stats', 'settings', 'cheats', 'bot'].includes(tab.id) ? `<nav class="more-views" aria-label="More views"><button data-more-view="stats">Stats</button><button data-more-view="settings">Settings</button><button data-more-view="cheats">Dev</button>${new URLSearchParams(location.search).has('bot') ? '<button data-more-view="bot">Bot</button>' : ''}</nav>` : ''}`;
        PANEL_RENDERERS[tab.id]?.(content);
        root.appendChild(content);
    }
    const more = document.createElement('button');
    more.id = 'more-tab';
    more.className = 'tab mobile-more';
    more.innerHTML = `${doodleIcon('more')}<span class="tab-label">More</span>`;
    more.setAttribute('aria-label', 'More: stats, settings, dev');
    tabList.appendChild(more);
}
