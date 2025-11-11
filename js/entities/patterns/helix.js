import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const helixRecipe = new ParticleRecipe({
    name: 'helix',
    count: ctx => ctx.particleCount,
    calcInitialState: (index, ctx) => {
        const helixIndex = Math.floor(index / 100);
        const randomOffset = (helixIndex * 20 );
        const subIndex = index % 100;
        const helixRadius = 30 * ctx.spread;
        const riseSpeed = 0; //ctx.speed * 0.15 * ctx.spread;
        const rotationSpeed = 2;
        const particlesPerStream = Math.floor(100 / 2);
        const stream = subIndex < particlesPerStream ? 0 : 1;
        const i = subIndex % particlesPerStream;
        const t = (i / particlesPerStream) * Math.PI * 2;
        const angle = t + stream * Math.PI;
        const randomSpread = (Math.random() - 0.5) * 0.1;
        const minVelocity = riseSpeed * 10 +  (1 + randomSpread);
        const maxVelocity = riseSpeed * 10 +  (1 + randomSpread) + particlesPerStream *15 * ctx.spread;
        const vel = new Renderer2D.Vector2(
           randomOffset -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) + -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) * 3,
            minVelocity + (maxVelocity - minVelocity) * (i / particlesPerStream) -40
        );

        const accel = new Renderer2D.Vector2(
            0,
            0
        );

        const particleColor = stream === 1 && ctx.secondaryColor ? ctx.secondaryColor : ctx.primaryColor;

        const gravity = ctx.gravity * 0.2;

        return { pos: ctx.rocketPos.clone(), vel, accel, color: particleColor, gravity };
    }
});

export default helixRecipe; 