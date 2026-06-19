/**
 * MemoryStorage — an in-memory localStorage work-alike for headless runs.
 * Keeps the simulator from reading or clobbering the player's real save.
 */
export default class MemoryStorage {
    constructor() {
        this._map = new Map();
    }

    getItem(key) {
        return this._map.has(key) ? this._map.get(key) : null;
    }

    setItem(key, value) {
        this._map.set(key, String(value));
    }

    removeItem(key) {
        this._map.delete(key);
    }

    clear() {
        this._map.clear();
    }
}
