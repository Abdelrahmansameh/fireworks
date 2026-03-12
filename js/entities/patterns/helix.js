import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const INDEX_DIVISOR = 50;
const OFFSET_MULT = 20;
const SUB_INDEX_MOD = 100;
const RADIUS_MULT = 50;
const RISE_SPEED_VAL = 0;
const ROTATION_SPEED_VAL = 2;
const STREAM_DIVISOR = 2;
const SPREAD_MULT = 0.1;
const VEL_MULT_1 = 10;
const VEL_MULT_2 = 25;
const RADIUS_OUTER_MULT = 3;
const VEL_OFFSET = 40;
const GRAVITY_MULT = 0.2;

const helixRecipe = new ParticleRecipe({
    name: 'helix',
    count: ctx => ctx.particleCount,
    calcInitialState: (index, ctx) => {
        const helixIndex = Math.floor(index / INDEX_DIVISOR);
        const randomOffset = (helixIndex * OFFSET_MULT);
        const subIndex = index % SUB_INDEX_MOD;
        const helixRadius = RADIUS_MULT * ctx.spread;
        const riseSpeed = RISE_SPEED_VAL; //ctx.speed * 0.15 * ctx.spread;
        const rotationSpeed = ROTATION_SPEED_VAL;
        const particlesPerStream = Math.floor(SUB_INDEX_MOD / STREAM_DIVISOR);
        const stream = subIndex < particlesPerStream ? 0 : 1;
        const i = subIndex % particlesPerStream;
        const t = (i / particlesPerStream) * TAU;
        const angle = t + stream * Math.PI;
        const randomSpread = (Math.random() - 0.5) * SPREAD_MULT;
        const minVelocity = riseSpeed * VEL_MULT_1 + (1 + randomSpread);
        const maxVelocity = riseSpeed * VEL_MULT_1 + (1 + randomSpread) + particlesPerStream * VEL_MULT_2 * ctx.spread;
        const vel = new Renderer2D.Vector2(
            randomOffset - Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) + -Math.sin(angle) * rotationSpeed + Math.cos(angle) * helixRadius * (1 + randomSpread) * RADIUS_OUTER_MULT,
            minVelocity + (maxVelocity - minVelocity) * (i / particlesPerStream) - VEL_OFFSET
        );

        const accel = new Renderer2D.Vector2(
            0,
            0
        );

        const particleColor = stream === 1 && ctx.secondaryColor ? ctx.secondaryColor : ctx.primaryColor;

        const gravity = ctx.gravity * GRAVITY_MULT;

        return { pos: ctx.rocketPos.clone(), vel, accel, color: particleColor, gravity };
    }
});

export default helixRecipe; 