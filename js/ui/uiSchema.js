/**
 * uiSchema.js
 * Central tab registry.  Adding a new tab = add one object to TABS.
 * No HTML changes, no UIManager edits required.
 */

export const TABS = [
    {
        id: 'recipes',
        label: 'Recipes',
        unlockId: 'recipes_tab',
        panelModule: () => import('./panels/recipesPanel.js'),
    },
    {
        id: 'buildings',
        label: 'Buildings',
        unlockId: 'buildings_tab',
        panelModule: () => import('./panels/buildingsPanel.js'),
    },
    {
        id: 'crowd',
        label: 'Crowd',
        unlockId: 'crowds_tab',
        panelModule: () => import('./panels/crowdPanel.js'),
    },
    {
        id: 'upgrades',
        label: 'Upgrades',
        unlockId: 'upgrades_tab',
        panelModule: () => import('./panels/upgradesPanel.js'),
    },
    {
        id: 'stats',
        label: 'Stats',
        unlockId: null,   // always visible once the tab menu is shown
        panelModule: () => import('./panels/statsPanel.js'),
    },
    {
        id: 'settings',
        label: 'Settings',
        unlockId: null,
        panelModule: () => import('./panels/settingsPanel.js'),
    },
    {
        id: 'cheats',
        label: 'Cheats',
        unlockId: null,
        panelModule: () => import('./panels/cheatsPanel.js'),
    },
];
