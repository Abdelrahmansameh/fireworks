// Mechanic milestones live in MilestoneConfig, never tied to a timer. These
// nodes only reveal UI that follows directly from a mechanic.
export const PROGRESSION_CONFIG = [
    { type: 'unlock', id: 'sparkle_counter', requires: { stats: { fireworkCount: 1 } } },
    { type: 'unlock', id: 'crowds_tab', requires: { unlocked: ['crowd'], stats: { crowdCount: 1 } } },
];
