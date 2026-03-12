import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const NUM_ARMS = 20;
const ARM_ANGLE_SPREAD = 0.2;
const MAGNITUDE_RANDOM_ADD = 100;
const SPIN_ACCEL = 1000;
const R_THRESHOLD = 1;

const spinnerRecipe = new ParticleRecipe({
    name: 'spinner',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const explosionCenter = ctx.rocketPos.clone();
        const numArms = NUM_ARMS;
        const particlesPerArm = Math.floor(ctx.particleCount / numArms);
        const armIndex = Math.floor(i / particlesPerArm);
        const armAngle = (armIndex / numArms) * TAU + (Math.random() - 0.5) * ARM_ANGLE_SPREAD;
        const magnitude = ctx.speed * ctx.spread + Math.random() * MAGNITUDE_RANDOM_ADD;
        const spinAccel = SPIN_ACCEL;

        const updateFn = (pState, delta) => {
            const dx = pState.position.x - explosionCenter.x;
            const dy = pState.position.y - explosionCenter.y;
            const r = Math.sqrt(dx * dx + dy * dy);

            pState.acceleration.set(0, 0);
            if (r > R_THRESHOLD) {
                const radialX = dx / r;
                const radialY = dy / r;
                const tangentX = -radialY;
                const tangentY = radialX;
                const tangentialSpeed = pState.velocity.x * tangentX + pState.velocity.y * tangentY;
                const centripetalAccel = (tangentialSpeed * tangentialSpeed) / r;

                pState.acceleration.x = tangentX * spinAccel - radialX * centripetalAccel;
                pState.acceleration.y = tangentY * spinAccel - radialY * centripetalAccel;
            }
        };

        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(armAngle) * magnitude,
                Math.sin(armAngle) * magnitude
            ),
            accel: new Renderer2D.Vector2(),
            updateFn,
        };
    }
});

export default spinnerRecipe; 