import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const MAGNITUDE_SCALE = 0.75;
const RISING_VELOCITY = 300;
const RANDOM_ANGLE_DIVISOR = 4;

const burstRecipe = new ParticleRecipe({
    name: 'burst',
    count: (ctx) => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const angle = Math.random() * TAU;
        const magnitude = ctx.speed * Math.random() * ctx.spread * MAGNITUDE_SCALE;
        const randomAngle = ctx.randomSeed * Math.PI / RANDOM_ANGLE_DIVISOR;
        const vel = new Renderer2D.Vector2(
            Math.cos(angle) * magnitude,
            Math.sin(angle) * magnitude + RISING_VELOCITY
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