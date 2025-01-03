import * as Renderer2D from './renderer.js';



window.addEventListener('DOMContentLoaded', () => {

    const canvas = document.getElementById('game-canvas');
    const renderer = new Renderer2D.Renderer2D(canvas, {
        width: 800,
        height: 600
    });

    let camX = 0;
    let camY = 0;
    let camZoom = 1.0;

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.05;
        if (e.deltaY < 0) {
            camZoom *= zoomFactor;
        } else {
            camZoom /= zoomFactor;
        }
        camZoom = Math.max(0.1, Math.min(camZoom, 10));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        e.preventDefault();

        if ((e.key === 'w' || e.key === 'W')) {
            camY -= 10;
        } else if ((e.key === 's' || e.key === 'S')) {
            camY += 10;
        } else if ((e.key === 'a' || e.key === 'A')) {
            camX -= 10;
        } else if ((e.key === 'd' || e.key === 'D')) {
            camX += 10;
        }
    }, { passive: false });

    const redcircleData = Renderer2D.buildCircle(50, 32);
    const opaqueRedCircle = renderer.createNormalShape({
        vertices: redcircleData.vertices,
        indices: redcircleData.indices,
        color: [1, 0, 0, 1], 
        position: [100, 100],
        rotation: 0,
        scale: [1, 1],
        zIndex: -1,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const circleData = Renderer2D.buildCircle(50, 32); 2
    const circleShape = renderer.createNormalShape({
        vertices: circleData.vertices,
        indices: circleData.indices,
        color: [1, 0, 0, 1], // red
        position: [200, 200],
        rotation: 0,
        scale: [2, 1],
        zIndex: 1,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const ringData = Renderer2D.buildRing(80, 50, 32);
    const ringShape = renderer.createNormalShape({
        vertices: ringData.vertices,
        indices: ringData.indices,
        color: [0, 1, 0, 0.8], 
        position: [400, 300],
        rotation: 0,
        scale: [2, 1],
        zIndex: 2,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const starData = Renderer2D.buildStar(5, 60, 30);
    const starShape = renderer.createNormalShape({
        vertices: starData.vertices,
        indices: starData.indices,
        color: [0.8, 0.8, 0.2, 0.9],
        position: [600, 200],
        rotation: 0,
        scale: [1, 1],
        zIndex: 3,
        blendMode: Renderer2D.BlendMode.ADDITIVE, 
        isStroke: false
    });

    const linePoints = [
        100, 500,
        200, 450,
        300, 470,
        400, 520,
        500, 510
    ];
    const strokeData = Renderer2D.buildStrokeGeometry(linePoints, 8); 
    const lineShape = renderer.createNormalShape({
        vertices: strokeData.vertices,
        indices: strokeData.indices,
        color: [1, 0, 0, 1],
        position: [0, 0],
        rotation: Math.random() * Math.PI * 2,
        scale: [1, 1],
        zIndex: 0,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: true 
    });

    const heartData = Renderer2D.buildHeart(50, 60);
    const heartShape = renderer.createNormalShape({
        vertices: heartData.vertices,
        indices: heartData.indices,
        color: [1, 0.2, 0.5, 0.9],
        position: [150, 400],
        rotation: 0,
        scale: [1, 1],
        zIndex: 5,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const smallStarData = Renderer2D.buildStar(5, 0.5, 0.25);
    const starGroup = renderer.createInstancedGroup({
        vertices: smallStarData.vertices,
        indices: smallStarData.indices,
        maxInstances: 3000,
        zIndex: 10,
        blendMode: Renderer2D.BlendMode.ADDITIVE
    });

    function animate() {
        requestAnimationFrame(animate);

        ringShape.rotation += 0.01;
        renderer.updateNormalShape(ringShape, { rotation: ringShape.rotation });
        starShape.rotation -= 0.02;
        renderer.updateNormalShape(starShape, { rotation: starShape.rotation });

        starGroup.clear();
        for (let i = 0; i < 50000; i++) {
            const x = (Math.random() - 0.5) * 3000 + 400; 
            const y = (Math.random() - 0.5) * 3000 + 300; 
            const rot = Math.random() * Math.PI * 2;
            const s = 2 + Math.random() * 6;
            const r = Math.random();
            const g = Math.random();
            const b = Math.random();
            starGroup.addInstance([x, y], rot, [s, s], [r, g, b, 0.8]);
        }

        renderer.setCamera({ x: camX, y: camY, zoom: camZoom });


        renderer.drawFrame();
    }
    animate();
});
