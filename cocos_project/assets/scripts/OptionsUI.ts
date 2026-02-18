import { _decorator, Component, Node, Slider, Label, Button, director, input, Input, KeyCode, log, UIOpacity, UITransform, v3, view, Layout, Sprite, tween, Vec4 } from 'cc';
import { SoundManager } from './SoundManager';
import { SettingsManager } from './SettingsManager';
import { GameManager } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('OptionsUI')
export class OptionsUI extends Component {
    private static _instance: OptionsUI = null;
    public static get instance(): OptionsUI { return this._instance; }

    @property(Node)
    public panel: Node = null;

    @property(Sprite)
    public targetSprite: Sprite = null; // ぼかしたい背景スプライト

    // Volume Sliders
    @property(Slider)
    public bgmSlider: Slider = null;
    @property(Slider)
    public seSlider: Slider = null;
    @property(Slider)
    public voiceSlider: Slider = null;

    // Language Buttons
    @property(Node)
    public langJPBtn: Node = null;
    @property(Node)
    public langENBtn: Node = null;

    @property({ tooltip: "メニューが開く時の時間 (秒)" })
    public openDuration: number = 0.3;

    @property({ tooltip: "メニューが閉じる時の時間 (秒)" })
    public closeDuration: number = 0.2;

    onLoad() {
        if (OptionsUI._instance && OptionsUI._instance !== this) {
            log("[OptionsUI] Duplicate instance found, destroying.");
            this.node.active = false;
            this.node.destroy();
            return;
        }
        OptionsUI._instance = this;

        log(`[OptionsUI] onLoad: parent=${this.node.parent ? this.node.parent.name : "null"}`);

        // --- 軌道周回・回転バグ対策 ---
        // もし誤って回転系スクリプトが付いていたら削除する
        const buffEffect = this.getComponent("BuffVisualEffect");
        if (buffEffect) {
            log("[OptionsUI] BuffVisualEffect found on OptionsUI! Removing it.");
            buffEffect.destroy();
        }

        if (this.panel) this.panel.active = false;

        // Listen for ESC/Global Toggle
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);

        this.initUI();
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: any) {
        if (event.keyCode === KeyCode.ESCAPE) {
            this.toggle();
        }
    }

    private initUI() {
        const settings = SettingsManager.instance.settings;
        if (this.bgmSlider) this.bgmSlider.progress = settings.bgmVolume;
        if (this.seSlider) this.seSlider.progress = settings.seVolume;
        if (this.voiceSlider) this.voiceSlider.progress = settings.voiceVolume;
        this.updateLangVisuals(settings.language);
    }

    public toggle() {
        if (!this.panel) return;

        if (!this.panel.active) {
            // --- OPEN ---
            this.panel.active = true;
            this.refreshPosition();
            log(`[OptionsUI] Open: parent=${this.node.parent ? this.node.parent.name : "null"}, pos=${this.node.position}, worldPos=${this.node.worldPosition}`);
            this.initUI();

            // ガラス効果とフェードイン
            this.animateMenu(true, this.openDuration);

            if (GameManager.instance) {
                GameManager.instance.isPaused = true;
            }
        } else {
            // --- CLOSE ---
            log("[OptionsUI] Menu Closed. Resuming Game.");

            // 閉じる時はぼかしを戻しつつ消える
            this.animateMenu(false, this.closeDuration, () => {
                this.panel.active = false;
                if (GameManager.instance) {
                    GameManager.instance.isPaused = false;
                }
            });

            SettingsManager.instance.save();
        }
    }

    private animateMenu(isOpen: boolean, duration: number, onComplete?: Function) {
        const targetBlur = isOpen ? 0.02 : 0;
        const targetOpacity = isOpen ? 255 : 0;

        // 1. Blur Animation
        if (this.targetSprite) {
            const mat = this.targetSprite.getMaterialInstance(0);
            if (mat) {
                // 初期状態を強制設定して、透明化を防ぐ
                let currentParams = (mat.getProperty('mainParams', 0) as Vec4) || new Vec4();
                let blurObj = { val: currentParams.x };

                log(`[OptionsUI] Animating Blur: ${blurObj.val} -> ${targetBlur}`);

                tween(blurObj)
                    .to(duration, { val: targetBlur }, {
                        onUpdate: () => {
                            mat.setProperty('mainParams', new Vec4(blurObj.val, 0, 0, 0));
                        }
                    })
                    .start();
            }
        } else {
            log("[OptionsUI] Warning: targetSprite is NOT assigned!");
        }

        // 2. Opacity Animation (Panel 全体をフェード)
        const op = this.panel.getComponent(UIOpacity) || this.panel.addComponent(UIOpacity);
        if (isOpen) op.opacity = 0;

        tween(op)
            .to(duration, { opacity: targetOpacity })
            .call(() => { if (onComplete) onComplete(); })
            .start();
    }

    // --- Volume Callbacks ---
    public onBgmVolumeChanged(slider: Slider) { SoundManager.instance.bgmVolume = slider.progress; }
    public onSeVolumeChanged(slider: Slider) { SoundManager.instance.seVolume = slider.progress; }
    public onVoiceVolumeChanged(slider: Slider) { SoundManager.instance.voiceVolume = slider.progress; }

    // --- Resolution Callbacks ---
    public setRes1280x720() { SettingsManager.instance.applyResolution(1280, 720); }
    public setRes800x600() { SettingsManager.instance.applyResolution(800, 600); }
    public setRes720x360() { SettingsManager.instance.applyResolution(720, 360); }

    // --- Language Callbacks ---
    public setLanguage(lang: string) {
        SettingsManager.instance.setLanguage(lang);
        this.updateLangVisuals(lang);
    }
    public setLanguageJP() { this.setLanguage('JP'); }
    public setLanguageEN() { this.setLanguage('EN'); }

    private updateLangVisuals(lang: string) {
        if (this.langJPBtn) {
            const op = this.langJPBtn.getComponent(UIOpacity) || this.langJPBtn.addComponent(UIOpacity);
            op.opacity = (lang === 'JP' ? 255 : 100);
        }
        if (this.langENBtn) {
            const op = this.langENBtn.getComponent(UIOpacity) || this.langENBtn.addComponent(UIOpacity);
            op.opacity = (lang === 'EN' ? 255 : 100);
        }
    }

    private refreshPosition() {
        if (!this.node.parent) return;

        // 座標・回転・スケールを強制リセット (初期化時のみ)
        this.node.setPosition(0, 0, 0);
        this.node.angle = 0;
        this.node.setScale(1, 1, 1);

        const layouts = this.node.getComponentsInChildren(Layout);
        layouts.forEach(l => l.updateLayout());
    }
}
