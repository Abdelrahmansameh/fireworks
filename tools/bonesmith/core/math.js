import { state } from './state.js';

export function getParentTransform(partId, time) {
    const part = state.meshData.parts.find(p => p.id === partId);
    if (!part) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

    let parentTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    if (part.parentId) {
        parentTransform = getParentTransform(part.parentId, time);
    }

    let localRot = 0;
    let localOffX = 0;
    let localOffY = 0;

    if (state.editorMode === 'animation' && partId === state.selectedPartId && !state.isPlaying) {
        localRot = parseFloat(document.getElementById('prop-rot').value) || 0;
        localOffX = parseFloat(document.getElementById('prop-offx').value) || 0;
        localOffY = parseFloat(document.getElementById('prop-offy').value) || 0;
    } else if (state.editorMode === 'animation') {
        const anim = state.meshData.animations[state.currentAnimId];
        const vals = sampleAnimValuesAt(partId, time, anim);
        localRot = vals.rotation || 0;
        localOffX = vals.offsetX || 0;
        localOffY = vals.offsetY || 0;
    }

    let parentW = 10, parentH = 10;
    if (part.parentId) {
        const pObj = state.meshData.parts.find(p => p.id === part.parentId);
        if (pObj) { parentW = pObj.width; parentH = pObj.height; }
    }

    let pivotLocalX = part.relX * parentW;
    let pivotLocalY = part.relY * parentH;

    const cosP = Math.cos(parentTransform.rotation);
    const sinP = Math.sin(parentTransform.rotation);
    let pivotWorldX = parentTransform.x + (pivotLocalX * cosP - pivotLocalY * sinP);
    let pivotWorldY = parentTransform.y + (pivotLocalX * sinP + pivotLocalY * cosP);

    pivotWorldX += (localOffX * cosP - localOffY * sinP);
    pivotWorldY += (localOffX * sinP + localOffY * cosP);

    const worldRot = parentTransform.rotation + (part.baseRotation || 0) + localRot;

    return {
        x: pivotWorldX,
        y: pivotWorldY,
        rotation: worldRot,
        scaleX: 1,
        scaleY: 1
    };
}

// Sample a track for a part at a specific time (local animation values)
export function sampleAnimValuesAt(partId, time, anim) {
    if (!anim || !anim.tracks) return { rotation: 0, offsetX: 0, offsetY: 0 };
    const track = anim.tracks[partId];
    if (!track || track.length === 0) return { rotation: 0, offsetX: 0, offsetY: 0 };
    if (time <= track[0].time) return { rotation: track[0].rotation, offsetX: track[0].offsetX, offsetY: track[0].offsetY };
    if (time >= track[track.length - 1].time) return { rotation: track[track.length - 1].rotation, offsetX: track[track.length - 1].offsetX, offsetY: track[track.length - 1].offsetY };
    for (let i = 0; i < track.length - 1; i++) {
        const a = track[i], b = track[i + 1];
        if (time >= a.time && time <= b.time) {
            const ratio = (time - a.time) / (b.time - a.time);
            return {
                rotation: a.rotation + (b.rotation - a.rotation) * ratio,
                offsetX: a.offsetX + (b.offsetX - a.offsetX) * ratio,
                offsetY: a.offsetY + (b.offsetY - a.offsetY) * ratio
            };
        }
    }
    return { rotation: 0, offsetX: 0, offsetY: 0 };
}

export function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        };
    }
    return { r: 0, g: 0, b: 0 };
}
