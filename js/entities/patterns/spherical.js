import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const SPHERICAL_LAYERS = 1;
const SPHERICAL_RADIUS_MULT = 1;
const SPHERICAL_RISING_VELOCITY = 50;
const SPHERICAL_RANDOM_A = 0.4;
const SPHERICAL_RANDOM_B = 0.8;

const SOLIDSPHERE_LAYERS = 6;
const SOLIDSPHERE_RADIUS_MULT = 1;
const SOLIDSPHERE_RISING_VELOCITY = 150;
const SOLIDSPHERE_RANDOM_A = 0.2;
const SOLIDSPHERE_RANDOM_B = 1.0;

function createSphereRecipe(name, layerCountCb, radiusMultiplierCb, risingVelocityCb, randomA, randomB) {
    return new ParticleRecipe({
        name,
        count: ctx => ctx.particleCount,
        calcInitialState: (i, ctx) => {
            const layers = layerCountCb(ctx);
            const layerIndex = Math.floor(i / (ctx.particleCount / layers));
            const layerProgress = layerIndex / layers;
            const angle = (i / (ctx.particleCount / layers)) * TAU;

            const radius = radiusMultiplierCb(ctx) * (layerProgress + 1 / layers);
            const magnitude = ctx.speed * (randomB + Math.random() * randomA) * radius;
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
    () => SPHERICAL_LAYERS,
    ctx => ctx.spread * SPHERICAL_RADIUS_MULT,
    () => SPHERICAL_RISING_VELOCITY,
    SPHERICAL_RANDOM_A,
    SPHERICAL_RANDOM_B
);

const solidsphere = createSphereRecipe(
    'solidsphere',
    () => SOLIDSPHERE_LAYERS,
    ctx => ctx.spread * SOLIDSPHERE_RADIUS_MULT,
    () => SOLIDSPHERE_RISING_VELOCITY,
    SOLIDSPHERE_RANDOM_A,
    SOLIDSPHERE_RANDOM_B
);

export { spherical, solidsphere }; 