

const GLOW_URL = 'assets/glow.png';
const GLOW_KEY = 'glow';

let _renderer = null;
let _glowTexture = null;
let _readyPromise = null;

function init(renderer) {
    _renderer = renderer;
    _readyPromise = renderer.loadTexture(GLOW_URL, GLOW_KEY).then(tex => {
        _glowTexture = tex;
    });
    return _readyPromise;
}

function ready() {
    return _readyPromise ?? Promise.resolve();
}


function getGlowTexture() {
    return _glowTexture;
}

export { init, ready, getGlowTexture };
