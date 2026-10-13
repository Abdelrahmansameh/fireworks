// costRounding.js — cosmetic "clean ending" rounding for displayed/charged costs.
//
// Both helpers always round UP (so a rounded cost is never cheaper than the raw
// curve), and clean the trailing digits so prices read nicely. The underlying
// baseCost × ratio^level curve is unchanged — this only tidies the result.

/**
 * Round `value` UP so only its two leading digits are significant and the rest
 * are zeros (a clean power-of-ten ending). Used for all skill-tree upgrade and
 * non-launcher building costs.
 *   234 → 240,  608 → 610,  2366 → 2400,  23450 → 24000,  90 → 90
 */
export function roundUpClean(value, sigFigs = 2) {
    if (!Number.isFinite(value) || value <= 0) return value;
    const digits = Math.floor(Math.log10(value)) + 1;
    const power = Math.max(0, digits - sigFigs);
    const step = Math.pow(10, power);
    return Math.ceil(value / step) * step;
}

/**
 * Round `value` UP to the nearest multiple of `step` (default 25). Used for the
 * Auto-Launcher so its price always ends in a clean 00 / 25 / 50 / 75.
 *   50 → 50,  85 → 100,  418 → 425,  710 → 725
 */
export function roundUpToStep(value, step = 25) {
    if (!Number.isFinite(value) || value <= 0) return value;
    return Math.ceil(value / step) * step;
}
