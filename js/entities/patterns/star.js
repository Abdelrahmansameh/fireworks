import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const OUTER_RADIUS_MULT = 1;
const INNER_RADIUS_MULT = 0.5;
const RADIUS_VARIATION_BASE = 1;
const RADIUS_VARIATION_RAND_MULT = 0.5;
const RADIUS_VARIATION_RAND_SUB = 0.2;
const OUTER_RADIUS_DEV_MULT = 0.2;
const OUTER_RADIUS_DEV_SUB = 0.1;
const ANGLE_VARIATION_MULT = 0.2;
const ANGLE_VARIATION_SUB = 0.2;
const RISING_VELOCITY = 30;

function createStarRecipe(name, spikes) {
    return new ParticleRecipe({
        name,
        count: ctx => ctx.particleCount,
        calcInitialState: (i, ctx) => {
            const outerRadius = ctx.speed * ctx.spread * OUTER_RADIUS_MULT;
            const innerRadius = ctx.speed * INNER_RADIUS_MULT * ctx.spread;
            const pointsPerStar = spikes * 2;
            const starPoint = i % pointsPerStar;
            const starCopy = Math.floor(i / pointsPerStar);
            let radius = (starPoint % 2 === 0) ? outerRadius : innerRadius;
            let angle = (starPoint / pointsPerStar) * TAU;

            if (i > pointsPerStar && (starPoint % 2 === 0)) {
                radius = outerRadius * (1 + (Math.random() * OUTER_RADIUS_DEV_MULT - OUTER_RADIUS_DEV_SUB));
            }

            const radiusVariation = RADIUS_VARIATION_BASE + (Math.random() * RADIUS_VARIATION_RAND_MULT - RADIUS_VARIATION_RAND_SUB) * (starCopy > 0 ? 1 : 0);
            const angleVariation = (Math.random() * ANGLE_VARIATION_MULT - ANGLE_VARIATION_SUB) * (starCopy > 0 ? 1 : 0);
            const risingVelocity = RISING_VELOCITY;

            return {
                pos: ctx.rocketPos.clone(),
                vel: new Renderer2D.Vector2(
                    Math.cos(angle + angleVariation) * radius * radiusVariation,
                    Math.sin(angle + angleVariation) * radius * radiusVariation + risingVelocity
                ),
                accel: new Renderer2D.Vector2(),
            };
        }
    });
}

const star = createStarRecipe('star', 5);
const brocade = createStarRecipe('brocade', 10);

export { star, brocade }; 