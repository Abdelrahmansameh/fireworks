import Building from './Building.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { PARTICLE_TYPES } from '../config/config.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances, computeSkeletonOutlinePoints } from '../animation/SkeletonAnimator.js';

class ResourceGenerator extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'RESOURCE_GENERATOR', x, y, data);

        this.resourceType = data.resourceType || this.config.resourceType;
        this.accumulator = Math.random() ;

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

        const clipName = (this.resourceType === 'sparkles') ? 'shooting' : 'idle';
        const clip = this._animData ? this._animData.getClip(clipName) : null;

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

        const particleLifetime = 1;
        const baseCount = this.config.sparkleTrailBaseCount ?? 15;
        const scalingRatio = this.config.sparkleTrailScalingRatio ?? 1.0;
        const productionMultiplier = (this.config.baseProductionRate > 0)
            ? (this.productionRate / this.config.baseProductionRate)
            : (this.game.generatorStats?.productionRateMultiplier ?? 1);
        const burstCount = Math.min(this.config.maxSparkleTrailBurstCount, Math.max(1, Math.round(baseCount * (1 + (productionMultiplier - 1) * scalingRatio))));

        const particleSize = 1.5;
        const velocitySpread = 100;


        // Compute spawn center from the skeleton's `roof` bone when available.
        // Fallback to the old heuristic if skeleton data isn't ready.
        let centerX = this.x;
        let centerY = this.y + (this.config.skeletonScale) - 20;

        if (this._skeleton && this._animData) {
            const clipName = 'shooting';
            const clip = this._animData ? this._animData.getClip(clipName) : null;
            const time = clip
                ? (clip.loop ? this.accumulator % clip.duration : Math.min(this.accumulator, clip.duration))
                : 0;
            const pose = computePose(this._skeleton, clip, time);

            const roofPart = this._skeleton.getPart ? this._skeleton.getPart('body') : null;
            const roofTf = pose.get && pose.get('body');
            if (roofPart && roofTf) {
                const anchorOffX = roofPart.anchorX * roofPart.width;
                const anchorOffY = roofPart.anchorY * roofPart.height;
                const cosR = Math.cos(roofTf.rotation);
                const sinR = Math.sin(roofTf.rotation);

                const meshDrawX = roofTf.x - (anchorOffX * cosR - anchorOffY * sinR);
                const meshDrawY = roofTf.y - (anchorOffX * sinR + anchorOffY * cosR);

                const scale = this.config.skeletonScale || 1;
                const flipX = 1;

                centerX = this.x + meshDrawX * flipX * scale;
                centerY = this.y + meshDrawY * scale;

                // Move the spawn point above the roof by an amount equal to the roof's height (in world units).
                const worldPartHeight = roofPart.height * scale * (roofTf.scaleY ?? 1);
                centerY += worldPartHeight - 5;
            }
        }

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
                risingSpeed - Math.random() * risingSpeed * 0.2
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

    /**
     * Return the world-space convex hull outline of this building's skeleton at its current pose.
     * Returns null if the skeleton is not yet loaded.
     * @returns {{x:number,y:number}[]|null}
     */
    getSkeletonOutlinePoints() {
        if (!this._skeleton || !this._animData) return null;

        const clipName = (this.resourceType === 'sparkles') ? 'shooting' : 'idle';
        const clip = this._animData ? this._animData.getClip(clipName) : null;
        const time = clip
            ? (clip.loop ? this.accumulator % clip.duration : Math.min(this.accumulator, clip.duration))
            : 0;

        const pose = computePose(this._skeleton, clip, time);
        return computeSkeletonOutlinePoints(this._skeleton, pose, this.x, this.y, this.config.skeletonScale ?? 1, 1);
    }

    getProductionRate() {
        return this.productionRate;
    }

    isPointInside(x, y) {
        const scale = this.config.skeletonScale || 1.0;

        if (this._skeleton && this._animData) {
            const clipName = (this.resourceType === 'sparkles') ? 'shooting' : 'idle';
            const clip = this._animData ? this._animData.getClip(clipName) : null;
            const time = clip
                ? (clip.loop ? this.accumulator % clip.duration : Math.min(this.accumulator, clip.duration))
                : 0;

            const pose = computePose(this._skeleton, clip, time);

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            for (let i = 0; i < this._skeleton.parts.length; i++) {
                const part = this._skeleton.parts[i];
                const tf = pose.get(part.id);
                if (!tf) continue;

                const anchorOffX = part.anchorX * part.width;
                const anchorOffY = part.anchorY * part.height;
                const cosR = Math.cos(tf.rotation);
                const sinR = Math.sin(tf.rotation);

                const meshDrawX = tf.x - (anchorOffX * cosR - anchorOffY * sinR);
                const meshDrawY = tf.y - (anchorOffX * sinR + anchorOffY * cosR);

                const centerX = this.x + meshDrawX * scale;
                const centerY = this.y + meshDrawY * scale;

                const halfW = (part.width * scale) / 2;
                const halfH = (part.height * scale) / 2;

                const corners = [
                    [halfW, halfH],
                    [halfW, -halfH],
                    [-halfW, halfH],
                    [-halfW, -halfH],
                ];

                for (const c of corners) {
                    const dx = c[0], dy = c[1];
                    const rx = dx * Math.cos(tf.rotation) - dy * Math.sin(tf.rotation);
                    const ry = dx * Math.sin(tf.rotation) + dy * Math.cos(tf.rotation);
                    const cx = centerX + rx;
                    const cy = centerY + ry;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                }
            }

            if (minX === Infinity) return false;
            return x >= minX && x <= maxX && y >= minY && y <= maxY;
        }

        // Fallback: use boxed region based on configured width/height
        const width = this.config.width * scale;
        const height = this.config.height * scale;
        const halfWidth = width / 2;
        return (
            x >= this.x - halfWidth &&
            x <= this.x + halfWidth &&
            y >= this.y &&
            y <= this.y + height
        );
    }

    destroy() {
        if (this._instancedGroup) {
            this.game.renderer2D.removeInstancedGroup(this._instancedGroup);
            this._instancedGroup = null;
        }
        this._skeleton = null;
        this._animData = null;
        super.destroy();
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
