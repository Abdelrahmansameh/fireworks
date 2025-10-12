import * as Renderer2D from '../rendering/Renderer.js';
import { FIREWORK_CONFIG, GAME_BOUNDS, BUILDING_TYPES } from '../config/config.js';

/**
 * Base Building class
 * Simple, flat structure with all properties directly on the class
 */
class Building {
    constructor(game, buildingType, x, y, data = {}) {
        this.game = game;
        this.type = buildingType;
        this.config = BUILDING_TYPES[buildingType];
        
        if (!this.config) {
            throw new Error(`Unknown building type: ${buildingType}`);
        }

        // Generate unique ID
        this.id = data.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Position and transform
        this.x = x;
        this.y = y;
        this.rotation = data.rotation || 0;
        this.scale = data.scale || 1;
        
        // State
        this.level = data.level || 1;
        this.mesh = null;
        
        this.multiplier = 1.0; 
        
        // Create visual representation
        this.createMesh();
    }

    /**
     * Create the visual mesh for this building
     */
    createMesh() {
        const width = this.config.width;
        const height = this.config.height;
        const yPos = this.y;

        // Check if we should use texture
        const tex = this.config.textureKey ? 
            this.game.renderer2D.getTexture(this.config.textureKey) : null;

        if (tex) {
            // Create textured mesh
            const squareGeom = Renderer2D.buildTexturedSquare(width, height);
            this.mesh = this.game.renderer2D.createNormalShape({
                vertices: squareGeom.vertices,
                texCoords: squareGeom.texCoords,
                indices: squareGeom.indices,
                texture: tex,
                color: new Renderer2D.Color(1, 1, 1, 1),
                position: new Renderer2D.Vector2(this.x, yPos),
                rotation: this.rotation,
                scale: new Renderer2D.Vector2(this.scale, this.scale),
                zIndex: 10,
                blendMode: Renderer2D.BlendMode.NORMAL,
                isStroke: false
            });
        } else {
            // Create colored rectangle mesh
            const rectVertices = [
                -width / 2, -height / 2,
                width / 2, -height / 2,
                width / 2, height / 2,
                -width / 2, height / 2
            ];

            const rectGeom = Renderer2D.buildPolygon(rectVertices);
            const color = this.config.color;

            this.mesh = this.game.renderer2D.createNormalShape({
                vertices: rectGeom.vertices,
                indices: rectGeom.indices,
                color: new Renderer2D.Color(color.r, color.g, color.b, color.a),
                position: new Renderer2D.Vector2(this.x, yPos),
                rotation: this.rotation,
                scale: new Renderer2D.Vector2(this.scale, this.scale),
                zIndex: 20,
                blendMode: Renderer2D.BlendMode.NORMAL,
                isStroke: false
            });
        }
    }

    /**
     * Update building state (called each frame)
     * Override in subclasses for specific behavior
     */
    update(deltaTime) {
        // Base class does nothing - override in subclasses
    }

    /**
     * Upgrade this building to the next level
     * @returns {boolean} True if upgrade was successful
     */
    upgrade() {
        const cost = this.getUpgradeCost();
        const currency = this.config.currency;
        
        const resource = this.game.resourceManager.resources[currency];
        if (!resource || resource.amount < cost) {
            return false;
        }

        resource.subtract(cost);
        this.level += 1;
        this.onUpgrade();
        
        return true;
    }

    /**
     * Called after successful upgrade
     * Override in subclasses for specific behavior
     */
    onUpgrade() {
        // Override in subclasses
    }

    /**
     * Get the cost to upgrade to the next level
     */
    getUpgradeCost() {
        return Math.floor(
            this.config.baseUpgradeCost * 
            Math.pow(this.config.upgradeCostRatio, this.level - 1)
        );
    }

    /**
     * Get the cost to purchase this building at a given count
     */
    static getPurchaseCost(buildingType, count) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) return Infinity;
        
        return Math.floor(
            config.baseCost * 
            Math.pow(config.costRatio, count)
        );
    }

    /**
     * Check if a point is inside this building's bounds
     */
    isPointInside(x, y) {
        if (!this.mesh) return false;

        const halfWidth = (this.mesh.scale.x * this.config.width) / 2;
        const halfHeight = (this.mesh.scale.y * this.config.height) / 2;
        
        return (
            x >= this.x - halfWidth &&
            x <= this.x + halfWidth &&
            y >= this.mesh.position.y - halfHeight &&
            y <= this.mesh.position.y + halfHeight
        );
    }

    /**
     * Update position and clamp to valid bounds
     */
    setPosition(x, y) {
        this.x = Math.max(
            GAME_BOUNDS.LAUNCHER_MIN_X, 
            Math.min(x, GAME_BOUNDS.LAUNCHER_MAX_X)
        );
        this.y = y;
        
        if (this.mesh) {
            this.mesh.position.x = this.x;
            this.mesh.position.y = this.y;
        }
    }

    /**
     * Serialize building state for saving
     */
    serialize() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            scale: this.scale,
            level: this.level,
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.mesh) {
            this.game.renderer2D.removeNormalShape(this.mesh);
            this.mesh = null;
        }
    }

    /**
     * Get building bounds
     */
    getBounds() {
        const halfWidth = (this.config.width * this.scale) / 2;
        const halfHeight = (this.config.height * this.scale) / 2;
        
        return {
            left: this.x - halfWidth,
            right: this.x + halfWidth,
            top: this.y + halfHeight,
            bottom: this.y - halfHeight,
            width: this.config.width * this.scale,
            height: this.config.height * this.scale
        };
    }
}

export default Building;
