import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const burstRecipe = new ParticleRecipe({
    name: 'burst',
    count: (ctx) => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const angle = Math.random() * Math.PI * 2;
        const magnitude = ctx.speed * Math.random() * ctx.spread * 0.75;
        const risingVelocity = 100;
        const randomAngle = ctx.randomSeed * Math.PI * 2;
        const vel = new Renderer2D.Vector2(
            Math.cos(angle) * magnitude,
            Math.sin(angle) * magnitude + risingVelocity
        );
        vel.rotate(randomAngle);
        return {
            pos: ctx.rocketPos.clone(),
            vel: vel,
            accel: new Renderer2D.Vector2(),
        };
    },
});

export default burstRecipe; 