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
        const armAngle = (armIndex / numArms) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const magnitude = ctx.speed * ctx.spread  + Math.random() * 100;
        const spinAccel = 1000;

        const updateFn = (pState, delta) => {
            const dx = pState.position.x - explosionCenter.x;
            const dy = pState.position.y - explosionCenter.y;
            const r = Math.sqrt(dx * dx + dy * dy);

            pState.acceleration.set(0, 0);
            if (r > 1) {
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