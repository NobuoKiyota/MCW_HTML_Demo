/**
 * Transition Handler Module
 * Handles the visual and audio transition from Japanese to Cyber theme.
 */

class TransitionManager {
    constructor() {
        this.videoPath = 'assets/mp4/Transition_Cyber.mp4';
        this.overlayId = 'cyber-transition-overlay';
        this.audioManager = null; // Will be set from window or init
    }

    /**
     * Start the transition sequence
     * @param {Function} onMidPoint - Callback when theme should switch (brightest point)
     * @param {Function} onComplete - Callback when transition ends
     */
    async startTransition(onMidPoint, onComplete) {
        if (!this.audioManager && window.audioManager) {
            this.audioManager = window.audioManager;
        }

        console.log('TransitionManager: Starting Cyber Transition');

        // 1. Preload Audio (Wait for it to ensure sync)
        let seBuffer = null;
        if (this.audioManager) {
            const sePath = 'assets/sounds/cyber/Transition_Cyber.mp3';
            try {
                seBuffer = await this.audioManager.loadAudioFile(sePath);
                console.log('TransitionManager: SE Preloaded');
            } catch (e) {
                console.warn('TransitionManager: SE Load failed', e);
            }
        }

        // 2. Audio Fade Out (0.2s) - Do this after load so we don't have silence while loading
        // 2. Audio Fade Out (0.2s) - Do this after load so we don't have silence while loading
        if (this.audioManager) {
            this.audioManager.fadeOutAll(0.2);

            // Explicitly stop ambience here as well to be absolutely sure
            if (window.soundGenerator && window.soundGenerator.stopAmbience) {
                console.log('TransitionManager: Force stopping All Ambience');
                window.soundGenerator.stopAmbience();
            }

            // Wait for BGM stop confirmation
            await new Promise(resolve => {
                const onBgmStopped = () => {
                    document.removeEventListener('bgm-stopped', onBgmStopped);
                    console.log('TransitionManager: Received bgm-stopped trigger');
                    resolve();
                };

                // Safety timeout in case event is missed (e.g. if BGM wasn't playing)
                setTimeout(() => {
                    if (document.removeEventListener) document.removeEventListener('bgm-stopped', onBgmStopped);
                    resolve();
                }, 300);

                document.addEventListener('bgm-stopped', onBgmStopped);

                // Now trigger the stop
                this.audioManager.stopBGM();
                console.log('TransitionManager: Requested BGM Stop');
            });
        }

        // 3. Setup Video Overlay
        const overlay = this.createVideoOverlay();
        document.body.appendChild(overlay);
        const video = overlay.querySelector('video');

        // State flags
        let midPointTriggered = false;
        let cleanupCalled = false; // Prevent double cleanup

        const triggerMidPoint = () => {
            if (!midPointTriggered) {
                midPointTriggered = true;
                console.log('TransitionManager: Triggering MidPoint (Theme Switch)');
                if (onMidPoint) {
                    try { onMidPoint(); } catch (e) { console.error('MidPoint error', e); }
                }
            }
        };

        const safeCleanup = (isForced = false) => {
            if (cleanupCalled) return;
            cleanupCalled = true;
            console.log(`TransitionManager: Cleanup called (Forced: ${isForced})`);

            // Ensure midpoint fired if missed
            triggerMidPoint();

            // Remove Overlay
            // If forced or safety timeout, remove immediately to prevent black screen
            if (isForced) {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                try { if (onComplete) onComplete(); } catch (e) { console.error('Complete error', e); }
            } else {
                // Formatting fade
                overlay.style.transition = 'opacity 0.2s ease-out';
                overlay.style.opacity = '0';
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    try { if (onComplete) onComplete(); } catch (e) { console.error('Complete error', e); }
                }, 250); // Faster cleanup 0.25s
            }
        };

        // 4. Play Video & SE
        try {
            // Play Audio immediately just before video
            if (seBuffer && this.audioManager) {
                const ctx = this.audioManager.audioContext;
                const source = ctx.createBufferSource();
                const gainNode = ctx.createGain();

                source.buffer = seBuffer;
                gainNode.gain.value = 0.8;

                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                source.start(0);
                console.log('TransitionManager: SE Started');
            }

            const playPromise = video.play();
            if (playPromise !== undefined) {
                await playPromise;
            }
            console.log('TransitionManager: Video Playing');

            const triggerTime = 1.2;
            video.addEventListener('timeupdate', () => {
                if (!midPointTriggered && video.currentTime >= triggerTime) {
                    triggerMidPoint();
                }
            });

        } catch (e) {
            console.error('TransitionManager: Video play failed', e);
            safeCleanup(true); // Force remove
            return;
        }

        // 5. Cleanup on ended
        video.onended = () => {
            console.log('TransitionManager: Video ended normally');
            safeCleanup(false);
        };

        // 6. Safety Nets

        // A. Duration based
        video.onloadedmetadata = () => {
            const duration = video.duration;
            if (isFinite(duration) && duration > 0) {
                const safeTime = (duration + 1.0) * 1000;
                setTimeout(() => {
                    // Check if overlay is still in DOM
                    if (!cleanupCalled && document.getElementById(this.overlayId)) {
                        console.warn('TransitionManager: Safety Timeout A (Duration)');
                        safeCleanup(true);
                    }
                }, safeTime);
            }
        };

        // B. Absolute fallback (4s)
        setTimeout(() => {
            // Check if overlay is still in DOM
            if (!cleanupCalled && document.getElementById(this.overlayId)) {
                console.warn('TransitionManager: Safety Timeout B (Absolute 4s)');
                safeCleanup(true);
            }
        }, 4000);
    }

    createVideoOverlay() {
        const div = document.createElement('div');
        div.id = this.overlayId;
        div.style.position = 'fixed';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = '100vw';
        div.style.height = '100vh';
        div.style.zIndex = '9999';
        // Transparent container to allow Screen blend mode of video to work against underlying UI
        div.style.backgroundColor = 'transparent';
        div.style.pointerEvents = 'none';

        const video = document.createElement('video');
        video.src = this.videoPath;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        // 'screen' blend mode: 
        // Black pixels in video => Transparent
        // Bright pixels => Additive to underlying UI
        video.style.mixBlendMode = 'screen';
        video.muted = false;
        video.playsInline = true;

        div.appendChild(video);
        return div;
    }

    cleanup(overlay, onComplete) {
        // Fallback cleanup method if needed externally, but safeCleanup handles logic
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onComplete) onComplete();
    }
}
window.TransitionManager = TransitionManager;
