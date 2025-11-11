import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const heartRecipe = new ParticleRecipe({
    name: 'heart',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const heartScale = ctx.spread;
        const t = (i / ctx.particleCount) * Math.PI * 2;
        const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
        const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const angle = Math.atan2(yOffset, xOffset);
        const magnitude = ctx.speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.07;
        const risingVelocity = 300;
        const randomSpread = (Math.random() - 0.5) * 10;
        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(angle) * magnitude + randomSpread,
                Math.sin(angle) * magnitude + risingVelocity + randomSpread
            ),
            accel: new Renderer2D.Vector2(),
        };
    }
});

export default heartRecipe; 