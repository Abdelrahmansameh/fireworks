import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const PIVOT_MULT = 30;
const X_MULT = 16;
const X_POW = 3;
const Y_MULT_1 = 13;
const Y_MULT_2 = 5;
const Y_MULT_3 = 2;
const MAGNITUDE_SCALE = 0.07;
const ROTATION_SCALE = 6;

const brokenHeartRecipe = new ParticleRecipe({
    name: 'brokenHeart',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const heartScale = ctx.spread;
        const pivotOffset = new Renderer2D.Vector2(0, -heartScale * PIVOT_MULT);

        const t = (i / ctx.particleCount) * TAU;
        const xOffset = heartScale * (X_MULT * Math.pow(Math.sin(t), X_POW));
        const yOffset = heartScale * (Y_MULT_1 * Math.cos(t) - Y_MULT_2 * Math.cos(2 * t) - Y_MULT_3 * Math.cos(3 * t) - Math.cos(4 * t));

        const particleOffset = new Renderer2D.Vector2(xOffset, yOffset);
        const angle = Math.atan2(yOffset, xOffset);
        const magnitude = ctx.speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * MAGNITUDE_SCALE;
        const vel = new Renderer2D.Vector2(
            Math.cos(angle) * magnitude,
            Math.sin(angle) * magnitude
        );

        const pivotToParticle = particleOffset.clone();
        pivotToParticle.subtract(pivotOffset);
        const rotationVec = new Renderer2D.Vector2(pivotToParticle.y, -pivotToParticle.x);
        const sign = (xOffset > 0) ? ROTATION_SCALE : -ROTATION_SCALE;
        rotationVec.scale(sign);

        return {
            pos: ctx.rocketPos.clone(),
            vel,
            accel: rotationVec,
        };
    }
});

export default brokenHeartRecipe; 