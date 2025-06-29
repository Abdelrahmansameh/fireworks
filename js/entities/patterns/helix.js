import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const helixRecipe = new ParticleRecipe({
    name: 'helix',
    count: ctx => ctx.particleCount, // though we'll generate 2 streams * particlesPerStream
    calcInitialState: (index, ctx) => {
        const helixRadius = 8 * ctx.spread;
        const riseSpeed = ctx.speed * 0.05 * ctx.spread;
        const rotationSpeed = 2;
        const particlesPerStream = Math.floor(ctx.particleCount / 2);
        const stream = index < particlesPerStream ? 0 : 1;
        const i = index % particlesPerStream;
        const t = (i / particlesPerStream) * Math.PI * 2;
        const angle = t + stream * Math.PI;
        const randomSpread = (Math.random() - 0.5) * 0.1;

        const vel = new Renderer2D.Vector2(
            -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread),
            riseSpeed * 10
        );

        const accel = new Renderer2D.Vector2(
            -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) * 3,
             (1 + randomSpread) - i * 4 * ctx.spread
        );

        const particleColor = stream === 1 && ctx.secondaryColor ? ctx.secondaryColor : ctx.primaryColor;

        const gravity = ctx.gravity * 0.2;

        return { pos: ctx.rocketPos.clone(), vel, accel, color: particleColor, gravity };
    }
});

export default helixRecipe; 