import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, resources, JsonAsset } from 'cc';
import { GameManager } from './GameManager';
import { GAME_SETTINGS } from './Constants';

const { ccclass, property } = _decorator;

// 元画像(assets/resources/Materials/Clouds/Cloud256x512_XX.png)の実寸は512(幅)x256(高さ)、
// つまり2:1の横長。サイズをランダム化する際、この比率を保ったまま幅基準で拡縮する
// (高さ=幅×CLOUD_ASPECT)。この比率を無視して正方形にすると縦に間延びして歪み、
// 結果的に画像の輪郭(角)がくっきり見えてしまう(今回の「画像端がはっきり見えてダサい」の原因)。
const CLOUD_ASPECT = 256 / 512;

interface CloudSpawnRange {
    layer: number;
    alphaMin: number;
    alphaMax: number;
    sizeMin: number;  // 幅(px)
    sizeMax: number;
    speedScaleMin: number; // GameSpeedManager.getCurrentSpeed()に対する倍率
    speedScaleMax: number;
    rotationMin: number; // 度(degree)
    rotationMax: number;
}

interface ActiveCloud {
    node: Node;
    speedScale: number;
    halfHeight: number;
}

/**
 * Ingame背景の雲を管理する。assets/resources/Materials/Clouds/の半透明PNGからランダムに選び、
 * ランダムな間隔でランダムな位置に生成→下向きにスクロール→画面外に抜けたら破棄、を繰り返す
 * (固定2枚のコンベアベルトで奥/手前/程よく手前の3層を回していた旧CloudLayerManagerから、
 * 生成のたびに全パラメータをその場でランダム化する連続スポーン方式に変更した。毎回同じ2枚が
 * 同じ間隔で流れ続けると輪郭の繰り返しが目につきやすかったため)。
 *
 * 「奥(far)」「手前(near)」の2層に分かれており、far=Enemy/Playerより奥(BG_ONLY_LAYER、既存の
 * 背景と同じ)、near=Enemyより手前・Playerより奥(FG_CLOUD_LAYER、専用のCloudFrontCamera)に
 * 描画される。どちらの層に生成するかもランダム(farLayerChance)。層ごとに透明度/サイズ/速度の
 * 範囲(min/max)をInspectorで個別に調整でき、「どのくらいの幅を持たせてランダム生成するか」を
 * コントロールできる。GameManager.resolveInGameReferences()からミッションごとにsetup()が呼ばれる想定。
 */
@ccclass('CloudManager')
export class CloudManager extends Component {

    public static instance: CloudManager = null;

    // --- 生成頻度 ---
    @property({ tooltip: "雲を生成する間隔(秒)の下限。小さいほど密度が上がる" })
    public spawnIntervalMin: number = 0.5;
    @property({ tooltip: "雲を生成する間隔(秒)の上限" })
    public spawnIntervalMax: number = 1.4;

    @property({ tooltip: "生成する雲が「奥(Enemyより奥)」になる確率(0〜1)。残りは「手前(Enemyより手前・Playerより奥)」に生成される" })
    public farLayerChance: number = 0.45;

    @property({ tooltip: "画面幅に対する初期X座標のランダム範囲の割合(0〜1、1で画面幅いっぱい)" })
    public spawnXRangeRatio: number = 0.9;

    // --- 奥(far)の層 ---
    @property({ tooltip: "[奥] 不透明度(0-255)の下限。値が小さいほど薄い" })
    public farAlphaMin: number = 28;
    @property({ tooltip: "[奥] 不透明度(0-255)の上限" })
    public farAlphaMax: number = 70;
    @property({ tooltip: "[奥] 幅(px)の下限。高さは元画像の比率を保って自動計算される" })
    public farSizeMin: number = 260;
    @property({ tooltip: "[奥] 幅(px)の上限" })
    public farSizeMax: number = 560;
    @property({ tooltip: "[奥] スクロール速度倍率の下限(1.0でゲーム基準速度と同じ)" })
    public farSpeedScaleMin: number = 0.22;
    @property({ tooltip: "[奥] スクロール速度倍率の上限" })
    public farSpeedScaleMax: number = 0.55;
    @property({ tooltip: "[奥] 回転角度(度)の下限。左右反転と合わせて見た目のバリエーションを増やす" })
    public farRotationMin: number = -15;
    @property({ tooltip: "[奥] 回転角度(度)の上限" })
    public farRotationMax: number = 15;

    // --- 手前(near)の層 ---
    @property({ tooltip: "[手前] 不透明度(0-255)の下限" })
    public nearAlphaMin: number = 70;
    @property({ tooltip: "[手前] 不透明度(0-255)の上限" })
    public nearAlphaMax: number = 175;
    @property({ tooltip: "[手前] 幅(px)の下限" })
    public nearSizeMin: number = 320;
    @property({ tooltip: "[手前] 幅(px)の上限" })
    public nearSizeMax: number = 720;
    @property({ tooltip: "[手前] スクロール速度倍率の下限" })
    public nearSpeedScaleMin: number = 0.6;
    @property({ tooltip: "[手前] スクロール速度倍率の上限" })
    public nearSpeedScaleMax: number = 1.5;
    @property({ tooltip: "[手前] 回転角度(度)の下限" })
    public nearRotationMin: number = -15;
    @property({ tooltip: "[手前] 回転角度(度)の上限" })
    public nearRotationMax: number = 15;

    private _frames: SpriteFrame[] = [];
    private _framesReady: boolean = false;
    private _speedManager: any = null;

    private _parent: Node = null;
    private _farLayer: number = 0;
    private _nearLayer: number = 0;
    private _running: boolean = false;
    private _nextSpawnTimer: number = 0;
    private _active: ActiveCloud[] = [];

    onLoad() {
        CloudManager.instance = this;
        this.loadCloudConfig();
        resources.loadDir("Materials/Clouds", SpriteFrame, (err, assets) => {
            if (err || !assets || assets.length === 0) {
                console.warn("[CloudManager] Failed to load cloud SpriteFrames from Materials/Clouds:", err);
                return;
            }
            this._frames = assets;
            this._framesReady = true;
            console.log(`[CloudManager] Loaded ${assets.length} cloud sprite frame(s).`);
        });
    }

    // Master Managerパネルの「CloudManager」タブ(assets/resources/Data/CloudConfig.json)で
    // 編集した値を読み込み、@propertyの既定値を上書きする(GameManager.loadGameManagerConfig()と
    // 同じ規約)。ロード前/失敗時はクラス側の既定値のまま動作する。
    private loadCloudConfig() {
        resources.load("Data/CloudConfig", JsonAsset, (err, asset: JsonAsset) => {
            if (err || !asset) {
                console.warn("[CloudManager] Failed to load Data/CloudConfig.json, using defaults.", err);
                return;
            }
            const config = asset.json as {
                spawnIntervalMin?: number; spawnIntervalMax?: number;
                farLayerChance?: number; spawnXRangeRatio?: number;
                farAlphaMin?: number; farAlphaMax?: number;
                farSizeMin?: number; farSizeMax?: number;
                farSpeedScaleMin?: number; farSpeedScaleMax?: number;
                farRotationMin?: number; farRotationMax?: number;
                nearAlphaMin?: number; nearAlphaMax?: number;
                nearSizeMin?: number; nearSizeMax?: number;
                nearSpeedScaleMin?: number; nearSpeedScaleMax?: number;
                nearRotationMin?: number; nearRotationMax?: number;
            };

            if (typeof config.spawnIntervalMin === 'number') this.spawnIntervalMin = config.spawnIntervalMin;
            if (typeof config.spawnIntervalMax === 'number') this.spawnIntervalMax = config.spawnIntervalMax;
            if (typeof config.farLayerChance === 'number') this.farLayerChance = config.farLayerChance;
            if (typeof config.spawnXRangeRatio === 'number') this.spawnXRangeRatio = config.spawnXRangeRatio;
            if (typeof config.farAlphaMin === 'number') this.farAlphaMin = config.farAlphaMin;
            if (typeof config.farAlphaMax === 'number') this.farAlphaMax = config.farAlphaMax;
            if (typeof config.farSizeMin === 'number') this.farSizeMin = config.farSizeMin;
            if (typeof config.farSizeMax === 'number') this.farSizeMax = config.farSizeMax;
            if (typeof config.farSpeedScaleMin === 'number') this.farSpeedScaleMin = config.farSpeedScaleMin;
            if (typeof config.farSpeedScaleMax === 'number') this.farSpeedScaleMax = config.farSpeedScaleMax;
            if (typeof config.farRotationMin === 'number') this.farRotationMin = config.farRotationMin;
            if (typeof config.farRotationMax === 'number') this.farRotationMax = config.farRotationMax;
            if (typeof config.nearAlphaMin === 'number') this.nearAlphaMin = config.nearAlphaMin;
            if (typeof config.nearAlphaMax === 'number') this.nearAlphaMax = config.nearAlphaMax;
            if (typeof config.nearSizeMin === 'number') this.nearSizeMin = config.nearSizeMin;
            if (typeof config.nearSizeMax === 'number') this.nearSizeMax = config.nearSizeMax;
            if (typeof config.nearSpeedScaleMin === 'number') this.nearSpeedScaleMin = config.nearSpeedScaleMin;
            if (typeof config.nearSpeedScaleMax === 'number') this.nearSpeedScaleMax = config.nearSpeedScaleMax;
            if (typeof config.nearRotationMin === 'number') this.nearRotationMin = config.nearRotationMin;
            if (typeof config.nearRotationMax === 'number') this.nearRotationMax = config.nearRotationMax;

            console.log("[CloudManager] CloudConfig loaded.");
        });
    }

    start() {
        if (GameManager.instance) this._speedManager = GameManager.instance.speedManager;
    }

    // GameManager.resolveInGameReferences()からミッションごとに呼ぶ。
    public setup(parent: Node, farLayer: number, nearLayer: number) {
        this.clearAll();
        this._parent = parent;
        this._farLayer = farLayer;
        this._nearLayer = nearLayer;
        this._running = true;
        this._nextSpawnTimer = 0;

        // 開始直後に画面が寂しくならないよう、画面の高さ内にあらかじめ数枚を撒いておく。
        const prefillCount = 6;
        for (let i = 0; i < prefillCount; i++) {
            const y = (Math.random() - 0.5) * GAME_SETTINGS.CANVAS_HEIGHT;
            this.spawnOne(y);
        }
    }

    update(dt: number) {
        if (!this._running || !this._speedManager) return;
        // Enemy.ts handleMovement()と同じ単位(currentSpeed * frameScale)でスクロール量を揃える。
        const frameScale = dt * 60;
        const baseDelta = this._speedManager.getCurrentSpeed() * frameScale;

        this._nextSpawnTimer -= dt;
        if (this._nextSpawnTimer <= 0 && this._framesReady) {
            this.spawnOne(GAME_SETTINGS.CANVAS_HEIGHT / 2 + 80);
            this._nextSpawnTimer = this.randRange(this.spawnIntervalMin, this.spawnIntervalMax);
        }

        const wrapMargin = GAME_SETTINGS.CANVAS_HEIGHT / 2;
        for (let i = this._active.length - 1; i >= 0; i--) {
            const cloud = this._active[i];
            if (!cloud.node.isValid) {
                this._active.splice(i, 1);
                continue;
            }
            const dy = baseDelta * cloud.speedScale;
            cloud.node.setPosition(cloud.node.position.x, cloud.node.position.y - dy, 0);

            if (cloud.node.position.y + cloud.halfHeight < -wrapMargin) {
                cloud.node.destroy();
                this._active.splice(i, 1);
            }
        }
    }

    private getRangeForLayer(isFar: boolean): CloudSpawnRange {
        return isFar
            ? {
                layer: this._farLayer,
                alphaMin: this.farAlphaMin, alphaMax: this.farAlphaMax,
                sizeMin: this.farSizeMin, sizeMax: this.farSizeMax,
                speedScaleMin: this.farSpeedScaleMin, speedScaleMax: this.farSpeedScaleMax,
                rotationMin: this.farRotationMin, rotationMax: this.farRotationMax,
            }
            : {
                layer: this._nearLayer,
                alphaMin: this.nearAlphaMin, alphaMax: this.nearAlphaMax,
                sizeMin: this.nearSizeMin, sizeMax: this.nearSizeMax,
                speedScaleMin: this.nearSpeedScaleMin, speedScaleMax: this.nearSpeedScaleMax,
                rotationMin: this.nearRotationMin, rotationMax: this.nearRotationMax,
            };
    }

    private spawnOne(startY: number) {
        if (!this._parent || !this._parent.isValid || !this._framesReady || this._frames.length === 0) return;

        const isFar = Math.random() < this.farLayerChance;
        const range = this.getRangeForLayer(isFar);

        const node = new Node('Cloud');
        this._parent.addChild(node);
        node.layer = range.layer;

        const width = this.randRange(range.sizeMin, range.sizeMax);
        const height = width * CLOUD_ASPECT;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(width, height);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.spriteFrame = this._frames[Math.floor(Math.random() * this._frames.length)];

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = this.randRange(range.alphaMin, range.alphaMax);

        const x = (Math.random() * 2 - 1) * this.spawnXRangeRatio * (GAME_SETTINGS.CANVAS_WIDTH / 2);
        node.setPosition(x, startY, 0);

        // 同じ絵柄が連続で選ばれても左右反転+回転で見た目のバリエーションを増やす。
        if (Math.random() < 0.5) node.setScale(-1, 1, 1);
        node.angle = this.randRange(range.rotationMin, range.rotationMax);

        const speedScale = this.randRange(range.speedScaleMin, range.speedScaleMax);
        this._active.push({ node, speedScale, halfHeight: height / 2 });
    }

    private randRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private clearAll() {
        for (const cloud of this._active) {
            if (cloud.node && cloud.node.isValid) cloud.node.destroy();
        }
        this._active = [];
        this._running = false;
    }

    onDestroy() {
        this.clearAll();
        if (CloudManager.instance === this) CloudManager.instance = null;
    }
}
