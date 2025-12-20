/**
 * メインアプリケーションファイル
 * 各モジュールを統合し、初期化とイベントハンドリングを行う
 */

// グローバル変数
let themeManager;
let audioManager;
let interactiveField;
let soundGenerator;
let uiManager;

/**
 * DOMContentLoadedイベント：DOMが読み込まれた後に実行
 */
document.addEventListener('DOMContentLoaded', () => {
    init();
});

/**
 * アプリケーションの初期化
 */
function init() {
    console.log('App: init() started');
    try {
        themeManager = new ThemeManager();
        console.log('App: ThemeManager initialized');

        audioManager = new AudioManager();
        console.log('App: AudioManager initialized');

        soundGenerator = new SoundGenerator(audioManager);
        console.log('App: SoundGenerator initialized');

        const fieldElement = document.getElementById('interactiveField');
        if (fieldElement) {
            try {
                interactiveField = new InteractiveField(fieldElement, audioManager);
                interactiveField.init();
                console.log('App: InteractiveField initialized');
            } catch (err) {
                console.error('App: InteractiveField initialization failed:', err);
            }
        }

        themeManager.setupThemeButton();

        uiManager = new UIManager();
        console.log('App: UIManager initialized');

        setupStartOverlay();
        console.log('App: StartOverlay setup complete');

        setupThemeChangeListener();
        setupDashboardControls();
        console.log('App: init() completed');

    } catch (criticalErr) {
        console.error('App: CRITICAL INIT ERROR:', criticalErr);
        alert('アプリ初期化中に重大なエラーが発生しました: ' + criticalErr.message);
    }
}

/**
 * スタートオーバーレイの設定
 */
function setupStartOverlay() {
    const startOverlay = document.getElementById('startOverlay');
    const startButton = document.getElementById('startButton');
    const mainContainer = document.getElementById('mainContainer');

    if (!startOverlay || !startButton || !mainContainer) {
        console.error('必要な要素が見つかりません。');
        return;
    }

    console.log('App: Start button listener attached');

    startButton.addEventListener('click', async () => {
        console.log('App: Start button clicked');

        try {
            // 音声を初期化
            const audioInitialized = await audioManager.init();
            console.log('App: AudioManager.init result:', audioInitialized);

            if (audioInitialized) {
                soundGenerator.init();
                console.log('App: SoundGenerator initialized via button');
            }
        } catch (e) {
            console.error('App: Audio initialization error (continuing anyway):', e);
        }

        // UI遷移（必ず実行）
        console.log('App: Transitioning to main screen');
        startOverlay.classList.add('hidden');
        setTimeout(() => {
            mainContainer.classList.remove('hidden');
        }, 300);
    });

    // Enterキー対応
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !startOverlay.classList.contains('hidden')) {
            startButton.click();
        }
    });
}

/**
 * テーマ変更イベントのリスナーを設定
 */
function setupThemeChangeListener() {
    document.addEventListener('themeChanged', async (event) => {
        const newTheme = event.detail.theme;

        // オーディオマネージャーにテーマ変更を通知（非同期）
        if (audioManager) {
            await audioManager.setTheme(newTheme);
        }

        // インタラクティブフィールドにテーマ変更を通知
        if (interactiveField) {
            interactiveField.setTheme(newTheme);
        }

        console.log(`テーマが "${newTheme}" に変更されました。`);
    });
}


/**
 * ダッシュボードコントロールの設定 (New)
 */
function setupDashboardControls() {
    setupBGMControls();
    setupAmbienceXYPad();
}

/**
 * BGM Controls Logic
 */
function setupBGMControls() {
    const playBtn = document.getElementById('bgmPlayStop');
    const trackName = document.getElementById('currentTrackName');
    const bgmVolume = document.getElementById('bgmVolume');

    // Play/Stop Toggle
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (soundGenerator.isPlaying) {
                soundGenerator.stopMusic();
                playBtn.classList.remove('playing');
                playBtn.textContent = '▶';
            } else {
                // Determine Genre (check active button or default)
                const activeGenreBtn = document.querySelector('.genre-btn.active');
                const genre = activeGenreBtn ? activeGenreBtn.dataset.genre : 'bgm1';

                soundGenerator.playMusic(genre);
                playBtn.classList.add('playing');
                playBtn.textContent = '⏸';

                if (trackName) {
                    trackName.textContent = genre === 'bgm1' ? 'BGM 01' :
                        genre === 'bgm2' ? 'BGM 02' : genre;
                }
            }
        });
    }

    // Genre Selectors
    document.querySelectorAll('.genre-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const genre = e.target.dataset.genre;
            if (trackName) {
                trackName.textContent = genre === 'bgm1' ? 'BGM 01' :
                    genre === 'bgm2' ? 'BGM 02' : genre;
            }

            // Always play immediately when clicked
            soundGenerator.playMusic(genre);

            // Update Play Button UI
            if (playBtn) {
                playBtn.classList.add('playing');
                playBtn.textContent = '⏸';
            }
        });
    });

    // Volume
    if (bgmVolume) {
        bgmVolume.addEventListener('input', (e) => {
            soundGenerator.setMusicVolume(parseFloat(e.target.value));
        });
    }
}

/**
 * Ambience XY Pad Logic
 */
function setupAmbienceXYPad() {
    const xyPad = document.getElementById('ambXYPad');
    const cursor = xyPad ? xyPad.querySelector('.xy-cursor') : null;
    let isDragging = false;

    if (xyPad) {
        const updateMix = (e) => {
            if (!isDragging) return;

            const rect = xyPad.getBoundingClientRect();
            // Client coords
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);

            // Normalize to 0-1
            let x = (clientX - rect.left) / rect.width;
            let y = (clientY - rect.top) / rect.height;

            // Clamp
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));

            // Visual Update
            if (cursor) {
                cursor.style.left = `${x * 100}%`;
                cursor.style.top = `${y * 100}%`;
            }

            // Audio Update & Get Mix Levels
            const levels = soundGenerator.updateAmbienceMix(x, y);

            // Visual FX Update (Particles)
            if (interactiveField && interactiveField.vfx && levels) {
                interactiveField.vfx.setAmbience(levels.rain, levels.star, levels.snow, levels.leaves);
            }
        };

        const startDrag = (e) => {
            // Prevent default if touch to stop scrolling (though body is overflow hidden)
            if (e.type === 'touchstart') e.preventDefault();
            isDragging = true;
            soundGenerator.startAmbience(); // Ensure audio context is ready
            updateMix(e);
        };

        const stopDrag = () => {
            isDragging = false;
            // Optionally stop ambience or fade out? User said "Center is silent", so dragging release might just leave it there or stop?
            // "Multi-Puck" logic usually leaves it. But let's keep it running for ambience.
        };

        // Mouse Events
        xyPad.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', updateMix);
        window.addEventListener('mouseup', stopDrag);

        // Touch Events
        xyPad.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (isDragging) e.preventDefault();
            updateMix(e);
        }, { passive: false });
        window.addEventListener('touchend', stopDrag);
    }
}


/**
 * ページが表示されたときの処理（オプション）
 * パフォーマンス監視などに使用可能
 */
window.addEventListener('load', () => {
    console.log('ポートフォリオサイトが読み込まれました。');
});

/**
 * ページが表示されたときの処理（オプション）
 * パフォーマンス監視などに使用可能
 */
window.addEventListener('load', () => {
    console.log('ポートフォリオサイトが読み込まれました。');
});

