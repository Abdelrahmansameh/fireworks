import * as Renderer2D from '../js/rendering/Renderer.js';
const { Vector2, Color } = Renderer2D;

// ─── State ───────────────────────────────────────────────────────────────────

let meshData = { parts: [], animations: {} };
let currentSkeletonId = '';    // id from manifest (empty = unsaved/new)
let currentSkeletonName = '';  // display name
let manifest = { skeletons: [] };

let selectedPartId = null;
let currentAnimId = '';
let currentTool = 'select';
let editorMode = 'skeleton';
let isPlaying = false;
let renamePending = false;
let currentTime = 0;
let lastTime = 0;
window.selectedKeyframe = null;
const timelinePixelsPerSecond = 200;

let renderer;
let instancedGroup;
let canvas;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialProp1 = 0;
let initialProp2 = 0;
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCameraX = 0;
let panStartCameraY = 0;
const CAMERA_MIN_ZOOM = 0.2;
const CAMERA_MAX_ZOOM = 200;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
    canvas = document.getElementById('view-canvas');
    renderer = new Renderer2D.default(canvas, { virtualWidth: 800, virtualHeight: 600 });
    renderer.setCamera({ x: 0, y: 0, zoom: 15.0 });

    const geometry = Renderer2D.buildTexturedSquare(1, 1);
    instancedGroup = renderer.createInstancedGroup({
        vertices: geometry.vertices,
        indices: geometry.indices,
        texCoords: geometry.texCoords,
        maxInstances: 100,
        zIndex: 0,
        blendMode: Renderer2D.BlendMode.NORMAL
    });

    setupUI();

    // Load manifest and populate skeleton picker
    try {
        const res = await fetch('../assets/skeletons/manifest.json');
        if (res.ok) {
            manifest = await res.json();
            populateSkeletonPicker();

            // Auto-load first skeleton if available
            if (manifest.skeletons.length > 0) {
                await loadSkeletonById(manifest.skeletons[0].id);
            }
        }
    } catch (e) {
        console.warn('Could not load manifest:', e);
    }

    lastTime = performance.now();
    requestAnimationFrame(loop);
}

// ─── Skeleton Manifest ───────────────────────────────────────────────────────

function populateSkeletonPicker() {
    const picker = document.getElementById('skeleton-picker');
    // Keep the first "(New Skeleton)" option
    picker.innerHTML = '<option value="">(New Skeleton)</option>';
    for (const entry of manifest.skeletons) {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.name;
        picker.appendChild(opt);
    }
    picker.value = currentSkeletonId;
}

async function loadSkeletonById(id) {
    const entry = manifest.skeletons.find(s => s.id === id);
    if (!entry) return;

    try {
        const res = await fetch(`../assets/skeletons/${entry.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        meshData = await res.json();
        currentSkeletonId = entry.id;
        currentSkeletonName = entry.name;
        document.getElementById('skeleton-name').value = entry.name;
        document.getElementById('skeleton-picker').value = id;

        populateHierarchy();
        populateAnimations();
        selectPart(meshData.parts[0]?.id || null);

        // Auto-select first animation if available
        const animKeys = Object.keys(meshData.animations);
        if (animKeys.length > 0) {
            currentAnimId = animKeys[0];
        }
    } catch (e) {
        console.warn(`Could not load skeleton "${id}":`, e);
    }
}

function newSkeleton() {
    const nameInput = document.getElementById('skeleton-name');
    const name = nameInput.value.trim() || 'Untitled';
    meshData = { parts: [], animations: {} };
    currentSkeletonId = '';
    currentSkeletonName = name;
    currentAnimId = '';
    selectedPartId = null;
    window.selectedKeyframe = null;
    currentTime = 0;

    document.getElementById('skeleton-picker').value = '';
    populateHierarchy();
    populateAnimations();
    selectPart(null);
    updateTimelineUI();
}

// ─── Transform Math ──────────────────────────────────────────────────────────

function getParentTransform(partId, time) {
    const part = meshData.parts.find(p => p.id === partId);
    if (!part) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

    let parentTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    if (part.parentId) {
        parentTransform = getParentTransform(part.parentId, time);
    }

    let localRot = 0;
    let localOffX = 0;
    let localOffY = 0;

    if (editorMode === 'animation' && partId === selectedPartId && !isPlaying) {
        localRot = parseFloat(document.getElementById('prop-rot').value) || 0;
        localOffX = parseFloat(document.getElementById('prop-offx').value) || 0;
        localOffY = parseFloat(document.getElementById('prop-offy').value) || 0;
    } else if (editorMode === 'animation') {
        const anim = meshData.animations[currentAnimId];
        const vals = sampleAnimValuesAt(partId, time, anim);
        localRot = vals.rotation || 0;
        localOffX = vals.offsetX || 0;
        localOffY = vals.offsetY || 0;
    }

    let parentW = 10, parentH = 10;
    if (part.parentId) {
        const pObj = meshData.parts.find(p => p.id === part.parentId);
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

function hexToRgb(hex) {
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

// ─── Main render loop ────────────────────────────────────────────────────────

function loop(now) {
    requestAnimationFrame(loop);

    const dt = (now - lastTime) / 1000.0;
    lastTime = now;

    const anim = meshData.animations[currentAnimId];
    if (isPlaying && anim) {
        currentTime += dt;
        if (currentTime > anim.duration) {
            if (anim.loop) {
                currentTime = currentTime % anim.duration;
            } else {
                currentTime = anim.duration;
                isPlaying = false;
                document.getElementById('btn-play-pause').textContent = 'Play';
            }
        }
        updateTimelineUI();
    }

    instancedGroup.clear();
    
    // Background
    instancedGroup.addInstanceRaw(0, 0, 0, 200, 200, 1, 1, 1, 1);
    // Origin dot
    instancedGroup.addInstanceRaw(0, 0, 0, 0.2, 0.2, 1, 0, 0, 1);

    for (let i = 0; i < meshData.parts.length; i++) {
        const part = meshData.parts[i];
        const tf = getParentTransform(part.id, currentTime);

        const anchorOffX = part.anchorX * part.width;
        const anchorOffY = part.anchorY * part.height;

        const cosR = Math.cos(tf.rotation);
        const sinR = Math.sin(tf.rotation);

        const drawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
        const drawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

        const c = hexToRgb(part.color || 'FFFFFF');

        // subtle selection highlight: blend a small amount toward white
        let finalR = c.r, finalG = c.g, finalB = c.b;
        if (part.id === selectedPartId) {
            const highlight = 0.12; // 12% toward white
            finalR = c.r + (1 - c.r) * highlight;
            finalG = c.g + (1 - c.g) * highlight;
            finalB = c.b + (1 - c.b) * highlight;
        }

        instancedGroup.addInstanceRaw(
            drawX, drawY,
            tf.rotation,
            part.width * tf.scaleX, part.height * tf.scaleY,
            finalR, finalG, finalB, 1.0
        );

        if (part.id === selectedPartId) {
            const pivotSize = 0.5;

            // Show attach preview only when the attach tool is active
            if (currentTool === 'attach') {
                // marker at this part's pivot
                instancedGroup.addInstanceRaw(tf.x, tf.y, 0, pivotSize, pivotSize, 0, 1, 1, 1);

                // if part has a parent, also mark the parent's anchor position
                if (part.parentId) {
                    const pObj = meshData.parts.find(p => p.id === part.parentId);
                    if (pObj) {
                        const pTf = getParentTransform(part.parentId, currentTime);
                        const pOffX = pObj.anchorX * pObj.width;
                        const pOffY = pObj.anchorY * pObj.height;
                        const pDrawX = pTf.x - (pOffX * Math.cos(pTf.rotation) - pOffY * Math.sin(pTf.rotation));
                        const pDrawY = pTf.y - (pOffX * Math.sin(pTf.rotation) + pOffY * Math.cos(pTf.rotation));
                        // parent anchor marker (yellow)
                        instancedGroup.addInstanceRaw(pDrawX, pDrawY, 0, pivotSize, pivotSize, 1, 1, 0, 1);
                    }
                }
            }
        }
    }

    renderer.drawFrame();
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function updateHierarchyUI() {
    const list = document.getElementById('hierarchy-list');
    list.innerHTML = '';

    const parentSelect = document.getElementById('new-part-parent');
    parentSelect.innerHTML = '<option value="">(No Parent)</option>';

    function renderTree(parentId, depth) {
        meshData.parts.filter(p => p.parentId === parentId).forEach(part => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="tree-indent" style="width:${depth * 15}px"></span>${part.id}`;
            if (part.id === selectedPartId) li.classList.add('selected');
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

function selectPart(id) {
    if (renamePending) {
        const propIdInput = document.getElementById('prop-id');
        propIdInput.disabled = true;
        document.getElementById('btn-rename-part').textContent = 'Rename';
        renamePending = false;
    }

    selectedPartId = id;
    updateHierarchyUI();

    const props = document.getElementById('properties-content');
    if (!id) {
        props.querySelector('.no-selection').style.display = 'block';
        document.getElementById('part-props').style.display = 'none';
        return;
    }

    const part = meshData.parts.find(p => p.id === id);
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

    updateAnimPropsUI();
}

function updateAnimPropsUI() {
    if (!selectedPartId) return;
    const anim = meshData.animations[currentAnimId];
    let localRot = 0, localOffX = 0, localOffY = 0;
    if (anim && anim.tracks && anim.tracks[selectedPartId]) {
        const vals = sampleAnimValuesAt(selectedPartId, currentTime, anim);
        localRot = vals.rotation || 0;
        localOffX = vals.offsetX || 0;
        localOffY = vals.offsetY || 0;
    }

    document.getElementById('prop-offx').value = localOffX.toFixed(2);
    document.getElementById('prop-offy').value = localOffY.toFixed(2);
    document.getElementById('prop-rot').value = localRot.toFixed(2);
}

// Sample a track for a part at a specific time (local animation values)
function sampleAnimValuesAt(partId, time, anim) {
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

// Make the current animation loop by copying start frame values to the end time
function makeAnimationLoop() {
    const anim = meshData.animations[currentAnimId];
    if (!anim) {
        alert('No animation selected.');
        return;
    }

    const duration = Math.max(0.0001, anim.duration || 0);
    if (!anim.tracks) anim.tracks = {};

    for (const part of meshData.parts) {
        const pid = part.id;
        let track = anim.tracks[pid];

        // sample start values at t=0 (will fall back to defaults if no track)
        const start = sampleAnimValuesAt(pid, 0, anim);

        // create a track / ensure there is a start keyframe at t=0 so loop is stable
        if (!track || track.length === 0) {
            track = [{ time: 0, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY }];
            anim.tracks[pid] = track;
        } else {
            const startIdx = track.findIndex(k => Math.abs(k.time - 0) < 0.01);
            if (startIdx < 0) {
                track.push({ time: 0, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY });
            }
        }

        // set/override the end keyframe at the animation duration
        const endIdx = track.findIndex(k => Math.abs(k.time - duration) < 0.01);
        const endKf = { time: duration, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY };
        if (endIdx >= 0) track[endIdx] = endKf; else track.push(endKf);

        track.sort((a, b) => a.time - b.time);
    }

    // ensure the animation's loop flag is enabled and update UI
    anim.loop = true;
    const loopEl = document.getElementById('anim-loop');
    if (loopEl) loopEl.checked = true;

    updateTimelineUI();
    updateAnimPropsUI();
    alert('End keyframes updated to match start frames for loop.');
}

function setupUI() {
    // Skeleton picker
    document.getElementById('skeleton-picker').addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) {
            newSkeleton();
        } else {
            await loadSkeletonById(id);
        }
    });

    // Wheel zoom — zoom to cursor position
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;
        const worldBefore = renderer.screenToCanvas(e.clientX, e.clientY);

        const zoomFactor = Math.exp(-e.deltaY * 0.0015);
        let newZoom = renderer.cameraZoom * zoomFactor;
        newZoom = Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, newZoom));

        const cssToWorld = renderer.virtualHeight / renderer.canvas.clientHeight;
        const newCameraX = worldBefore.x - (mouseCanvasX - renderer.canvas.clientWidth / 2) * cssToWorld / newZoom;
        const newCameraY = worldBefore.y + (mouseCanvasY - renderer.canvas.clientHeight / 2) * cssToWorld / newZoom;

        renderer.setCamera({ x: newCameraX, y: newCameraY, zoom: newZoom });
    }, { passive: false });

    document.getElementById('btn-new-skeleton').onclick = () => newSkeleton();

    // Mode switcher
    document.getElementById('btn-mode-skeleton').onclick = () => setEditorMode('skeleton');
    document.getElementById('btn-mode-animation').onclick = () => setEditorMode('animation');

    // Attach tool is available in skeleton editing mode. Visibility toggled by setEditorMode.
    document.getElementById('btn-tool-attach').style.display = '';

    // Tools
    const tools = ['select', 'move', 'attach', 'rotate', 'scale'];
    tools.forEach(t => {
        document.getElementById(`btn-tool-${t}`).onclick = (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTool = t;
        }
    });

    // Properties generic change listener
    document.getElementById('properties-content').addEventListener('change', (e) => {
        if (!selectedPartId) return;
        const part = meshData.parts.find(p => p.id === selectedPartId);

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
    });

    // Color picker <-> text sync
    (function() {
        const propColor = document.getElementById('prop-color');
        const propColorText = document.getElementById('prop-color-text');
        if (propColor) {
            propColor.addEventListener('input', (ev) => {
                const v = ev.target.value || '#000000';
                if (propColorText) propColorText.value = v.toUpperCase();
                if (selectedPartId) {
                    const p = meshData.parts.find(a => a.id === selectedPartId);
                    if (p) p.color = v.replace('#', '');
                }
            });
        }
        if (propColorText && propColor) {
            propColorText.addEventListener('input', (ev) => {
                const val = (ev.target.value || '').trim().replace(/^#/, '');
                if (/^[0-9a-fA-F]{6}$/.test(val)) {
                    const newVal = '#' + val.toLowerCase();
                    if (propColor.value !== newVal) propColor.value = newVal;
                    if (selectedPartId) {
                        const p = meshData.parts.find(a => a.id === selectedPartId);
                        if (p) p.color = val.toLowerCase();
                    }
                }
            });
        }
    })();

    // Keyframing
    document.getElementById('btn-keyframe').onclick = () => {
        if (!selectedPartId) return;
        if (!meshData.animations[currentAnimId]) {
            meshData.animations[currentAnimId] = { duration: 1.0, loop: true, tracks: {} };
        }
        const anim = meshData.animations[currentAnimId];
        if (!anim.tracks[selectedPartId]) anim.tracks[selectedPartId] = [];
        const track = anim.tracks[selectedPartId];

        let rot = parseFloat(document.getElementById('prop-rot').value) || 0;
        let ox = parseFloat(document.getElementById('prop-offx').value) || 0;
        let oy = parseFloat(document.getElementById('prop-offy').value) || 0;

        const existingIdx = track.findIndex(k => Math.abs(k.time - currentTime) < 0.01);
        if (existingIdx >= 0) {
            track[existingIdx] = { time: currentTime, rotation: rot, offsetX: ox, offsetY: oy };
        } else {
            track.push({ time: currentTime, rotation: rot, offsetX: ox, offsetY: oy });
            track.sort((a, b) => a.time - b.time);
        }
        window.selectedKeyframe = { partId: selectedPartId, time: currentTime };
        updateTimelineUI();
    };

    document.getElementById('btn-remove-keyframe').onclick = () => {
        if (!selectedPartId) return;
        const anim = meshData.animations[currentAnimId];
        if (!anim || !anim.tracks[selectedPartId]) return;

        const track = anim.tracks[selectedPartId];
        const existingIdx = track.findIndex(k => Math.abs(k.time - currentTime) < 0.01);
        if (existingIdx >= 0) {
            track.splice(existingIdx, 1);
            if (window.selectedKeyframe && window.selectedKeyframe.partId === selectedPartId && Math.abs(window.selectedKeyframe.time - currentTime) < 0.01) {
                window.selectedKeyframe = null;
            }
            updateTimelineUI();
            updateAnimPropsUI();
        }
    };

    document.getElementById('anim-duration').addEventListener('change', (e) => {
        const anim = meshData.animations[currentAnimId];
        if (anim) {
            const oldDuration = Math.max(0.0001, anim.duration || 1.0);
            const newDuration = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            const ratio = newDuration / oldDuration;

            // Scale all keyframe times so their relative positions are conserved
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

            // Scale currentTime and selected keyframe time to preserve position ratio
            currentTime = Math.min(currentTime * ratio, newDuration);
            if (window.selectedKeyframe) {
                window.selectedKeyframe.time = Math.min((window.selectedKeyframe.time || 0) * ratio, newDuration);
            }

            anim.duration = newDuration;
            updateTimelineUI();
            updateAnimPropsUI();
        }
    });

    document.getElementById('anim-loop').addEventListener('change', (e) => {
        const anim = meshData.animations[currentAnimId];
        if (anim) {
            anim.loop = e.target.checked;
        }
    });

    // Viewport drag interactions
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;
        const wPos = renderer.screenToCanvas(e.clientX, e.clientY);

        let clickedPartId = null;
        for (let i = meshData.parts.length - 1; i >= 0; i--) {
            const part = meshData.parts[i];
            const tf = getParentTransform(part.id, currentTime);
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

        if (clickedPartId && currentTool === 'select') {
             selectPart(clickedPartId);
        } else if (clickedPartId && !selectedPartId) {
             selectPart(clickedPartId);
        }

        // start panning when clicking empty space in select tool
        if (!clickedPartId && currentTool === 'select') {
            isPanning = true;
            panStartMouseX = mouseCanvasX;
            panStartMouseY = mouseCanvasY;
            panStartCameraX = renderer.cameraX;
            panStartCameraY = renderer.cameraY;
        }

        isDragging = true;
        dragStartX = wPos.x;
        dragStartY = wPos.y;

        if (selectedPartId) {
            const part = meshData.parts.find(p => p.id === selectedPartId);

            if (currentTool === 'attach') {
                initialProp1 = part.relX;
                initialProp2 = part.relY;
            } else if (currentTool === 'rotate') {
                if (editorMode === 'skeleton') {
                    initialProp1 = part.baseRotation || 0;
                } else {
                    initialProp1 = parseFloat(document.getElementById('prop-rot').value) || 0;
                }
            } else if (currentTool === 'move') {
                if (editorMode === 'skeleton') {
                    initialProp1 = part.relX;
                    initialProp2 = part.relY;
                } else {
                    initialProp1 = parseFloat(document.getElementById('prop-offx').value) || 0;
                    initialProp2 = parseFloat(document.getElementById('prop-offy').value) || 0;
                }
            } else if (currentTool === 'scale') {
                initialProp1 = parseFloat(document.getElementById('prop-w').value) || part.width;
                initialProp2 = parseFloat(document.getElementById('prop-h').value) || part.height;
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const rect = canvas.getBoundingClientRect();
            const mouseCanvasX = e.clientX - rect.left;
            const mouseCanvasY = e.clientY - rect.top;
            const dx = mouseCanvasX - panStartMouseX;
            const dy = mouseCanvasY - panStartMouseY;
            const cssToWorld = renderer.virtualHeight / renderer.canvas.clientHeight;
            const newCamX = panStartCameraX - dx * cssToWorld / renderer.cameraZoom;
            const newCamY = panStartCameraY + dy * cssToWorld / renderer.cameraZoom;
            renderer.setCamera({ x: newCamX, y: newCamY, zoom: renderer.cameraZoom });
            return;
        }

        if (!isDragging || !selectedPartId) return;
        const part = meshData.parts.find(p => p.id === selectedPartId);
        if (!part) return;

        const wPos = renderer.screenToCanvas(e.clientX, e.clientY);
        const dx = wPos.x - dragStartX;
        const dy = wPos.y - dragStartY;

        if (currentTool === 'attach') {
            let pw = 10, ph = 10;
            if (part.parentId) {
                const pObj = meshData.parts.find(a => a.id === part.parentId);
                if (pObj) { pw = pObj.width; ph = pObj.height; }
            }

            const pTf = getParentTransform(part.parentId, currentTime);
            const cos = Math.cos(-pTf.rotation);
            const sin = Math.sin(-pTf.rotation);
            const localDx = dx * cos - dy * sin;
            const localDy = dx * sin + dy * cos;

            part.relX = initialProp1 + (localDx / pw);
            part.relY = initialProp2 + (localDy / ph);
            document.getElementById('prop-rx').value = part.relX.toFixed(2);
            document.getElementById('prop-ry').value = part.relY.toFixed(2);
        }
        else if (currentTool === 'rotate') {
            if (editorMode === 'skeleton') {
                part.baseRotation = initialProp1 + dy * -0.5;
                document.getElementById('prop-base-rot').value = part.baseRotation.toFixed(2);
            } else {
                document.getElementById('prop-rot').value = (initialProp1 + dy * -0.5).toFixed(2);
            }
        }
        else if (currentTool === 'move') {
            if (editorMode === 'skeleton') {
                let pw = 10, ph = 10;
                if (part.parentId) {
                    const pObj = meshData.parts.find(a => a.id === part.parentId);
                    if (pObj) { pw = pObj.width; ph = pObj.height; }
                }
                const pTf = getParentTransform(part.parentId, currentTime);
                const cos = Math.cos(-pTf.rotation);
                const sin = Math.sin(-pTf.rotation);
                const localDx = dx * cos - dy * sin;
                const localDy = dx * sin + dy * cos;
                part.relX = initialProp1 + (localDx / pw);
                part.relY = initialProp2 + (localDy / ph);
                document.getElementById('prop-rx').value = part.relX.toFixed(2);
                document.getElementById('prop-ry').value = part.relY.toFixed(2);
            } else {
                const pTf = getParentTransform(part.parentId, currentTime);
                const cos = Math.cos(-pTf.rotation);
                const sin = Math.sin(-pTf.rotation);
                const localDx = dx * cos - dy * sin;
                const localDy = dx * sin + dy * cos;
                document.getElementById('prop-offx').value = (initialProp1 + localDx).toFixed(2);
                document.getElementById('prop-offy').value = (initialProp2 + localDy).toFixed(2);
            }
        }
        else if (currentTool === 'scale') {
            const scaleFactorX = 1 + (dx / 50);
            const scaleFactorY = 1 + (dy / 50);
            
            part.width = Math.max(0.1, initialProp1 * scaleFactorX);
            part.height = Math.max(0.1, initialProp2 * scaleFactorY);
            
            document.getElementById('prop-w').value = part.width.toFixed(2);
            document.getElementById('prop-h').value = part.height.toFixed(2);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        isPanning = false;
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            const key = e.key.toLowerCase();
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

    // Add Part
    document.getElementById('btn-add-part').onclick = () => {
        const idInput = document.getElementById('new-part-id');
        const parentSelect = document.getElementById('new-part-parent');
        const newId = idInput.value.trim();
        if (!newId) { alert('Please enter a Part ID.'); return; }
        if (meshData.parts.find(p => p.id === newId)) { alert(`Part "${newId}" already exists.`); return; }

        const newPart = {
            id: newId,
            parentId: parentSelect.value || null,
            width: 1,
            height: 1,
            color: 'aaaaaa',
            anchorX: 0.5,
            anchorY: 0.5,
            relX: 0,
            relY: 0,
            baseRotation: 0
        };
        meshData.parts.push(newPart);
        idInput.value = '';
        updateHierarchyUI();
        selectPart(newId);
    };

    // Delete Part
    document.getElementById('btn-delete-part').onclick = () => {
        if (!selectedPartId) return;
        const children = meshData.parts.filter(p => p.parentId === selectedPartId);
        let msg = `Delete "${selectedPartId}"?`;
        if (children.length > 0) {
            msg += `\n\n${children.length} child part(s) will be reparented to its parent.`;
        }
        msg += '\n\nAll animation tracks for this part will also be removed.';
        if (!confirm(msg)) return;
        deletePart(selectedPartId);
    };

    // Rename Part
    document.getElementById('btn-rename-part').onclick = () => {
        if (!selectedPartId) return;
        const propIdInput = document.getElementById('prop-id');
        if (!renamePending) {
            propIdInput.disabled = false;
            propIdInput.focus();
            propIdInput.select();
            document.getElementById('btn-rename-part').textContent = 'Apply';
            renamePending = true;
        } else {
            const newId = propIdInput.value;
            if (renamePart(selectedPartId, newId)) {
                propIdInput.disabled = true;
                document.getElementById('btn-rename-part').textContent = 'Rename';
                renamePending = false;
            }
        }
    };

    document.getElementById('prop-id').addEventListener('keydown', (e) => {
        if (!renamePending) return;
        if (e.key === 'Escape') {
            const propIdInput = document.getElementById('prop-id');
            propIdInput.value = selectedPartId;
            propIdInput.disabled = true;
            document.getElementById('btn-rename-part').textContent = 'Rename';
            renamePending = false;
        } else if (e.key === 'Enter') {
            document.getElementById('btn-rename-part').click();
        }
    });

    // Add Animation
    document.getElementById('btn-add-anim').onclick = () => {
        const input = document.getElementById('new-anim-id');
        const name = input.value.trim();
        if (!name) return;
        if (meshData.animations[name]) { alert(`Animation "${name}" already exists.`); return; }
        meshData.animations[name] = { duration: 1.0, loop: true, tracks: {} };
        currentAnimId = name;
        input.value = '';
        populateAnimations();
        updateTimelineUI();
    };

    // Load from file
    document.getElementById('btn-load').onclick = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                meshData = JSON.parse(text);
                currentSkeletonId = '';
                currentSkeletonName = file.name.replace('.json', '');
                document.getElementById('skeleton-name').value = currentSkeletonName;
                document.getElementById('skeleton-picker').value = '';
                populateHierarchy();
                populateAnimations();
                selectPart(meshData.parts[0]?.id || null);
            } catch (err) {
                alert('Failed to load JSON: ' + err.message);
            }
        };
        fileInput.click();
    };

    // Mirror skeleton / animation
    document.getElementById('btn-mirror-skeleton').onclick = () => {
        const dir = document.getElementById('mirror-direction').value;
        const fromSuffix = dir === 'r-to-l' ? '_r' : '_l';
        const toSuffix = dir === 'r-to-l' ? '_l' : '_r';

        if (editorMode === 'skeleton') {
            mirrorSkeleton(fromSuffix, toSuffix);
        } else {
            mirrorAnimation(fromSuffix, toSuffix);
        }
    };

    document.getElementById('btn-flip-animation').onclick = () => {
        flipAnimation();
    };

    // Save (attempt server save, fall back to download)
    document.getElementById('btn-save').onclick = async () => {
        const name = document.getElementById('skeleton-name').value.trim() || currentSkeletonName || 'skeleton';
        const id = currentSkeletonId || '';
        const payload = { name, id, meshData };

        try {
            const res = await fetch('/api/save_skeleton', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data && data.ok) {
                manifest = data.manifest || manifest;
                currentSkeletonId = data.id || currentSkeletonId;
                currentSkeletonName = name;
                document.getElementById('skeleton-name').value = name;
                populateSkeletonPicker();
                document.getElementById('skeleton-picker').value = currentSkeletonId || '';
                alert('Saved: ' + (data.file || 'unknown'));
                return;
            } else {
                throw new Error((data && data.error) || 'Save failed');
            }
        } catch (err) {
            console.warn('Server save failed, falling back to download:', err);
            const filename = name.toLowerCase().replace(/[^a-z0-9_]/g, '_') + '.json';
            const str = JSON.stringify(meshData, null, 2);
            const blob = new Blob([str], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
        }
    };

    document.getElementById('btn-play-pause').onclick = (e) => {
        isPlaying = !isPlaying;
        e.target.textContent = isPlaying ? 'Pause' : 'Play';
    }

    document.getElementById('btn-make-loop').onclick = () => {
        makeAnimationLoop();
    }

    // Apply initial mode
    setEditorMode('skeleton');
}

function updateTimelineUI() {
    const tracksContainer = document.getElementById('timeline-tracks');
    tracksContainer.innerHTML = '';
    const anim = meshData.animations[currentAnimId];
    if (!anim) return;

    document.getElementById('anim-duration').value = anim.duration;
    document.getElementById('anim-loop').checked = anim.loop;
    document.getElementById('current-anim-name').textContent = currentAnimId;

    const tracksInner = document.createElement('div');
    tracksInner.style.position = 'relative';
    tracksInner.style.minWidth = Math.max(800, anim.duration * timelinePixelsPerSecond + 200) + 'px';

    // label column width (fallback) — we'll measure after inserting into DOM
    let labelWidth = 120;

    const playhead = document.createElement('div');
    playhead.className = 'playhead';

    // click handler uses the current labelWidth (will be updated after layout)
    tracksInner.onclick = (e) => {
        const rect = tracksInner.getBoundingClientRect();
        const clickX = e.clientX - rect.left - labelWidth;
        if (clickX >= 0) {
            currentTime = Math.max(0, clickX / timelinePixelsPerSecond);
            if (currentTime > anim.duration) currentTime = anim.duration;
            updateTimelineUI();
            updateAnimPropsUI();
        }
    };

    meshData.parts.forEach(part => {
        const row = document.createElement('div');
        row.className = 'track-row';
        
        const label = document.createElement('div');
        label.className = 'track-label';
        label.textContent = part.id;
        row.appendChild(label);
        
        const area = document.createElement('div');
        area.className = 'track-area';
        
        if (anim.tracks[part.id]) {
            anim.tracks[part.id].forEach((kf, idx) => {
                const kfEl = document.createElement('div');
                kfEl.className = 'keyframe';
                kfEl.style.left = (kf.time * timelinePixelsPerSecond) + 'px';
                
                if (window.selectedKeyframe && window.selectedKeyframe.partId === part.id && Math.abs(window.selectedKeyframe.time - kf.time) < 0.001) {
                    kfEl.classList.add('selected');
                }
                
                kfEl.onclick = (e) => {
                    e.stopPropagation();
                    window.selectedKeyframe = { partId: part.id, time: kf.time };
                    currentTime = kf.time;
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

    // append to DOM first so table layout and widths can be measured
    tracksContainer.appendChild(tracksInner);

    // measure label width from first label (table layout makes column widths uniform)
    const firstLabel = tracksInner.querySelector('.track-label');
    if (firstLabel) {
        labelWidth = firstLabel.getBoundingClientRect().width;
    }

    // now position playhead relative to the measured label column
    playhead.style.left = (currentTime * timelinePixelsPerSecond + labelWidth) + 'px';
    tracksInner.appendChild(playhead);
}

function populateAnimations() {
    const sel = document.getElementById('anim-list');
    sel.innerHTML = '';
    for (const key of Object.keys(meshData.animations)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        sel.appendChild(opt);
    }
    sel.value = currentAnimId;
    sel.onchange = (e) => {
        currentAnimId = e.target.value;
        currentTime = 0;
        updateTimelineUI();
    };
}

function populateHierarchy() {
    updateHierarchyUI();
}

function setEditorMode(mode) {
    editorMode = mode;
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
    // show/hide attach tool only in skeleton editing mode
    document.getElementById('btn-tool-attach').style.display = isSkeleton ? '' : 'none';
    
    const mirrorDisplay = (isSkeleton || mode === 'animation') ? '' : 'none';
    document.getElementById('btn-mirror-skeleton').style.display = mirrorDisplay;
    document.getElementById('mirror-direction').style.display = mirrorDisplay;
    document.getElementById('btn-flip-animation').style.display = isSkeleton ? 'none' : '';

    if (!isSkeleton && currentTool === 'scale') {
        document.getElementById('btn-tool-select').click();
    }

    if (isSkeleton && isPlaying) {
        isPlaying = false;
        document.getElementById('btn-play-pause').textContent = 'Play';
    }

    if (selectedPartId) selectPart(selectedPartId);
}

function deletePart(id) {
    const part = meshData.parts.find(p => p.id === id);
    if (!part) return;

    for (const p of meshData.parts) {
        if (p.parentId === id) p.parentId = part.parentId || null;
    }

    meshData.parts.splice(meshData.parts.indexOf(part), 1);

    for (const animKey of Object.keys(meshData.animations)) {
        delete meshData.animations[animKey].tracks[id];
    }

    if (selectedPartId === id) selectedPartId = null;
    if (window.selectedKeyframe && window.selectedKeyframe.partId === id) {
        window.selectedKeyframe = null;
    }

    updateHierarchyUI();
    updateTimelineUI();
    selectPart(selectedPartId);
}

function renamePart(oldId, newId) {
    newId = newId.trim();
    if (!newId) { alert('Name cannot be empty.'); return false; }
    if (newId === oldId) return true;
    if (meshData.parts.find(p => p.id === newId)) { alert(`Part "${newId}" already exists.`); return false; }

    const part = meshData.parts.find(p => p.id === oldId);
    part.id = newId;

    for (const p of meshData.parts) {
        if (p.parentId === oldId) p.parentId = newId;
    }

    for (const animKey of Object.keys(meshData.animations)) {
        const anim = meshData.animations[animKey];
        if (Object.prototype.hasOwnProperty.call(anim.tracks, oldId)) {
            anim.tracks[newId] = anim.tracks[oldId];
            delete anim.tracks[oldId];
        }
    }

    if (selectedPartId === oldId) selectedPartId = newId;
    if (window.selectedKeyframe && window.selectedKeyframe.partId === oldId) {
        window.selectedKeyframe.partId = newId;
    }

    updateHierarchyUI();
    updateTimelineUI();
    selectPart(newId);
    return true;
}

function mirrorSkeleton(fromSuffix, toSuffix) {
    const fromParts = meshData.parts.filter(p => p.id.endsWith(fromSuffix));
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

        let toPart = meshData.parts.find(p => p.id === toId);
        if (!toPart) {
            toPart = { id: toId };
            const fromIdx = meshData.parts.indexOf(fromPart);
            meshData.parts.splice(fromIdx + 1, 0, toPart);
        }

        toPart.parentId     = toParentId;
        toPart.width        = fromPart.width;
        toPart.height       = fromPart.height;
        toPart.color        = fromPart.color;
        toPart.anchorX      = -fromPart.anchorX;
        toPart.anchorY      = fromPart.anchorY;
        toPart.relX         = -fromPart.relX;
        toPart.relY         = fromPart.relY;
        toPart.baseRotation = -(fromPart.baseRotation || 0);
    }

    updateHierarchyUI();
    if (selectedPartId) selectPart(selectedPartId);
}

function mirrorAnimation(fromSuffix, toSuffix) {
    const anim = meshData.animations[currentAnimId];
    if (!anim) return;

    const tracksToMirror = Object.keys(anim.tracks).filter(id => id.endsWith(fromSuffix));
    if (tracksToMirror.length === 0) {
        alert(`No animation tracks with ${fromSuffix} suffix found.`);
        return;
    }

    for (const fromId of tracksToMirror) {
        const toId = fromId.slice(0, -fromSuffix.length) + toSuffix;
        if (!meshData.parts.find(p => p.id === toId)) continue;

        const fromTrack = anim.tracks[fromId];
        anim.tracks[toId] = fromTrack.map(kf => ({
            time: kf.time,
            offsetX: -kf.offsetX,
            offsetY: kf.offsetY,
            rotation: -kf.rotation
        }));
    }

    updateTimelineUI();
    updateAnimPropsUI();
}

function flipAnimation() {
    const anim = meshData.animations[currentAnimId];
    if (!anim) return;

    const newTracks = {};
    const processedParts = new Set();
    const lSuffix = '_l';
    const rSuffix = '_r';

    const mirrorKeyframe = (kf) => ({
        time: kf.time,
        offsetX: -kf.offsetX,
        offsetY: kf.offsetY,
        rotation: -kf.rotation
    });

    for (const part of meshData.parts) {
        if (processedParts.has(part.id)) continue;

        let pairId = null;
        if (part.id.endsWith(lSuffix)) {
            pairId = part.id.slice(0, -lSuffix.length) + rSuffix;
        } else if (part.id.endsWith(rSuffix)) {
            pairId = part.id.slice(0, -rSuffix.length) + lSuffix;
        }

        if (pairId && meshData.parts.some(p => p.id === pairId)) {
            const trackA = anim.tracks[part.id];
            const trackB = anim.tracks[pairId];

            if (trackA) newTracks[pairId] = trackA.map(mirrorKeyframe);
            if (trackB) newTracks[part.id] = trackB.map(mirrorKeyframe);

            processedParts.add(part.id);
            processedParts.add(pairId);
        } else {
            const track = anim.tracks[part.id];
            if (track) {
                newTracks[part.id] = track.map(mirrorKeyframe);
            }
            processedParts.add(part.id);
        }
    }

    anim.tracks = newTracks;
    updateTimelineUI();
    updateAnimPropsUI();
}

window.onload = init;
