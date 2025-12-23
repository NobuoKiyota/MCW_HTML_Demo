/**
 * インタラクティブフィールド管理モジュール
 * フィールド内のオブジェクト配置と管理を行う
 */

// Configuration for Video FX (Slash, etc)
const VIDEO_FX_CONFIG = {
    opacity: 0.9,          // 0.0 - 1.0 (1.0 = Max visibility)
    mixBlendMode: 'screen', // 'screen', 'lighten', 'normal', 'add'
    playbackRate: 1.0      // Speed of video
};

// Configuration for Ripple Effect
const RIPPLE_CONFIG = {
    radiusBase: 40,
    radiusVar: 20,    // 40-60
    strengthBase: 0.04,
    strengthVar: 0.02 // 0.04-0.06
};

class InteractiveField {
    constructor(fieldElement, audioManager) {
        this.fieldElement = fieldElement;
        this.audioManager = audioManager;
        this.currentTheme = 'japanese';
        this.themeHandlers = {
            japanese: null,
            cyber: null
        };

        // Cooldown Flags
        this.isCandleCoolingDown = false;

        // Initialize VFX with error handling
        try {
            if (typeof VisualFX !== 'undefined') {
                this.vfx = new VisualFX();
            } else {
                console.error('VisualFX class is not defined. script loading order issue?');
                this.vfx = null;
            }
        } catch (e) {
            console.error('Failed to initialize VisualFX:', e);
            this.vfx = null;
        }
    }

    /**
     * 初期化
     */
    init() {
        if (!this.fieldElement) {
            console.error('InteractiveField: フィールド要素が見つかりません');
            return;
        }

        try {
            // 初期テーマを設定
            this.setTheme(this.currentTheme);
        } catch (e) {
            console.error('InteractiveField Init Error:', e);
            alert('フィールド初期化エラー: ' + e.message);
        }
    }

    /**
     * テーマを設定
     * @param {string} themeName - テーマ名
     */
    setTheme(themeName) {
        this.currentTheme = themeName;

        // フィールドをクリア
        this.clear();

        // テーマに応じた要素を配置
        if (themeName === 'japanese') {
            this.setupJapaneseTheme();
        } else if (themeName === 'cyber') {
            // Reset VFX for Cyber (Japanese effects off)
            if (this.vfx) this.vfx.setAmbience(0, 0, 0, 0);
            this.setupCyberTheme();
        }
    }

    /**
     * フィールドをクリア
     */
    clear() {
        if (this.fieldElement) {
            // Destroy Ripples if active (prevent WebGL leak)
            if (typeof $ !== 'undefined') {
                try {
                    const $room = $(this.fieldElement).find('.japanese-room');
                    if ($room.length) $room.ripples('destroy');
                } catch (e) { console.warn('Ripples destroy error', e); }
            }
            this.fieldElement.innerHTML = '';
        }
    }

    /**
     * 和テーマのセットアップ（高品質個別画像方式）
     */
    setupJapaneseTheme() {
        if (!this.fieldElement) return;

        // Background
        const roomContainer = document.createElement('div');
        roomContainer.className = 'japanese-room';
        roomContainer.style.backgroundColor = '#f0f0f0';
        roomContainer.style.backgroundImage = "url('assets/images/japanese/room-background.jpg')";
        roomContainer.style.backgroundSize = "cover";
        roomContainer.style.backgroundPosition = "center";

        // Grid Container
        const iconGrid = document.createElement('div');
        iconGrid.className = 'icon-grid-new'; // New class for 3-row layout
        roomContainer.appendChild(iconGrid);

        // Define Rows with Individual Images
        // Row 1: System
        const row1Icons = [
            { id: 'decision', name: '決定', type: 'system', image: 'icon_push.png', imageB: 'icon_decide.png', behavior: 'toggle_image' },
            { id: 'furin', name: '風鈴', type: 'system', image: 'icon_furin.png', behavior: 'shake' },
            { id: 'candle', name: '蝋燭', type: 'system', image: 'icon_candle.png', behavior: 'flicker_off' },
            { id: 'koto', name: '琴', type: 'system', image: 'icon_koto.png', behavior: 'light_up' },
            { id: 'kotsuzumi', name: '鼓', type: 'system', image: 'icon_tsuzumi.png', behavior: 'light_up' }
        ];

        // Row 2: Elements
        const row2Icons = [
            { id: 'fire', name: '炎', type: 'effect', image: 'icon_fire.png', effect: 'fire' },
            { id: 'thunder', name: '雷', type: 'effect', image: 'icon_thunder.png', effect: 'thunder' },
            { id: 'slash', name: '斬撃', type: 'effect', image: 'icon_slash.png', effect: 'slash' },
            { id: 'ice', name: '氷結', type: 'effect', image: 'icon_ice.png', effect: 'ice' },
            { id: 'shuriken', name: '手裏剣', type: 'effect', image: 'icon_shuriken.png', effect: 'shuriken' }
        ];

        // Row 3: Transitions
        const row3Icons = [
            { id: 'sakura', name: '桜吹雪', type: 'transition', image: 'icon_sakura.png', effect: 'sakura' },
            { id: 'blizzard', name: '吹雪', type: 'transition', image: 'icon_blizzard.png', effect: 'blizzard' },
            { id: 'leaves', name: '落葉', type: 'transition', image: 'icon_leaves.png', effect: 'leaves' },
            { id: 'tornado', name: '竜巻', type: 'transition', image: 'icon_tornado.png', effect: 'tornado' },
            { id: 'ripple', name: '波紋', type: 'transition', image: 'icon_ripple.png', effect: 'ripple' }
        ];

        const allRows = [row1Icons, row2Icons, row3Icons];

        allRows.forEach((row, rowIndex) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'icon-row';
            row.forEach((config) => {
                rowDiv.appendChild(this.createInteractiveIcon(config));
            });
            iconGrid.appendChild(rowDiv);
        });

        this.fieldElement.appendChild(roomContainer);

        // Initialize jQuery Ripples
        if (typeof $ !== 'undefined') {
            try {
                $(roomContainer).ripples({
                    resolution: 512,
                    dropRadius: 20,
                    perturbance: 0.04,
                    interactive: false // Disable mouseover ripples
                });
            } catch (e) { console.warn('jQuery Ripples init failed:', e); }
        }

        this.setupJapaneseInteractions(roomContainer);
    }

    createInteractiveIcon(config) {
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'interactive-icon-new';
        iconWrapper.setAttribute('data-id', config.id);
        iconWrapper.setAttribute('data-type', config.type);

        const inner = document.createElement('div');
        inner.className = 'icon-inner';

        // Base path for images
        const basePath = 'assets/images/japanese/';
        const imageUrl = basePath + config.image;

        // Use standard background image styling
        inner.style.backgroundImage = `url(${imageUrl})`;
        inner.style.backgroundSize = 'contain';
        inner.style.backgroundPosition = 'center';
        inner.style.backgroundRepeat = 'no-repeat';

        if (config.behavior) {
            iconWrapper.setAttribute('data-behavior', config.behavior);
            if (config.behavior === 'toggle_image') {
                iconWrapper.setAttribute('data-image-a', config.image);
                iconWrapper.setAttribute('data-image-b', config.imageB);
            } else if (config.behavior === 'light_up') {
                inner.style.filter = 'grayscale(100%) opacity(0.7)';
            }
        }

        if (config.effect) {
            iconWrapper.setAttribute('data-effect', config.effect);
        }

        iconWrapper.appendChild(inner);
        return iconWrapper;
    }

    /**
     * 和テーマのインタラクション設定（アイコン方式）
     */
    setupJapaneseInteractions(container) {
        // Event Delegation
        container.addEventListener('click', (e) => {
            const icon = e.target.closest('.interactive-icon-new');
            if (!icon) return;

            try {
                // Get Metadata
                const behavior = icon.getAttribute('data-behavior');
                const effectType = icon.getAttribute('data-effect');
                const inner = icon.querySelector('.icon-inner');
                const basePath = 'assets/images/japanese/';

                // Audio
                if (this.audioManager) {
                    const id = icon.getAttribute('data-id');

                    // Don't play generic click for special audio icons
                    const specialAudioIds = ['ripple', 'candle', 'decision', 'furin', 'koto', 'kotsuzumi'];
                    if (!specialAudioIds.includes(id) && effectType !== 'ripple' && behavior !== 'flicker_off') {
                        this.audioManager.playClickSound();
                    }

                    // Special Audio Triggers
                    if (id === 'decision') {
                        this.audioManager.playAudioFile(this.audioManager.soundPaths.japanese.decision, 0.6);
                    } else if (id === 'koto') {
                        this.audioManager.playAudioFile(this.audioManager.soundPaths.japanese.koto, 0.6);
                    } else if (id === 'kotsuzumi') {
                        this.audioManager.playAudioFile(this.audioManager.soundPaths.japanese.kotsuzumi, 0.6);
                    } else if (id === 'furin') {
                        // Random 1-4
                        const idx = Math.floor(Math.random() * 4) + 1;
                        const path = `assets/sounds/japanese/Icon/IconFurin0${idx}.mp3`;
                        this.audioManager.playAudioFile(path, 0.5);
                    }
                }

                // Row 1 System Behaviors
                if (behavior) {
                    if (behavior === 'toggle_image') {
                        // Swap to image B
                        const imgB = icon.getAttribute('data-image-b');
                        inner.style.backgroundImage = `url(${basePath + imgB})`;

                        // Revert after sound ends (simulated with timeout)
                        setTimeout(() => {
                            const imgA = icon.getAttribute('data-image-a');
                            inner.style.backgroundImage = `url(${basePath + imgA})`;
                        }, 1000);

                    } else if (behavior === 'shake') {
                        icon.classList.add('shake-anim');
                        setTimeout(() => icon.classList.remove('shake-anim'), 1000);

                    } else if (behavior === 'flicker_off') {
                        // CANDLE CLICK: Stop Glow -> Darken -> Stop Loop -> Play TorchOff -> Restore

                        // 1. Visuals
                        icon.classList.remove('candle-glow');
                        icon.classList.add('icon-dark');

                        // 2. Audio
                        if (this.audioManager) {
                            this.audioManager.stopTorchLoop();
                            this.audioManager.playTorchOff();
                        }

                        // 3. Restore after delay (e.g. 5 seconds or match audio length)
                        setTimeout(() => {
                            icon.classList.remove('icon-dark');
                        }, 5000);

                    } else if (behavior === 'light_up') {
                        // Gray -> Color
                        inner.style.filter = 'none';
                        setTimeout(() => {
                            inner.style.filter = 'grayscale(100%) opacity(0.7)';
                        }, 1500);
                    }
                }

                // Row 2 & 3 Visual Effects
                if (effectType && this.vfx) {
                    const rect = icon.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    // SPECIAL VIDEO HANDLING FOR SLASH
                    if (effectType === 'slash') {
                        const video = document.createElement('video');
                        video.src = 'assets/images/japanese/japanese_slash.mp4';
                        video.classList.add('expanded-video-fx');

                        // Configurable styles
                        video.style.opacity = VIDEO_FX_CONFIG.opacity;
                        video.style.mixBlendMode = VIDEO_FX_CONFIG.mixBlendMode;
                        video.playbackRate = VIDEO_FX_CONFIG.playbackRate;

                        video.muted = true;
                        video.autoplay = true;
                        video.playsInline = true;

                        video.onerror = () => {
                            console.warn('Slash video file not found/failed to load.');
                            video.remove();
                        };
                        video.onended = () => { video.remove(); };

                        // Append to field container
                        const fieldSection = document.querySelector('.field-section') || document.body;
                        fieldSection.appendChild(video);
                    }

                    // Trigger Canvas Particle Effect as well (unless it's ripple, we handle that specifically or additive)
                    // If effect is 'ripple', we use jQuery Ripples AND Sound
                    if (effectType === 'ripple') {
                        if (typeof $ !== 'undefined') {
                            const rect = container.getBoundingClientRect();
                            const relX = centerX - rect.left;
                            const relY = centerY - rect.top;

                            // Use Config for Speed/Size control
                            const rConf = RIPPLE_CONFIG;
                            const radius = rConf.radiusBase + Math.random() * rConf.radiusVar;
                            const strength = rConf.strengthBase + Math.random() * rConf.strengthVar;

                            $(container).ripples('drop', relX, relY, radius, strength);
                        }

                        // Play Water Drop Sound
                        if (this.audioManager) {
                            this.audioManager.playWaterDrop();
                        }
                    } else {
                        // Regular Canvas Trigger for others
                        this.vfx.trigger(effectType, centerX, centerY);
                    }
                }

                // Add active class for generic pop effect
                icon.classList.add('active');
                setTimeout(() => {
                    icon.classList.remove('active');
                }, 300);

            } catch (err) {
                console.error('Interaction Error:', err);
            }
        });

        // Hover Sound
        container.addEventListener('mouseover', (e) => {
            const icon = e.target.closest('.interactive-icon-new');
            if (icon && this.audioManager) {
                // Debounce/limit hover sounds
                // this.audioManager.playHoverSound(); 

                // SPECIAL CANDLE HOVER
                const id = icon.getAttribute('data-id');
                if (id === 'candle') {
                    // Double check: if cooling down or icon is dark, DO NOT play
                    if (this.isCandleCoolingDown || icon.classList.contains('icon-dark')) return;

                    // Visual: Glow
                    icon.classList.add('candle-glow');
                    // Audio: Loop
                    this.audioManager.playTorchLoop();
                }
            }
        });

        // Mouse Leave
        container.addEventListener('mouseout', (e) => {
            const icon = e.target.closest('.interactive-icon-new');
            if (icon && this.audioManager) {
                const id = icon.getAttribute('data-id');
                if (id === 'candle') {
                    // Visual: Stop Glow
                    icon.classList.remove('candle-glow');
                    // Audio: Stop Loop
                    this.audioManager.stopTorchLoop();
                }
            }
        });
    }

    /**
     * サイバーテーマのセットアップ
     */
    setupCyberTheme() {
        if (!this.fieldElement) return;

        // 背景コンテナを作成
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'cyber-field';

        this.fieldElement.appendChild(fieldContainer);
    }
}
window.InteractiveField = InteractiveField;
