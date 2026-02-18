import { _decorator, Component, Node, UIOpacity, UITransform, v3, Vec3, math } from 'cc';
import { GameManager } from './GameManager';
const { ccclass, property } = _decorator;

/**
 * ミッションの進捗（DIST）に合わせて背景をクロスフェード・回転させるクラス。
 */
@ccclass('SpaceBackground')
export class SpaceBackground extends Component {

    @property(Node)
    public bgNode1: Node = null; // ミッション開始時の画像 (A)

    @property(Node)
    public bgNode2: Node = null; // ミッション終了時の画像 (B)

    @property({ tooltip: "ミッション全体を通じた回転角度（酔い防止のため 90 程度を推奨）" })
    public totalRotation: number = 90;

    @property({ tooltip: "画像AとBのクロスフェード回数（往復回数）" })
    public fadeCount: number = 2;

    @property({ tooltip: "背景全体の明るさ（最大不透明度）", min: 0, max: 1 })
    public brightness: number = 0.5;

    private _opacity1: UIOpacity = null;
    private _opacity2: UIOpacity = null;

    onLoad() {
        if (this.bgNode1) {
            this._opacity1 = this.bgNode1.getComponent(UIOpacity) || this.bgNode1.addComponent(UIOpacity);
            this.bgNode1.setPosition(0, 0, 0);
        }
        if (this.bgNode2) {
            this._opacity2 = this.bgNode2.getComponent(UIOpacity) || this.bgNode2.addComponent(UIOpacity);
            this.bgNode2.setPosition(0, 0, 0);
        }

        // 初期状態
        if (this._opacity1) this._opacity1.opacity = Math.floor(255 * this.brightness);
        if (this._opacity2) this._opacity2.opacity = 0;
    }

    update(dt: number) {
        if (!GameManager.instance) return;

        // GameManager からミッション距離情報を取得
        const initialDist = GameManager.instance.missionDistance;
        const currentDist = GameManager.instance.playState.distance;

        if (initialDist <= 0) return;

        // 進行度: 0.0 (開始) ～ 1.0 (終了)
        let progress = (initialDist - currentDist) / initialDist;
        progress = Math.min(Math.max(progress, 0), 1);

        // 1. クロスフェード・ロジック (往復対応)
        // Cosine波を使用して A -> B -> A ... と滑らかに遷移させる
        // progress=0 で cos(0)=1 (Aが最大)、progress=1 で fadeCount=1 なら cos(PI)=-1 (Bが最大)
        const cosVal = Math.cos(progress * Math.PI * this.fadeCount);
        const weightB = (0.5 - 0.5 * cosVal); // 0.0 ～ 1.0
        const weightA = 1.0 - weightB;

        const maxAlpha = 255 * this.brightness;

        if (this._opacity1) {
            this._opacity1.opacity = Math.floor(weightA * maxAlpha);
        }
        if (this._opacity2) {
            this._opacity2.opacity = Math.floor(weightB * maxAlpha);
        }

        // 2. 回転ロジック (レイヤー全体を回転)
        this.node.angle = progress * this.totalRotation;
    }
}
