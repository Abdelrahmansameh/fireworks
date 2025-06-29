import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const ringRecipe = new ParticleRecipe({
    name: 'ring',
    count: (ctx) => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const angle = (i / ctx.particleCount) * Math.PI * 2;
        const magnitude = ctx.speed * ctx.spread ;
        const risingVelocity = 100;
        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(angle) * magnitude,
                Math.sin(angle) * magnitude + risingVelocity
            ),
            accel: new Renderer2D.Vector2(),
        };
    }
});

export default ringRecipe; 