import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const BRANCHES_COUNT = 8;
const ANGLE_SPREAD_MULT = 0.3;

const palmRecipe = new ParticleRecipe({
    name: 'palm',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const branches = BRANCHES_COUNT;
        const particlesPerBranch = Math.floor(ctx.particleCount / branches);
        const branch = i % branches;
        const particleInBranch = Math.floor(i / branches);
        const baseAngle = (branch / branches) * TAU;
        const angleSpread = ANGLE_SPREAD_MULT * (particleInBranch / particlesPerBranch);
        const angle = baseAngle + (Math.random() - 0.5) * angleSpread;
        const magnitude = ctx.speed * (1 + particleInBranch / particlesPerBranch) * ctx.spread;

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