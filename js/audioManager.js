/**
 * 音声管理モジュール
 * WAVファイルを読み込んで再生する（ファイルが存在しない場合はOscillatorでフォールバック）
 */

class AudioManager {
    constructor() {
        // AudioContext（Web Audio APIのメインオブジェクト）
        this.audioContext = null;

        // 音声が初期化されているかどうか
        this.isInitialized = false;

        // 現在のテーマ（音の種類を決定）
        this.currentTheme = 'japanese';

        // Master Gain Node
        this.masterGainNode = null;

        // 読み込んだ音声バッファのキャッシュ
        this.audioBuffers = new Map();

        // 音声ファイルのパス設定
        this.soundPaths = {
            common: {
                hover: 'assets/sounds/common/hover.wav',
                click: 'assets/sounds/common/click.wav'
            },
            japanese: {
                pond: 'assets/sounds/japanese/pond.wav',
                shishi: 'assets/sounds/japanese/shishi.wav',
                fusuma: 'assets/sounds/japanese/fusuma.wav',
                bgm: 'assets/sounds/japanese/Japanese01.mp3',
                bgm2: 'assets/sounds/japanese/Japanese02.mp3',
                amb: 'assets/sounds/japanese/Ambience_Snow.mp3',
                torchLoop: 'assets/sounds/japanese/Icon/TorchLoop.wav',
                torchOff: 'assets/sounds/japanese/Icon/TorchOff.mp3',

                // New Icon Sounds
                decision: 'assets/sounds/japanese/Icon/IconDecision.mp3',
                koto: 'assets/sounds/japanese/Icon/IconKoto.mp3',
                kotsuzumi: 'assets/sounds/japanese/Icon/IconKotsuzumi.mp3'
                // Furin loaded dynamically 01-04
            },
            cyber: {
                hologram: 'assets/sounds/cyber/hologram.wav',
                bgm: 'assets/sounds/cyber/Cyber_bgm01.mp3',
                bgm2: 'assets/sounds/cyber/Cyber_bgm02.mp3',
                transitionSE: 'assets/sounds/cyber/Transition_Cyber.mp3',
                amb: 'assets/sounds/cyber/amb.wav'
            }
        };

        // 現在再生中のBGM/AMBソース
        this.bgmSource = null;
        this.ambSource = null;
        this.torchSource = null; // ろうそくループ音源

        // フォールバック用の音の設定（WAVファイルが存在しない場合）
        this.fallbackSoundSettings = {
            japanese: {
                hover: { type: 'sine', frequency: 440, duration: 0.1, volume: 0.2 },
                click: { type: 'sine', frequency: 523, duration: 0.15, volume: 0.3 },
                pond: { type: 'sine', frequency: 200, duration: 0.3, volume: 0.15 },
                shishi: { type: 'sine', frequency: 150, duration: 0.5, volume: 0.4 },
                fusuma: { type: 'sine', frequency: 100, duration: 0.2, volume: 0.25 },
                decision: { type: 'triangle', frequency: 300, duration: 0.2, volume: 0.4 },
                koto: { type: 'sawtooth', frequency: 400, duration: 0.4, volume: 0.3 },
                kotsuzumi: { type: 'square', frequency: 200, duration: 0.1, volume: 0.5 },
                furin: { type: 'sine', frequency: 1200, duration: 0.5, volume: 0.2 }
            },
            cyber: {
                hover: { type: 'square', frequency: 800, duration: 0.05, volume: 0.15 },
                click: { type: 'square', frequency: 600, duration: 0.1, volume: 0.25 },
                hologram: { type: 'sawtooth', frequency: 400, duration: 0.3, volume: 0.3 }
            }
        };

        // BGM関連
        this.bgmGainNode = null;
        this.bgmVolume = 0.5;  // 固定音量
        this.bgmIsPlaying = false;
        this.bgmSource = null;
        this.currentBgmKey = null; // Track current loaded BGM
        this.bgmStartTime = 0;
        this.bgmPauseTime = 0;
        this.bgmOffset = 0; // Resume point
        this.isBgmPaused = false;

        // AMB（アンビエント）関連
        this.ambGainNode = null;
        this.ambVolume = 0.3;
        this.ambIsPlaying = false;
    }

    /**
     * BGMを開始
     * @param {string} bgmKey - 再生するBGMのキー ('bgm' or 'bgm2')
     * @param {boolean} fromResume - 再開かどうか
     */
    async startBGM(bgmKey = 'bgm', fromResume = false) {
        // If requesting a new track while playing/paused, stop and reset first
        if (this.currentBgmKey && this.currentBgmKey !== bgmKey) {
            this.stopBGM(); // This resets offset
        }

        if (this.bgmIsPlaying) return; // Already playing

        try {
            // ゲインノードを作成（音量制御用）
            if (!this.bgmGainNode) {
                this.bgmGainNode = this.audioContext.createGain();
                if (this.masterGainNode) {
                    this.bgmGainNode.connect(this.masterGainNode);
                } else {
                    this.bgmGainNode.connect(this.audioContext.destination);
                }
            }

            this.bgmGainNode.gain.value = this.bgmVolume;

            // BGMファイルのパスを取得
            const themePaths = this.soundPaths[this.currentTheme];
            const bgmPath = themePaths ? themePaths[bgmKey] : null;

            if (!bgmPath) {
                console.warn(`AudioManager: BGMファイルのパスが見つかりません (${bgmKey})`);
                return;
            }

            // 音声ファイルを読み込む
            let audioBuffer = this.audioBuffers.get(bgmPath);
            if (!audioBuffer) {
                audioBuffer = await this.loadAudioFile(bgmPath);
            }

            if (!audioBuffer) {
                console.error('AudioManager: BGMファイルの読み込みに失敗しました:', bgmPath);
                return;
            }

            // BGMを再生
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = true;

            source.connect(this.bgmGainNode);

            // Offset calculation for resume
            const offset = fromResume ? this.bgmOffset : 0;
            const startTime = this.audioContext.currentTime;

            // Adjust loop points if offset > buffer duration (if implementing loop manual, but BufferSource handles loop)
            source.start(0, offset % audioBuffer.duration);

            this.bgmSource = source;
            this.bgmIsPlaying = true;
            this.isBgmPaused = false;
            this.currentBgmKey = bgmKey;
            this.bgmStartTime = startTime;

            console.log(`AudioManager: BGM Playing (${bgmKey}) offset: ${offset}`);

        } catch (error) {
            console.error('AudioManager: BGM開始エラー', error);
        }
    }

    /**
     * BGMを一時停止 (Resume用にOffset保存)
     */
    pauseBGM() {
        if (!this.bgmIsPlaying || !this.bgmSource) return;

        try {
            this.bgmSource.stop();
            this.bgmPauseTime = this.audioContext.currentTime;
            // Calculate new offset
            // Playback duration = now - startTime
            // Total current position = startOffset + playbackDuration
            const elapsed = this.bgmPauseTime - this.bgmStartTime;
            this.bgmOffset = (this.bgmOffset + elapsed);
            // Modulo handled at next start if needed, but buffer.duration needed. 
            // For checking max:
            if (this.bgmSource.buffer) {
                this.bgmOffset = this.bgmOffset % this.bgmSource.buffer.duration;
            }

            this.bgmIsPlaying = false;
            this.isBgmPaused = true;
            this.bgmSource = null;
            console.log(`AudioManager: BGM Paused at ${this.bgmOffset}`);
        } catch (e) { console.error('Pause error', e); }
    }

    /**
     * BGMを完全停止 (リセット)
     */
    stopBGM() {
        this.bgmIsPlaying = false;
        this.isBgmPaused = false;
        this.bgmOffset = 0;
        this.currentBgmKey = null;

        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) { }
            this.bgmSource = null;
        }
        console.log('AudioManager: BGM Stopped (Reset)');
        document.dispatchEvent(new CustomEvent('bgm-stopped'));
    }

    /**
     * 音声ファイルを読み込む
     * @param {string} url - 音声ファイルのパス
     * @returns {Promise<AudioBuffer>} 読み込んだAudioBuffer
     */
    async loadAudioFile(url) {
        // キャッシュをチェック
        if (this.audioBuffers.has(url)) {
            return this.audioBuffers.get(url);
        }

        // ローカルファイル実行時のCORS制限回避（fetchを使用しない）
        if (window.location.protocol === 'file:') {
            console.warn('Local file protocol detected. Skipping fetch for:', url);
            return null;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // キャッシュに保存
            this.audioBuffers.set(url, audioBuffer);
            return audioBuffer;
        } catch (error) {
            console.warn(`AudioManager: 音声ファイルの読み込みに失敗しました (${error.message}): ${url}`);
            return null;
        }
    }

    /**
     * 音声ファイルを再生する
     * @param {string} url - 音声ファイルのパス
     * @param {number} volume - 音量（0.0〜1.0）
     * @param {boolean} loop - ループ再生するかどうか
     * @returns {AudioBufferSourceNode} 作成したソースノード
     */
    playAudioFile(url, volume = 1.0, loop = false) {
        if (!this.isInitialized || !this.audioContext) {
            return null;
        }

        const audioBuffer = this.audioBuffers.get(url);
        if (!audioBuffer) {
            console.warn(`AudioManager: 音声バッファが見つかりません: ${url}`);
            return null;
        }

        try {
            console.log('🔊 AudioManager playing file:', url);
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();

            source.buffer = audioBuffer;
            source.loop = loop;
            gainNode.gain.value = volume;

            source.connect(gainNode);
            // MasterGainに接続
            if (this.masterGainNode) {
                gainNode.connect(this.masterGainNode);
            } else {
                gainNode.connect(this.audioContext.destination);
            }

            source.start(0);
            return source;
        } catch (error) {
            console.error('AudioManager: 音声再生エラー', error);
            return null;
        }
    }

    /**
     * AudioContextを初期化し、音声ファイルをプリロードする
     * @returns {Promise<boolean>} 初期化が成功したかどうか
     */
    async init() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('Web Audio APIがサポートされていません。');
                return false;
            }

            this.audioContext = new AudioContextClass();

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Master Gain Node作成
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = 1.0;

            this.isInitialized = true;
            console.log('AudioManager: 初期化完了');

            this.preloadAudioFiles();

            return true;
        } catch (error) {
            console.error('AudioManager: 初期化エラー', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * 音声ファイルをプリロードする
     */
    async preloadAudioFiles() {
        await this.loadAudioFile(this.soundPaths.common.hover);
        await this.loadAudioFile(this.soundPaths.common.click);

        // テーマ別音声（現在のテーマのみ）
        if (this.currentTheme === 'japanese') {
            await this.loadAudioFile(this.soundPaths.japanese.pond);
            await this.loadAudioFile(this.soundPaths.japanese.shishi);
            await this.loadAudioFile(this.soundPaths.japanese.fusuma);
            await this.loadAudioFile(this.soundPaths.japanese.bgm);
            await this.loadAudioFile(this.soundPaths.japanese.amb);
            await this.loadAudioFile(this.soundPaths.japanese.torchLoop);
            await this.loadAudioFile(this.soundPaths.japanese.torchOff);

            await this.loadAudioFile(this.soundPaths.japanese.decision);
            await this.loadAudioFile(this.soundPaths.japanese.koto);
            await this.loadAudioFile(this.soundPaths.japanese.kotsuzumi);

            for (let i = 1; i <= 6; i++) {
                await this.loadAudioFile(`assets/sounds/japanese/Icon/Icon_Ripples0${i}.mp3`);
            }
            for (let i = 1; i <= 4; i++) {
                await this.loadAudioFile(`assets/sounds/japanese/Icon/IconFurin0${i}.mp3`);
            }
        } else {
            await this.loadAudioFile(this.soundPaths.cyber.hologram);
            await this.loadAudioFile(this.soundPaths.cyber.bgm);
            await this.loadAudioFile(this.soundPaths.cyber.amb);
            await this.loadAudioFile(this.soundPaths.cyber.transitionSE);
        }
    }

    playTorchLoop() {
        if (this.torchSource) return;
        const path = this.soundPaths.japanese.torchLoop;
        this.torchSource = this.playAudioFile(path, 0.4, true);
    }

    stopTorchLoop() {
        if (this.torchSource) {
            try {
                this.torchSource.stop();
            } catch (e) { }
            this.torchSource = null;
        }
    }

    playTorchOff() {
        const path = this.soundPaths.japanese.torchOff;
        this.playAudioFile(path, 0.6, false);
    }

    playSound(soundType) {
        if (!this.isInitialized || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const commonPath = this.soundPaths.common[soundType];
        if (commonPath && this.audioBuffers.has(commonPath)) {
            this.playAudioFile(commonPath, 0.5);
            return;
        }
        this.playFallbackSound(soundType);
    }

    playFallbackSound(soundType) {
        const settings = this.fallbackSoundSettings[this.currentTheme];
        if (!settings || !settings[soundType]) return;

        const soundConfig = settings[soundType];
        try {
            console.log('🎹 AudioManager playing fallback (generated):', soundType);
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = soundConfig.type;
            oscillator.frequency.setValueAtTime(soundConfig.frequency, this.audioContext.currentTime);

            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(soundConfig.volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + soundConfig.duration);

            oscillator.connect(gainNode);
            if (this.masterGainNode) {
                gainNode.connect(this.masterGainNode);
            } else {
                gainNode.connect(this.audioContext.destination);
            }

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + soundConfig.duration);
        } catch (error) {
            console.error('AudioManager: フォールバック音声再生エラー', error);
        }
    }

    /**
         * テーマ切り替え：すべての音を強制停止（Nuclear Stop）して切り替える
         */
    async setTheme(themeName) {
        console.log(`AudioManager: Switching theme from ${this.currentTheme} to ${themeName} (FORCE STOP)`);

        const now = this.audioContext.currentTime;

        // 1. 【重要】マスターボリュームを一瞬で0にして、残響ごとかき消す
        if (this.masterGainNode) {
            this.masterGainNode.gain.cancelScheduledValues(now);
            this.masterGainNode.gain.setValueAtTime(0, now);
        }

        // 2. AudioManager管理の音声を停止
        this.stopBGM();
        this.stopAMB();
        this.stopTorchLoop();

        // 3. 【重要】SoundGenerator（雨・風・生成BGM）も強制停止
        // windowオブジェクト経由でアクセスして止める
        if (window.soundGenerator) {
            window.soundGenerator.stopAmbience(); // 雨・風・星などのXYパッド音
            window.soundGenerator.stopBGM();      // 生成系のBGM
            window.soundGenerator.isPlaying = false;
            window.soundGenerator.isAmbienceActive = false;
        }

        // 4. テーマ変数の更新
        this.currentTheme = themeName;

        // 5. 新しい音のロード
        if (this.isInitialized) {
            await this.preloadAudioFiles();
        }

        // 6. 音量を復帰させる（0.1秒後に戻すことで、停止時のノイズを防ぎつつ即復帰）
        if (this.masterGainNode) {
            this.masterGainNode.gain.setValueAtTime(0, now);
            this.masterGainNode.gain.linearRampToValueAtTime(1.0, now + 0.1);
        }
    }

    playHoverSound() {
        this.playSound('hover');
    }

    playClickSound() {
        this.playSound('click');
    }

    attachSoundToElement(element, soundType) {
        if (!element) return;
        if (soundType === 'hover') {
            element.addEventListener('mouseenter', () => this.playHoverSound());
        } else if (soundType === 'click') {
            element.addEventListener('click', () => this.playClickSound());
        }
    }

    playCustomSound(soundType) {
        if (!this.isInitialized || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const themePaths = this.soundPaths[this.currentTheme];
        if (themePaths && themePaths[soundType]) {
            const path = themePaths[soundType];
            if (this.audioBuffers.has(path)) {
                this.playAudioFile(path, 0.5);
                return;
            }
        }
        this.playFallbackSound(soundType);
    }

    playWaterDrop() {
        if (!this.audioContext) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();

        const index = Math.floor(Math.random() * 6) + 1;
        const path = `assets/sounds/japanese/Icon/Icon_Ripples0${index}.mp3`;

        if (this.audioBuffers.has(path)) {
            this.playAudioFile(path, 0.6);
        } else {
            this.loadAudioFile(path).then(buffer => {
                if (buffer) this.playAudioFile(path, 0.6);
            });
        }
    }

    toggleBGM() {
        if (!this.isInitialized || !this.audioContext) {
            console.warn('AudioManager: 初期化されていません');
            return;
        }
        if (this.bgmIsPlaying) {
            this.stopBGM();
        } else {
            this.startBGM();
        }
    }

    setBGMVolume(volume) {
        this.bgmVolume = Math.max(0, Math.min(1, volume));
        if (this.bgmGainNode) {
            this.bgmGainNode.gain.value = this.bgmVolume;
        }
    }

    toggleAMB() {
        if (!this.isInitialized || !this.audioContext) {
            console.warn('AudioManager: 初期化されていません');
            return;
        }
        if (this.ambIsPlaying) {
            this.stopAMB();
        } else {
            this.startAMB();
        }
    }

    async startAMB() {
        if (this.ambIsPlaying) return;

        try {
            if (!this.ambGainNode) {
                this.ambGainNode = this.audioContext.createGain();
                if (this.masterGainNode) {
                    this.ambGainNode.connect(this.masterGainNode);
                } else {
                    this.ambGainNode.connect(this.audioContext.destination);
                }
            }

            this.ambGainNode.gain.value = this.ambVolume;

            const themePaths = this.soundPaths[this.currentTheme];
            const ambPath = themePaths?.amb;

            if (!ambPath) {
                console.warn('AudioManager: AMBファイルのパスが見つかりません');
                return;
            }

            let audioBuffer = this.audioBuffers.get(ambPath);
            if (!audioBuffer) {
                audioBuffer = await this.loadAudioFile(ambPath);
            }

            if (!audioBuffer) {
                console.warn('AudioManager: AMBファイルの読み込みに失敗しました');
                return;
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = true;

            source.connect(this.ambGainNode);
            source.start(0);

            this.ambSource = source;
            this.ambIsPlaying = true;

        } catch (error) {
            console.error('AudioManager: AMB開始エラー', error);
        }
    }

    stopAMB() {
        this.ambIsPlaying = false;
        if (this.ambSource) {
            try {
                this.ambSource.stop();
            } catch (e) { }
            this.ambSource = null;
        }
    }

    setAMBVolume(volume) {
        this.ambVolume = Math.max(0, Math.min(1, volume));
        if (this.ambGainNode) {
            this.ambGainNode.gain.value = this.ambVolume;
        }
    }

    fadeOutAll(duration = 0.2) {
        if (!this.audioContext || !this.masterGainNode) return;

        const now = this.audioContext.currentTime;

        this.masterGainNode.gain.cancelScheduledValues(now);
        this.masterGainNode.gain.setValueAtTime(this.masterGainNode.gain.value, now);
        this.masterGainNode.gain.linearRampToValueAtTime(0, now + duration);

        setTimeout(() => {
            console.log('NOTICE: All sounds stopped via fadeOutAll');
            this.stopBGM();
            this.stopAMB();
            this.stopTorchLoop();

            if (this.masterGainNode) {
                this.masterGainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
                this.masterGainNode.gain.value = 1.0;
            }
        }, duration * 1000 + 50);
    }
}

window.AudioManager = AudioManager;
