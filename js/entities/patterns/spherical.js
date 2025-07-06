import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';


function createSphereRecipe(name, layerCountCb, radiusMultiplierCb, risingVelocityCb, randomA, randomB) {
    return new ParticleRecipe({
        name,
        count: ctx => ctx.particleCount,
        calcInitialState: (i, ctx) => {
            const layers = layerCountCb(ctx);
            const layerIndex = Math.floor(i / (ctx.particleCount / layers));
            const layerProgress = layerIndex / layers;
            const angle = (i / (ctx.particleCount / layers)) * Math.PI * 2;

            const radius = radiusMultiplierCb(ctx) * (layerProgress + 1 / layers);
            const magnitude = ctx.speed * (randomB + Math.random() * randomA ) * radius;
            const risingVelocity = risingVelocityCb(ctx);

            const vel = new Renderer2D.Vector2(
                Math.cos(angle) * magnitude,
                Math.sin(angle) * magnitude + risingVelocity
            );

            return {
                pos: ctx.rocketPos.clone(),
                vel,
                accel: new Renderer2D.Vector2(),
            };
        }
    });
}

const spherical = createSphereRecipe(
    'spherical',
    () => 1,
    ctx => ctx.spread * 1,
    () => 50,
    0.4,
    0.8
);

const solidsphere = createSphereRecipe(
    'solidsphere',
    () => 6,
    ctx => ctx.spread *1,
    () => 150,
    0.2,
    1.0
);

export { spherical, solidsphere }; 