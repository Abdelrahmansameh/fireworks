export function createDebugCross(scene, position, size = 1, color = 0xff0000, lifetime = 0) {
    // Create the material
    const material = new THREE.LineBasicMaterial({ 
        color: color,
        linewidth: 2,
        transparent: true,
        opacity: 1,
        depthTest: false // Makes sure cross is always visible
    });

    // Create the geometry for horizontal line
    const horizontalGeometry = new THREE.BufferGeometry();
    horizontalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -size, 0, 0,
        size, 0, 0
    ], 3));

    // Create the geometry for vertical line
    const verticalGeometry = new THREE.BufferGeometry();
    verticalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, -size, 0,
        0, size, 0
    ], 3));

    // Create the lines
    const horizontalLine = new THREE.Line(horizontalGeometry, material);
    const verticalLine = new THREE.Line(verticalGeometry, material);

    // Create a group to hold both lines
    const cross = new THREE.Group();
    cross.add(horizontalLine);
    cross.add(verticalLine);

    // Position the cross
    cross.position.copy(position);

    // Add to scene
    scene.add(cross);

    // Create remove function
    const remove = () => {
        if (cross.parent) {
            scene.remove(cross);
            horizontalLine.geometry.dispose();
            verticalLine.geometry.dispose();
            material.dispose();
            cross.clear(); // Clear any references
        }
    };

    // If lifetime is specified, set up automatic removal
    let timeoutId = null;
    if (lifetime > 0) {
        timeoutId = setTimeout(() => {
            remove();
            timeoutId = null;
        }, lifetime);
    }

    // Return the cross object and remove function
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

// Helper function to create multiple debug crosses
export function createDebugCrosses(scene, positions, size = 1, color = 0xff0000, lifetime = 0) {
    return positions.map(position => createDebugCross(scene, position, size, color, lifetime));
}
