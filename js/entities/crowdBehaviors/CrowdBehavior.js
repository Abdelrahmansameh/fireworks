import { Vector2, Color } from '../../rendering/Renderer.js';
import { FLYER_CONFIG as cfg, CULTIST_CONFIG, MINER_CONFIG, CROWD_CONFIG, GAME_BOUNDS as bounds, PARTICLE_TYPES } from '../../config/config.js';
import { MAX_SPARKLES_PER_RITUAL } from '../../config/CultistRitual.js';

// Behaviors own optional per-person state and can replace the ordinary crowd update.
export class CrowdBehavior {
    constructor(crowd, person) { this.crowd = crowd; this.person = person; this.active = true; }
    update() {}
    dispose() { this.active = false; }
}

const rand = ([min, max]) => min + Math.random() * (max - min);
const pick = list => list[Math.floor(Math.random() * list.length)];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (from, to, maxStep) => wrap(from + Math.max(-maxStep, Math.min(maxStep, wrap(to - from))));
const IDLE_PROPS = CULTIST_CONFIG.props.map(prop => ({ ...prop, animation: null, startTime: 0, endTime: Infinity }));
const RITUAL_PROPS = CULTIST_CONFIG.props.map(prop => ({ ...prop, animation: 'ritual', startTime: 0, endTime: Infinity }));
const ARMS = [['arm_1_l', 'arm_2_l', 'arm_3_l', -1], ['arm_1_r', 'arm_2_r', 'arm_3_r', 1]];

// Flying cultists: they aim both palms away from where they want to go and
// fire a pulse of sparkles that shoves them along. Between pulses they
// free-fall under gravity.
export class FlyerBehavior extends CrowdBehavior {
    constructor(crowd, person) {
        super(crowd, person);
        this.tilt = 0;
        this.phase = 'coast';    // coast -> aim -> pulse -> coast
        this.phaseTimer = 0;
        this.sparkAccumulator = 0;
        this.flash = 0;
        // Arm directions in the person's local, unmirrored frame (0 = +x).
        this.armAngles = [Math.PI - 0.6, 0.6];
        this.aimAngle = -Math.PI / 2;  // world direction the palms fire in
        this.bend = 0.45;
        this.glow = 0;                 // 0..1, eyes tint like a cultist's climax while pulsing
        this.look = { x: 0, y: 0 };    // pupil offset, as a share of the look radius
        person.state = 'fly';
        // Fly in mid-air from just past the left edge of the screen.
        const view = crowd.renderer?.getVisibleWorldBounds?.();
        const band = bounds.WORLD_MAX_EXPLOSION_Y - bounds.WORLD_MIN_EXPLOSION_Y;
        const [low, high] = cfg.entryHeight;
        // The view can be unsized while a save loads, so fall back to the show edge.
        const left = Number.isFinite(view?.left) ? view.left - cfg.entryMargin : bounds.LAUNCHER_MIN_X;
        person.x = Math.min(left, bounds.LAUNCHER_MIN_X);
        person.y = bounds.WORLD_MIN_EXPLOSION_Y + band * (low + Math.random() * (high - low));
        person.vx = cfg.wanderSpeed; person.vy = 0;
        person.flipX = 1;
        this.entering = true;
        this.tx = bounds.LAUNCHER_MIN_X + Math.random() * (bounds.LAUNCHER_MAX_X - bounds.LAUNCHER_MIN_X) * 0.5;
        this.ty = person.y;
        this.timer = Infinity;
    }
    get props() { return IDLE_PROPS; }
    get speedMultiplier() { return this.crowd.flyerStats?.speedMultiplier ?? 1; }
    update(dt) {
        const p = this.person;
        this.timer -= dt;
        // Until it reaches the show, an entering fan heads for its first target
        // and may be left of the launcher area.
        if (this.entering && p.x >= bounds.LAUNCHER_MIN_X) { this.entering = false; this.timer = cfg.wanderTargetChangeTime; }
        if (!this.entering && (this.timer <= 0 || Math.hypot(this.tx - p.x, this.ty - p.y) < 80)) {
            this.tx = bounds.LAUNCHER_MIN_X + Math.random() * (bounds.LAUNCHER_MAX_X - bounds.LAUNCHER_MIN_X);
            this.ty = bounds.WORLD_MIN_EXPLOSION_Y + Math.random() * Math.max(0, this.crowd.flyerCeilingY - bounds.WORLD_MIN_EXPLOSION_Y);
            this.timer = cfg.wanderTargetChangeTime + (Math.random() - 0.5) * 1.5;
        }

        // The push a perfect pilot would want: steer toward the desired
        // velocity and hold up against gravity. The palms fire the other way.
        const maxSpeed = cfg.wanderSpeed * this.speedMultiplier;
        let wantX = (this.tx - p.x) * cfg.approachGain, wantY = (this.ty - p.y) * cfg.approachGain;
        const want = Math.hypot(wantX, wantY);
        if (want > maxSpeed) { wantX *= maxSpeed / want; wantY *= maxSpeed / want; }
        const errX = wantX - p.vx, errY = wantY - p.vy;
        // Palms only ever fire downward: to drop, they let gravity do it.
        const minDown = cfg.minAimBelowHorizontal;
        const desiredAim = Math.max(-Math.PI + minDown, Math.min(-minDown,
            Math.atan2(-Math.max(0, errY * cfg.steerGain + cfg.gravity), -errX * cfg.steerGain)));

        this.phaseTimer -= dt;
        if (this.phase === 'coast' && this.phaseTimer <= 0 && Math.hypot(errX, Math.max(0, errY)) > cfg.pulseTrigger) {
            this.phase = 'aim'; this.phaseTimer = cfg.aimTime;
        } else if (this.phase === 'aim' && this.phaseTimer <= 0 && (this.armsOn(desiredAim) || this.phaseTimer < -cfg.maxAimTime)) {
            this.phase = 'pulse'; this.phaseTimer = rand(cfg.pulseDuration);
            this.flash = cfg.flashCount;
        } else if (this.phase === 'pulse' && this.phaseTimer <= 0) {
            this.phase = 'coast'; this.phaseTimer = cfg.minCoast;
        }
        const firing = this.phase === 'pulse';
        if (this.phase !== 'coast') this.aimAngle = desiredAim;

        // The sparkles push back along where the arms are swinging to (before
        // the visual clamp), so they have to turn round before the push lines up.
        let ax = -p.vx * cfg.drag, ay = -p.vy * cfg.drag - cfg.gravity;
        if (firing) {
            const flip = p.flipX || 1, lean = this.tilt * flip;
            let hx = 0, hy = 0;
            for (const angle of this.armAngles) { hx += Math.cos(angle + lean) * flip; hy += Math.sin(angle + lean); }
            const len = Math.hypot(hx, hy) || 1;
            const thrust = cfg.thrust * Math.sqrt(this.speedMultiplier);
            ax -= hx / len * thrust; ay -= hy / len * thrust;
        }
        p.vx += ax * dt; p.vy += ay * dt;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > maxSpeed) { p.vx *= maxSpeed / speed; p.vy *= maxSpeed / speed; }

        const minX = this.entering ? -Infinity : bounds.LAUNCHER_MIN_X;
        p.x = Math.max(minX, Math.min(bounds.LAUNCHER_MAX_X, p.x + p.vx * dt));
        const ceiling = Math.max(bounds.WORLD_LAUNCHER_Y, this.crowd.flyerCeilingY);
        p.y = Math.max(bounds.WORLD_LAUNCHER_Y, Math.min(ceiling, p.y + p.vy * dt));
        if ((p.x === bounds.LAUNCHER_MIN_X && p.vx < 0) || (p.x === bounds.LAUNCHER_MAX_X && p.vx > 0)) p.vx = 0;
        if ((p.y === bounds.WORLD_LAUNCHER_Y && p.vy < 0) || (p.y === ceiling && p.vy > 0)) p.vy = 0;

        // Lean into the push while firing, into the drift otherwise.
        const lean = firing ? Math.cos(this.aimAngle) * 0.35 : -p.vx * 0.0008;
        const targetTilt = Math.max(-0.35, Math.min(0.35, lean));
        this.tilt += (targetTilt - this.tilt) * (1 - Math.exp(-5 * dt));
        if (this.phase === 'coast') {
            if (p.vx > 30) p.flipX = 1; else if (p.vx < -30) p.flipX = -1;
        }
        this.updateArms(dt);
        this.updateLook(dt);
        this.glow += ((firing ? 1 : 0) - this.glow) * (1 - Math.exp(-(firing ? cfg.glowInRate : cfg.glowOutRate) * dt));
        if (firing) this.emitSparks(dt);
        else this.sparkAccumulator = 0;
        if (this.crowd.particleSystem && this.crowd._scanFrameCounter % cfg.scanInterval === 0) this.scan();
    }
    /** Arm targets in the local frame for a world aim, one per arm. */
    armTargets(aim) {
        const p = this.person, flip = p.flipX || 1;
        const local = Math.atan2(Math.sin(aim), Math.cos(aim) * flip) - this.tilt * flip;
        return ARMS.map(([, , , side]) => local + side * 0.1);
    }
    armsOn(aim) {
        return this.armTargets(aim).every((target, i) => Math.abs(wrap(this.armAngles[i] - target)) < cfg.aimTolerance);
    }
    updateArms(dt) {
        const p = this.person;
        const aiming = this.phase !== 'coast';
        const wobble = Math.sin(p.animTimer * 9) * 0.25;
        // Aiming: both palms on the world aim, nudged apart. Coasting: arms
        // flung up and out, flailing as they fall.
        const aimTargets = this.armTargets(this.aimAngle);
        this.armAngles = this.armAngles.map((angle, i) => {
            const side = ARMS[i][3];
            const target = aiming ? aimTargets[i] : (side < 0 ? Math.PI - 0.6 - wobble : 0.6 + wobble);
            return turn(angle, target, (aiming ? cfg.armTurnRate : cfg.armRelaxRate) * dt);
        });
        this.bend += ((aiming ? 0 : 0.45) - this.bend) * (1 - Math.exp(-12 * dt));
    }
    updateLook(dt) {
        // Pupils follow the velocity, in the eye's frame: unmirrored and unleaned.
        const p = this.person, flip = p.flipX || 1, lean = this.tilt * flip;
        const mx = p.vx * flip, my = p.vy;
        const cos = Math.cos(-lean), sin = Math.sin(-lean);
        const reach = Math.min(1, Math.hypot(mx, my) / cfg.lookFullSpeed) / (Math.hypot(mx, my) || 1);
        const k = 1 - Math.exp(-cfg.lookRate * dt);
        this.look.x += ((mx * cos - my * sin) * reach - this.look.x) * k;
        this.look.y += ((mx * sin + my * cos) * reach - this.look.y) * k;
    }
    /** Arm rotations for computePose, assuming the body itself is unrotated. */
    poseOverrides(skeleton) {
        const overrides = new Map();
        ARMS.forEach(([upper, fore, hand, side], i) => {
            // A part at rotation r points along r - PI/2.
            const base = skeleton.getPart(upper).baseRotation || 0;
            // Shoulders turn at most 90 degrees past straight down or up, so an
            // arm never crosses the body: it stops pointing along the body instead.
            let angle = this.armAngles[i];
            if (side * Math.cos(angle) < 0) angle = Math.sin(angle) > 0 ? Math.PI / 2 : -Math.PI / 2;
            overrides.set(upper, { rotation: wrap(angle + Math.PI / 2 - base) });
            overrides.set(fore, { rotation: side * this.bend });
            overrides.set(hand, { rotation: side * this.bend * 0.6 });
        });
        const R = CROWD_CONFIG.pupilLookRadius ?? 0.42;
        for (const pupil of ['pupil_l', 'pupil_r']) overrides.set(pupil, { offsetX: this.look.x * R, offsetY: this.look.y * R });
        const [r, g, b] = cfg.glowColor, k = this.glow;
        for (const eye of ['eye_l', 'eye_r']) {
            overrides.set(eye, { r: 1 + (r - 1) * k, g: 1 + (g - 1) * k, b: 1 + (b - 1) * k, scaleY: 1 + (cfg.glowEyeScale - 1) * k });
        }
        return overrides;
    }
    emitSparks(dt) {
        const ps = this.crowd.particleSystem, p = this.person;
        if (!ps || !p.hands?.length) return;
        this.sparkAccumulator += Math.min(dt, 0.1) * cfg.sparkRate;
        const steady = Math.floor(this.sparkAccumulator);
        this.sparkAccumulator -= steady;
        const count = steady + this.flash;
        this.flash = 0;
        const s = (p.renderScale ?? p.scale) / CROWD_CONFIG.baseScale;
        for (let i = 0; i < count; i++) {
            const hand = p.hands[i % p.hands.length];
            const angle = hand.angle + (Math.random() * 2 - 1) * cfg.sparkSpread;
            const speed = rand(cfg.sparkSpeed);
            const color = pick(cfg.sparkColors);
            ps.addParticle(
                new Vector2(hand.x, hand.y),
                new Vector2(Math.cos(angle) * speed + p.vx * 0.3, Math.sin(angle) * speed + p.vy * 0.3),
                new Color(color[0], color[1], color[2], 0.9),
                rand(cfg.sparkSize) * s, rand(cfg.sparkLifetime), cfg.sparkGravity,
                Math.random() < 0.35 ? 'star' : 'sphere', new Vector2(0, 0), 0, null, false, null, 0, 1,
                PARTICLE_TYPES.TRAIL, 0
            );
        }
    }
    scan() {
        const ps = this.crowd.particleSystem, p = this.person;
        const radius = cfg.collectionRadius * (this.crowd.flyerStats?.collectionRadiusMultiplier ?? 1);
        const grid = this.crowd._flyerGrid;
        if (!grid) return;
        const minX = Math.floor((p.x - radius) / 100), maxX = Math.floor((p.x + radius) / 100);
        const minY = Math.floor((p.y - radius) / 100), maxY = Math.floor((p.y + radius) / 100);
        for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
            for (const [shape, i] of grid.get(`${x},${y}`) || []) {
                const data = ps.instanceData[shape], fns = ps.particleUpdateFns[shape];
                const b = i * ps.strideFloats;
                if (data[b + ps.initialLifetimeIdx] - data[b + ps.lifetimeIdx] < cfg.minParticleAge) continue;
                if (Math.hypot(data[b + ps.positionIdx] - p.x, data[b + ps.positionIdx + 1] - p.y) > radius) continue;
                if (fns[i]?._isFlyerPull || fns[i]?._isCrowdPull) continue;
                const value = data[b + ps.sparkleValueIdx] || 0;
                let elapsed = 0;
                const pull = (state, dt) => {
                    if (!this.active) return;
                    elapsed += dt;
                    const dx = p.x - state.position.x, dy = p.y - state.position.y, dist = Math.hypot(dx, dy);
                    if (dist < cfg.arrivalThreshold || elapsed >= cfg.maxCaptureTime) {
                        this.crowd.onFlyerCollect?.(value * cfg.sparklesPerParticle, 1);
                        state.lifetime = 0; return;
                    }
                    state.alpha = elapsed / cfg.maxCaptureTime; state.scale = elapsed / cfg.maxCaptureTime; state.lifetime = 1;
                    state.velocity.x += dx / dist * cfg.pullForce * dt;
                    state.velocity.y += dy / dist * cfg.pullForce * dt;
                    state.color.r += 0.5 * dt; state.color.g += 0.5 * dt; state.color.b += 0.5 * dt;
                };
                pull._isFlyerPull = true; fns[i] = pull;
            }
        }
    }
}

// A cultist's ritual clip is driven by its own clock in CultistRituals, so
// each climax lands on a payout.
export class CultistBehavior extends CrowdBehavior {
    constructor(crowd, person, index) {
        super(crowd, person);
        this.index = index;
        this.lastPhase = null;
        this.burstLeft = 0;
        this.burstRate = 0;
        this.burstAccumulator = 0;
        this.gatherAccumulator = 0;
    }
    get phase() {
        return this.crowd.cultistRituals?.phase(this.index) ?? 0;
    }
    get clipTime() { return this.person.state === 'ritual' ? this.phase : null; }
    get props() { return this.person.state === 'ritual' ? RITUAL_PROPS : IDLE_PROPS; }
    update(dt) {
        const p = this.person;
        if (p.state === 'walking') {
            const dx = p.spawnX - p.x, step = CROWD_CONFIG.walkSpeed * dt;
            if (Math.abs(dx) > step) { p.x += Math.sign(dx) * step; return; }
            p.x = p.spawnX;
            p.flipX = 1;
            this.crowd._switchToState(this.crowd.people.indexOf(p), 'ritual', CULTIST_CONFIG.walkInBlend);
        }
        if (p.state !== 'ritual') return;
        const phase = this.phase;
        if (this.lastPhase !== null && phase < this.lastPhase - 0.5) this.startBurst();
        this.lastPhase = phase;
        if (!this.crowd.particleSystem) return;
        this.emitBurst(dt);
        this.emitGather(dt, phase);
    }
    startBurst() {
        const c = CULTIST_CONFIG;
        // Upgrades multiply the payout, so step through the range on a log scale.
        const payout = this.crowd.cultistRituals?.payout ?? c.sparklesPerRitual;
        const t = Math.log(payout / c.sparklesPerRitual) / Math.log(MAX_SPARKLES_PER_RITUAL / c.sparklesPerRitual);
        const count = Math.round(c.minBurstCount + (c.maxBurstCount - c.minBurstCount) * Math.min(1, Math.max(0, t || 0)));
        this.burstLeft = Math.max(1, count);
        this.burstRate = this.burstLeft / c.burstDuration;
        this.burstAccumulator = 0;
    }
    emitter() {
        const p = this.person;
        return p.propEmitter ?? { x: p.x, y: p.y };
    }
    spawn(x, y, vx, vy, color, size, lifetime, gravity, shape = 'sphere', updateFn = null, ps = this.crowd.particleSystem) {
        ps.addParticle(
            new Vector2(x, y), new Vector2(vx, vy), new Color(color[0], color[1], color[2], 1),
            size, lifetime, gravity, shape, new Vector2(0, 0), 0, updateFn, false, null, 0, 1,
            PARTICLE_TYPES.CULTIST, 0
        );
    }
    emitBurst(dt) {
        if (this.burstLeft <= 0) return;
        const c = CULTIST_CONFIG, s = this.scale();
        this.burstAccumulator += this.burstRate * Math.min(dt, 0.1);
        const count = Math.min(this.burstLeft, Math.floor(this.burstAccumulator));
        this.burstAccumulator -= count;
        this.burstLeft -= count;
        // Spray out of the raised hands, leaning each fan toward straight up.
        const hands = this.person.hands ?? [{ ...this.emitter(), angle: Math.PI / 2 }];
        for (let i = 0; i < count; i++) {
            const hand = hands[(this.burstLeft + i) % hands.length];
            const angle = hand.angle + (Math.PI / 2 - hand.angle) * c.burstUpwardBias
                + (Math.random() * 2 - 1) * c.burstSpread;
            const speed = rand(c.burstSpeed) * s;
            this.spawn(hand.x, hand.y, Math.cos(angle) * speed, Math.sin(angle) * speed,
                pick(c.burstColors), rand(c.burstSize) * s, rand(c.burstLifetime), c.burstGravity * s,
                Math.random() < 0.45 ? 'star' : 'sphere');
        }
    }
    emitGather(dt, phase) {
        const c = CULTIST_CONFIG;
        if (phase < c.gatherStart || phase > c.gatherEnd) { this.gatherAccumulator = 0; return; }
        // Intensify toward the release.
        const charge = (phase - c.gatherStart) / (c.gatherEnd - c.gatherStart);
        this.gatherAccumulator += c.gatherRate * (0.5 + charge) * Math.min(dt, 0.1);
        const count = Math.floor(this.gatherAccumulator);
        this.gatherAccumulator -= count;
        const s = this.scale(), { x, y } = this.emitter();
        const person = this.person, ps = this.crowd.cultistParticles;
        if (!person.hands || !ps) return;
        for (let i = 0; i < count; i++) {
            // Rise out of the pot and swoop into a hand, homing on where that
            // hand is now so the mote still lands as the hands wiggle.
            const side = (this.gatherCount = (this.gatherCount ?? 0) + 1) % 2;
            const lifetime = rand(c.gatherLifetime);
            const sx = x + (Math.random() * 2 - 1) * c.gatherJitter * s;
            const rise = rand(c.gatherRise) * s;
            let age = 0;
            const homeFn = (state, delta) => {
                const hand = person.hands?.[side];
                if (!hand || delta <= 0) return;
                age += delta;
                const u = Math.min(1, age / lifetime), v = 1 - u;
                // Quadratic curve: pot -> above the pot -> hand.
                const tx = v * v * sx + 2 * u * v * (sx + (hand.x - sx) * c.gatherFan) + u * u * hand.x;
                const ty = v * v * y + 2 * u * v * (y + rise) + u * u * hand.y;
                state.velocity.x = (tx - state.position.x) / delta;
                state.velocity.y = (ty - state.position.y) / delta;
            };
            this.spawn(sx, y, 0, 0, pick(c.gatherColors), rand(c.gatherSize) * s, lifetime, 0,
                Math.random() < 0.3 ? 'star' : 'sphere', homeFn, ps);
        }
    }
    scale() {
        return (this.person.renderScale ?? this.person.scale) / CROWD_CONFIG.baseScale;
    }
}

const MINER_PROPS = MINER_CONFIG.props.map(prop => ({ ...prop, animation: null, startTime: 0, endTime: Infinity }));
const randInt = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));

// Miners climb the mountain to their ledge, then swing at the rock face on
// their own clock in MinerShifts. The 'mine' clip starts on the strike, so
// every wrap of the clock knocks a spray of gold out of the rock.
export class MinerBehavior extends CrowdBehavior {
    constructor(crowd, person, index, spot) {
        super(crowd, person);
        this.index = index;
        this.spot = spot;
        this.lastPhase = null;
        this.tint = MINER_CONFIG.haze;
        person.y = MINER_CONFIG.mine.baseY + this.footLift();
    }
    get phase() {
        return this.crowd.minerShifts?.phase(this.index) ?? 0;
    }
    get clipTime() { return this.person.state === 'mine' ? this.phase : null; }
    get props() { return MINER_PROPS; }
    footLift() {
        return MINER_CONFIG.footOffset * (this.person.renderScale ?? this.person.scale * MINER_CONFIG.scale);
    }
    update(dt) {
        const p = this.person, spot = this.spot;
        if (p.state === 'walking') {
            // Straight up the slope from the mountain's foot to the ledge.
            const tx = spot.x, ty = spot.y + this.footLift();
            const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
            const step = MINER_CONFIG.walkSpeed * dt;
            if (dist > step) { p.x += dx / dist * step; p.y += dy / dist * step; return; }
            p.x = tx; p.y = ty;
            p.flipX = spot.facing;
            this.crowd._switchToState(this.crowd.people.indexOf(p), 'mine', MINER_CONFIG.walkInBlend);
        }
        if (p.state !== 'mine') return;
        p.y = spot.y + this.footLift();
        const phase = this.phase;
        if (this.lastPhase !== null && phase < this.lastPhase - 0.5) this.strike();
        this.lastPhase = phase;
    }
    strike() {
        const ps = this.crowd.minerParticles, tip = this.person.propEmitter;
        if (!ps || !tip) return;
        const c = MINER_CONFIG, s = this.scale(), facing = this.spot.facing;
        // Straight back off the face, leaning up.
        const back = facing > 0 ? Math.PI : 0;
        const aim = back + (Math.PI / 2 - back) * c.crumbUpwardBias;
        for (let i = 0, count = randInt(c.crumbCount); i < count; i++) {
            const angle = aim + (Math.random() * 2 - 1) * c.crumbSpread;
            const v = rand(c.crumbSpeed) * s;
            ps.addParticle(
                new Vector2(tip.x, tip.y), new Vector2(Math.cos(angle) * v, Math.sin(angle) * v),
                new Color(...pick(c.crumbColors), 1), rand(c.crumbSize) * s, rand(c.crumbLifetime),
                c.crumbGravity * s, 'sphere', new Vector2(0, 0), 0, null, false, null, 0, 1,
                PARTICLE_TYPES.MINER, 0
            );
        }
    }
    scale() {
        return (this.person.renderScale ?? this.person.scale) / CROWD_CONFIG.baseScale;
    }
}
