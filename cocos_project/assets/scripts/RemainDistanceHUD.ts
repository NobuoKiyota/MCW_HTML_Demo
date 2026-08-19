import { _decorator, Component, RichText, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Ingame HUDの残り距離表示(RemainDistanceノードのRichTextを駆動する)。
 * GameManagerが毎フレームsetDistance()で残り距離を渡し、このコンポーネント自身は
 * 常時ゆっくり明滅(フェードイン/アウト)するだけの単純な演出を担当する。
 * StarField/GoalWarningEffectと同じく、自前のupdate()で完結させ、GameManagerのisPaused
 * (Result演出中など)に関わらず明滅し続ける。
 */
@ccclass('RemainDistanceHUD')
export class RemainDistanceHUD extends Component {

    @property({ tooltip: "常時の最大不透明度(0-255)。フルオパークにせず、常に多少透過させたい場合はここで上限を絞る" })
    public maxAlpha: number = 200;

    @property({ tooltip: "明滅(フェードイン/アウト)の下限不透明度" })
    public minAlpha: number = 80;

    @property({ tooltip: "明滅1周期の秒数" })
    public pulsePeriodSec: number = 2.0;

    @property({ tooltip: "残りこの距離(km)以下になったら文字色を赤に切り替える" })
    public warningThresholdKm: number = 100;

    private _opacity: UIOpacity = null;
    private _richText: RichText = null;
    private _time: number = 0;

    onLoad() {
        this._richText = this.getComponent(RichText);
        this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        if (!this._richText) {
            console.warn("[RemainDistanceHUD] RichText component not found on this node.");
        }
    }

    update(dt: number) {
        if (!this._opacity) return;
        this._time += dt;
        const t = (Math.sin((this._time / Math.max(0.01, this.pulsePeriodSec)) * Math.PI * 2) + 1) / 2; // 0..1
        this._opacity.opacity = this.minAlpha + (this.maxAlpha - this.minAlpha) * t;
    }

    // GameManager.update()から毎フレーム、残り距離(km)を渡す。
    public setDistance(km: number) {
        if (!this._richText) return;
        const rounded = Math.max(0, Math.round(km));
        const color = km <= this.warningThresholdKm ? '#ff3030' : '#0fffff';
        this._richText.string = `<color=${color}>${rounded}km</color>`;
    }
}
