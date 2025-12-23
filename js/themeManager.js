/**
 * テーマ管理モジュール
 * 「和（Japanese）」と「サイバー（Cyber）」の2つのテーマを切り替える機能を提供
 */

class ThemeManager {
    constructor() {
        // 現在のテーマ（デフォルトは'japanese'）
        this.currentTheme = 'japanese';

        // テーマの定義
        this.themes = {
            japanese: {
                name: 'japanese',
                icon: '🎌',
                label: '和'
            },
            cyber: {
                name: 'cyber',
                icon: '💻',
                label: 'サイバー'
            }
        };

        // 初期化
        this.init();
    }

    /**
     * 初期化処理
     * ローカルストレージから保存されたテーマを読み込む
     */
    init() {
        // Force Japanese theme on init logic to fix reload bug
        this.currentTheme = 'japanese';
        this.applyTheme(this.currentTheme);
    }

    /**
     * テーマを適用する
     * @param {string} themeName - 適用するテーマ名（'japanese' または 'cyber'）
     */
    applyTheme(themeName) {
        if (!this.themes[themeName]) {
            console.warn(`テーマ "${themeName}" が見つかりません。デフォルトテーマを適用します。`);
            themeName = 'japanese';
        }

        this.currentTheme = themeName;

        // HTML要素にdata-theme属性を設定（CSS変数が自動的に切り替わる）
        document.documentElement.setAttribute('data-theme', themeName);

        // Remove localStorage persistence as requested (reload resets to Japanese)
        // localStorage.setItem('portfolio-theme', themeName);

        // テーマ切り替えボタンの表示を更新
        this.updateThemeButton();

        // カスタムイベントを発火（他のモジュールがテーマ変更を検知できるように）
        const event = new CustomEvent('themeChanged', {
            detail: { theme: themeName }
        });
        document.dispatchEvent(event);
    }

    /**
     * テーマを切り替える（現在のテーマの反対に切り替え）
     */
    toggleTheme() {
        if (window.TransitionManager) {
            const transition = new window.TransitionManager();
            const targetTheme = this.currentTheme === 'japanese' ? 'cyber' : 'japanese';

            // Prevent multi-click
            const btn = document.getElementById('themeToggle');
            if (btn) btn.style.pointerEvents = 'none';

            // Reset Ambience XY Pad to center (silence) BEFORE transition
            if (window.resetAmbienceXYPad) {
                window.resetAmbienceXYPad();
            }

            transition.startTransition(
                () => {
                    // MidPoint: Switch Theme
                    this.applyTheme(targetTheme);
                },
                () => {
                    // Complete: Cleanup
                    if (btn) btn.style.pointerEvents = 'auto';
                }
            );
        } else {
            // Fallback
            const newTheme = this.currentTheme === 'japanese' ? 'cyber' : 'japanese';
            this.applyTheme(newTheme);
        }
    }

    /**
     * 現在のテーマを取得
     * @returns {string} 現在のテーマ名
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * テーマ切り替えボタンの表示を更新
     */
    updateThemeButton() {
        const themeButton = document.getElementById('themeToggle');
        if (!themeButton) return;

        const theme = this.themes[this.currentTheme];
        const iconElement = themeButton.querySelector('.theme-icon');
        const labelElement = themeButton.querySelector('.theme-label');

        if (iconElement) {
            iconElement.textContent = theme.icon;
        }
        if (labelElement) {
            labelElement.textContent = theme.label;
        }
    }

    /**
     * テーマ切り替えボタンにイベントリスナーを設定
     */
    setupThemeButton() {
        const themeButton = document.getElementById('themeToggle');
        if (!themeButton) {
            console.warn('テーマ切り替えボタンが見つかりません。');
            return;
        }

        // クリックイベントを設定
        themeButton.addEventListener('click', () => {
            this.toggleTheme();
        });
    }
}

// グローバルにエクスポート（他のファイルから使用可能にする）
window.ThemeManager = ThemeManager;

