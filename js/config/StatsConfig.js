/**
 * Stats / telemetry configuration.
 */
export const STATS_CONFIG = {
    /**
     * Duration (in seconds) of the rolling-average window used for all
     * per-second rates in the stats tab (sparkles/s, gold/s, fireworks/s).
     */
    rollingWindowSeconds: 5,
};

/**
 * Full declarative schema for the Stats panel.
 *
 * Each entry in the top-level array is a section with a title and an `items`
 * array.  Each item is either:
 *   • { type: 'group',  label, id, defaultValue, children? }
 *     Renders as a stats-group row; optional children array produces a
 *     nested stats-subgroup beneath it.
 *   • { type: 'row', label, id, defaultValue, rowId?, hiddenByDefault? }
 *     Renders as a single stats-row (used inside children arrays).
 *
 * All element `id` values must match exactly what updateStatsTab() in
 * UIManager.js writes to.
 */
import {ICONS} from '../ui/icons.js';

export const STATS_SCHEMA = [
    {
        section: 'Production Rates',
        titleHtml: 'Production Rates <span class="stats-note">(5s avg)</span>',
        items: [
            {
                type: 'group', label: ICONS.SPARKLE_SVG + ' Sparkles / sec', id: 'stat-sps-total', defaultValue: '0.00',
                children: [
                    { label: '› Auto-Launchers',     id: 'stat-sps-auto',        defaultValue: '0.00' },
                    { label: '› Resource Generators', id: 'stat-sps-gen',         defaultValue: '0.00' },
                    { label: '› Drones',              id: 'stat-sps-drone',       defaultValue: '0.00' },
                    { label: '› Crowd Catchers',      id: 'stat-sps-crowd-catch', defaultValue: '0.00' },
                    { label: '› Manual Clicks',       id: 'stat-sps-manual',      defaultValue: '0.00' },
                    { label: '› Cheats',              id: 'stat-sps-cheat',       defaultValue: '0.00',
                      rowId: 'stat-sps-cheat-row', hiddenByDefault: true },
                ],
            },
            {
                type: 'group', label: ICONS.GOLD_SVG + ' Gold / sec', id: 'stat-gps-total', defaultValue: '0.00',
                children: [
                    { label: '› Crowd',  id: 'stat-gps-crowd', defaultValue: '0.00' },
                    { label: '› Cheats', id: 'stat-gps-cheat', defaultValue: '0.00',
                      rowId: 'stat-gps-cheat-row', hiddenByDefault: true },
                ],
            },
            {
                type: 'group', label: ICONS.FIREWORK_SVG + ' Fireworks / sec', id: 'stat-fps-total', defaultValue: '0.00',
                children: [
                    { label: '› Auto-Launchers', id: 'stat-fps-auto',   defaultValue: '0.00' },
                    { label: '› Manual',         id: 'stat-fps-manual', defaultValue: '0.00' },
                ],
            },
        ],
    },
    {
        section: 'Current State',
        titleHtml: 'Current State',
        items: [
            { type: 'group', label: 'Sparkles Balance', id: 'stat-bal-sparkles', defaultValue: '0' },
            { type: 'group', label: 'Gold Balance',     id: 'stat-bal-gold',     defaultValue: '0' },
            { type: 'group', label: 'Crowd Size',       id: 'stat-crowd-size',   defaultValue: '0' },
            { type: 'group', label: 'Auto-Launchers',       id: 'stat-bld-auto',  defaultValue: '0' },
            { type: 'group', label: 'Resource Generators',  id: 'stat-bld-gen',   defaultValue: '0' },
            { type: 'group', label: 'Drone Hubs',           id: 'stat-bld-drone', defaultValue: '0' },
        ],
    },
    {
        section: 'This Session',
        titleHtml: 'This Session',
        items: [
            { type: 'group', label: 'Time Played',      id: 'stat-session-time',  defaultValue: '0s' },
            {
                type: 'group', label: 'Sparkles Earned', id: 'stat-sess-sparkles', defaultValue: '0',
                children: [
                    { label: '› Auto-Launchers',      id: 'stat-sess-sp-auto',       defaultValue: '0' },
                    { label: '› Resource Generators', id: 'stat-sess-sp-gen',        defaultValue: '0' },
                    { label: '› Drones',              id: 'stat-sess-sp-drone',      defaultValue: '0' },
                    { label: '› Crowd Catchers',      id: 'stat-sess-sp-crowd-catch',defaultValue: '0' },
                    { label: '› Manual',              id: 'stat-sess-sp-manual',     defaultValue: '0' },
                ],
            },
            {
                type: 'group', label: 'Gold Earned', id: 'stat-sess-gold', defaultValue: '0',
                children: [
                    { label: '› Crowd', id: 'stat-sess-g-crowd', defaultValue: '0' },
                ],
            },
            {
                type: 'group', label: 'Fireworks Launched', id: 'stat-sess-fw', defaultValue: '0',
                children: [
                    { label: '› Manual',         id: 'stat-sess-fw-manual', defaultValue: '0' },
                    { label: '› Auto-Launchers', id: 'stat-sess-fw-auto',   defaultValue: '0' },
                ],
            },
            { type: 'group', label: 'Drone Particles Collected', id: 'stat-sess-drone-parts', defaultValue: '0' },
            { type: 'group', label: 'Crowd Particles Caught',    id: 'stat-sess-crowd-parts', defaultValue: '0' },
        ],
    },
    {
        section: 'Lifetime Records',
        titleHtml: 'Lifetime Records',
        items: [
            { type: 'group', label: 'Total Fireworks Launched', id: 'firework-count',     defaultValue: '0' },
            {
                type: 'group', label: 'All-time Sparkles Earned', id: 'stat-life-sparkles', defaultValue: '0',
                children: [
                    { label: '› Auto-Launchers',      id: 'stat-life-sp-auto',       defaultValue: '0' },
                    { label: '› Resource Generators', id: 'stat-life-sp-gen',        defaultValue: '0' },
                    { label: '› Drones',              id: 'stat-life-sp-drone',      defaultValue: '0' },
                    { label: '› Crowd Catchers',      id: 'stat-life-sp-crowd-catch',defaultValue: '0' },
                    { label: '› Manual',              id: 'stat-life-sp-manual',     defaultValue: '0' },
                ],
            },
            { type: 'group', label: 'All-time Gold Earned',           id: 'stat-life-gold',        defaultValue: '0' },
            { type: 'group', label: 'All-time Drone Particles',        id: 'stat-life-drone-parts', defaultValue: '0' },
            { type: 'group', label: 'All-time Crowd Particles Caught', id: 'stat-life-crowd-parts', defaultValue: '0' },
            { type: 'group', label: 'Peak Sparkles / sec',   id: 'stat-peak-sps',   defaultValue: '0.00' },
            { type: 'group', label: 'Peak Gold / sec',       id: 'stat-peak-gps',   defaultValue: '0.00' },
            { type: 'group', label: 'Peak Fireworks / sec',  id: 'stat-peak-fps',   defaultValue: '0.00' },
            { type: 'group', label: 'Peak Crowd Size',       id: 'stat-peak-crowd', defaultValue: '0' },
        ],
    },
];
