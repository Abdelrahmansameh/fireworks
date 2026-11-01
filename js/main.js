import FireworkGame from './game/FireworkGame.js';
import { buildChrome } from './ui/UIBuilder.js';
import { initializeProgressionTool } from './tools/ProgressionToolUI.js';
import GameBot from './bot/GameBot.js';
import { ChromeController } from './ui/ChromeController.js';
import { WorkshopScreen } from './ui/WorkshopScreen.js';
import { initializePanelDetails } from './ui/panelDetails.js';

function startGame() {
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
}

// Config modules await assets (the cultist ritual clip), so this module can
// finish evaluating after DOMContentLoaded has already fired.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
} else {
    startGame();
}
