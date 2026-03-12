import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const EMISSION_ANGLE_MULT = 0.5;
const EMISSION_ANGLE_ADD = 0.5;
const RISE_SPEED = 1;
const ANGLE_OFFSET_MULT = 1.2;
const ANGLE_OFFSET_SUB = 0.5;
const HORIZONTAL_DRIFT_MULT = 1500;
const INITIAL_SPEED_MULT = 0.5;
const INITIAL_SPEED_RAND_MULT = 0.1;
const RANDOM_ANGLE_DIVISOR = 6;
const INITIAL_OFFSET_X_MULT = 0.05;

const willowRecipe = new ParticleRecipe({
    name: 'willow',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const emissionAngle = Math.random() * EMISSION_ANGLE_MULT + EMISSION_ANGLE_ADD;
        const riseSpeed = RISE_SPEED;
        const angleOffset = (Math.random() * ANGLE_OFFSET_MULT - ANGLE_OFFSET_SUB) * emissionAngle;
        const angle = (-Math.PI / 2) + angleOffset;
        const horizontalDrift = (Math.random() - 0.5) * HORIZONTAL_DRIFT_MULT;
        const initialSpeed = ctx.speed * (INITIAL_SPEED_MULT + Math.random() * INITIAL_SPEED_RAND_MULT);
        const vel = new Renderer2D.Vector2(
            (Math.cos(angle) * initialSpeed + horizontalDrift) * ctx.spread,
            -Math.sin(angle) * initialSpeed * riseSpeed
        );
        const randomAngle = ctx.randomSeed * Math.PI / RANDOM_ANGLE_DIVISOR;
        vel.rotate(randomAngle);

        const initialOffset = new Renderer2D.Vector2(
            i * INITIAL_OFFSET_X_MULT * ctx.spread + (Math.random() - 0.5),
            (Math.random() - 0.5)
        );
        const pos = ctx.rocketPos.clone().add(initialOffset);
        return { pos, vel, accel: new Renderer2D.Vector2() };
    }
});

export default willowRecipe; 