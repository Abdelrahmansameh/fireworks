import * as Renderer2D from '../../js/rendering/Renderer.js';
import { state } from './core/state.js';
import { undoManager, saveState } from './core/undo.js';
import { initIO, loadSkeletonById, populateSkeletonPicker } from './core/io.js';
import { updateHierarchyUI, selectPart, updateTimelineUI, updateAnimPropsUI, populateAnimations, setEditorMode } from './core/ui.js';
import { addSkeletonOutline, deletePart, renamePart, mirrorSkeleton } from './core/skeleton.js';
import { makeAnimationLoop, mirrorAnimation, flipAnimation } from './core/animation.js';
import { getParentTransform } from './core/math.js';
import { loop } from './core/viewport.js';

async function init() {
    state.canvas = document.getElementById('view-canvas');
    state.renderer = new Renderer2D.default(state.canvas, { virtualWidth: 800, virtualHeight: 600 });
    state.renderer.setCamera({ x: 0, y: 0, zoom: 15.0 });

    const geometry = Renderer2D.buildTexturedSquare(1, 1);
    state.instancedGroup = state.renderer.createInstancedGroup({
        vertices: geometry.vertices,
        indices: geometry.indices,
        texCoords: geometry.texCoords,
        maxInstances: 100,
        zIndex: 0,
        blendMode: Renderer2D.BlendMode.NORMAL
    });

    setupUI();
    
    // Bind undo manager refresh callback
    undoManager.onStateRestored = () => {
        populateHierarchy();
        populateAnimations();
        selectPart(state.selectedPartId);
        updateTimelineUI();
        updateAnimPropsUI();
    };

    await initIO();

    state.lastTime = performance.now();
    requestAnimationFrame(loop);
}

function newSkeleton() {
    saveState();
    const nameInput = document.getElementById('skeleton-name');
    const name = nameInput.value.trim() || 'Untitled';
    state.meshData = { parts: [], animations: {} };
    state.currentSkeletonId = '';
    state.currentSkeletonName = name;
    state.currentAnimId = '';
    state.selectedPartId = null;
    state.selectedKeyframe = null;
    state.currentTime = 0;

    document.getElementById('skeleton-picker').value = '';
    populateHierarchy();
    populateAnimations();
    selectPart(null);
    updateTimelineUI();
}

function populateHierarchy() { updateHierarchyUI(); }

function setupUI() {
    document.getElementById('skeleton-picker').addEventListener('change', async (e) => {
        saveState();
        const id = e.target.value;
        if (!id) newSkeleton();
        else await loadSkeletonById(id);
    });

    state.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = state.canvas.getBoundingClientRect();
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;
        const worldBefore = state.renderer.screenToCanvas(e.clientX, e.clientY);

        const zoomFactor = Math.exp(-e.deltaY * 0.0015);
        let newZoom = state.renderer.cameraZoom * zoomFactor;
        newZoom = Math.max(state.CAMERA_MIN_ZOOM, Math.min(state.CAMERA_MAX_ZOOM, newZoom));

        const cssToWorld = state.renderer.virtualHeight / state.renderer.canvas.clientHeight;
        const newCameraX = worldBefore.x - (mouseCanvasX - state.renderer.canvas.clientWidth / 2) * cssToWorld / newZoom;
        const newCameraY = worldBefore.y + (mouseCanvasY - state.renderer.canvas.clientHeight / 2) * cssToWorld / newZoom;

        state.renderer.setCamera({ x: newCameraX, y: newCameraY, zoom: newZoom });
    }, { passive: false });

    document.getElementById('btn-new-skeleton').onclick = () => newSkeleton();

    document.getElementById('btn-mode-skeleton').onclick = () => setEditorMode('skeleton');
    document.getElementById('btn-mode-animation').onclick = () => setEditorMode('animation');

    document.getElementById('btn-add-outline').onclick = () => addSkeletonOutline();
    document.getElementById('btn-tool-attach').style.display = '';

    const tools = ['select', 'move', 'attach', 'rotate', 'scale'];
    tools.forEach(t => {
        document.getElementById(`btn-tool-${t}`).onclick = (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentTool = t;
        }
    });

    document.getElementById('btn-undo').onclick = () => undoManager.undo();
    document.getElementById('btn-redo').onclick = () => undoManager.redo();

    document.getElementById('properties-content').addEventListener('change', (e) => {
        if (!state.selectedPartId) return;
        saveState();
        const part = state.meshData.parts.find(p => p.id === state.selectedPartId);

        if (e.target.id === 'prop-w') part.width = parseFloat(e.target.value);
        if (e.target.id === 'prop-h') part.height = parseFloat(e.target.value);
        if (e.target.id === 'prop-color') part.color = e.target.value.replace('#', '');
        if (e.target.id === 'prop-color-text') {
            const raw = (e.target.value || '').trim().replace(/^#/, '');
            if (/^[0-9a-fA-F]{6}$/.test(raw)) {
                part.color = raw.toLowerCase();
                const colorEl = document.getElementById('prop-color');
                if (colorEl) colorEl.value = '#' + raw;
            }
        }
        if (e.target.id === 'prop-ax') part.anchorX = parseFloat(e.target.value);
        if (e.target.id === 'prop-ay') part.anchorY = parseFloat(e.target.value);
        if (e.target.id === 'prop-rx') part.relX = parseFloat(e.target.value);
        if (e.target.id === 'prop-ry') part.relY = parseFloat(e.target.value);
        if (e.target.id === 'prop-base-rot') part.baseRotation = parseFloat(e.target.value);
        if (e.target.id === 'prop-z') {
            const val = parseFloat(e.target.value);
            part.z = isNaN(val) ? 0 : val;
        }
    });

    const propColor = document.getElementById('prop-color');
    const propColorText = document.getElementById('prop-color-text');
    if (propColor) {
        propColor.addEventListener('mousedown', () => saveState());
        propColor.addEventListener('input', (ev) => {
            const v = ev.target.value || '#000000';
            if (propColorText) propColorText.value = v.toUpperCase();
            if (state.selectedPartId) {
                const p = state.meshData.parts.find(a => a.id === state.selectedPartId);
                if (p) p.color = v.replace('#', '');
            }
        });
    }
    if (propColorText && propColor) {
        propColorText.addEventListener('focus', () => saveState());
        propColorText.addEventListener('input', (ev) => {
            const val = (ev.target.value || '').trim().replace(/^#/, '');
            if (/^[0-9a-fA-F]{6}$/.test(val)) {
                const newVal = '#' + val.toLowerCase();
                if (propColor.value !== newVal) propColor.value = newVal;
                if (state.selectedPartId) {
                    const p = state.meshData.parts.find(a => a.id === state.selectedPartId);
                    if (p) p.color = val.toLowerCase();
                }
            }
        });
    }

    document.getElementById('btn-keyframe').onclick = () => {
        if (!state.selectedPartId) return;
        saveState();
        if (!state.meshData.animations[state.currentAnimId]) {
            state.meshData.animations[state.currentAnimId] = { duration: 1.0, loop: true, tracks: {} };
        }
        const anim = state.meshData.animations[state.currentAnimId];
        if (!anim.tracks[state.selectedPartId]) anim.tracks[state.selectedPartId] = [];
        const track = anim.tracks[state.selectedPartId];

        let rot = parseFloat(document.getElementById('prop-rot').value) || 0;
        let ox = parseFloat(document.getElementById('prop-offx').value) || 0;
        let oy = parseFloat(document.getElementById('prop-offy').value) || 0;

        const existingIdx = track.findIndex(k => Math.abs(k.time - state.currentTime) < 0.01);
        if (existingIdx >= 0) {
            track[existingIdx] = { time: state.currentTime, rotation: rot, offsetX: ox, offsetY: oy };
        } else {
            track.push({ time: state.currentTime, rotation: rot, offsetX: ox, offsetY: oy });
            track.sort((a, b) => a.time - b.time);
        }
        state.selectedKeyframe = { partId: state.selectedPartId, time: state.currentTime };
        updateTimelineUI();
    };

    document.getElementById('btn-remove-keyframe').onclick = () => {
        if (!state.selectedPartId) return;
        saveState();
        const anim = state.meshData.animations[state.currentAnimId];
        if (!anim || !anim.tracks[state.selectedPartId]) return;

        const track = anim.tracks[state.selectedPartId];
        const existingIdx = track.findIndex(k => Math.abs(k.time - state.currentTime) < 0.01);
        if (existingIdx >= 0) {
            track.splice(existingIdx, 1);
            if (state.selectedKeyframe && state.selectedKeyframe.partId === state.selectedPartId && Math.abs(state.selectedKeyframe.time - state.currentTime) < 0.01) {
                state.selectedKeyframe = null;
            }
            updateTimelineUI();
            updateAnimPropsUI();
        }
    };

    document.getElementById('anim-duration').addEventListener('change', (e) => {
        const anim = state.meshData.animations[state.currentAnimId];
        if (anim) {
            saveState();
            const oldDuration = Math.max(0.0001, anim.duration || 1.0);
            const newDuration = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            const ratio = newDuration / oldDuration;

            if (anim.tracks) {
                for (const pid in anim.tracks) {
                    const track = anim.tracks[pid];
                    if (!Array.isArray(track)) continue;
                    for (const kf of track) {
                        kf.time = Math.min(kf.time * ratio, newDuration);
                    }
                    track.sort((a, b) => a.time - b.time);
                }
            }

            state.currentTime = Math.min(state.currentTime * ratio, newDuration);
            if (state.selectedKeyframe) {
                state.selectedKeyframe.time = Math.min((state.selectedKeyframe.time || 0) * ratio, newDuration);
            }

            anim.duration = newDuration;
            updateTimelineUI();
            updateAnimPropsUI();
        }
    });

    document.getElementById('anim-loop').addEventListener('change', (e) => {
        const anim = state.meshData.animations[state.currentAnimId];
        if (anim) {
            saveState();
            anim.loop = e.target.checked;
        }
    });

    state.canvas.addEventListener('mousedown', (e) => {
        const rect = state.canvas.getBoundingClientRect();
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;
        const wPos = state.renderer.screenToCanvas(e.clientX, e.clientY);

        let clickedPartId = null;
        const sortedParts = Array.from(state.meshData.parts || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
        for (let i = sortedParts.length - 1; i >= 0; i--) {
            const part = sortedParts[i];
            const tf = getParentTransform(part.id, state.currentTime);
            const hw = Math.abs(part.width * tf.scaleX) / 2;
            const hh = Math.abs(part.height * tf.scaleY) / 2;

            const cos = Math.cos(-tf.rotation);
            const sin = Math.sin(-tf.rotation);
            const dx = wPos.x - tf.x;
            const dy = wPos.y - tf.y;

            let localX = dx * cos - dy * sin;
            let localY = dx * sin + dy * cos;

            const anchorOffX = part.anchorX * part.width;
            const anchorOffY = part.anchorY * part.height;
            localX += anchorOffX;
            localY += anchorOffY;

            if (Math.abs(localX) <= hw && Math.abs(localY) <= hh) {
                clickedPartId = part.id;
                break;
            }
        }

        if (clickedPartId && state.currentTool === 'select') {
            selectPart(clickedPartId);
        } else if (clickedPartId && !state.selectedPartId) {
            selectPart(clickedPartId);
        }

        if (!clickedPartId && state.currentTool === 'select') {
            state.isPanning = true;
            state.panStartMouseX = mouseCanvasX;
            state.panStartMouseY = mouseCanvasY;
            state.panStartCameraX = state.renderer.cameraX;
            state.panStartCameraY = state.renderer.cameraY;
        }

        state.isDragging = true;
        state.dragStartX = wPos.x;
        state.dragStartY = wPos.y;

        if (state.selectedPartId) {
            saveState();
            const part = state.meshData.parts.find(p => p.id === state.selectedPartId);

            if (state.currentTool === 'attach') {
                state.initialProp1 = part.relX;
                state.initialProp2 = part.relY;
            } else if (state.currentTool === 'rotate') {
                if (state.editorMode === 'skeleton') {
                    state.initialProp1 = part.baseRotation || 0;
                } else {
                    state.initialProp1 = parseFloat(document.getElementById('prop-rot').value) || 0;
                }
            } else if (state.currentTool === 'move') {
                if (state.editorMode === 'skeleton') {
                    state.initialProp1 = part.relX;
                    state.initialProp2 = part.relY;
                } else {
                    state.initialProp1 = parseFloat(document.getElementById('prop-offx').value) || 0;
                    state.initialProp2 = parseFloat(document.getElementById('prop-offy').value) || 0;
                }
            } else if (state.currentTool === 'scale') {
                state.initialProp1 = parseFloat(document.getElementById('prop-w').value) || part.width;
                state.initialProp2 = parseFloat(document.getElementById('prop-h').value) || part.height;
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            const rect = state.canvas.getBoundingClientRect();
            const mouseCanvasX = e.clientX - rect.left;
            const mouseCanvasY = e.clientY - rect.top;
            const dx = mouseCanvasX - state.panStartMouseX;
            const dy = mouseCanvasY - state.panStartMouseY;
            const cssToWorld = state.renderer.virtualHeight / state.renderer.canvas.clientHeight;
            const newCamX = state.panStartCameraX - dx * cssToWorld / state.renderer.cameraZoom;
            const newCamY = state.panStartCameraY + dy * cssToWorld / state.renderer.cameraZoom;
            state.renderer.setCamera({ x: newCamX, y: newCamY, zoom: state.renderer.cameraZoom });
            return;
        }

        if (!state.isDragging || !state.selectedPartId) return;
        const part = state.meshData.parts.find(p => p.id === state.selectedPartId);
        if (!part) return;

        const wPos = state.renderer.screenToCanvas(e.clientX, e.clientY);
        const dx = wPos.x - state.dragStartX;
        const dy = wPos.y - state.dragStartY;

        if (state.currentTool === 'attach') {
            let pw = 10, ph = 10;
            if (part.parentId) {
                const pObj = state.meshData.parts.find(a => a.id === part.parentId);
                if (pObj) { pw = pObj.width; ph = pObj.height; }
            }

            const pTf = getParentTransform(part.parentId, state.currentTime);
            const cos = Math.cos(-pTf.rotation);
            const sin = Math.sin(-pTf.rotation);
            const localDx = dx * cos - dy * sin;
            const localDy = dx * sin + dy * cos;

            part.relX = state.initialProp1 + (localDx / pw);
            part.relY = state.initialProp2 + (localDy / ph);
            document.getElementById('prop-rx').value = part.relX.toFixed(2);
            document.getElementById('prop-ry').value = part.relY.toFixed(2);
        }
        else if (state.currentTool === 'rotate') {
            if (state.editorMode === 'skeleton') {
                part.baseRotation = state.initialProp1 + dy * -0.5;
                document.getElementById('prop-base-rot').value = part.baseRotation.toFixed(2);
            } else {
                document.getElementById('prop-rot').value = (state.initialProp1 + dy * -0.5).toFixed(2);
            }
        }
        else if (state.currentTool === 'move') {
            if (state.editorMode === 'skeleton') {
                let pw = 10, ph = 10;
                if (part.parentId) {
                    const pObj = state.meshData.parts.find(a => a.id === part.parentId);
                    if (pObj) { pw = pObj.width; ph = pObj.height; }
                }
                const pTf = getParentTransform(part.parentId, state.currentTime);
                const cos = Math.cos(-pTf.rotation);
                const sin = Math.sin(-pTf.rotation);
                const localDx = dx * cos - dy * sin;
                const localDy = dx * sin + dy * cos;
                part.relX = state.initialProp1 + (localDx / pw);
                part.relY = state.initialProp2 + (localDy / ph);
                document.getElementById('prop-rx').value = part.relX.toFixed(2);
                document.getElementById('prop-ry').value = part.relY.toFixed(2);
            } else {
                const pTf = getParentTransform(part.parentId, state.currentTime);
                const cos = Math.cos(-pTf.rotation);
                const sin = Math.sin(-pTf.rotation);
                const localDx = dx * cos - dy * sin;
                const localDy = dx * sin + dy * cos;
                document.getElementById('prop-offx').value = (state.initialProp1 + localDx).toFixed(2);
                document.getElementById('prop-offy').value = (state.initialProp2 + localDy).toFixed(2);
            }
        }
        else if (state.currentTool === 'scale') {
            const scaleFactorX = 1 + (dx / 50);
            const scaleFactorY = 1 + (dy / 50);

            part.width = Math.max(0.1, state.initialProp1 * scaleFactorX);
            part.height = Math.max(0.1, state.initialProp2 * scaleFactorY);

            document.getElementById('prop-w').value = part.width.toFixed(2);
            document.getElementById('prop-h').value = part.height.toFixed(2);
        }
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        state.isPanning = false;
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            const key = e.key.toLowerCase();

            if (e.ctrlKey && key === 'z') { e.preventDefault(); undoManager.undo(); return; }
            if (e.ctrlKey && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); undoManager.redo(); return; }

            let toolBtnId = null;
            if (key === 'v') toolBtnId = 'btn-tool-select';
            else if (key === 'w') toolBtnId = 'btn-tool-move';
            else if (key === 'a') toolBtnId = 'btn-tool-attach';
            else if (key === 'e') toolBtnId = 'btn-tool-rotate';
            else if (key === 'r') toolBtnId = 'btn-tool-scale';

            if (toolBtnId) {
                const btn = document.getElementById(toolBtnId);
                if (btn && btn.style.display !== 'none') btn.click();
            }
        }
    });

    document.getElementById('btn-add-part').onclick = () => {
        saveState();
        const idInput = document.getElementById('new-part-id');
        const parentSelect = document.getElementById('new-part-parent');
        const newId = idInput.value.trim();
        if (!newId) { alert('Please enter a Part ID.'); return; }
        if (state.meshData.parts.find(p => p.id === newId)) { alert(`Part "${newId}" already exists.`); return; }

        const newPart = {
            id: newId, parentId: parentSelect.value || null,
            width: 1, height: 1, color: 'aaaaaa',
            anchorX: 0.5, anchorY: 0.5, relX: 0, relY: 0, z: 0, baseRotation: 0
        };
        state.meshData.parts.push(newPart);
        idInput.value = '';
        updateHierarchyUI();
        selectPart(newId);
    };

    document.getElementById('btn-delete-part').onclick = () => {
        if (!state.selectedPartId) return;
        const children = state.meshData.parts.filter(p => p.parentId === state.selectedPartId);
        let msg = `Delete "${state.selectedPartId}"?`;
        if (children.length > 0) msg += `\n\n${children.length} child part(s) will be reparented to its parent.`;
        msg += '\n\nAll animation tracks for this part will also be removed.';
        if (!confirm(msg)) return;
        saveState();
        deletePart(state.selectedPartId);
    };

    document.getElementById('btn-rename-part').onclick = () => {
        if (!state.selectedPartId) return;
        const propIdInput = document.getElementById('prop-id');
        if (!state.renamePending) {
            propIdInput.disabled = false;
            propIdInput.focus();
            propIdInput.select();
            document.getElementById('btn-rename-part').textContent = 'Apply';
            state.renamePending = true;
        } else {
            const newId = propIdInput.value;
            saveState();
            if (renamePart(state.selectedPartId, newId)) {
                propIdInput.disabled = true;
                document.getElementById('btn-rename-part').textContent = 'Rename';
                state.renamePending = false;
            }
        }
    };

    document.getElementById('prop-id').addEventListener('keydown', (e) => {
        if (!state.renamePending) return;
        if (e.key === 'Escape') {
            const propIdInput = document.getElementById('prop-id');
            propIdInput.value = state.selectedPartId;
            propIdInput.disabled = true;
            document.getElementById('btn-rename-part').textContent = 'Rename';
            state.renamePending = false;
        } else if (e.key === 'Enter') {
            document.getElementById('btn-rename-part').click();
        }
    });

    document.getElementById('btn-add-anim').onclick = () => {
        const input = document.getElementById('new-anim-id');
        const name = input.value.trim();
        if (!name) return;
        if (state.meshData.animations[name]) { alert(`Animation "${name}" already exists.`); return; }
        saveState();
        state.meshData.animations[name] = { duration: 1.0, loop: true, tracks: {} };
        state.currentAnimId = name;
        input.value = '';
        populateAnimations();
        updateTimelineUI();
    };

    document.getElementById('btn-load').onclick = () => {
        saveState();
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                state.meshData = JSON.parse(text);
                state.currentSkeletonId = '';
                state.currentSkeletonName = file.name.replace('.json', '');
                document.getElementById('skeleton-name').value = state.currentSkeletonName;
                document.getElementById('skeleton-picker').value = '';
                populateHierarchy();
                populateAnimations();
                selectPart(state.meshData.parts[0]?.id || null);
            } catch (err) {
                alert('Failed to load JSON: ' + err.message);
            }
        };
        fileInput.click();
    };

    document.getElementById('btn-mirror-skeleton').onclick = () => {
        saveState();
        const dir = document.getElementById('mirror-direction').value;
        const fromSuffix = dir === 'r-to-l' ? '_r' : '_l';
        const toSuffix = dir === 'r-to-l' ? '_l' : '_r';

        if (state.editorMode === 'skeleton') mirrorSkeleton(fromSuffix, toSuffix);
        else mirrorAnimation(fromSuffix, toSuffix);
    };

    document.getElementById('btn-flip-animation').onclick = () => {
        saveState();
        flipAnimation();
    };

    document.getElementById('btn-save').onclick = async () => {
        const name = document.getElementById('skeleton-name').value.trim() || state.currentSkeletonName || 'skeleton';
        const id = state.currentSkeletonId || '';
        const payload = { name, id, meshData: state.meshData };

        try {
            const res = await fetch('/api/save_skeleton', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data && data.ok) {
                state.manifest = data.manifest || state.manifest;
                state.currentSkeletonId = data.id || state.currentSkeletonId;
                state.currentSkeletonName = name;
                document.getElementById('skeleton-name').value = name;
                populateSkeletonPicker();
                document.getElementById('skeleton-picker').value = state.currentSkeletonId || '';
                alert('Saved: ' + (data.file || 'unknown'));
                return;
            } else {
                throw new Error((data && data.error) || 'Save failed');
            }
        } catch (err) {
            console.warn('Server save failed, falling back to download:', err);
            const filename = name.toLowerCase().replace(/[^a-z0-9_]/g, '_') + '.json';
            const str = JSON.stringify(state.meshData, null, 2);
            const blob = new Blob([str], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
        }
    };

    document.getElementById('btn-play-pause').onclick = (e) => {
        state.isPlaying = !state.isPlaying;
        e.target.textContent = state.isPlaying ? 'Pause' : 'Play';
    }

    document.getElementById('btn-make-loop').onclick = () => makeAnimationLoop();

    setEditorMode('skeleton');
}

window.onload = init;
