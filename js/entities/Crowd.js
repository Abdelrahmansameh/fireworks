import { GAME_BOUNDS, CROWD_CONFIG, CROWD_CATCHER_CONFIG, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { createRng } from '../utils/random.js';

class Crowd {
    constructor(renderer2D) {
        this.renderer = renderer2D;
        this.people = [];
        this.missingCrowdsToInit = 0;

        this.instancedGroup = null;

        // Interaction state for grab / drag / drop
        this.grabbedPersonIndex = -1;
        this._grabOffsetX = 0;
        this._grabOffsetY = 0;
        this._cursorHistory = [];

        // Mesh Data
        this.meshData = null;
        this.baseInstancesPerPerson = 0;

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
            // Load JSON Mesh
            const response = await fetch('assets/crowd_mesh.json');
            this.meshData = await response.json();
            this.baseInstancesPerPerson = this.meshData.parts.length;
            
            // Procedural rendering geometric setup: just a uniform textured square
            const geometry = Renderer2D.buildTexturedSquare(1, 1);
            
            const groupOpts = {
                vertices: geometry.vertices,
                indices: geometry.indices,
                texCoords: geometry.texCoords, 
                texture: null,
                maxInstances: CROWD_CONFIG.maxInstances,
                zIndex: CROWD_CONFIG.zIndex,
                blendMode: Renderer2D.BlendMode.NORMAL,
            };
            
            this.instancedGroup = this.renderer.createInstancedGroup(groupOpts);

            for (let i = 0; i < this.missingCrowdsToInit; i++) {
                this._addPerson();
            }
            console.log(`Crowd initialized with ${this.baseInstancesPerPerson} parts per person.`);
        } catch (error) {
            console.error('Failed to init procedural crowd mesh:', error);
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
                this.instancedGroup.instanceCount -= this.baseInstancesPerPerson;
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
            bobOffset: rng() * Math.PI * 2,
            bobSpeed: 2 + rng() * 2,
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
            animTimer: rng() * Math.PI * 2, // arbitrary start for animation offsets
            flipX: rng() > 0.5 ? 1 : -1,
        };

        this.people.push(person);

        // Add correct number of empty instances for the person
        for (let i = 0; i < this.baseInstancesPerPerson; i++) {
            group.addInstanceRaw(person.x, person.y, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0);
        }

        // Initialize transformation visually once
        this._updateProceduralAnimation(person, 0);
    }

    setAnimation(personIndex, animName) {
        if (personIndex < 0 || personIndex >= this.people.length) return;
        
        const person = this.people[personIndex];
        
        // Translate animation requested by name into a state for the JSON hierarchy
        // The procedural system mapped these to state string which influenced the sine wave output.
        // We will keep the state string, and map it to the animation key `person.currentAnimation`
        
        if (animName === 'toss_coin') {
            person.coinAnimTimer = 0.8; 
            person.state = 'toss_coin';
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
        if(newState !== 'grabbed') {
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
    
    _getPivotedTransform(anchorX, anchorY, pivotOffsetX, pivotOffsetY, angleRads) {
        const cosA = Math.cos(angleRads);
        const sinA = Math.sin(angleRads);
        
        const rotX = pivotOffsetX * cosA - pivotOffsetY * sinA;
        const rotY = pivotOffsetX * sinA + pivotOffsetY * cosA;
        
        return {
            x: anchorX - rotX,
            y: anchorY - rotY
        };
    }

    _getParentTransform(part, time, personState, flipX, baseScale, px, py, parentObjTf = null) {
        let parentTransform = { x: px, y: py, rotation: 0 };
        if (part.parentId && !parentObjTf) {
            const pObj = this.meshData.parts.find(p => p.id === part.parentId);
            if (pObj) {
                parentTransform = this._getParentTransform(pObj, time, personState, flipX, baseScale, px, py);
            }
        } else if (parentObjTf) {
            parentTransform = parentObjTf;
        }

        let localRot = 0;
        let localOffX = 0;
        let localOffY = 0;

        // Fetch Track
        const anim = this.meshData.animations[personState];
        if (anim && anim.tracks[part.id] && anim.tracks[part.id].length > 0) {
            const track = anim.tracks[part.id];
            
            // Loop time based on anim duration
            let evalTime = time;
            if (anim.loop && anim.duration > 0) evalTime = evalTime % anim.duration;
            else if (evalTime > anim.duration) evalTime = anim.duration;
            
            if (evalTime <= track[0].time) {
                localRot = track[0].rotation || 0;
                localOffX = track[0].offsetX || 0;
                localOffY = track[0].offsetY || 0;
            } else if (evalTime >= track[track.length - 1].time) {
                localRot = track[track.length-1].rotation || 0;
                localOffX = track[track.length-1].offsetX || 0;
                localOffY = track[track.length-1].offsetY || 0;
            } else {
                for (let i = 0; i < track.length - 1; i++) {
                    if (evalTime >= track[i].time && evalTime <= track[i+1].time) {
                        const t0 = track[i];
                        const t1 = track[i+1];
                        const ratio = (evalTime - t0.time) / ((t1.time - t0.time) || 0.001);
                        localRot = (t0.rotation||0) + ((t1.rotation||0) - (t0.rotation||0)) * ratio;
                        localOffX = (t0.offsetX||0) + ((t1.offsetX||0) - (t0.offsetX||0)) * ratio;
                        localOffY = (t0.offsetY||0) + ((t1.offsetY||0) - (t0.offsetY||0)) * ratio;
                        break;
                    }
                }
            }
        }

        let parentW = 0, parentH = 0;
        if (part.parentId) {
            const pObj = this.meshData.parts.find(p => p.id === part.parentId);
            if (pObj) { parentW = pObj.width; parentH = pObj.height; }
        }

        let pivotLocalX = part.relX * parentW * baseScale * flipX;
        let pivotLocalY = part.relY * parentH * baseScale;

        const cosP = Math.cos(parentTransform.rotation);
        const sinP = Math.sin(parentTransform.rotation);
        let pivotWorldX = parentTransform.x + (pivotLocalX * cosP - pivotLocalY * sinP);
        let pivotWorldY = parentTransform.y + (pivotLocalX * sinP + pivotLocalY * cosP);

        // Apply flip direction
        pivotWorldX += (localOffX * baseScale * flipX * cosP - localOffY * baseScale * sinP);
        pivotWorldY += (localOffX * baseScale * flipX * sinP + localOffY * baseScale * cosP);

        const worldRot = parentTransform.rotation + (localRot * flipX);

        return { x: pivotWorldX, y: pivotWorldY, rotation: worldRot };
    }

    _hexToRgb(hex) {
        if (!hex) return { r: 1, g: 1, b: 1 };
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if(result) {
            return {
                r: parseInt(result[1], 16) / 255,
                g: parseInt(result[2], 16) / 255,
                b: parseInt(result[3], 16) / 255
            };
        }
        return {r:1, g:1, b:1};
    }

    _updateProceduralAnimation(person, deltaTime) {
        if (!this.meshData) return;
        
        person.animTimer += deltaTime * person.bobSpeed;
        
        const scale = person.scale;
        const px = person.x;
        const py = person.y;
        
        let flipX = person.flipX; 
        if (person.state === 'walking') {
            flipX = (person.spawnX < person.x) ? -1 : 1;
        }

        const baseIdx = person.instanceBaseIndex;
        const g = this.instancedGroup;

        // Memoize transforms for parents to avoid O(n^2) recursion
        const tfCache = {};

        // Important: this assumes meshData.parts is topologically sorted (parents before children)
        // Which the manual initialization ensures!
        for (let i = 0; i < this.meshData.parts.length; i++) {
            const part = this.meshData.parts[i];
            
            let pTf = null;
            if (part.parentId && tfCache[part.parentId]) {
                pTf = tfCache[part.parentId];
            }
            
            const tf = this._getParentTransform(part, person.animTimer, person.state, flipX, scale, px, py, pTf);
            tfCache[part.id] = tf;

            const anchorOffX = part.anchorX * part.width * scale * flipX;
            const anchorOffY = part.anchorY * part.height * scale;
            
            const cosR = Math.cos(tf.rotation);
            const sinR = Math.sin(tf.rotation);
            
            const drawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
            const drawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

            const color = this._hexToRgb(part.color);

            g.updateInstancePosition(baseIdx + i, drawX, drawY);
            g.updateInstanceScale(baseIdx + i, part.width * scale, part.height * scale);
            g.updateInstanceRotation(baseIdx + i, tf.rotation);
            g.updateInstanceColor(baseIdx + i, color.r, color.g, color.b, 1);
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
