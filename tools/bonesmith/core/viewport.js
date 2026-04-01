import { state } from './state.js';
import { getParentTransform, hexToRgb } from './math.js';
import { updateTimelineUI } from './ui.js';

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

    state.renderer.drawFrame();
}
