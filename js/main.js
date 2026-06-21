import FireworkGame from './game/FireworkGame.js';
import { buildChrome } from './ui/UIBuilder.js';
import { initializeProgressionTool } from './tools/ProgressionToolUI.js';
import GameBot from './bot/GameBot.js';

document.addEventListener('DOMContentLoaded', () => {
    buildChrome();
    window.game = new FireworkGame();
    window.unlockEverything = () => window.game.cheatUnlockEverything();
    window.showProgressionTool = initializeProgressionTool;

    // Bot mode (?bot=1): attach the auto-play bot. The Bot tab is revealed in
    // UIManager.initializeUnlockStates(); in normal play it stays hidden.
    if (new URLSearchParams(location.search).has('bot')) {
        window.game.bot = new GameBot(window.game);
    }
});
