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
 * Layout overview (all positions relative to ROOT = base_mult_1 at 0,0):
 *   BASE     chain → goes straight up           (x ≈ 0,   y negative)
 *   LAUNCHER branch → goes left                  (x negative, y ≈ -60)
 *   GENERATOR branch → goes lower-left           (x negative, y positive)
 *   DRONE    branch → goes right                 (x positive, y ≈ 0 to -400)
 *   CROWD    branch → goes lower-right & down    (x positive, y positive)
 *
 * Tree spans roughly x: -520 to +1100, y: -700 to +660.
 *
 * To add a new upgrade: add its entry in `nodes`, point treeParent at the
 * logical predecessor, and set x/y within the appropriate branch area.
 * The PROGRESSION_CONFIG handles actual purchasing rules.
 */

export const SKILL_TREE_CONFIG = {

    // ── Branch colour themes ─────────────────────────────────────────────────
    branches: {
        BASE:      { color: '#FFC857', label: 'Core' },
        DRONE:     { color: '#29B6F6', label: 'Drones' },
        CROWD:     { color: '#F06292', label: 'Crowd' },
        LAUNCHER:  { color: '#FF7043', label: 'Launchers' },
        GENERATOR: { color: '#66BB6A', label: 'Generators' },
    },

    // ── Upgrade nodes ────────────────────────────────────────────────────────
    nodes: {

        // ── BASE chain — goes straight up ─────────────────────────────────
        // +2/+5/+15/+50 SP per firework → final BSM 177
        base_mult_1: {
            x: 0, y: 0,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'ROOT',
        },
        spark_core_2: {
            x: 0, y: -220,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'base_mult_1',
        },
        spark_core_3: {
            x: 0, y: -440,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_2',
        },
        spark_core_4: {
            x: 0, y: -660,
            icon: 'base',
            branch: 'BASE',
            treeParent: 'spark_core_3',
        },

        // ── LAUNCHER branch — goes left ───────────────────────────────────
        // Fire-rate reduction chain; both cost sparkles
        launcher_spawn_rate: {
            x: -320, y: -60,
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'base_mult_1',
        },
        launcher_overclock: {
            x: -520, y: -60,
            icon: 'launcher',
            branch: 'LAUNCHER',
            treeParent: 'launcher_spawn_rate',
        },

        // ── GENERATOR branch — goes lower-left ───────────────────────────
        // Production multipliers; costs gold
        generator_production: {
            x: -240, y: 290,
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'base_mult_1',
        },
        generator_overclock: {
            x: -400, y: 480,
            icon: 'base',
            branch: 'GENERATOR',
            treeParent: 'generator_production',
        },

        // ── DRONE branch — goes right ─────────────────────────────────────
        // Six core upgrades fanning out, then capstone
        drone_lifetime: {
            x: 300, y: -60,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'base_mult_1',
        },
        drone_speed: {
            x: 480, y: -220,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        },
        drone_radius: {
            x: 480, y: -400,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',
        },
        drone_max: {
            x: 480, y: 100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_lifetime',
        },
        drone_sparkle_yield: {
            x: 660, y: -220,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_speed',
        },
        drone_hub_spawn_rate: {
            x: 660, y: 100,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_max',
        },
        drone_efficiency: {
            x: 840, y: -60,
            icon: 'drone',
            branch: 'DRONE',
            treeParent: 'drone_hub_spawn_rate',
        },

        // ── CROWD branch — goes lower & lower-right ───────────────────────
        // spark_1 → gold_1 → gold_2 → spark_2 → gold_3 → gold_4 along Row 1
        // Row 1 (y=240): spark_1 → gold_1 → gold_2 → spark_2 → gold_3 → gold_4
        // Row 2 (y=440): invite_1 → invite_2 below gold chain; catcher & invite_3 off gold_3
        // Row 3 (y=620): catcher sub-upgrades
        // Row 4 (y=800): throw power
        crowd_spark_1: {
            x: 0, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'ROOT',
        },
        crowd_gold_1: {
            x: 200, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_spark_1',
        },
        crowd_invite_1: {
            x: 200, y: 440,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_1',
        },
        crowd_invite_2: {
            x: 400, y: 440,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_invite_1',
        },
        crowd_gold_2: {
            x: 400, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_1',
        },
        crowd_spark_2: {
            x: 600, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_2',
        },
        crowd_gold_3: {
            x: 800, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_spark_2',
        },
        crowd_catcher_unlock: {
            x: 800, y: 440,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_3',
        },
        crowd_catcher_radius: {
            x: 600, y: 620,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        },
        crowd_catcher_yield: {
            x: 800, y: 620,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_unlock',
        },
        crowd_throw_power: {
            x: 800, y: 800,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_catcher_yield',
        },
        crowd_invite_3: {
            x: 1000, y: 440,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_3',
        },
        crowd_gold_4: {
            x: 1000, y: 240,
            icon: 'crowd',
            branch: 'CROWD',
            treeParent: 'crowd_gold_3',
        },
    },
};
