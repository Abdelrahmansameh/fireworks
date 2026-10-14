/**
 * upgradesPanel.js
 * Thin mount-point wrapper.  The actual content is rendered by
 * UIManager.renderUpgrades(), which already works dynamically.
 */
export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel upgrades-panel';

    panel.innerHTML = `
        <div id="show-progression-goal" class="show-progression-goal" aria-live="polite" hidden></div>
        <div id="upgrades-available" class="upgrade-grid" aria-label="Upgrades"></div>
        <p id="upgrades-empty" class="upgrade-empty" hidden>No upgrades yet</p>
    `;

    container.appendChild(panel);
}
