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
        const localRot = parseFloat(document.getElementById('prop-rot').value) || 0;
        const localOffX = parseFloat(document.getElementById('prop-offx').value) || 0;
        const localOffY = parseFloat(document.getElementById('prop-offy').value) || 0;
        overrides.set(state.selectedPartId, { rotation: localRot, offsetX: localOffX, offsetY: localOffY });
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

        let finalR = c.r, finalG = c.g, finalB = c.b;
        if (part.id === state.selectedPartId) {
            const highlight = 0.12;
            finalR = c.r + (1 - c.r) * highlight;
            finalG = c.g + (1 - c.g) * highlight;
            finalB = c.b + (1 - c.b) * highlight;
        }

        state.instancedGroup.addInstanceRaw(
            drawX, drawY,
            tf.rotation,
            part.width * tf.scaleX, part.height * tf.scaleY,
            finalR, finalG, finalB, 1.0
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
                        c.r, c.g, c.b, 1.0
                    );
                }
            }
        }
    }

    state.renderer.drawFrame();
}
