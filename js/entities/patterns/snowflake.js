import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const ARM_COUNT = 6;
const OUTLINE_RATIO = 0.82;
const MID_BRANCH_ANGLE = Math.PI / 3.35;
const OUTER_BRANCH_ANGLE = Math.PI / 3.6;

const ARM_LENGTH_MULT = 11;
const CORE_RADIUS_MULT = 0.08;
const VELOCITY_SCALE_MULT = 0.09;
const T_SEG_1_END = 0.46;
const T_SEG_2_LEN = 0.16;
const T_SEG_3_LEN = 0.16;
const T_SEG_4_LEN = 0.11;
const T_SEG_5_LEN = 0.11;
const MID_BRANCH_LENGTH_MULT = 0.24;
const MID_BRANCH_ANCHOR_MULT = 0.38;
const OUTER_BRANCH_LENGTH_MULT = 0.17;
const OUTER_BRANCH_ANCHOR_MULT = 0.68;
const ACCENT_T_1 = 0.95;
const ACCENT_T_2 = 0.84;
const ACCENT_T_3 = 0.76;
const INNER_BAND_OFFSET = 0.12;
const INNER_BAND_SCALE = 0.16;

const snowflakeRecipe = new ParticleRecipe({
    name: 'snowflake',
    count: ctx => ctx.particleCount,
    calcInitialState: (i, ctx) => {
        const total = Math.max(1, ctx.total || ctx.particleCount || 1);
        const outlineCount = Math.min(total, Math.max(ARM_COUNT, Math.floor(total * OUTLINE_RATIO)));
        const interiorCount = Math.max(0, total - outlineCount);
        const isOutline = i < outlineCount;
        const armLength = ARM_LENGTH_MULT * ctx.spread;
        const coreRadius = armLength * CORE_RADIUS_MULT;
        const velocityScale = ctx.speed * VELOCITY_SCALE_MULT;

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

            if (localT < T_SEG_1_END) {
                const segmentT = localT / T_SEG_1_END;
                localX = coreRadius + (armLength - coreRadius) * segmentT;
                localY = 0;
                accentParticle = segmentT > ACCENT_T_1;
            } else if (localT < T_SEG_1_END + T_SEG_2_LEN) {
                const segmentT = (localT - T_SEG_1_END) / T_SEG_2_LEN;
                const branchLength = armLength * MID_BRANCH_LENGTH_MULT;
                const branchAnchor = armLength * MID_BRANCH_ANCHOR_MULT;
                localX = branchAnchor + Math.cos(MID_BRANCH_ANGLE) * branchLength * segmentT;
                localY = Math.sin(MID_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > ACCENT_T_2;
            } else if (localT < T_SEG_1_END + T_SEG_2_LEN + T_SEG_3_LEN) {
                const segmentT = (localT - (T_SEG_1_END + T_SEG_2_LEN)) / T_SEG_3_LEN;
                const branchLength = armLength * MID_BRANCH_LENGTH_MULT;
                const branchAnchor = armLength * MID_BRANCH_ANCHOR_MULT;
                localX = branchAnchor + Math.cos(MID_BRANCH_ANGLE) * branchLength * segmentT;
                localY = -Math.sin(MID_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > ACCENT_T_2;
            } else if (localT < T_SEG_1_END + T_SEG_2_LEN + T_SEG_3_LEN + T_SEG_4_LEN) {
                const segmentT = (localT - (T_SEG_1_END + T_SEG_2_LEN + T_SEG_3_LEN)) / T_SEG_4_LEN;
                const branchLength = armLength * OUTER_BRANCH_LENGTH_MULT;
                const branchAnchor = armLength * OUTER_BRANCH_ANCHOR_MULT;
                localX = branchAnchor + Math.cos(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                localY = Math.sin(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > ACCENT_T_3;
            } else {
                const segmentT = (localT - (T_SEG_1_END + T_SEG_2_LEN + T_SEG_3_LEN + T_SEG_4_LEN)) / T_SEG_5_LEN;
                const branchLength = armLength * OUTER_BRANCH_LENGTH_MULT;
                const branchAnchor = armLength * OUTER_BRANCH_ANCHOR_MULT;
                localX = branchAnchor + Math.cos(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                localY = -Math.sin(OUTER_BRANCH_ANGLE) * branchLength * segmentT;
                accentParticle = segmentT > ACCENT_T_3;
            }
        } else {
            const interiorIndex = i - outlineCount;
            const interiorBandCount = Math.max(1, Math.ceil(Math.max(1, interiorCount) / ARM_COUNT));
            armIndex = interiorIndex % ARM_COUNT;
            const bandIndex = Math.floor(interiorIndex / ARM_COUNT);
            const bandT = interiorBandCount > 1 ? bandIndex / (interiorBandCount - 1) : 0.5;
            const offsetAngle = bandIndex % 2 === 0 ? 0 : Math.PI / ARM_COUNT;

            armAngle = -Math.PI / 2 + (armIndex / ARM_COUNT) * TAU + offsetAngle;
            localX = armLength * (INNER_BAND_OFFSET + bandT * INNER_BAND_SCALE);
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