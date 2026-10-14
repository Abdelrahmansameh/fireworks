import FireworkGame from './game/FireworkGame.js';
import { buildChrome } from './ui/UIBuilder.js';
import { initializeProgressionTool } from './tools/ProgressionToolUI.js';
import GameBot from './bot/GameBot.js';
import { ChromeController } from './ui/ChromeController.js';
import { WorkshopScreen } from './ui/WorkshopScreen.js';
import { initializePanelDetails } from './ui/panelDetails.js';

document.addEventListener('DOMContentLoaded', () => {
    buildChrome();
    window.game = new FireworkGame();
    window.game.chrome = new ChromeController(window.game);
    window.game.workshop = new WorkshopScreen(window.game);
    initializePanelDetails(window.game);
    window.unlockEverything = () => window.game.cheatUnlockEverything();
    window.showProgressionTool = initializeProgressionTool;

    // Bot mode (?bot=1): attach the auto-play bot. The Bot tab is revealed in
    // UIManager.initializeUnlockStates(); in normal play it stays hidden.
    if (new URLSearchParams(location.search).has('bot')) {
        window.game.bot = new GameBot(window.game);
    }
});
