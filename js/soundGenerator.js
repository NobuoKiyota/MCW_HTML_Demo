/**
 * soundGenerator.js
 * Generates and manages procedural soundscapes (BGM & Ambience)
 */

class SoundGenerator {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.context = null;

        this.masterGain = null;
        this.bgmOscillators = [];

        // Ambience Nodes Storage
        this.ambNodes = {};
        this.ambGainNodes = {};

        // Cyber Ambience specific
        this.cyberNodes = []; // Track synth nodes for easy cleanup

        this.isPlaying = false;
        this.isAmbienceActive = false;

        // Buffers
        this.starBuffer = null;
        this.rainBuffer = null;
        this.snowBuffer = null;

        if (this.audioManager && this.audioManager.audioContext) {
            this.init();
        }
    }

    init() {
        if (this.audioManager && !this.context) {
            this.context = this.audioManager.audioContext;
        }

        if (!this.context) return;

        this.masterGain = this.context.createGain();
        if (this.audioManager && this.audioManager.masterGainNode) {
            this.masterGain.connect(this.audioManager.masterGainNode);
        } else {
            this.masterGain.connect(this.context.destination);
        }
        this.masterGain.gain.setValueAtTime(0.5, this.context.currentTime);

        this._loadAmbienceSound('star', 'assets/sounds/japanese/Ambience_Star.mp3');
        this._loadAmbienceSound('rain', 'assets/sounds/japanese/Ambience_Rain.mp3');
        this._loadAmbienceSound('snow', 'assets/sounds/japanese/Ambience_Snow.mp3');
    }

    async _loadAmbienceSound(type, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const arrayBuffer = await response.arrayBuffer();
            this.context.decodeAudioData(arrayBuffer, (buffer) => {
                if (type === 'star') this.starBuffer = buffer;
                if (type === 'rain') this.rainBuffer = buffer;
                if (type === 'snow') this.snowBuffer = buffer;

                // If ambience active & Japanese theme, reload if missing?
                // Logic handled in update loop dynamically
            }, (e) => console.error(`Error decoding ${type} ambience`, e));
        } catch (e) {
            console.warn(`Could not load ${url}`, e);
        }
    }

    // --- Bridge to AudioManager for BGM ---
    playMusic(genre) {
        if (!this.audioManager) return;

        let bgmKey = 'bgm';
        if (genre === 'bgm2') bgmKey = 'bgm2';

        if (this.audioManager.currentBgmKey === bgmKey) {
            if (this.audioManager.isBgmPaused) {
                this.audioManager.startBGM(bgmKey, true);
                this.isPlaying = true;
            } else if (this.audioManager.bgmIsPlaying) {
                this.audioManager.pauseBGM();
                this.isPlaying = false;
            } else {
                this.audioManager.startBGM(bgmKey);
                this.isPlaying = true;
            }
        } else {
            this.audioManager.startBGM(bgmKey);
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

    playProceduralBGM(genre) {
        this.stopBGM();
        this.isPlaying = true;

        if (genre === 'japanese') {
            const freqs = [196.00, 220.00, 261.63, 293.66, 329.63];
            freqs.forEach((f, i) => {
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, this.context.currentTime);
                this.applyDrift(osc, f);
                gain.gain.setValueAtTime(0, this.context.currentTime);
                gain.gain.linearRampToValueAtTime(0.05, this.context.currentTime + 2);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start();
                this.bgmOscillators.push({ osc, gain });
            });
        }
    }

    applyDrift(osc, baseFreq) {
        const drift = () => {
            if (!this.isPlaying) return;
            const detune = (Math.random() - 0.5) * 5;
            try {
                osc.frequency.setTargetAtTime(baseFreq + detune, this.context.currentTime, 2);
            } catch (e) { }
            setTimeout(drift, 2000 + Math.random() * 1000);
        };
        drift();
    }

    stopBGM() {
        this.isPlaying = false;
        const now = this.context.currentTime;
        this.bgmOscillators.forEach(o => {
            try {
                o.gain.gain.cancelScheduledValues(now);
                o.gain.gain.setValueAtTime(0, now);
                o.osc.stop(now);
                o.osc.disconnect();
                o.gain.disconnect();
            } catch (e) { }
        });
        this.bgmOscillators = [];
    }

    // --- Ambience Generator ---

    startAmbience() {
        if (this.isAmbienceActive) return;

        // Check Theme
        const theme = this.audioManager ? this.audioManager.currentTheme : 'japanese';
        this.isAmbienceActive = true;

        // Initialize state if not present (or reset on start just in case)
        if (!this.ambienceState) {
            this.ambienceState = {
                rain: false, star: false, snow: false, leaves: false,
                gear: false, neon: false, siren: false, tremolo: false
            };
        }

        if (theme === 'cyber') {
            // this._startCyberAmbience(); // Removed: Managed dynamically now
        } else {
            // this._startJapaneseAmbience(); // Removed: Managed dynamically now
        }
    }

    // Helper: Start a specific sound type
    _startSoundNode(type, theme) {
        if (theme === 'japanese') {
            if (type === 'rain' || type === 'star' || type === 'snow') this._createSampleNode(type);
            else if (type === 'leaves') this._createAmbNode('leaves', 'peaking', 1500);
        } else if (theme === 'cyber') {
            this._createCyberNode(type);
        }
        console.log(`[Ambience] Started: ${type}`);
    }

    // Helper: Stop a specific sound type
    _stopSoundNode(type) {
        const now = this.context.currentTime;

        // Handle Japanese nodes
        if (this.ambNodes[type]) {
            try {
                this.ambNodes[type].stop(now);
                this.ambNodes[type].disconnect();
                if (this.ambGainNodes[type]) {
                    this.ambGainNodes[type].gain.cancelScheduledValues(now);
                    this.ambGainNodes[type].gain.setValueAtTime(0, now);
                    this.ambGainNodes[type].disconnect();
                }
            } catch (e) { }
            delete this.ambNodes[type];
            delete this.ambGainNodes[type];
        }

        // Handle Cyber nodes
        // Find in cyberNodes array
        const idx = this.cyberNodes.findIndex(n => n.type === type);
        if (idx !== -1) {
            const item = this.cyberNodes[idx];
            item.nodes.forEach(node => {
                try {
                    if (node.stop) node.stop(now);
                    if (node.disconnect) node.disconnect();
                } catch (e) { }
            });
            this.cyberNodes.splice(idx, 1);
            delete this.ambGainNodes[type];
        }

        console.log(`[Ambience] Stopped: ${type}`);
    }

    _startJapaneseAmbience() {
        // Rain
        if (this.rainBuffer) this._createSampleNode('rain');
        else this._createAmbNode('rain', 'lowpass', 800);

        // Star
        if (this.starBuffer) this._createSampleNode('star');
        else this._createAmbNode('star', 'highpass', 3000);

        // Snow
        if (this.snowBuffer) this._createSampleNode('snow');
        else this._createAmbNode('snow', 'bandpass', 400);

        // Leaves
        this._createAmbNode('leaves', 'peaking', 1500);
    }

    _startCyberAmbience() {
        // 1. Gear (Top-Left)
        this._createCyberNode('gear');

        // 2. Neon (Top-Right)
        this._createCyberNode('neon');

        // 3. Siren (Bottom-Right)
        this._createCyberNode('siren');

        // 4. Tremolo (Bottom-Left) is an effect, setup if needed. 
        // We'll calculate it in update loop.
    }

    _createCyberNode(type) {
        if (!this.context) return;
        const now = this.context.currentTime;

        let nodeData = { type: type, nodes: [] };

        if (type === 'gear') {
            // Lowpass Noise
            const src = this.context.createBufferSource();
            src.buffer = this.createNoiseBuffer();
            src.loop = true;
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 150;
            const gain = this.context.createGain();
            gain.gain.value = 0;

            src.connect(filter).connect(gain).connect(this.masterGain);
            src.start();
            nodeData.nodes = [src, filter, gain];
            this.ambGainNodes['gear'] = gain;
        }
        else if (type === 'neon') {
            // Hum Noise (Square/Saw 50Hz)
            const osc = this.context.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = 55; // 55Hz hum
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            const gain = this.context.createGain();
            gain.gain.value = 0;

            osc.connect(filter).connect(gain).connect(this.masterGain);
            osc.start();
            nodeData.nodes = [osc, filter, gain];
            this.ambGainNodes['neon'] = gain;
        }
        else if (type === 'siren') {
            // Sci-Fi Siren (LFO modulated Saw)
            const osc = this.context.createOscillator();
            osc.type = 'sawtooth';
            const lfo = this.context.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.5; // Slow cycle
            const lfoGain = this.context.createGain();
            lfoGain.gain.value = 300; // Depth +/- 300Hz

            lfo.connect(lfoGain).connect(osc.frequency);
            osc.frequency.value = 900; // Base

            const gain = this.context.createGain();
            gain.gain.value = 0;

            osc.connect(gain).connect(this.masterGain);
            lfo.start();
            osc.start();
            nodeData.nodes = [osc, lfo, lfoGain, gain];
            this.ambGainNodes['siren'] = gain;
        }

        this.cyberNodes.push(nodeData);
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
        gain.gain.value = 0;
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
        if (id === 'snow') buffer = this.snowBuffer;
        if (!buffer) return;

        const src = this.context.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const gain = this.context.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(this.masterGain);
        src.start();
        this.ambNodes[id] = src;
        this.ambGainNodes[id] = gain;
    }

    stopAmbience() {
        this.isAmbienceActive = false;
        const now = this.context.currentTime;

        // 1. Stop Japanese Nodes
        Object.keys(this.ambNodes).forEach(key => {
            try {
                this.ambNodes[key].stop(now);
                this.ambNodes[key].disconnect();
                if (this.ambGainNodes[key]) {
                    this.ambGainNodes[key].gain.cancelScheduledValues(now);
                    this.ambGainNodes[key].gain.setValueAtTime(0, now);
                    this.ambGainNodes[key].disconnect();
                }
            } catch (e) { }
        });
        this.ambNodes = {};

        // 2. Stop Cyber Nodes (Nuclear option)
        if (this.cyberNodes && this.cyberNodes.length > 0) {
            this.cyberNodes.forEach(item => {
                item.nodes.forEach(node => {
                    try {
                        if (node.stop) node.stop(now);
                        if (node.disconnect) node.disconnect();
                    } catch (e) { }
                });
            });
        }
        this.cyberNodes = [];
        this.ambGainNodes = {};

        // 3. Reset Neon Visual FX
        const field = document.querySelector('.interactive-field'); // or specific ID
        if (field) {
            field.style.opacity = '1';
            field.style.filter = 'none';
        }

        // 4. Reset BGM Tremolo Gain
        if (this.audioManager && this.audioManager.bgmGainNode) {
            this.audioManager.bgmGainNode.gain.cancelScheduledValues(now);
            this.audioManager.bgmGainNode.gain.setValueAtTime(this.audioManager.bgmVolume, now);
        }

        // 5. Reset State
        this.ambienceState = {
            rain: false, star: false, snow: false, leaves: false,
            gear: false, neon: false, siren: false, tremolo: false
        };
    }

    createNoiseBuffer() {
        if (!this.context) return null;
        const bufferSize = this.context.sampleRate * 2;
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

        const theme = this.audioManager ? this.audioManager.currentTheme : 'japanese';
        const t = this.context.currentTime;
        const rampTime = 0.1;

        // --- Calculate Weights ---
        const distFromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);
        let masterVol = (distFromCenter - 0.1) * 2.5;
        masterVol = Math.max(0, Math.min(1, masterVol));
        const range = 0.6;
        const sharpness = 3.0;

        const getWeight = (tx, ty) => {
            const d = Math.sqrt((x - tx) ** 2 + (y - ty) ** 2);
            const prox = Math.max(0, 1 - (d / range));
            return Math.pow(prox, sharpness);
        };

        const wTL = getWeight(0, 0); // Top-Left
        const wTR = getWeight(1, 0); // Top-Right
        const wBL = getWeight(0, 1); // Bottom-Left
        const wBR = getWeight(1, 1); // Bottom-Right

        // Define mapping based on theme
        let targetWeights = {};
        if (theme === 'japanese') {
            targetWeights = {
                rain: wTL,
                star: wTR,
                snow: wBL,
                leaves: wBR
            };
        } else {
            targetWeights = {
                gear: wTL,
                neon: wTR,
                tremolo: wBL,
                siren: wBR
            };
        }

        const THRESHOLD = 0.1;

        // --- Process Weights & State ---
        for (const [type, weight] of Object.entries(targetWeights)) {
            // Tremolo is special (visual/bgm effect only, no separate node creation logic needed here usually, 
            // but we track state for logging)
            const isActive = this.ambienceState[type];
            // Active if weight >= 0.1 AND master volume is significant
            const shouldBeActive = weight >= THRESHOLD && masterVol > 0.01;

            if (shouldBeActive && !isActive) {
                // START
                this.ambienceState[type] = true;
                if (type !== 'tremolo') {
                    this._startSoundNode(type, theme);
                } else {
                    console.log(`[Ambience] Started: ${type}`);
                }
            } else if (!shouldBeActive && isActive) {
                // STOP
                this.ambienceState[type] = false;
                if (type !== 'tremolo') {
                    this._stopSoundNode(type);
                } else {
                    console.log(`[Ambience] Stopped: ${type}`);
                }
            }

            // Update Volume / Effects if active
            if (this.ambienceState[type]) {
                const finalGain = weight * masterVol;

                // Japanese
                if (theme === 'japanese') {
                    if (this.ambGainNodes[type]) {
                        this.ambGainNodes[type].gain.setTargetAtTime(finalGain, t, rampTime);
                    }
                }
                // Cyber
                else {
                    if (type === 'gear' && this.ambGainNodes.gear) {
                        this.ambGainNodes.gear.gain.setTargetAtTime(finalGain * 0.4, t, rampTime);
                    } else if (type === 'neon') {
                        if (this.ambGainNodes.neon) this.ambGainNodes.neon.gain.setTargetAtTime(finalGain * 0.3, t, rampTime);
                        // Neon Visuals
                        const field = document.querySelector('.interactive-field');
                        if (field) {
                            if (Math.random() < weight * 0.5) {
                                const brightness = 1.0 + (Math.random() * 0.5 * weight);
                                const opacity = 0.8 + (Math.random() * 0.2);
                                field.style.filter = `brightness(${brightness})`;
                                field.style.opacity = `${opacity}`;
                            } else {
                                field.style.filter = 'brightness(1)';
                                field.style.opacity = '1';
                            }
                        }
                    } else if (type === 'siren' && this.ambGainNodes.siren) {
                        this.ambGainNodes.siren.gain.setTargetAtTime(finalGain * 0.2, t, rampTime);
                    } else if (type === 'tremolo') {
                        // Tremolo BGM Mod
                        if (this.audioManager && this.audioManager.bgmGainNode) {
                            const baseVol = this.audioManager.bgmVolume;
                            const depth = weight * 0.8;
                            const rate = 2.0 + (weight * 8.0);
                            const oscVal = (Math.sin(t * rate * 6.28) + 1) / 2;
                            const currentGain = baseVol * (1 - (depth * 0.8 * oscVal));
                            this.audioManager.bgmGainNode.gain.setValueAtTime(currentGain, t);
                        }
                    }
                }
            } else {
                // If inactive, ensure clean state for effects (e.g. Neon, Tremolo)
                if (theme === 'cyber') {
                    if (type === 'neon') {
                        const field = document.querySelector('.interactive-field');
                        if (field) {
                            field.style.filter = 'none';
                            field.style.opacity = '1';
                        }
                    } else if (type === 'tremolo') {
                        if (this.audioManager && this.audioManager.bgmGainNode) {
                            this.audioManager.bgmGainNode.gain.setTargetAtTime(this.audioManager.bgmVolume, t, rampTime);
                        }
                    }
                }
            }
        }

        return targetWeights;
    }
}
window.SoundGenerator = SoundGenerator;
