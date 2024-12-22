import { GAME_BOUNDS } from '../config/config.js';

class Crowd {
    constructor(scene) {
        this.scene = scene;
        this.meshes = new Set();

        // Create a plane geometry for the sprite
        const width = 6;
        const height = 6;
        this.personGeometry = new THREE.PlaneGeometry(width, height);

        // Load the texture with transparency
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('./assets/crowd_member.png', (texture) => {
            // Create material with transparency
            this.personMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
            });

            // Update existing meshes with new material
            this.meshes.forEach(mesh => {
                mesh.material = this.personMaterial;
            });
        });

        // Temporary material while texture loads
        this.personMaterial = new THREE.MeshBasicMaterial({
            color: 0x808080,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Animation properties
        this.bobSpeed = 10; // Speed of the bobbing motion
        this.bobHeight = 0.4; // How high they bob
        this.bobOffsets = new Map(); // Store random offset for each mesh
    }

    addPerson() {
        const mesh = new THREE.Mesh(this.personGeometry, this.personMaterial);
        const height = 2; // Height of person mesh
        const y = GAME_BOUNDS.MIN_Y + (height / 2); // Same formula as launchers

        // Random position between left and right crowd boundaries
        const crowdX = GAME_BOUNDS.CROWD_LEFT_X + (Math.random() * (GAME_BOUNDS.CROWD_RIGHT_X - GAME_BOUNDS.CROWD_LEFT_X));
        mesh.position.set(crowdX, y, 0);

        // Add random offset for varied bobbing
        this.bobOffsets.set(mesh, Math.random() * Math.PI * 2);

        this.scene.add(mesh);
        this.meshes.add(mesh);
    }

    update(deltaTime) {
        // Update each person's position with bobbing motion
        this.meshes.forEach(mesh => {
            const offset = this.bobOffsets.get(mesh);
            const baseY = GAME_BOUNDS.MIN_Y + this.personGeometry.parameters.height / 2;
            const bobAmount = Math.sin((performance.now() / 1000 * this.bobSpeed) + offset) * this.bobHeight;
            mesh.position.y = baseY + bobAmount;
        });
    }

    dispose() {
        for (const mesh of this.meshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.meshes.clear();
        this.bobOffsets.clear();
    }
}


export default Crowd;
