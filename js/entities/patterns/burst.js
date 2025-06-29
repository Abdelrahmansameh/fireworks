import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const burstRecipe = new ParticleRecipe({
    name: 'burst',
    count: (ctx) => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const angle = Math.random() * Math.PI * 2;
        const magnitude = ctx.speed * Math.random() * ctx.spread * 1.25;
        const risingVelocity = 100;
        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(angle) * magnitude,
                Math.sin(angle) * magnitude + risingVelocity
            ),
            accel: new Renderer2D.Vector2(),
        };
    },
});

export default burstRecipe; 