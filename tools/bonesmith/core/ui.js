import { state } from './state.js';
import { evalTrack } from './math.js';
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
    const alphaEl = document.getElementById('prop-alpha');
    if (alphaEl) alphaEl.value = (part.alpha !== undefined ? part.alpha : 1);

    updateAnimPropsUI();
}

export function updateAnimPropsUI() {
    if (!state.selectedPartId) return;
    const anim = state.meshData.animations[state.currentAnimId];
    let localRot = 0, localOffX = 0, localOffY = 0;
    let localScaleX = 1, localScaleY = 1;
    let localR = 1, localG = 1, localB = 1, localA = 1;
    if (anim && anim.tracks && anim.tracks[state.selectedPartId]) {
        const vals = evalTrack(anim.tracks[state.selectedPartId], state.currentTime);
        localRot    = vals.rotation  ?? 0;
        localOffX   = vals.offsetX   ?? 0;
        localOffY   = vals.offsetY   ?? 0;
        localScaleX = vals.scaleX    ?? 1;
        localScaleY = vals.scaleY    ?? 1;
        localR = vals.r ?? 1; localG = vals.g ?? 1; localB = vals.b ?? 1; localA = vals.a ?? 1;
    }

    document.getElementById('prop-offx').value = localOffX.toFixed(2);
    document.getElementById('prop-offy').value = localOffY.toFixed(2);
    document.getElementById('prop-rot').value  = localRot.toFixed(2);

    const kfScaleX = document.getElementById('prop-kf-scalex');
    const kfScaleY = document.getElementById('prop-kf-scaley');
    if (kfScaleX) kfScaleX.value = localScaleX.toFixed(3);
    if (kfScaleY) kfScaleY.value = localScaleY.toFixed(3);

    const toHex2 = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    const hexColor = '#' + toHex2(localR) + toHex2(localG) + toHex2(localB);
    const kfColorEl = document.getElementById('prop-kf-color');
    const kfColorText = document.getElementById('prop-kf-color-text');
    const kfAlphaEl = document.getElementById('prop-kf-alpha');
    if (kfColorEl) kfColorEl.value = hexColor;
    if (kfColorText) kfColorText.value = hexColor.toUpperCase();
    if (kfAlphaEl) kfAlphaEl.value = localA.toFixed(2);
}

// ---------------------------------------------------------------------------
// Timeline keyframe selection / editing helpers
// ---------------------------------------------------------------------------

// Shared render context, refreshed on every updateTimelineUI() call. Used by the
// drag / rubber-band / context-menu handlers that live outside the render pass.
const timelineCtx = {
    tracksInner: null,
    tracksContainer: null,
    labelWidth: 120,
    renderedKfEls: [],   // [{ el, partId, kf }]
    rulerScroll: null,   // ruler tick strip, translated to mirror horizontal scroll
    rulerPlayhead: null
};

const KF_EPS = 0.001;

// ---------------------------------------------------------------------------
// Timeline ruler configuration — tweak these to taste.
// ---------------------------------------------------------------------------
export const TIMELINE_RULER = {
    height: 22,               // ruler bar height in px
    minLabelSpacingPx: 64,    // minimum px between labelled (major) ticks; drives scale choice
    subdivisions: 4,          // number of minor ticks between two major ticks
    tickHeight: 5,            // minor tick length (px)
    majorTickHeight: 11,      // major tick length (px)
    fontSize: 10,             // label font size (px)
    labelOffsetX: 3,          // px gap between a major tick and its time label
    // "Nice" time intervals (seconds) the major-tick spacing snaps to.
    niceSteps: [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300],
};

// Pick the smallest "nice" step whose on-screen spacing is at least minLabelSpacingPx.
function chooseRulerStep(pixelsPerSecond) {
    const minSeconds = TIMELINE_RULER.minLabelSpacingPx / pixelsPerSecond;
    for (const step of TIMELINE_RULER.niceSteps) {
        if (step >= minSeconds) return step;
    }
    return TIMELINE_RULER.niceSteps[TIMELINE_RULER.niceSteps.length - 1];
}

function formatRulerTime(t, step) {
    const decimals = step >= 1 ? (Number.isInteger(t) ? 0 : 1) : (step >= 0.1 ? 1 : 2);
    return t.toFixed(decimals) + 's';
}

// Re-aligns the ruler's tick strip with the horizontally-scrolled track area.
function syncTimelineRuler() {
    if (!timelineCtx.rulerScroll) return;
    const scrollLeft = timelineCtx.tracksContainer ? timelineCtx.tracksContainer.scrollLeft : 0;
    timelineCtx.rulerScroll.style.transform = `translateX(${timelineCtx.labelWidth - scrollLeft}px)`;
    if (timelineCtx.rulerPlayhead) {
        timelineCtx.rulerPlayhead.style.left = (state.currentTime * state.timelinePixelsPerSecond) + 'px';
    }
}

function buildTimelineRuler(duration, pps, labelWidth) {
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler) return;
    ruler.innerHTML = '';
    ruler.style.height = TIMELINE_RULER.height + 'px';

    const strip = document.createElement('div');
    strip.className = 'ruler-scroll';
    strip.style.minWidth = (duration * pps + 200) + 'px';

    const step = chooseRulerStep(pps);
    const minorStep = step / TIMELINE_RULER.subdivisions;
    const eps = minorStep * 0.001;

    for (let t = 0; t <= duration + eps; t += minorStep) {
        const time = Math.round(t / minorStep) * minorStep; // guard fp drift
        const isMajor = Math.abs(time / step - Math.round(time / step)) < 0.001;

        const tick = document.createElement('div');
        tick.className = 'ruler-tick' + (isMajor ? ' major' : '');
        tick.style.left = (time * pps) + 'px';
        tick.style.height = (isMajor ? TIMELINE_RULER.majorTickHeight : TIMELINE_RULER.tickHeight) + 'px';
        strip.appendChild(tick);

        if (isMajor) {
            const lbl = document.createElement('div');
            lbl.className = 'ruler-label';
            lbl.style.left = (time * pps + TIMELINE_RULER.labelOffsetX) + 'px';
            lbl.style.fontSize = TIMELINE_RULER.fontSize + 'px';
            lbl.textContent = formatRulerTime(time, step);
            strip.appendChild(lbl);
        }
    }

    const rulerPlayhead = document.createElement('div');
    rulerPlayhead.className = 'ruler-playhead';
    strip.appendChild(rulerPlayhead);

    ruler.appendChild(strip);

    // Fixed gutter that masks ticks scrolling under the sticky label column.
    const corner = document.createElement('div');
    corner.className = 'ruler-corner';
    corner.style.width = labelWidth + 'px';
    ruler.appendChild(corner);

    // Click ruler to seek the playhead.
    ruler.onmousedown = (e) => {
        if (e.button !== 0) return;
        const t = timeFromClientX(e.clientX);
        state.currentTime = t;
        updateTimelineUI();
        updateAnimPropsUI();
    };

    timelineCtx.rulerScroll = strip;
    timelineCtx.rulerPlayhead = rulerPlayhead;
    syncTimelineRuler();
}

export function isKeyframeSelected(partId, time) {
    return state.selectedKeyframes.some(s => s.partId === partId && Math.abs(s.time - time) < KF_EPS);
}

function setSingleKeyframeSelection(partId, time) {
    state.selectedKeyframes = [{ partId, time }];
    state.selectedKeyframe = { partId, time };
}

function addKeyframeSelection(partId, time) {
    if (!isKeyframeSelected(partId, time)) state.selectedKeyframes.push({ partId, time });
    state.selectedKeyframe = { partId, time };
}

function toggleKeyframeSelection(partId, time) {
    const idx = state.selectedKeyframes.findIndex(s => s.partId === partId && Math.abs(s.time - time) < KF_EPS);
    if (idx >= 0) {
        state.selectedKeyframes.splice(idx, 1);
        state.selectedKeyframe = state.selectedKeyframes[state.selectedKeyframes.length - 1] || null;
    } else {
        addKeyframeSelection(partId, time);
    }
}

export function clearKeyframeSelection() {
    state.selectedKeyframes = [];
    state.selectedKeyframe = null;
}

function visibleParts() {
    return state.meshData.parts.filter(p => !state.hideOutlines || !p.id.endsWith('_outline'));
}

export function selectAllKeyframes() {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim || !anim.tracks) return;
    const sel = [];
    for (const part of visibleParts()) {
        const track = anim.tracks[part.id];
        if (!track) continue;
        for (const kf of track) sel.push({ partId: part.id, time: kf.time });
    }
    state.selectedKeyframes = sel;
    state.selectedKeyframe = sel[sel.length - 1] || null;
    updateTimelineUI();
}

// ---- clipboard operations --------------------------------------------------

export function copySelectedKeyframes() {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim || !anim.tracks || state.selectedKeyframes.length === 0) return;
    const items = [];
    let minTime = Infinity;
    for (const sel of state.selectedKeyframes) {
        const track = anim.tracks[sel.partId];
        if (!track) continue;
        const kf = track.find(k => Math.abs(k.time - sel.time) < KF_EPS);
        if (!kf) continue;
        minTime = Math.min(minTime, kf.time);
        items.push({ partId: sel.partId, kf: JSON.parse(JSON.stringify(kf)) });
    }
    if (!items.length) return;
    for (const it of items) it.dt = it.kf.time - minTime;
    state.keyframeClipboard = items;
}

export function pasteKeyframes(atTime = state.currentTime) {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim || !state.keyframeClipboard || !state.keyframeClipboard.length) return;
    saveState();
    if (!anim.tracks) anim.tracks = {};
    const newSel = [];
    for (const it of state.keyframeClipboard) {
        // Skip if the part no longer exists.
        if (!state.meshData.parts.find(p => p.id === it.partId)) continue;
        if (!anim.tracks[it.partId]) anim.tracks[it.partId] = [];
        const track = anim.tracks[it.partId];
        const t = Math.max(0, Math.min(anim.duration, atTime + it.dt));
        const data = JSON.parse(JSON.stringify(it.kf));
        data.time = t;
        const idx = track.findIndex(k => Math.abs(k.time - t) < KF_EPS);
        if (idx >= 0) track[idx] = data; else track.push(data);
        track.sort((a, b) => a.time - b.time);
        newSel.push({ partId: it.partId, time: t });
    }
    state.selectedKeyframes = newSel;
    state.selectedKeyframe = newSel[newSel.length - 1] || null;
    updateTimelineUI();
    updateAnimPropsUI();
}

export function cutSelectedKeyframes() {
    if (!state.selectedKeyframes.length) return;
    copySelectedKeyframes();
    deleteSelectedKeyframes();
}

export function duplicateSelectedKeyframes() {
    if (!state.selectedKeyframes.length) return;
    copySelectedKeyframes();
    const anim = state.meshData.animations[state.currentAnimId];
    const dur = anim ? anim.duration : 1;
    const minTime = Math.min(...state.selectedKeyframes.map(s => s.time));
    const offset = Math.min(0.1, Math.max(0.02, dur * 0.05));
    pasteKeyframes(minTime + offset);
}

export function deleteSelectedKeyframes() {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim || !anim.tracks || state.selectedKeyframes.length === 0) return;
    saveState();
    for (const sel of state.selectedKeyframes) {
        const track = anim.tracks[sel.partId];
        if (!track) continue;
        const idx = track.findIndex(k => Math.abs(k.time - sel.time) < KF_EPS);
        if (idx >= 0) track.splice(idx, 1);
    }
    clearKeyframeSelection();
    updateTimelineUI();
    updateAnimPropsUI();
}

// ---- context menu ----------------------------------------------------------

let activeContextMenu = null;

function closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
        document.removeEventListener('mousedown', onDocMouseDownForMenu, true);
    }
}

function onDocMouseDownForMenu(e) {
    if (activeContextMenu && !activeContextMenu.contains(e.target)) closeContextMenu();
}

function buildContextMenu(x, y, items) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'timeline-context-menu';
    for (const it of items) {
        if (it.sep) {
            const sep = document.createElement('div');
            sep.className = 'ctx-sep';
            menu.appendChild(sep);
            continue;
        }
        const el = document.createElement('div');
        el.className = 'ctx-item' + (it.disabled ? ' disabled' : '');
        el.innerHTML = `<span>${it.label}</span>` + (it.shortcut ? `<span class="ctx-shortcut">${it.shortcut}</span>` : '');
        if (!it.disabled) {
            el.onmousedown = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                closeContextMenu();
                it.action();
            };
        }
        menu.appendChild(el);
    }
    document.body.appendChild(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px';
    activeContextMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onDocMouseDownForMenu, true), 0);
}

function onKeyframeContextMenu(e, partId, kf) {
    e.preventDefault();
    e.stopPropagation();
    if (!isKeyframeSelected(partId, kf.time)) {
        setSingleKeyframeSelection(partId, kf.time);
        state.currentTime = kf.time;
        selectPart(partId);
        updateTimelineUI();
        updateAnimPropsUI();
    }
    const count = state.selectedKeyframes.length;
    const hasClip = state.keyframeClipboard && state.keyframeClipboard.length > 0;
    buildContextMenu(e.clientX, e.clientY, [
        { label: count > 1 ? `Copy (${count})` : 'Copy', shortcut: 'Ctrl+C', action: copySelectedKeyframes },
        { label: 'Cut', shortcut: 'Ctrl+X', action: cutSelectedKeyframes },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !hasClip, action: () => pasteKeyframes(state.currentTime) },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: duplicateSelectedKeyframes },
        { sep: true },
        { label: count > 1 ? `Delete (${count})` : 'Delete', shortcut: 'Del', action: deleteSelectedKeyframes },
    ]);
}

function timeFromClientX(clientX) {
    if (!timelineCtx.tracksInner) return state.currentTime;
    const anim = state.meshData.animations[state.currentAnimId];
    const dur = anim ? anim.duration : 1;
    const rect = timelineCtx.tracksInner.getBoundingClientRect();
    const x = clientX - rect.left - timelineCtx.labelWidth;
    return Math.max(0, Math.min(dur, x / state.timelinePixelsPerSecond));
}

function onTimelineContextMenu(e) {
    // Keyframe handlers stopPropagation, so reaching here means empty timeline.
    e.preventDefault();
    const hasClip = state.keyframeClipboard && state.keyframeClipboard.length > 0;
    const t = timeFromClientX(e.clientX);
    buildContextMenu(e.clientX, e.clientY, [
        { label: 'Paste Here', shortcut: 'Ctrl+V', disabled: !hasClip, action: () => { state.currentTime = t; pasteKeyframes(t); } },
        { sep: true },
        { label: 'Select All', shortcut: 'Ctrl+A', action: selectAllKeyframes },
        { label: 'Clear Selection', action: () => { clearKeyframeSelection(); updateTimelineUI(); } },
    ]);
}

// ---- keyframe dragging -----------------------------------------------------

function startKeyframeDrag(startEvent) {
    const pps = state.timelinePixelsPerSecond;
    const anim = state.meshData.animations[state.currentAnimId];
    const duration = anim ? anim.duration : 1;
    const startX = startEvent.clientX;

    const dragSet = timelineCtx.renderedKfEls
        .filter(r => isKeyframeSelected(r.partId, r.kf.time))
        .map(r => ({ el: r.el, kf: r.kf, partId: r.partId, origTime: r.kf.time }));
    if (!dragSet.length) return;

    let moved = false;
    let savedOnce = false;

    function onMove(ev) {
        const dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) < 3) return;
        if (!savedOnce) { saveState(); savedOnce = true; }
        moved = true;
        const dt = dx / pps;
        for (const d of dragSet) {
            const nt = Math.max(0, Math.min(duration, d.origTime + dt));
            d.kf.time = nt;
            d.el.style.left = (nt * pps) + 'px';
        }
    }

    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!moved) return;
        for (const pid in anim.tracks) anim.tracks[pid].sort((a, b) => a.time - b.time);
        state.selectedKeyframes = dragSet.map(d => ({ partId: d.partId, time: d.kf.time }));
        state.selectedKeyframe = state.selectedKeyframes[state.selectedKeyframes.length - 1] || null;
        if (state.selectedKeyframe) state.currentTime = state.selectedKeyframe.time;
        updateTimelineUI();
        updateAnimPropsUI();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function onKeyframeMouseDown(e, partId, kf) {
    if (e.button !== 0) return; // right-click handled by contextmenu
    e.stopPropagation();
    e.preventDefault();
    closeContextMenu();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    if (additive) {
        toggleKeyframeSelection(partId, kf.time);
    } else if (!isKeyframeSelected(partId, kf.time)) {
        setSingleKeyframeSelection(partId, kf.time);
    }
    // Editing context follows the keyframe under the cursor.
    if (isKeyframeSelected(partId, kf.time)) {
        state.currentTime = kf.time;
        selectPart(partId);
    }
    updateTimelineUI();
    updateAnimPropsUI();

    if (isKeyframeSelected(partId, kf.time)) startKeyframeDrag(e);
}

// ---- rubber-band rectangle selection + seek --------------------------------

function rectsIntersect(a, b) {
    return !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
}

function onTimelineBackgroundMouseDown(e) {
    if (e.button !== 0) return;
    closeContextMenu();
    const container = timelineCtx.tracksContainer;
    const startClientX = e.clientX, startClientY = e.clientY;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    const band = document.createElement('div');
    band.className = 'timeline-rubber';
    band.style.display = 'none';
    container.appendChild(band);

    let moved = false;

    function onMove(ev) {
        const dx = ev.clientX - startClientX, dy = ev.clientY - startClientY;
        if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        moved = true;
        const cRect = container.getBoundingClientRect();
        const x = Math.min(startClientX, ev.clientX) - cRect.left + container.scrollLeft;
        const y = Math.min(startClientY, ev.clientY) - cRect.top + container.scrollTop;
        band.style.display = 'block';
        band.style.left = x + 'px';
        band.style.top = y + 'px';
        band.style.width = Math.abs(dx) + 'px';
        band.style.height = Math.abs(dy) + 'px';
    }

    function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        band.remove();

        if (!moved) {
            // Treat as a seek (set the playhead), preserving prior behaviour.
            const t = timeFromClientX(ev.clientX);
            const rect = timelineCtx.tracksInner.getBoundingClientRect();
            if (ev.clientX - rect.left - timelineCtx.labelWidth >= 0) {
                state.currentTime = t;
                if (!additive) clearKeyframeSelection();
                updateTimelineUI();
                updateAnimPropsUI();
            }
            return;
        }

        const selRect = {
            left: Math.min(startClientX, ev.clientX),
            right: Math.max(startClientX, ev.clientX),
            top: Math.min(startClientY, ev.clientY),
            bottom: Math.max(startClientY, ev.clientY)
        };
        if (!additive) clearKeyframeSelection();
        for (const r of timelineCtx.renderedKfEls) {
            if (rectsIntersect(selRect, r.el.getBoundingClientRect())) {
                addKeyframeSelection(r.partId, r.kf.time);
            }
        }
        updateTimelineUI();
        updateAnimPropsUI();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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

    const renderedKfEls = [];

    // Rubber-band selection / seek starts on empty timeline; keyframe handlers
    // stopPropagation so they win over this.
    tracksInner.addEventListener('mousedown', onTimelineBackgroundMouseDown);
    tracksInner.addEventListener('contextmenu', onTimelineContextMenu);

    visibleParts().forEach(part => {
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

                if (isKeyframeSelected(part.id, kf.time)) {
                    kfEl.classList.add('selected');
                }

                kfEl.addEventListener('mousedown', (e) => onKeyframeMouseDown(e, part.id, kf));
                kfEl.addEventListener('contextmenu', (e) => onKeyframeContextMenu(e, part.id, kf));

                area.appendChild(kfEl);
                renderedKfEls.push({ el: kfEl, partId: part.id, kf });
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

    timelineCtx.tracksInner = tracksInner;
    timelineCtx.tracksContainer = tracksContainer;
    timelineCtx.labelWidth = labelWidth;
    timelineCtx.renderedKfEls = renderedKfEls;

    buildTimelineRuler(anim.duration, state.timelinePixelsPerSecond, labelWidth);
    // Keep the ruler aligned while the track area scrolls horizontally.
    tracksContainer.onscroll = syncTimelineRuler;
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
        state.selectedPropIndex = -1;
        updateAnimPropsPanel();
        updateTimelineUI();
    };
}

export function updateAnimPropsPanel() {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim) return;

    // Populate skeleton picker if needed
    const skeletonPicker = document.getElementById('prop-skeleton-picker');
    if (skeletonPicker.options.length <= 1) {
        state.manifest.skeletons.forEach(s => {
            const opt = document.createElement('option');
            opt.value = `assets/skeletons/${s.file}`;
            opt.textContent = s.name;
            skeletonPicker.appendChild(opt);
        });
    }

    // Populate parent parts
    const propParent = document.getElementById('prop-parent-part');
    propParent.innerHTML = '<option value="">(No Parent)</option>';
    state.meshData.parts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.id;
        propParent.appendChild(opt);
    });

    const list = document.getElementById('anim-props-list');
    list.innerHTML = '';
    const props = anim.props || [];
    props.forEach((prop, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const detachTag = prop.detachTime != null ? ` ⛓✂${prop.detachTime}` : '';
        opt.textContent = `[${prop.startTime}-${prop.endTime}] ${prop.skeletonUrl.split('/').pop()} (${prop.animation})${detachTag}`;
        list.appendChild(opt);
    });

    list.value = state.selectedPropIndex >= 0 ? state.selectedPropIndex : "";
    
    if (state.selectedPropIndex >= 0 && state.selectedPropIndex < props.length) {
        const p = props[state.selectedPropIndex];
        skeletonPicker.value = p.skeletonUrl;
        document.getElementById('prop-anim-name').value = p.animation || '';
        document.getElementById('prop-start-time').value = p.startTime;
        document.getElementById('prop-end-time').value = p.endTime;
        document.getElementById('prop-detach-time').value = p.detachTime != null ? p.detachTime : '';
        propParent.value = p.parentPartId || '';
        document.getElementById('prop-offx-input').value = p.offsetX || 0;
        document.getElementById('prop-offy-input').value = p.offsetY || 0;
        document.getElementById('prop-world-motion').checked = !!p.worldMotion;
        document.getElementById('btn-update-anim-prop').disabled = false;
    } else {
        document.getElementById('btn-update-anim-prop').disabled = true;
    }
}

export function setEditorMode(mode) {
    state.editorMode = mode;
    const isSkeleton = mode === 'skeleton';

    document.getElementById('btn-mode-skeleton').classList.toggle('active', isSkeleton);
    document.getElementById('btn-mode-animation').classList.toggle('active', !isSkeleton);

    document.getElementById('section-add-part').style.display = isSkeleton ? '' : 'none';
    document.getElementById('section-animations').style.display = isSkeleton ? 'none' : '';
    document.getElementById('section-anim-props').style.display = isSkeleton ? 'none' : '';

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
