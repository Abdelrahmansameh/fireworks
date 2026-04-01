import { state } from './state.js';
import { evalTrack } from '../../../js/animation/AnimationData.js';
import { computePose } from '../../../js/animation/SkeletonAnimator.js';
import { SkeletonData } from '../../../js/animation/SkeletonData.js';
import { hexToRgb as gameHexToRgb } from '../../../js/animation/SkeletonData.js';

export { evalTrack, computePose, gameHexToRgb as hexToRgb, SkeletonData };

export function getParentTransform(partId, time) {
    if (state.currentPose && state.currentPose.has(partId)) {
        const tf = state.currentPose.get(partId);
        return {
            x: tf.x,
            y: tf.y,
            rotation: tf.rotation,
            scaleX: 1,
            scaleY: 1
        };
    }

    return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}


