import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const christmasTreeRecipe = new ParticleRecipe({
    name: 'christmasTree',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const trunkPart = 0.2;
        const trunkCount = Math.floor(ctx.particleCount * trunkPart);
        const inTrunk = i < trunkCount;

        const baseWidth = ctx.spread * 2;
        const baseHeight = ctx.spread * 3;
        const trunkWidth = baseWidth * 0.2;
        const trunkHeight = baseHeight * 0.2;
        const triangleScales = [1, 0.7, 0.4];
        const triangleHeights = [baseHeight * 0.4, baseHeight * 0.3, baseHeight * 0.2];

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
            const triangleParticles = Math.floor((ctx.particleCount - trunkCount) / triangleScales.length);
            const triangleIndex = Math.min(triangleScales.length - 1, Math.floor(idx / triangleParticles));
            const scale = triangleScales[triangleIndex];
            const triWidth = baseWidth * scale;
            const triHeight = triangleHeights[triangleIndex];
            const baseY = trunkHeight + triangleHeights.slice(0, triangleIndex).reduce((a, b) => a + b, 0);

            // indices within this triangle
            const localIdx = idx % triangleParticles;
            const edgeParticles = Math.floor(Math.sqrt(triangleParticles) * 2);
            const horizontalLinesCount = 3;

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
                for (let line = 0; line <= horizontalLinesCount; line++) {
                    const lineProgress = line / horizontalLinesCount;
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