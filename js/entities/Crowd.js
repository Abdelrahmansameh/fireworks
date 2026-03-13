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
            console.log(`Crowd initialized procedurally with max ${CROWD_CONFIG.maxInstances} component shapes.`);
        } catch (error) {
            console.error('Failed to init procedural crowd:', error);
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
                // We spawned 11 instances per person; assuming end removal, just reduce count
                this.instancedGroup.instanceCount -= 11;
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

        // Add 11 empty instances for the person
        for (let i = 0; i < 11; i++) {
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

    _updateProceduralAnimation(person, deltaTime) {
        person.animTimer += deltaTime * person.bobSpeed;
        
        const pcfg = CROWD_CONFIG.procedural;
        const scale = person.scale;
        const px = person.x;
        const py = person.y;
        
        const isGrabbed = person.state === 'grabbed';
        const isFalling = person.state === 'falling';
        const isWalking = person.state === 'walking';
        const isCoinToss = person.coinAnimTimer > 0;
        
        let bodyY = py;
        let walkCycle = 0;
        let armAngleL = 0;
        let armAngleR = 0;
        let legAngleL = 0;
        let legAngleR = 0;
        
        let flipX = person.flipX; 
        if (isWalking) {
            flipX = (person.spawnX < person.x) ? -1 : 1;
        }
        
        if (person.state === 'cheering') {
            bodyY = py + Math.sin(person.bobOffset + person.animTimer) * 2;
            armAngleL = Math.PI - 0.2 + Math.sin(person.animTimer * 2) * 0.2;
            armAngleR = Math.PI + 0.2 - Math.sin(person.animTimer * 2.1) * 0.2;
            legAngleL = 0;
            legAngleR = 0;
        } else if (isWalking) {
            walkCycle = person.animTimer * 3;
            bodyY = py + Math.abs(Math.sin(walkCycle)) * 2;
            armAngleL = Math.sin(walkCycle) * 0.5;
            armAngleR = -Math.sin(walkCycle) * 0.5;
            legAngleL = -Math.sin(walkCycle) * 0.5;
            legAngleR = Math.sin(walkCycle) * 0.5;
        } else if (isFalling || isGrabbed) {
            bodyY = py;
            armAngleL = Math.PI - 0.5;
            armAngleR = -Math.PI + 0.5;
            legAngleL = 0.5;
            legAngleR = -0.5;
            
            // Flail slightly
            armAngleL += Math.sin(person.animTimer * 6) * 0.4;
            armAngleR += Math.sin(person.animTimer * 6.2) * 0.4;
            legAngleL += Math.sin(person.animTimer * 5) * 0.3;
            legAngleR += Math.sin(person.animTimer * 5.2) * 0.3;
        }
        
        if (isCoinToss) {
            // Tossing upward right arm
            const tossProgress = 1.0 - (person.coinAnimTimer / 0.8);
            armAngleR = Math.PI - Math.sin(tossProgress * Math.PI) * 1.5; 
        }

        const baseIdx = person.instanceBaseIndex;
        const g = this.instancedGroup;

        let ox, oy, tX, tY;

        // 0: Body
        tX = px;
        tY = bodyY;
        g.updateInstancePosition(baseIdx + 0, tX, tY);
        g.updateInstanceScale(baseIdx + 0, pcfg.bodyWidth * scale, pcfg.bodyHeight * scale);
        g.updateInstanceColor(baseIdx + 0, 0, 0, 0, 1);
        
        // 1: Left arm
        ox = px - pcfg.armOffsetX * scale * flipX;
        oy = bodyY + pcfg.armOffsetY * scale;
        let armL_center = this._getPivotedTransform(ox, oy, 0, pcfg.armHeight * 0.5 * scale, armAngleL * flipX);
        g.updateInstancePosition(baseIdx + 1, armL_center.x, armL_center.y);
        g.updateInstanceScale(baseIdx + 1, pcfg.armWidth * scale, pcfg.armHeight * scale);
        g.updateInstanceRotation(baseIdx + 1, armAngleL * flipX);
        g.updateInstanceColor(baseIdx + 1, 0, 0, 0, 1);
        
        // 2: Right arm
        ox = px + pcfg.armOffsetX * scale * flipX;
        oy = bodyY + pcfg.armOffsetY * scale;
        let armR_center = this._getPivotedTransform(ox, oy, 0, pcfg.armHeight * 0.5 * scale, armAngleR * flipX);
        g.updateInstancePosition(baseIdx + 2, armR_center.x, armR_center.y);
        g.updateInstanceScale(baseIdx + 2, pcfg.armWidth * scale, pcfg.armHeight * scale);
        g.updateInstanceRotation(baseIdx + 2, armAngleR * flipX);
        g.updateInstanceColor(baseIdx + 2, 0, 0, 0, 1);
        
        // 3: Left leg
        ox = px - pcfg.legOffsetX * scale * flipX; // Add flip to leg pos too!
        oy = bodyY + pcfg.legOffsetY * scale;
        let legL_center = this._getPivotedTransform(ox, oy, 0, pcfg.legHeight * 0.5 * scale, legAngleL * flipX);
        g.updateInstancePosition(baseIdx + 3, legL_center.x, legL_center.y);
        g.updateInstanceScale(baseIdx + 3, pcfg.legWidth * scale, pcfg.legHeight * scale);
        g.updateInstanceRotation(baseIdx + 3, legAngleL * flipX);
        g.updateInstanceColor(baseIdx + 3, 0, 0, 0, 1);
        
        // 4: Right leg
        ox = px + pcfg.legOffsetX * scale * flipX;
        oy = bodyY + pcfg.legOffsetY * scale;
        let legR_center = this._getPivotedTransform(ox, oy, 0, pcfg.legHeight * 0.5 * scale, legAngleR * flipX);
        g.updateInstancePosition(baseIdx + 4, legR_center.x, legR_center.y);
        g.updateInstanceScale(baseIdx + 4, pcfg.legWidth * scale, pcfg.legHeight * scale);
        g.updateInstanceRotation(baseIdx + 4, legAngleR * flipX);
        g.updateInstanceColor(baseIdx + 4, 0, 0, 0, 1);
        
        let legBottomOffY = pcfg.legHeight * 0.5 * scale;
        // 5: Left foot
        let legL_bottom = this._getPivotedTransform(legL_center.x, legL_center.y, 0, legBottomOffY, legAngleL * flipX);
        g.updateInstancePosition(baseIdx + 5, legL_bottom.x + pcfg.footOffsetX * scale * flipX, legL_bottom.y + pcfg.footOffsetY * scale);
        g.updateInstanceScale(baseIdx + 5, pcfg.footWidth * scale, pcfg.footHeight * scale);
        g.updateInstanceColor(baseIdx + 5, 0, 0, 0, 1);
        
        // 6: Right foot
        let legR_bottom = this._getPivotedTransform(legR_center.x, legR_center.y, 0, legBottomOffY, legAngleR * flipX);
        g.updateInstancePosition(baseIdx + 6, legR_bottom.x + pcfg.footOffsetX * scale * flipX, legR_bottom.y + pcfg.footOffsetY * scale);
        g.updateInstanceScale(baseIdx + 6, pcfg.footWidth * scale, pcfg.footHeight * scale);
        g.updateInstanceColor(baseIdx + 6, 0, 0, 0, 1);
        
        // 7: Left eye
        ox = px - pcfg.eyeOffsetX * scale * flipX;
        oy = bodyY + pcfg.eyeOffsetY * scale;
        g.updateInstancePosition(baseIdx + 7, ox, oy);
        g.updateInstanceScale(baseIdx + 7, pcfg.eyeSize * scale, pcfg.eyeSize * scale);
        g.updateInstanceColor(baseIdx + 7, 1, 1, 1, 1);
        
        // 8: Right eye
        ox = px + pcfg.eyeOffsetX * scale * flipX;
        oy = bodyY + pcfg.eyeOffsetY * scale;
        g.updateInstancePosition(baseIdx + 8, ox, oy);
        g.updateInstanceScale(baseIdx + 8, pcfg.eyeSize * scale, pcfg.eyeSize * scale);
        g.updateInstanceColor(baseIdx + 8, 1, 1, 1, 1);
        
        // Pupils
        let lookX = 0;
        let lookY = 0;
        if (isFalling || isGrabbed) {
            lookY = -1; // Look down in fear
            lookX = 0;
        } else if (isCoinToss) {
            lookY = 1; // Look up at coin
            lookX = 1 * flipX;
        } else {
            // normal look
            lookX = Math.sin(person.animTimer * 0.5) * 0.5;
        }
        
        // 9: Left pupil
        ox = px - pcfg.eyeOffsetX * scale * flipX + lookX * scale;
        oy = bodyY + pcfg.eyeOffsetY * scale + lookY * scale * 0.5;
        g.updateInstancePosition(baseIdx + 9, ox, oy);
        g.updateInstanceScale(baseIdx + 9, pcfg.pupilSize * scale, pcfg.pupilSize * scale);
        g.updateInstanceColor(baseIdx + 9, 0, 0, 0, 1);
        
        // 10: Right pupil
        ox = px + pcfg.eyeOffsetX * scale * flipX + lookX * scale;
        oy = bodyY + pcfg.eyeOffsetY * scale + lookY * scale * 0.5;
        g.updateInstancePosition(baseIdx + 10, ox, oy);
        g.updateInstanceScale(baseIdx + 10, pcfg.pupilSize * scale, pcfg.pupilSize * scale);
        g.updateInstanceColor(baseIdx + 10, 0, 0, 0, 1);
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
