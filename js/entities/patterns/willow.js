import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const willowRecipe = new ParticleRecipe({
    name: 'willow',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const emissionAngle = Math.random() * 0.5 + 0.5;
        const riseSpeed = 1;
        const angleOffset = (Math.random() * 1.2 - 0.5) * emissionAngle;
        const angle = (-Math.PI / 2) + angleOffset;
        const horizontalDrift = (Math.random() - 0.5) * 1500;
        const initialSpeed = ctx.speed * (0.5 + Math.random() * 0.1);
        const vel = new Renderer2D.Vector2(
            (Math.cos(angle) * initialSpeed + horizontalDrift) * ctx.spread,
            -Math.sin(angle) * initialSpeed * riseSpeed
        );
        const randomAngle = ctx.randomSeed * Math.PI /6;
        vel.rotate(randomAngle);

        const initialOffset = new Renderer2D.Vector2(
            i * 0.05 * ctx.spread + (Math.random() - 0.5),
            (Math.random() - 0.5)
        );
        const pos = ctx.rocketPos.clone().add(initialOffset);
        return { pos, vel, accel: new Renderer2D.Vector2() };
    }
});

export default willowRecipe; 