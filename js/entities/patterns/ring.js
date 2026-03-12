import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const RISING_VELOCITY = 100;

const ringRecipe = new ParticleRecipe({
    name: 'ring',
    count: (ctx) => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const angle = (i / ctx.particleCount) * TAU;
        const magnitude = ctx.speed * ctx.spread;
        const risingVelocity = RISING_VELOCITY;
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