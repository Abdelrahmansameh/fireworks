class AudioManager {
    constructor() {
        this.backgroundMusic = null;
        this.audioCtx = null;
        this.masterGain = null;
        this.initialized = false;
        this.wasPlayingBeforeHidden = false;
        this.maxSoundsPerSecond = 5;
        this.recentSoundTimestamps = [];
        this._explNum = 0;
        this._currentVolume = 0.15;

        this._whistleVol = 0.05;
        this._explosionVol = 0.1;
        this._fmax = 3200;
        this._fmin = 3000;
        this._decayRate = 20;
    }

    _getAudioCtx() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    init() {
        if (this.initialized) return;

        this.backgroundMusic = new Audio('assets/backgroundsong.mp3');
        this.backgroundMusic.loop = true;

        const savedVolume = localStorage.getItem('musicVolume');
        this._currentVolume = savedVolume !== null ? parseInt(savedVolume) / 100 : 0.15;
        this.backgroundMusic.volume = this._currentVolume;

        this.playBackgroundMusic();

        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.initialized = true;
    }

    handleVisibilityChange() {
        if (document.hidden) {
            if (this.backgroundMusic && !this.backgroundMusic.paused) {
                this.wasPlayingBeforeHidden = true;
                this.pauseBackgroundMusic();
            }
        } else {
            if (this.wasPlayingBeforeHidden) {
                this.resumeBackgroundMusic();
                this.wasPlayingBeforeHidden = false;
            }
        }
    }

    playBackgroundMusic() {
        if (this.backgroundMusic) {
            const playPromise = this.backgroundMusic.play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log('Autoplay prevented. Music will start on user interaction.');
                    document.addEventListener('click', () => {
                        this.backgroundMusic.play();
                    }, { once: true });
                });
            }
        }
    }

    pauseBackgroundMusic() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
        }
    }

    resumeBackgroundMusic() {
        if (this.backgroundMusic && this.backgroundMusic.paused) {
            this.backgroundMusic.play();
        }
    }

    setVolume(volume) {
        this._currentVolume = Math.max(0, Math.min(1, volume));
        if (this.backgroundMusic) {
            this.backgroundMusic.volume = this._currentVolume;
        }
        if (this.masterGain) {
            this.masterGain.gain.value = this._currentVolume * (0.8 / 0.15);
        }
    }

    // --- Synthesis helpers from the goat athibaul on shadertoy converted to js ---

    _rand(seed) {
        const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    _noise(s) {
        const si = Math.floor(s);
        const sf = s - si;
        const t = sf * sf * (3 - 2 * sf);
        return (this._rand(si) * (1 - t) + this._rand(si + 1) * t) * 2 - 1;
    }

    _coloredNoise(t, fc, df) {
        return Math.sin(2 * Math.PI * fc * (t % 1)) * this._noise(t * df);
    }

    _smoothstep(a, b, x) {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }


    playFireworkSound(ascentDuration) {
        const now = Date.now();

        this.recentSoundTimestamps = this.recentSoundTimestamps.filter(
            ts => now - ts < 1000
        );
        if (this.recentSoundTimestamps.length >= this.maxSoundsPerSecond) {
            return;
        }

        const volScale = (this.maxSoundsPerSecond - this.recentSoundTimestamps.length + 1) / this.maxSoundsPerSecond;
        this.recentSoundTimestamps.push(now);

        const ac = this._getAudioCtx();

        if (!this.masterGain) {
            this.masterGain = ac.createGain();
            this.masterGain.gain.value = this._currentVolume * (0.8 / 0.15);
            this.masterGain.connect(ac.destination);
        }

        const sampleRate = ac.sampleRate;
        const tailDuration = 2.5; 
        const totalDuration = ascentDuration + tailDuration;
        const numSamples = Math.ceil(totalDuration * sampleRate);

        const myNum = this._explNum++;
        const fmaxActual = this._fmax + this._rand(myNum) * 200;
        const fmin = this._fmin;

        const wVol = this._whistleVol;
        const eVol = this._explosionVol;
        const decayRate = this._decayRate;

        const buf = ac.createBuffer(2, numSamples, sampleRate);
        const L = buf.getChannelData(0);
        const R = buf.getChannelData(1);

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const tExp = t - ascentDuration; 

            const whist = Math.sin(2 * Math.PI * (t * fmaxActual - t * t / 2 * (fmaxActual - fmin)));
            const wEnv = this._smoothstep(0, 0.3, t) * this._smoothstep(0, 0.15, ascentDuration - t);
            const inten = (0.5 + 0.49 * Math.sin(2.62 * t))
                        * (0.5 - 0.49 * Math.cos(t + myNum))
                        * (0.5 + 0.3  * Math.sin(13 * t));
            const wSig = whist * wEnv * inten;
            const th = 0.3 * Math.cos(3 * t); 

            let ex = 0, ey = 0;
            if (tExp >= 0) {
                const v  = this._coloredNoise(tExp,     500, 800)
                         + 0.1  * this._noise(8000  * tExp)
                         + 0.05 * this._noise(15000 * tExp);
                const v2 = this._coloredNoise(tExp + 1, 500, 800)
                         + 0.1  * this._noise(8000  * (tExp + 1))
                         + 0.05 * this._noise(15000 * (tExp + 1));

                let env = 2   * Math.exp(-tExp * decayRate)
                        + 0.5 * Math.exp(-tExp * 10);

                ex = v  * env;
                ey = v2 * env;
                const denom = 1 + Math.abs(ex) + Math.abs(ey);
                ex /= denom;
                ey /= denom;
            }

            L[i] = (wVol * wSig * (1 - th) + eVol * ex) * volScale;
            R[i] = (wVol * wSig * (1 + th) + eVol * ey) * volScale;
        }

        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(this.masterGain);
        src.start(ac.currentTime);
    }

    dispose() {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.src = '';
            this.backgroundMusic = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
            this.masterGain = null;
        }
        this.initialized = false;
    }
}

export default AudioManager;
