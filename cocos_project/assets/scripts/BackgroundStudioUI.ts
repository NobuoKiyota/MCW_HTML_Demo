import { _decorator, Component, Node, Slider, Label, Button, Canvas } from 'cc';
import { SkyManager } from './SkyManager';
import { BG_ONLY_LAYER, FG_CLOUD_LAYER } from './Constants';

const { ccclass, property } = _decorator;

/**
 * 背景専用プレビュー・調整シーン(Scene_BackgroundStudio)のUIコントローラー。
 * SkyManager と連携し、自機速度シミュレート、スクロール速度・不透明度調整、星バースト演出テストをリアルタイムに行える。
 */
@ccclass('BackgroundStudioUI')
export class BackgroundStudioUI extends Component {

    @property(SkyManager)
    public skyManager: SkyManager = null;

    @property(Slider)
    public speedSlider: Slider = null;
    @property(Label)
    public speedLabel: Label = null;

    @property(Slider)
    public skySpeedSlider: Slider = null;
    @property(Label)
    public skySpeedLabel: Label = null;

    @property(Slider)
    public skyOpacitySlider: Slider = null;
    @property(Label)
    public skyOpacityLabel: Label = null;

    @property(Slider)
    public videoOpacitySlider: Slider = null;
    @property(Label)
    public videoOpacityLabel: Label = null;

    @property(Button)
    public burstButton: Button = null;

    private _currentSpeedKm: number = 400;
    private _skySpeed: number = 30;
    private _skyOpacity: number = 255;
    private _videoOpacity: number = 0;

    start() {
        if (!this.skyManager) {
            let skyNode = this.node.scene.getChildByName("SkyManager");
            if (skyNode) {
                this.skyManager = skyNode.getComponent(SkyManager);
            }
        }

        const canvasNode = this.node.scene.getComponentInChildren(Canvas)?.node || this.node;
        if (!this.skyManager) {
            const node = new Node("SkyManager");
            canvasNode.addChild(node);
            this.skyManager = node.addComponent(SkyManager);
        }

        if (this.skyManager) {
            this.skyManager.setup(canvasNode, BG_ONLY_LAYER, FG_CLOUD_LAYER);
            this.skyManager.setManualSpeed(this._currentSpeedKm / 60);
        }

        this.setupUIEvents();
        this.updateLabels();
    }

    private setupUIEvents() {
        if (this.speedSlider) {
            this.speedSlider.node.on('slide', (slider: Slider) => {
                this._currentSpeedKm = Math.round(slider.progress * 1500);
                if (this.skyManager) {
                    this.skyManager.setManualSpeed(this._currentSpeedKm / 60);
                }
                this.updateLabels();
            });
            this.speedSlider.progress = this._currentSpeedKm / 1500;
        }

        if (this.skySpeedSlider) {
            this.skySpeedSlider.node.on('slide', (slider: Slider) => {
                this._skySpeed = Math.round(slider.progress * 200);
                this.applyTunables();
                this.updateLabels();
            });
            this.skySpeedSlider.progress = this._skySpeed / 200;
        }

        if (this.skyOpacitySlider) {
            this.skyOpacitySlider.node.on('slide', (slider: Slider) => {
                this._skyOpacity = Math.round(slider.progress * 255);
                this.applyTunables();
                this.updateLabels();
            });
            this.skyOpacitySlider.progress = this._skyOpacity / 255;
        }

        if (this.videoOpacitySlider) {
            this.videoOpacitySlider.node.on('slide', (slider: Slider) => {
                this._videoOpacity = Math.round(slider.progress * 255);
                this.applyTunables();
                this.updateLabels();
            });
            this.videoOpacitySlider.progress = this._videoOpacity / 255;
        }

        if (this.burstButton) {
            this.burstButton.node.on(Button.EventType.CLICK, () => {
                if (this.skyManager) {
                    this.skyManager.triggerBurst(3.0, 3.5, 3.0);
                }
            });
        }
    }

    private applyTunables() {
        if (this.skyManager) {
            this.skyManager.applyTunables(this._skySpeed, this._skyOpacity, this._videoOpacity);
        }
    }

    private updateLabels() {
        if (this.speedLabel) this.speedLabel.string = `自機速度: ${this._currentSpeedKm} km/h`;
        if (this.skySpeedLabel) this.skySpeedLabel.string = `スカイ速度: ${this._skySpeed} px/s`;
        if (this.skyOpacityLabel) this.skyOpacityLabel.string = `スカイ不透明度: ${this._skyOpacity}`;
        if (this.videoOpacityLabel) this.videoOpacityLabel.string = `動画不透明度: ${this._videoOpacity}`;
    }
}
