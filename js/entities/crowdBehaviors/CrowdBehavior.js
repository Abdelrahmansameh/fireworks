import { Vector2, Color } from '../../rendering/Renderer.js';
import { JETPACK_CONFIG as cfg, GAME_BOUNDS as bounds, PARTICLE_TYPES } from '../../config/config.js';

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
        person.x = Math.max(bounds.LAUNCHER_MIN_X, Math.min(bounds.LAUNCHER_MAX_X, person.spawnX));
        person.y = Math.max(bounds.WORLD_LAUNCHER_Y, person.spawnY);
        person.vx = 0; person.vy = 0;
    }
    update(dt) {
        const p = this.person;
        this.timer -= dt;
        if (this.timer <= 0 || Math.hypot(this.tx - p.x, this.ty - p.y) < 80) {
            this.tx = bounds.LAUNCHER_MIN_X + Math.random() * (bounds.LAUNCHER_MAX_X - bounds.LAUNCHER_MIN_X);
            this.ty = bounds.WORLD_MIN_EXPLOSION_Y + Math.random() * (bounds.WORLD_MAX_EXPLOSION_Y - bounds.WORLD_MIN_EXPLOSION_Y);
            this.timer = cfg.wanderTargetChangeTime + (Math.random() - 0.5) * 1.5;
        }
        const speed = cfg.wanderSpeed * (this.crowd.jetpackStats?.speedMultiplier ?? 1);
        const targetVX = Math.max(-speed, Math.min(speed, (this.tx - p.x) * 0.65));
        p.vx += Math.max(-320, Math.min(320, (targetVX - p.vx) * 1.4)) * dt;
        const targetVY = Math.max(-speed * 0.65, Math.min(speed * 0.8, (this.ty - p.y) * 0.55));
        if (p.vy < targetVY - 25) this.engine = true;
        else if (p.vy > targetVY + 25) this.engine = false;
        p.vy = Math.max(-speed * 0.8, Math.min(speed, p.vy + ((this.engine ? 480 : 0) - 240) * dt));
        p.x = Math.max(bounds.LAUNCHER_MIN_X, Math.min(bounds.LAUNCHER_MAX_X, p.x + p.vx * dt));
        p.y = Math.max(bounds.WORLD_LAUNCHER_Y, Math.min(bounds.WORLD_MAX_EXPLOSION_Y, p.y + p.vy * dt));
        if ((p.x === bounds.LAUNCHER_MIN_X && p.vx < 0) || (p.x === bounds.LAUNCHER_MAX_X && p.vx > 0)) p.vx = 0;
        if ((p.y === bounds.WORLD_LAUNCHER_Y && p.vy < 0) || (p.y === bounds.WORLD_MAX_EXPLOSION_Y && p.vy > 0)) p.vy = 0;
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
        this.exhaustAccumulator += Math.min(dt, 0.1) * 150 * this.thrust;
        const count = Math.floor(this.exhaustAccumulator);
        this.exhaustAccumulator -= count;
        const p = this.person;
        const scale = p.renderScale ?? p.scale * 0.75;
        for (let i = 0; i < count; i++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const angle = -Math.PI / 2 + this.tilt + (Math.random() - 0.5) * 0.8;
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
