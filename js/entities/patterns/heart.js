import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const X_MULT = 16;
const X_POW = 3;
const Y_MULT_1 = 13;
const Y_MULT_2 = 5;
const Y_MULT_3 = 2;
const MAGNITUDE_SCALE = 0.07;
const RISING_VELOCITY = 300;
const SPREAD_MULT = 10;

const heartRecipe = new ParticleRecipe({
    name: 'heart',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const heartScale = ctx.spread;
        const t = (i / ctx.particleCount) * TAU;
        const xOffset = heartScale * (X_MULT * Math.pow(Math.sin(t), X_POW));
        const yOffset = heartScale * (Y_MULT_1 * Math.cos(t) - Y_MULT_2 * Math.cos(2 * t) - Y_MULT_3 * Math.cos(3 * t) - Math.cos(4 * t));
        const angle = Math.atan2(yOffset, xOffset);
        const magnitude = ctx.speed * Math.sqrt(xOffset * xOffset + yOffset * yOffset) * MAGNITUDE_SCALE;
        const randomSpread = (Math.random() - 0.5) * SPREAD_MULT;
        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(angle) * magnitude + randomSpread,
                Math.sin(angle) * magnitude + RISING_VELOCITY + randomSpread
            ),
            accel: new Renderer2D.Vector2(),
        };
    }
});

export default heartRecipe; 