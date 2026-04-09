import Building from './Building.js';
import Firework from '../entities/Firework.js';
import { GAME_BOUNDS, PRE_RECIPE_COMPONENT_DEFAULTS } from '../config/config.js';
import { SkeletonData, hexToRgb } from '../animation/SkeletonData.js';
import { AnimationData } from '../animation/AnimationData.js';
import { computePose, applyPoseToInstances } from '../animation/SkeletonAnimator.js';
import * as Renderer2D from '../rendering/Renderer.js';

class AutoLauncher extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'AUTO_LAUNCHER', x, y, data);

        this.accumulator = data.accumulator || Math.random() * 5;
        this.assignedRecipeIndex = data.assignedRecipeIndex ?? null;
        this.colorOverride = data.colorOverride || AutoLauncher._randomColor();
        this.patternOverride = data.patternOverride || null;

        this._skeleton = null;
        this._animData = null;
        this._instancedGroup = null;
        this._animTimer = 0;
        this._clipName = 'idle';
        this._lastResolvedColor = null;

        // Overlay state — additive firing animation played on top of idle
        this._overlayClip = null;
        this._overlayTimer = 0;

        this._loadSkeleton();
    }

    createMesh() {
        // legacy mesh removed, skeleton only
    }

    highlight(duration = 2.0) {
        this.highlightTimer = duration;
    }

    isPointInside(x, y) {
        const scale = this.config.skeletonScale || 1.0;

        // If we have a loaded skeleton, compute a tight AABB from the current pose
        if (this._skeleton && this._animData) {
            const clip = this._animData ? this._animData.getClip(this._clipName) : null;
            const time = clip
                ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
                : 0;

            let overlay = null;
            if (this._overlayClip) {
                if (this._overlayTimer < this._overlayClip.duration) {
                    overlay = {
                        clip: this._overlayClip,
                        time: this._overlayTimer,
                        mode: 'additive',
                        boneMask: null,
                    };
                }
            }

            const pose = computePose(this._skeleton, clip, time, null, overlay);

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

        // Fallback — legacy box based on configured width/height
        const width = this.config.width * scale;
        const height = this.config.height * scale;
        const halfWidth = width / 2;

        // Skeleton was previously centered at x and bottom-aligned at y
        return (
            x >= this.x - halfWidth &&
            x <= this.x + halfWidth &&
            y >= this.y &&
            y <= this.y + height
        );
    }

    async _loadSkeleton() {
        try {
            const url = this.config.skeletonUrl;
            const { skeleton, rawAnimations } = await SkeletonData.load(url);
            this._skeleton = skeleton;
            this._animData = new AnimationData(rawAnimations);

            // Force initial color resolve and apply
            const color = this._resolveCurrentColor();
            this._updateSkeletonColors(color);
        } catch (e) {
            console.error('AutoLauncher: failed to load skeleton', e);
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
            console.error('AutoLauncher: failed to create instanced group', e);
        }
    }

    _renderFrame() {
        if (!this._skeleton || !this._instancedGroup) return;

        // Base clip always plays (idle loops continuously)
        const clip = this._animData ? this._animData.getClip(this._clipName) : null;
        const time = clip
            ? (clip.loop ? this._animTimer % clip.duration : Math.min(this._animTimer, clip.duration))
            : 0;

        // Build overlay descriptor if a firing overlay is active
        let overlay = null;
        if (this._overlayClip) {
            if (this._overlayTimer >= this._overlayClip.duration) {
                // Overlay finished — clear it
                this._overlayClip = null;
                this._overlayTimer = 0;
            } else {
                overlay = {
                    clip: this._overlayClip,
                    time: this._overlayTimer,
                    mode: 'additive',
                    boneMask: null, // all bones
                };
            }
        }

        const pose = computePose(this._skeleton, clip, time, null, overlay);

        let tint = null;
        if (this.highlightTimer > 0) {
            const pulse = (Math.sin(this.highlightTimer * 10) + 1) / 2;
            tint = { r: 1, g: 1, b: 0.5, a: pulse * 0.5 }; // blend with yellow-white
        }

        applyPoseToInstances(
            this._skeleton, pose, this._instancedGroup,
            0,
            this.x, this.y,
            this.config.skeletonScale,
            1,
            tint
        );
    }

    _playClip(name) {
        if (this._clipName !== name) {
            this._clipName = name;
            this._animTimer = 0;
        }
    }

    /**
     * Start an additive overlay animation (e.g. firing recoil).
     * The base clip keeps playing uninterrupted.
     * @param {string} clipName
     */
    _startOverlay(clipName) {
        const clip = this._animData ? this._animData.getClip(clipName) : null;
        if (!clip) return;
        this._overlayClip = clip;
        this._overlayTimer = 0;
    }

    _resolveCurrentColor() {
        if (this.game.progression.isUnlocked('recipes_tab')) {
            const recipe = this.game.recipes[this.assignedRecipeIndex];
            if (recipe && recipe.components.length > 0) {
                return recipe.components[0].color;
            } else if (this.game.recipes.length > 0) {
                // If random recipe mode is technically active but no recipe assigned yet, 
                // just use the first recipe color or the current list color.
                return this.game.recipes[0].components[0].color;
            } else if (this.game.currentRecipeComponents.length > 0) {
                return this.game.currentRecipeComponents[0].color;
            }
        }

        return this.colorOverride || '#ffffff';
    }

    _updateSkeletonColors(hex) {
        if (!this._skeleton) return;

        const rgb = hexToRgb(hex);
        this._lastResolvedColor = hex;

        for (let i = 0; i < this._skeleton.parts.length; i++) {
            const part = this._skeleton.parts[i];
            // We color only the tube with the recipe/override color
            if (part.id === 'tube') {
                this._skeleton.partColors[i] = rgb;
            }
        }
    }

    get spawnInterval() {
        return this.config.baseSpawnInterval * (this.game.launcherStats?.spawnIntervalMultiplier ?? 1);
    }

    update(deltaTime) {
        // We do not call super.update() as it relies on this.mesh
        if (this.highlightTimer > 0) {
            this.highlightTimer -= deltaTime;
        }

        this._animTimer += deltaTime;

        // Advance overlay timer
        if (this._overlayClip) {
            this._overlayTimer += deltaTime;
        }

        this.accumulator += deltaTime;
        if (this.accumulator >= this.config.maxAccumulator) {
            this.accumulator = this.config.maxAccumulator + Math.random() * this.spawnInterval;
        }

        if (this.accumulator >= this.spawnInterval + Math.random()) {
            this.spawnFirework();
            this.accumulator -= this.spawnInterval;
        }

        // Handle dynamic color changes
        const currentColor = this._resolveCurrentColor();
        if (currentColor !== this._lastResolvedColor) {
            this._updateSkeletonColors(currentColor);
        }

        this._renderFrame();
    }

    spawnFirework() {
        // Fire the recoil as an additive overlay so idle keeps playing
        this._startOverlay('firing');

        const x = this.x;
        const launchY = GAME_BOUNDS.BUILDING_Y;

        let components;

        if (!this.game.progression.isUnlocked('recipes_tab')) {
            // Pre-recipe-tab: apply fixed defaults for all properties except color and pattern,
            // then apply colorOverride / patternOverride as usual.
            components = this.game.currentRecipeComponents.map(c => ({
                ...PRE_RECIPE_COMPONENT_DEFAULTS,
                color: c.color,
                pattern: c.pattern,
            }));
            if (this.patternOverride) {
                components = components.map(c => ({ ...c, pattern: this.patternOverride }));
            }
            if (this.colorOverride) {
                components = components.map(c => ({ ...c, color: this.colorOverride }));
            }
        } else {
            const recipe = this.game.recipes[this.assignedRecipeIndex];
            if (recipe) {
                components = recipe.components;
            } else if (this.game.recipes.length > 0) {
                const randomRecipe = this.game.recipes[Math.floor(Math.random() * this.game.recipes.length)];
                components = randomRecipe.components;
            } else {
                components = this.game.currentRecipeComponents;
            }
        }

        if (components.length === 0) {
            return;
        }

        const spawnX = x + (Math.random() * 0.2 - 0.15) * this.config.width;

        this.game.fireworkSystem.launch(spawnX, launchY, components, null);
        this.game.fireworkSystem.fireworkCount++;

        const yieldMulti = this.game.launcherStats?.sparkleYieldMultiplier ?? 1;
        const sparkleAmount = this.game.baseSparkleMultiplier * yieldMulti;
        this.game.addSparkles(sparkleAmount, 'auto_launcher');
        this.game.statsTracker.recordFirework('auto_launcher');
    }

    getSpawnRate() {
        return 1 / this.spawnInterval;
    }

    getSparklesPerSecond() {
        const yieldMulti = this.game.launcherStats?.sparkleYieldMultiplier ?? 1;
        return (this.game.baseSparkleMultiplier * yieldMulti) / this.spawnInterval;
    }

    serialize() {
        return {
            ...super.serialize(),
            accumulator: this.accumulator,
            assignedRecipeIndex: this.assignedRecipeIndex,
            colorOverride: this.colorOverride,
            patternOverride: this.patternOverride,
        };
    }

    static _randomColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 80 + Math.floor(Math.random() * 20); // 80–100%
        const lightness = 50 + Math.floor(Math.random() * 15);  // 50–65%
        // Convert HSL to hex
        const s = saturation / 100;
        const l = lightness / 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + hue / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    destroy() {
        if (this._instancedGroup) {
            this.game.renderer2D.removeInstancedGroup(this._instancedGroup);
            this._instancedGroup = null;
        }
    }
}

export default AutoLauncher;
