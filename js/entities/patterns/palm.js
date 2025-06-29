import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const palmRecipe = new ParticleRecipe({
    name: 'palm',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const branches = 8;
        const particlesPerBranch = Math.floor(ctx.particleCount / branches);
        const branch = i % branches;
        const particleInBranch = Math.floor(i / branches);
        const baseAngle = (branch / branches) * Math.PI * 2;
        const angleSpread = 0.3 * (particleInBranch / particlesPerBranch);
        const angle = baseAngle + (Math.random() - 0.5) * angleSpread;
        const magnitude = ctx.speed * (1 + particleInBranch / particlesPerBranch) * ctx.spread ;

        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(
                Math.cos(angle) * magnitude,
                Math.sin(angle) * magnitude
            ),
            accel: new Renderer2D.Vector2(),
        };
    }
});

export default palmRecipe; 