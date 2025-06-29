import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const spinnerRecipe = new ParticleRecipe({
    name: 'spinner',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const explosionCenter = ctx.rocketPos.clone();
        const numArms = 20;
        const particlesPerArm = Math.floor(ctx.particleCount / numArms);
        const armIndex = Math.floor(i / particlesPerArm);
        let currentAngle = (armIndex / numArms) * Math.PI * 2 + (Math.random() - 0.5) * 10;
        const maxRadius = ctx.spread * 50 + (i % particlesPerArm) * 10;
        const radialSpeed = ctx.spread * 30 + (Math.random() - 0.5) * 10;
        let currentRadius = 0;
        const spinSpeed = 3;

        const updateFn = (pState, delta) => {
            currentRadius = currentRadius + (maxRadius - currentRadius) * delta;
            if (currentRadius > -maxRadius) {
                currentRadius += radialSpeed * delta * 0.1;
            }
            currentRadius += Math.random() * 200 * delta;
            currentAngle += spinSpeed * delta;

            pState.position.x = explosionCenter.x + Math.cos(currentAngle) * currentRadius;
            pState.position.y = explosionCenter.y + Math.sin(currentAngle) * currentRadius;
        };

        return {
            pos: explosionCenter,
            vel: new Renderer2D.Vector2(0, 0),
            accel: new Renderer2D.Vector2(),
            updateFn,
        };
    }
});

export default spinnerRecipe; 