/**
 * NullAudio — inert AudioManager stand-in for headless mode.
 * Mirrors the public surface of AudioManager with no-ops.
 */
export default class NullAudio {
    init() {}
    playFireworkSound() {}
    playBackgroundMusic() {}
    pauseBackgroundMusic() {}
    resumeBackgroundMusic() {}
    setMusicVolume() {}
    setSfxVolume() {}
    dispose() {}
}
