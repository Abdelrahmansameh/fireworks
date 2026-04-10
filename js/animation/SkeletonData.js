/**
 * SkeletonData — Generic skeleton definition loaded from a JSON asset.
 *
 * JSON format (parts array):
 *   { parts: [ { id, parentId, width, height, anchorX, anchorY, relX, relY, color, baseRotation? }, ... ],
 *     animations: { ... } }
 *
 * This module only handles the *skeleton* (parts hierarchy).
 * Animation data is handled by AnimationData.js.
 */

export function hexToRgb(hex) {
    const h = (hex || '000000').replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
    };
}

export class SkeletonData {
    /**
     * @param {Array} parts — raw parts array from the JSON
     */
    constructor(parts) {
        /** @type {Array<Object>} ordered part definitions */
        this.parts = parts;

        /** @type {number} */
        this.partCount = parts.length;

        /** @type {Map<string, Object>} partId → part object */
        this.partLookup = new Map();

        /** @type {Array<{r:number, g:number, b:number}>} precomputed colours */
        this.partColors = [];

        for (const p of parts) {
            this.partLookup.set(p.id, p);
            const rgb = hexToRgb(p.color);
            rgb.a = (p.alpha !== undefined ? p.alpha : 1);
            this.partColors.push(rgb);
        }

        const indexed = parts.map((p, idx) => ({ idx, z: (p.z || 0) }));
        indexed.sort((a, b) => a.z - b.z);
        this.drawOrder = indexed.map(x => x.idx);

        this.drawIndexMap = new Map();
        for (let i = 0; i < this.drawOrder.length; i++) {
            const part = parts[this.drawOrder[i]];
            this.drawIndexMap.set(part.id, i);
        }
    }

    /**
     * Get a part definition by id.
     * @param {string} id
     * @returns {Object|undefined}
     */
    getPart(id) {
        return this.partLookup.get(id);
    }

    /**
     * Load a SkeletonData (and its AnimationData) from a JSON URL.
     * Returns { skeleton, animationData } where animationData is the raw animations object.
     * (AnimationData wrapping is left to the caller.)
     *
     * @param {string} url
     * @returns {Promise<{ skeleton: SkeletonData, rawAnimations: Object }>}
     */
    static async load(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load skeleton: HTTP ${res.status} from ${url}`);
        const json = await res.json();
        return {
            skeleton: new SkeletonData(json.parts || []),
            rawAnimations: json.animations || {},
        };
    }
}
