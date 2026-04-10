import Building from './Building.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { PARTICLE_TYPES } from '../config/config.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances } from '../animation/SkeletonAnimator.js';

class ResourceGenerator extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'RESOURCE_GENERATOR', x, y, data);

        this.resourceType = data.resourceType || this.config.resourceType;
        this.accumulator = data.accumulator || 0;

        this._skeleton = null;
        this._animData = null;
        this._instancedGroup = null;
        this._animTimer = Math.random() * 3;

        this._loadSkeleton();
    }

    createMesh() {
    }

    get productionRate() {
        return this.calculateProductionRate();
    }

    calculateProductionRate() {
        return this.config.baseProductionRate * (this.game.generatorStats?.productionRateMultiplier ?? 1);
    }

    update(deltaTime) {
        super.update(deltaTime);

        this._animTimer += deltaTime;
        if (this._skeleton && this._instancedGroup) {
            this._renderFrame();
        }

        this.accumulator += deltaTime;
        this.accumulator = Math.min(this.accumulator, this.config.maxAccumulator); 

        if (this.accumulator >= 1.0) {
            const resource = this.game.resourceManager.resources[this.resourceType];
            if (resource) {
                const amount = this.productionRate;
                if (this.resourceType === 'sparkles') {
                    this.game.addSparkles(amount, 'resource_generator');
                } else if (this.resourceType === 'gold') {
                    this.game.addGold(amount, 'resource_generator');
                } else {
                    resource.add(amount);
                }

                // Emit trail particle burst when generating sparkles
                if (this.resourceType === 'sparkles') {
                    this.emitSparkleTrailBurst();
                }
            }
            this.accumulator -= 1.0;
        }
    }

    async _loadSkeleton() {
        try {
            const url = this.config.skeletonUrl;
            if (!url) return;
            const { skeleton, rawAnimations } = await SkeletonData.load(url);
            this._skeleton = skeleton;
            this._animData = new AnimationData(rawAnimations);
        } catch (e) {
            console.error('ResourceGenerator: failed to load skeleton', e);
            return;
        }

        try {
            const geometry = Renderer2D.buildTexturedSquare(1, 1);
            this._instancedGroup = this.game.renderer2D.createInstancedGroup({
                vertices: geometry.vertices,
                indices: geometry.indices,
                texCoords: geometry.texCoords,
                texture: null,
                maxInstances: this._skeleton.partCount,
                zIndex: this.config.zIndex || 5,
                blendMode: Renderer2D.BlendMode.NORMAL,
            });

            for (let i = 0; i < this._skeleton.partCount; i++) {
                this._instancedGroup.addInstanceRaw(this.x, this.y, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
            }

            this._renderFrame();
        } catch (e) {
            console.error('ResourceGenerator: failed to create instanced group', e);
        }
    }

    _renderFrame() {
        if (!this._skeleton || !this._instancedGroup) return;

        const clip = this._animData ? this._animData.getClip('idle') : null;


        const time = clip
            ? (clip.loop ? this.accumulator % clip.duration : Math.min(this.accumulator, clip.duration))
            : 0;

        const pose = computePose(this._skeleton, clip, time);

        applyPoseToInstances(
            this._skeleton, pose, this._instancedGroup,
            0,
            this.x, this.y,
            this.config.skeletonScale,
            1
        );
    }

    emitSparkleTrailBurst() {
        if (!this.game.particleSystem) return;

        const burstCount = 15;
        const particleLifetime = 1;
        const particleSize = 1.5;
        const velocitySpread = 100;


        const centerX = this.x;
        const centerY = this.y + (this.config.skeletonScale);

        for (let i = 0; i < burstCount; i++) {
            const randomColor = new Renderer2D.Color(
                Math.random(),
                Math.random(),
                Math.random(),
                0.8
            );

            const angle = Math.random() * Math.PI * 2;
            const randomSpread = Math.random() * velocitySpread;
            const risingSpeed = (Math.random() + 0.5) * 150;
            const velocity = new Renderer2D.Vector2(
                Math.cos(angle) * randomSpread,
                risingSpeed
            );

            const position = new Renderer2D.Vector2(
                centerX + (Math.random() - 0.5) * 10,
                centerY
            );

            this.game.particleSystem.addParticle(
                position,
                velocity,
                randomColor,
                particleSize,
                particleLifetime,
                130, // gravity
                'sphere',
                new Renderer2D.Vector2(0, 0),
                2.0, // friction
                0, //  glow
                0, //  blur
                null, //  update function
                false, //  gradient
                null,
                0.0,
                1.0,
                PARTICLE_TYPES.RESOURCE_GENERATOR
            );
        }
    }

    getProductionRate() {
        return this.productionRate;
    }

    serialize() {
        return {
            ...super.serialize(),
            resourceType: this.resourceType,
            accumulator: this.accumulator,
        };
    }
}

export default ResourceGenerator;
