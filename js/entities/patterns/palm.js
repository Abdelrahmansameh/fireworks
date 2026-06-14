import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const BRANCHES_COUNT = 8;
const PISTIL_BRANCH_COUNT = 14;
const ANGLE_SPREAD_MULT = 0.3;
const ANGLE_JITTER = 0.6;

function makePalmLikeRecipe(name, branches) {
    return new ParticleRecipe({
        name,
        count: ctx => ctx.particleCount,
        calcInitialState: (i, ctx) => {
            const particlesPerBranch = Math.floor(ctx.particleCount / branches);
            const branch = i % branches;
            const particleInBranch = Math.floor(i / branches);
            const baseAngle = (branch / branches) * TAU;
            const angleSpread = ANGLE_SPREAD_MULT * (particleInBranch / particlesPerBranch);
            const angle = baseAngle + (Math.random() * ANGLE_JITTER - ANGLE_JITTER / 2) * angleSpread;
            let magnitude = 0;
            if (name === 'pistil') {
                magnitude = ctx.speed * (0.32+ particleInBranch / particlesPerBranch) * ctx.spread ;
            }
            else {
                magnitude = ctx.speed * (1 + particleInBranch / particlesPerBranch) * ctx.spread * 1.25;
            }
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
}

const palm = makePalmLikeRecipe('palm', BRANCHES_COUNT);
const pistil = makePalmLikeRecipe('pistil', PISTIL_BRANCH_COUNT);

export { palm, pistil };
export default palm;