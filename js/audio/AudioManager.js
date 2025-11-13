class AudioManager {
    constructor() {
        this.backgroundMusic = null;
        this.fireworkSound = null;
        this.initialized = false;
        this.wasPlayingBeforeHidden = false;
        this.maxSoundsPerSecond = 5;
        this.recentSoundTimestamps = [];
    }

    init() {
        if (this.initialized) return;

        this.backgroundMusic = new Audio('assets/backgroundsong.mp3');
        this.backgroundMusic.loop = true;
        
        const savedVolume = localStorage.getItem('musicVolume');
        const volume = savedVolume !== null ? parseInt(savedVolume) / 100 : 0.15;
        this.backgroundMusic.volume = volume;

        this.fireworkSound = new Audio('assets/firework2.mp3');

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

    playFireworkSound(startTime = 0) {
        if (!this.fireworkSound) return;

        const now = Date.now();
        
        // Remove timestamps older than 1 second
        this.recentSoundTimestamps = this.recentSoundTimestamps.filter(
            timestamp => now - timestamp < 1000
        );
        
        // Check if we've exceeded the rate limit
        if (this.recentSoundTimestamps.length >= this.maxSoundsPerSecond) {
            return; // Skip playing this sound
        }
        
        // Play the sound and record the timestamp
        const sound = this.fireworkSound.cloneNode();
        sound.currentTime = startTime;
        sound.volume = this.backgroundMusic.volume * 0.3 * ((this.maxSoundsPerSecond - this.recentSoundTimestamps.length + 1) / this.maxSoundsPerSecond);
        sound.play().catch(err => console.log('Failed to play firework sound:', err));
        
        this.recentSoundTimestamps.push(now);
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
