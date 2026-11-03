// The milestone chain sets the pacing of a show. Each milestone is one goal; its
// reward opens the next mechanic. Buildings, fans, flyers, miners and the
// finale are only earned here, never bought; the late portal upgrades open here and
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
        reward: { title: 'Portal', desc: 'Build portals that fire on their own.', icon: 'portal', upgrades: ['portal_unlock'] },
    },
    {
        id: 'small_show', chapter: 0,
        goal: { type: 'sparkles', target: 400 },
        hint: 'Buy portals in Buildings; every burst pays sparkles.',
        reward: { title: 'Opening Night', action: '', desc: 'Fans arrive and toss gold.', icon: 'crowd', upgrades: ['crowd_spark_1'] },
    },

    // ── 2. Opening Night ────────────────────────────────────────────────────
    {
        id: 'tip_jar', chapter: 1,
        goal: { type: 'gold', target: 200 },
        hint: 'Spend gold on crowd upgrades to grow tips.',
        reward: { title: 'Sparkle Cult', desc: 'Recruit cultists whose rituals turn gold into sparkles.', icon: 'cultist', upgrades: ['cultist_unlock'] },
    },

    // ── 3. Festival Ground ──────────────────────────────────────────────────
    {
        id: 'first_catapult', chapter: 2,
        goal: { type: 'gold', target: 2200 },
        hint: 'Bigger crowds toss more gold.',
        reward: { title: 'Catapult', desc: 'Build catapults that fling fans into fireworks.', icon: 'catapult', upgrades: ['catapult'] },
    },

    // ── 4. Bigger Sky ───────────────────────────────────────────────────────
    {
        id: 'flyers', chapter: 3,
        goal: { type: 'gold', target: 8000 },
        hint: 'Save the crowd’s tips for something that flies.',
        reward: { title: 'Flying Cultists', desc: 'A cultist blasts sparkles from their palms to fly through bursts, catching sparkles.', icon: 'crowd', upgrades: ['flyer_unlock'] },
    },
    {
        id: 'gold_mine', chapter: 3,
        goal: { type: 'gold', target: 10500 },
        hint: 'Stockpile gold to open the mine in the mountains.',
        reward: { title: 'Gold Mine', desc: 'Hire miners who dig steady gold out of the mountains, to feed the cult.', icon: 'miner', upgrades: ['miner_unlock'] },
    },

    {
        id: 'headliner', chapter: 3,
        goal: { type: 'sparkles', target: 70000 },
        hint: 'Feed the cult and keep every portal firing.',
        reward: { title: 'Full Salvo', desc: 'New portal and sparkle upgrades in the shop.', icon: 'portal' },
    },

    // ── 5. Grand Finale ─────────────────────────────────────────────────────
    {
        id: 'encore', chapter: 4,
        goal: { type: 'sparkles', target: 300000 },
        hint: 'The sky is filling up. Keep it growing.',
        reward: { title: 'Sky Curtain', desc: 'The last portal upgrade opens in the shop.', icon: 'portal' },
    },
    {
        id: 'grand_finale', chapter: 4,
        goal: { type: 'sparkles', target: 1700000 },
        hint: 'One last push to light up the whole sky.',
        reward: { title: 'Grand Finale', desc: 'Fill the sky for 30 seconds.', icon: 'fireworks', upgrades: ['grand_finale'] },
    },
];
