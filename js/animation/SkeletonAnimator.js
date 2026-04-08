/**
 * SkeletonAnimator — Computes world-space transforms (pose) for a skeleton
 * given an animation clip and time.
 *
 * This is the pose-solver extracted from Crowd.js _updateProceduralAnimation.
 */

import { evalTrack } from './AnimationData.js';

/**
 * Compute the world-space pose for every part of a skeleton.
 *
 * @param {import('./SkeletonData.js').SkeletonData} skeletonData
 * @param {import('./AnimationData.js').AnimationClip|null} clip — current animation clip (may be null for bind pose)
 * @param {number} time — current playback time within the clip
 * @param {Map<string, {rotation?:number, offsetX?:number, offsetY?:number}>} [overrides] — optional overrides for specific parts
 * @returns {Map<string, {x:number, y:number, rotation:number}>} partId → world transform of pivot
 */
export function computePose(skeletonData, clip, time, overrides = null) {
    const parts = skeletonData.parts;
    const pivotMap = new Map();

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

        // Evaluate animation keyframes for this part
        let localRot = 0, localOffX = 0, localOffY = 0;
        if (clip && clip.tracks[part.id]) {
            const kf = evalTrack(clip.tracks[part.id], time);
            localRot = kf.rotation;
            localOffX = kf.offsetX;
            localOffY = kf.offsetY;
        }

        // Apply overrides if any
        if (overrides && overrides.has(part.id)) {
            const o = overrides.get(part.id);
            if (o.rotation !== undefined) localRot = o.rotation;
            if (o.offsetX !== undefined) localOffX = o.offsetX;
            if (o.offsetY !== undefined) localOffY = o.offsetY;
        }

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
        let cr = c.r, cg = c.g, cb = c.b;
        if (tint) {
            // blend with tint.a as factor
            cr = cr + (tint.r - cr) * tint.a;
            cg = cg + (tint.g - cg) * tint.a;
            cb = cb + (tint.b - cb) * tint.a;
        }

        const drawOffset = drawIndexMap ? (drawIndexMap.get(part.id) || 0) : i;
        const idx = baseInstanceIndex + drawOffset;
        instancedGroup.updateInstancePosition(idx, wx, wy);
        instancedGroup.updateInstanceScale(idx, part.width * scale, part.height * scale);
        instancedGroup.updateInstanceRotation(idx, tf.rotation * flipX);
        instancedGroup.updateInstanceColor(idx, cr, cg, cb, 1);
    }
}
