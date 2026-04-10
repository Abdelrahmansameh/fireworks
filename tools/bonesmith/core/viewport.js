import { state } from './state.js';
import { computePose, SkeletonData, hexToRgb, getParentTransform } from './math.js';
import { updateTimelineUI } from './ui.js';
import { AnimationData } from '../../../js/animation/AnimationData.js';

export function loop(now) {
    requestAnimationFrame(loop);

    const dt = (now - state.lastTime) / 1000.0;
    state.lastTime = now;
    const anim = state.meshData.animations[state.currentAnimId];
    if (state.isPlaying && anim) {
        state.currentTime += dt;
        if (state.currentTime > anim.duration) {
            if (anim.loop) {
                state.currentTime = state.currentTime % anim.duration;
            } else {
                state.currentTime = anim.duration;
                state.isPlaying = false;
                document.getElementById('btn-play-pause').textContent = 'Play';
            }
        }
        updateTimelineUI();
    }

    if (!state.instancedGroup || !state.renderer) return;

    // Refresh skeleton data if needed
    if (!state.skeletonData || state.skeletonData.parts !== state.meshData.parts) {
        state.skeletonData = new SkeletonData(state.meshData.parts);
    }

    // Compute current pose
    const overrides = new Map();
    if (state.editorMode === 'animation' && state.selectedPartId && !state.isPlaying) {
        const localRot  = parseFloat(document.getElementById('prop-rot').value)  || 0;
        const localOffX = parseFloat(document.getElementById('prop-offx').value) || 0;
        const localOffY = parseFloat(document.getElementById('prop-offy').value) || 0;
        const kfSXEl = document.getElementById('prop-kf-scalex');
        const kfSYEl = document.getElementById('prop-kf-scaley');
        const localSX = kfSXEl ? (parseFloat(kfSXEl.value) || 1) : 1;
        const localSY = kfSYEl ? (parseFloat(kfSYEl.value) || 1) : 1;
        const kfColorEl = document.getElementById('prop-kf-color');
        const kfAlphaEl = document.getElementById('prop-kf-alpha');
        let localR = 1, localG = 1, localB = 1, localA = 1;
        if (kfColorEl) {
            const hex = (kfColorEl.value || '#ffffff').replace('#', '');
            localR = parseInt(hex.slice(0, 2), 16) / 255;
            localG = parseInt(hex.slice(2, 4), 16) / 255;
            localB = parseInt(hex.slice(4, 6), 16) / 255;
        }
        if (kfAlphaEl) localA = parseFloat(kfAlphaEl.value) || 1;
        overrides.set(state.selectedPartId, {
            rotation: localRot, offsetX: localOffX, offsetY: localOffY,
            scaleX: localSX, scaleY: localSY,
            r: localR, g: localG, b: localB, a: localA,
        });
    }

    state.currentPose = computePose(state.skeletonData, anim, state.currentTime, overrides);

    state.instancedGroup.clear();

    // Background
    state.instancedGroup.addInstanceRaw(0, 0, 0, 200, 200, 1, 1, 1, 1);
    // Origin dot
    state.instancedGroup.addInstanceRaw(0, 0, 0, 0.2, 0.2, 1, 0, 0, 1);

    const sortedParts = Array.from(state.meshData.parts || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (let i = 0; i < sortedParts.length; i++) {
        const part = sortedParts[i];
        const tf = getParentTransform(part.id, state.currentTime);

        const anchorOffX = part.anchorX * part.width;
        const anchorOffY = part.anchorY * part.height;

        const cosR = Math.cos(tf.rotation);
        const sinR = Math.sin(tf.rotation);

        const drawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
        const drawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

        const c = hexToRgb(part.color || 'FFFFFF');
        // Apply animated tint (multiplicative, same as in the game renderer)
        let finalR = c.r * (tf.r ?? 1);
        let finalG = c.g * (tf.g ?? 1);
        let finalB = c.b * (tf.b ?? 1);
        let finalA = (part.alpha !== undefined ? part.alpha : 1.0) * (tf.a ?? 1);
        if (part.id === state.selectedPartId) {
            const highlight = 0.12;
            finalR = finalR + (1 - finalR) * highlight;
            finalG = finalG + (1 - finalG) * highlight;
            finalB = finalB + (1 - finalB) * highlight;
        }

        state.instancedGroup.addInstanceRaw(
            drawX, drawY,
            tf.rotation,
            part.width * tf.scaleX, part.height * tf.scaleY,
            finalR, finalG, finalB, finalA
        );

        if (part.id === state.selectedPartId) {
            const pivotSize = 0.5;

            if (state.currentTool === 'attach') {
                state.instancedGroup.addInstanceRaw(tf.x, tf.y, 0, pivotSize, pivotSize, 0, 1, 1, 1);

                if (part.parentId) {
                    const pObj = state.meshData.parts.find(p => p.id === part.parentId);
                    if (pObj) {
                        const pTf = getParentTransform(part.parentId, state.currentTime);
                        const pOffX = pObj.anchorX * pObj.width;
                        const pOffY = pObj.anchorY * pObj.height;
                        const pDrawX = pTf.x - (pOffX * Math.cos(pTf.rotation) - pOffY * Math.sin(pTf.rotation));
                        const pDrawY = pTf.y - (pOffX * Math.sin(pTf.rotation) + pOffY * Math.cos(pTf.rotation));
                        state.instancedGroup.addInstanceRaw(pDrawX, pDrawY, 0, pivotSize, pivotSize, 1, 1, 0, 1);
                    }
                }
            }
        }
    }

    // Render props
    if (state.editorMode === 'animation' && anim && anim.props) {
        for (const prop of anim.props) {
            if (state.currentTime >= prop.startTime && state.currentTime <= prop.endTime && prop.skeletonUrl) {
                let cached = state.loadedProps.get(prop.skeletonUrl);
                if (!cached) {
                    state.loadedProps.set(prop.skeletonUrl, { loading: true });
                    SkeletonData.load('../../' + prop.skeletonUrl).then(data => {
                        const { skeleton, rawAnimations } = data;
                        state.loadedProps.set(prop.skeletonUrl, {
                            skeleton,
                            animData: new AnimationData(rawAnimations)
                        });
                    }).catch(e => console.warn('Failed to load prop skeleton:', e));
                    continue;
                }
                if (cached.loading) continue;

                const pTf = getParentTransform(prop.parentPartId, state.currentTime);
                const propWorldX = pTf.x + ((prop.offsetX||0) * Math.cos(pTf.rotation) - (prop.offsetY||0) * Math.sin(pTf.rotation));
                const propWorldY = pTf.y + ((prop.offsetX||0) * Math.sin(pTf.rotation) + (prop.offsetY||0) * Math.cos(pTf.rotation));
                const propRot = pTf.rotation + (prop.rotation || 0);

                let clip = null;
                if (prop.animation && cached.animData.getClip(prop.animation)) {
                     clip = cached.animData.getClip(prop.animation);
                }
                
                const propLocalTime = state.currentTime - prop.startTime;
                const propTime = clip && clip.loop ? (propLocalTime % clip.duration) : Math.min(propLocalTime, clip ? clip.duration : 0);
                
                const propPose = computePose(cached.skeleton, clip, propTime);
                const pSortedParts = Array.from(cached.skeleton.parts || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
                
                for (let pi = 0; pi < pSortedParts.length; pi++) {
                    const pPart = pSortedParts[pi];
                    const pPartTf = propPose.get(pPart.id);
                    if (!pPartTf) continue;
                    
                    const anchorOffX = pPart.anchorX * pPart.width;
                    const anchorOffY = pPart.anchorY * pPart.height;
                    
                    const cx = pPartTf.x - (anchorOffX * Math.cos(pPartTf.rotation) - anchorOffY * Math.sin(pPartTf.rotation));
                    const cy = pPartTf.y - (anchorOffX * Math.sin(pPartTf.rotation) + anchorOffY * Math.cos(pPartTf.rotation));
                    
                    const finalX = propWorldX + (cx * Math.cos(propRot) - cy * Math.sin(propRot));
                    const finalY = propWorldY + (cx * Math.sin(propRot) + cy * Math.cos(propRot));
                    const finalRot = propRot + pPartTf.rotation;
                    
                    const c = hexToRgb(pPart.color || 'FFFFFF');
                    state.instancedGroup.addInstanceRaw(
                        finalX, finalY,
                        finalRot,
                        pPart.width, pPart.height,
                        c.r, c.g, c.b, pPart.alpha !== undefined ? pPart.alpha : 1.0
                    );
                }
            }
        }
    }

    state.renderer.drawFrame();
}
