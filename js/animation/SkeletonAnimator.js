/**
 * SkeletonAnimator — Computes world-space transforms (pose) for a skeleton
 * given an animation clip and time.
 *
 * Supports optional animation overlays with bone masking (hierarchy-aware)
 * and two blend modes:
 *   - 'additive'  : overlay deltas are ADDED on top of the base pose
 *   - 'override'  : overlay replaces the base pose on masked bones
 */

import { evalTrack } from './AnimationData.js';

/**
 * Expand a set of root bone ids to include ALL descendant bone ids,
 * given the skeleton parts array (must be parent-before-child order).
 *
 * @param {Array<Object>} parts
 * @param {Set<string>|null} rootMask — if null, returns null (means "all bones")
 * @returns {Set<string>|null}
 */
function expandBoneMask(parts, rootMask) {
    if (!rootMask) return null; // null = all bones affected

    const expanded = new Set(rootMask);
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.parentId && expanded.has(part.parentId)) {
            expanded.add(part.id);
        }
    }
    return expanded;
}

/**
 * Compute the world-space pose for every part of a skeleton.
 *
 * @param {import('./SkeletonData.js').SkeletonData} skeletonData
 * @param {import('./AnimationData.js').AnimationClip|null} clip — base animation clip (may be null for bind pose)
 * @param {number} time — current playback time within the base clip
 * @param {Map<string, {rotation?:number, offsetX?:number, offsetY?:number}>|null} [overrides] — optional per-part overrides
 * @param {{clip: import('./AnimationData.js').AnimationClip, time: number, mode: 'additive'|'override', boneMask: Set<string>|null}|null} [overlay]
 *        Optional animation overlay. boneMask lists the ROOT bones to affect (children are included automatically).
 * @returns {Map<string, {x:number, y:number, rotation:number, scaleX:number, scaleY:number, r:number, g:number, b:number, a:number}>} partId → world transform of pivot
 */
export function computePose(skeletonData, clip, time, overrides = null, overlay = null) {
    const parts = skeletonData.parts;
    const pivotMap = new Map();

    // Pre-expand the overlay bone mask once (includes all hierarchy children).
    // expandedMask === null means "all bones".
    const expandedMask = overlay ? expandBoneMask(parts, overlay.boneMask) : null;
    const hasOverlay = overlay !== null;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        let parentX = 0, parentY = 0, parentRot = 0;
        let parentW = 10, parentH = 10;

        if (part.parentId) {
            const pTf = pivotMap.get(part.parentId);
            parentX = pTf.x;
            parentY = pTf.y;
            parentRot = pTf.rotation;
            const pPart = skeletonData.getPart(part.parentId);
            parentW = pPart.width;
            parentH = pPart.height;
        }

        // ── Base clip evaluation ──────────────────────────────────────────────
        let localRot = 0, localOffX = 0, localOffY = 0;
        let localScaleX = 1, localScaleY = 1;
        let localR = 1, localG = 1, localB = 1, localA = 1;
        if (clip && clip.tracks[part.id]) {
            const kf = evalTrack(clip.tracks[part.id], time);
            localRot    = kf.rotation;
            localOffX   = kf.offsetX;
            localOffY   = kf.offsetY;
            localScaleX = kf.scaleX;
            localScaleY = kf.scaleY;
            localR = kf.r; localG = kf.g; localB = kf.b; localA = kf.a;
        }

        // Apply manual overrides if any
        if (overrides && overrides.has(part.id)) {
            const o = overrides.get(part.id);
            if (o.rotation !== undefined) localRot = o.rotation;
            if (o.offsetX !== undefined) localOffX = o.offsetX;
            if (o.offsetY !== undefined) localOffY = o.offsetY;
            if (o.scaleX  !== undefined) localScaleX = o.scaleX;
            if (o.scaleY  !== undefined) localScaleY = o.scaleY;
            if (o.r !== undefined) localR = o.r;
            if (o.g !== undefined) localG = o.g;
            if (o.b !== undefined) localB = o.b;
            if (o.a !== undefined) localA = o.a;
        }

        // ── Overlay blending ──────────────────────────────────────────────────
        if (hasOverlay) {
            const inMask = expandedMask === null || expandedMask.has(part.id);
            if (inMask && overlay.clip && overlay.clip.tracks[part.id]) {
                const okf = evalTrack(overlay.clip.tracks[part.id], overlay.time);
                if (overlay.mode === 'override') {
                    localRot    = okf.rotation;
                    localOffX   = okf.offsetX;
                    localOffY   = okf.offsetY;
                    localScaleX = okf.scaleX;
                    localScaleY = okf.scaleY;
                    localR = okf.r; localG = okf.g; localB = okf.b; localA = okf.a;
                } else {
                    // additive: add overlay deltas on top of base
                    localRot    += okf.rotation;
                    localOffX   += okf.offsetX;
                    localOffY   += okf.offsetY;
                    localScaleX *= okf.scaleX;
                    localScaleY *= okf.scaleY;
                    localR *= okf.r; localG *= okf.g; localB *= okf.b; localA *= okf.a;
                }
            }
        }

        // ── World-space accumulation ──────────────────────────────────────────
        const cosP = Math.cos(parentRot);
        const sinP = Math.sin(parentRot);
        const pivotLocalX = part.relX * parentW;
        const pivotLocalY = part.relY * parentH;

        let pivotWorldX = parentX + (pivotLocalX * cosP - pivotLocalY * sinP);
        let pivotWorldY = parentY + (pivotLocalX * sinP + pivotLocalY * cosP);
        pivotWorldX += localOffX * cosP - localOffY * sinP;
        pivotWorldY += localOffX * sinP + localOffY * cosP;

        pivotMap.set(part.id, {
            x: pivotWorldX,
            y: pivotWorldY,
            rotation: parentRot + (part.baseRotation || 0) + localRot,
            scaleX: localScaleX,
            scaleY: localScaleY,
            r: localR, g: localG, b: localB, a: localA,
        });
    }

    return pivotMap;
}

/**
 * Apply a computed pose to an instanced rendering group.
 *
 * @param {import('./SkeletonData.js').SkeletonData} skeletonData
 * @param {Map<string, {x:number, y:number, rotation:number}>} pose — from computePose()
 * @param {Object} instancedGroup — Renderer2D instanced group
 * @param {number} baseInstanceIndex — starting instance index for this entity
 * @param {number} worldX — entity world X position
 * @param {number} worldY — entity world Y position
 * @param {number} scale — entity scale
 * @param {number} flipX — 1 or -1
 */
export function applyPoseToInstances(skeletonData, pose, instancedGroup, baseInstanceIndex, worldX, worldY, scale, flipX, tint = null) {
    const parts = skeletonData.parts;
    const colors = skeletonData.partColors;

    const drawIndexMap = skeletonData.drawIndexMap || null;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const tf = pose.get(part.id);
        if (!tf) 
            continue;

        const anchorOffX = part.anchorX * part.width;
        const anchorOffY = part.anchorY * part.height;
        const cosR = Math.cos(tf.rotation);
        const sinR = Math.sin(tf.rotation);

        // Mesh-space draw center
        const meshDrawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
        const meshDrawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

        // Apply entity transform
        const wx = worldX + meshDrawX * flipX * scale;
        const wy = worldY + meshDrawY * scale;

        const c = colors[i];
        // Bone animation tint (multiplicative on top of base color)
        const boneR = tf.r ?? 1, boneG = tf.g ?? 1, boneB = tf.b ?? 1, boneA = tf.a ?? 1;
        let cr = c.r * boneR;
        let cg = c.g * boneG;
        let cb = c.b * boneB;
        let ca = (c.a !== undefined ? c.a : 1) * boneA;
        if (tint) {
            // blend with tint.a as factor
            cr = cr + (tint.r - cr) * tint.a;
            cg = cg + (tint.g - cg) * tint.a;
            cb = cb + (tint.b - cb) * tint.a;
        }

        // Bone animation scale (multiplicative on top of entity scale)
        const boneScaleX = tf.scaleX ?? 1;
        const boneScaleY = tf.scaleY ?? 1;

        const drawOffset = drawIndexMap ? (drawIndexMap.get(part.id) || 0) : i;
        const idx = baseInstanceIndex + drawOffset;
        instancedGroup.updateInstancePosition(idx, wx, wy);
        instancedGroup.updateInstanceScale(idx, part.width * scale * boneScaleX, part.height * scale * boneScaleY);
        instancedGroup.updateInstanceRotation(idx, tf.rotation * flipX);
        instancedGroup.updateInstanceColor(idx, cr, cg, cb, ca);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton outline helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convex hull of a set of 2D points via Andrew's Monotone Chain.
 * Returns hull vertices in counter-clockwise order (y-up math convention).
 * @param {{x:number,y:number}[]} pts
 * @returns {{x:number,y:number}[]}
 */
function convexHull(pts) {
    if (pts.length < 3) return pts.slice();
    const sorted = pts.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

/**
 * Compute the world-space convex hull outline of all skeleton rectangle corners,
 * using the same transform as applyPoseToInstances.
 *
 * @param {import('./SkeletonData.js').SkeletonData} skeletonData
 * @param {Map<string,{x:number,y:number,rotation:number,scaleX:number,scaleY:number}>} pose — from computePose()
 * @param {number} worldX — entity world X
 * @param {number} worldY — entity world Y
 * @param {number} scale  — entity scale
 * @param {number} flipX  — 1 or -1
 * @returns {{x:number,y:number}[]} convex hull vertices (empty if no parts)
 */
export function computeSkeletonOutlinePoints(skeletonData, pose, worldX, worldY, scale, flipX) {
    const parts = skeletonData.parts;
    const allCorners = [];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const tf = pose.get(part.id);
        if (!tf) continue;

        const boneScaleX = tf.scaleX ?? 1;
        const boneScaleY = tf.scaleY ?? 1;

        const anchorOffX = part.anchorX * part.width;
        const anchorOffY = part.anchorY * part.height;
        const cosR = Math.cos(tf.rotation);
        const sinR = Math.sin(tf.rotation);

        // Mesh-space draw centre (matches applyPoseToInstances)
        const meshDrawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
        const meshDrawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

        const cx = worldX + meshDrawX * flipX * scale;
        const cy = worldY + meshDrawY * scale;

        const hw = (part.width  * scale * boneScaleX) / 2;
        const hh = (part.height * scale * boneScaleY) / 2;

        // Rotation applied to draw — flipX mirrors the rotation sign (matches render)
        const rot = tf.rotation * flipX;
        const cosF = Math.cos(rot);
        const sinF = Math.sin(rot);

        // 4 corners of the rectangle
        for (const [dx, dy] of [[hw, hh], [hw, -hh], [-hw, hh], [-hw, -hh]]) {
            allCorners.push({
                x: cx + dx * cosF - dy * sinF,
                y: cy + dx * sinF + dy * cosF,
            });
        }
    }

    if (allCorners.length === 0) return [];
    return convexHull(allCorners);
}
