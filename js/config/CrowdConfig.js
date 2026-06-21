export const CROWD_CONFIG = {
    // Scaling
    scaling: {
        // crowd = floor(formulaA * (totalFireworks - formulaOffset)^formulaExp + formulaB)
        //
        // Driven by TOTAL FIREWORKS LAUNCHED (not sparkles/sec), which grows
        // smoothly and monotonically — so the crowd paces gently with no jumps.
        // Tuned for ~4 fireworks/sec of engaged play:
        //   1st fan  ≈ 2 min  (~520 fireworks)
        //   ~7 fans  ≈ 10 min
        //   ~25 fans ≈ 30 min
        //   ~60 fans ≈ 60 min
        // Exponent < 1 gives diminishing returns so the venue fills naturally
        // instead of exploding once production ramps up.
        formula: 'power_fireworks',
        formulaA: 0.006,
        formulaExp: 1.2,
        formulaOffset: 600,
        formulaB: 0,
        minSize: 0.9,
        maxSize: 1.25,
        seed: 12345,
    },

    maxInstances: 15000,
    zIndex: 100,

    minOverlapDistance: 20,          // world-units — min spacing between people
    maxPlacementAttempts: 10,
    ySpread: 70,                    // random Y offset below CROWD_Y
    baseScale: 6.7,
    scaleVariance: 0.4,             // scale = baseScale + random * scaleVariance
    spawnBias: 2,                   // >1 biases spawn positions toward the rightmost side

    // Slot-based placement (right-to-left columns, top-to-bottom rows)
    xSlotSpacing: 72,               // world-units between slot columns (right→left)
    slotRows: 3,                    // rows per column (top→bottom within ySpread)
    slotJitterX: 0.38,              // jitter fraction of xSlotSpacing
    slotJitterY: 0.50,              // jitter fraction of row spacing

    // Physics
    gravity: 2200,                  // world-units / s²
    friction: 1.0,                  // air-resistance damping factor (v *= e^(-friction*dt))
    walkSpeed: 600,                 // world-units / s
    landingSnapDistance: 5,         // close-enough to resume cheering after fall
    walkArrivalDistance: 3,         // close-enough to stop walking

    // Grab / throw interaction
    pickRadius: 60,                 // world-units — max cursor-to-person dist for grab (slightly increased)
    cursorHistorySize: 6,           // samples kept for launch-velocity estimation
    minDtForVelocity: 0.005,       // seconds — ignore tiny dt to avoid div-by-zero
    maxThrowSpeedSquared: 2500 * 2500, // world-units²/s² — cap launch speed to prevent extreme throws
    wallBounce: 0.5,                // velocity retention when bouncing off world edges
    wallBounceBuffer: 500,          // world-units — invisible buffer beyond scroll bounds for wall bounces

    // Ground bouncing
    groundBounceCount: 3,           // number of bounces before the person lands on the next ground contact
    groundBounceDamping: 0.45,      // fraction of vertical speed retained on each ground bounce

    // Cinematic pupil tracking — how far (in skeleton-local units) a pupil may
    // slide from its eye centre when looking at a target. Eye is 1.5 wide,
    // pupil 0.5, so ~0.5 keeps it just inside the eye rim.
    pupilLookRadius: 0.42,

    // ── Animation blending (cross-fade between state animations) ───────────────
    // When a person switches state, the pose at the moment of the switch is
    // frozen and cross-faded into the new state's live animation over a short
    // window, so transitions read smoothly instead of snapping.
    blending: {
        enabled: true,
        defaultDuration: 0.18,      // seconds — fallback fade time for any transition
        ease: 'smoothstep',         // 'linear' | 'smoothstep'

        // Per-transition fade times (seconds). Lookup order, first match wins:
        //   'from->to'  →  '*->to'  →  'to'  →  defaultDuration
        // A value of 0 disables blending for that transition (instant snap).
        transitions: {
            'walking->cheering': 0.22,
            'cheering->walking': 0.14,
            'falling->cheering': 0.20,
            'falling->walking': 0.14,
            'grabbed->falling': 0.0,   // throw should feel immediate
            'cheering->grabbed': 0.0,
            'catapult_walk->catapult_arc': 0.12,   // walk → jump launch
            'catapult_arc->catapult_riding': 0.12,
        },

        // Fade time (seconds) when the cinematic system takes over / releases a
        // person's skeleton (person.cinematicIdle). Applied via requestPoseBlend.
        cinematicTakeover: 0.35,
        cinematicRelease: 0.25,

        // Bone-mask overlays (e.g. coin toss) fade their override weight in at
        // the start and out at the end, so the arms ease between the base state
        // pose (cheering) and the overlay instead of snapping. Keyed by clip name.
        overlays: {
            toss_coin: { fadeIn: 0.14, fadeOut: 0.18 },
        },
    },
};

export const CROWD_CATCHER_CONFIG = {
    collectionRadius: 60,     // world-units scan radius (slightly wider than drone's 50)
    pullForce: 900,          // wu/s² — acceleration toward person
    arrivalThreshold: 10,     // wu — particle collected when closer than this
    maxCaptureTime: 3.5,      // s — force-collect after this long
    minParticleAge: 0.15,      // s — ignore freshly-spawned particles
    sparklesPerParticle: 3,   // base sparkle reward per collected particle (collectors are value-extractors)
    scanInterval: 4,          // throttle: scan every N frames
};
