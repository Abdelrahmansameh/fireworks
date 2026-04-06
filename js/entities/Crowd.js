import { GAME_BOUNDS, CROWD_CONFIG, CROWD_CATCHER_CONFIG, PARTICLE_TYPES } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { createRng } from '../utils/random.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances } from '../animation/SkeletonAnimator.js';

class Crowd {
    constructor(renderer2D) {
        this.renderer = renderer2D;
        this.people = [];
        this.missingCrowdsToInit = 0;

        this.instancedGroup = null;

        // Generic animation system
        /** @type {SkeletonData|null} */
        this._skeleton = null;
        /** @type {AnimationData|null} */
        this._animData = null;

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

        this.goldPerCoinToss = 1;
        this.onCoinDrop = null;
        
        this._propCache = new Map();
        this.maxPropParts = 0;
        this.totalPartsPerPerson = 1;

        this._initializeCrowd();
    }

    async _initializeCrowd() {
        try {
            // Load skeleton + animations via the generic animation system
            const { skeleton, rawAnimations } = await SkeletonData.load('assets/skeletons/crowd.json');
            this._skeleton = skeleton;
            this._animData = new AnimationData(rawAnimations);
        } catch (e) {
            console.warn('crowd skeleton failed to load, using minimal fallback:', e);
            // Minimal single-part fallback so the game still runs
            this._skeleton = new SkeletonData([
                { id: 'body', parentId: null, width: 10, height: 10, anchorX: 0, anchorY: 0, relX: 0, relY: 0, color: '000000' }
            ]);
            this._animData = new AnimationData({
                cheering: { duration: 1, loop: true, tracks: {} },
                walking: { duration: 1, loop: true, tracks: {} },
                falling: { duration: 1, loop: true, tracks: {} },
                toss_coin: { duration: 0.8, loop: false, tracks: {} }
            });
        }

        // Initialize props
        const uniquePropUrls = new Set();
        for (const clip of this._animData.clips.values()) {
            if (clip.props) {
                for (const prop of clip.props) {
                    if (prop.skeletonUrl) uniquePropUrls.add(prop.skeletonUrl);
                }
            }
        }

        for (const url of uniquePropUrls) {
            try {
                const { skeleton, rawAnimations } = await SkeletonData.load(url);
                this._propCache.set(url, {
                    skeleton,
                    animData: new AnimationData(rawAnimations)
                });
            } catch (e) {
                console.warn('Failed to load prop skeleton:', url, e);
            }
        }

        for (const clip of this._animData.clips.values()) {
            let sum = 0;
            if (clip.props) {
                for (const prop of clip.props) {
                    const cached = this._propCache.get(prop.skeletonUrl);
                    if (cached) sum += cached.skeleton.partCount;
                }
            }
            this.maxPropParts = Math.max(this.maxPropParts, sum);
        }

        this.totalPartsPerPerson = this._skeleton.partCount + this.maxPropParts;

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
            console.log(`Crowd initialized: ${this._skeleton.partCount} main parts + max ${this.maxPropParts} prop parts. Max ${CROWD_CONFIG.maxInstances} total instances.`);
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
                this.instancedGroup.instanceCount -= this.totalPartsPerPerson;
            }
        } else {
            const added = count - this.people.length;
            for (let i = 0; i < added; i++) {
                this._addPerson();
            }
        }

        this._reorderInstancesByY();
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
            animTimer: rng() * Math.PI * 2,
            animSpeed: 0.85 + rng() * 0.3,
            state: 'cheering',
            spawnX: x,
            spawnY: y,
            vx: 0,
            vy: 0,
            instanceBaseIndex: group.instanceCount,
            coinTossTimer: rng() * 5,
            coinAnimTimer: 0,
            collected: 0,
            bounceCount: 0,
            flipX: 1,
            // Catapult interaction
            catapultData: null,
        };

        this.people.push(person);

        // Add instances for this person
        for (let i = 0; i < this.totalPartsPerPerson; i++) {
            // Default scale 0 so hidden until explicitly placed
            group.addInstanceRaw(person.x, person.y, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
        }

        this._updateProceduralAnimation(person, 0);

        this._reorderInstancesByY();
    }

    update(deltaTime) {
        if (!this.instancedGroup || this.people.length === 0) return;

        const GRAVITY = CROWD_CONFIG.gravity;
        const FRICTION = CROWD_CONFIG.friction;
        const WALK_SPEED = CROWD_CONFIG.walkSpeed;

        for (let i = 0; i < this.people.length; i++) {
            this._updatePerson(i, deltaTime, GRAVITY, FRICTION, WALK_SPEED);
        }

        for (let i = 0; i < this.people.length; i++) {
            this._updateProceduralAnimation(this.people[i], deltaTime);
        }

        this._scanFrameCounter++;
    }

    _switchToState(personIndex, newState) {
        const person = this.people[personIndex];
        person.state = newState;
        person.bounceCount = 0;
        if (newState === 'cheering') {
            const clip = this._animData ? this._animData.getClip('cheering') : null;
            const baseDur = clip ? clip.duration : 1.0;
            person.animTimer = Math.random() * baseDur * 0.5;
        } else {
            person.animTimer = 0;
        }
        person.coinAnimTimer = 0;
        person.collected = 0;

        if (newState !== 'falling') {
            person.vx = 0;
            person.vy = 0;
        }
    }

    _updatePerson(personIndex, deltaTime, gravity, friction, walkSpeed) {
        const person = this.people[personIndex];

        switch (person.state) {
            case 'cheering': {
                break;
            }
            case 'grabbed': {
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
                    this._switchToState(personIndex, 'cheering');
                } else {
                    person.x += deltaMove;
                }
                break;
            }

            case 'catapult_walk': {
                const catData = person.catapultData;
                if (!catData || !catData.catapult) {
                    person.catapultData = null;
                    this._switchToState(personIndex, 'walking');
                    break;
                }
                const targetX = catData.catapult.approachX;
                const cdx = targetX - person.x;
                person.flipX = cdx >= 0 ? 1 : -1;
                const cDir = Math.sign(cdx);
                const cDeltaMove = cDir * walkSpeed * deltaTime;

                if (Math.abs(cdx) <= Math.abs(cDeltaMove)) {
                    person.x = targetX;
                    this._beginCatapultArc(personIndex);
                } else {
                    person.x += cDeltaMove;
                }
                break;
            }

            case 'catapult_arc': {
                const arcData = person.catapultData;
                if (!arcData || !arcData.catapult) {
                    person.catapultData = null;
                    this._switchToState(personIndex, 'walking');
                    break;
                }
                arcData.arcElapsed += deltaTime;
                const t = Math.min(arcData.arcElapsed / arcData.arcDuration, 1);
                person.x = arcData.arcStartX + (arcData.arcEndX - arcData.arcStartX) * t;
                const linearY = arcData.arcStartY + (arcData.arcEndY - arcData.arcStartY) * t;
                person.y = linearY + arcData.arcHeight * Math.sin(Math.PI * t);

                if (t >= 1.0) {
                    person.x = arcData.arcEndX;
                    person.y = arcData.arcEndY;
                    this._switchToState(personIndex, 'catapult_riding');
                    arcData.catapult.onPersonReachedHead();
                }
                break;
            }

            case 'catapult_riding': {
                const rideData = person.catapultData;
                if (!rideData || !rideData.catapult) {
                    person.catapultData = null;
                    this._switchToState(personIndex, 'falling');
                    break;
                }
                const headPos = rideData.catapult.getHeadWorldPos();
                person.x = headPos.x;
                person.y = headPos.y;
                break;
            }
        }

        person.coinTossTimer += deltaTime;
        if (person.coinTossTimer >= 5 && !person.catapultData) {
            person.coinTossTimer -= 5;
            if (this.onCoinDrop) {
                this.onCoinDrop(this.goldPerCoinToss, 'crowd');
            }
            person.coinAnimTimer = 0.8;
        }

        if (person.coinAnimTimer > 0) {
            person.coinAnimTimer -= deltaTime;
            if (person.coinAnimTimer <= 0) {
                person.coinAnimTimer = 0;
            }
        }
    }

    _getAnimForState(person) {
        if (person.coinAnimTimer > 0) {
            const clip = this._animData.getClip('toss_coin');
            return { clip, time: clip ? clip.duration - person.coinAnimTimer : 0 };
        }

        if (person.state === 'catapult_walk') {
            const clip = this._animData.getClip('walking') ?? null;
            const time = clip ? person.animTimer % clip.duration : 0;
            return { clip, time };
        }
        if (person.state === 'catapult_arc') {
            const clip = this._animData.getClip('jumping') ?? null;
            const elapsed = person.catapultData?.arcElapsed ?? 0;
            const time = clip ? Math.min(elapsed, clip.duration) : 0;
            return { clip, time };
        }
        if (person.state === 'catapult_riding') {
            const clip = this._animData.getClip('jumping') ?? null;
            const time = clip ? clip.duration : 0;
            return { clip, time };
        }

        const name = person.state === 'grabbed' ? 'falling' : person.state;
        const clip = this._animData.getClip(name) ?? null;
        const time = clip
            ? (clip.loop ? person.animTimer % clip.duration : Math.min(person.animTimer, clip.duration))
            : 0;
        return { clip, time };
    }

    // ── Catapult helpers ──────────────────────────────────────────────────────

    _beginCatapultArc(personIndex) {
        const person = this.people[personIndex];
        const catData = person.catapultData;
        if (!catData || !catData.catapult) return;

        const headPos = catData.catapult.getHeadWorldPos();
        const jumpClip = this._animData ? this._animData.getClip('jumping') : null;
        const arcDuration = jumpClip ? jumpClip.duration : 0.6;

        catData.arcStartX = person.x;
        catData.arcStartY = person.y;
        catData.arcEndX = headPos.x;
        catData.arcEndY = headPos.y;
        catData.arcDuration = arcDuration;
        catData.arcElapsed = 0;
        catData.arcHeight = 50; // extra upward arc above the straight line

        person.state = 'catapult_arc';
        person.animTimer = 0;
    }

    /**
     * Ask the crowd for a volunteer to use the catapult.
     * Finds the nearest cheering person and sends them toward the catapult.
     * @param {import('../buildings/Catapult.js').default} catapult
     * @returns {number} person index, or -1 if none available
     */
    assignPersonToCatapult(catapult) {
        let bestIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < this.people.length; i++) {
            const p = this.people[i];
            if (p.state !== 'cheering' || p.catapultData) continue;
            const dx = catapult.approachX - p.x;
            const dy = catapult.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }

        if (bestIdx < 0) return -1;

        const person = this.people[bestIdx];
        person.catapultData = { catapult };
        person.flipX = person.x < catapult.approachX ? 1 : -1;
        this._switchToState(bestIdx, 'catapult_walk');
        catapult.onPersonWalking();
        return bestIdx;
    }

    /**
     * Called by Catapult when it fires — launch the attached person into the air.
     * @param {number} personIndex
     * @param {number} vx
     * @param {number} vy
     */
    launchPersonFromCatapult(personIndex, vx, vy) {
        const person = this.people[personIndex];
        if (!person) 
            return;
        person.catapultData = null;
        person.vx = vx;
        person.vy = vy;
        this._switchToState(personIndex, 'falling');
    }

    _updateProceduralAnimation(person, deltaTime) {
        person.animTimer += deltaTime * person.animSpeed;

        if (!this._skeleton) return;

        const scale = person.scale;
        const flipX = person.state === 'walking' ? (person.spawnX < person.x ? -1 : 1) : person.flipX;

        const { clip, time } = this._getAnimForState(person);

        // Use the generic pose solver
        const pose = computePose(this._skeleton, clip, time);

        const minY = GAME_BOUNDS.CROWD_Y;
        const maxY = GAME_BOUNDS.CROWD_Y + (CROWD_CONFIG.ySpread || 0);
        let t = 0;
        if (maxY !== minY) t = (person.spawnY - minY) / (maxY - minY);
        t = Math.max(0, Math.min(1, t));
        t = 1 - t;

        const scalingCfg = CROWD_CONFIG.scaling;
        const minSize = scalingCfg.minSize;
        const maxSize = scalingCfg.maxSize;
        const ySizeFactor = minSize + (maxSize - minSize) * t;

        const finalScale = scale * ySizeFactor;

        applyPoseToInstances(
            this._skeleton, pose, this.instancedGroup,
            person.instanceBaseIndex,
            person.x, person.y,
            finalScale, flipX
        );

        let propInstanceOffset = this._skeleton.partCount;

        // Render props
        if (clip && clip.props) {
            for (const prop of clip.props) {
                if (time >= prop.startTime && time <= prop.endTime) {
                    const cached = this._propCache.get(prop.skeletonUrl);
                    if (!cached) continue;

                    const pTf = pose.get(prop.parentPartId);
                    if (!pTf) continue;

                    const anchorRot = pTf.rotation;
                    const propRootX = pTf.x + ((prop.offsetX||0) * Math.cos(anchorRot) - (prop.offsetY||0) * Math.sin(anchorRot));
                    const propRootY = pTf.y + ((prop.offsetX||0) * Math.sin(anchorRot) + (prop.offsetY||0) * Math.cos(anchorRot));
                    const propRootRot = anchorRot + (prop.rotation || 0);

                    const propClip = prop.animation ? cached.animData.getClip(prop.animation) : null;
                    const propLocalTime = time - prop.startTime;
                    const propTime = propClip && propClip.loop ? (propLocalTime % propClip.duration) : Math.min(propLocalTime, propClip ? propClip.duration : 0);

                    const propPose = computePose(cached.skeleton, propClip, propTime);
                    
                    const finalPropPose = new Map();
                    for (const [pid, ptf] of propPose.entries()) {
                        const finalX = propRootX + (ptf.x * Math.cos(propRootRot) - ptf.y * Math.sin(propRootRot));
                        const finalY = propRootY + (ptf.x * Math.sin(propRootRot) + ptf.y * Math.cos(propRootRot));
                        const finalRot = propRootRot + ptf.rotation;
                        finalPropPose.set(pid, { x: finalX, y: finalY, rotation: finalRot });
                    }

                    applyPoseToInstances(
                        cached.skeleton, finalPropPose, this.instancedGroup,
                        person.instanceBaseIndex + propInstanceOffset,
                        person.x, person.y,
                        finalScale, flipX
                    );

                    propInstanceOffset += cached.skeleton.partCount;
                }
            }
        }

        // Hide unused preallocated instances
        for (let i = propInstanceOffset; i < this.totalPartsPerPerson; i++) {
            this.instancedGroup.updateInstanceScale(person.instanceBaseIndex + i, 0, 0);
        }
    }

    _reorderInstancesByY() {
        if (!this.instancedGroup || this.people.length === 0) return;

        const group = this.instancedGroup;
        const stride = group.instanceStrideFloats;
        const partCount = this.totalPartsPerPerson;

        const oldData = group.instanceData;
        const newData = new Float32Array(group.maxInstances * stride);

        let newInstanceIndex = 0;

        const sortedPeople = this.people.slice().sort((a, b) => {
            const ay = a.spawnY;
            const by = b.spawnY;
            return by - ay;
        });

        for (const person of sortedPeople) {
            const oldBaseInst = person.instanceBaseIndex;
            if (typeof oldBaseInst !== 'number' || oldBaseInst < 0) {
                person.instanceBaseIndex = newInstanceIndex;
                newInstanceIndex += partCount;
                continue;
            }

            for (let p = 0; p < partCount; p++) {
                const srcBase = (oldBaseInst + p) * stride;
                const dstBase = (newInstanceIndex + p) * stride;
                for (let f = 0; f < stride; f++) {
                    newData[dstBase + f] = oldData[srcBase + f] || 0;
                }
            }

            person.instanceBaseIndex = newInstanceIndex;
            newInstanceIndex += partCount;
        }

        group.instanceData = newData;
        group.instanceCount = newInstanceIndex;
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
            this._switchToState(bestIdx, 'grabbed');
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

        targetX = Math.max(GAME_BOUNDS.SCROLL_MIN_X - 1000, Math.min(GAME_BOUNDS.SCROLL_MAX_X, targetX));

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

        const maxSpeed = CROWD_CONFIG.maxThrowSpeedSquared;
        const speedSquared = vx * vx + vy * vy;
        if (speedSquared > maxSpeed) {
            const speed = Math.sqrt(speedSquared);
            const scale = Math.sqrt(maxSpeed) / speed;
            vx *= scale;
            vy *= scale;
        }

        person.vx = vx;
        person.vy = vy;
        this._switchToState(this.grabbedPersonIndex, 'falling');

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
