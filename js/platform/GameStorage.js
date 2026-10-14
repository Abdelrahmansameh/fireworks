import MemoryStorage from './MemoryStorage.js';

// Bot playthroughs always start fresh and never read or overwrite a player's save.
export const isBotMode = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('bot');
export const gameStorage = isBotMode || typeof localStorage === 'undefined'
    ? new MemoryStorage() : localStorage;
