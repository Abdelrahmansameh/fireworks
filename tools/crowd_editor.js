import * as Renderer2D from '../js/rendering/Renderer.js';
const { Vector2, Color } = Renderer2D;

// Default initial state
let meshData = {
    parts: [],
    animations: {}
};

// Editor State
let selectedPartId = null;
let currentAnimId = 'cheering';
let currentTool = 'select'; // select, move, attach, rotate, scale
let editorMode = 'skeleton'; // 'skeleton' | 'animation'
let isPlaying = false;
let currentTime = 0;
let lastTime = 0;
window.selectedKeyframe = null;
const timelinePixelsPerSecond = 200;

// Rendering State
let renderer;
let instancedGroup;
let canvas;

// Interaction
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialProp1 = 0;
let initialProp2 = 0;

// Init
async function init() {
    canvas = document.getElementById('view-canvas');
    renderer = new Renderer2D.default(canvas, { virtualWidth: 800, virtualHeight: 600 });

    // Zoom in a bit so we can see the person easily
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

    // Try to load initial JSON
    try {
        const res = await fetch('../assets/crowd_mesh.json');
        if (res.ok) {
            meshData = await res.json();
            populateHierarchy();
            populateAnimations();
            selectPart(meshData.parts[0]?.id || null);
        }
    } catch (e) {
        console.warn("Could not load initial mesh JSON", e);
    }

    lastTime = performance.now();
    requestAnimationFrame(loop);
}

// Transform Math
function getParentTransform(partId, time) {
    const part = meshData.parts.find(p => p.id === partId);
    if (!part) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

    let parentTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    if (part.parentId) {
        parentTransform = getParentTransform(part.parentId, time);
    }

    // Evaluate keyframes for this part
    let localRot = 0;
    let localOffX = 0;
    let localOffY = 0;

    if (editorMode === 'animation' && partId === selectedPartId && !isPlaying) {
        localRot = parseFloat(document.getElementById('prop-rot').value) || 0;
        localOffX = parseFloat(document.getElementById('prop-offx').value) || 0;
        localOffY = parseFloat(document.getElementById('prop-offy').value) || 0;
    } else if (editorMode === 'animation') {
        const anim = meshData.animations[currentAnimId];
        if (anim && anim.tracks[partId] && anim.tracks[partId].length > 0) {
            const track = anim.tracks[partId];
            // Linear interpolate
            if (time <= track[0].time) {
                localRot = track[0].rotation;
                localOffX = track[0].offsetX;
                localOffY = track[0].offsetY;
            } else if (time >= track[track.length - 1].time) {
                localRot = track[track.length - 1].rotation;
                localOffX = track[track.length - 1].offsetX;
                localOffY = track[track.length - 1].offsetY;
            } else {
                for (let i = 0; i < track.length - 1; i++) {
                    if (time >= track[i].time && time <= track[i + 1].time) {
                        const t0 = track[i];
                        const t1 = track[i + 1];
                        const ratio = (time - t0.time) / (t1.time - t0.time);
                        localRot = t0.rotation + (t1.rotation - t0.rotation) * ratio;
                        localOffX = t0.offsetX + (t1.offsetX - t0.offsetX) * ratio;
                        localOffY = t0.offsetY + (t1.offsetY - t0.offsetY) * ratio;
                        break;
                    }
                }
            }
        }
    }

    // Determine parent attachment point in world space
    let parentW = 10, parentH = 10; // defaults if no parent
    if (part.parentId) {
        const pObj = meshData.parts.find(p => p.id === part.parentId);
        if (pObj) { parentW = pObj.width; parentH = pObj.height; }
    }

    // 1. Pivot point relative to parent center (unrotated)
    let pivotLocalX = part.relX * parentW;
    let pivotLocalY = part.relY * parentH;

    // Apply parent rotation to pivot offset
    const cosP = Math.cos(parentTransform.rotation);
    const sinP = Math.sin(parentTransform.rotation);
    let pivotWorldX = parentTransform.x + (pivotLocalX * cosP - pivotLocalY * sinP);
    let pivotWorldY = parentTransform.y + (pivotLocalX * sinP + pivotLocalY * cosP);

    // 2. Add animation offset (also rotated by parent)
    pivotWorldX += (localOffX * cosP - localOffY * sinP);
    pivotWorldY += (localOffX * sinP + localOffY * cosP);

    // 3. Current World Rotation
    const worldRot = parentTransform.rotation + (part.baseRotation || 0) + localRot;

    // Return the pivot point as the "origin" of this shape
    return {
        x: pivotWorldX,
        y: pivotWorldY,
        rotation: worldRot,
        scaleX: 1, // keeping scale global for now
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

// Main render loop
function loop(now) {
    requestAnimationFrame(loop);

    // Handle playback
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

    // Render shapes
    instancedGroup.clear();
    
    // Grid / Origin / Background Marker
    // Draw a big white rectangle as background
    instancedGroup.addInstanceRaw(0, 0, 0, 200, 200, 1, 1, 1, 1);
    
    // Draw an origin dot (Red) over the white background
    instancedGroup.addInstanceRaw(0, 0, 0, 0.2, 0.2, 1, 0, 0, 1);

    // Calculate ordered transforms
    // Note: Parts array order serves as z-index 
    // We should compute parent transforms top-down, but getParentTransform is recursive so it handles it.

    for (let i = 0; i < meshData.parts.length; i++) {
        const part = meshData.parts[i];
        const tf = getParentTransform(part.id, currentTime);

        // tf is the world position of the pivot constraint. 
        // We now need to offset the geometry so that the part's anchor point sits exactly on the pivot.

        const anchorOffX = part.anchorX * part.width;
        const anchorOffY = part.anchorY * part.height;

        // Rotate anchor offset
        const cosR = Math.cos(tf.rotation);
        const sinR = Math.sin(tf.rotation);

        const drawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
        const drawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

        const c = hexToRgb(part.color || 'FFFFFF');

        // Highlight logic
        let rf = 1, gf = 1, bf = 1;
        if (part.id === selectedPartId) {
            // slightly tint selected
            if (c.r < 0.5 && c.g < 0.5 && c.b < 0.5) {
                // if it's black, tint red
                rf = 2.0; gf = 0.5; bf = 0.5;
            } else {
                // tint grey
                rf = 0.8; gf = 0.8; bf = 0.8;
            }
        }

        instancedGroup.addInstanceRaw(
            drawX, drawY,
            tf.rotation,
            part.width * tf.scaleX, part.height * tf.scaleY,
            c.r * rf, c.g * gf, c.b * bf, 1.0
        );

        // Draw gizmo points if selected
        if (part.id === selectedPartId) {
            // Pivot point visually (Cyan)
            const pivotSize = 0.5;
            instancedGroup.addInstanceRaw(tf.x, tf.y, 0, pivotSize, pivotSize, 0, 1, 1, 1);

            // Parent attachment point for visualizing relX/relY
            if (part.parentId) {
                const pObj = meshData.parts.find(p => p.id === part.parentId);
                const pTf = getParentTransform(part.parentId, currentTime);
                const pOffX = pObj.anchorX * pObj.width;
                const pOffY = pObj.anchorY * pObj.height;
                const pDrawX = pTf.x - (pOffX * Math.cos(pTf.rotation) - pOffY * Math.sin(pTf.rotation));
                const pDrawY = pTf.y - (pOffX * Math.sin(pTf.rotation) + pOffY * Math.cos(pTf.rotation));

                // Draw line/marker if we need
            }
        }
    }


    renderer.drawFrame();
}

// ----- UI AND INTERACTION ----- 

function updateHierarchyUI() {
    const list = document.getElementById('hierarchy-list');
    list.innerHTML = '';

    const parentSelect = document.getElementById('new-part-parent');
    parentSelect.innerHTML = '<option value="">(No Parent)</option>';

    // Root level rendering
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

    // format color
    let c = part.color || "000000";
    if (c.length === 6) c = "#" + c;
    document.getElementById('prop-color').value = c;

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

    // Determine bounds/interpolation for UI boxes
    if (anim && anim.tracks[selectedPartId]) {
        const track = anim.tracks[selectedPartId];
        let foundExact = false;
        // check if exact keyframe
        for (const k of track) {
            if (Math.abs(k.time - currentTime) < 0.01) {
                localRot = k.rotation;
                localOffX = k.offsetX;
                localOffY = k.offsetY;
                foundExact = true;
                break;
            }
        }
        if (!foundExact && track.length > 0) {
            // We'd interpolate, but for the UI property box let's show interpolated if locked, 
            // but normally we edit exact keyframes, so if you are off-keyframe what do you see?
            // Let's just evaluate it for now.
            // (in real editors input boxes show the interpolated value and tint when editing)
            const time = currentTime;
            if (time <= track[0].time) {
                localRot = track[0].rotation;
                localOffX = track[0].offsetX;
                localOffY = track[0].offsetY;
            } else if (time >= track[track.length - 1].time) {
                localRot = track[track.length - 1].rotation;
                localOffX = track[track.length - 1].offsetX;
                localOffY = track[track.length - 1].offsetY;
            } else {
                for (let i = 0; i < track.length - 1; i++) {
                    if (time >= track[i].time && time <= track[i + 1].time) {
                        const t0 = track[i];
                        const t1 = track[i + 1];
                        const ratio = (time - t0.time) / (t1.time - t0.time);
                        localRot = t0.rotation + (t1.rotation - t0.rotation) * ratio;
                        localOffX = t0.offsetX + (t1.offsetX - t0.offsetX) * ratio;
                        localOffY = t0.offsetY + (t1.offsetY - t0.offsetY) * ratio;
                        break;
                    }
                }
            }
        }
    }

    document.getElementById('prop-offx').value = localOffX.toFixed(2);
    document.getElementById('prop-offy').value = localOffY.toFixed(2);
    document.getElementById('prop-rot').value = localRot.toFixed(2);
}

function setupUI() {
    // Mode switcher
    document.getElementById('btn-mode-skeleton').onclick = () => setEditorMode('skeleton');
    document.getElementById('btn-mode-animation').onclick = () => setEditorMode('animation');

    // Attach tool is absorbed by move in skeleton mode — hide it always
    document.getElementById('btn-tool-attach').style.display = 'none';

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
        if (e.target.id === 'prop-ax') part.anchorX = parseFloat(e.target.value);
        if (e.target.id === 'prop-ay') part.anchorY = parseFloat(e.target.value);
        if (e.target.id === 'prop-rx') part.relX = parseFloat(e.target.value);
        if (e.target.id === 'prop-ry') part.relY = parseFloat(e.target.value);
        if (e.target.id === 'prop-base-rot') part.baseRotation = parseFloat(e.target.value);
    });

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

        // Find if keyframe exists at time
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
            anim.duration = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            updateTimelineUI();
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
        const wPos = renderer.screenToCanvas(e.clientX, e.clientY);
        
        // Find if we clicked on a part (rough AABB test for ease of use)
        // We go backwards to pick the top-most rendered part
        let clickedPartId = null;
        for (let i = meshData.parts.length - 1; i >= 0; i--) {
            const part = meshData.parts[i];
            const tf = getParentTransform(part.id, currentTime);
            // approximate bounds
            const hw = (part.width * tf.scaleX) / 2;
            const hh = (part.height * tf.scaleY) / 2;
            
            // To do accurate OBB we inverse transform the click point
            const cos = Math.cos(-tf.rotation);
            const sin = Math.sin(-tf.rotation);
            const dx = wPos.x - tf.x;
            const dy = wPos.y - tf.y;
            
            // local dx/dy relative to the pivot
            let localX = dx * cos - dy * sin;
            let localY = dx * sin + dy * cos;
            
            // Shift by anchor to get center
            const anchorOffX = part.anchorX * part.width;
            const anchorOffY = part.anchorY * part.height;
            localX += anchorOffX;
            localY += anchorOffY;

            if (Math.abs(localX) <= hw && Math.abs(localY) <= hh) {
                clickedPartId = part.id;
                break; // Found top-most
            }
        }
        
        if (clickedPartId && currentTool === 'select') {
             selectPart(clickedPartId);
        } else if (clickedPartId && !selectedPartId) {
             // If we clicked something but nothing was selected, select it as a courtesy before dragging
             selectPart(clickedPartId);
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
        if (!isDragging || !selectedPartId) return;
        const part = meshData.parts.find(p => p.id === selectedPartId);
        if (!part) return;

        const wPos = renderer.screenToCanvas(e.clientX, e.clientY);
        const dx = wPos.x - dragStartX;
        const dy = wPos.y - dragStartY;

        if (currentTool === 'attach') {
            // Modify relX, relY
            // Approximated scaled drag 
            let pw = 10, ph = 10;
            if (part.parentId) {
                const pObj = meshData.parts.find(a => a.id === part.parentId);
                if (pObj) { pw = pObj.width; ph = pObj.height; }
            }

            // To do this accurately, we need to inverse transform the drag vector 
            // by the parent's world rotation.
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
                // auto-keyframe might be nice, but forcing explicit click for now.
            }
        }
        else if (currentTool === 'move') {
            if (editorMode === 'skeleton') {
                // Move attachment point (relX/relY) in skeleton mode
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
                // Move animation offset
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
            // Scale based on mouse drag distance relative to drag start
            const scaleFactorX = 1 + (dx / 50); // Arbitrary scaling speed
            const scaleFactorY = 1 + (dy / 50); // Arbitrary scaling speed
            
            // Allow uniform scaling if Shift is held, but simpler for now: just scale both
            // Math.max to prevent negative sizes
            part.width = Math.max(0.1, initialProp1 * scaleFactorX);
            part.height = Math.max(0.1, initialProp2 * scaleFactorY);
            
            document.getElementById('prop-w').value = part.width.toFixed(2);
            document.getElementById('prop-h').value = part.height.toFixed(2);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    window.addEventListener('keydown', (e) => {
        // Only trigger if not typing in an input field
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

    // Load
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
                populateHierarchy();
                populateAnimations();
                selectPart(meshData.parts[0]?.id || null);
            } catch (err) {
                alert('Failed to load JSON: ' + err.message);
            }
        };
        fileInput.click();
    };

    // Mirror skeleton R → L
    document.getElementById('btn-mirror-skeleton').onclick = () => mirrorSkeletonRtoL();

    // Save
    document.getElementById('btn-save').onclick = () => {
        const str = JSON.stringify(meshData, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'crowd_mesh.json';
        a.click();
    };

    document.getElementById('btn-play-pause').onclick = (e) => {
        isPlaying = !isPlaying;
        e.target.textContent = isPlaying ? 'Pause' : 'Play';
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
    
    // Playhead
    const playhead = document.createElement('div');
    playhead.className = 'playhead';
    playhead.style.left = (currentTime * timelinePixelsPerSecond + 120) + 'px';
    
    tracksInner.onclick = (e) => {
        const rect = tracksInner.getBoundingClientRect();
        const clickX = e.clientX - rect.left - 120;
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

    tracksInner.appendChild(playhead);
    tracksContainer.appendChild(tracksInner);
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

    // Left panel sections
    document.getElementById('section-add-part').style.display = isSkeleton ? '' : 'none';
    document.getElementById('section-animations').style.display = isSkeleton ? 'none' : '';

    // Timeline
    document.getElementById('timeline-panel').style.display = isSkeleton ? 'none' : 'flex';

    // Properties sections
    const skeletonProps = document.getElementById('skeleton-props');
    const animFrameProps = document.getElementById('anim-frame-props');
    if (skeletonProps) skeletonProps.style.display = isSkeleton ? '' : 'none';
    if (animFrameProps) animFrameProps.style.display = isSkeleton ? 'none' : '';

    // Tool visibility: scale + mirror only in skeleton, rotate in both modes
    document.getElementById('btn-tool-rotate').style.display = '';
    document.getElementById('btn-tool-scale').style.display = isSkeleton ? '' : 'none';
    document.getElementById('btn-mirror-skeleton').style.display = isSkeleton ? '' : 'none';

    // If active tool is no longer valid, revert to select
    if (!isSkeleton && currentTool === 'scale') {
        document.getElementById('btn-tool-select').click();
    }

    // Stop playback when entering skeleton mode
    if (isSkeleton && isPlaying) {
        isPlaying = false;
        document.getElementById('btn-play-pause').textContent = 'Play';
    }

    if (selectedPartId) selectPart(selectedPartId);
}

function mirrorSkeletonRtoL() {
    const rParts = meshData.parts.filter(p => p.id.endsWith('_r'));
    if (rParts.length === 0) {
        alert('No parts with _r suffix found.');
        return;
    }

    for (const rPart of rParts) {
        const lId = rPart.id.slice(0, -2) + '_l';

        // If the _r part's parent is also a _r part, point to the _l counterpart
        let lParentId = rPart.parentId || null;
        if (lParentId && lParentId.endsWith('_r')) {
            lParentId = lParentId.slice(0, -2) + '_l';
        }

        // Find existing _l part or create it
        let lPart = meshData.parts.find(p => p.id === lId);
        if (!lPart) {
            lPart = { id: lId };
            // Insert right after the _r counterpart so hierarchy stays tidy
            const rIdx = meshData.parts.indexOf(rPart);
            meshData.parts.splice(rIdx + 1, 0, lPart);
        }

        // Copy and mirror properties
        lPart.parentId     = lParentId;
        lPart.width        = rPart.width;
        lPart.height       = rPart.height;
        lPart.color        = rPart.color;
        lPart.anchorX      = -rPart.anchorX;
        lPart.anchorY      = rPart.anchorY;
        lPart.relX         = -rPart.relX;
        lPart.relY         = rPart.relY;
        lPart.baseRotation = -(rPart.baseRotation || 0);
    }

    updateHierarchyUI();
    if (selectedPartId) selectPart(selectedPartId);
}

window.onload = init;
