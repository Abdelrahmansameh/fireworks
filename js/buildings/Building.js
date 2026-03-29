import * as Renderer2D from '../rendering/Renderer.js';
import { FIREWORK_CONFIG, GAME_BOUNDS, BUILDING_TYPES } from '../config/config.js';

class Building {
    constructor(game, buildingType, x, y, data = {}) {
        this.game = game;
        this.type = buildingType;
        this.config = BUILDING_TYPES[buildingType];
        
        if (!this.config) {
            throw new Error(`Unknown building type: ${buildingType}`);
        }

        this.id = data.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.x = x;
        this.y = y;
        this.rotation = data.rotation || 0;
        this.scale = data.scale || 1;
        
        this.mesh = null;
                
        this.createMesh();
    }    createMesh() {
        const width = this.config.width;
        const height = this.config.height;
        const yPos = this.y;

        const tex = this.config.textureKey ? 
            this.game.renderer2D.getTexture(this.config.textureKey) : null;

        if (tex) {
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

    update(deltaTime) {
        if (this.highlightTimer > 0) {
            this.highlightTimer -= deltaTime;
            if (this.highlightTimer <= 0) {
                this.mesh.color = this.originalColor.clone();
            } else {
                // Pulse effect
                const pulse = (Math.sin(this.highlightTimer * 10) + 1) / 2; // 0 to 1
                this.mesh.color = new Renderer2D.Color(
                    this.originalColor.r + (1 - this.originalColor.r) * pulse,
                    this.originalColor.g + (1 - this.originalColor.g) * pulse,
                    this.originalColor.b + (0 - this.originalColor.b) * pulse, // Yellowish tint
                    this.originalColor.a
                );
            }
        }
    }

    highlight(duration = 2.0) {
        this.highlightTimer = duration;
        if (!this.originalColor) {
            this.originalColor = this.mesh.color.clone();
        }
    }

    static getPurchaseCost(buildingType, count) {
        const config = BUILDING_TYPES[buildingType];
        if (!config) return Infinity;
        
        return Math.floor(
            config.baseCost * 
            Math.pow(config.costRatio, count)
        );
    }

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

    serialize() {
        return {
            id: this.id,
            type: this.type,
            x: this.x,
            y: this.y,
            rotation: this.rotation,
            scale: this.scale,
        };
    }

    destroy() {
        if (this.mesh) {
            this.game.renderer2D.removeNormalShape(this.mesh);
            this.mesh = null;
        }
    }

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
