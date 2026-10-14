/**
 * upgradesPanel.js
 * Thin mount-point wrapper.  The actual content is rendered by
 * UIManager.renderUpgrades(), which already works dynamically.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <div id="show-progression-goal" class="show-progression-goal" aria-live="polite" hidden></div>
        <div id="upgrades-available" class="upgrade-grid"></div>
        <details id="upgrades-extra-section" hidden>
            <summary id="upgrades-extra-title">More upgrades</summary>
            <div id="upgrades-extra" class="upgrade-grid"></div>
        </details>
        <details>
            <summary>Owned</summary>
            <div id="upgrades-owned" class="upgrade-grid"></div>
        </details>
    `;

    container.appendChild(panel);
}
