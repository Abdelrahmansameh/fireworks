// Miners are crowd members, bought with gold like cultists, who work the gold
// mine in the background mountains. Every pickaxe strike pays out gold (see
// MinerShifts), far more per head than a fan's coin tosses, though the whole
// tipping crowd should stay within reach of the mine (about 40/60 late on).
export const MINER_CONFIG = {
    // Shop: bought with gold from the crowd panel.
    baseCost: 2500,
    costRatio: 1.5,
    maxCount: 5,
    goldPerStrike: 40,           // a fan tosses 2.5 gold every 5s; a miner pays this every strike
    strikeInterval: 1.3,         // seconds per swing; the 'mine' clip stretches to fit

    // The mine mountain sits behind the river, above the crowd. Its peak and
    // base span are in world units; BackgroundScenery cuts a ledge and
    // a gold-veined rock face at every spot below.
    mine: {
        left: -1240,
        right: -260,
        peakX: -760,
        peakY: 30,
        baseY: -300,             // the river's surface, where every mountain starts
        ledgeWidth: 74,
        faceWidth: 28,           // from the miner's feet to the rock face, where the pick lands
        faceHeight: 54,
        crumbleDuration: 2.6,    // seconds for a new miner's cut to crack and fall open
    },
    // Feet position on the mountain and the side the rock face is on, one per
    // miner in buy order.
    spots: [
        { x: -950, y: -252, facing: 1 },
        { x: -575, y: -212, facing: -1 },
        { x: -880, y: -168, facing: 1 },
        { x: -680, y: -140, facing: -1 },
        { x: -800, y: -78, facing: 1 },
    ],

    zIndex: -1988,               // in front of the mine mountain, behind the river's landmarks
    footOffset: 3.77,            // body centre to the soles, in skeleton units
    scale: 0.62,                 // of a fan's size, so they read as far away
    walkSpeed: 70,               // climbing the slope to their ledge
    walkInBlend: 0.25,
    // Blend a little toward the mountain's colour so they sit in its haze.
    haze: { r: 22 / 255, g: 30 / 255, b: 42 / 255, a: 0.18 },

    // Stone pickaxe in the right hand, leather cap on the head.
    props: [
        { skeletonUrl: 'assets/skeletons/miner_pickaxe.json', parentPartId: 'arm_3_r', offsetY: -0.45 },
        { skeletonUrl: 'assets/skeletons/miner_helmet.json', parentPartId: 'body', offsetY: 1.95 },
    ],

    // Small round gold crumbs knocked out of the rock at every strike, sprayed
    // back off the face.
    crumbCount: [10, 14],
    crumbSpeed: [50, 120],
    crumbSpread: 0.9,            // radians either side of straight back off the face
    crumbUpwardBias: 0.55,       // 0 = straight back, 1 = straight up
    crumbGravity: 320,
    crumbLifetime: [0.15, 0.35],
    crumbSize: [0.6, 1.1],
    crumbColors: [[1, 0.84, 0.3], [1, 0.95, 0.65], [0.95, 0.68, 0.18], [1, 0.76, 0.24]],
};
