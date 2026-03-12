import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TRUNK_PART = 0.2;
const BASE_WIDTH_MULT = 2;
const BASE_HEIGHT_MULT = 3;
const TRUNK_WIDTH_MULT = 0.2;
const TRUNK_HEIGHT_MULT = 0.2;
const TRIANGLE_SCALES = [1, 0.7, 0.4];
const TRIANGLE_HEIGHTS = [0.4, 0.3, 0.2];
const HORIZONTAL_LINES_COUNT = 3;

const christmasTreeRecipe = new ParticleRecipe({
    name: 'christmasTree',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const trunkCount = Math.floor(ctx.particleCount * TRUNK_PART);
        const inTrunk = i < trunkCount;

        const baseWidth = ctx.spread * BASE_WIDTH_MULT;
        const baseHeight = ctx.spread * BASE_HEIGHT_MULT;
        const trunkWidth = baseWidth * TRUNK_WIDTH_MULT;
        const trunkHeight = baseHeight * TRUNK_HEIGHT_MULT;
        const triangleHeights = [
            baseHeight * TRIANGLE_HEIGHTS[0],
            baseHeight * TRIANGLE_HEIGHTS[1],
            baseHeight * TRIANGLE_HEIGHTS[2]
        ];

        let pos = ctx.rocketPos.clone();
        let vel = new Renderer2D.Vector2();
        let color = null;

        if (inTrunk) {
            const rowCount = Math.max(1, Math.floor(Math.sqrt(trunkCount)));
            const colCount = Math.max(1, Math.floor(trunkCount / rowCount));
            const row = Math.floor(i / colCount);
            const col = i % colCount;
            const x = (colCount > 1) ? (col / (colCount - 1) - 0.5) * trunkWidth : 0;
            const y = (row / rowCount) * trunkHeight;
            pos = pos.add(new Renderer2D.Vector2(x, y));
            vel.set(x * ctx.speed, y * ctx.speed);
            color = ctx.secondaryColor;
        } else {
            const idx = i - trunkCount;
            const triangleParticles = Math.floor((ctx.particleCount - trunkCount) / TRIANGLE_SCALES.length);
            const triangleIndex = Math.min(TRIANGLE_SCALES.length - 1, Math.floor(idx / triangleParticles));
            const scale = TRIANGLE_SCALES[triangleIndex];
            const triWidth = baseWidth * scale;
            const triHeight = triangleHeights[triangleIndex];
            const baseY = trunkHeight + triangleHeights.slice(0, triangleIndex).reduce((a, b) => a + b, 0);

            // indices within this triangle
            const localIdx = idx % triangleParticles;
            const edgeParticles = Math.floor(Math.sqrt(triangleParticles) * 2);

            if (localIdx < edgeParticles) {
                // left edge
                const progress = localIdx / (edgeParticles - 1);
                const x = (-0.5 + progress * 0.5) * triWidth;
                const y = baseY + progress * triHeight;
                pos = pos.add(new Renderer2D.Vector2(x, y));
                vel.set(x * ctx.speed, y * ctx.speed);
            } else if (localIdx < edgeParticles * 2) {
                // right edge
                const idxInEdge = localIdx - edgeParticles;
                const progress = idxInEdge / (edgeParticles - 1);
                const x = (0.5 - progress * 0.5) * triWidth;
                const y = baseY + progress * triHeight;
                pos = pos.add(new Renderer2D.Vector2(x, y));
                vel.set(x * ctx.speed, y * ctx.speed);
            } else {
                // horizontal lines
                let remaining = localIdx - edgeParticles * 2;
                let chosen = false;
                for (let line = 0; line <= HORIZONTAL_LINES_COUNT; line++) {
                    const lineProgress = line / HORIZONTAL_LINES_COUNT;
                    const currentWidth = triWidth * (1 - lineProgress);
                    const lineParticles = Math.floor(edgeParticles * 0.5 * (1 - lineProgress) + 3);
                    if (remaining < lineParticles) {
                        const x = ((remaining / (lineParticles - 1)) - 0.5) * currentWidth;
                        const y = baseY + lineProgress * triHeight;
                        pos = pos.add(new Renderer2D.Vector2(x, y));
                        vel.set(x * ctx.speed, y * ctx.speed);
                        chosen = true;
                        break;
                    }
                    remaining -= lineParticles;
                }

                if (!chosen) {
                    const x = (Math.random() - 0.5) * triWidth;
                    const y = baseY + Math.random() * triHeight;
                    pos = pos.add(new Renderer2D.Vector2(x, y));
                    vel.set(x * ctx.speed, y * ctx.speed);
                }
            }
        }

        return { pos, vel, accel: new Renderer2D.Vector2(), color };
    }
});

export default christmasTreeRecipe; 