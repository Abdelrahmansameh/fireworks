import { BlendMode, buildPolygon } from '../rendering/Renderer.js';
import { createRng } from '../utils/random.js';

// A fixed pool of short current strokes and expanding wakes. The river keeps
// moving without fireworks; nearby colored light gently catches its crests.
export default class BackgroundWater {
    constructor(scenery) {
        this.scenery = scenery;
        this.renderer = scenery.renderer;
        this.config = scenery.config;
        this.flows = [];
        this.wakes = [];
        this.bounds = { left: this.config.world.xMin, right: this.config.world.xMax };
        const { world, water, zIndex } = this.config;
        const rng = createRng(this.config.seed ^ 0x6C89A7);
        for (let x = world.xMin; x < world.xMax; x += water.currentSpacing) {
            const depth = .08 + rng() * .82;
            this.flows.push({ x: x + rng() * water.currentSpacing, depth,
                y: water.surfaceY - depth * (water.surfaceY - water.bottomY),
                width: (18 + rng() * 34) * (.55 + depth), phase: rng() * Math.PI * 2,
                speed: water.flowSpeed * (.65 + depth * .85), alpha: .28 + rng() * .22 });
        }
        for (let x = world.xMin + 330; x < world.xMax; x += water.rippleSpacing) {
            const rockX = x + rng() * 140;
            const rockY = water.bottomY + 30 + rng() * (water.surfaceY - water.bottomY - 60);
            const width = 12 + rng() * 9;
            this.wakes.push({ x: rockX, y: rockY - 1, width, phase: rng() * 3.5 });
            // Low river stones anchor the open wakes and break the straight banks.
            const stone = { r: .065, g: .083, b: .092, a: 1 };
            scenery._polygon([rockX - width / 2, rockY, rockX - width * .38, rockY + 5,
                rockX - width * .08, rockY + 8, rockX + width * .36, rockY + 6,
                rockX + width / 2, rockY], stone, zIndex.waterReflections + 1, .52);
        }
        const stroke = buildPolygon([-.5, 0, -.32, .25, .08, .10, .5, .22,
            .5, -.2, .08, -.27, -.32, -.17]);
        this.group = this.renderer.createInstancedGroup({ ...stroke,
            maxInstances: this.flows.length * 2, zIndex: zIndex.waterReflections + .6, blendMode: BlendMode.NORMAL });
        const arc = [];
        const outer = [];
        for (let i = 0; i <= 10; i++) {
            const angle = Math.PI * (.12 + i / 10 * .76);
            outer.push(Math.cos(angle) * .5, Math.sin(angle) * .5);
        }
        // The open crescent suggests a wake rather than a complete bright ring.
        for (let i = 0; i <= 10; i++) arc.push(outer[i * 2], outer[i * 2 + 1]);
        for (let i = 10; i >= 0; i--) arc.push(outer[i * 2], outer[i * 2 + 1] - .065);
        const wakeGeometry = buildPolygon(arc);
        this.wakeGroup = this.renderer.createInstancedGroup({ ...wakeGeometry,
            maxInstances: this.wakes.length * 6, zIndex: zIndex.waterReflections + .7, blendMode: BlendMode.NORMAL });
        this.update(0, []);
    }

    ensureCoverage(bounds) {
        this.bounds.left = bounds.left;
        this.bounds.right = bounds.right;
    }

    _crestColor(x, y, emitters) {
        let r = .13, g = .22, b = .245;
        let strongest = 0, light = null;
        const radiusSquared = this.config.lighting.radius ** 2;
        for (const emitter of emitters) {
            const dx = emitter.x - x;
            const dy = (emitter.y - y) * .7;
            const falloff = Math.max(0, 1 - (dx * dx + dy * dy) / radiusSquared);
            const influence = falloff * falloff * emitter.intensity;
            if (influence > strongest) {
                strongest = influence;
                light = emitter;
            }
        }
        if (light) {
            const max = Math.max(.001, light.r, light.g, light.b);
            const blend = (1 - Math.exp(-strongest * 1.2)) * .5;
            r += ((.14 + light.r / max * .22) - r) * blend;
            g += ((.14 + light.g / max * .22) - g) * blend;
            b += ((.14 + light.b / max * .22) - b) * blend;
        }
        return { r, g, b };
    }

    update(time, emitters) {
        const visible = this.renderer.getVisibleWorldBounds();
        const left = this.bounds.left + 80;
        const span = this.bounds.right - left - 80;
        const { surfaceY, bottomY } = this.config.water;
        this.group.clear();
        this.wakeGroup.clear();
        for (const flow of this.flows) {
            const x = left + (((flow.x - left + time * flow.speed) % span) + span) % span;
            if (x < visible.left - 100 || x > visible.right + 100) continue;
            const y = flow.y + Math.sin(time * 1.3 + flow.phase) * 1.2;
            const color = this._crestColor(x, y, emitters);
            const pulse = .65 + Math.sin(time * .9 + flow.phase) * .2;
            this.group.addInstanceRaw(x, y, 0, flow.width, 1.9 + flow.depth,
                color.r, color.g, color.b, flow.alpha * pulse);
            // A shorter follower makes each stroke read as a flowing crease.
            this.group.addInstanceRaw(x - flow.width * .48, y - 2.8, 0, flow.width * .38, 1.2,
                color.r, color.g, color.b, flow.alpha * pulse * .5);
        }
        for (const wake of this.wakes) {
            if (wake.x < visible.left - 80 || wake.x > visible.right + 80) continue;
            const color = this._crestColor(wake.x, wake.y, emitters);
            for (let ring = 0; ring < 3; ring++) {
                const phase = ((time * .35 + wake.phase + ring / 3) % 1 + 1) % 1;
                const fade = Math.sin(phase * Math.PI) * .44;
                const x = wake.x + phase * 18;
                const y = wake.y - phase * 3;
                const width = wake.width + phase * 47;
                const height = 4 + phase * 11;
                if (y < bottomY + 6 || y + height * .5 > surfaceY - 3) continue;
                this.wakeGroup.addInstanceRaw(x, y, 0, width, height,
                    color.r, color.g, color.b, fade);
                this.wakeGroup.addInstanceRaw(x + 3, y - 1, 0, width * .88, -height * .72,
                    color.r, color.g, color.b, fade * .7);
            }
        }
    }

    dispose() {
        this.renderer.removeInstancedGroup(this.group);
        this.renderer.removeInstancedGroup(this.wakeGroup);
        this.flows.length = 0;
        this.wakes.length = 0;
    }
}
