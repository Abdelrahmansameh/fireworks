# Particle Trail System Implementation Guide

## Overview
This document outlines the implementation of a performant particle trail system for the fireworks game. Trail particles spawn behind exploding particles as they travel, creating beautiful trailing effects.

## System Architecture

### Core Principles
- **Stride-based data structure** for cache-friendly performance
- **Per-particle trail configuration** embedded in the instance data
- **Recursion prevention** via flag system
- **Component-level control** for flexible trail effects per firework pattern

---

## Implementation Steps

### Step 1: Update Configuration (config.js)

Add trail configuration to `FIREWORK_CONFIG`:

```javascript
FIREWORK_CONFIG.trails = {
    defaultSpawnRate: 0.05,        // seconds between trail spawns
    defaultLifetime: 0.8,          // trail particle lifetime
    defaultSize: 0.3,              // size multiplier (relative to parent)
    defaultGravity: 400,           // gravity for trail particles
    defaultFriction: 2.0,          // air resistance
    defaultMaxCount: 10,           // max trails per particle
    defaultAlphaMultiplier: 0.6,  // transparency of trails
    defaultShape: 'sphere',        // shape for trail particles
    defaultVelocitySpread: 50      // random velocity spread (pixels/sec)
};
```

---

### Step 2: Update InstancedParticleSystem.js

#### 2.1 Add Trail Indices to Constructor

In the `constructor()`, after the existing indices, add:

```javascript
// Existing indices...
this.gradientDurationIdx = 27;

// NEW: Trail system indices
this.trailEnabledIdx = 28;         // 1.0 if trails enabled, 0.0 otherwise
this.trailTimerIdx = 29;           // accumulator for spawn timing
this.trailSpawnRateIdx = 30;       // seconds between spawns
this.trailSizeIdx = 31;            // size multiplier for trails
this.trailLifetimeIdx = 32;        // lifetime of trail particles
this.trailGravityIdx = 33;         // gravity for trails
this.trailFrictionIdx = 34;        // friction for trails
this.trailVelocitySpreadIdx = 35;  // random velocity spread
this.isTrailParticleIdx = 36;      // 1.0 if this IS a trail
this.trailMaxCountIdx = 37;        // max trails to spawn
this.trailCurrentCountIdx = 38;    // current trail count

this.strideFloats = 39;  // Update from 28 to 39
```

#### 2.2 Update addParticle() Method Signature

Add new parameters to the end of `addParticle()`:

```javascript
addParticle(position,
    velocity,
    color,
    scale,
    lifetime,
    gravity,
    shape = 'circle',
    acceleration = new Vector2(),
    friction = FIREWORK_CONFIG.baseFriction,
    glowStrength = 0,
    blurStrength = 0,
    updateFn = null,
    enableColorGradient = false,
    gradientFinalColor = null,
    gradientStartTime = 0.0,
    gradientDuration = 1.0,
    // NEW PARAMETERS:
    enableTrails = false,
    trailConfig = null,
    isTrailParticle = false
) {
    // ... existing code ...
}
```

#### 2.3 Initialize Trail Data in addParticle()

After the color gradient initialization code, add:

```javascript
// After gradient initialization...
} 
else {
    d[base + this.enableColorGradientIdx] = 0.0;
}

// NEW: Initialize trail data
d[base + this.trailEnabledIdx] = enableTrails ? 1.0 : 0.0;
d[base + this.trailTimerIdx] = 0.0;
d[base + this.isTrailParticleIdx] = isTrailParticle ? 1.0 : 0.0;
d[base + this.trailCurrentCountIdx] = 0.0;

if (enableTrails && trailConfig) {
    d[base + this.trailSpawnRateIdx] = trailConfig.spawnRate || FIREWORK_CONFIG.trails.defaultSpawnRate;
    d[base + this.trailSizeIdx] = trailConfig.size || FIREWORK_CONFIG.trails.defaultSize;
    d[base + this.trailLifetimeIdx] = trailConfig.lifetime || FIREWORK_CONFIG.trails.defaultLifetime;
    d[base + this.trailGravityIdx] = trailConfig.gravity || FIREWORK_CONFIG.trails.defaultGravity;
    d[base + this.trailFrictionIdx] = trailConfig.friction || FIREWORK_CONFIG.trails.defaultFriction;
    d[base + this.trailVelocitySpreadIdx] = trailConfig.velocitySpread || FIREWORK_CONFIG.trails.defaultVelocitySpread;
    d[base + this.trailMaxCountIdx] = trailConfig.maxCount || FIREWORK_CONFIG.trails.defaultMaxCount;
} else {
    // Set defaults even if not enabled (for consistency)
    d[base + this.trailSpawnRateIdx] = FIREWORK_CONFIG.trails.defaultSpawnRate;
    d[base + this.trailSizeIdx] = FIREWORK_CONFIG.trails.defaultSize;
    d[base + this.trailLifetimeIdx] = FIREWORK_CONFIG.trails.defaultLifetime;
    d[base + this.trailGravityIdx] = FIREWORK_CONFIG.trails.defaultGravity;
    d[base + this.trailFrictionIdx] = FIREWORK_CONFIG.trails.defaultFriction;
    d[base + this.trailVelocitySpreadIdx] = FIREWORK_CONFIG.trails.defaultVelocitySpread;
    d[base + this.trailMaxCountIdx] = FIREWORK_CONFIG.trails.defaultMaxCount;
}

this.particleUpdateFns[shape][idx] = updateFn;
// ... rest of existing code ...
```

#### 2.4 Add Trail Spawning Logic to update()

In the `update()` method, after the color gradient update and before the GPU data copy:

```javascript
// After color gradient code...
if (d[sBase + this.enableColorGradientIdx] > 0.5) {
    // ... gradient code ...
}

// NEW: Trail spawning logic
const trailEnabled = d[sBase + this.trailEnabledIdx] > 0.5;
const isTrail = d[sBase + this.isTrailParticleIdx] > 0.5;

if (trailEnabled && !isTrail) {
    d[sBase + this.trailTimerIdx] += delta;
    const spawnRate = d[sBase + this.trailSpawnRateIdx];
    const currentCount = d[sBase + this.trailCurrentCountIdx];
    const maxCount = d[sBase + this.trailMaxCountIdx];
    
    if (d[sBase + this.trailTimerIdx] >= spawnRate && currentCount < maxCount) {
        d[sBase + this.trailTimerIdx] = 0.0;
        d[sBase + this.trailCurrentCountIdx]++;
        
        // Spawn trail particle
        const trailShape = FIREWORK_CONFIG.trails.defaultShape;
        const trailSize = d[sBase + this.scaleIdx] * d[sBase + this.trailSizeIdx];
        const trailColor = new Color(
            d[sBase + this.colorIdx],
            d[sBase + this.colorIdx + 1],
            d[sBase + this.colorIdx + 2],
            d[sBase + this.colorIdx + 3] * FIREWORK_CONFIG.trails.defaultAlphaMultiplier
        );
        
        // Generate random initial velocity
        const velocitySpread = d[sBase + this.trailVelocitySpreadIdx];
        const randomVelX = (Math.random() - 0.5) * 2 * velocitySpread;
        const randomVelY = (Math.random() - 0.5) * 2 * velocitySpread;
        
        this.addParticle(
            new Vector2(d[sBase + this.positionIdx], d[sBase + this.positionIdx + 1]),
            new Vector2(randomVelX, randomVelY),
            trailColor,
            trailSize,
            d[sBase + this.trailLifetimeIdx],
            d[sBase + this.trailGravityIdx],
            trailShape,
            new Vector2(0, 0),
            d[sBase + this.trailFrictionIdx],
            0, // no glow
            0, // no blur
            null, // no update function
            false, // no gradient
            null,
            0.0,
            1.0,
            false, // trails don't spawn trails
            null,
            true // this IS a trail particle
        );
    }
}

// Existing GPU data copy...
gpu[gBase + 0] = d[sBase + this.positionIdx];
// ... rest of GPU copy ...
```

---

### Step 3: Update Firework.js

#### 3.1 Add Trail Config to Components

When calling `addParticle()` in the `explode()` method, add trail parameters:

```javascript
const index = this.particleSystem.addParticle(
    pos.clone(),
    vel.clone(),
    particleColor,
    size,
    component.lifetime,
    g,
    shape,
    accel,
    friction,
    component.glowStrength,
    component.blurStrength,
    updateFn,
    component.enableColorGradient,
    gradientFinalColor,
    component.gradientStartTime,
    component.gradientDuration,
    // NEW: Trail parameters
    component.enableTrails || false,
    component.trailConfig || null,
    false // not a trail particle
);
```

---

### Step 4: Using Trails in Recipes

#### Example 1: Enable Trails for a Specific Component

In your recipe/pattern definitions or when creating fireworks:

```javascript
const component = {
    pattern: 'spherical',
    color: '#4ba0d1',
    size: 0.5,
    lifetime: 3.7,
    shape: 'sphere',
    spread: 0.7,
    glowStrength: 1.0,
    blurStrength: 0.7,
    // NEW: Trail configuration
    enableTrails: true,
    trailConfig: {
        spawnRate: 0.08,      // spawn every 80ms
        size: 0.4,            // 40% of parent size
        lifetime: 1.2,        // trails last 1.2 seconds
        gravity: 300,         // moderate gravity
        friction: 1.5,        // some air resistance
        velocitySpread: 80,   // random velocity ±80 px/s
        maxCount: 20          // max 20 trails per particle
    }
};
```

#### Example 2: Different Trail Configs per Pattern

```javascript
// Willow pattern with heavy, long-lasting trails
{
    pattern: 'willow',
    enableTrails: true,
    trailConfig: {
        spawnRate: 0.03,
        size: 0.5,
        lifetime: 2.0,
        gravity: 200,
        friction: 3.0,
        velocitySpread: 30,
        maxCount: 30
    }
}

// Burst pattern with quick, sparkly trails
{
    pattern: 'burst',
    enableTrails: true,
    trailConfig: {
        spawnRate: 0.1,
        size: 0.2,
        lifetime: 0.5,
        gravity: 600,
        friction: 1.0,
        velocitySpread: 100,
        maxCount: 10
    }
}
```

---

## Performance Considerations

### Memory Layout
Each particle now uses **39 floats** instead of 28:
- Memory per particle: 156 bytes (39 × 4 bytes)
- For 500,000 max particles: ~78 MB per shape
- Total for 5 shapes: ~390 MB

### Optimization Tips
1. **Limit maxCount**: Keep `trailConfig.maxCount` reasonable (5-20)
2. **Adjust spawnRate**: Higher values = fewer trails = better performance
3. **Short lifetimes**: Trails with lifetime < 1s will clear quickly
4. **Selective enabling**: Only enable trails on key visual effects

### Performance Monitoring
Watch for:
- Frame rate drops when many particles have trails
- Memory usage increases
- Particle count hitting `maxParticles` limit faster

---

## Testing Checklist

- [ ] Trails spawn at correct rate
- [ ] Trails inherit parent particle color
- [ ] Trails don't spawn their own trails (recursion check)
- [ ] Trails respect maxCount limit
- [ ] Trails fall with configured gravity
- [ ] Trails fade out properly
- [ ] Performance acceptable with trails enabled
- [ ] Different trail configs work per component
- [ ] Trails stop spawning when parent dies

---

## Visual Examples

### Recommended Trail Configs by Effect

**Sparkle Trail** (quick, bright):
```javascript
{ spawnRate: 0.05, size: 0.2, lifetime: 0.6, gravity: 500, friction: 1.0, velocitySpread: 100, maxCount: 10 }
```

**Smoke Trail** (slow, heavy):
```javascript
{ spawnRate: 0.08, size: 0.5, lifetime: 2.0, gravity: 150, friction: 4.0, velocitySpread: 40, maxCount: 25 }
```

**Comet Trail** (long, flowing):
```javascript
{ spawnRate: 0.03, size: 0.4, lifetime: 1.5, gravity: 300, friction: 2.0, velocitySpread: 60, maxCount: 30 }
```

**Glitter Trail** (frequent, tiny):
```javascript
{ spawnRate: 0.02, size: 0.15, lifetime: 0.8, gravity: 400, friction: 1.5, velocitySpread: 120, maxCount: 40 }
```

---

## Future Enhancements

Potential improvements:
1. **Trail shape variety**: Allow different shapes per trail
2. **Velocity inheritance**: Trails inherit some parent velocity
3. **Color shifting**: Trails change color over time
4. **Trail branching**: Trails spawn sub-trails
5. **Distance-based spawning**: Spawn based on distance traveled instead of time
6. **Performance auto-scaling**: Reduce trail quality when FPS drops

---

## Troubleshooting

**Trails not appearing:**
- Check `enableTrails` is `true`
- Verify `trailConfig` is provided
- Ensure `FIREWORK_CONFIG.trails` is defined
- Check console for errors

**Too many particles:**
- Reduce `maxCount` in trail config
- Increase `spawnRate` (spawn less frequently)
- Reduce particle `lifetime`

**Performance issues:**
- Disable trails on some patterns
- Lower `maxTrails` globally
- Reduce total particle count
- Increase `spawnRate`

**Trails look wrong:**
- Check color alpha is visible
- Adjust gravity/friction values
- Verify size multiplier is reasonable
- Check trail lifetime isn't too short

---

## Code References

**Files Modified:**
1. `js/config/config.js` - Trail configuration
2. `js/particles/InstancedParticleSystem.js` - Core trail system
3. `js/entities/Firework.js` - Trail parameter passing

**Key Methods:**
- `InstancedParticleSystem.addParticle()` - Initialize trail data
- `InstancedParticleSystem.update()` - Trail spawning logic
- `Firework.explode()` - Pass trail config to particles

---

## Implementation Status

- [x] **UI Integration Complete** - Trail particle controls added to recipes tab
- [ ] Step 1: Config updated (trail defaults in FIREWORK_CONFIG)
- [ ] Step 2.1: Trail indices added
- [ ] Step 2.2: addParticle() signature updated
- [ ] Step 2.3: Trail data initialization added
- [ ] Step 2.4: Trail spawning logic added
- [ ] Step 3: Firework.js updated
- [ ] Step 4: Test with sample recipes
- [ ] Performance testing completed
- [ ] Documentation reviewed

---

## UI Integration Complete ✅

The following UI controls have been added to the recipes tab:

### New Component Options:
- **Trail Particles** toggle checkbox
- **Spawn Rate** slider (0.01 - 0.2s)
- **Size Multiplier** slider (0.1 - 1.0)
- **Lifetime** slider (0.3 - 3.0s)
- **Gravity** slider (50 - 800)
- **Friction** slider (0.5 - 5.0)
- **Velocity Spread** slider (0 - 200)
- **Max Count** slider (5 - 50)

All sliders show live value displays and update the component configuration in real-time.

---

**Last Updated:** November 11, 2025  
**Version:** 1.0  
**Status:** Ready for Implementation
