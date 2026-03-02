import { GAME_BOUNDS, CROWD_CONFIG, CROWD_CATCHER_CONFIG, PARTICLE_TYPES } from '../config/config.js';
import { SPRITE_ANIMATIONS } from '../config/spriteAnimations.js';
import * as Renderer2D from '../rendering/Renderer.js';

class Crowd {
    constructor(renderer2D) {
        this.renderer = renderer2D;
        this.people = [];
        this.textureLoaded = false;
        this.missingCrowdsToInit = 0;

        // Multi-sheet support
        // Each entry: { config, instancedGroup }
        this.sheets = [];
        this.useSpriteSheet = false;

        // animName → { sheetIndex, animDef }  built once after sheets load
        this.animToSheet = new Map();

        // Legacy single-group fallback reference (used by _createFallbackCrowd)
        this.instancedGroup = null;

        // Interaction state for grab / drag / drop
        this.grabbedPersonIndex = -1;
        this._grabOffsetX = 0;
        this._grabOffsetY = 0;
        this._cursorHistory = [];      // ring-buffer of {x,y,t}

        // Particle-catching (falling state)
        this.particleSystem = null;        // set by FireworkGame after init
        this.catchingEnabled = false;      // true once crowd_catcher_unlock is purchased
        this.collectionRadius = CROWD_CATCHER_CONFIG.collectionRadius; // synced from game each frame
        /** @type {((amount: number) => void) | null} */
        this.onCatchSparkles = null;       // set by FireworkGame
        this._scanFrameCounter = 0;

        this.goldPerSecondPerPerson = 0.1;
        /** @type {((amount: number, source: string) => void) | null} */
        this.onCoinDrop = null;             // set by FireworkGame

        this._initializeCrowd();
    }

    async _initializeCrowd() {
        try {
            const sheetConfigs = SPRITE_ANIMATIONS.crowd_sheets;

            if (sheetConfigs && sheetConfigs.length > 0) {
                this.useSpriteSheet = true;
                const geometry = Renderer2D.buildTexturedSquare(CROWD_CONFIG.spriteWidth, CROWD_CONFIG.spriteHeight);

                // Load all sprite-sheet textures in parallel
                const texturePromises = sheetConfigs.map((cfg, idx) =>
                    this.renderer.loadTexture(cfg.texture, `crowd_sheet_${idx}`)
                );
                const textures = await Promise.all(texturePromises);

                for (let i = 0; i < sheetConfigs.length; i++) {
                    const cfg = sheetConfigs[i];
                    const groupOpts = {
                        vertices: geometry.vertices,
                        indices: geometry.indices,
                        texCoords: geometry.texCoords,
                        texture: textures[i],
                        maxInstances: CROWD_CONFIG.maxInstances,
                        zIndex: CROWD_CONFIG.zIndex,
                        blendMode: Renderer2D.BlendMode.NORMAL,
                        spriteSheet: {
                            columns: cfg.columns,
                            rows: cfg.rows,
                        },
                    };
                    const group = this.renderer.createInstancedGroup(groupOpts);
                    this.sheets.push({ config: cfg, instancedGroup: group });
                }

                // Legacy alias points to first sheet's group
                this.instancedGroup = this.sheets[0].instancedGroup;

                // Build the animation→sheet lookup map
                this._buildAnimToSheetMap();
            } else {
                // Fallback: single legacy config
                const legacyCfg = SPRITE_ANIMATIONS.crowd_member;
                this.useSpriteSheet = !!legacyCfg;
                const texturePath = this.useSpriteSheet
                    ? legacyCfg.texture
                    : './assets/crowd_member.png';
                const texture = await this.renderer.loadTexture(texturePath, 'crowd_member');
                const geometry = Renderer2D.buildTexturedSquare(CROWD_CONFIG.spriteWidth, CROWD_CONFIG.spriteHeight);

                const groupOpts = {
                    vertices: geometry.vertices,
                    indices: geometry.indices,
                    texCoords: geometry.texCoords,
                    texture: texture,
                    maxInstances: CROWD_CONFIG.maxInstances,
                    zIndex: CROWD_CONFIG.zIndex,
                    blendMode: Renderer2D.BlendMode.NORMAL,
                };
                if (this.useSpriteSheet) {
                    groupOpts.spriteSheet = {
                        columns: legacyCfg.columns,
                        rows: legacyCfg.rows,
                    };
                }
                const group = this.renderer.createInstancedGroup(groupOpts);
                this.sheets.push({ config: legacyCfg, instancedGroup: group });
                this.instancedGroup = group;

                this._buildAnimToSheetMap();
            }

            for (let i = 0; i < this.missingCrowdsToInit; i++) {
                this._addPerson();
            }
            this.textureLoaded = true;
            const sheetNames = this.sheets.map(s => s.config.id || s.config.texture).join(', ');
            console.log(`Crowd loaded ${this.sheets.length} sprite sheet(s): ${sheetNames}`);
        } catch (error) {
            console.error('Failed to load crowd texture:', error);
            this._createFallbackCrowd();
        }
    }

    _createFallbackCrowd() {
        const geometry = Renderer2D.buildCircle(CROWD_CONFIG.fallbackRadius, CROWD_CONFIG.fallbackSegments);

        const group = this.renderer.createInstancedGroup({
            vertices: geometry.vertices,
            indices: geometry.indices,
            maxInstances: CROWD_CONFIG.maxInstances,
            zIndex: CROWD_CONFIG.zIndex,
            blendMode: Renderer2D.BlendMode.NORMAL,
        });

        this.sheets = [{ config: null, instancedGroup: group }];
        this.instancedGroup = group;
        this.useSpriteSheet = false;
        this.textureLoaded = false;
        console.log('Using fallback crowd rendering');
    }

    setCount(count) {
        if (this.sheets.length === 0) {
            this.missingCrowdsToInit = count;
            return;
        }

        if (count === this.people.length) {
            return;
        }

        // Cancel any active grab
        this.grabbedPersonIndex = -1;

        this.people = [];
        for (const sheet of this.sheets) {
            sheet.instancedGroup.instanceCount = 0;
        }

        for (let i = 0; i < count; i++) {
            this._addPerson();
        }
    }

    /**
     * Pick a random sheet index (uniform distribution across all sheets).
     */
    _pickSheetIndex() {
        return Math.floor(Math.random() * this.sheets.length);
    }

    _addPerson() {
        if (this.sheets.length === 0) {
            this.missingCrowdsToInit++;
            return;
        }

        // Pick a random sprite sheet for this person
        const sheetIdx = this._pickSheetIndex();
        const sheet = this.sheets[sheetIdx];
        const spriteConfig = sheet.config;
        const group = sheet.instancedGroup;

        let x;
        let positionFound = false;
        let attempts = 0;
        const maxAttempts = CROWD_CONFIG.maxPlacementAttempts;

        while (!positionFound && attempts < maxAttempts) {
            x = Math.random() * (GAME_BOUNDS.CROWD_RIGHT_X - GAME_BOUNDS.CROWD_LEFT_X) + GAME_BOUNDS.CROWD_LEFT_X;
            let overlapping = false;
            for (let i = 0; i < this.people.length; i++) {
                if (Math.abs(this.people[i].x - x) < CROWD_CONFIG.minOverlapDistance) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) {
                positionFound = true;
            }
            attempts++;
        }

        const y = GAME_BOUNDS.CROWD_Y + Math.random() * CROWD_CONFIG.ySpread;
        const scale = CROWD_CONFIG.baseScale + Math.random() * CROWD_CONFIG.scaleVariance;

        // Animation state — pick the default animation for this sheet
        const defaultAnim = (this.useSpriteSheet && spriteConfig)
            ? (spriteConfig.defaultAnimation || Object.keys(spriteConfig.animations)[0])
            : null;
        const animDef = defaultAnim ? spriteConfig.animations[defaultAnim] : null;

        const person = {
            x: x,
            y: y,
            scale: scale,
            color: new Renderer2D.Color(1, 1, 1, 1),
            bobOffset: Math.random() * Math.PI * 2,
            bobSpeed: 2 + Math.random() * 2,
            // State machine: 'cheering' | 'grabbed' | 'falling' | 'walking'
            state: 'cheering',
            spawnX: x,
            spawnY: y,
            vx: 0,
            vy: 0,
            // Track which sheet / group this person belongs to
            sheetIndex: sheetIdx,
            instanceIndex: group.instanceCount,
            // Animation fields
            animName: defaultAnim,
            animRow: animDef ? animDef.row : 0,
            animFrameCount: animDef ? animDef.frameCount : 1,
            animFrameDuration: animDef ? animDef.frameDuration : 1,
            animLoop: animDef ? animDef.loop : true,
            animTimer: Math.random() * (animDef ? animDef.frameDuration * animDef.frameCount : 1),
            animFrame: 0,
            // Gold accumulation — fills up to 1.0 then drops a coin
            goldAccumulator: Math.random(),  // stagger so coins don't all drop at once
            // Coin-toss animation: countdown timer; when > 0 the toss_coin anim plays
            coinAnimTimer: 0,
            // Particle catching (used when state === 'falling' and catching is enabled)
            collected: 0,
            // Ground-bounce counter — reset each time the person enters 'falling'
            bounceCount: 0,
        };

        // Compute initial absolute frame index
        if (this.useSpriteSheet && animDef && spriteConfig) {
            person.animFrame = Math.floor(person.animTimer / person.animFrameDuration) % person.animFrameCount;
        }
        const frameIndex = (this.useSpriteSheet && spriteConfig)
            ? person.animRow * spriteConfig.columns + person.animFrame
            : 0;

        this.people.push(person);

        group.addInstance(
            new Renderer2D.Vector2(person.x, person.y),
            0,
            new Renderer2D.Vector2(person.scale, person.scale),
            person.color,
            0,  // glowStrength
            0,  // blurStrength
            frameIndex
        );

        // Ensure every person starts with the 'cheer' animation regardless of
        // which sprite-sheet they were randomly assigned to.
        if (this.useSpriteSheet && this.animToSheet.has('cheer')) {
            this.setAnimation(this.people.length - 1, 'cheer');
        }
    }

    /**
     * Build a map from every known animation name to the sheet that owns it.
     * If multiple sheets define the same name, the first one wins.
     */
    _buildAnimToSheetMap() {
        this.animToSheet.clear();
        for (let si = 0; si < this.sheets.length; si++) {
            const cfg = this.sheets[si].config;
            if (!cfg || !cfg.animations) continue;
            for (const animName of Object.keys(cfg.animations)) {
                if (!this.animToSheet.has(animName)) {
                    this.animToSheet.set(animName, {
                        sheetIndex: si,
                        animDef: cfg.animations[animName],
                    });
                }
            }
        }
    }

    /**
     * Switch a person's animation by name (e.g. 'idle', 'cheer', 'falling', …).
     * The correct sprite sheet is resolved automatically — if the animation
     * lives on a different sheet the person is transparently moved there.
     *
     * @param {number} personIndex — index into this.people[]
     * @param {string} animName — any animation name across all loaded sheets
     */
    setAnimation(personIndex, animName) {
        if (!this.useSpriteSheet) return;
        if (personIndex < 0 || personIndex >= this.people.length) return;

        const entry = this.animToSheet.get(animName);
        if (!entry) {
            console.warn(`Crowd.setAnimation: unknown animation "${animName}"`);
            return;
        }

        const person = this.people[personIndex];
        if (person.animName === animName) return; // already playing

        const { sheetIndex: targetSheetIdx, animDef } = entry;

        // If the person needs to move to a different instanced group
        if (targetSheetIdx !== person.sheetIndex) {
            this._movePersonToSheet(personIndex, targetSheetIdx);
        }

        // Apply animation state
        person.animName = animName;
        person.animRow = animDef.row;
        person.animFrameCount = animDef.frameCount;
        person.animFrameDuration = animDef.frameDuration;
        person.animLoop = animDef.loop;
        person.animTimer = 0;
        person.animFrame = 0;

        // Push the first frame immediately so the GPU has the right UV
        const spriteConfig = this.sheets[person.sheetIndex].config;
        const absoluteFrame = person.animRow * spriteConfig.columns + person.animFrame;
        this.sheets[person.sheetIndex].instancedGroup
            .updateInstanceFrame(person.instanceIndex, absoluteFrame);
    }

    /**
     * Move a person's instance from its current sheet's instanced group to
     * a different one.  Handles the swap-with-last bookkeeping.
     * @private
     */
    _movePersonToSheet(personIndex, newSheetIdx) {
        const person = this.people[personIndex];
        const oldSheetIdx = person.sheetIndex;
        const oldGroup = this.sheets[oldSheetIdx].instancedGroup;
        const newGroup = this.sheets[newSheetIdx].instancedGroup;

        // --- Remove from old group (swap-with-last) ---
        const removedIdx = person.instanceIndex;
        const lastIdx = oldGroup.instanceCount - 1;

        oldGroup.removeInstance(removedIdx);

        // If the removed instance wasn't already the last one, the last
        // instance was swapped into removedIdx.  Find that person and
        // update their instanceIndex.
        if (removedIdx !== lastIdx) {
            for (let i = 0; i < this.people.length; i++) {
                const other = this.people[i];
                if (i !== personIndex
                    && other.sheetIndex === oldSheetIdx
                    && other.instanceIndex === lastIdx) {
                    other.instanceIndex = removedIdx;
                    break;
                }
            }
        }

        // --- Add to new group ---
        const frameIndex = 0; // will be set properly by the caller right after
        const newInstanceIdx = newGroup.instanceCount;

        newGroup.addInstance(
            new Renderer2D.Vector2(person.x, person.y),
            0,
            new Renderer2D.Vector2(person.scale, person.scale),
            person.color,
            0,
            0,
            frameIndex
        );

        person.sheetIndex = newSheetIdx;
        person.instanceIndex = newInstanceIdx;
    }

    /**
     * Switch ALL crowd members to a given animation.
     * Automatically resolves the correct sheet for each person.
     */
    setAllAnimation(animName) {
        for (let i = 0; i < this.people.length; i++) {
            this.setAnimation(i, animName);
        }
    }

    update(deltaTime) {
        if (this.sheets.length === 0 || this.people.length === 0) return;

        const GRAVITY = CROWD_CONFIG.gravity;
        const FRICTION = CROWD_CONFIG.friction;
        const WALK_SPEED = CROWD_CONFIG.walkSpeed;

        // Gold accumulation — each person fills up independently
        const goldRate = this.goldPerSecondPerPerson;
        const tossCoinDef = this.animToSheet.get('toss_coin');
        const tossCoinDuration = tossCoinDef
            ? tossCoinDef.animDef.frameDuration * tossCoinDef.animDef.frameCount
            : 0;

        for (let i = 0; i < this.people.length; i++) {
            this._updatePerson(
                i,
                deltaTime,
                GRAVITY,
                FRICTION,
                WALK_SPEED,
                goldRate,
                tossCoinDef,
                tossCoinDuration
            );
        }

        this._scanFrameCounter++;
    }


    _switchToState(personIndex, newState) {
        const person = this.people[personIndex];
        person.state = newState;
        person.bounceCount = 0;
        this.setAnimation(personIndex, this._getAnimForState(newState));
    }

    _getAnimForState(state) {
        switch (state) {
            case 'cheering': return 'cheer';
            case 'walking': return 'walking_right';
            case 'falling': return 'falling';
            case 'grabbed': return 'falling';
            default: return null;
        }
    }

    _updatePerson(personIndex, deltaTime, gravity, friction, walkSpeed, goldRate, tossCoinDef, tossCoinDuration) {
        const person = this.people[personIndex];

        // ── state machine ──────────────────────────────────────
        switch (person.state) {
            case 'cheering': {
                // Gentle fixed-phase bob (original behaviour)
                const bobY = person.y + Math.sin(person.bobOffset) * 2;
                this.sheets[person.sheetIndex].instancedGroup
                    .updateInstancePosition(person.instanceIndex, person.x, bobY);
                break;
            }

            case 'grabbed': {
                // Position is driven by _onPointerMove — just push to GPU
                this.sheets[person.sheetIndex].instancedGroup
                    .updateInstancePosition(person.instanceIndex, person.x, person.y);
                break;
            }

            case 'falling': {
                if (this.catchingEnabled
                    && this.particleSystem
                    && (this._scanFrameCounter % CROWD_CATCHER_CONFIG.scanInterval) === 0) {
                    this._scanParticlesForPerson(person);
                }

                // Projectile kinematics with air friction
                const decay = Math.exp(-friction * deltaTime);
                person.vx *= decay;
                person.vy -= gravity * deltaTime;
                person.x += person.vx * deltaTime;
                person.y += person.vy * deltaTime;

                // Bounce off left / right world boundaries
                if (person.x < GAME_BOUNDS.SCROLL_MIN_X - CROWD_CONFIG.wallBounceBuffer) {
                    person.x = GAME_BOUNDS.SCROLL_MIN_X - CROWD_CONFIG.wallBounceBuffer;
                    person.vx = Math.abs(person.vx) * CROWD_CONFIG.wallBounce;
                } else if (person.x > GAME_BOUNDS.SCROLL_MAX_X + CROWD_CONFIG.wallBounceBuffer) {
                    person.x = GAME_BOUNDS.SCROLL_MAX_X + CROWD_CONFIG.wallBounceBuffer;
                    person.vx = -Math.abs(person.vx) * CROWD_CONFIG.wallBounce;
                }

                // Hit the ground?
                if (person.y <= person.spawnY) {
                    person.y = person.spawnY;

                    if (person.bounceCount < CROWD_CONFIG.groundBounceCount) {
                        // Still bouncing — reflect and dampen vertical velocity
                        person.vy = Math.abs(person.vy) * CROWD_CONFIG.groundBounceDamping;
                        person.bounceCount++;
                    } else {
                        // Final landing contact
                        person.vy = 0;
                        person.vx = 0;
                        person.collected = 0;

                        const distToSpawn = Math.abs(person.x - person.spawnX);
                        if (distToSpawn < CROWD_CONFIG.landingSnapDistance) {
                            // Close enough — resume cheering
                            person.x = person.spawnX;
                            this._switchToState(personIndex, 'cheering');
                            this.sheets[person.sheetIndex].instancedGroup
                                .updateInstanceScale(person.instanceIndex,
                                    person.scale, person.scale);
                        } else {
                            // Walk back to spawn spot
                            this._switchToState(personIndex, 'walking');
                            const walkingLeft = person.spawnX < person.x;
                            const sx = walkingLeft ? -person.scale : person.scale;
                            this.sheets[person.sheetIndex].instancedGroup
                                .updateInstanceScale(person.instanceIndex,
                                    sx, person.scale);
                        }
                    }
                }

                this.sheets[person.sheetIndex].instancedGroup
                    .updateInstancePosition(person.instanceIndex, person.x, person.y);
                break;
            }

            case 'walking': {
                const dx = person.spawnX - person.x;
                const dir = Math.sign(dx);
                person.x += dir * walkSpeed * deltaTime;

                if (Math.abs(person.x - person.spawnX) < CROWD_CONFIG.walkArrivalDistance) {
                    person.x = person.spawnX;
                    person.state = 'cheering';
                    this.setAnimation(personIndex, 'cheer');
                    // Restore un-flipped scale
                    this.sheets[person.sheetIndex].instancedGroup
                        .updateInstanceScale(person.instanceIndex,
                            person.scale, person.scale);
                }

                this.sheets[person.sheetIndex].instancedGroup
                    .updateInstancePosition(person.instanceIndex, person.x, person.y);
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
            // Play toss_coin animation for one full cycle
            if (tossCoinDef) {
                person.coinAnimTimer = tossCoinDuration;
                this.setAnimation(personIndex, 'toss_coin');
            }
        }

        // Count down the coin-toss animation and restore previous anim
        if (person.coinAnimTimer > 0) {
            person.coinAnimTimer -= deltaTime;
            if (person.coinAnimTimer <= 0) {
                person.coinAnimTimer = 0;
                this.setAnimation(personIndex, this._getAnimForState(person.state));
            }
        }

        // ── sprite-sheet animation tick (every state) ──────────
        const spriteConfig = this.sheets[person.sheetIndex].config;
        if (this.useSpriteSheet && spriteConfig) {
            person.animTimer += deltaTime;
            const totalDuration = person.animFrameDuration * person.animFrameCount;

            if (person.animTimer >= totalDuration) {
                if (person.animLoop) {
                    person.animTimer %= totalDuration;
                } else {
                    person.animTimer = totalDuration - 0.001;
                }
            }

            const newFrame = Math.min(
                Math.floor(person.animTimer / person.animFrameDuration),
                person.animFrameCount - 1
            );

            if (newFrame !== person.animFrame) {
                person.animFrame = newFrame;
                const absoluteFrame = person.animRow * spriteConfig.columns + person.animFrame;
                this.sheets[person.sheetIndex].instancedGroup
                    .updateInstanceFrame(person.instanceIndex, absoluteFrame);
            }
        }
    }

    /**
     * Scan nearby FIREWORK_EXPLOSION particles and install pull closures toward
     * this crowd member — mirrors the drone collection mechanic.
     * Sparkles are awarded immediately on each particle arrival via onCatchSparkles.
     * @private
     */
    _scanParticlesForPerson(person) {
        const ps = this.particleSystem;
        const cfg = CROWD_CATCHER_CONFIG;
        const radius = this.collectionRadius;
        const onCatch = this.onCatchSparkles;
        const personRef = person; // captured by pull closure

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

                // Only collect firework-explosion particles
                if (sd[pBase + pTypeIdx] !== PARTICLE_TYPES.FIREWORK_EXPLOSION) continue;

                // Skip particles that haven't been alive long enough
                const pAge = sd[pBase + ps.initialLifetimeIdx] - sd[pBase + ps.lifetimeIdx];
                if (pAge < cfg.minParticleAge) continue;

                // Fast AABB rejection
                const pdx = sd[pBase + pPosIdx] - personRef.x;
                if (pdx > radius || pdx < -radius) continue;
                const pdy = sd[pBase + pPosIdx + 1] - personRef.y;
                if (pdy > radius || pdy < -radius) continue;

                const existingFn = updateFns[pi];
                if (existingFn && (existingFn._isDronePull || existingFn._isCrowdPull)) continue;

                // Build pull closure — captures personRef (live object)
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

                    // Accelerate particle toward crowd member
                    const eInv = 1 / eDist;
                    state.velocity.x += ex * eInv * cfg.pullForce * delta;
                    state.velocity.y += ey * eInv * cfg.pullForce * delta;

                    // Shift colour toward warm gold/white (mirrors drone visual)
                    state.color.r += 0.05 * delta;
                    state.color.g += 0.05 * delta;
                    state.color.b += 0.05 * delta;
                };
                pullFn._isCrowdPull = true;

                updateFns[pi] = pullFn;
            }
        }
    }

    // ── Interaction: grab, drag, drop ─────────────────────────────────────
    // Pointer events are handled by UIManager; Crowd exposes these public methods.

    /** Whether a crowd member is currently grabbed. */
    get isGrabbing() {
        return this.grabbedPersonIndex >= 0;
    }

    /**
     * Attempt to grab the closest cheering crowd member near (wx, wy).
     * @param {number} wx  World-space X
     * @param {number} wy  World-space Y
     * @returns {boolean}  true if a person was grabbed
     */
    tryGrab(wx, wy) {
        if (this.grabbedPersonIndex >= 0) return false;   // already dragging

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

            // Keep the grab offset so the sprite doesn't snap its centre
            this._grabOffsetX = person.x - wx;
            this._grabOffsetY = person.y - wy;

            // Visual cue: switch to the falling animation while held
            this.setAnimation(bestIdx, 'falling');

            // Seed velocity history
            this._cursorHistory = [{ x: person.x, y: person.y, t: performance.now() / 1000 }];
            return true;
        }
        return false;
    }

    /**
     * Move the currently-grabbed person to the given world position.
     * @param {number} wx  World-space X (raw cursor position)
     * @param {number} wy  World-space Y (raw cursor position)
     */
    dragTo(wx, wy) {
        if (this.grabbedPersonIndex < 0) return;

        let targetX = wx + this._grabOffsetX;
        const targetY = wy + this._grabOffsetY;

        // Clamp drag position to world boundaries
        targetX = Math.max(GAME_BOUNDS.SCROLL_MIN_X, Math.min(GAME_BOUNDS.SCROLL_MAX_X, targetX));

        const person = this.people[this.grabbedPersonIndex];
        person.x = targetX;
        person.y = targetY;

        // Record position for launch-velocity calculation
        const now = performance.now() / 1000;
        this._cursorHistory.push({ x: targetX, y: targetY, t: now });
        if (this._cursorHistory.length > CROWD_CONFIG.cursorHistorySize) this._cursorHistory.shift();
    }

    /**
     * Release the currently-grabbed person, imparting throw velocity.
     */
    release() {
        if (this.grabbedPersonIndex < 0) return;

        const person = this.people[this.grabbedPersonIndex];

        // Derive launch velocity from recent cursor history
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

        // Clamp to a sane maximum
        const maxSpeedX = CROWD_CONFIG.maxThrowSpeedX;
        const maxSpeedY = CROWD_CONFIG.maxThrowSpeedY;
        vx = Math.max(-maxSpeedX, Math.min(maxSpeedX, vx));
        vy = Math.max(-maxSpeedY, Math.min(maxSpeedY, vy));

        person.vx = vx;
        person.vy = vy;
        person.bounceCount = 0;     // reset bounce counter for fresh throw
        person.state = 'falling';   // animation is already 'falling' from grab

        this.grabbedPersonIndex = -1;
        this._cursorHistory = [];
    }

    _hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return { r, g, b };
    }

    dispose() {
        for (const sheet of this.sheets) {
            if (sheet.instancedGroup) {
                this.renderer.removeInstancedGroup(sheet.instancedGroup);
            }
        }
        this.sheets = [];
        this.instancedGroup = null;
        this.people = [];
    }
}

export default Crowd;
