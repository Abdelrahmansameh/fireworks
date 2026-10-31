import { createRng } from '../utils/random.js';

const rgb = (r, g, b) => ({ r: r / 255, g: g / 255, b: b / 255, a: 1 });

// Sparse, hand-built silhouettes: broad timber and hide shapes follow the same
// chunky visual language as the crowd and launchers. Their gaps stay open sky.
export function buildPrimitiveLandmarks(scenery) {
    const { landmarks, world, water, zIndex } = scenery.config;
    if (!landmarks?.enabled) return;

    const rng = createRng(scenery.config.seed ^ 0x178EC2);
    const baseY = (water?.enabled ? water.surfaceY : world.horizonY) + 3;
    const z = zIndex.landmarks;
    const spacing = landmarks.spacing;
    const wood = landmarks.woodColor ?? rgb(38, 36, 34);
    const woodEdge = landmarks.woodEdgeColor ?? rgb(51, 47, 42);
    const hide = landmarks.hideColor ?? rgb(55, 51, 45);
    const hideShade = rgb(42, 41, 38);
    const rope = rgb(66, 61, 51);
    const stone = landmarks.color ?? rgb(35, 39, 43);
    const stoneEdge = landmarks.edgeColor ?? rgb(47, 51, 55);
    const dark = rgb(19, 22, 26);

    // Anchor a shelter close to the initial camera, then distribute a different
    // vignette into each stretch of shore as the player scrolls.
    const origin = 420;
    const first = Math.ceil((world.xMin - origin) / spacing);
    const last = Math.floor((world.xMax - origin) / spacing);
    for (let index = first; index <= last; index++) {
        const x = origin + index * spacing + (rng() - 0.5) * 110;
        const scale = 0.85 + rng() * 0.23;
        const variant = ((index % 6) + 6) % 6;
        const polygon = (points, color = wood, response = 0.68, normal = 0) => scenery._polygon(
            points.flatMap(([px, py]) => [x + px * scale, baseY + py * scale]), color, z, response, normal);
        const rect = (px, py, width, height, color = wood, response = 0.68) => scenery._rect(
            x + px * scale, baseY + py * scale, width * scale, height * scale, color, z, response);
        const beam = (ax, ay, bx, by, width, color = wood, response = 0.68) => {
            const length = Math.hypot(bx - ax, by - ay);
            const nx = -(by - ay) * width / (2 * length);
            const ny = (bx - ax) * width / (2 * length);
            return polygon([[ax + nx, ay + ny], [bx + nx, by + ny],
                [bx - nx, by - ny], [ax - nx, ay - ny]], color, response);
        };
        const binding = (px, py, width = 13) => {
            rect(px - width / 2, py, width, 3, rope, 0.72);
            rect(px - width / 2, py + 5, width, 3, rope, 0.72);
        };
        const rock = (px, py, width, height, light = false) => {
            polygon([[px, py], [px - width * 0.08, py + height * 0.62],
                [px + width * 0.18, py + height], [px + width * 0.79, py + height * 0.94],
                [px + width, py + height * 0.59], [px + width * 0.96, py]], stone, 0.65);
            if (light) polygon([[px + width * 0.1, py + height * 0.57],
                [px + width * 0.18, py + height], [px + width * 0.42, py + height * 0.98],
                [px + width * 0.35, py + height * 0.24]], stoneEdge, 0.8, -0.5);
        };
        const post = (px, height, lean = 0, width = 11) => {
            beam(px, 0, px + lean, height, width);
            beam(px - width * 0.22, 3, px + lean - width * 0.22, height - 5, 2.5, woodEdge, 0.8);
        };
        const cairn = (px, py, size = 1) => {
            rock(px - 23 * size, py, 46 * size, 15 * size, true);
            rock(px - 17 * size, py + 13 * size, 31 * size, 17 * size);
            rock(px - 10 * size, py + 28 * size, 22 * size, 15 * size, true);
            rock(px - 6 * size, py + 41 * size, 13 * size, 10 * size);
        };

        if (variant === 0) {
            // A low, open lean-to. Its off-centre sloping hide roof avoids the
            // pointed tent/tower silhouette and leaves the timber readable.
            beam(-68, 0, -57, 91, 10);
            beam(68, 0, 62, 63, 10);
            beam(-59, 18, 65, 59, 7, dark, 0.35);
            polygon([[-76, 97], [-56, 105], [82, 68], [72, 52], [21, 68], [-26, 79]], hide, 0.76, -0.2);
            polygon([[-26, 79], [-18, 94], [32, 81], [21, 68]], hideShade, 0.65, 0.3);
            beam(-81, 98, 87, 63, 8, woodEdge, 0.82);
            beam(-58, 96, -58, 113, 7);
            binding(-60, 84);
            binding(64, 54);
            rock(-91, -1, 24, 11);
            rock(65, -1, 28, 10, true);
            // Nearby cut timber and a small cairn make a loose camp, not a town.
            beam(112, 5, 161, 9, 12);
            beam(121, 17, 156, 18, 10, woodEdge);
            cairn(-131, 0, 0.64);
        } else if (variant === 1) {
            // Lashed, forked timber supports with an irregular hanging hide.
            post(-43, 129, -5);
            post(45, 117, 7);
            beam(-49, 112, -65, 132, 6);
            beam(51, 109, 67, 126, 6);
            beam(-65, 111, 70, 103, 9, woodEdge, 0.8);
            polygon([[-33, 105], [34, 101], [31, 51], [18, 55],
                [11, 45], [-3, 55], [-18, 48], [-30, 57]], hide, 0.75);
            rect(-27, 64, 4, 34, hideShade, 0.58);
            binding(-48, 105, 17);
            binding(50, 97, 17);
            rock(-73, 0, 30, 12, true);
            rock(35, 0, 27, 10);
            cairn(119, 0, 0.73);
        } else if (variant === 2) {
            // Carved timber markers use only a few blocky cuts. The dark eyes
            // echo the crowd without introducing detailed cultural ornament.
            for (const [px, height, lean, width] of [[-46, 69, -4, 21], [0, 111, 4, 25], [47, 56, 5, 19]]) {
                post(px, height, lean, width);
                const faceBottom = height - 35;
                rect(px - width * 0.6 + lean, faceBottom, width * 1.2, 25, woodEdge, 0.8);
                rect(px - 8 + lean, height - 23, 5, 5, dark, 0.22);
                rect(px + 3 + lean, height - 23, 5, 5, dark, 0.22);
                rect(px - 7 + lean, height - 31, 14, 3, dark, 0.22);
                // Keep both rope bands on the shaft, clear of even the shortest face.
                const bindingY = Math.min(19, faceBottom - 11);
                binding(px + lean * (bindingY + 4) / height, bindingY, width + 5);
            }
            rock(-88, 0, 31, 13);
            rock(52, 0, 37, 14, true);
        } else if (variant === 3) {
            // Broad, squat stone stacks and a fallen slab keep the profile
            // rough and horizontal rather than a row of miniature peaks.
            cairn(-47, 0, 1.23);
            cairn(31, 0, 0.83);
            rock(-6, 0, 25, 13);
            rock(76, 0, 58, 15, true);
            beam(-133, 4, -91, 12, 8);
        } else if (variant === 4) {
            // A primitive stone lintel: real sky is visible below the capstone.
            polygon([[-63, 0], [-61, 84], [-48, 99], [-24, 94], [-22, 0]], stone, 0.65, -0.35);
            polygon([[29, 0], [24, 94], [48, 102], [63, 83], [67, 0]], stone, 0.65, 0.35);
            polygon([[-77, 94], [-70, 113], [-26, 120], [31, 116], [77, 108],
                [72, 91], [16, 96], [-30, 91]], stoneEdge, 0.8);
            polygon([[-59, 8], [-57, 83], [-48, 91], [-45, 8]], stoneEdge, 0.8, -0.6);
            rock(-91, 0, 30, 11);
            cairn(117, 0, 0.62);
        } else {
            // Short, uneven palisade and driftwood: blunt, crooked cut poles,
            // a visible crosspiece and rope, with plenty of shore left empty.
            for (const [px, height, lean] of [[-79, 48, -6], [-54, 62, -2], [-29, 55, 4],
                [-4, 68, 2], [21, 59, -3], [46, 46, 5]]) {
                post(px, height, lean, 12);
                binding(px, 25, 17);
            }
            beam(-91, 22, 62, 29, 8, woodEdge, 0.78);
            beam(103, 5, 154, 14, 13);
            beam(110, 10, 130, 31, 8);
            rock(132, 0, 26, 10, true);
        }
    }
}
