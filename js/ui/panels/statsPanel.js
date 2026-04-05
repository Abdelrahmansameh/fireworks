/**
 * statsPanel.js
 * Generates the Statistics tab entirely from STATS_SCHEMA.
 *
 * Each section becomes a .stats-section block.
 * Each item of type 'group' becomes a .stats-group row, optionally followed
 * by a .stats-subgroup containing its children rows.
 */
import { STATS_SCHEMA } from '../../config/StatsConfig.js';

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    // panel title removed — statistics heading handled per-section

    for (const section of STATS_SCHEMA) {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'stats-section';

        const heading = document.createElement('h3');
        heading.className = 'stats-section-title';
        heading.innerHTML = section.titleHtml ?? section.section;
        sectionDiv.appendChild(heading);

        for (const item of section.items) {
            // ── Main group row ─────────────────────────────────────────────
            const groupDiv = document.createElement('div');
            groupDiv.className = 'stats-group';
            groupDiv.innerHTML = `
                <div class="stats-label">${item.label}</div>
                <div class="stats-value" id="${item.id}">${item.defaultValue ?? ''}</div>
            `;
            sectionDiv.appendChild(groupDiv);

            // ── Optional subgroup of child rows ───────────────────────────
            if (item.children && item.children.length > 0) {
                const subgroupDiv = document.createElement('div');
                subgroupDiv.className = 'stats-subgroup';

                for (const child of item.children) {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'stats-row';
                    if (child.rowId) rowDiv.id = child.rowId;
                    if (child.hiddenByDefault) rowDiv.style.display = 'none';

                    rowDiv.innerHTML = `
                        <span class="stats-source-label">${child.label}</span>
                        <span class="stats-value" id="${child.id}">${child.defaultValue ?? ''}</span>
                    `;
                    subgroupDiv.appendChild(rowDiv);
                }

                sectionDiv.appendChild(subgroupDiv);
            }
        }

        panel.appendChild(sectionDiv);
    }

    container.appendChild(panel);
}
