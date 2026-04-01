import { state } from './state.js';
import { sampleAnimValuesAt } from './math.js';
import { saveState } from './undo.js';

export function updateHierarchyUI() {
    const list = document.getElementById('hierarchy-list');
    list.innerHTML = '';

    const parentSelect = document.getElementById('new-part-parent');
    parentSelect.innerHTML = '<option value="">(No Parent)</option>';

    function renderTree(parentId, depth) {
        state.meshData.parts
            .filter(p => p.parentId === parentId)
            .filter(p => !state.hideOutlines || !p.id.endsWith('_outline'))
            .forEach(part => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="tree-indent" style="width:${depth * 15}px"></span>${part.id} (${part.z || 0})`;
            if (part.id === state.selectedPartId) li.classList.add('selected');
            
            // To prevent module circular dep, we can dispatch event or set globally
            li.onclick = () => selectPart(part.id);
            
            list.appendChild(li);

            const opt = document.createElement('option');
            opt.value = part.id;
            opt.textContent = '-'.repeat(depth) + ' ' + part.id;
            parentSelect.appendChild(opt);

            renderTree(part.id, depth + 1);
        });
    }
    renderTree(null, 0);
}

export function selectPart(id) {
    if (state.renamePending) {
        const propIdInput = document.getElementById('prop-id');
        propIdInput.disabled = true;
        document.getElementById('btn-rename-part').textContent = 'Rename';
        state.renamePending = false;
    }

    state.selectedPartId = id;
    updateHierarchyUI();

    const props = document.getElementById('properties-content');
    if (!id) {
        props.querySelector('.no-selection').style.display = 'block';
        document.getElementById('part-props').style.display = 'none';
        return;
    }

    const part = state.meshData.parts.find(p => p.id === id);
    if (!part) return;

    props.querySelector('.no-selection').style.display = 'none';
    document.getElementById('part-props').style.display = 'block';

    document.getElementById('prop-id').value = part.id;
    document.getElementById('prop-w').value = part.width;
    document.getElementById('prop-h').value = part.height;

    let c = part.color || "000000";
    if (c.length === 6) c = "#" + c;
    document.getElementById('prop-color').value = c;
    const colorTextEl = document.getElementById('prop-color-text');
    if (colorTextEl) colorTextEl.value = c.toUpperCase();

    document.getElementById('prop-ax').value = part.anchorX;
    document.getElementById('prop-ay').value = part.anchorY;
    document.getElementById('prop-rx').value = part.relX;
    document.getElementById('prop-ry').value = part.relY;
    document.getElementById('prop-base-rot').value = (part.baseRotation || 0).toFixed(2);
    document.getElementById('prop-z').value = (part.z || 0);

    updateAnimPropsUI();
}

export function updateAnimPropsUI() {
    if (!state.selectedPartId) return;
    const anim = state.meshData.animations[state.currentAnimId];
    let localRot = 0, localOffX = 0, localOffY = 0;
    if (anim && anim.tracks && anim.tracks[state.selectedPartId]) {
        const vals = sampleAnimValuesAt(state.selectedPartId, state.currentTime, anim);
        localRot = vals.rotation || 0;
        localOffX = vals.offsetX || 0;
        localOffY = vals.offsetY || 0;
    }

    document.getElementById('prop-offx').value = localOffX.toFixed(2);
    document.getElementById('prop-offy').value = localOffY.toFixed(2);
    document.getElementById('prop-rot').value = localRot.toFixed(2);
}

export function updateTimelineUI() {
    const tracksContainer = document.getElementById('timeline-tracks');
    tracksContainer.innerHTML = '';
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim) return;

    document.getElementById('anim-duration').value = anim.duration;
    document.getElementById('anim-loop').checked = anim.loop;
    document.getElementById('current-anim-name').textContent = state.currentAnimId;

    const tracksInner = document.createElement('div');
    tracksInner.style.position = 'relative';
    tracksInner.style.minWidth = Math.max(800, anim.duration * state.timelinePixelsPerSecond + 200) + 'px';

    let labelWidth = 120;
    const playhead = document.createElement('div');
    playhead.className = 'playhead';

    tracksInner.onclick = (e) => {
        const rect = tracksInner.getBoundingClientRect();
        const clickX = e.clientX - rect.left - labelWidth;
        if (clickX >= 0) {
            state.currentTime = Math.max(0, clickX / state.timelinePixelsPerSecond);
            if (state.currentTime > anim.duration) state.currentTime = anim.duration;
            updateTimelineUI();
            updateAnimPropsUI();
        }
    };

    state.meshData.parts
        .filter(p => !state.hideOutlines || !p.id.endsWith('_outline'))
        .forEach(part => {
        const row = document.createElement('div');
        row.className = 'track-row';

        const label = document.createElement('div');
        label.className = 'track-label';
        label.textContent = part.id;
        row.appendChild(label);

        const area = document.createElement('div');
        area.className = 'track-area';

        if (anim.tracks && anim.tracks[part.id]) {
            anim.tracks[part.id].forEach((kf) => {
                const kfEl = document.createElement('div');
                kfEl.className = 'keyframe';
                kfEl.style.left = (kf.time * state.timelinePixelsPerSecond) + 'px';

                if (state.selectedKeyframe && state.selectedKeyframe.partId === part.id && Math.abs(state.selectedKeyframe.time - kf.time) < 0.001) {
                    kfEl.classList.add('selected');
                }

                kfEl.onclick = (e) => {
                    e.stopPropagation();
                    state.selectedKeyframe = { partId: part.id, time: kf.time };
                    state.currentTime = kf.time;
                    selectPart(part.id);
                    updateTimelineUI();
                    updateAnimPropsUI();
                };

                area.appendChild(kfEl);
            });
        }

        row.appendChild(area);
        tracksInner.appendChild(row);
    });

    tracksContainer.appendChild(tracksInner);

    const firstLabel = tracksInner.querySelector('.track-label');
    if (firstLabel) {
        labelWidth = firstLabel.getBoundingClientRect().width;
    }

    playhead.style.left = (state.currentTime * state.timelinePixelsPerSecond + labelWidth) + 'px';
    tracksInner.appendChild(playhead);
}

export function populateAnimations() {
    const sel = document.getElementById('anim-list');
    sel.innerHTML = '';
    for (const key of Object.keys(state.meshData.animations)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        sel.appendChild(opt);
    }
    sel.value = state.currentAnimId;
    sel.onchange = (e) => {
        state.currentAnimId = e.target.value;
        state.currentTime = 0;
        updateTimelineUI();
    };
}

export function setEditorMode(mode) {
    state.editorMode = mode;
    const isSkeleton = mode === 'skeleton';

    document.getElementById('btn-mode-skeleton').classList.toggle('active', isSkeleton);
    document.getElementById('btn-mode-animation').classList.toggle('active', !isSkeleton);

    document.getElementById('section-add-part').style.display = isSkeleton ? '' : 'none';
    document.getElementById('section-animations').style.display = isSkeleton ? 'none' : '';

    document.getElementById('timeline-panel').style.display = isSkeleton ? 'none' : 'flex';

    const skeletonProps = document.getElementById('skeleton-props');
    const animFrameProps = document.getElementById('anim-frame-props');
    if (skeletonProps) skeletonProps.style.display = isSkeleton ? '' : 'none';
    if (animFrameProps) animFrameProps.style.display = isSkeleton ? 'none' : '';

    document.getElementById('btn-tool-rotate').style.display = '';
    document.getElementById('btn-tool-scale').style.display = isSkeleton ? '' : 'none';
    document.getElementById('btn-tool-attach').style.display = isSkeleton ? '' : 'none';

    const mirrorDisplay = (isSkeleton || mode === 'animation') ? '' : 'none';
    document.getElementById('btn-mirror-skeleton').style.display = mirrorDisplay;
    document.getElementById('mirror-direction').style.display = mirrorDisplay;
    document.getElementById('btn-flip-animation').style.display = isSkeleton ? 'none' : '';

    if (!isSkeleton && state.currentTool === 'scale') {
        document.getElementById('btn-tool-select').click();
    }

    if (isSkeleton && state.isPlaying) {
        state.isPlaying = false;
        document.getElementById('btn-play-pause').textContent = 'Play';
    }

    if (state.selectedPartId) selectPart(state.selectedPartId);
}
