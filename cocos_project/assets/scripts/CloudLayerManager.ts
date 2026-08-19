import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, resources } from 'cc';
import { GameManager } from './GameManager';
import { GAME_SETTINGS } from './Constants';

const { ccclass, property } = _decorator;

interface CloudTierConfig {
    name: string;
    layer: number;
    minAlpha: number;
    maxAlpha: number;
    scrollScale: number; // GameSpeedManager.getCurrentSpeed()に対する倍率(視差用)
    widthScale: number;  // spriteWidthに対する倍率(層ごとにサイズを変えて奥行き感を出す)
}

interface CloudTier {
    belt: Node[];
    config: CloudTierConfig;
}

/**
 * Ingame背景の3層クラウド(極薄い/薄い/程よく薄い)を管理する。assets/resources/Materials/Clouds/
 * の半透明PNG(cloud1024x1024_01〜10)からランダムに選び、2枚1組の「コンベアベルト」方式
 * (1枚が画面下へ抜けたら、もう1枚の真上に再配置してループさせる)で縦スクロールさせる。
 * StarField.tsと同じくGameSpeedManager.getCurrentSpeed()を毎フレーム参照して速度を合わせる。
 *
 * 3層は個別のレイヤービット(GameManager側で設定したBG_ONLY_LAYER/FG_CLOUD_LAYER)に分かれており、
 * 「極薄い」はEnemy/Playerより奥(既存の背景と同じBG_ONLY_LAYER)、「薄い」「程よく薄い」は
 * Enemyより手前・Playerより奥(新設のFG_CLOUD_LAYER、専用のCloudFrontCamera)に描画される。
 * GameManager.resolveInGameReferences()からミッションごとにsetup()が呼ばれる想定。
 */
@ccclass('CloudLayerManager')
export class CloudLayerManager extends Component {

    @property({ tooltip: "極薄い雲(背景、BG_ONLY_LAYER)の不透明度下限(0-255)" })
    public farMinAlpha: number = 38;
    @property
    public farMaxAlpha: number = 64;
    @property({ tooltip: "極薄い雲のスクロール倍率(1.0でゲーム速度と同じ、小さいほど奥にゆっくり見える)" })
    public farScrollScale: number = 0.4;

    @property({ tooltip: "薄い雲(前景、FG_CLOUD_LAYER)の不透明度下限(0-255)" })
    public nearMinAlpha: number = 89;
    @property
    public nearMaxAlpha: number = 128;
    @property
    public nearScrollScale: number = 1.0;

    @property({ tooltip: "程よく薄い雲(前景、FG_CLOUD_LAYER)の不透明度下限(0-255)" })
    public closeMinAlpha: number = 140;
    @property
    public closeMaxAlpha: number = 179;
    @property({ tooltip: "程よく薄い雲のスクロール倍率(1.0より大きいほど手前を速く通過して見える)" })
    public closeScrollScale: number = 1.4;

    @property({ tooltip: "元画像(1024x1024正方形)を表示する基準の一辺サイズ(px)" })
    public spriteWidth: number = 900;

    private _frames: SpriteFrame[] = [];
    private _framesReady: boolean = false;
    private _tiers: CloudTier[] = [];
    private _speedManager: any = null;

    onLoad() {
        resources.loadDir("Materials/Clouds", SpriteFrame, (err, assets) => {
            if (err || !assets || assets.length === 0) {
                console.warn("[CloudLayerManager] Failed to load cloud SpriteFrames from Materials/Clouds:", err);
                return;
            }
            this._frames = assets;
            this._framesReady = true;
            console.log(`[CloudLayerManager] Loaded ${assets.length} cloud sprite frame(s).`);
            // ロード完了が層の初期化より後になった場合、既存のスプライトにも遅れて絵柄を割り当てる。
            for (const tier of this._tiers) {
                for (const node of tier.belt) {
                    if (node.isValid) this.assignRandomFrame(node);
                }
            }
        });
    }

    start() {
        if (GameManager.instance) this._speedManager = GameManager.instance.speedManager;
    }

    // GameManager.resolveInGameReferences()からミッションごとに呼ぶ。
    public setup(parent: Node, farLayer: number, frontLayer: number) {
        this.clearAll();

        this._tiers = [
            { belt: [], config: { name: 'far', layer: farLayer, minAlpha: this.farMinAlpha, maxAlpha: this.farMaxAlpha, scrollScale: this.farScrollScale, widthScale: 1.0 } },
            { belt: [], config: { name: 'near', layer: frontLayer, minAlpha: this.nearMinAlpha, maxAlpha: this.nearMaxAlpha, scrollScale: this.nearScrollScale, widthScale: 1.1 } },
            { belt: [], config: { name: 'close', layer: frontLayer, minAlpha: this.closeMinAlpha, maxAlpha: this.closeMaxAlpha, scrollScale: this.closeScrollScale, widthScale: 1.3 } },
        ];

        for (const tier of this._tiers) {
            for (let i = 0; i < 2; i++) {
                tier.belt.push(this.createCloudSprite(parent, tier.config));
            }
            this.layoutBeltInitial(tier);
        }
    }

    private createCloudSprite(parent: Node, config: CloudTierConfig): Node {
        const node = new Node(`Cloud_${config.name}`);
        parent.addChild(node);
        node.layer = config.layer;

        const size = this.spriteWidth * config.widthScale;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(size, size);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = config.minAlpha + Math.random() * (config.maxAlpha - config.minAlpha);

        this.assignRandomFrame(node);
        return node;
    }

    private assignRandomFrame(node: Node) {
        if (!this._framesReady || this._frames.length === 0 || !node.isValid) return;
        const sprite = node.getComponent(Sprite);
        if (!sprite) return;
        sprite.spriteFrame = this._frames[Math.floor(Math.random() * this._frames.length)];
    }

    // 1枚目を画面中央、2枚目をその真上(高さぶんオフセット)に置き、下へスクロールし始めても
    // 隙間ができないようにする。
    private layoutBeltInitial(tier: CloudTier) {
        const size = this.spriteWidth * tier.config.widthScale;
        tier.belt[0].setPosition(0, 0, 0);
        tier.belt[1].setPosition(0, size, 0);
    }

    update(dt: number) {
        if (!this._speedManager || this._tiers.length === 0) return;
        // Enemy.ts handleMovement()と同じ単位(currentSpeed * frameScale)でスクロール量を揃える。
        const frameScale = dt * 60;
        const baseDelta = this._speedManager.getCurrentSpeed() * frameScale;
        const wrapMargin = GAME_SETTINGS.CANVAS_HEIGHT / 2;

        for (const tier of this._tiers) {
            const size = this.spriteWidth * tier.config.widthScale;
            const dy = baseDelta * tier.config.scrollScale;

            for (const node of tier.belt) {
                if (!node.isValid) continue;
                node.setPosition(node.position.x, node.position.y - dy, 0);
            }

            // 完全に画面下へ抜けた(上端が画面下端より下)スプライトを、もう片方の真上へ
            // 再配置してループさせる。再配置のたびに絵柄をランダムに選び直す。
            for (const node of tier.belt) {
                if (!node.isValid) continue;
                if (node.position.y + size / 2 < -wrapMargin) {
                    const other = tier.belt.find(n => n !== node && n.isValid);
                    const baseY = other ? other.position.y : 0;
                    node.setPosition(node.position.x, baseY + size, 0);
                    this.assignRandomFrame(node);
                }
            }
        }
    }

    private clearAll() {
        for (const tier of this._tiers) {
            for (const node of tier.belt) {
                if (node && node.isValid) node.destroy();
            }
        }
        this._tiers = [];
    }

    onDestroy() {
        this.clearAll();
    }
}
