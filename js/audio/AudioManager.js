class AudioManager {
    constructor() {
        this.backgroundMusic = null;
        this.initialized = false;
        this.wasPlayingBeforeHidden = false;
    }

    init() {
        if (this.initialized) return;

        this.backgroundMusic = new Audio('assets/backgroundsong.mp3');
        this.backgroundMusic.loop = true;
        
        const savedVolume = localStorage.getItem('musicVolume');
        const volume = savedVolume !== null ? parseInt(savedVolume) / 100 : 0.15;
        this.backgroundMusic.volume = volume;

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
        if (this.backgroundMusic) {
            this.backgroundMusic.volume = Math.max(0, Math.min(1, volume));
        }
    }

    dispose() {
        // Remove visibility change listener
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic.src = '';
            this.backgroundMusic = null;
        }
        this.initialized = false;
    }
}

export default AudioManager;
