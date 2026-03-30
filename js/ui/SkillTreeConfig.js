/**
 * SkillTreeConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the skill-tree visual layout.
 *
 * Each node entry maps one upgrade id (from PROGRESSION_CONFIG) to:
 *   x, y        — position in tree-space (pixels, origin = ROOT at 0,0)
 *   icon        — key into ICON_MAP (see SkillTreeScreen.js)
 *   branch      — branch name → colour theme (see `branches` below)
 *   treeParent  — 'ROOT' | <upgrade id>
 *                 Nodes whose treeParent hasn't been purchased yet are HIDDEN.
 *                 This is a visual/UX gate; change treeParent to adjust
 *                 which upgrade must be bought before a node becomes visible.
 *
 * To add a new upgrade to the tree:
 *   1. Add its entry to the `nodes` object below.
 *   2. Point treeParent at its logical prerequisite (or 'ROOT' for first-tier).
 *   3. The PROGRESSION_CONFIG handles actual purchasing rules — this file only
 *      controls layout and reveal order.
 */

export const SKILL_TREE_CONFIG = {

    // ── Branch colour themes ─────────────────────────────────────────────────
    branches: {
        BASE: { color: '#FFC857', label: 'Core' },
        DRONE: { color: '#29B6F6', label: 'Drones' },
        CROWD: { color: '#F06292', label: 'Crowd' },
        LAUNCHER: { color: '#FF7043', label: 'Launchers' },
        GENERATOR: { color: '#66BB6A', label: 'Generators' },
    },

    // ── Upgrade nodes ────────────────────────────────────────────────────────
    nodes: {

        // ── BASE branch  (upper-left) ─────────────────────────────────────
        base_mult_1: {
            x: 0, y: 0,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'ROOT',
        },
        base_mult_2: {
            x: -200, y: -200,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',
        },

        // ── DRONE branch  (right side) ────────────────────────────────────
        drone_lifetime: {
            x: 280, y: -100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'base_mult_1',
        },
        drone_speed: {
            x: 480, y: -250,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        },
        drone_radius: {
            x: 280, y: -290,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        },
        drone_max: {
            x: 480, y: -100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        },
        drone_sparkle_yield: {
            x: 680, y: -250,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',
        },
        drone_hub_spawn_rate: {
            x: 680, y: -100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_max',
        },

        // ── CROWD branch  (lower-right) ───────────────────────────────────
        crowd_catcher_unlock: {
            x: 280, y: 150,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'base_mult_1',
        },
        crowd_catcher_radius: {
            x: 160, y: 320,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        },
        crowd_catcher_yield: {
            x: 400, y: 320,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        },

        // ── LAUNCHER branch  (left side) ─────────────────────────────────
        launcher_spawn_rate: {
            x: -280, y: 80,
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'base_mult_1',
        },

        // ── GENERATOR branch  (lower-left) ───────────────────────────────
        generator_production: {
            x: -160, y: 300,
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'base_mult_1',
        },
    },
};
