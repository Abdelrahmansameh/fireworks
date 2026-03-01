import * as Renderer2D from './renderer.js';
import { SmokeSystem } from '../entities/SmokeSystem.js';



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
        color: new Renderer2D.Color(1, 0, 0, 1), 
        position: new Renderer2D.Vector2(100, 100),
        rotation: 0,
        scale: new Renderer2D.Vector2(1, 1),
        zIndex: -1,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const circleData = Renderer2D.buildCircle(50, 32); 2
    const circleShape = renderer.createNormalShape({
        vertices: circleData.vertices,
        indices: circleData.indices,
        color: new Renderer2D.Color(1, 0, 0, 1), 
        position: new Renderer2D.Vector2(200, 200),
        rotation: 0,
        scale: new Renderer2D.Vector2(2, 1),
        zIndex: 1,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const ringData = Renderer2D.buildRing(80, 50, 32);
    const ringShape = renderer.createNormalShape({
        vertices: ringData.vertices,
        indices: ringData.indices,
        color: new Renderer2D.Color(0, 1, 0, 0.8), 
        position: new Renderer2D.Vector2(400, 300),
        rotation: 0,
        scale: new Renderer2D.Vector2(2, 1),
        zIndex: 2,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const starData = Renderer2D.buildStar(5, 60, 30);
    const starShape = renderer.createNormalShape({
        vertices: starData.vertices,
        indices: starData.indices,
        color: new Renderer2D.Color(0.8, 0.8, 0.2, 0.9),
        position: new Renderer2D.Vector2(600, 200),
        rotation: 0,
        scale: new Renderer2D.Vector2(1, 1),
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
        color: new Renderer2D.Color(1, 0, 0, 1),
        position: new Renderer2D.Vector2(0, 0),
        rotation: Math.random() * Math.PI * 2,
        scale: new Renderer2D.Vector2(1, 1), 
        zIndex: 0,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: true 
    });

    const heartData = Renderer2D.buildDroplet(50, 60);
    const heartShape = renderer.createNormalShape({
        vertices: heartData.vertices,
        indices: heartData.indices,
        color: new Renderer2D.Color(1, 0.2, 0.5, 0.9),
        position: new Renderer2D.Vector2(150, 400),
        rotation: 0,
        scale: new Renderer2D.Vector2(1, 1),
        zIndex: 5,
        blendMode: Renderer2D.BlendMode.NORMAL,
        isStroke: false
    });

    const burstData = Renderer2D.buildSliceBurst(8, 60, 20);
    const burstShape = renderer.createNormalShape({
        vertices: burstData.vertices,
        indices: burstData.indices,
        color: new Renderer2D.Color(1, 0.5, 0, 0.8),
        position: new Renderer2D.Vector2(700, 400),
        rotation: 0,
        scale: new Renderer2D.Vector2(10, 10),
        zIndex: 4,
        blendMode: Renderer2D.BlendMode.ADDITIVE,
        isStroke: false
    });

    // ── Smoke VFX ──────────────────────────────────────────────────────────
    const smoke = new SmokeSystem(renderer, { maxParticles: 3000, zIndex: 20 });

    // Central chimney-style emitter
    smoke.createEmitter({
        x: 400, y: 420,
        rate: 18,
        direction: -Math.PI / 2,
        spread:0,
        speed: [50,100],
        lifetime: [2.0, 4.0],
        startScale: [12, 24],
        endScale: [50, 70],
        startAlpha: [0.28, 0.52],
        turbulence: 18,
        gravity: -6,
    });

    // Darker, slower secondary emitter offset to the left
    smoke.createEmitter({
        x: 300, y: 460,
        rate: 8,
        direction: -Math.PI / 2,
        spread: 0.1,
        speed: [50,100],
        lifetime: [2.5, 5.0],
        startScale: [8, 16],
        endScale: [50, 90],
        startAlpha: [1,1],
        turbulence: 10,
        gravity: -4,
        colorVariants: [
            [0.30, 0.28, 0.26],
            [0.20, 0.20, 0.20],
            [0.40, 0.38, 0.35],
        ],
    });

    const clock = new Renderer2D.Clock();

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

        const dt = clock.getDelta();
        smoke.update(dt);

        ringShape.rotation += 0.01;
        renderer.updateNormalShape(ringShape, { rotation: ringShape.rotation });
        starShape.rotation -= 0.02;
        renderer.updateNormalShape(starShape, { rotation: starShape.rotation });

        starGroup.clear();
        for (let i = 0; i < 500000; i++) {
            const x = (Math.random() - 0.5) * 3000 + 400; 
            const y = (Math.random() - 0.5) * 3000 + 300; 
            const rot = Math.random() * Math.PI * 2;
            const s = 2 + Math.random() * 6;
            const r = Math.random();
            const g = Math.random();
            const b = Math.random();
            starGroup.addInstance(new Renderer2D.Vector2(x, y), rot, new Renderer2D.Vector2(s, s), new Renderer2D.Color(r, g, b, 0.8));
        }

        renderer.setCamera({ x: camX, y: camY, zoom: camZoom });


        renderer.drawFrame();
    }
    animate();
});
