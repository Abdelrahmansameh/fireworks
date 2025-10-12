import { GAME_BOUNDS } from '../config/config.js';
import * as Renderer2D from '../rendering/Renderer.js';

class Crowd {
    constructor(renderer2D) {
        this.renderer = renderer2D;
        this.people = [];
        this.instancedGroup = null;
        this.textureLoaded = false;
        this.missingCrowdsToInit = 0;
        this._initializeCrowd();
    }

    async _initializeCrowd() {
        try {
            const texture = await this.renderer.loadTexture('./assets/crowd_member.png', 'crowd_member');
            
            const geometry = Renderer2D.buildTexturedSquare(30, 30);
            this.instancedGroup = this.renderer.createInstancedGroup({
                vertices: geometry.vertices,
                indices: geometry.indices,
                texCoords: geometry.texCoords,
                texture: texture,
                maxInstances: 1000,
                zIndex: -10,
                blendMode: Renderer2D.BlendMode.NORMAL,
                useGlow: false
            });
            for (let i = 0; i < this.missingCrowdsToInit; i++) {
                this._addPerson();
            }
            this.textureLoaded = true;
            console.log('Crowd texture loaded successfully');
        } catch (error) {
            console.error('Failed to load crowd texture:', error);
            this._createFallbackCrowd();
        }
    }

    _createFallbackCrowd() {
        const geometry = Renderer2D.buildCircle(10, 8);
        
        this.instancedGroup = this.renderer.createInstancedGroup({
            vertices: geometry.vertices,
            indices: geometry.indices,
            maxInstances: 1000,
            zIndex: -10,
            blendMode: Renderer2D.BlendMode.NORMAL,
            useGlow: false
        });
        
        this.textureLoaded = false;
        console.log('Using fallback crowd rendering');
    }

    setCount(count) {
        if (!this.instancedGroup) {
            this.missingCrowdsToInit = count;
            return;
        }

        if (count === this.people.length) {
            return;
        }

        this.people = [];
        this.instancedGroup.instanceCount = 0; 

        for (let i = 0; i < count; i++) {
            this._addPerson();
        }
    }

    _addPerson() {
        if (!this.instancedGroup) {
            this.missingCrowdsToInit++;
            return;
        }

        let x;
        let positionFound = false;
        let attempts = 0;
        const maxAttempts = 20;

        while (!positionFound && attempts < maxAttempts) {
            x = Math.random() * (GAME_BOUNDS.CROWD_RIGHT_X - GAME_BOUNDS.CROWD_LEFT_X) + GAME_BOUNDS.CROWD_LEFT_X;
            let overlapping = false;
            for (let i = 0; i < this.people.length; i++) {
                if (Math.abs(this.people[i].x - x) < 10) {
                    overlapping = true;
                    break;
                }
            }
            if (!overlapping) {
                positionFound = true;
            }
            attempts++;
        }
        
        const y = GAME_BOUNDS.CROWD_Y + Math.random() * 5 - 2.5;
        const scale = 1 + Math.random() * 0.4;
        
        const hue = Math.random();
        
        const person = {
            x: x,
            y: y,
            scale: scale,
            color: new Renderer2D.Color(1, 1, 1, 1),
            bobOffset: Math.random() * Math.PI * 2, 
            bobSpeed: 2 + Math.random() * 2,
            instanceIndex: this.instancedGroup.instanceCount
        };
        
        this.people.push(person);
        
        this.instancedGroup.addInstance(
            new Renderer2D.Vector2(person.x, person.y),
            0, 
            new Renderer2D.Vector2(person.scale  , person.scale  ),
            person.color
        );
    }

    update(deltaTime) {
        if (!this.instancedGroup || this.people.length === 0) return;
        
        for (let i = 0; i < this.people.length; i++) {
            const person = this.people[i];
            person.bobOffset += person.bobSpeed * deltaTime;
            
            const bobY = person.y + Math.sin(person.bobOffset) * 2;
            
            this.instancedGroup.updateInstancePosition(person.instanceIndex, person.x, bobY);
        }
    }

    _hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return { r, g, b };
    }

    dispose() {
        if (this.instancedGroup) {
            this.renderer.removeInstancedGroup(this.instancedGroup);
            this.instancedGroup = null;
        }
        this.people = [];
    }
}

export default Crowd;
