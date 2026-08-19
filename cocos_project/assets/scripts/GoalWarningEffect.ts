import { _decorator, Component, Graphics, Color } from 'cc';
const { ccclass, property } = _decorator;

/**
 * GOAL接近時(残り100km以下)にPlayer機体へ重ねて表示する、半透明・赤点灯の警告オーラ。
 * BuffVisualEffect(軌道する星)と同じくPlayerControllerのnode配下にGraphicsで描画するだけの
 * 軽量コンポーネント。機体そのものを覆う静止グローで、軌道はしない。
 */
@ccclass('GoalWarningEffect')
export class GoalWarningEffect extends Component {

    @property
    public radius: number = 70;

    private _g: Graphics = null;
    private _time: number = 0;

    onLoad() {
        this._g = this.node.getComponent(Graphics) || this.node.addComponent(Graphics);
        // BuffVisualEffectと同じ加算合成(SRC_ALPHA/ONE)でグロー感を出す
        const gAny = this._g as any;
        if (gAny.srcBlendFactor !== undefined) {
            gAny.srcBlendFactor = 2; // SRC_ALPHA
            gAny.dstBlendFactor = 1; // ONE
        }
    }

    update(dt: number) {
        if (!this._g) return;
        this._time += dt;

        // 点灯(明滅)。0→1→0を繰り返す
        const wave = (Math.sin(this._time * 5) + 1) / 2;
        const alpha = 40 + wave * 90;
        const r = this.radius * (0.9 + wave * 0.15);

        this._g.clear();
        this._g.fillColor = new Color(255, 30, 30, alpha);
        this._g.circle(0, 0, r);
        this._g.fill();
        // 中心をわずかに明るくして「機体を覆うオーラ」感を強める
        this._g.fillColor = new Color(255, 120, 120, alpha * 0.5);
        this._g.circle(0, 0, r * 0.5);
        this._g.fill();
    }
}
