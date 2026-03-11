import ParticleRecipe from './ParticleRecipe.js';
import * as Renderer2D from '../../rendering/Renderer.js';

const TAU = Math.PI * 2;
// Glossary for the dragon-breath motion terms used below:
// plume: the main jet of particles traveling outward from the burst origin.
// bloom: the flare/opening at the front of the plume once it has traveled far enough.
// curl: the side-to-side turbulent wobble layered onto the plume.
// nozzle: the emission opening near the origin that gives particles an initial offset/spread.
// updraft: the upward lift from hot air that makes the flame rise over time.
const DRAGON_BREATH_TUNING = {
	spreadMin: 0.35,
	spreadMax: 1.0,
	coneHalfAngleBase: 0.12,
	coneHalfAngleSpread: 0.18,
	coreBiasPower: 1.9,
	angleOffsetInnerWeight: 0.3,
	angleOffsetOuterWeight: 0.7,
	initialAgeBase: 0.06,
	initialAgeSpreadScale: 0.06,
	plumeDurationBase: 0.28,
	plumeDurationSpreadScale: 0.22,
	plumeDurationJitter: 0,
	plumeLengthBase: 50,
	plumeLengthSpreadScale: 100,
	plumeLengthJitter: 30,
	plumeWidthBase: 5,
	plumeWidthSpreadScale: 16,
	plumeWidthJitter: 1,
	bloomWeightPower: 2.8,
	bloomThresholdBase: 0.62,
	bloomThresholdJitter: 0,
	bloomRadiusBase: 0.3,
	bloomRadiusJitter: 0,
	bloomDirectionJitter: 0,
	curlAmplitudeBase: 0.36,
	curlAmplitudeJitter: 0.1,
	curlFrequencyBase: 4,
	curlFrequencyJitter: 0,
	curlPhaseSequenceScale: 0.18,
	curlPhaseJitter: 0,
	updraftBase: 8,
	updraftJitter: 0,
	nozzleDistanceBase: 2,
	nozzleDistanceJitter: 0,
	nozzleWidthBase: 1,
	nozzleWidthJitter: 0,
	minimumLifetime: 0.1,
	travelMax: 3,
	progressCurveStrength: 1.0,
	bloomDivisorMinimum: 0.001,
	coneWidthPower: 0.8,
	coneWidthLifeFade: 0.2,
	curlProgressInfluence: 2,
	curlLifeFade: 0.35,
	lateralCoreBase: 0.2,
	lateralOuterScale: 0.8,
	bloomOffsetBase: 0.2,
	bloomOffsetWeightScale: 0.8,
	headPushBase: 0.12,
	headPushWeightScale: 0.2,
	riseBase: 2,
	riseProgressScale: 0.4,
	motionMinDuration: 0.01,
	motionCurlScale: 0.08,
	motionBloomScale: 0.5,
	motionUpdraftScale: 0.5,
	nozzleLateralScale: 0.25,
};

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

const dragonsBreathRecipe = new ParticleRecipe({
	name: 'dragonsBreath',
	count: ctx => ctx.particleCount,
	calcInitialState: (index, ctx) => {
		const origin = ctx.rocketPos.clone();
		const direction =  Math.PI / 8 + (Math.random() - 0.5) * TAU / 8; // generally upward, with some random variation
		const spreadStrength = clamp(ctx.spread, DRAGON_BREATH_TUNING.spreadMin, DRAGON_BREATH_TUNING.spreadMax);
		const coneHalfAngle = DRAGON_BREATH_TUNING.coneHalfAngleBase + spreadStrength * DRAGON_BREATH_TUNING.coneHalfAngleSpread;

		const coreBias = Math.pow(Math.random(), DRAGON_BREATH_TUNING.coreBiasPower);
		const angleOffset = (Math.random() - 0.5) * 2 * coneHalfAngle * (
			DRAGON_BREATH_TUNING.angleOffsetInnerWeight + (1 - coreBias) * DRAGON_BREATH_TUNING.angleOffsetOuterWeight
		);
		const localAngle = direction + angleOffset;
		const dirX = Math.cos(localAngle);
		const dirY = Math.sin(localAngle);
		const normalX = -dirY;
		const normalY = dirX;

		const sequenceT = ctx.total > 1 ? index / (ctx.total - 1) : 0;
		const initialAge = Math.random() * (
			DRAGON_BREATH_TUNING.initialAgeBase + spreadStrength * DRAGON_BREATH_TUNING.initialAgeSpreadScale
		);
		const plumeDuration = DRAGON_BREATH_TUNING.plumeDurationBase
			+ spreadStrength * DRAGON_BREATH_TUNING.plumeDurationSpreadScale
			+ Math.random() * DRAGON_BREATH_TUNING.plumeDurationJitter;
		const length = DRAGON_BREATH_TUNING.plumeLengthBase
			+ spreadStrength * DRAGON_BREATH_TUNING.plumeLengthSpreadScale
			+ Math.random() * DRAGON_BREATH_TUNING.plumeLengthJitter;
		const width = DRAGON_BREATH_TUNING.plumeWidthBase
			+ spreadStrength * DRAGON_BREATH_TUNING.plumeWidthSpreadScale
			+ Math.random() * DRAGON_BREATH_TUNING.plumeWidthJitter;
		const bloomWeight = Math.pow(Math.random(), DRAGON_BREATH_TUNING.bloomWeightPower);
		const bloomThreshold = DRAGON_BREATH_TUNING.bloomThresholdBase + Math.random() * DRAGON_BREATH_TUNING.bloomThresholdJitter;
		const bloomRadius = width * (DRAGON_BREATH_TUNING.bloomRadiusBase + Math.random() * DRAGON_BREATH_TUNING.bloomRadiusJitter);
		const bloomDirAngle = direction + (Math.random() - 0.5) * DRAGON_BREATH_TUNING.bloomDirectionJitter;
		const bloomDirX = Math.cos(bloomDirAngle);
		const bloomDirY = Math.sin(bloomDirAngle);
		const sideBias = (Math.random() - 0.5) * 2;
		const curlAmplitude = width * (DRAGON_BREATH_TUNING.curlAmplitudeBase + Math.random() * DRAGON_BREATH_TUNING.curlAmplitudeJitter);
		const curlFrequency = DRAGON_BREATH_TUNING.curlFrequencyBase + Math.random() * DRAGON_BREATH_TUNING.curlFrequencyJitter;
		const sharedCurlPhase = ctx.randomSeed * Math.PI;
		const curlPhase = sharedCurlPhase
			+ sequenceT * TAU * DRAGON_BREATH_TUNING.curlPhaseSequenceScale
			+ (Math.random() - 0.5) * TAU * DRAGON_BREATH_TUNING.curlPhaseJitter;
		const updraft = DRAGON_BREATH_TUNING.updraftBase + Math.random() * DRAGON_BREATH_TUNING.updraftJitter;
		const nozzleDistance = DRAGON_BREATH_TUNING.nozzleDistanceBase + Math.random() * DRAGON_BREATH_TUNING.nozzleDistanceJitter;
		const nozzleWidth = DRAGON_BREATH_TUNING.nozzleWidthBase + Math.random() * DRAGON_BREATH_TUNING.nozzleWidthJitter;
		let age = initialAge;

		const updateFn = (pState, delta) => {
			age += delta;

			const lifeT = clamp(age / Math.max(DRAGON_BREATH_TUNING.minimumLifetime, ctx.component.lifetime), 0, 1);
			const travelT = clamp(age / plumeDuration, 0, DRAGON_BREATH_TUNING.travelMax);
			const progress = 1 - Math.exp(-travelT * DRAGON_BREATH_TUNING.progressCurveStrength);
			const bloomT = clamp(
				(progress - bloomThreshold) / Math.max(DRAGON_BREATH_TUNING.bloomDivisorMinimum, 1 - bloomThreshold),
				0,
				1
			);

			const forwardDistance = nozzleDistance + progress * length;
			const coneWidth = width * Math.pow(progress, DRAGON_BREATH_TUNING.coneWidthPower) * (1 - lifeT * DRAGON_BREATH_TUNING.coneWidthLifeFade);
			const curl = Math.sin(age * curlFrequency + curlPhase) * curlAmplitude * progress * DRAGON_BREATH_TUNING.curlProgressInfluence * (1 - lifeT * DRAGON_BREATH_TUNING.curlLifeFade);
			const lateralOffset = sideBias * coneWidth * (
				DRAGON_BREATH_TUNING.lateralCoreBase + (1 - coreBias) * DRAGON_BREATH_TUNING.lateralOuterScale
			) + curl;
			const bloomOffset = bloomRadius * bloomT * bloomT * (
				DRAGON_BREATH_TUNING.bloomOffsetBase + bloomWeight * DRAGON_BREATH_TUNING.bloomOffsetWeightScale
			);
			const headPush = bloomT * width * (
				DRAGON_BREATH_TUNING.headPushBase + bloomWeight * DRAGON_BREATH_TUNING.headPushWeightScale
			);
			const rise = updraft * age * (
				DRAGON_BREATH_TUNING.riseBase + progress * DRAGON_BREATH_TUNING.riseProgressScale
			);

			pState.position.x = origin.x
				+ dirX * (forwardDistance + headPush)
				+ normalX * (nozzleWidth * sideBias * DRAGON_BREATH_TUNING.nozzleLateralScale + lateralOffset)
				+ bloomDirX * bloomOffset;
			pState.position.y = origin.y
				+ dirY * (forwardDistance + headPush)
				+ normalY * (nozzleWidth * sideBias * DRAGON_BREATH_TUNING.nozzleLateralScale + lateralOffset)
				+ bloomDirY * bloomOffset
				+ rise;

			const motionX = dirX * (length / Math.max(DRAGON_BREATH_TUNING.motionMinDuration, plumeDuration))
				+ normalX * curlFrequency * curlAmplitude * DRAGON_BREATH_TUNING.motionCurlScale
				+ bloomDirX * bloomOffset * DRAGON_BREATH_TUNING.motionBloomScale;
			const motionY = dirY * (length / Math.max(DRAGON_BREATH_TUNING.motionMinDuration, plumeDuration))
				+ normalY * curlFrequency * curlAmplitude * DRAGON_BREATH_TUNING.motionCurlScale
				+ bloomDirY * bloomOffset * DRAGON_BREATH_TUNING.motionBloomScale
				+ updraft * DRAGON_BREATH_TUNING.motionUpdraftScale;
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
