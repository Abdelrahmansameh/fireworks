import { STATS_SCHEMA } from '../../config/StatsConfig.js';
import { doodleIcon } from '../doodleIcons.js';

const MAIN_IDS = new Set([
    'stat-sps-total', 'stat-sps-auto', 'stat-sps-gen', 'stat-sps-crowd-catch', 'stat-sps-manual', 'stat-sps-drone',
    'stat-gps-total', 'stat-fps-total', 'stat-session-time', 'stat-sess-sparkles', 'stat-sess-gold', 'stat-sess-fw', 'stat-sess-crowd-parts',
]);

function detailRow(item) {
    return `<div class="stats-row"${item.rowId ? ` id="${item.rowId}"` : ''}${item.hiddenByDefault ? ' style="display:none"' : ''}>
        <span class="stats-source-label">${item.label}</span><span class="stats-value" id="${item.id}">${item.defaultValue ?? '0'}</span>
    </div>`;
}

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel stats-panel';
    panel.innerHTML = `
        <section class="stats-now">
            <div class="stats-now-heading"><h3>Right now</h3><span class="stats-note">(5s avg)</span></div>
          <div class="stats-production-card">
            <div class="stats-production-hero">${doodleIcon('sparkle')}<span id="stats-sparkles-hero">0</span><span class="stats-production-unit">sparkles/s</span></div>
            <span id="stat-sps-total" hidden>0.00 /s</span>
            <div class="stats-production-bar" role="img" aria-label="Sparkle production by source">
                <span class="stats-segment source-launchers" data-production-source="auto_launcher"></span>
                <span class="stats-segment source-generators" data-production-source="resource_generator"></span>
                <span class="stats-segment source-fans" data-production-source="crowd_catch"></span>
                <span class="stats-segment source-clicks" data-production-source="manual"></span>
                <span class="stats-segment source-drones" data-production-source="drone"></span>
                <span class="stats-segment source-other" data-production-source="other"></span>
            </div>
            <div class="stats-production-legend">
                <div class="stats-legend-row"><span><i class="source-launchers"></i>Launchers</span><strong data-source-rate="auto_launcher">0</strong><span id="stat-sps-auto" hidden>0</span></div>
                <div class="stats-legend-row"><span><i class="source-generators"></i>Generators</span><strong data-source-rate="resource_generator">0</strong><span id="stat-sps-gen" hidden>0</span></div>
                <div class="stats-legend-row"><span><i class="source-fans"></i>Fans</span><strong data-source-rate="crowd_catch">0</strong><span id="stat-sps-crowd-catch" hidden>0</span></div>
                <div class="stats-legend-row"><span><i class="source-clicks"></i>Clicks</span><strong data-source-rate="manual">0</strong><span id="stat-sps-manual" hidden>0</span></div>
                <div class="stats-legend-row" id="stats-drones-row" hidden><span><i class="source-drones"></i>Drones</span><strong data-source-rate="drone">0</strong><span id="stat-sps-drone" hidden>0</span></div>
                <div class="stats-legend-row" id="stats-other-row" hidden><span><i class="source-other"></i>Other</span><strong id="stats-other-rate">0</strong></div>
            </div>
          </div>
            <div class="stats-secondary-rates">
                <div class="stats-rate-card"><div class="stats-rate-value">${doodleIcon('gold')}<strong id="stats-gold-hero">0</strong></div><span>gold/s</span><span id="stat-gps-total" hidden>0</span></div>
                <div class="stats-rate-card"><div class="stats-rate-value">${doodleIcon('fireworks')}<strong id="stats-fireworks-hero">0</strong></div><span>fireworks/s</span><span id="stat-fps-total" hidden>0</span></div>
            </div>
        </section>
        <section class="stats-session">
            <h3>This session</h3>
          <div class="stats-session-table">
            <div class="stats-session-row"><span>Played</span><strong id="stat-session-time">0s</strong></div>
            <div class="stats-session-row"><span>Sparkles</span><strong id="stat-sess-sparkles">0</strong></div>
            <div class="stats-session-row"><span>Gold</span><strong id="stat-sess-gold">0</strong></div>
            <div class="stats-session-row"><span>Fireworks</span><strong id="stat-sess-fw">0</strong></div>
            <div class="stats-session-row"><span>Caught by fans</span><strong id="stat-sess-crowd-parts">0</strong></div>
          </div>
        </section>
    `;

    // Preserve the complete telemetry schema in an optional disclosure.
    const details = document.createElement('details');
    details.className = 'stats-details';
    details.innerHTML = '<summary>More stats</summary>';
    for (const section of STATS_SCHEMA) {
        const rows = section.items.flatMap(item => [item, ...(item.children ?? [])]).filter(item => !MAIN_IDS.has(item.id));
        if (!rows.length) continue;
        const block = document.createElement('section');
        block.className = 'stats-section';
        block.innerHTML = `<h3>${section.section}</h3>${rows.map(detailRow).join('')}`;
        details.appendChild(block);
    }
    panel.appendChild(details);
    container.appendChild(panel);
}
