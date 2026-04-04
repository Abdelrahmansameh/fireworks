import FireworkGame from './game/FireworkGame.js';
import { buildChrome } from './ui/UIBuilder.js';

document.addEventListener('DOMContentLoaded', () => {
    buildChrome();
    window.game = new FireworkGame();
    window.unlockEverything = () => window.game.cheatUnlockEverything();
});
