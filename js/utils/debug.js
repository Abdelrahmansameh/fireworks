export function createDebugCross(scene, position, size = 1, color = 0xff0000, lifetime = 0) {
    const material = new THREE.LineBasicMaterial({ 
        color: color,
        linewidth: 2,
        transparent: true,
        opacity: 1,
        depthTest: false
    });

    const horizontalGeometry = new THREE.BufferGeometry();
    horizontalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -size, 0, 0,
        size, 0, 0
    ], 3));

    const verticalGeometry = new THREE.BufferGeometry();
    verticalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, -size, 0,
        0, size, 0
    ], 3));

    const horizontalLine = new THREE.Line(horizontalGeometry, material);
    const verticalLine = new THREE.Line(verticalGeometry, material);

    const cross = new THREE.Group();
    cross.add(horizontalLine);
    cross.add(verticalLine);

    cross.position.copy(position);

    scene.add(cross);

    const remove = () => {
        if (cross.parent) {
            scene.remove(cross);
            horizontalLine.geometry.dispose();
            verticalLine.geometry.dispose();
            material.dispose();
            cross.clear();
        }
    };

    let timeoutId = null;
    if (lifetime > 0) {
        timeoutId = setTimeout(() => {
            remove();
            timeoutId = null;
        }, lifetime);
    }

    return {
        object: cross,
        remove: () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            remove();
        }
    };
}

export function createDebugCrosses(scene, positions, size = 1, color = 0xff0000, lifetime = 0) {
    return positions.map(position => createDebugCross(scene, position, size, color, lifetime));
}
