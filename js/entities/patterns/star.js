import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

function createStarRecipe(name, spikes) {
    return new ParticleRecipe({
        name,
        count: ctx => ctx.particleCount,
        calcInitialState: (i, ctx) => {
            const outerRadius = ctx.speed * ctx.spread ;
            const innerRadius = ctx.speed * 0.5 * ctx.spread ;
            const pointsPerStar = spikes * 2;
            const starPoint = i % pointsPerStar;
            const starCopy = Math.floor(i / pointsPerStar);
            let radius = (starPoint % 2 === 0) ? outerRadius : innerRadius;
            let angle = (starPoint / pointsPerStar) * Math.PI * 2;

            if (i > pointsPerStar && (starPoint % 2 === 0)) {
                radius = outerRadius * (1 + (Math.random() * 0.2 - 0.1));
            }

            const radiusVariation = 1 + (Math.random() * 0.5 - 0.2) * (starCopy > 0 ? 1 : 0);
            const angleVariation = (Math.random() * 0.2 - 0.2) * (starCopy > 0 ? 1 : 0);
            const risingVelocity = 30;

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