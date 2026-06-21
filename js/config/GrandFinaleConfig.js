// GrandFinaleConfig — the climax event unlocked ~15 min in.
//
// When triggered, the Grand Finale floods the sky with fireworks, ramping the
// live particle count up toward the engine's hard limit (FIREWORK_CONFIG.
// maxParticles) and holding it there for `durationSec`. It's the launcher's
// big encore: every finale firework pays out launcher sparkles, so the source
// that supplied particles all game gets a spectacular income spike at the end.
export const GRAND_FINALE_CONFIG = {
    // How long the sky stays saturated, in seconds. THE configurable duration.
    durationSec: 18,

    // Fraction of the engine particle cap to aim for (1.0 = completely full).
    // Kept just under 1 so the per-shape buffers don't thrash at the very edge.
    targetFillFraction: 0.9,

    // Seconds of build-up at the start before the sky is fully saturated. The
    // spawn target eases from 0 → targetFill over this window, then holds.
    rampUpSec: 4,

    // Once unlocked, the finale re-fires automatically on this cadence (seconds
    // from the END of one finale to the START of the next). It's a recurring
    // spectacle so the endgame keeps erupting. Set autoTrigger:false to make it
    // purely manual (via triggerGrandFinale()).
    cooldownSec: 75,
    autoTrigger: true,

    // Estimated explosion particles per finale firework — used to convert the
    // "particles still needed" gap into a spawn count. Mirrors SimulationConfig's
    // avgParticlesPerFirework so the headless sim and live game agree.
    avgParticlesPerFirework: 120,

    // Safety cap on fireworks spawned per frame, so the initial fill ramps in
    // smoothly instead of a single-frame hitch.
    maxFireworksPerFrame: 1,

    // Each finale firework pays this fraction of a normal launcher firework's
    // sparkles. The finale sustains a huge spawn rate (it's refilling the sky to
    // the cap every frame), so full payout would dwarf every other source and
    // break the "no source is meaningless" rule. Keep it a spectacle first, a
    // tidy income bonus second. Set to 1.0 for an uncapped payout.
    sparkleYieldFraction: 0.25,

    // Headless-sim only: the effective sustained fireworks/sec the live finale
    // achieves while holding the sky at the cap (decayed particles get replaced
    // each frame). Used by GameCore.stepHeadless to model the finale's income so
    // the balance simulator reflects it. Tune alongside the live feel.
    simEffectiveFireworksPerSec: 220,

    // Metric source key for sparkles earned during the finale.
    sparkleSource: 'grand_finale',
};
