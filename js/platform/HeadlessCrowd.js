/**
 * HeadlessCrowd — a minimal crowd model for headless simulation.
 *
 * The real Crowd is a per-person skeleton/physics simulation. Headless mode
 * only needs the crowd *count* (which gates progression unlocks and feeds the
 * gold + crowd-catch estimates). Catapult interaction methods are stubbed so
 * the real Catapult.update() state machine runs without crashing — it simply
 * never finds a volunteer.
 */
export default class HeadlessCrowd {
    constructor() {
        this.people = [];
        this.naturalCount = 0;
        this.jetpackCount = 0;
        this.cultistCount = 0;
        this.catchingEnabled = false;
        this.collectionRadius = 0;
        this.goldPerCoinToss = 1;
    }

    /** Resize the crowd to `count`. We only ever read `people.length`. */
    setCount(count) {
        this.naturalCount = Math.max(0, Math.floor(count));
        this.people.length = this.naturalCount + this.jetpackCount + this.cultistCount;
    }

    setJetpackCount(count) {
        this.jetpackCount = Math.max(0, Math.floor(count));
        this.people.length = this.naturalCount + this.jetpackCount + this.cultistCount;
    }

    setCultistCount(count) {
        this.cultistCount = Math.max(0, Math.floor(count));
        this.people.length = this.naturalCount + this.jetpackCount + this.cultistCount;
    }

    // ── Catapult interaction stubs ──────────────────────────────────────────
    assignPersonToCatapult() { return -1; }
    launchPersonFromCatapult() {}

    dispose() { this.people = []; }
}
