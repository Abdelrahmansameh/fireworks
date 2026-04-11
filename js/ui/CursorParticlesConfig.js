// Configuration constants for CursorParticles
export default {
    // Sentinels / thresholds
    OFFSCREEN_CLIENT_NEG: -9999,
    OFFSCREEN_X_THRESHOLD: -1000,
    PREV_INIT_THRESHOLD: -100,

    // Renderer / group
    SPRITE_QUAD_SIZE: 1.5,
    GROUP_MAX_INSTANCES: 200,
    GROUP_Z_INDEX: 9999,

    // Particles
    MAX_PARTICLES: 150,
    DEFAULT_SPAWN_COUNT: 2,
    SPAWN_MOVEMENT_COUNT: 1,
    SPAWN_IDLE_COUNT: 1,
    PARTICLE_SPEED_BASE: 18,
    PARTICLE_SPEED_VAR: 55,
    GOLD_PROBABILITY: 0.95,
    PARTICLE_LIFE_BASE: 0.5,
    PARTICLE_LIFE_VAR: 0.5,
    PARTICLE_DECAY_BASE: 1.0,
    PARTICLE_DECAY_VAR: 1.6,
    PARTICLE_SIZE_BASE: 4,
    PARTICLE_SIZE_VAR: 10,
    COLOR_GOLD: [1.0, 0.856, 0.264],
    COLOR_DEFAULT: [0.24, 0.92, 0.904],
    SPAWN_BIAS_SCALE: 0.25,

    // Movement / trail
    MOVEMENT_DIST_THRESHOLD: 5,
    MOVEMENT_STEP_DIV: 8,
    MOVEMENT_MAX_STEPS: 6,
    MOVEMENT_BIAS_SCALE: 8,

    // Idle / click
    IDLE_SPAWN_INTERVAL: 0.09,
    

    // Physics
    GRAVITY: 1000,
    FRICTION_BASE: 0.87,
    FRICTION_FPS: 60,

    // Size / easing
    SIZE_LIFE_MIN: 0.4,
    SIZE_LIFE_MAX: 0.6,
    SIZE_SCALE: 2.2,

    // Glow / ring
    GLOW_OUTER_SIZE: 30,
    GLOW_OUTER_COLOR: [0.5, 0.92, 0.96],
    GLOW_OUTER_ALPHA: 0.55,
    GLOW_CORE_SIZE: 8,
    GLOW_CORE_COLOR: [1.0, 1.0, 1.0],
    GLOW_CORE_ALPHA: 1.0,

    // Grab / skeleton outline mode
    OUTLINE_SPAWN_RATE: 80,          // particles per second distributed along the outline
    OUTLINE_PARTICLE_SPEED: 30,      // base outward speed (world units/s)
    OUTLINE_PARTICLE_SPEED_VAR: 50,  // extra random speed
    // life must start at 1.0 — alpha = life², so starting below 1 makes particles dim from birth
    OUTLINE_PARTICLE_LIFE: 1.0,
    OUTLINE_PARTICLE_DECAY: 3.5,     // dies in ~0.28s (1.0 / 3.5)
    OUTLINE_PARTICLE_SIZE: 4,
    OUTLINE_PARTICLE_SIZE_VAR: 6,
    OUTLINE_COLOR_CYAN: [0.28, 0.94, 1.0],
    OUTLINE_COLOR_WHITE: [1.0, 1.0, 1.0],
    OUTLINE_COLOR_WHITE_PROB: 0.2,
    
};
