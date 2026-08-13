import { _decorator, Component, Sprite, Color, CCInteger, CCFloat, Collider2D } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 弾の「残像(分身)」子ノード用コンポーネント。Bullet.ts本体が位置/スケール/角度の履歴バッファを持ち、
 * このコンポーネントが付いた子ノードをdelayFrames分遅れた過去の状態へ毎フレーム追従させる
 * (WideBeam等の拡散リング演出用、当たり判定には一切関与しない純粋な表示専用ノード)。
 *
 * Prefab側の作り方: 本体と同じSpriteFrameを持つSprite付きの子ノードを用意し、このコンポーネントを
 * 追加してdelayFrames/opacityをInspectorで設定する。BoxCollider2D等が付いていても自動的に無効化
 * するので、誤って当たり判定してしまう心配はない。
 */
@ccclass('BulletTrailImage')
export class BulletTrailImage extends Component {

    @property({ type: CCInteger, tooltip: "本体から何フレーム遅れて追従するか" })
    public delayFrames: number = 10;

    @property({ type: CCFloat, tooltip: "不透明度(0.0〜1.0)" })
    public opacity: number = 0.6;

    onLoad() {
        // 当たり判定を必ず無効化する(Prefab側でColliderを付け忘れなければ不要だが、誤配置しても
        // 安全側に倒れるようにする)。
        const collider = this.getComponent(Collider2D);
        if (collider) collider.enabled = false;

        const sprite = this.getComponent(Sprite);
        if (sprite) {
            const c = sprite.color;
            const alpha = Math.max(0, Math.min(255, Math.round(this.opacity * 255)));
            sprite.color = new Color(c.r, c.g, c.b, alpha);
        }
    }
}
