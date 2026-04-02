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
        icon: 'assets/buttons/buildings_tab_button.png',
        panelModule: () => import('./panels/buildingsPanel.js'),
    },
    {
        id: 'crowd',
        label: 'Crowd',
        unlockId: 'crowds_tab',
        icon: 'assets/buttons/crowd_tab_button.png',

        panelModule: () => import('./panels/crowdPanel.js'),
    },
    {
        id: 'upgrades',
        label: 'Upgrades',
        unlockId: 'upgrades_tab',
        icon: 'assets/buttons/upgrades_tab_button.png',

        panelModule: () => import('./panels/upgradesPanel.js'),
    },
    {
        id: 'stats',
        label: 'Stats',
        unlockId: null,
        icon: 'assets/buttons/stats_tab_button.png',

        panelModule: () => import('./panels/statsPanel.js'),
    },
    {
        id: 'settings',
        label: 'Settings',
        unlockId: null,
        icon: 'assets/buttons/settings_tab_button.png',

        panelModule: () => import('./panels/settingsPanel.js'),
    },
    {
        id: 'cheats',
        label: 'Cheats',
        unlockId: null,
        icon: 'assets/buttons/cheats_tab_button.png',

        panelModule: () => import('./panels/cheatsPanel.js'),
    },
];
