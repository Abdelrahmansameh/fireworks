import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const brokenHeartRecipe = new ParticleRecipe({
    name: 'brokenHeart',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const heartScale = ctx.spread;
        const pivotOffset = new Renderer2D.Vector2(0, -heartScale * 30);

        const t = (i / ctx.particleCount) * Math.PI * 2;
        const xOffset = heartScale * (16 * Math.pow(Math.sin(t), 3));
        const yOffset = heartScale * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

        const particleOffset = new Renderer2D.Vector2(xOffset, yOffset);
        const angle = Math.atan2(yOffset, xOffset);
        const magnitude = ctx.speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * 0.07;
        const vel = new Renderer2D.Vector2(
            Math.cos(angle) * magnitude,
            Math.sin(angle) * magnitude
        );

        const pivotToParticle = particleOffset.clone();
        pivotToParticle.subtract(pivotOffset);
        const rotationVec = new Renderer2D.Vector2(pivotToParticle.y, -pivotToParticle.x);
        const sign = (xOffset > 0) ? 6 : -6;
        rotationVec.scale(sign);

        return {
            pos: ctx.rocketPos.clone(),
            vel,
            accel: rotationVec,
        };
    }
});

export default brokenHeartRecipe; 