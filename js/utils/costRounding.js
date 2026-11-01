// costRounding.js — cosmetic "clean ending" rounding for displayed/charged costs.
//
// Always rounds UP (so a rounded cost is never cheaper than the raw curve), and
// cleans the trailing digits so prices read nicely. The underlying
// baseCost × ratio^level curve is unchanged — this only tidies the result.

/**
 * Round a sparkle/gold cost UP to a clean step that grows with its size:
 *   under 1,000   → multiple of 50     (85 → 100, 418 → 450, 950 → 950)
 *   under 10,000  → multiple of 250    (1,010 → 1,250, 2,366 → 2,500)
 *   under 100,000 → multiple of 2,500  (23,450 → 25,000)
 *   above         → two significant figures (234,000 → 240,000)
 */
export function roundUpCost(value) {
    if (!Number.isFinite(value) || value <= 0) return value;
    let step;
    if (value <= 1000) step = 50;
    else if (value <= 10000) step = 250;
    else if (value <= 100000) step = 2500;
    else step = Math.pow(10, Math.floor(Math.log10(value)) - 1);
    return Math.ceil(value / step) * step;
}
