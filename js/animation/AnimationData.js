/**
 * AnimationData — Generic animation clip storage and keyframe interpolation.
 *
 * JSON format (animations object):
 *   { "animName": { duration, loop, tracks: { "partId": [ { time, rotation, offsetX, offsetY }, ... ] } } }
 */

/**
 * Evaluate a single track (array of keyframes) at the given time via linear interpolation.
 *
 * Keyframe fields: time, rotation, offsetX, offsetY,
 *                  scaleX, scaleY (default 1 = no change),
 *                  r, g, b, a (color tint multiplier, default 1 = full base color)
 *
 * @param {Array<{time:number, rotation:number, offsetX:number, offsetY:number, scaleX?:number, scaleY?:number, r?:number, g?:number, b?:number, a?:number}>} track
 * @param {number} time
 * @returns {{rotation:number, offsetX:number, offsetY:number, scaleX:number, scaleY:number, r:number, g:number, b:number, a:number}}
 */
export function evalTrack(track, time) {
    const DEFAULTS = { rotation: 0, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, r: 1, g: 1, b: 1, a: 1 };
    if (!track || track.length === 0) return { ...DEFAULTS };

    function kfWithDefaults(kf) {
        return {
            rotation: kf.rotation ?? 0,
            offsetX: kf.offsetX ?? 0,
            offsetY: kf.offsetY ?? 0,
            scaleX: kf.scaleX ?? 1,
            scaleY: kf.scaleY ?? 1,
            r: kf.r ?? 1,
            g: kf.g ?? 1,
            b: kf.b ?? 1,
            a: kf.a ?? 1,
        };
    }

    if (time <= track[0].time) return kfWithDefaults(track[0]);
    const last = track[track.length - 1];
    if (time >= last.time) return kfWithDefaults(last);

    for (let i = 0; i < track.length - 1; i++) {
        if (time >= track[i].time && time <= track[i + 1].time) {
            const t0 = track[i], t1 = track[i + 1];
            const ratio = (time - t0.time) / (t1.time - t0.time);
            const lerp = (a, b) => a + (b - a) * ratio;
            const d0 = kfWithDefaults(t0), d1 = kfWithDefaults(t1);
            return {
                rotation: lerp(d0.rotation, d1.rotation),
                offsetX:  lerp(d0.offsetX,  d1.offsetX),
                offsetY:  lerp(d0.offsetY,  d1.offsetY),
                scaleX:   lerp(d0.scaleX,   d1.scaleX),
                scaleY:   lerp(d0.scaleY,   d1.scaleY),
                r:        lerp(d0.r, d1.r),
                g:        lerp(d0.g, d1.g),
                b:        lerp(d0.b, d1.b),
                a:        lerp(d0.a, d1.a),
            };
        }
    }
    return kfWithDefaults(last);
}

/**
 * AnimationClip — wraps a single animation clip.
 */
export class AnimationClip {
    /**
     * @param {string} name
     * @param {number} duration
     * @param {boolean} loop
     * @param {Object<string, Array>} tracks — partId → keyframe array
     * @param {Array<Object>} props — array of prop definitions spawned during animation
     */
    constructor(name, duration, loop, tracks, props = []) {
        this.name = name;
        this.duration = duration;
        this.loop = loop;
        this.tracks = tracks;
        this.props = props;
    }

    /**
     * Evaluate a part's track at a given time.
     * @param {string} partId
     * @param {number} time
     * @returns {{rotation:number, offsetX:number, offsetY:number, scaleX:number, scaleY:number, r:number, g:number, b:number, a:number}}
     */
    evaluate(partId, time) {
        return evalTrack(this.tracks[partId], time);
    }
}

/**
 * AnimationData — dictionary of named animation clips.
 */
export class AnimationData {
    /**
     * @param {Object} rawAnimations — the animations object from the JSON
     */
    constructor(rawAnimations) {
        /** @type {Map<string, AnimationClip>} */
        this.clips = new Map();
        for (const [name, data] of Object.entries(rawAnimations)) {
            this.clips.set(name, new AnimationClip(name, data.duration, data.loop, data.tracks, data.props || []));
        }
    }

    /**
     * @param {string} name
     * @returns {AnimationClip|undefined}
     */
    getClip(name) {
        return this.clips.get(name);
    }

    /**
     * Get all clip names.
     * @returns {string[]}
     */
    getClipNames() {
        return Array.from(this.clips.keys());
    }
}
