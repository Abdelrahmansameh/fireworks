/**
 * UIBuilder.js
 * Generates the entire UI chrome (top bar, tab bar, tab content slots, and
 * the tab content slots) from the TABS schema.
 *
 * Call buildChrome() once at startup, before UIManager.bindEvents() /
 * bindUIEvents() run.  Each panel's render() is called synchronously so the
 * DOM is fully populated before event wiring.
 */
import { TABS } from './uiSchema.js';
import { render as renderRecipes   } from './panels/recipesPanel.js';
import { render as renderBuildings } from './panels/buildingsPanel.js';
import { render as renderCrowd     } from './panels/crowdPanel.js';
import { render as renderUpgrades  } from './panels/upgradesPanel.js';
import { render as renderStats     } from './panels/statsPanel.js';
import { render as renderSettings  } from './panels/settingsPanel.js';
import { render as renderCheats    } from './panels/cheatsPanel.js';

const PANEL_RENDERERS = {
    recipes:   renderRecipes,
    buildings: renderBuildings,
    crowd:     renderCrowd,
    upgrades:  renderUpgrades,
    stats:     renderStats,
    settings:  renderSettings,
    cheats:    renderCheats,
};

import ICONS from './icons.js';

export function buildChrome() {
    const root = document.getElementById('ui-root');

    // ── Top bar (resource counter + collapse button + tab list) ───────────
    const topBar = document.createElement('div');
    topBar.className = 'top-bar-container';

    

    topBar.innerHTML = `
        <div class="tab-bar">
            <button id="collapse-button" class="collapse-button">☰</button>
                <div class="tabs collapsed" id="tab-list"></div>
        </div>
        <div class="resource-counter">
            <div id="ressource-count" class="ressource-count expanded">
                <div class="rc-pill">
                    <span class="rc-item">
                        ${ICONS.SPARKLE_SVG}
                        <span class="sparkle-total rc-num"></span>
                    </span>
                    <span class="rc-divider" aria-hidden="true"></span>
                    <span class="rc-item">
                        ${ICONS.GOLD_SVG}
                        <span class="gold-total rc-num"></span>
                    </span>
                </div>
                <div class="rc-detail">
                    <div class="rc-row">
                        ${ICONS.SPARKLE_SVG}
                        <span class="rc-label">Sparkles</span>
                        <span class="sparkle-total rc-num"></span>
                    </div>
                    <div class="rc-row">
                        ${ICONS.GOLD_SVG}
                        <span class="rc-label">Gold</span>
                        <span class="gold-total rc-num"></span>
                    </div>
                </div>
            </div>
        </div>
    `;
    root.appendChild(topBar);

    const tabList = document.getElementById('tab-list');

    // ── One tab button + one content div per schema entry ─────────────────
    for (const tab of TABS) {
        // Tab button
        const btn = document.createElement('div');
        btn.className = 'tab';
        btn.id = `${tab.id}-tab`;
        
        if (tab.icon) {
            const iconImg = document.createElement('img');
            iconImg.src = tab.icon;
            iconImg.alt = tab.label;
            iconImg.className = 'tab-icon';
            btn.appendChild(iconImg);
        } else {
            btn.textContent = tab.label;
        }

        if (tab.unlockId) btn.classList.add('unlock-hidden');
        tabList.appendChild(btn);

        // Content panel slot
        const content = document.createElement('div');
        content.className = 'tab-content';
        content.id = `${tab.id}-content`;

        // Render the panel's internal DOM into the content div
        const renderFn = PANEL_RENDERERS[tab.id];
        if (renderFn) {
            renderFn(content);
        }

        root.appendChild(content);
    }

}
