// ProgressionConfig.js — single source of truth for all unlock nodes and upgrades.
//
// Upgrade groups & rough unlock timeline:
//   BASE     — Sparkles per firework chain (root of tree, ~0-12 min)
//   LAUNCHER — Fire-rate upgrades (~2-15 min)
//   GENERATOR— Sparkle generator output (~4-14 min, costs gold)
//   DRONE    — Drone hub upgrades (~5-14 min, costs gold)
//   CROWD    — Crowd count, throw yield, gold income chain (~3-20 min)
//
// requires schema (all fields optional):
//   { stats?: { fireworkCount?, sps?, launcherCount?, crowdCount? },
//     buildings?: string[],
//     unlocked?:  string[],
//     upgrades?:  { [id]: minLevel } }

import { DRONE_CONFIG } from './config.js';

export const PROGRESSION_CONFIG = [

    // ── Unlock nodes ──────────────────────────────────────────────────────────

    { type: 'unlock', id: 'sparkle_counter', requires: { stats: { fireworkCount: 1 } } },
    { type: 'unlock', id: 'tab_menu', requires: { stats: { fireworkCount: 5 } } },
    { type: 'unlock', id: 'upgrades_tab', requires: { stats: { fireworkCount: 10 } } },
    { type: 'unlock', id: 'crowds_tab', requires: { stats: { crowdCount: 1 } } },
    { type: 'unlock', id: 'recipes_tab', requires: { stats: { launcherCount: 20 } } },

    // ── Building Unlocks (as Upgrades) ──────────────────────────────────────────
];
