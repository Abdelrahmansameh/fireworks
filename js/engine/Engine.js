import { Clock } from '../rendering/Renderer.js';

class Engine {
    constructor() {
        this.clock = new Clock();
        this.isPaused = true;
        this._running = false;
        this._boundLoop = this._loop.bind(this);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this.isPaused = false;
        this.clock.start();
        requestAnimationFrame(this._boundLoop);
    }

    _loop() {
        requestAnimationFrame(this._boundLoop);
        const delta = this.clock.getDelta();
        if (!this.isPaused) {
            this.update(delta);
            this.render(delta);
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        if (this.isPaused) {
            this.isPaused = false;
            this.clock.start();
        }
    }

    update(_delta) {}
    render(_delta) {}
}

export default Engine;
