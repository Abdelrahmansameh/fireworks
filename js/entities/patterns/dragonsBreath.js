import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
const spreadMin = 0.35;
const spreadMax = 1.0;
const coneHalfAngleBase = 0.12;
const coneHalfAngleSpread = 0.18;
const coreBiasPower = 1.9;
const angleOffsetInnerWeight = 0.3;
const angleOffsetOuterWeight = 0.7;
const initialAgeBase = 0.06;
const initialAgeSpreadScale = 0.06;
const plumeDurationBase = 0.28;
const plumeDurationSpreadScale = 0.22;
const plumeDurationJitter = 0;
const plumeLengthBase = 50;
const plumeLengthSpreadScale = 100;
const plumeLengthJitter = 30;
const plumeWidthBase = 5;
const plumeWidthSpreadScale = 16;
const plumeWidthJitter = 1;
const bloomWeightPower = 2.8;
const bloomThresholdBase = 0.62;
const bloomThresholdJitter = 0;
const bloomRadiusBase = 0.3;
const bloomRadiusJitter = 0;
const bloomDirectionJitter = 0;
const curlAmplitudeBase = 0.36;
const curlAmplitudeJitter = 0.1;
const curlFrequencyBase = 4;
const curlFrequencyJitter = 0;
const curlPhaseSequenceScale = 0.18;
const curlPhaseJitter = 0;
const updraftBase = 8;
const updraftJitter = 0;
const nozzleDistanceBase = 2;
const nozzleDistanceJitter = 0;
const nozzleWidthBase = 1;
const nozzleWidthJitter = 0;
const minimumLifetime = 0.1;
const travelMax = 3;
const progressCurveStrength = 1.0;
const bloomDivisorMinimum = 0.001;
const coneWidthPower = 0.8;
const coneWidthLifeFade = 0.2;
const curlProgressInfluence = 2;
const curlLifeFade = 0.35;
const lateralCoreBase = 0.2;
const lateralOuterScale = 0.8;
const bloomOffsetBase = 0.2;
const bloomOffsetWeightScale = 0.8;
const headPushBase = 0.12;
const headPushWeightScale = 0.2;
const riseBase = 2;
const riseProgressScale = 0.4;
const motionMinDuration = 0.01;
const motionCurlScale = 0.08;
const motionBloomScale = 0.5;
const motionUpdraftScale = 0.5;
const nozzleLateralScale = 0.25;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

const dragonsBreathRecipe = new ParticleRecipe({
	name: 'dragonsBreath',
	count: ctx => ctx.particleCount,
	calcInitialState: (index, ctx) => {
		const origin = ctx.rocketPos.clone();
		const direction = Math.PI / 8 + (Math.random() - 0.5) * TAU / 8; // generally upward, with some random variation
		const spreadStrength = clamp(ctx.spread, spreadMin, spreadMax);
		const coneHalfAngle = coneHalfAngleBase + spreadStrength * coneHalfAngleSpread;

		const coreBias = Math.pow(Math.random(), coreBiasPower);
		const angleOffset = (Math.random() - 0.5) * 2 * coneHalfAngle * (
			angleOffsetInnerWeight + (1 - coreBias) * angleOffsetOuterWeight
		);
		const localAngle = direction + angleOffset;
		const dirX = Math.cos(localAngle);
		const dirY = Math.sin(localAngle);
		const normalX = -dirY;
		const normalY = dirX;

		const sequenceT = ctx.total > 1 ? index / (ctx.total - 1) : 0;
		const initialAge = Math.random() * (
			initialAgeBase + spreadStrength * initialAgeSpreadScale
		);
		const plumeDuration = plumeDurationBase
			+ spreadStrength * plumeDurationSpreadScale
			+ Math.random() * plumeDurationJitter;
		const length = plumeLengthBase
			+ spreadStrength * plumeLengthSpreadScale
			+ Math.random() * plumeLengthJitter;
		const width = plumeWidthBase
			+ spreadStrength * plumeWidthSpreadScale
			+ Math.random() * plumeWidthJitter;
		const bloomWeight = Math.pow(Math.random(), bloomWeightPower);
		const bloomThreshold = bloomThresholdBase + Math.random() * bloomThresholdJitter;
		const bloomRadius = width * (bloomRadiusBase + Math.random() * bloomRadiusJitter);
		const bloomDirAngle = direction + (Math.random() - 0.5) * bloomDirectionJitter;
		const bloomDirX = Math.cos(bloomDirAngle);
		const bloomDirY = Math.sin(bloomDirAngle);
		const sideBias = (Math.random() - 0.5) * 2;
		const curlAmplitude = width * (curlAmplitudeBase + Math.random() * curlAmplitudeJitter);
		const curlFrequency = curlFrequencyBase + Math.random() * curlFrequencyJitter;
		const sharedCurlPhase = ctx.randomSeed * Math.PI;
		const curlPhase = sharedCurlPhase
			+ sequenceT * TAU * curlPhaseSequenceScale
			+ (Math.random() - 0.5) * TAU * curlPhaseJitter;
		const updraft = updraftBase + Math.random() * updraftJitter;
		const nozzleDistance = nozzleDistanceBase + Math.random() * nozzleDistanceJitter;
		const nozzleWidth = nozzleWidthBase + Math.random() * nozzleWidthJitter;
		let age = initialAge;

		const updateFn = (pState, delta) => {
			age += delta;

			const lifeT = clamp(age / Math.max(minimumLifetime, ctx.component.lifetime), 0, 1);
			const travelT = clamp(age / plumeDuration, 0, travelMax);
			const progress = 1 - Math.exp(-travelT * progressCurveStrength);
			const bloomT = clamp(
				(progress - bloomThreshold) / Math.max(bloomDivisorMinimum, 1 - bloomThreshold),
				0,
				1
			);

			const forwardDistance = nozzleDistance + progress * length;
			const coneWidth = width * Math.pow(progress, coneWidthPower) * (1 - lifeT * coneWidthLifeFade);
			const curl = Math.sin(age * curlFrequency + curlPhase) * curlAmplitude * progress * curlProgressInfluence * (1 - lifeT * curlLifeFade);
			const lateralOffset = sideBias * coneWidth * (
				lateralCoreBase + (1 - coreBias) * lateralOuterScale
			) + curl;
			const bloomOffset = bloomRadius * bloomT * bloomT * (
				bloomOffsetBase + bloomWeight * bloomOffsetWeightScale
			);
			const headPush = bloomT * width * (
				headPushBase + bloomWeight * headPushWeightScale
			);
			const rise = updraft * age * (
				riseBase + progress * riseProgressScale
			);

			pState.position.x = origin.x
				+ dirX * (forwardDistance + headPush)
				+ normalX * (nozzleWidth * sideBias * nozzleLateralScale + lateralOffset)
				+ bloomDirX * bloomOffset;
			pState.position.y = origin.y
				+ dirY * (forwardDistance + headPush)
				+ normalY * (nozzleWidth * sideBias * nozzleLateralScale + lateralOffset)
				+ bloomDirY * bloomOffset
				+ rise;

			const motionX = dirX * (length / Math.max(motionMinDuration, plumeDuration))
				+ normalX * curlFrequency * curlAmplitude * motionCurlScale
				+ bloomDirX * bloomOffset * motionBloomScale;
			const motionY = dirY * (length / Math.max(motionMinDuration, plumeDuration))
				+ normalY * curlFrequency * curlAmplitude * motionCurlScale
				+ bloomDirY * bloomOffset * motionBloomScale
				+ updraft * motionUpdraftScale;
			pState.velocity.set(0, 0);
			pState.acceleration.set(0, 0);
			pState.rotation = Math.atan2(motionY, motionX);
		};

		return {
			pos: new Renderer2D.Vector2(origin.x, origin.y),
			vel: new Renderer2D.Vector2(0, 0),
			accel: new Renderer2D.Vector2(0, 0),
			gravity: 0,
			updateFn,
		};
	}
});

export default dragonsBreathRecipe;
