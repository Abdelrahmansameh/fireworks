import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const ARM_COUNT = 6;
const OUTLINE_RATIO = 0.82;
const MID_BRANCH_ANGLE = Math.PI / 3.35;
const OUTER_BRANCH_ANGLE = Math.PI / 3.6;

const snowflakeRecipe = new ParticleRecipe({
    name: 'snowflake',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const total = Math.max(1, ctx.total || ctx.particleCount || 1);
        const outlineCount = Math.min(total, Math.max(ARM_COUNT, Math.floor(total * OUTLINE_RATIO)));
        const interiorCount = Math.max(0, total - outlineCount);
        const isOutline = i < outlineCount;
        const armLength = 11 * ctx.spread;
        const coreRadius = armLength * 0.08;
        const velocityScale = ctx.speed * 0.09;

        let armIndex;
        let armAngle;
        let localX;
        let localY;
        let accentParticle = false;

        if (isOutline) {
            armIndex = Math.min(ARM_COUNT - 1, Math.floor((i * ARM_COUNT) / outlineCount));
            const armStart = Math.floor((armIndex * outlineCount) / ARM_COUNT);
            const armEnd = Math.floor(((armIndex + 1) * outlineCount) / ARM_COUNT);
            const armParticleCount = Math.max(1, armEnd - armStart);
            const localIndex = i - armStart;
            const localT = armParticleCount > 1 ? localIndex / (armParticleCount - 1) : 0.5;

            armAngle = -Math.PI / 2 + (armIndex / ARM_COUNT) * TAU;

            if (localT < 0.46) {
                const segmentT = localT / 0.46;
                localX = coreRadius + (armLength - coreRadius) * segmentT;
                localY = 0;
                accentParticle = segmentT > 0.95;
            } else if (localT < 0.62) {
                const segmentT = (localT - 0.46) / 0.16;
                const branchLength = armLength * 0.24;
                const branchAnchor = armLength * 0.38;
                localX = branchAnchor + Math.cos(MID_BRANCH_ANGLE) * branchLength * segmentT;
                localY = Math.sin(MID_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > 0.84;
            } else if (localT < 0.78) {
                const segmentT = (localT - 0.62) / 0.16;
                const branchLength = armLength * 0.24;
                const branchAnchor = armLength * 0.38;
                localX = branchAnchor + Math.cos(MID_BRANCH_ANGLE) * branchLength * segmentT;
                localY = -Math.sin(MID_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > 0.84;
            } else if (localT < 0.89) {
                const segmentT = (localT - 0.78) / 0.11;
                const branchLength = armLength * 0.17;
                const branchAnchor = armLength * 0.68;
                localX = branchAnchor + Math.cos(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                localY = Math.sin(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > 0.76;
            } else {
                const segmentT = (localT - 0.89) / 0.11;
                const branchLength = armLength * 0.17;
                const branchAnchor = armLength * 0.68;
                localX = branchAnchor + Math.cos(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                localY = -Math.sin(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > 0.76;
            }
        } else {
            const interiorIndex = i - outlineCount;
            const interiorBandCount = Math.max(1, Math.ceil(Math.max(1, interiorCount) / ARM_COUNT));
            armIndex = interiorIndex % ARM_COUNT;
            const bandIndex = Math.floor(interiorIndex / ARM_COUNT);
            const bandT = interiorBandCount > 1 ? bandIndex / (interiorBandCount - 1) : 0.5;
            const offsetAngle = bandIndex % 2 === 0 ? 0 : Math.PI / ARM_COUNT;

            armAngle = -Math.PI / 2 + (armIndex / ARM_COUNT) * TAU + offsetAngle;
            localX = armLength * (0.12 + bandT * 0.16);
            localY = 0;
        }

        const cosAngle = Math.cos(armAngle);
        const sinAngle = Math.sin(armAngle);
        const worldX = localX * cosAngle - localY * sinAngle;
        const worldY = localX * sinAngle + localY * cosAngle;
        const particleColor = accentParticle && ctx.secondaryColor ? ctx.secondaryColor : ctx.primaryColor;

        return {
            pos: ctx.rocketPos.clone(),
            vel: new Renderer2D.Vector2(worldX * velocityScale, worldY * velocityScale),
            accel: new Renderer2D.Vector2(0, 0),
            color: particleColor,
        };
    }
});

export default snowflakeRecipe;