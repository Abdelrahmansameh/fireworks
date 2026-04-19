import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;

// Perspective: we view Saturn from above the equatorial (ring) plane.
// The ring is also rotated clockwise in 2D for the diagonal look in the image.
const RING_ELEVATION = Math.PI / 20;   // how much the ring squishes vertically
const MIN_RING_ROTATION_2D = Math.PI / 20;   // diagonal tilt of the whole ring in screen space
const MAX_RING_ROTATION_2D = Math.PI / 30;

const SIN_ELV = Math.sin(RING_ELEVATION);

// Particle allocation
const SPHERE_FRACTION = 0.55;   //  sphere,  ring
const RING_RADIUS_MULT = 1.25;   // ring extends beyond the sphere

// Speed tuning
const SPHERE_SPEED_MULT = 0.55;
const RING_SPEED_MULT = 0.95;
const RING_THICKNESS = 0.08;   // radial scatter for ring width (fraction of magnitude)

// Both parts rise together
const RISING_VELOCITY = 80;

// Fibonacci sphere – gives uniform coverage on a sphere surface
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const saturnRecipe = new ParticleRecipe({
    name: 'saturn',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {


        const RING_ROTATION_2D = (() => {
            if (ctx._ringRotation2D !== undefined)
                 return ctx._ringRotation2D;
            const minRot = Math.min(MIN_RING_ROTATION_2D, MAX_RING_ROTATION_2D);
            const maxRot = Math.max(MIN_RING_ROTATION_2D, MAX_RING_ROTATION_2D);
            const r = minRot + ctx.randomSeed * (maxRot - minRot);
            ctx._ringRotation2D = ctx.randomSeed < 0.5 ? -r : r;
            return ctx._ringRotation2D;
        })();
        const COS_ROT = Math.cos(RING_ROTATION_2D);
        const SIN_ROT = Math.sin(RING_ROTATION_2D);

        const total = ctx.particleCount;
        const sphereCount = Math.floor(total * SPHERE_FRACTION);

        if (i < sphereCount) {
            // ── Sphere (planet body) ──────────────────────────────────────────
            // Fibonacci lattice gives even, non-banded coverage on the sphere.
            const phi = Math.acos(1 - 2 * (i + 0.5) / sphereCount);
            const theta = GOLDEN_ANGLE * i;

            // 3-D unit vector projected to 2-D (ignore Z / depth component).
            // This creates the perspective illusion: particles heading "into"
            // the screen have a shorter 2-D velocity → they appear further away.
            const nx = Math.sin(phi) * Math.cos(theta);
            const ny = Math.cos(phi);

            const mag = ctx.speed * ctx.spread * SPHERE_SPEED_MULT * (0.85 + Math.random() * 0.3);
            const color = ctx.primaryColor;

            return {
                pos: ctx.rocketPos.clone(),
                vel: new Renderer2D.Vector2(nx * mag, ny * mag + RISING_VELOCITY),
                accel: new Renderer2D.Vector2(),
                color,
            };

        } else {
            // ── Ring ─────────────────────────────────────────────────────────
            // A circle lying in the XZ (horizontal) plane in 3-D.
            // Viewed from elevation RING_ELEVATION it projects to an ellipse.
            //
            //   3-D ring point:  (cos θ,  0,  sin θ)
            //   After elevation rotation around X-axis:
            //     x' =  cos θ
            //     y' = -sin θ · sin(elevation)    ← squish makes it look tilted
            //   Then rotate the whole ellipse by RING_ROTATION_2D in screen space
            //   so it runs diagonally like in the reference image.

            const ringI = i - sphereCount;
            const ringCount = total - sphereCount;
            const theta = (ringI / ringCount) * TAU;

            const ex = Math.cos(theta);
            const ey = -Math.sin(theta) * SIN_ELV;

            // 2-D rotation for the diagonal look
            const rx = ex * COS_ROT - ey * SIN_ROT;
            const ry = ex * SIN_ROT + ey * COS_ROT;

            // Slight radial scatter so the ring has visible thickness
            const scatter = 1 + (Math.random() - 0.5) * RING_THICKNESS;
            const mag = ctx.speed * ctx.spread * RING_SPEED_MULT * RING_RADIUS_MULT * scatter;

            // Use secondary colour if provided, otherwise primary
            const color = ctx.secondaryColor ? ctx.secondaryColor : ctx.primaryColor;

            return {
                pos: ctx.rocketPos.clone(),
                vel: new Renderer2D.Vector2(rx * mag, ry * mag + RISING_VELOCITY),
                accel: new Renderer2D.Vector2(),
                color,
            };
        }
    },
});

export default saturnRecipe;
