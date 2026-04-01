import { state } from './state.js';
import { saveState } from './undo.js';
import { updateHierarchyUI, selectPart, updateTimelineUI } from './ui.js';

export function deletePart(id) {
    const part = state.meshData.parts.find(p => p.id === id);
    if (!part) return;

    for (const p of state.meshData.parts) {
        if (p.parentId === id) p.parentId = part.parentId || null;
    }

    state.meshData.parts.splice(state.meshData.parts.indexOf(part), 1);

    for (const animKey of Object.keys(state.meshData.animations)) {
        delete state.meshData.animations[animKey].tracks[id];
    }

    if (state.selectedPartId === id) state.selectedPartId = null;
    if (state.selectedKeyframe && state.selectedKeyframe.partId === id) {
        state.selectedKeyframe = null;
    }

    updateHierarchyUI();
    updateTimelineUI();
    selectPart(state.selectedPartId);
}

export function renamePart(oldId, newId) {
    newId = newId.trim();
    if (!newId) { alert('Name cannot be empty.'); return false; }
    if (newId === oldId) return true;
    if (state.meshData.parts.find(p => p.id === newId)) { alert(`Part "${newId}" already exists.`); return false; }

    const part = state.meshData.parts.find(p => p.id === oldId);
    part.id = newId;

    for (const p of state.meshData.parts) {
        if (p.parentId === oldId) p.parentId = newId;
    }

    for (const animKey of Object.keys(state.meshData.animations)) {
        const anim = state.meshData.animations[animKey];
        if (Object.prototype.hasOwnProperty.call(anim.tracks, oldId)) {
            anim.tracks[newId] = anim.tracks[oldId];
            delete anim.tracks[oldId];
        }
    }

    if (state.selectedPartId === oldId) state.selectedPartId = newId;
    if (state.selectedKeyframe && state.selectedKeyframe.partId === oldId) {
        state.selectedKeyframe.partId = newId;
    }

    updateHierarchyUI();
    updateTimelineUI();
    selectPart(newId);
    return true;
}

export function mirrorSkeleton(fromSuffix, toSuffix) {
    const fromParts = state.meshData.parts.filter(p => p.id.endsWith(fromSuffix));
    if (fromParts.length === 0) {
        alert(`No parts with ${fromSuffix} suffix found.`);
        return;
    }

    for (const fromPart of fromParts) {
        const toId = fromPart.id.slice(0, -fromSuffix.length) + toSuffix;

        let toParentId = fromPart.parentId || null;
        if (toParentId && toParentId.endsWith(fromSuffix)) {
            toParentId = toParentId.slice(0, -fromSuffix.length) + toSuffix;
        }

        let toPart = state.meshData.parts.find(p => p.id === toId);
        if (!toPart) {
            toPart = { id: toId };
            const fromIdx = state.meshData.parts.indexOf(fromPart);
            state.meshData.parts.splice(fromIdx + 1, 0, toPart);
        }

        toPart.parentId = toParentId;
        toPart.width = fromPart.width;
        toPart.height = fromPart.height;
        toPart.color = fromPart.color;
        toPart.anchorX = -fromPart.anchorX;
        toPart.anchorY = fromPart.anchorY;
        toPart.relX = -fromPart.relX;
        toPart.relY = fromPart.relY;
        toPart.baseRotation = -(fromPart.baseRotation || 0);
    }

    updateHierarchyUI();
    if (state.selectedPartId) selectPart(state.selectedPartId);
}

export function addSkeletonOutline() {
    saveState();
    const outlineSuffix = "_outline";
    const newParts = [];
    const sizeIncrease = 0.4;
    
    for (const part of state.meshData.parts) {
        if (part.id.endsWith(outlineSuffix)) continue;
        
        const outlineId = part.id + outlineSuffix;
        if (state.meshData.parts.some(p => p.id === outlineId)) continue;
        
        const newWidth = part.width + sizeIncrease;
        const newHeight = part.height + sizeIncrease;
        
        const outlinePart = {
            id: outlineId,
            parentId: part.id,
            width: newWidth,
            height: newHeight,
            color: "000000",
            anchorX: (part.anchorX * part.width) / newWidth,
            anchorY: (part.anchorY * part.height) / newHeight,
            relX: 0,
            relY: 0,
            baseRotation: 0,
            z: (part.z || 0) - 100
        };
        
        newParts.push(outlinePart);
    }
    
    if (newParts.length > 0) {
        state.meshData.parts.push(...newParts);
        updateHierarchyUI();
        console.log(`Added ${newParts.length} outline parts.`);
    } else {
        alert("No new outline parts to add (all parts already have outlines or no parts exist).");
    }
}
