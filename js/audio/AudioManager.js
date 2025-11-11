class AudioManager {
    constructor() {
        this.backgroundMusic = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        this.backgroundMusic = new Audio('assets/backgroundsong.mp3');
        this.backgroundMusic.loop = true;
        
        const savedVolume = localStorage.getItem('musicVolume');
        const volume = savedVolume !== null ? parseInt(savedVolume) / 100 : 0.5;
        this.backgroundMusic.volume = volume;

        this.playBackgroundMusic();

        this.initialized = true;
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
        if (this.backgroundMusic) {
            this.backgroundMusic.volume = Math.max(0, Math.min(1, volume));
        }
    }

    dispose() {
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.src = '';
            this.backgroundMusic = null;
        }
        this.initialized = false;
    }
}

export default AudioManager;
