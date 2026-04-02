/**
 * UIBuilder.js
 * Generates the entire UI chrome (top bar, tab bar, tab content slots, and
 * the Advanced Creator singleton) from the TABS schema.
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
            <div id="ressource-count" class="ressource-count">
                <div class="ressource-count-compact">
                    <div class="ressource-total"><span class="sparkle-total"></span></div>
                    <div class="ressource-total"><span class="gold-total"></span></div>
                </div>
                <div class="ressource-count-expanded">
                    <div class="ressource-count-main">
                        <div class="ressource-total">Sparkles: <span class="sparkle-total"></span></div>
                    </div>
                    <div class="ressource-count-main">
                        <div class="ressource-total">Gold: <span class="gold-total"></span></div>
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

    // ── Advanced Creator (singleton, not a tab) ────────────────────────────
    const creator = document.createElement('div');
    creator.id = 'creator-scene';
    creator.style.display = 'none';
    creator.innerHTML = `
        <canvas id="creator-canvas"></canvas>
        <div id="creator-ui" class="panel scrollable-panel">
            <h2 class="panel-title">Advanced Creator</h2>
            <fieldset>
                <legend>Explosion</legend>
                <div id="creator-components-list"></div>
                <button id="creator-add-component">Add Component</button>
            </fieldset>
            <fieldset class="recipe-settings">
                <legend>Name</legend>
                <div class="recipes-option">
                    <input type="text" id="creator-recipe-name" placeholder="Enter recipe name">
                </div>
            </fieldset>
            <fieldset class="recipe-actions">
                <button id="creator-save-recipe">Save Recipe</button>
                <button id="creator-randomize-recipe">Randomize Recipe</button>
                <button id="creator-erase-recipes" class="danger-button">Erase All Recipes</button>
                <br>
                <button id="back-to-game">Back to Game</button>
            </fieldset>
        </div>
    `;
    root.appendChild(creator);
}
