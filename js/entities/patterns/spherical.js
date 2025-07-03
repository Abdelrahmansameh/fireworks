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
            const magnitude = ctx.speed * (randomA + Math.random() * randomB) * radius;
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
    0.8,
    0.4
);

const solidsphere = createSphereRecipe(
    'solidsphere',
    () => 6,
    ctx => ctx.spread *1,
    () => 150,
    1.2,
    0.1
);

export { spherical, solidsphere }; 