import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

/**
 * Dragon's Breath — a spiraling serpentine flame burst.
 * Two interleaving spiral arms with sinusoidal lateral oscillation
 * that creates a flickering flame/serpentine motion.
 * Color gradient from deep red → warm gold over lifetime.
 */
const dragonsBreath = new ParticleRecipe({
    name: 'dragonsBreath',
    count: ctx => Math.max(ctx.particleCount, 400),
    calcInitialState: (index, ctx) => {
        const total = (typeof ctx.total === 'number') ? ctx.total : 400;
        const arm = index % 2;                  // two spiral arms
        const i = Math.floor(index / 2);
        const armTotal = Math.ceil(total / 2);
        const t = i / armTotal;                 // 0..1 along the arm

        // Spiral parameters
        const spiralTurns = 3;
        const angle = t * spiralTurns * Math.PI * 2 + arm * Math.PI;
        const radius = ctx.speed * ctx.spread * (0.15 + t * 0.85);

        // Base outward velocity along spiral
        const vx = Math.cos(angle) * radius;
        const vy = Math.sin(angle) * radius * 0.6 + ctx.speed * 0.3 * t;

        // Add random jitter for flame flicker
        const jitterX = (Math.random() - 0.5) * ctx.speed * 0.12;
        const jitterY = (Math.random() - 0.5) * ctx.speed * 0.12;

        const vel = new Renderer2D.Vector2(vx + jitterX, vy + jitterY);
        const accel = new Renderer2D.Vector2(0, 0);

        // Serpentine oscillation via updateFn
        const phase = t * Math.PI * 6 + arm * Math.PI;
        const oscFreq = 4 + Math.random() * 2;
        const oscAmp = 80 + Math.random() * 60;

        const updateFn = (state, delta) => {
            const age = state.initialLifetime - state.lifetime;
            const lateralForce = Math.sin(phase + age * oscFreq) * oscAmp;
            // Perpendicular to current velocity
            const vLen = Math.sqrt(state.velocity.x * state.velocity.x + state.velocity.y * state.velocity.y);
            if (vLen > 1) {
                const nx = -state.velocity.y / vLen;
                const ny = state.velocity.x / vLen;
                state.velocity.x += nx * lateralForce * delta;
                state.velocity.y += ny * lateralForce * delta;
            }
        };

        // Color: deep red for outer particles, bright orange-gold for inner
        const r = 1.0;
        const g = 0.15 + t * 0.45;     // 0.15 → 0.6
        const b = 0.02 + t * 0.08;     // dark red → warm orange
        const particleColor = new Renderer2D.Color(r, g, b, 1.0);

        const gravity = ctx.gravity * 0.15;

        return {
            pos: ctx.rocketPos.clone(),
            vel,
            accel,
            color: particleColor,
            gravity,
            updateFn
        };
    }
});

export default dragonsBreath;
