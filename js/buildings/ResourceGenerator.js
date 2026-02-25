import Building from './Building.js';
import * as Renderer2D from '../rendering/Renderer.js';
import { PARTICLE_TYPES } from '../config/config.js';

class ResourceGenerator extends Building {
    constructor(game, x, y, data = {}) {
        super(game, 'RESOURCE_GENERATOR', x, y, data);
        
        this.resourceType = data.resourceType || this.config.resourceType;
        this.productionRate = data.productionRate || this.calculateProductionRate();
        this.accumulator = data.accumulator || 0;
    }

    calculateProductionRate() {
        return this.config.baseProductionRate * 
               Math.pow(this.config.productionRateRatio * this.multiplier, this.level - 1);
    }

    update(deltaTime) {
        super.update(deltaTime);
        this.accumulator += deltaTime;
        
        if (this.accumulator >= 1.0) {
            const resource = this.game.resourceManager.resources[this.resourceType];
            if (resource) {
                const amount = this.productionRate * this.multiplier;
                if (this.resourceType === 'sparkles') {
                    this.game.addSparkles(amount, 'resource_generator');
                } else if (this.resourceType === 'gold') {
                    this.game.addGold(amount, 'resource_generator');
                } else {
                    resource.add(amount);
                }
                
                // Emit trail particle burst when generating sparkles
                if (this.resourceType === 'sparkles') {
                    this.emitSparkleTrailBurst();
                }
            }
            this.accumulator -= 1.0;
        }
    }

    emitSparkleTrailBurst() {
        if (!this.game.particleSystem) return;
        
        const burstCount = 15; 
        const particleLifetime = 1;
        const particleSize = 1.5;
        const velocitySpread = 100;
        
        const centerX = this.x;
        const centerY = this.y;
        
        for (let i = 0; i < burstCount; i++) {
            const randomColor = new Renderer2D.Color(
                Math.random(),
                Math.random(),
                Math.random(),
                0.8
            );
            
            const angle = Math.random() * Math.PI * 2;
            const randomSpread = Math.random() * velocitySpread;
            const risingSpeed = (Math.random() + 0.5) * 150;
            const velocity = new Renderer2D.Vector2(
                Math.cos(angle) * randomSpread,
                risingSpeed
            );
            
            const position = new Renderer2D.Vector2(
                centerX + (Math.random() - 0.5) * 10,
                centerY + this.config.height /2 
            );
            
            this.game.particleSystem.addParticle(
                position,
                velocity,
                randomColor,
                particleSize,
                particleLifetime,
                130, // gravity
                'sphere',
                new Renderer2D.Vector2(0, 0),
                2.0, // friction
                0, //  glow
                0, //  blur
                null, //  update function
                false, //  gradient
                null, 
                0.0,
                1.0,
                PARTICLE_TYPES.RESOURCE_GENERATOR
            );
        }
    }

    onUpgrade() {
        this.productionRate = this.calculateProductionRate();
    }

    getProductionRate() {
        return this.productionRate * this.multiplier;
    }

    serialize() {
        return {
            ...super.serialize(),
            resourceType: this.resourceType,
            productionRate: this.productionRate,
            accumulator: this.accumulator,
        };
    }
}

export default ResourceGenerator;
