/**
 * AnimationData — Generic animation clip storage and keyframe interpolation.
 *
 * JSON format (animations object):
 *   { "animName": { duration, loop, tracks: { "partId": [ { time, rotation, offsetX, offsetY }, ... ] } } }
 */

/**
 * Evaluate a single track (array of keyframes) at the given time via linear interpolation.
 *
 * @param {Array<{time:number, rotation:number, offsetX:number, offsetY:number}>} track
 * @param {number} time
 * @returns {{rotation:number, offsetX:number, offsetY:number}}
 */
export function evalTrack(track, time) {
    if (!track || track.length === 0) return { rotation: 0, offsetX: 0, offsetY: 0 };
    if (time <= track[0].time) return track[0];
    const last = track[track.length - 1];
    if (time >= last.time) return last;

    for (let i = 0; i < track.length - 1; i++) {
        if (time >= track[i].time && time <= track[i + 1].time) {
            const t0 = track[i], t1 = track[i + 1];
            const ratio = (time - t0.time) / (t1.time - t0.time);
            return {
                rotation: t0.rotation + (t1.rotation - t0.rotation) * ratio,
                offsetX: t0.offsetX + (t1.offsetX - t0.offsetX) * ratio,
                offsetY: t0.offsetY + (t1.offsetY - t0.offsetY) * ratio,
            };
        }
    }
    return last;
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
     * @returns {{rotation:number, offsetX:number, offsetY:number}}
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
