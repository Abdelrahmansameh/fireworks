/**
 * upgradesPanel.js
 * Thin mount-point wrapper.  The actual content is rendered by
 * UIManager.renderUpgrades(), which already works dynamically.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <h3>Available</h3>
        <div id="upgrades-available" class="upgrade-grid"></div>
        <h3>Owned</h3>
        <div id="upgrades-owned" class="upgrade-grid"></div>
    `;

    container.appendChild(panel);
}
