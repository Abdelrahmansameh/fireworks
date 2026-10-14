// Mechanic milestones are purchased in SkillTreeConfig, never tied to a timer.
export const PROGRESSION_CONFIG = [
    { type: 'unlock', id: 'sparkle_counter', requires: { stats: { fireworkCount: 1 } } },
    { type: 'unlock', id: 'tab_menu', requires: { stats: { fireworkCount: 5 } } },
    { type: 'unlock', id: 'upgrades_tab', requires: { stats: { fireworkCount: 5 } } },
    { type: 'unlock', id: 'crowds_tab', requires: { unlocked: ['crowd'], stats: { crowdCount: 1 } } },
];
