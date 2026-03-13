import { GAME_BOUNDS, CROWD_CONFIG, CROWD_CATCHER_CONFIG, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { createRng } from '../utils/random.js';

function _parseHexColor(hex) {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
    };
}

class Crowd {
    constructor(renderer2D) {
        this.renderer = renderer2D;
        this.people = [];
        this.missingCrowdsToInit = 0;

        this.instancedGroup = null;

        // JSON-driven mesh data
        this._meshData = null;
        this._partCount = 0;
        this._partLookup = new Map(); // partId -> part object
        this._partColors = [];        // precomputed {r,g,b} per part index

        // Interaction state for grab / drag / drop
        this.grabbedPersonIndex = -1;
        this._grabOffsetX = 0;
        this._grabOffsetY = 0;
        this._cursorHistory = [];

        // Particle-catching
        this.particleSystem = null;
        this.catchingEnabled = false;
        this.collectionRadius = CROWD_CATCHER_CONFIG.collectionRadius;
        this.onCatchSparkles = null;
        this._scanFrameCounter = 0;

        this.goldPerSecondPerPerson = 0.1;
        this.onCoinDrop = null;

        this._initializeCrowd();
    }

    async _initializeCrowd() {
        try {
            // Load mesh definition from the editor-exported JSON
            const res = await fetch('assets/crowd_mesh.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this._meshData = await res.json();
        } catch (e) {
            console.warn('crowd_mesh.json failed to load, using minimal fallback:', e);
            // Minimal single-part fallback so the game still runs
            this._meshData = {
                parts: [{ id: 'body', parentId: null, width: 10, height: 10, anchorX: 0, anchorY: 0, relX: 0, relY: 0, color: '000000' }],
                animations: { cheering: { duration: 1, loop: true, tracks: {} }, walking: { duration: 1, loop: true, tracks: {} }, falling: { duration: 1, loop: true, tracks: {} }, toss_coin: { duration: 0.8, loop: false, tracks: {} } }
            };
        }

        const parts = this._meshData.parts;
        this._partCount = parts.length;
        this._partLookup.clear();
        this._partColors = [];
        for (const p of parts) {
            this._partLookup.set(p.id, p);
            this._partColors.push(_parseHexColor(p.color || '000000'));
        }

        try {
            const geometry = Renderer2D.buildTexturedSquare(1, 1);
            this.instancedGroup = this.renderer.createInstancedGroup({
                vertices: geometry.vertices,
                indices: geometry.indices,
                texCoords: geometry.texCoords,
                texture: null,
                maxInstances: CROWD_CONFIG.maxInstances,
                zIndex: CROWD_CONFIG.zIndex,
                blendMode: Renderer2D.BlendMode.NORMAL,
            });

            for (let i = 0; i < this.missingCrowdsToInit; i++) {
                this._addPerson();
            }
            this.missingCrowdsToInit = 0;
            console.log(`Crowd initialized from crowd_mesh.json: ${this._partCount} parts, max ${CROWD_CONFIG.maxInstances} instances.`);
        } catch (error) {
            console.error('Failed to create instanced group for crowd:', error);
        }
    }

    setCount(count) {
        if (!this.instancedGroup) {
            this.missingCrowdsToInit = count;
            return;
        }

        if (count === this.people.length) return;

        if (count < this.people.length) {
            if (this.grabbedPersonIndex >= count) {
                this.grabbedPersonIndex = -1;
            }

            while (this.people.length > count) {
                this.people.pop();
                this.instancedGroup.instanceCount -= this._partCount;
            }
        } else {
            const added = count - this.people.length;
            for (let i = 0; i < added; i++) {
                this._addPerson();
            }
        }
    }

    _addPerson() {
        if (!this.instancedGroup) {
            this.missingCrowdsToInit++;
            return;
        }

        const personIndex = this.people.length;
        const seedConfig = CROWD_CONFIG.scaling ? CROWD_CONFIG.scaling.seed : 12345;
        const rng = createRng(seedConfig + personIndex);

        let x;
        let positionFound = false;
        let attempts = 0;
        const maxAttempts = CROWD_CONFIG.maxPlacementAttempts;

        while (!positionFound && attempts < maxAttempts) {
            x = rng() * (GAME_BOUNDS.CROWD_RIGHT_X - GAME_BOUNDS.CROWD_LEFT_X) + GAME_BOUNDS.CROWD_LEFT_X;
            let overlapping = false;
            for (let i = 0; i < this.people.length; i++) {
                if (Math.abs(this.people[i].x - x) < CROWD_CONFIG.minOverlapDistance) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) positionFound = true;
            attempts++;
        }

        const y = GAME_BOUNDS.CROWD_Y + rng() * CROWD_CONFIG.ySpread;
        const scale = CROWD_CONFIG.baseScale + rng() * CROWD_CONFIG.scaleVariance;

        const group = this.instancedGroup;

        const person = {
            x: x,
            y: y,
            scale: scale,
            animTimer: rng() * Math.PI * 2, // random start phase (will be modded by anim duration)
            animSpeed: 0.85 + rng() * 0.3,  // playback speed variation (0.85–1.15x)
            state: 'cheering',
            spawnX: x,
            spawnY: y,
            vx: 0,
            vy: 0,
            instanceBaseIndex: group.instanceCount,
            goldAccumulator: rng(),
            coinAnimTimer: 0,
            collected: 0,
            bounceCount: 0,
            flipX: rng() > 0.5 ? 1 : -1,
        };

        this.people.push(person);

        // Add one instance per part
        for (let i = 0; i < this._partCount; i++) {
            group.addInstanceRaw(person.x, person.y, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0);
        }

        // Initialize transformation visually once
        this._updateProceduralAnimation(person, 0);
    }

    setAnimation(personIndex, animName) {
        if (personIndex < 0 || personIndex >= this.people.length) return;

        const person = this.people[personIndex];
        // Translate animation requested by name into a state for procedural reasoning
        // In the procedural model, animName doesn't directly dictate frames, but we map it loosely.
        // It's mainly used for tosses
        if (animName === 'toss_coin') {
            person.coinAnimTimer = 0.8; // Set manual length for coin toss procedural animation
        } else if (animName === 'falling') {
            person.state = 'falling';
        } else if (animName === 'walking_right' || animName === 'walking_down') {
            person.state = 'walking';
        } else if (animName === 'cheer') {
            person.state = 'cheering';
        }
    }

    setAllAnimation(animName) {
        for (let i = 0; i < this.people.length; i++) {
            this.setAnimation(i, animName);
        }
    }

    update(deltaTime) {
        if (!this.instancedGroup || this.people.length === 0) return;

        const GRAVITY = CROWD_CONFIG.gravity;
        const FRICTION = CROWD_CONFIG.friction;
        const WALK_SPEED = CROWD_CONFIG.walkSpeed;

        const goldRate = this.goldPerSecondPerPerson;

        for (let i = 0; i < this.people.length; i++) {
            this._updatePerson(i, deltaTime, GRAVITY, FRICTION, WALK_SPEED, goldRate);
            this._updateProceduralAnimation(this.people[i], deltaTime);
        }

        this._scanFrameCounter++;
    }

    _switchToState(personIndex, newState) {
        const person = this.people[personIndex];
        person.state = newState;
        person.bounceCount = 0;
        if (newState !== 'grabbed') {
            person.coinAnimTimer = 0; // stop toss on state change
        }
    }

    _updatePerson(personIndex, deltaTime, gravity, friction, walkSpeed, goldRate) {
        const person = this.people[personIndex];

        switch (person.state) {
            case 'cheering': {
                // Bob is handled strictly in procedural now
                break;
            }
            case 'grabbed': {
                // Position handled by dragTo
                break;
            }
            case 'falling': {
                if (this.catchingEnabled && this.particleSystem && (this._scanFrameCounter % CROWD_CATCHER_CONFIG.scanInterval) === 0) {
                    this._scanParticlesForPerson(person);
                }

                const decay = Math.exp(-friction * deltaTime);
                person.vx *= decay;
                person.vy -= gravity * deltaTime;
                person.x += person.vx * deltaTime;
                person.y += person.vy * deltaTime;

                if (person.x < GAME_BOUNDS.SCROLL_MIN_X - CROWD_CONFIG.wallBounceBuffer) {
                    person.x = GAME_BOUNDS.SCROLL_MIN_X - CROWD_CONFIG.wallBounceBuffer;
                    person.vx = Math.abs(person.vx) * CROWD_CONFIG.wallBounce;
                } else if (person.x > GAME_BOUNDS.SCROLL_MAX_X + CROWD_CONFIG.wallBounceBuffer) {
                    person.x = GAME_BOUNDS.SCROLL_MAX_X + CROWD_CONFIG.wallBounceBuffer;
                    person.vx = -Math.abs(person.vx) * CROWD_CONFIG.wallBounce;
                }

                if (person.y <= person.spawnY) {
                    person.y = person.spawnY;

                    if (person.bounceCount < CROWD_CONFIG.groundBounceCount) {
                        person.vy = Math.abs(person.vy) * CROWD_CONFIG.groundBounceDamping;
                        person.bounceCount++;
                    } else {
                        person.vy = 0;
                        person.vx = 0;
                        person.collected = 0;

                        const distToSpawn = Math.abs(person.x - person.spawnX);
                        if (distToSpawn < CROWD_CONFIG.landingSnapDistance) {
                            person.x = person.spawnX;
                            this._switchToState(personIndex, 'cheering');
                        } else {
                            this._switchToState(personIndex, 'walking');
                        }
                    }
                }
                break;
            }

            case 'walking': {
                const dx = person.spawnX - person.x;
                const dir = Math.sign(dx);
                const deltaMove = dir * walkSpeed * deltaTime;

                if (dx < 0 && dx >= deltaMove || dx > 0 && dx <= deltaMove) {
                    person.x = person.spawnX;
                    person.state = 'cheering';
                } else {
                    person.x += deltaMove;
                }
                break;
            }
        }

        person.goldAccumulator += goldRate * deltaTime;
        if (person.goldAccumulator >= 1.0) {
            const coins = Math.floor(person.goldAccumulator);
            person.goldAccumulator -= coins;
            if (this.onCoinDrop) {
                this.onCoinDrop(coins, 'crowd');
            }
            // Coin toss anim trigger
            person.coinAnimTimer = 0.8;
        }

        if (person.coinAnimTimer > 0) {
            person.coinAnimTimer -= deltaTime;
            if (person.coinAnimTimer <= 0) {
                person.coinAnimTimer = 0;
            }
        }
    }

    _evalTrack(track, time) {
        if (track.length === 0) return { rotation: 0, offsetX: 0, offsetY: 0 };
        if (time <= track[0].time) return track[0];
        const last = track[track.length - 1];
        if (time >= last.time) return last;
        for (let i = 0; i < track.length - 1; i++) {
            if (time >= track[i].time && time <= track[i + 1].time) {
                const t0 = track[i], t1 = track[i + 1];
                const ratio = (time - t0.time) / (t1.time - t0.time);
                return {
                    rotation: t0.rotation + (t1.rotation - t0.rotation) * ratio,
                    offsetX:  t0.offsetX  + (t1.offsetX  - t0.offsetX)  * ratio,
                    offsetY:  t0.offsetY  + (t1.offsetY  - t0.offsetY)  * ratio,
                };
            }
        }
        return last;
    }

    _updateProceduralAnimation(person, deltaTime) {
        person.animTimer += deltaTime * person.animSpeed;

        if (!this._meshData) return;

        const parts   = this._meshData.parts;
        const anims   = this._meshData.animations;
        const scale   = person.scale;
        const flipX   = (person.state === 'walking') ? (person.spawnX < person.x ? -1 : 1) : person.flipX;

        // Determine which state animation to evaluate
        const stateAnimName = (person.state === 'grabbed') ? 'falling' : person.state;
        const stateAnim     = anims[stateAnimName] || null;
        let   stateAnimTime = 0;
        if (stateAnim) {
            stateAnimTime = stateAnim.loop
                ? person.animTimer % stateAnim.duration
                : Math.min(person.animTimer, stateAnim.duration);
        }

        // Coin-toss overlay: time elapsed since toss started
        const tossAnim     = (person.coinAnimTimer > 0) ? (anims['toss_coin'] || null) : null;
        const tossAnimTime = tossAnim ? (tossAnim.duration - person.coinAnimTimer) : 0;

        // Build pivot map: partId -> { x, y, rotation } in mesh-local space
        const pivotMap = new Map();
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            let parentX = 0, parentY = 0, parentRot = 0;
            let parentW = 10, parentH = 10;

            if (part.parentId) {
                const pTf   = pivotMap.get(part.parentId);
                parentX     = pTf.x;
                parentY     = pTf.y;
                parentRot   = pTf.rotation;
                const pPart = this._partLookup.get(part.parentId);
                parentW     = pPart.width;
                parentH     = pPart.height;
            }

            // Toss-coin animation overrides specific parts; fall back to state anim
            let localRot = 0, localOffX = 0, localOffY = 0;
            if (tossAnim && tossAnim.tracks[part.id]) {
                const kf = this._evalTrack(tossAnim.tracks[part.id], tossAnimTime);
                localRot = kf.rotation; localOffX = kf.offsetX; localOffY = kf.offsetY;
            } else if (stateAnim && stateAnim.tracks[part.id]) {
                const kf = this._evalTrack(stateAnim.tracks[part.id], stateAnimTime);
                localRot = kf.rotation; localOffX = kf.offsetX; localOffY = kf.offsetY;
            }

            const cosP = Math.cos(parentRot);
            const sinP = Math.sin(parentRot);
            const pivotLocalX = part.relX * parentW;
            const pivotLocalY = part.relY * parentH;

            let pivotWorldX = parentX + (pivotLocalX * cosP - pivotLocalY * sinP);
            let pivotWorldY = parentY + (pivotLocalX * sinP + pivotLocalY * cosP);
            pivotWorldX += localOffX * cosP - localOffY * sinP;
            pivotWorldY += localOffX * sinP + localOffY * cosP;

            pivotMap.set(part.id, { x: pivotWorldX, y: pivotWorldY, rotation: parentRot + localRot });
        }

        const baseIdx = person.instanceBaseIndex;
        const g       = this.instancedGroup;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const tf   = pivotMap.get(part.id);

            const anchorOffX = part.anchorX * part.width;
            const anchorOffY = part.anchorY * part.height;
            const cosR = Math.cos(tf.rotation);
            const sinR = Math.sin(tf.rotation);

            // Mesh-space draw center (center of rectangle for the renderer)
            const meshDrawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
            const meshDrawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

            // Apply person transform: position, scale, flip
            const worldX = person.x + meshDrawX * flipX * scale;
            const worldY = person.y + meshDrawY * scale;

            const c = this._partColors[i];
            g.updateInstancePosition(baseIdx + i, worldX, worldY);
            g.updateInstanceScale(baseIdx + i, part.width * scale, part.height * scale);
            g.updateInstanceRotation(baseIdx + i, tf.rotation * flipX);
            g.updateInstanceColor(baseIdx + i, c.r, c.g, c.b, 1);
        }
    }

    _scanParticlesForPerson(person) {
        const ps = this.particleSystem;
        const cfg = CROWD_CATCHER_CONFIG;
        const radius = this.collectionRadius;
        const onCatch = this.onCatchSparkles;
        const personRef = person;

        for (const shape of Object.keys(ps.activeCounts)) {
            const sd = ps.instanceData[shape];
            if (!sd) continue;

            const pCount = ps.activeCounts[shape];
            if (pCount === 0) continue;

            const sStr = ps.strideFloats;
            const updateFns = ps.particleUpdateFns[shape];
            const pTypeIdx = ps.particleTypeIdx;
            const pPosIdx = ps.positionIdx;

            for (let pi = 0; pi < pCount; pi++) {
                const pBase = pi * sStr;

                if (sd[pBase + pTypeIdx] !== PARTICLE_TYPES.FIREWORK_EXPLOSION) continue;

                const pAge = sd[pBase + ps.initialLifetimeIdx] - sd[pBase + ps.lifetimeIdx];
                if (pAge < cfg.minParticleAge) continue;

                const pdx = sd[pBase + pPosIdx] - personRef.x;
                if (pdx > radius || pdx < -radius) continue;
                const pdy = sd[pBase + pPosIdx + 1] - personRef.y;
                if (pdy > radius || pdy < -radius) continue;

                const existingFn = updateFns[pi];
                if (existingFn && (existingFn._isDronePull || existingFn._isCrowdPull)) continue;

                let pullElapsed = 0;
                const pullFn = (state, delta) => {
                    pullElapsed += delta;

                    const ex = personRef.x - state.position.x;
                    const ey = personRef.y - state.position.y;
                    const eDist = Math.sqrt(ex * ex + ey * ey);

                    if (eDist < cfg.arrivalThreshold || pullElapsed >= cfg.maxCaptureTime) {
                        personRef.collected++;
                        if (onCatch) onCatch(cfg.sparklesPerParticle);
                        state.lifetime = 0;
                        return;
                    }

                    state.lifetime = 1.0;
                    state.alpha = pullElapsed / cfg.maxCaptureTime;
                    state.scale = pullElapsed / cfg.maxCaptureTime;

                    const eInv = 1 / eDist;
                    state.velocity.x += ex * eInv * cfg.pullForce * delta;
                    state.velocity.y += ey * eInv * cfg.pullForce * delta;

                    state.color.r += 0.05 * delta;
                    state.color.g += 0.05 * delta;
                    state.color.b += 0.05 * delta;
                };
                pullFn._isCrowdPull = true;

                updateFns[pi] = pullFn;
            }
        }
    }

    get isGrabbing() {
        return this.grabbedPersonIndex >= 0;
    }

    tryGrab(wx, wy) {
        if (this.grabbedPersonIndex >= 0) return false;

        const PICK_RADIUS = CROWD_CONFIG.pickRadius;
        let bestDist = PICK_RADIUS;
        let bestIdx = -1;

        for (let i = 0; i < this.people.length; i++) {
            const p = this.people[i];
            if (p.state !== 'cheering') continue;
            const dx = p.x - wx;
            const dy = p.y - wy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }

        if (bestIdx >= 0) {
            const person = this.people[bestIdx];
            person.state = 'grabbed';
            this.grabbedPersonIndex = bestIdx;

            this._grabOffsetX = person.x - wx;
            this._grabOffsetY = person.y - wy;

            this._cursorHistory = [{ x: person.x, y: person.y, t: performance.now() / 1000 }];
            return true;
        }
        return false;
    }

    dragTo(wx, wy) {
        if (this.grabbedPersonIndex < 0) return;

        let targetX = wx + this._grabOffsetX;
        const targetY = wy + this._grabOffsetY;

        targetX = Math.max(GAME_BOUNDS.SCROLL_MIN_X, Math.min(GAME_BOUNDS.SCROLL_MAX_X, targetX));

        const person = this.people[this.grabbedPersonIndex];
        person.x = targetX;
        person.y = targetY;

        const now = performance.now() / 1000;
        this._cursorHistory.push({ x: targetX, y: targetY, t: now });
        if (this._cursorHistory.length > CROWD_CONFIG.cursorHistorySize) this._cursorHistory.shift();
    }

    release() {
        if (this.grabbedPersonIndex < 0) return;

        const person = this.people[this.grabbedPersonIndex];

        let vx = 0, vy = 0;
        if (this._cursorHistory.length >= 2) {
            const first = this._cursorHistory[0];
            const last = this._cursorHistory[this._cursorHistory.length - 1];
            const dt = last.t - first.t;
            if (dt > CROWD_CONFIG.minDtForVelocity) {
                vx = (last.x - first.x) / dt;
                vy = (last.y - first.y) / dt;
            }
        }

        const maxSpeedX = CROWD_CONFIG.maxThrowSpeedX;
        const maxSpeedY = CROWD_CONFIG.maxThrowSpeedY;
        vx = Math.max(-maxSpeedX, Math.min(maxSpeedX, vx));
        vy = Math.max(-maxSpeedY, Math.min(maxSpeedY, vy));

        person.vx = vx;
        person.vy = vy;
        person.bounceCount = 0;
        person.state = 'falling';

        this.grabbedPersonIndex = -1;
        this._cursorHistory = [];
    }

    dispose() {
        if (this.instancedGroup) {
            this.renderer.removeInstancedGroup(this.instancedGroup);
        }
        this.instancedGroup = null;
        this.people = [];
    }
}

export default Crowd;
