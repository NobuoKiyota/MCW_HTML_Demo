/**
 * soundGenerator.js
 * Generates and manages procedural soundscapes (BGM & Ambience)
 */

class SoundGenerator {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.context = null; // Will be retrieved from audioManager in init()

        this.masterGain = null;
        this.bgmOscillators = [];
        this.ambNodes = {}; // Store source nodes
        this.ambGainNodes = {}; // Store gain nodes
        this.isPlaying = false;
        this.isAmbienceActive = false;
        this.starBuffer = null; // Buffer for Star Ambience (MP3)
        this.rainBuffer = null; // Buffer for Rain Ambience (MP3)

        // Try init immediately if context exists (unlikely in this flow), otherwise wait for explicit init() call
        if (this.audioManager && this.audioManager.audioContext) {
            this.init();
        }
    }

    init() {
        // Ensure we have the context
        if (this.audioManager && !this.context) {
            this.context = this.audioManager.audioContext;
        }

        if (!this.context) return; // Context not ready yet

        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.masterGain.gain.setValueAtTime(0.5, this.context.currentTime); // Default volume

        // Load Ambience Sounds
        this._loadAmbienceSound('star', 'assets/sounds/japanese/Ambience_Star.mp3');
        this._loadAmbienceSound('rain', 'assets/sounds/japanese/Ambience_Rain.mp3');
    }

    async _loadAmbienceSound(type, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const arrayBuffer = await response.arrayBuffer();
            this.context.decodeAudioData(arrayBuffer, (buffer) => {
                if (type === 'star') this.starBuffer = buffer;
                if (type === 'rain') this.rainBuffer = buffer;
                console.log(`${type} ambience loaded`);

                // If ambience is already active, restart to include new sound
                if (this.isAmbienceActive && !this.ambNodes[type]) {
                    this._createSampleNode(type);
                }
            }, (e) => console.error(`Error decoding ${type} ambience`, e));
        } catch (e) {
            console.warn(`Could not load ${url}`, e);
        }
    }

    // --- Bridge to AudioManager for File-based BGM ---
    playMusic(genre) {
        if (this.audioManager) {
            // Note: genre arg usually passed as theme logic, 
            // but here we just trigger whatever theme BGM is loaded or specific one.
            // AudioManager takes care of loading correct theme BGM.
            // If the Genre buttons are meant to switch tracks within a theme, 
            // AudioManager needs to support that. 
            // For now, simple startBGM is what was there.
            this.audioManager.startBGM();
            this.isPlaying = true;
        }
    }

    stopMusic() {
        if (this.audioManager) {
            this.audioManager.stopBGM();
        }
        this.isPlaying = false;
    }

    setMusicVolume(value) {
        if (this.audioManager) {
            this.audioManager.setBGMVolume(value);
        }
    }

    setVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(value, this.context.currentTime, 0.1);
        }
    }

    // --- BGM Generator (Procedural) ---
    // (Simplified for demo -> playing a simple drone/sequence)
    playProceduralBGM(genre) {
        // Stop existing
        this.stopBGM();

        this.isPlaying = true;

        // Simple pentatonic drone for "Japanese"
        if (genre === 'japanese') {
            const freqs = [196.00, 220.00, 261.63, 293.66, 329.63]; // G3 A3 C4 D4 E4

            freqs.forEach((f, i) => {
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, this.context.currentTime);

                // Random drift
                this.applyDrift(osc, f);

                gain.gain.setValueAtTime(0, this.context.currentTime);
                gain.gain.linearRampToValueAtTime(0.05, this.context.currentTime + 2); // Fade in

                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start();

                this.bgmOscillators.push({ osc, gain });
            });
        }
        // ... other genres placeholders ...
    }

    applyDrift(osc, baseFreq) {
        setInterval(() => {
            if (!this.isPlaying) return;
            const detune = (Math.random() - 0.5) * 5; // +/- 2.5Hz
            osc.frequency.setTargetAtTime(baseFreq + detune, this.context.currentTime, 2);
        }, 2000 + Math.random() * 1000);
    }

    stopBGM() {
        this.isPlaying = false;
        this.bgmOscillators.forEach(o => {
            try {
                o.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.5);
                o.osc.stop(this.context.currentTime + 0.5);
            } catch (e) { }
        });
        this.bgmOscillators = [];
    }

    // --- Ambience Generator ---

    startAmbience() {
        if (this.isAmbienceActive) return;
        this.isAmbienceActive = true;

        // Create nodes for 4 corners

        // Rain (MP3 or Fallback)
        if (this.rainBuffer) {
            this._createSampleNode('rain');
        } else {
            this._createAmbNode('rain', 'lowpass', 800);
        }

        // Star (MP3 or Fallback)
        if (this.starBuffer) {
            this._createSampleNode('star');
        } else {
            this._createAmbNode('star', 'highpass', 3000);
        }

        // Snow (Noise + Bandpass)
        this._createAmbNode('snow', 'bandpass', 400); // Windy

        // Leaves (Noise + Peaking)
        this._createAmbNode('leaves', 'peaking', 1500);
    }

    _createAmbNode(id, filterType, freq) {
        if (this.ambNodes[id]) return;

        const src = this.context.createBufferSource();
        src.buffer = this.createNoiseBuffer();
        src.loop = true;

        const filter = this.context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = freq;
        if (filterType === 'bandpass') filter.Q.value = 1.0;

        const gain = this.context.createGain();
        gain.gain.value = 0; // Start silent

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        src.start();

        this.ambNodes[id] = src;
        this.ambGainNodes[id] = gain;
    }

    _createSampleNode(id) {
        if (this.ambNodes[id]) return;

        let buffer = null;
        if (id === 'star') buffer = this.starBuffer;
        if (id === 'rain') buffer = this.rainBuffer;

        if (!buffer) return;

        const src = this.context.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const gain = this.context.createGain();
        gain.gain.value = 0; // Start silent

        src.connect(gain);
        gain.connect(this.masterGain);

        src.start();

        this.ambNodes[id] = src;
        this.ambGainNodes[id] = gain;
    }

    stopAmbience() {
        this.isAmbienceActive = false;
        Object.keys(this.ambNodes).forEach(key => {
            try {
                this.ambNodes[key].stop();
                this.ambNodes[key].disconnect();
            } catch (e) { }
        });
        this.ambNodes = {};
        this.ambGainNodes = {};
    }

    createNoiseBuffer() {
        const bufferSize = this.context.sampleRate * 2; // 2 seconds
        const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    updateAmbienceMix(x, y) {
        if (!this.isAmbienceActive) this.startAmbience();
        if (!this.context) return;

        // If star/rain loaded late and needed, init them
        if (this.isAmbienceActive) {
            if (!this.ambNodes['star'] && this.starBuffer) this._createSampleNode('star');
            if (!this.ambNodes['rain'] && this.rainBuffer) {
                // If we're replacing the generated rain with MP3
                if (this.ambNodes['rain'] && this.ambNodes['rain'].buffer !== this.rainBuffer) {
                    try {
                        this.ambNodes['rain'].stop();
                        this.ambNodes['rain'].disconnect();
                    } catch (e) { }
                    this.ambNodes['rain'] = null;
                }
                this._createSampleNode('rain');
            }
        }

        const t = this.context.currentTime;
        const rampTime = 0.1;
        const distFromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);

        // Master Volume based on distance from center (Center is silent)
        // 0.1 radius deadzone
        let masterVol = (distFromCenter - 0.1) * 2.5;
        masterVol = Math.max(0, Math.min(1, masterVol));

        // Sharp Isolation Logic
        // Calculate proximity to each corner (0,0), (1,0), (0,1), (1,1)
        // Map distance 0 -> 1.0 mix, distance > 0.5 -> 0.0 mix (sharply)
        const range = 0.6; // Radius of effect
        const sharpness = 3.0; // Sharpness curve

        const getWeight = (tx, ty) => {
            const d = Math.sqrt((x - tx) ** 2 + (y - ty) ** 2);
            // Normalized proximity: 1 close, 0 far
            const prox = Math.max(0, 1 - (d / range));
            return Math.pow(prox, sharpness);
        };

        const rainMix = getWeight(0, 0);
        const starMix = getWeight(1, 0);
        const snowMix = getWeight(0, 1);
        const leavesMix = getWeight(1, 1);

        // Apply
        if (this.ambGainNodes.rain) this.ambGainNodes.rain.gain.setTargetAtTime(rainMix * masterVol, t, rampTime);
        if (this.ambGainNodes.star) this.ambGainNodes.star.gain.setTargetAtTime(starMix * masterVol, t, rampTime);
        if (this.ambGainNodes.snow) this.ambGainNodes.snow.gain.setTargetAtTime(snowMix * masterVol, t, rampTime);
        if (this.ambGainNodes.leaves) this.ambGainNodes.leaves.gain.setTargetAtTime(leavesMix * masterVol, t, rampTime);

        return {
            rain: rainMix * masterVol,
            star: starMix * masterVol,
            snow: snowMix * masterVol,
            leaves: leavesMix * masterVol
        };
    }
}

window.SoundGenerator = SoundGenerator;
