import { Vector2, Color } from '../../rendering/Renderer.js';
import { JETPACK_CONFIG as cfg, CULTIST_CONFIG, CROWD_CONFIG, GAME_BOUNDS as bounds, PARTICLE_TYPES } from '../../config/config.js';
import { MAX_SPARKLES_PER_RITUAL } from '../../config/CultistRitual.js';

// Behaviors own optional per-person state and can replace the ordinary crowd update.
export class CrowdBehavior {
    constructor(crowd, person) { this.crowd = crowd; this.person = person; this.active = true; }
    update() {}
    dispose() { this.active = false; }
}

export class JetpackBehavior extends CrowdBehavior {
    constructor(crowd, person) {
        super(crowd, person);
        this.timer = 0;
        this.thrust = 1;
        this.tilt = 0;
        this.exhaustAccumulator = 0;
        person.state = 'fly';
        // Fly in mid-air from just past the left edge of the screen.
        const view = crowd.renderer?.getVisibleWorldBounds?.();
        const band = bounds.WORLD_MAX_EXPLOSION_Y - bounds.WORLD_MIN_EXPLOSION_Y;
        const [low, high] = cfg.entryHeight;
        person.x = Math.min(view ? view.left - cfg.entryMargin : bounds.LAUNCHER_MIN_X, bounds.LAUNCHER_MIN_X);
        person.y = bounds.WORLD_MIN_EXPLOSION_Y + band * (low + Math.random() * (high - low));
        person.vx = cfg.wanderSpeed; person.vy = 0;
        person.flipX = 1;
        this.entering = true;
        this.tx = bounds.LAUNCHER_MIN_X + Math.random() * (bounds.LAUNCHER_MAX_X - bounds.LAUNCHER_MIN_X) * 0.5;
        this.ty = person.y;
        this.timer = Infinity;
    }
    update(dt) {
        const p = this.person;
        this.timer -= dt;
        // Until it reaches the show, an entering fan heads for its first target
        // and may be left of the launcher area.
        if (this.entering && p.x >= bounds.LAUNCHER_MIN_X) { this.entering = false; this.timer = cfg.wanderTargetChangeTime; }
        if (!this.entering && (this.timer <= 0 || Math.hypot(this.tx - p.x, this.ty - p.y) < 80)) {
            this.tx = bounds.LAUNCHER_MIN_X + Math.random() * (bounds.LAUNCHER_MAX_X - bounds.LAUNCHER_MIN_X);
            this.ty = bounds.WORLD_MIN_EXPLOSION_Y + Math.random() * Math.max(0, this.crowd.jetpackCeilingY - bounds.WORLD_MIN_EXPLOSION_Y);
            this.timer = cfg.wanderTargetChangeTime + (Math.random() - 0.5) * 1.5;
        }
        const speed = cfg.wanderSpeed * (this.crowd.jetpackStats?.speedMultiplier ?? 1);
        const targetVX = Math.max(-speed, Math.min(speed, (this.tx - p.x) * 0.65));
        p.vx += Math.max(-320, Math.min(320, (targetVX - p.vx) * 1.4)) * dt;
        const targetVY = Math.max(-speed * 0.65, Math.min(speed * 0.8, (this.ty - p.y) * 0.55));
        if (p.vy < targetVY - 25) this.engine = true;
        else if (p.vy > targetVY + 25) this.engine = false;
        p.vy = Math.max(-speed * 0.8, Math.min(speed, p.vy + ((this.engine ? 480 : 0) - 240) * dt));
        const minX = this.entering ? -Infinity : bounds.LAUNCHER_MIN_X;
        p.x = Math.max(minX, Math.min(bounds.LAUNCHER_MAX_X, p.x + p.vx * dt));
        const ceiling = Math.max(bounds.WORLD_LAUNCHER_Y, this.crowd.jetpackCeilingY);
        p.y = Math.max(bounds.WORLD_LAUNCHER_Y, Math.min(ceiling, p.y + p.vy * dt));
        if ((p.x === bounds.LAUNCHER_MIN_X && p.vx < 0) || (p.x === bounds.LAUNCHER_MAX_X && p.vx > 0)) p.vx = 0;
        if ((p.y === bounds.WORLD_LAUNCHER_Y && p.vy < 0) || (p.y === ceiling && p.vy > 0)) p.vy = 0;
        const targetTilt = Math.max(-0.22, Math.min(0.22, -p.vx * 0.0008));
        this.tilt += (targetTilt - this.tilt) * (1 - Math.exp(-4 * dt));
        if (p.vx > 30) p.flipX = 1; else if (p.vx < -30) p.flipX = -1;
        if (p.vy < -10) this.thrustOn = false; else if (p.vy > 10) this.thrustOn = true;
        this.thrust = Math.max(0, Math.min(1, this.thrust + (this.thrustOn === false ? -1 : 1) * dt / 0.3));
        this.emitExhaust(dt);
        if (this.crowd.particleSystem && this.crowd._scanFrameCounter % cfg.scanInterval === 0) this.scan();
    }
    emitExhaust(dt) {
        const ps = this.crowd.particleSystem;
        if (!ps || this.thrust <= 0.01) { this.exhaustAccumulator = 0; return; }
        this.exhaustAccumulator += Math.min(dt, 0.1) * 200 * this.thrust;
        const count = Math.floor(this.exhaustAccumulator);
        this.exhaustAccumulator -= count;
        const p = this.person;
        const scale = p.renderScale ?? p.scale * 0.75;
        for (let i = 0; i < count; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const angle = -Math.PI / 2 + this.tilt + (Math.random() - 0.5) * 1.04;
            const speed = 80 + Math.random() * 80;
            const colors = [[1, 0.35, 0.25], [1, 0.8, 0.25], [0.4, 0.8, 1], [0.85, 0.45, 1], [0.45, 1, 0.7]];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const nozzleX = side * 2.04 * scale;
            const nozzleY = -2.4 * scale;
            const cos = Math.cos(this.tilt), sin = Math.sin(this.tilt);
            ps.addParticle(
                new Vector2(p.x + nozzleX * cos - nozzleY * sin, p.y + nozzleX * sin + nozzleY * cos),
                new Vector2(Math.cos(angle) * speed + p.vx * 0.2, Math.sin(angle) * speed + p.vy * 0.2),
                new Color(color[0], color[1], color[2], 0.8 * this.thrust),
                0.5 + Math.random() * 0.7, 0.1 + Math.random() * 0.1, 0,
                'sphere', new Vector2(0, 0), 0, null, false, null, 0, 1,
                PARTICLE_TYPES.TRAIL, 0
            );
        }
    }
    scan() {
        const ps = this.crowd.particleSystem, p = this.person;
        const radius = cfg.collectionRadius * (this.crowd.jetpackStats?.collectionRadiusMultiplier ?? 1);
        const grid = this.crowd._jetpackGrid;
        if (!grid) return;
        const minX = Math.floor((p.x - radius) / 100), maxX = Math.floor((p.x + radius) / 100);
        const minY = Math.floor((p.y - radius) / 100), maxY = Math.floor((p.y + radius) / 100);
        for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
            for (const [shape, i] of grid.get(`${x},${y}`) || []) {
                const data = ps.instanceData[shape], fns = ps.particleUpdateFns[shape];
                const b = i * ps.strideFloats;
                if (data[b + ps.initialLifetimeIdx] - data[b + ps.lifetimeIdx] < cfg.minParticleAge) continue;
                if (Math.hypot(data[b + ps.positionIdx] - p.x, data[b + ps.positionIdx + 1] - p.y) > radius) continue;
                if (fns[i]?._isJetpackPull || fns[i]?._isCrowdPull) continue;
                const value = data[b + ps.sparkleValueIdx] || 0;
                let elapsed = 0;
                const pull = (state, dt) => {
                    if (!this.active) return;
                    elapsed += dt;
                    const dx = p.x - state.position.x, dy = p.y - state.position.y, dist = Math.hypot(dx, dy);
                    if (dist < cfg.arrivalThreshold || elapsed >= cfg.maxCaptureTime) {
                        this.crowd.onJetpackCollect?.(value * cfg.sparklesPerParticle, 1);
                        state.lifetime = 0; return;
                    }
                    state.alpha = elapsed / cfg.maxCaptureTime; state.scale = elapsed / cfg.maxCaptureTime; state.lifetime = 1;
                    state.velocity.x += dx / dist * cfg.pullForce * dt;
                    state.velocity.y += dy / dist * cfg.pullForce * dt;
                    state.color.r += 0.5 * dt; state.color.g += 0.5 * dt; state.color.b += 0.5 * dt;
                };
                pull._isJetpackPull = true; fns[i] = pull;
            }
        }
    }
}

const rand = ([min, max]) => min + Math.random() * (max - min);
const pick = list => list[Math.floor(Math.random() * list.length)];
const IDLE_PROPS = CULTIST_CONFIG.props.map(prop => ({ ...prop, animation: null, startTime: 0, endTime: Infinity }));
const RITUAL_PROPS = CULTIST_CONFIG.props.map(prop => ({ ...prop, animation: 'ritual', startTime: 0, endTime: Infinity }));

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
