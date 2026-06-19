/**
 * NullRenderer — an inert stand-in for Renderer2D used in headless mode.
 *
 * Game-logic systems (buildings, building manager) reference `game.renderer2D`
 * in a few places even when no drawing happens. In headless mode skeleton
 * loading is skipped entirely, so most of these methods are never called; they
 * exist only so construction never touches a real WebGL context.
 */
const noopMesh = {
    color: { r: 1, g: 1, b: 1, a: 1, clone() { return { ...this }; } },
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
};

const noopGroup = {
    instanceCount: 0,
    instanceStrideFloats: 0,
    instanceData: new Float32Array(0),
    maxInstances: 0,
    addInstanceRaw() {},
    updateInstanceScale() {},
};

export default class NullRenderer {
    constructor() {
        // BuildingManager reads cameraX when placing catapults.
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraZoom = 1;
        this.canvas = { width: 0, height: 0 };
    }

    getTexture() { return null; }
    createNormalShape() { return { ...noopMesh }; }
    removeNormalShape() {}
    createInstancedGroup() { return { ...noopGroup }; }
    removeInstancedGroup() {}
    setCamera() {}
    screenToCanvas(x, y) { return { x, y }; }
    drawFrame() {}
    _resizeIfNeeded() {}
    _updateProjectionMatrix() {}
}
