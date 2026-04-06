import Building from './Building.js';
import { GAME_BOUNDS } from '../config/config.js';
import { SkeletonData } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances } from '../animation/SkeletonAnimator.js';
import * as Renderer2D from '../rendering/Renderer.js';

const THROW_RELEASE_FRACTION = 0.35 / 1.2; 

const APPROACH_OFFSET_X = 70;

const LAUNCH_VX = 3500;
const LAUNCH_VY = 1700;

class Catapult extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'CATAPULT', x, y, data);

        this.accumulator = data.accumulator ?? this.config.baseFireInterval; // stagger first fire

        this._skeleton = null;
        this._animData = null;
        this._instancedGroup = null;
        this._animTimer = 0;
        this._clipName = 'idle';


        this._state = 'cooldown';
        this._assignedPersonIndex = -1;

        this._loadSkeleton();
    }


    createMesh() {
    }

    async _loadSkeleton() {
        try {
            const url = this.config.skeletonUrl;
            const { skeleton, rawAnimations } = await SkeletonData.load(url);
            this._skeleton = skeleton;
            this._animData = new AnimationData(rawAnimations);
        } catch (e) {
            console.error('Catapult: failed to load skeleton', e);
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
                zIndex: 5,
                blendMode: Renderer2D.BlendMode.NORMAL,
            });

            for (let i = 0; i < this._skeleton.partCount; i++) {
                this._instancedGroup.addInstanceRaw(this.x, this.y, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
            }

            this._renderFrame();
        } catch (e) {
            console.error('Catapult: failed to create instanced group', e);
        }
    }


    _setState(state) {
        this._state = state;
    }

    _renderFrame() {
        if (!this._skeleton || !this._instancedGroup) return;

        const clipName = this._clipName;
        const clip = this._animData ? this._animData.getClip(clipName) : null;
        const time = clip
            ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
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

    /**
     * Returns the world-space position of the catapult's "head" part at the
     * current animation time (for attaching a crowd member).
     * @returns {{x: number, y: number}}
     */
    getHeadWorldPos() {
        if (!this._skeleton || !this._animData) {
            return { x: this.x, y: this.y + 40 };
        }

        const clipName = this._clipName;
        const clip = this._animData.getClip(clipName);
        const time = clip
            ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
            : 0;

        const pose = computePose(this._skeleton, clip, time);
        const headTf = pose.get('head');
        if (!headTf) return { x: this.x, y: this.y + 40 };

        const scale = this.config.skeletonScale;
        return {
            x: this.x + headTf.x * scale,
            y: this.y + headTf.y * scale,
        };
    }

    /**
     * World X position the crowd member should walk to before jumping onto the catapult.
     */
    get approachX() {
        return this.x + APPROACH_OFFSET_X;
    }


    update(deltaTime) {
        this._animTimer += deltaTime;
        this._runStateMachine(deltaTime);
        this._renderFrame();
    }

    _runStateMachine(deltaTime) {
        switch (this._state) {
            case 'cooldown': {
                this.accumulator -= deltaTime;
                if (this.accumulator <= 0) {
                    this._requestPerson();
                }
                break;
            }

            case 'requesting':
                break;

            case 'loading':
                break;

            case 'ready':
                this._beginFire();
                break;

            case 'firing': {
                const clip = this._animData ? this._animData.getClip('throwing') : null;
                const clipDur = clip ? clip.duration : 1.2;
                const releaseTime = THROW_RELEASE_FRACTION * clipDur;

                if (this._animTimer >= releaseTime && this._assignedPersonIndex >= 0) {
                    this._launchPerson();
                }

                if (this._animTimer >= clipDur) {
                    this._playClip('idle');
                    this.accumulator = this.config.baseFireInterval;
                    this._setState('cooldown');
                    this._assignedPersonIndex = -1;
                }
                break;
            }
        }
    }

    _requestPerson() {
        const crowd = this.game.crowd;
        if (!crowd) return;

        const idx = crowd.assignPersonToCatapult(this);
        if (idx < 0) {
            this.accumulator = 1.0;
            return;
        }

        this._assignedPersonIndex = idx;
        this._setState('requesting');
        this._playClip('idle');
    }

    _beginFire() {
        this._animTimer = 0;
        this._playClip('throwing');
        this._setState('firing');
    }

    _launchPerson() {
        const crowd = this.game.crowd;
        if (!crowd || this._assignedPersonIndex < 0) return;

        crowd.launchPersonFromCatapult(this._assignedPersonIndex, LAUNCH_VX, LAUNCH_VY);
        this._assignedPersonIndex = -1;
    }

    _playClip(name) {
        if (this._clipName !== name) {
            this._clipName = name;
            this._animTimer = 0;
        }
    }


    onPersonWalking() {
        this._setState('loading');
    }


    onPersonReachedHead() {
        this._setState('ready');
    }


    setPosition(x, y) {
        this.x = Math.max(GAME_BOUNDS.CATAPULT_MIN_X, Math.min(x, GAME_BOUNDS.CATAPULT_MAX_X));
        this.y = y;
    }

    serialize() {
        return {
            ...super.serialize(),
            accumulator: this.accumulator,
        };
    }

    destroy() {
        if (this._instancedGroup) {
            this.game.renderer2D.removeInstancedGroup(this._instancedGroup);
            this._instancedGroup = null;
        }
    }
}

export default Catapult;
