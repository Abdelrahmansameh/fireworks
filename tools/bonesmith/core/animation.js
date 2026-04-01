import { state } from './state.js';
import { saveState } from './undo.js';
import { sampleAnimValuesAt } from './math.js';
import { updateTimelineUI, updateAnimPropsUI } from './ui.js';

export function makeAnimationLoop() {
    saveState();
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim) {
        alert('No animation selected.');
        return;
    }

    const duration = Math.max(0.0001, anim.duration || 0);
    if (!anim.tracks) anim.tracks = {};

    for (const part of state.meshData.parts) {
        const pid = part.id;
        let track = anim.tracks[pid];

        // sample start values at t=0
        const start = sampleAnimValuesAt(pid, 0, anim);

        if (!track || track.length === 0) {
            track = [{ time: 0, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY }];
            anim.tracks[pid] = track;
        } else {
            const startIdx = track.findIndex(k => Math.abs(k.time - 0) < 0.01);
            if (startIdx < 0) {
                track.push({ time: 0, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY });
            }
        }

        const endIdx = track.findIndex(k => Math.abs(k.time - duration) < 0.01);
        const endKf = { time: duration, rotation: start.rotation, offsetX: start.offsetX, offsetY: start.offsetY };
        if (endIdx >= 0) track[endIdx] = endKf; else track.push(endKf);

        track.sort((a, b) => a.time - b.time);
    }

    anim.loop = true;
    const loopEl = document.getElementById('anim-loop');
    if (loopEl) loopEl.checked = true;

    updateTimelineUI();
    updateAnimPropsUI();
    alert('End keyframes updated to match start frames for loop.');
}

export function mirrorAnimation(fromSuffix, toSuffix) {
    const anim = state.meshData.animations[state.currentAnimId];
    if (!anim) return;

    const tracksToMirror = Object.keys(anim.tracks).filter(id => id.endsWith(fromSuffix));
    if (tracksToMirror.length === 0) {
        alert(`No animation tracks with ${fromSuffix} suffix found.`);
        return;
    }

    for (const fromId of tracksToMirror) {
        const toId = fromId.slice(0, -fromSuffix.length) + toSuffix;
        if (!state.meshData.parts.find(p => p.id === toId)) continue;

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

export function flipAnimation() {
    const anim = state.meshData.animations[state.currentAnimId];
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

    for (const part of state.meshData.parts) {
        if (processedParts.has(part.id)) continue;

        let pairId = null;
        if (part.id.endsWith(lSuffix)) {
            pairId = part.id.slice(0, -lSuffix.length) + rSuffix;
        } else if (part.id.endsWith(rSuffix)) {
            pairId = part.id.slice(0, -rSuffix.length) + lSuffix;
        }

        if (pairId && state.meshData.parts.some(p => p.id === pairId)) {
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
