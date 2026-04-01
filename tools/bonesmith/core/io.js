import { state } from './state.js';
import { updateHierarchyUI, populateAnimations, selectPart, updateTimelineUI } from './ui.js';

export async function initIO() {
    try {
        const res = await fetch('../../assets/skeletons/manifest.json');
        if (res.ok) {
            state.manifest = await res.json();
            populateSkeletonPicker();

            if (state.manifest.skeletons.length > 0) {
                await loadSkeletonById(state.manifest.skeletons[0].id);
            }
        }
    } catch (e) {
        console.warn('Could not load manifest:', e);
    }
}

export function populateSkeletonPicker() {
    const picker = document.getElementById('skeleton-picker');
    picker.innerHTML = '<option value="">(New Skeleton)</option>';
    for (const entry of state.manifest.skeletons) {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.name;
        picker.appendChild(opt);
    }
    picker.value = state.currentSkeletonId;
}

export async function loadSkeletonById(id) {
    const entry = state.manifest.skeletons.find(s => s.id === id);
    if (!entry) return;

    try {
        const res = await fetch(`../../assets/skeletons/${entry.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        state.meshData = await res.json();
        state.currentSkeletonId = entry.id;
        state.currentSkeletonName = entry.name;
        
        document.getElementById('skeleton-name').value = entry.name;
        document.getElementById('skeleton-picker').value = id;

        updateHierarchyUI();
        populateAnimations();
        selectPart(state.meshData.parts[0]?.id || null);

        const animKeys = Object.keys(state.meshData.animations);
        if (animKeys.length > 0) {
            state.currentAnimId = animKeys[0];
        }
    } catch (e) {
        console.warn(`Could not load skeleton "${id}":`, e);
    }
}
