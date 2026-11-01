#!/usr/bin/env node
// Authors the cultist ritual: the crowd 'ritual' clip plus the hood, brim and
// bowl props, all from one keyframe table so they stay in sync. The body
// height is solved per keyframe so the feet stay planted through the squash.
// Run: node tools/build_cultist_ritual.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { SkeletonData } from '../js/animation/SkeletonData.js';
import { AnimationData } from '../js/animation/AnimationData.js';
import { computePose } from '../js/animation/SkeletonAnimator.js';

const DIR = new URL('../assets/skeletons/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));
const write = (name, data) => writeFileSync(new URL(name, DIR),
    JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + '\r\n');
const r3 = v => Math.round(v * 1000) / 1000;

// One loop is one production tick (payoutInterval in BuildingConfig, 1.1s).
// t=0 is the climax: sparkles erupt. Keys below are timed on a 1s move; the
// climax pose is then held for HOLD seconds before the follow-through.
// leg = sumo-squat splay, sx/sy = body squash, a1..a3 = right arm bends
// (mirrored on the left), esy = eye stretch, gold = eye glow, tip = hood flop.
const MOVE = [
    { t: 0.00, leg: 0.00, sx: 0.84, sy: 1.20, a1: 0.95, a2: 0.05, a3: -0.05, esy: 1.25, pupil: 0.5, gold: 1.0, tip: 0.15, glow: 1.45 },
    { t: 0.07, leg: 0.00, sx: 0.90, sy: 1.14, a1: 1.05, a2: 0.15, a3: 0.10, esy: 1.15, pupil: 0.55, gold: 0.8, tip: -0.15, glow: 1.3 },
    { t: 0.20, leg: 0.08, sx: 0.97, sy: 1.04, a1: 0.70, a2: -0.10, a3: -0.10, esy: 1.0, pupil: 0.8, gold: 0.3, tip: 0.12, glow: 1.0 },
    { t: 0.34, leg: 0.40, sx: 1.06, sy: 0.95, a1: -0.10, a2: -0.30, a3: -0.20, esy: 1.0, pupil: 1.0, gold: 0.0, tip: -0.05, glow: 0.7 },
    { t: 0.46, leg: 0.85, sx: 1.17, sy: 0.85, a1: -0.85, a2: -0.45, a3: -0.50, esy: 0.55, pupil: 0.9, gold: 0.0, tip: -0.20, glow: 0.7 },
    // Hands wiggle over the bowl while the cultist coils lower and lower.
    { t: 0.54, leg: 0.95, sx: 1.19, sy: 0.83, a1: -1.00, a2: -0.10, a3: 0.30, esy: 0.5, pupil: 0.9, gold: 0.0, tip: -0.25, glow: 0.75 },
    { t: 0.62, leg: 0.98, sx: 1.16, sy: 0.85, a1: -0.95, a2: -0.60, a3: -0.50, esy: 0.5, pupil: 0.85, gold: 0.05, tip: -0.20, glow: 0.8 },
    { t: 0.70, leg: 1.02, sx: 1.20, sy: 0.82, a1: -1.02, a2: -0.10, a3: 0.35, esy: 0.5, pupil: 0.8, gold: 0.1, tip: -0.25, glow: 0.85 },
    { t: 0.78, leg: 1.05, sx: 1.18, sy: 0.84, a1: -0.97, a2: -0.60, a3: -0.55, esy: 0.5, pupil: 0.75, gold: 0.15, tip: -0.20, glow: 0.9 },
    { t: 0.86, leg: 1.12, sx: 1.24, sy: 0.79, a1: -1.10, a2: -0.20, a3: 0.30, esy: 0.45, pupil: 0.7, gold: 0.3, tip: -0.30, glow: 1.05 },
    // Snap upward: the release that throws the sparkles.
    { t: 0.93, leg: 0.45, sx: 0.90, sy: 1.12, a1: 0.60, a2: 0.10, a3: 0.00, esy: 1.1, pupil: 0.6, gold: 0.7, tip: 0.25, glow: 1.2 },
];
const HOLD = 0.1;
const DURATION = 1 + HOLD;
// Arms keep reaching and the hands flick while the climax pose is held.
const CLIMAX = MOVE[0];
const KEYS = [
    CLIMAX,
    { ...CLIMAX, t: 0.05, a1: 1.15, a2: 0.25, a3: 0.30, tip: 0.05 },
    { ...CLIMAX, t: HOLD, a1: 1.05, a2: -0.05, a3: -0.15, tip: 0.20 },
    ...MOVE.slice(1).map(k => ({ ...k, t: r3(k.t + HOLD) })),
    { ...CLIMAX, t: DURATION },
];

const crowd = read('crowd.json');
const skeleton = new SkeletonData(crowd.parts);
const part = id => crowd.parts.find(p => p.id === id);
const BODY_H = part('body').height / 2;
const SHOULDER_Y = part('arm_1_r').relY * part('body').height;
const SHOULDER_X = part('arm_1_r').relX * part('body').width;
const EYE_Y = part('eye_r').relY * part('body').height;
const EYE_X = part('eye_r').relX * part('body').width;

// Share of the keyed leg splay actually shown. The rest of the squat depth
// comes from tucking the legs up behind the body, so the body still drops
// as low as the full splay would take it while the feet stay planted.
const LEG_SPLAY = 0.3;

function bodyTracks(k, bodyY, tuck = 0) {
    const legY = BODY_H * (1 - k.sy) + tuck;
    const gold = { r: 1, g: r3(1 - 0.12 * k.gold), b: r3(1 - 0.5 * k.gold) };
    return {
        body: { offsetY: r3(bodyY), scaleX: k.sx, scaleY: k.sy },
        body_outline: { scaleX: k.sx, scaleY: k.sy },
        leg_l: { rotation: -k.leg, offsetY: r3(legY) },
        leg_r: { rotation: k.leg, offsetY: r3(legY) },
        foot_l: { rotation: k.leg },
        foot_r: { rotation: -k.leg },
        arm_1_r: { rotation: k.a1, offsetX: r3(SHOULDER_X * (k.sx - 1)), offsetY: r3(SHOULDER_Y * (k.sy - 1)) },
        arm_1_l: { rotation: -k.a1, offsetX: r3(-SHOULDER_X * (k.sx - 1)), offsetY: r3(SHOULDER_Y * (k.sy - 1)) },
        arm_2_r: { rotation: k.a2 }, arm_2_l: { rotation: -k.a2 },
        arm_3_r: { rotation: k.a3 }, arm_3_l: { rotation: -k.a3 },
        eye_r: { offsetX: r3(EYE_X * Math.max(0, k.sx - 1)), offsetY: r3(EYE_Y * (k.sy - 1)), scaleY: k.esy, ...gold },
        eye_l: { offsetX: r3(-EYE_X * Math.max(0, k.sx - 1)), offsetY: r3(EYE_Y * (k.sy - 1)), scaleY: k.esy, ...gold },
        eye_r_outline: { scaleY: k.esy },
        eye_l_outline: { scaleY: k.esy },
        pupil_r: { scaleX: k.pupil, scaleY: k.pupil },
        pupil_l: { scaleX: k.pupil, scaleY: k.pupil },
    };
}

// Lowest point of the foot outlines, i.e. where the person meets the ground.
function groundY(tracks) {
    const clip = new AnimationData({ k: { duration: 1, loop: false,
        tracks: Object.fromEntries(Object.entries(tracks).map(([id, kf]) => [id, [{ time: 0, ...kf }]])) } }).getClip('k');
    const pose = computePose(skeleton, clip, 0);
    let low = Infinity;
    for (const id of ['foot_l_outline', 'foot_r_outline']) {
        const p = part(id), tf = pose.get(id);
        const cx = tf.x - (p.anchorX * p.width * Math.cos(tf.rotation) - p.anchorY * p.height * Math.sin(tf.rotation));
        const cy = tf.y - (p.anchorX * p.width * Math.sin(tf.rotation) + p.anchorY * p.height * Math.cos(tf.rotation));
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const hx = dx * p.width / 2, hy = dy * p.height / 2;
            low = Math.min(low, cy + hx * Math.sin(tf.rotation) + hy * Math.cos(tf.rotation));
        }
    }
    return low;
}

const GROUND = groundY({});
const solved = KEYS.map(keyed => {
    const fullDrop = GROUND - groundY(bodyTracks(keyed, 0));
    const k = { ...keyed, leg: keyed.leg * LEG_SPLAY };
    const tuck = Math.max(0, GROUND - groundY(bodyTracks(k, 0)) - fullDrop);
    const bodyY = GROUND - groundY(bodyTracks(k, 0, tuck));
    return { k, bodyY, tracks: bodyTracks(k, bodyY, tuck) };
});

const toClip = (fn) => {
    const tracks = {};
    for (const { k, bodyY, tracks: bt } of solved) {
        for (const [id, kf] of Object.entries(fn(k, bodyY, bt))) {
            (tracks[id] ??= []).push({ time: k.t, ...kf });
        }
    }
    return { duration: DURATION, loop: true, tracks };
};

// Tracks hand-tuned in the skeleton editor survive a rebuild.
const HAND_TUNED = ['pupil_r', 'pupil_l'];
const ritualClip = toClip((k, bodyY, bt) => bt);
const oldRitual = crowd.animations.ritual;
for (const id of HAND_TUNED) {
    let tuned = oldRitual?.tracks?.[id];
    if (!tuned) continue;
    // Tracks authored before the hold existed: delay everything after the
    // climax by HOLD and keep the climax key through the hold.
    if (oldRitual.duration !== DURATION) {
        const shift = DURATION - oldRitual.duration;
        tuned = tuned.flatMap(k => k.time === 0
            ? [k, { ...k, time: r3(shift) }]
            : [{ ...k, time: r3(k.time + shift) }]);
    }
    ritualClip.tracks[id] = tuned;
}

const BOWL_URL = 'assets/skeletons/cultist_bowl.json';
crowd.animations.ritual = {
    ...ritualClip,
    props: [{ skeletonUrl: BOWL_URL, animation: 'ritual', parentPartId: 'body',
        startTime: 0, endTime: DURATION, offsetX: 0, offsetY: r3(GROUND) }],
};
write('crowd.json', crowd);

const rect = (id, parentId, width, height, relY, color, z, extra = {}) => ({
    id, parentId, width, height, anchorX: 0, anchorY: 0, relX: 0, relY, color, z, ...extra });
const pivot = (id, parentId, relY, z) => rect(id, parentId, 1, 1, relY, 'ffffff', z, { alpha: 0 });

// Hood: drawn behind the body so only its crown and cowl edges show. The
// tip droops toward the back and flops with the motion. The root rides the
// top edge of the (squashing) body.
const hoodTop = (k) => ({ offsetY: r3(BODY_H * (k.sy - 1)) });
write('cultist_hood.json', {
    parts: [
        pivot('hood_root', null, 0, 0),
        // Exactly as wide as the head outline, so it never sticks out past it.
        rect('cowl_outline', 'hood_root', 4.4, 3.0, -0.55, '000000', -10),
        { ...pivot('tip', 'hood_root', 0.6, 0), relX: -0.25, baseRotation: 0.15 },
        rect('tip_outline', 'tip', 2.0, 2.0, 0.1, '000000', -9, { baseRotation: 0.7854 }),
        rect('cowl', 'hood_root', 4.0, 2.6, -0.55, '3a2563', 0),
        rect('tip_fill', 'tip', 1.6, 1.6, 0.1, '3a2563', 1, { baseRotation: 0.7854 }),
    ],
    animations: {
        ritual: toClip(k => ({
            hood_root: hoodTop(k),
            cowl: { scaleX: k.sx }, cowl_outline: { scaleX: k.sx },
            tip: { rotation: k.tip },
        })),
    },
});

// Brim: the front lip of the hood, shading the eyes while the cultist coils.
write('cultist_brim.json', {
    parts: [
        pivot('brim_root', null, 0, 0),
        // Sits on the top edge of the head, clear of the eyes.
        rect('brim_outline', 'brim_root', 4.4, 0.8, 0.05, '000000', 0),
        rect('brim', 'brim_root', 4.0, 0.4, 0.05, '2b1b48', 1),
    ],
    animations: {
        ritual: toClip(k => ({
            brim_root: hoodTop(k),
            brim: { scaleX: k.sx }, brim_outline: { scaleX: k.sx },
        })),
    },
});

// Bowl: sits on the ground in front of the feet (the root cancels the body's
// bob). Its glowing pool flares at the climax.
write('cultist_bowl.json', {
    parts: [
        pivot('bowl_root', null, 0, 0),
        rect('bowl_outline', 'bowl_root', 2.9, 1.35, 0.5, '000000', -10),
        rect('rim_outline', 'bowl_root', 3.3, 0.7, 1.05, '000000', -9),
        rect('bowl', 'bowl_root', 2.5, 0.95, 0.5, '3a3346', 0),
        rect('rim', 'bowl_root', 2.9, 0.3, 1.05, '5b5170', 1),
        rect('glow', 'bowl_root', 2.3, 0.18, 1.2, 'ffd25e', 2),
        rect('emitter', 'bowl_root', 0.01, 0.01, 1.35, 'ffffff', 3, { alpha: 0 }),
    ],
    animations: {
        ritual: toClip((k, bodyY) => ({
            bowl_root: { offsetY: r3(-bodyY) },
            glow: { scaleX: r3(Math.min(1.05, 0.75 + 0.2 * k.glow)), scaleY: k.glow,
                r: 1, g: r3(0.85 + 0.15 * Math.min(1, k.glow)), b: r3(0.6 + 0.4 * Math.max(0, k.glow - 1)) },
        })),
    },
});

console.log(`ritual written; ground ${r3(GROUND)}, body y range`,
    r3(Math.min(...solved.map(s => s.bodyY))), r3(Math.max(...solved.map(s => s.bodyY))));
