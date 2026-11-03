// Cultists are crowd members, bought like flyers, who loop a ritual that
// turns gold into sparkles: every climax takes an offering from the gold bank
// and pays it out as sparkles (see CultistRituals). No gold, no sparkles.
export const CULTIST_CONFIG = {
    // Shop: bought with gold from the crowd panel.
    baseCost: 300,
    costRatio: 1.3,
    maxCount: 15,
    // Gate on the sink: a recruit, or a Bigger Bowls level, costs at least this
    // many seconds of the whole cult's gold drain once it's bought. Saving that
    // much past the current drain means income can almost feed the bigger cult.
    upkeepSeconds: 60,
    // The ritual clip in crowd.json sets how often each cultist offers.
    goldPerRitual: 4,            // offering taken from the bank per ritual; Bigger Bowls multiply it
    sparklesPerGold: 0.25,        // exchange rate, times the base sparkle multiplier and Louder Chants
    // The ritual clip's bowl; each Bigger Bowls level draws it this much bigger.
    bowlSkeletonUrl: 'assets/skeletons/cultist_bowl.json',
    bowlGrowthPerLevel: 0.2,

    // Ritual spots in the gap between the crowd (CROWD_LEFT_X) and the
    // portals (PORTAL_MIN_X), one per cultist in buy order: a staggered choir
    // that fills front to back, centre out.
    spots: [
        { x: 0, y: -460 },
        { x: -50, y: -440 },
        { x: 50, y: -440 },
        { x: -100, y: -460 },
        { x: 100, y: -460 },
        { x: -150, y: -440 },
        { x: 0, y: -420 },
        { x: -100, y: -420 },
        { x: 100, y: -420 },
        { x: -50, y: -400 },
        { x: 50, y: -400 },
        { x: -150, y: -400 },
        { x: 0, y: -380 },
        { x: -100, y: -380 },
        { x: 100, y: -380 },
    ],

    // Worn in every state; the ritual clip adds the bowl on top.
    props: [
        { skeletonUrl: 'assets/skeletons/cultist_hood.json', parentPartId: 'body', offsetY: 2, layer: 'behind' },
        { skeletonUrl: 'assets/skeletons/cultist_brim.json', parentPartId: 'body', offsetY: 2 },
    ],
    walkInBlend: 0.3,

    // Climax spray out of both raised hands, spread over a few frames so it
    // reads as a gush. Grows with the payout per ritual, from minBurstCount
    // unupgraded to maxBurstCount with every sparkle upgrade.
    minBurstCount: 15,
    maxBurstCount: 260,
    burstDuration: 0.12,
    burstSpeed: [150, 290],
    burstUpwardBias: 0.45,       // 0 = along the forearm, 1 = straight up
    burstSpread: 0.35,           // radians either side of that direction
    burstGravity: 420,
    burstLifetime: [0.55, 1.0],
    burstSize: [0.9, 1.5],
    burstColors: [[1, 0.86, 0.38], [1, 0.97, 0.82], [1, 0.72, 0.3], [0.86, 0.55, 1], [0.55, 0.9, 1]],

    // While coiling, motes rise out of the pot and swoop into both hands.
    gatherStart: 0.47,           // fractions of the ritual loop: the coil into the snap
    gatherEnd: 0.935,
    gatherRate: 120,             // motes per second
    gatherRise: [6, 12],         // how far above the pot each mote arcs
    gatherFan: 1.0,              // 0 = rise straight up first, 1 = head straight out to the hand
    gatherJitter: 3,             // spread across the pot's mouth
    gatherLifetime: [0.35, 0.55],
    gatherSize: [0.9, 1.5],
    gatherColors: [[1, 0.8, 0.2], [0.75, 0.4, 1], [0.35, 0.85, 1]],
};
