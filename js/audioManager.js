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
                bgm: 'assets/sounds/japanese/Japanese01.mp3',  // Fixed path
                amb: 'assets/sounds/japanese/amb.wav'
            },
            cyber: {
                hologram: 'assets/sounds/cyber/hologram.wav',
                bgm: 'assets/sounds/cyber/bgm-01.wav',  // 1曲のみ
                amb: 'assets/sounds/cyber/amb.wav'
            }
        };

        // 現在再生中のBGM/AMBソース
        this.bgmSource = null;
        this.ambSource = null;

        // フォールバック用の音の設定（WAVファイルが存在しない場合）
        this.fallbackSoundSettings = {
            japanese: {
                hover: { type: 'sine', frequency: 440, duration: 0.1, volume: 0.2 },
                click: { type: 'sine', frequency: 523, duration: 0.15, volume: 0.3 },
                pond: { type: 'sine', frequency: 200, duration: 0.3, volume: 0.15 },
                shishi: { type: 'sine', frequency: 150, duration: 0.5, volume: 0.4 },
                fusuma: { type: 'sine', frequency: 100, duration: 0.2, volume: 0.25 }
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

        // AMB（アンビエント）関連
        this.ambGainNode = null;
        this.ambVolume = 0.3;
        this.ambIsPlaying = false;
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
            // エラーを投げずにnullを返すことで、後続の処理（発振音フォールバックなど）へ進ませる
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
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();

            source.buffer = audioBuffer;
            source.loop = loop;
            gainNode.gain.value = volume;

            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);
            return source;
        } catch (error) {
            console.error('AudioManager: 音声再生エラー', error);
            return null;
        }
    }

    /**
     * AudioContextを初期化し、音声ファイルをプリロードする
     * ブラウザの自動再生制限を回避するため、ユーザー操作後に呼び出す必要がある
     * @returns {Promise<boolean>} 初期化が成功したかどうか
     */
    async init() {
        try {
            // AudioContextを作成（ブラウザ互換性のため、プレフィックス付きのバージョンも試す）
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('Web Audio APIがサポートされていません。');
                return false;
            }

            this.audioContext = new AudioContextClass();

            // AudioContextがsuspended状態の場合、resumeする
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.isInitialized = true;
            console.log('AudioManager: 初期化完了');

            // 音声ファイルをプリロード（バックグラウンドで読み込み）
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
        // 共通音声
        await this.loadAudioFile(this.soundPaths.common.hover);
        await this.loadAudioFile(this.soundPaths.common.click);

        // テーマ別音声（現在のテーマのみ）
        if (this.currentTheme === 'japanese') {
            await this.loadAudioFile(this.soundPaths.japanese.pond);
            await this.loadAudioFile(this.soundPaths.japanese.shishi);
            await this.loadAudioFile(this.soundPaths.japanese.fusuma);
            await this.loadAudioFile(this.soundPaths.japanese.bgm);
            await this.loadAudioFile(this.soundPaths.japanese.amb);
        } else {
            await this.loadAudioFile(this.soundPaths.cyber.hologram);
            await this.loadAudioFile(this.soundPaths.cyber.bgm);
            await this.loadAudioFile(this.soundPaths.cyber.amb);
        }
    }

    /**
     * 音を再生する（WAVファイル優先、フォールバックでOscillator）
     * @param {string} soundType - 音の種類（'hover' または 'click'）
     */
    playSound(soundType) {
        if (!this.isInitialized || !this.audioContext) {
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // 共通音声を試す
        const commonPath = this.soundPaths.common[soundType];
        if (commonPath && this.audioBuffers.has(commonPath)) {
            this.playAudioFile(commonPath, 0.5);
            return;
        }

        // フォールバック: Oscillatorで生成
        this.playFallbackSound(soundType);
    }

    /**
     * フォールバック音を再生（Oscillatorで生成）
     * @param {string} soundType - 音の種類
     */
    playFallbackSound(soundType) {
        const settings = this.fallbackSoundSettings[this.currentTheme];
        if (!settings || !settings[soundType]) {
            return;
        }

        const soundConfig = settings[soundType];

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = soundConfig.type;
            oscillator.frequency.setValueAtTime(soundConfig.frequency, this.audioContext.currentTime);

            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(soundConfig.volume, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + soundConfig.duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + soundConfig.duration);
        } catch (error) {
            console.error('AudioManager: フォールバック音声再生エラー', error);
        }
    }

    /**
     * テーマを設定する（音の種類を変更）
     * @param {string} themeName - テーマ名（'japanese' または 'cyber'）
     */
    async setTheme(themeName) {
        this.currentTheme = themeName;

        // テーマ別音声をプリロード
        if (this.isInitialized) {
            if (themeName === 'japanese') {
                await this.loadAudioFile(this.soundPaths.japanese.pond);
                await this.loadAudioFile(this.soundPaths.japanese.shishi);
                await this.loadAudioFile(this.soundPaths.japanese.fusuma);
                await this.loadAudioFile(this.soundPaths.japanese.bgm);
                await this.loadAudioFile(this.soundPaths.japanese.amb);
            } else {
                await this.loadAudioFile(this.soundPaths.cyber.hologram);
                await this.loadAudioFile(this.soundPaths.cyber.bgm);
                await this.loadAudioFile(this.soundPaths.cyber.amb);
            }
        }
    }

    /**
     * ホバー時の音を再生
     */
    playHoverSound() {
        this.playSound('hover');
    }

    /**
     * クリック時の音を再生
     */
    playClickSound() {
        this.playSound('click');
    }

    /**
     * 要素に音声イベントを設定する
     * @param {HTMLElement} element - 音声を設定する要素
     * @param {string} soundType - 音の種類（'hover' または 'click'）
     */
    attachSoundToElement(element, soundType) {
        if (!element) return;

        if (soundType === 'hover') {
            element.addEventListener('mouseenter', () => {
                this.playHoverSound();
            });
        } else if (soundType === 'click') {
            element.addEventListener('click', () => {
                this.playClickSound();
            });
        }
    }

    /**
     * 特定の音を再生（和テーマ用：池、鹿威し、ふすまなど）
     * @param {string} soundType - 音の種類
     */
    playCustomSound(soundType) {
        if (!this.isInitialized || !this.audioContext) {
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // テーマ別音声を試す
        const themePaths = this.soundPaths[this.currentTheme];
        if (themePaths && themePaths[soundType]) {
            const path = themePaths[soundType];
            if (this.audioBuffers.has(path)) {
                this.playAudioFile(path, 0.5);
                return;
            }
        }

        // フォールバック: Oscillatorで生成
        this.playFallbackSound(soundType);
    }

    /**
     * BGMを開始/停止
     */
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

    /**
     * BGMを開始（シンプル版：1曲のみ）
     */
    async startBGM() {
        if (this.bgmIsPlaying) return;

        try {
            // ゲインノードを作成（音量制御用）
            if (!this.bgmGainNode) {
                this.bgmGainNode = this.audioContext.createGain();
                this.bgmGainNode.connect(this.audioContext.destination);
            }

            this.bgmGainNode.gain.value = this.bgmVolume;

            // BGMファイルのパスを取得
            const themePaths = this.soundPaths[this.currentTheme];
            const bgmPath = themePaths?.bgm;

            if (!bgmPath) {
                console.warn('AudioManager: BGMファイルのパスが見つかりません');
                return;
            }

            // 音声ファイルを読み込む（まだ読み込まれていない場合）
            let audioBuffer = this.audioBuffers.get(bgmPath);
            if (!audioBuffer) {
                console.log('AudioManager: BGMファイルを読み込み中:', bgmPath);
                audioBuffer = await this.loadAudioFile(bgmPath);
            }

            if (!audioBuffer) {
                console.error('AudioManager: BGMファイルの読み込みに失敗しました:', bgmPath);
                return;
            }

            console.log('AudioManager: BGMを再生開始');

            // BGMを再生
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.loop = true;

            source.connect(this.bgmGainNode);
            source.start(0);

            this.bgmSource = source;
            this.bgmIsPlaying = true;

        } catch (error) {
            console.error('AudioManager: BGM開始エラー', error);
        }
    }

    /**
     * BGMを停止
     */
    stopBGM() {
        this.bgmIsPlaying = false;

        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) {
                // 既に停止している場合は無視
            }
            this.bgmSource = null;
        }

        console.log('AudioManager: BGMを停止');
    }


    /**
     * BGMの音量を設定
     * @param {number} volume - 音量（0.0〜1.0）
     */
    setBGMVolume(volume) {
        this.bgmVolume = Math.max(0, Math.min(1, volume));
        if (this.bgmGainNode) {
            this.bgmGainNode.gain.value = this.bgmVolume;
        }
    }

    /**
     * AMB（アンビエント）を開始/停止
     */
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

    /**
     * AMBを開始（環境音：和なら水の音、サイバーなら電子音）
     */
    async startAMB() {
        if (this.ambIsPlaying) return;

        try {
            if (!this.ambGainNode) {
                this.ambGainNode = this.audioContext.createGain();
                this.ambGainNode.connect(this.audioContext.destination);
            }

            this.ambGainNode.gain.value = this.ambVolume;

            // AMBファイルのパスを取得
            const themePaths = this.soundPaths[this.currentTheme];
            const ambPath = themePaths?.amb;

            if (!ambPath) {
                console.warn('AudioManager: AMBファイルのパスが見つかりません');
                return;
            }

            // 音声ファイルを読み込む（まだ読み込まれていない場合）
            let audioBuffer = this.audioBuffers.get(ambPath);
            if (!audioBuffer) {
                audioBuffer = await this.loadAudioFile(ambPath);
            }

            if (!audioBuffer) {
                console.warn('AudioManager: AMBファイルの読み込みに失敗しました');
                return;
            }

            // AMBを再生（ループ）
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

    /**
     * AMBを停止
     */
    stopAMB() {
        this.ambIsPlaying = false;

        if (this.ambSource) {
            try {
                this.ambSource.stop();
            } catch (e) {
                // 既に停止している場合は無視
            }
            this.ambSource = null;
        }
    }

    /**
     * AMBの音量を設定
     * @param {number} volume - 音量（0.0〜1.0）
     */
    setAMBVolume(volume) {
        this.ambVolume = Math.max(0, Math.min(1, volume));
        if (this.ambGainNode) {
            this.ambGainNode.gain.value = this.ambVolume;
        }
    }
}

// グローバルにエクスポート
window.AudioManager = AudioManager;

