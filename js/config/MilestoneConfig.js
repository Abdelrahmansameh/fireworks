// The milestone chain sets the pacing of a show. Each milestone is one goal; its
// reward opens the next mechanic. Buildings, fans, jetpack fans and the finale
// are only earned here, never bought; the late launcher upgrades open here and
// are then bought in the shop. Tune pacing with tools/run_live_bot.mjs.
//
// Goal types:
//   fireworks / sparkles / gold / caught  count from the moment the goal starts
//   upgrade / building / crowd            read the current amount owned
// Reward fields:
//   unlocks    progression unlock ids (tabs, UI)
//   upgrades   skill-tree nodes granted for free (their apply/onPurchase run);
//              building types are unlocked for purchase, never built
// Every milestone opens something major: a mechanic, a building or an upgrade.
// Upgrade cards that open with a milestone name it in `requires.milestone`.
export const MILESTONE_CHAPTERS = [
    'First Sparks',
    'Opening Night',
    'Festival Ground',
    'Bigger Sky',
    'Grand Finale',
];

export const MILESTONES = [
    // ── 1. First Sparks ─────────────────────────────────────────────────────
    {
        id: 'first_light', chapter: 0,
        goal: { type: 'fireworks', target: 5 },
        hint: 'Tap the sky to launch fireworks.',
        reward: { title: 'Upgrade shop', desc: 'Spend sparkles on upgrades.', icon: 'upgrades', unlocks: ['tab_menu', 'upgrades_tab'] },
    },
    {
        id: 'creator', chapter: 0,
        goal: { type: 'sparkles', target: 50 },
        hint: 'Keep launching fireworks.',
        reward: { title: 'Firework Creator', desc: 'Design your own fireworks.', icon: 'fireworks', upgrades: ['unlock_recipes_tab'] },
    },
    {
        id: 'first_machine', chapter: 0,
        goal: { type: 'sparkles', target: 100 },
        hint: 'Keep launching. Every burst pays sparkles.',
        reward: { title: 'Auto Launcher', desc: 'Build launchers that fire on their own.', icon: 'launcher', upgrades: ['auto_launcher'] },
    },
    {
        id: 'small_show', chapter: 0,
        goal: { type: 'building', building: 'AUTO_LAUNCHER', target: 3 },
        hint: 'Buy launchers in Buildings.',
        reward: { title: 'Opening Night', action: '', desc: 'Fans arrive and toss gold.', icon: 'crowd', upgrades: ['crowd_spark_1'] },
    },

    // ── 2. Opening Night ────────────────────────────────────────────────────
    {
        id: 'tip_jar', chapter: 1,
        goal: { type: 'gold', target: 1750 },
        hint: 'Spend gold on crowd upgrades to grow tips.',
        reward: { title: 'Sparkle Cult', desc: 'Recruit cultists whose rituals conjure sparkles.', icon: 'cultist', upgrades: ['cultist_unlock'] },
    },

    // ── 3. Festival Ground ──────────────────────────────────────────────────
    {
        id: 'first_catapult', chapter: 2,
        goal: { type: 'gold', target: 2000 },
        hint: 'Bigger crowds toss more gold.',
        reward: { title: 'Catapult', desc: 'Build catapults that fling fans into fireworks.', icon: 'catapult', upgrades: ['catapult'] },
    },

    // ── 4. Bigger Sky ───────────────────────────────────────────────────────
    {
        id: 'jetpacks', chapter: 3,
        goal: { type: 'gold', target: 7000 },
        hint: 'Save the crowd’s tips for something that flies.',
        reward: { title: 'Jetpack Fans', desc: 'A fan with a jetpack flies through bursts catching sparkles.', icon: 'crowd', upgrades: ['jetpack_unlock'] },
    },

    // ── 5. Grand Finale ─────────────────────────────────────────────────────
    {
        id: 'grand_finale', chapter: 4,
        goal: { type: 'sparkles', target: 500000 },
        hint: 'One last push to light up the whole sky.',
        reward: { title: 'Grand Finale', desc: 'Fill the sky for 30 seconds.', icon: 'fireworks', upgrades: ['grand_finale'] },
    },
];
