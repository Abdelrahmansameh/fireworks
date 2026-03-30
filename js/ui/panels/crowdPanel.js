/**
 * crowdPanel.js
 * Renders the Crowd tab.
 */

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <h2 class="panel-title">Crowd</h2>
        <div class="crowd-info">
            <h3>Crowd Size: <span id="crowd-count">0</span></h3>
            <p>Current Auto FPS: <span id="current-sps">0</span></p>
            <p>Next Milestone: <span id="next-threshold">Loading...</span> Auto FPS</p>
            <div class="progress-container">
                <div id="threshold-progress" class="progress-bar"></div>
            </div>
            <p class="milestone-info">Reach the next milestone to attract more fans!</p>
        </div>
    `;

    container.appendChild(panel);
}
