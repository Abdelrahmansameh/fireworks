import { STATS_CONFIG } from '../config/config.js';

/**
 * GameMetrics — tracks resource gains with source labels and computes
 * rolling averages. Window duration is set by STATS_CONFIG.rollingWindowSeconds.
 * Lifetime totals are persisted to localStorage.
 */
export default class GameMetrics {
    /** Rolling-average window in seconds (driven by config). */
    static get WINDOW() { return STATS_CONFIG.rollingWindowSeconds; }

    constructor() {
        // Rolling-window event buffers
        // Each entry: { ts: performance.now(), amount: number, source: string }
        this.events = {
            sparkles: [],
            gold: []
        };

        // Firework launch events: { ts, source }
        this.fireworkEvents = [];

        // ── Session totals (reset on page load) ─────────────────────────────
        this.sessionStartTime = performance.now();
        this.sessionSparkles = 0;
        this.sessionSparklesBySource = {};
        this.sessionGold = 0;
        this.sessionGoldBySource = {};
        this.sessionFireworks = 0;
        this.sessionFireworksBySource = {};
        this.sessionDroneParticles = 0;

        // ── Lifetime totals (persisted to localStorage) ──────────────────────
        this.lifetimeSparkles = 0;
        this.lifetimeSparklesBySource = {};
        this.lifetimeGold = 0;
        this.lifetimeGoldBySource = {};
        this.lifetimeFireworks = 0;
        this.lifetimeFireworksBySource = {};
        this.lifetimeDroneParticles = 0;

        // ── Peak records (persisted) ──────────────────────────────────────────
        this.peakSPS = 0;
        this.peakGPS = 0;
        this.peakFPS = 0;         // fireworks/sec
        this.peakCrowdSize = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Recording
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Record a resource gain.
     * @param {'sparkles'|'gold'} resource
     * @param {number} amount
     * @param {string} source  e.g. 'manual', 'auto_launcher', 'resource_generator', 'drone', 'crowd', 'cheat'
     */
    record(resource, amount, source = 'unknown') {
        if (amount <= 0) return;
        const ts = performance.now();

        // Push to rolling buffer
        if (this.events[resource]) {
            this.events[resource].push({ ts, amount, source });
        }

        // Session totals
        if (resource === 'sparkles') {
            this.sessionSparkles += amount;
            this.sessionSparklesBySource[source] = (this.sessionSparklesBySource[source] ?? 0) + amount;

            this.lifetimeSparkles += amount;
            this.lifetimeSparklesBySource[source] = (this.lifetimeSparklesBySource[source] ?? 0) + amount;
        } else if (resource === 'gold') {
            this.sessionGold += amount;
            this.sessionGoldBySource[source] = (this.sessionGoldBySource[source] ?? 0) + amount;

            this.lifetimeGold += amount;
            this.lifetimeGoldBySource[source] = (this.lifetimeGoldBySource[source] ?? 0) + amount;
        }
    }

    /**
     * Record a firework launch.
     * @param {string} source  'manual' | 'auto_launcher'
     */
    recordFirework(source = 'unknown') {
        const ts = performance.now();
        this.fireworkEvents.push({ ts, source });

        this.sessionFireworks++;
        this.sessionFireworksBySource[source] = (this.sessionFireworksBySource[source] ?? 0) + 1;

        this.lifetimeFireworks++;
        this.lifetimeFireworksBySource[source] = (this.lifetimeFireworksBySource[source] ?? 0) + 1;
    }

    /**
     * Record a drone particle collection (already counted through sparkle 'drone' source,
     * but we keep a separate raw count for the metrics panel).
     */
    recordDroneParticle() {
        this.sessionDroneParticles++;
        this.lifetimeDroneParticles++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Rolling rates
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get the rolling-average rate (units/sec) for a resource, optionally
     * filtered to a single source.
     * @param {'sparkles'|'gold'} resource
     * @param {string|null} source  Pass null for the total rate.
     * @returns {number}
     */
    getRollingRate(resource, source = null) {
        const W = GameMetrics.WINDOW;
        const now = performance.now();
        const cutoff = now - W * 1000;

        // Purge expired events
        const buf = this.events[resource];
        if (!buf) return 0;
        let i = 0;
        while (i < buf.length && buf[i].ts < cutoff) i++;
        if (i > 0) buf.splice(0, i);

        let total = 0;
        for (const e of buf) {
            if (source == null || e.source === source) {
                total += e.amount;
            }
        }
        return total / W;
    }

    /**
     * Get the rolling-average fireworks-per-second (total or by source).
     * @param {string|null} source
     * @returns {number}
     */
    getFireworksPerSecond(source = null) {
        const W = GameMetrics.WINDOW;
        const now = performance.now();
        const cutoff = now - W * 1000;

        let i = 0;
        while (i < this.fireworkEvents.length && this.fireworkEvents[i].ts < cutoff) i++;
        if (i > 0) this.fireworkEvents.splice(0, i);

        let count = 0;
        for (const e of this.fireworkEvents) {
            if (source == null || e.source === source) count++;
        }
        return count / W;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Peak tracking
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Update peak values. Call once per update tick with current rolling rates.
     */
    updatePeaks(sps, gps, fps, crowdSize) {
        if (sps > this.peakSPS) this.peakSPS = sps;
        if (gps > this.peakGPS) this.peakGPS = gps;
        if (fps > this.peakFPS) this.peakFPS = fps;
        if (crowdSize > this.peakCrowdSize) this.peakCrowdSize = crowdSize;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Session duration
    // ─────────────────────────────────────────────────────────────────────────

    getSessionDurationSeconds() {
        return (performance.now() - this.sessionStartTime) / 1000;
    }

    static formatDuration(seconds) {
        const s = Math.floor(seconds);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const rem = s % 60;
        if (m < 60) return `${m}m ${rem}s`;
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h}h ${rm}m ${rem}s`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistence
    // ─────────────────────────────────────────────────────────────────────────

    save() {
        const data = {
            lifetimeSparkles: this.lifetimeSparkles,
            lifetimeSparklesBySource: { ...this.lifetimeSparklesBySource },
            lifetimeGold: this.lifetimeGold,
            lifetimeGoldBySource: { ...this.lifetimeGoldBySource },
            lifetimeFireworks: this.lifetimeFireworks,
            lifetimeFireworksBySource: { ...this.lifetimeFireworksBySource },
            lifetimeDroneParticles: this.lifetimeDroneParticles,
            peakSPS: this.peakSPS,
            peakGPS: this.peakGPS,
            peakFPS: this.peakFPS,
            peakCrowdSize: this.peakCrowdSize
        };
        localStorage.setItem('gameMetrics', JSON.stringify(data));
    }

    load() {
        try {
            const raw = localStorage.getItem('gameMetrics');
            if (!raw) return;
            const data = JSON.parse(raw);

            this.lifetimeSparkles = data.lifetimeSparkles ?? 0;
            this.lifetimeSparklesBySource = data.lifetimeSparklesBySource ?? {};
            this.lifetimeGold = data.lifetimeGold ?? 0;
            this.lifetimeGoldBySource = data.lifetimeGoldBySource ?? {};
            this.lifetimeFireworks = data.lifetimeFireworks ?? 0;
            this.lifetimeFireworksBySource = data.lifetimeFireworksBySource ?? {};
            this.lifetimeDroneParticles = data.lifetimeDroneParticles ?? 0;
            this.peakSPS = data.peakSPS ?? 0;
            this.peakGPS = data.peakGPS ?? 0;
            this.peakFPS = data.peakFPS ?? 0;
            this.peakCrowdSize = data.peakCrowdSize ?? 0;
        } catch (e) {
            console.warn('GameMetrics: failed to load saved data', e);
        }
    }

    reset() {
        this.events = { sparkles: [], gold: [] };
        this.fireworkEvents = [];
        this.sessionStartTime = performance.now();
        this.sessionSparkles = 0;
        this.sessionSparklesBySource = {};
        this.sessionGold = 0;
        this.sessionGoldBySource = {};
        this.sessionFireworks = 0;
        this.sessionFireworksBySource = {};
        this.sessionDroneParticles = 0;

        this.lifetimeSparkles = 0;
        this.lifetimeSparklesBySource = {};
        this.lifetimeGold = 0;
        this.lifetimeGoldBySource = {};
        this.lifetimeFireworks = 0;
        this.lifetimeFireworksBySource = {};
        this.lifetimeDroneParticles = 0;
        this.peakSPS = 0;
        this.peakGPS = 0;
        this.peakFPS = 0;
        this.peakCrowdSize = 0;

        this.save();
    }
}
