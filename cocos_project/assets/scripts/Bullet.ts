import { _decorator, Component, Node, Vec3, Size, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, Sprite, Color, find, ParticleSystem2D, gfx, UITransform, tween, MeshRenderer, Material, Layers } from 'cc';
// import { Enemy } from './Enemy'; // Cycle
// import { PlayerController } from './PlayerController'; // Cycle
// import { GameManager } from './GameManager'; // Cycle
import { GAME_SETTINGS, IGameManager } from './Constants';
import { BulletTrailImage } from './BulletTrailImage';
const { ccclass, property } = _decorator;

@ccclass('Bullet')
export class Bullet extends Component {

    public isEnemy: boolean = false;
    public damage: number = 10;

    private speed: number = 0;
    private angle: number = 0;
    // 実際のゲームプレイでは常にinstantiate()直後にinit()が同期的に呼ばれ、ここを3秒に上書きする
    // ため0のままでも問題にならない。ただしMaterialLabBulletInit.tsのように「先にシーンへ静的配置
    // →後から非同期でinit()相当を呼ぶ」パターンだと、init()が呼ばれる前のupdate()が
    // 「life<=0だから寿命切れ」と誤判定してPlay開始直後に自己破壊してしまっていた。
    // 未初期化状態の既定値として安全な大きめの値にしておく。
    private life: number = 999;

    private velocity: Vec3 = new Vec3();
    private _tempPos: Vec3 = new Vec3();

    // Homing
    public isHoming: boolean = false;
    public target: Node = null;
    public steerForce: number = 0.1; // Radians per frame approx

    // PMissile(ShotRuntime.doPMissilePellet())専用の初速アーク演出。applyArc()が呼ばれた弾だけ
    // 有効になる(既定は無効、他の全弾には無関係)。発射直後のarcDuration秒間だけ、通常のvelocity
    // ベース移動を無視して2次関数(_arcCoeffA*x^2 + _arcCoeffB*x + _arcCoeffC、xは発射からの経過に
    // 応じて0→_arcXRangeへ進む)に沿った位置を直接計算する。アーク終了時に直進(+ホーミング予約が
    // あればここで初めてisHoming/targetを有効化)へ引き継ぐ。
    private _arcActive: boolean = false;
    private _arcElapsed: number = 0;
    private _arcDuration: number = 0;
    private _arcCoeffA: number = 0;
    private _arcCoeffB: number = 0;
    private _arcCoeffC: number = 0;
    private _arcXRange: number = 0;
    private _arcWorldScale: number = 1;
    private _arcSide: number = 1; // -1=左(lm)、+1=右(rm)。lateral方向(横のオフセット)にのみ使う。
    // 前後方向の式(forwardDist)はL/Rどちらも同じ符号で計算するので、この値は係数には影響しない
    // (左右対称に同じだけ後方へ膨らんでから同じ速度で前進する)。
    private _arcLaunchPos: Vec3 = new Vec3();
    private _arcForwardAxis: Vec3 = new Vec3(0, 1, 0);
    private _arcLateralAxis: Vec3 = new Vec3(1, 0, 0);
    private _arcPrevWorldPos: Vec3 = new Vec3();
    private _arcExitSpeed: number = 0;
    private _arcHomingAfter: boolean = false;
    private _arcHomingTarget: Node | null = null;
    private _arcHomingTurnRate: number = 0.1;

    // 貫通属性 (ShotRuntime.tsのFire/MultiFire/Missileノードから発射直後に設定される)。
    // 0: 通常(1ヒットで消滅、既定値/従来動作) / -1: 無限貫通 / N: N回ヒットで消滅。
    public pierceRemaining: number = 0;

    // Cache GM
    private _gm: IGameManager = null;

    @property(ParticleSystem2D)
    public particleEffect: ParticleSystem2D = null;

    // 発光表現: 弾ごとにパーティクルシステムを常時回すのは大量発生時に重いため、既存の弾テクスチャを
    // 流用した加算合成のSpriteを1枚重ねるだけの軽量な方式にしている(新規アセット不要)。
    private _glowNode: Node | null = null;
    private _glowSprite: Sprite | null = null;
    private _pulseTime: number = 0;

    // Shot Patternノード(Fire/MultiFire/Missile)のcolor/glowIntensity/scaleパラメータで上書きできる
    // 見た目のベース色・発光強度・サイズ倍率。applyVisualOverride()で変える。
    private _baseColor: Color = new Color(255, 255, 255, 255);
    private _glowIntensity: number = 1.0;
    // Prefab側のNode基準スケール(onLoad()で1度だけ捕捉)。scaleパラメータはこれに掛け算する
    // 倍率として扱う(1.0=Prefabそのままのサイズ)。子のGlow/Model3Dも同じNode配下なので
    // this.nodeのスケールを変えるだけで両方に連動する。
    private _baseNodeScale: Vec3 = new Vec3(1, 1, 1);
    // applyVisualOverride(scale)で設定された現在のスケール倍率(既定1.0、X/Y均等)。applyGrowth()の
    // 拡大開始値としても使う(WideBeam等、発射時のscale指定と拡大を両立できるように)。
    // X/Yを分けて持っているのは、growScaleX/Yで横幅だけ拡大量を変える等の非均一な拡大に対応するため。
    private _scaleMultiplierX: number = 1.0;
    private _scaleMultiplierY: number = 1.0;

    // BoxCollider2Dの当たり判定サイズをスケールに追従させるためのキャッシュ。Cocosの物理コライダーは
    // Node.scaleを変えただけでは判定サイズが自動追従しない(見た目だけ拡大されて判定は元のサイズの
    // ままになる)ため、スケールが変わるたびにcollider.sizeを明示的に書き換える必要がある。
    private _collider: BoxCollider2D | null = null;
    private _baseColliderSize: Size | null = null;

    // 時間経過でスケールを拡大させる演出(WideBeam等の拡散リング用)。ShotRuntime.tsの
    // growScale(X/Y)パラメータ経由でapplyGrowth()が呼ばれた弾だけ有効になる(既定は無効、既存弾には無関係)。
    // 寿命(life、init()で3秒固定)の残り時間を基準に、開始スケールから目標スケールまで線形補間する。
    private _growthEnabled: boolean = false;
    private _growthStartScaleX: number = 1.0;
    private _growthStartScaleY: number = 1.0;
    private _growthTargetScaleX: number = 1.0;
    private _growthTargetScaleY: number = 1.0;
    // 経過時間の基準点(=applyGrowth()が呼ばれた瞬間のlife、ほぼ常に寿命の初期値と一致)。
    // 「進行度」はこの値からの経過時間(_growthLifeTotal - life)を_growthDurationで割って求める。
    private _growthLifeTotal: number = 0;
    // 拡大が完了するまでの秒数。既定は寿命全体(_growthLifeTotal自身)と同じ = 寿命ぴったりで
    // 拡大しきる従来通りの挙動。ShotRuntime.tsのgrowDurationパラメータ経由でこれより短い値を
    // 渡すと、寿命(duration)は変えずに拡大だけ先に完了させ、残り時間は最大サイズのまま留まる
    // (「durはそのままで拡がる速度を上げたい」場合に使う)。
    private _growthDuration: number = 0;

    // 発射角度とは独立に、Z軸を毎フレーム回転させ続ける演出(ShockWave等のリング用)。
    // ShotRuntime.tsのspinSpeedパラメータ経由でapplySpin()が呼ばれた弾だけ有効になる
    // (既定は0=回転なし、既存弾には無関係)。Homing/Arc中のnode.angle上書きとは競合せず、
    // それらが設定した角度に対して毎フレーム加算される(向き+回転の両方を両立できる)。
    private _spinSpeed: number = 0; // degrees/sec

    // 残像(分身)演出用。BulletTrailImageコンポーネント付きの子ノードが1つでも見つかった場合のみ、
    // 毎フレーム自身のworld位置/スケール/角度を履歴バッファに記録し、各分身ノードをdelayFrames分
    // 過去の状態へ追従させる(WideBeam等の拡散リング用、無ければ従来通り何もしない)。
    private static readonly MAX_TRAIL_FRAMES = 60;
    private _trailImages: BulletTrailImage[] = [];
    private _trailHistoryX: number[] = [];
    private _trailHistoryY: number[] = [];
    private _trailHistoryAngle: number[] = [];
    private _trailHistoryScaleX: number[] = [];
    private _trailHistoryScaleY: number[] = [];
    private _trailWriteIndex: number = 0;
    private _trailFilledCount: number = 0;
    private _tempWorldPos: Vec3 = new Vec3();

    // Player/Enemyと同じ規約: "Model3D"という名前の子ノードがPrefabに埋め込まれていれば、
    // 見た目を3Dモデルに差し替えつつ、簡単な演出(常時回転+発光パルス)を自動で掛ける。無ければ何もしない
    // (既存の2Dスプライトのみの弾Prefabには一切影響しない)。
    private _model3D: Node | null = null;
    private _modelBaseScale: Vec3 = new Vec3(1, 1, 1);
    // getMaterialInstance()は呼ぶたびに新規インスタンスを作り直しGPUバッチングを崩すため、
    // Model3D検出時に1回だけ取得してキャッシュする(以後はこのインスタンスのプロパティを毎フレーム書き換えるだけ)。
    private _modelMat: Material | null = null;

    onLoad() {
        this._collider = this.getComponent(BoxCollider2D);
        if (this._collider) {
            this._collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this._baseColliderSize = this._collider.size.clone();
        }
        Vec3.copy(this._baseNodeScale, this.node.scale);

        this._trailImages = this.getComponentsInChildren(BulletTrailImage);
        if (this._trailImages.length > 0) {
            for (let i = 0; i < Bullet.MAX_TRAIL_FRAMES; i++) {
                this._trailHistoryX.push(0);
                this._trailHistoryY.push(0);
                this._trailHistoryAngle.push(0);
                this._trailHistoryScaleX.push(1);
                this._trailHistoryScaleY.push(1);
            }
        }
    }

    // Node.scaleを変えるだけではBoxCollider2Dの当たり判定サイズは追従しないため、スケールが
    // 変わるたび(applyVisualOverride/毎フレームのGrowth更新)にこれを呼んでcollider.sizeを
    // 明示的に書き換える。colliderが無い弾(演出専用の残像等)では何もしない。
    private syncColliderSize(scaleX: number, scaleY: number) {
        if (!this._collider || !this._baseColliderSize) return;
        this._collider.size = new Size(this._baseColliderSize.width * scaleX, this._baseColliderSize.height * scaleY);
    }

    // Init method called by GameManager or Shooter
    init(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, gm: IGameManager) {
        this._gm = gm;
        // console.log(`[Bullet] init: x=${x}, y=${y}, angle=${angle}, speed=${speed}`); // Reduce spam
        this.node.setPosition(x, y, 0);
        // プール再利用時に前回のapplyVisualOverride(scale)/applyGrowth()が残らないよう、毎回
        // Prefab基準スケールにリセットする(scaleパラメータ未指定のShotPatternからの発射ならこのまま
        // 等倍で使われる)。
        this.node.setScale(this._baseNodeScale.x, this._baseNodeScale.y, this._baseNodeScale.z);
        this._scaleMultiplierX = 1.0;
        this._scaleMultiplierY = 1.0;
        this.syncColliderSize(1.0, 1.0);
        this._growthEnabled = false;
        this._spinSpeed = 0; // プール再利用時に前回のapplySpin()が残らないようにする
        this._arcActive = false; // プール再利用時に前回のapplyArc()が残らないようにする
        // プール再利用時に前回の履歴が新しい発射直後の分身に一瞬混ざらないよう、書き込み位置と
        // 「まだ何フレーム分溜まっているか」をリセットする(配列の中身自体は使い回して構わない -
        // _trailFilledCountが0に戻るのでdelayFrames分溜まるまで各分身は動かない=安全)。
        this._trailWriteIndex = 0;
        this._trailFilledCount = 0;
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.life = 3.0; // Seconds

        // Reset Homing
        this.isHoming = false;
        this.target = null;
        this.pierceRemaining = 0;

        // Set Velocity
        this.velocity.x = Math.cos(angle) * speed;
        this.velocity.y = Math.sin(angle) * speed;

        // Visual Rotation
        this.node.angle = (angle * 180 / Math.PI) - 90;

        // Color differentiation (Shot Patternノードがcolorを指定した場合はapplyVisualOverride()で
        // 後から上書きされる。ここでは isEnemy ベースの既定色を設定する)
        const sprite = this.getComponent(Sprite);
        this._baseColor = isEnemy ? new Color(255, 100, 100) : new Color(100, 255, 100);
        this._glowIntensity = 1.0;

        if (sprite) {
            sprite.color = this._baseColor;
        }

        // 常時発光する加算合成のグローSpriteをコアの下に用意する(既存テクスチャ流用、新規アセット不要)。
        if (sprite) this.ensureGlowNode(sprite, this._baseColor);
        this._pulseTime = 0;

        // 被弾/爆発などの一過性演出用に将来使う想定で残しているが、弾ごとに常時ONだと大量発生時に
        // 重くなるため、常時発光の役割はグロー(加算Sprite)に置き換え、こちらは無効化しておく。
        if (!this.particleEffect) this.particleEffect = this.getComponentInChildren(ParticleSystem2D);
        if (this.particleEffect) {
            this.particleEffect.node.active = false;
        }

        // 3Dモデル埋め込みの弾Prefab(Model3Dという名前の子ノード)なら、常時回転の演出を自動で掛ける。
        // Player/Enemyの3Dモデル取り付けパターンと同じ検出方法。
        if (!this._model3D) {
            const embedded = this.node.getChildByName("Model3D");
            if (embedded) {
                this._model3D = embedded;
                // GameManager.spawnBullet()はforceUILayer()でthis.node以下を再帰的にUI_2Dレイヤーへ
                // 強制する(このinit()呼び出しより前に実行済み)。UI_2DレイヤーはUIカメラ用で3D
                // MeshRendererを描画対象に含まないため、Model3D配下だけはPlayerの3Dモデルと同じ
                // DEFAULTレイヤーに戻しておかないと、どれだけscaleを大きくしても一切描画されない。
                this.setLayerRecursive(embedded, Layers.BitMask.DEFAULT);
                Vec3.copy(this._modelBaseScale, embedded.scale);
                tween(embedded)
                    .by(1.0, { eulerAngles: new Vec3(0, 360, 0) } as any, { easing: "linear" })
                    .repeatForever()
                    .start();

                // 発光パルス用にマテリアルインスタンスを1回だけ取得してキャッシュしておく
                // (毎フレームgetMaterialInstance()を呼ぶとインスタンスが増殖しGPUバッチングを崩すため)。
                const meshRenderer = embedded.getComponentInChildren(MeshRenderer);
                if (meshRenderer) {
                    this._modelMat = meshRenderer.getMaterialInstance(0);
                }
            }
        }
    }

    // GameManager.forceUILayer()と同じ再帰(node自身+全子孫)。UI_2Dに強制された後のModel3D
    // サブツリーだけを別レイヤーへ戻すために使う。
    private setLayerRecursive(node: Node, layer: number) {
        node.layer = layer;
        for (const child of node.children) {
            this.setLayerRecursive(child, layer);
        }
    }

    /**
     * 加算合成のグローSpriteを(無ければ)生成し、色を合わせる。既存の弾テクスチャをそのまま拡大流用
     * するので専用アセットは不要。コアのSpriteは別コンポーネントとして残るため、シャープな見た目は
     * そのまま保たれる。
     */
    private ensureGlowNode(coreSprite: Sprite, bulletColor: Color) {
        // 既定の発光アルファは160。_glowIntensityが1.0未満なら暗く、1.0超なら(255まで)明るくなる。
        const alpha = Math.max(0, Math.min(255, Math.round(160 * this._glowIntensity)));
        const glowColor = new Color(bulletColor.r, bulletColor.g, bulletColor.b, alpha);

        if (this._glowNode && this._glowNode.isValid && this._glowSprite) {
            this._glowSprite.color = glowColor;
            return;
        }

        const glow = new Node("Glow");
        const glowUi = glow.addComponent(UITransform);
        const coreUi = coreSprite.getComponent(UITransform);
        if (coreUi) glowUi.setContentSize(coreUi.contentSize);

        const glowSprite = glow.addComponent(Sprite);
        glowSprite.spriteFrame = coreSprite.spriteFrame;
        // 'cc'パッケージはBlendFactorをトップレベルでは再エクスポートしていない
        // (import { BlendFactor } from 'cc' は undefined になる。実機コンソールで確認済み
        // 'TypeError: Cannot read properties of undefined (reading SRC_ALPHA)')。gfx名前空間経由が正しい。
        glowSprite.srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
        glowSprite.dstBlendFactor = gfx.BlendFactor.ONE; // 加算合成
        glowSprite.color = glowColor;

        glow.setParent(this.node);
        glow.setSiblingIndex(0);
        glow.setPosition(0, 0, 0);
        glow.setScale(1.7, 1.7, 1);

        this._glowNode = glow;
        this._glowSprite = glowSprite;
    }

    update(deltaTime: number) {
        if (this._gm && this._gm.isPaused) return;

        // パルス用の位相は、グロー/3Dモデルいずれか一方しか無い弾Prefabでも共通で進行させる
        // (以前はグローSpriteがある場合しか加算していなかったため、3Dモデルのみの弾では
        // パルスが完全に止まっていた)。速度・振幅類はGameManagerEditor(GameManagerConfig.json)
        // 経由で調整可能(IGameManager経由、既定値はこの演出を最初に実装した際の固定値と同じ)。
        const pulseSpeed = (this._gm && typeof this._gm.bulletPulseSpeed === 'number') ? this._gm.bulletPulseSpeed : 6;
        const glowScale = (this._gm && typeof this._gm.bulletGlowScale === 'number') ? this._gm.bulletGlowScale : 1.7;
        const glowScalePulse = (this._gm && typeof this._gm.bulletGlowScalePulse === 'number') ? this._gm.bulletGlowScalePulse : 0.25;
        const glowAlpha = (this._gm && typeof this._gm.bulletGlowAlpha === 'number') ? this._gm.bulletGlowAlpha : 160;
        const emissiveBase = (this._gm && typeof this._gm.bulletEmissiveBase === 'number') ? this._gm.bulletEmissiveBase : 0.6;
        const emissiveAmplitude = (this._gm && typeof this._gm.bulletEmissiveAmplitude === 'number') ? this._gm.bulletEmissiveAmplitude : 0.4;

        this._pulseTime += deltaTime;
        // sin()は山/谷付近で変化率がほぼ0になり長く留まる(イーズイン/アウト)ため、振幅が大きいと
        // 「明→暗」がパッと切り替わる2値の点滅に見えてしまう(実際に報告された症状)。
        // asin(sin(x))は同じ周期・範囲(-1〜1)のまま変化率が常に一定な三角波になるので、
        // 山/谷での停留が無くなり、暗→明→暗を均等な速さで通過する「グラデーション」に見える。
        const pulseWave = (2 / Math.PI) * Math.asin(Math.sin(this._pulseTime * pulseSpeed));

        // グローの拡縮+明滅パルス(呼吸するような発光)。コア本体のSpriteは触らないのでシャープなまま。
        // 同じsin波を拡縮とアルファの両方に使い回すので追加コストはほぼゼロ。
        if (this._glowNode && this._glowNode.isValid && this._glowSprite) {
            const s = glowScale + pulseWave * glowScalePulse;
            this._glowNode.setScale(s, s, 1);
            const baseAlpha = Math.max(0, Math.min(255, Math.round(glowAlpha * this._glowIntensity)));
            const flickerAlpha = Math.max(0, Math.min(255, Math.round(baseAlpha * (0.75 + pulseWave * 0.25))));
            const c = this._glowSprite.color;
            this._glowSprite.color = new Color(c.r, c.g, c.b, flickerAlpha);
        }

        // 3Dモデルの拡縮パルス+マテリアルのemissiveScaleパルス(2Dのグローに相当する演出)。
        // 注意: builtin-standard.effectのemissive出力は emissive.rgb * emissiveScale であり、
        // マテリアル側のemissive(既定は黒 [0,0,0,1])が黒のままだとemissiveScaleをいくら上げても
        // 見た目には何も反映されない。光らせたい弾Prefabのマテリアルは、Cocos EditorのInspectorで
        // Emissiveプロパティを黒以外の色に設定しておく必要がある(コード側からは設定できない)。
        if (this._model3D && this._model3D.isValid) {
            const modelS = 1.0 + pulseWave * 0.08;
            this._model3D.setScale(
                this._modelBaseScale.x * modelS,
                this._modelBaseScale.y * modelS,
                this._modelBaseScale.z * modelS
            );
            if (this._modelMat) {
                const emissiveBright = (emissiveBase + pulseWave * emissiveAmplitude) * this._glowIntensity;
                this._modelMat.setProperty("emissiveScale", new Vec3(emissiveBright, emissiveBright, emissiveBright));
            }
        }

        if (this._arcActive) {
            // PMissileの初速アーク中は通常のHoming/Move処理を丸ごとバイパスし、2次関数に沿った
            // 位置を直接計算してセットする(applyArc()参照)。
            this.updateArcMotion(deltaTime);
        } else {
            // Homing Logic
            if (this.isHoming && this.target && this.target.isValid) {
                const tPos = this.target.position;
                const cPos = this.node.position;

                const dx = tPos.x - cPos.x;

                // Y方向は反転させない(進行方向の符号を維持、敵のhomingパターンと同じ考え方)。
                // ただしatan2(ySign, dx)のようにdxをそのまま使うと、ターゲットが横に遠いほど
                // 角度が水平(真横)へ潰れてしまう(ySignは常に大きさ1固定なのに対しdxは際限なく
                // 大きくなり得るため)。そこで「進行方向の真上/真下から最大何度まで傾けてよいか」を
                // 上限で頭打ちにし、どれだけXが離れていてもY方向の動きが消えないようにする。
                const ySign = this.velocity.y !== 0 ? Math.sign(this.velocity.y) : 1;
                const xSign = Math.sign(dx);
                const baseAngle = ySign * (Math.PI / 2); // 真上(+90°)または真下(-90°)
                const maxDeviation = (60 * Math.PI) / 180; // 真上/真下からの最大傾き(60度、これ以上は横に振らない)
                let desiredAngle = baseAngle - ySign * xSign * maxDeviation;

                // Steer current angle towards desired angle
                // Simple approach: rotate velocity vector
                let currentAngle = Math.atan2(this.velocity.y, this.velocity.x);

                // Normalize angles
                while (desiredAngle - currentAngle > Math.PI) desiredAngle -= Math.PI * 2;
                while (desiredAngle - currentAngle < -Math.PI) desiredAngle += Math.PI * 2;

                // Steer
                const maxSteer = this.steerForce;
                if (desiredAngle > currentAngle) {
                    currentAngle += Math.min(maxSteer, desiredAngle - currentAngle);
                } else {
                    currentAngle -= Math.min(maxSteer, currentAngle - desiredAngle);
                }

                // Update Velocity
                this.velocity.x = Math.cos(currentAngle) * this.speed;
                this.velocity.y = Math.sin(currentAngle) * this.speed;

                // Update Visual Angle
                this.node.angle = (currentAngle * 180 / Math.PI) - 90;
            }

            // Move
            this.node.getPosition(this._tempPos);

            const moveScale = deltaTime * 60;

            this._tempPos.x += this.velocity.x * moveScale;
            this._tempPos.y += this.velocity.y * moveScale;

            // Apply Scroll Speed (Only for Enemy Bullets/Objects)
            // Player bullets should travel independent of scroll speed (Arcade Style)。
            // ホーミング弾は除外する: 誘導の旋回方向(上/下/横)に関わらず速度の大きさを一定に保つため
            // (旋回コードは既にsin/cosで単位ベクトル化してspeed倍しているだけなので大きさは常に一定だが、
            // ここで無条件にスクロール分を加算すると下向き旋回時は速く/上向き旋回時は遅く見えてしまう)。
            // 直進弾はこれまで通りスクロールに乗せる(背景と一体に見せる演出として維持)。
            if (this.isEnemy && !this.isHoming && this._gm && this._gm.speedManager) {
                this._tempPos.y -= this._gm.speedManager.getCurrentSpeed() * moveScale;
            }

            this.node.setPosition(this._tempPos);
        }

        // Growth (WideBeam等、applyGrowth()が呼ばれた弾のみ)。経過時間(_growthLifeTotal - life、
        // まだ減算前のlifeなので発射直後は0)を_growthDuration(既定は寿命そのもの、それより短い値を
        // 渡されていれば拡大だけ先に完了させる)で割って進行度を出す。完了後はprogress=1のまま
        // (=最大サイズ)で寿命が尽きるまで留まる。_scaleMultiplierX/Yも更新しておく(残像の履歴記録・
        // 当たり判定サイズ同期双方の基準値として使う)。
        if (this._growthEnabled && this._growthLifeTotal > 0 && this._growthDuration > 0) {
            const elapsed = this._growthLifeTotal - this.life;
            const progress = Math.min(1, Math.max(0, elapsed / this._growthDuration));
            this._scaleMultiplierX = this._growthStartScaleX + (this._growthTargetScaleX - this._growthStartScaleX) * progress;
            this._scaleMultiplierY = this._growthStartScaleY + (this._growthTargetScaleY - this._growthStartScaleY) * progress;
            this.node.setScale(this._baseNodeScale.x * this._scaleMultiplierX, this._baseNodeScale.y * this._scaleMultiplierY, this._baseNodeScale.z);
            // 見た目が拡大していくのに当たり判定が元のサイズのまま取り残されるとヒットしなくなるため、
            // 毎フレームcollider.sizeもここで追従させる。
            this.syncColliderSize(this._scaleMultiplierX, this._scaleMultiplierY);
        }

        // Spin (ShockWave等、applySpin()が呼ばれた弾のみ)。Homing/Arcが同フレームでnode.angleを
        // 上書きしていてもその後に加算されるので、向きの制御とは競合しない。
        if (this._spinSpeed !== 0) {
            this.node.angle += this._spinSpeed * deltaTime;
        }

        // Trail(残像/分身)。本体の現在のworld位置・角度・スケール倍率(X/Y)を履歴バッファへ積み、
        // 各BulletTrailImage子ノードをdelayFrames分過去の状態へ追従させる(当たり判定には影響しない)。
        if (this._trailImages.length > 0) {
            this.node.getWorldPosition(this._tempWorldPos);
            this._trailHistoryX[this._trailWriteIndex] = this._tempWorldPos.x;
            this._trailHistoryY[this._trailWriteIndex] = this._tempWorldPos.y;
            this._trailHistoryAngle[this._trailWriteIndex] = this.node.angle;
            this._trailHistoryScaleX[this._trailWriteIndex] = this._scaleMultiplierX;
            this._trailHistoryScaleY[this._trailWriteIndex] = this._scaleMultiplierY;
            this._trailWriteIndex = (this._trailWriteIndex + 1) % Bullet.MAX_TRAIL_FRAMES;
            this._trailFilledCount = Math.min(Bullet.MAX_TRAIL_FRAMES, this._trailFilledCount + 1);

            for (const trail of this._trailImages) {
                if (!trail || !trail.isValid) continue;
                const delay = Math.max(1, Math.min(Bullet.MAX_TRAIL_FRAMES, trail.delayFrames));
                if (delay > this._trailFilledCount) continue; // 履歴がまだ足りない間はPrefab初期位置のまま
                const idx = (this._trailWriteIndex - delay + Bullet.MAX_TRAIL_FRAMES) % Bullet.MAX_TRAIL_FRAMES;
                const sx = this._trailHistoryScaleX[idx];
                const sy = this._trailHistoryScaleY[idx];
                trail.node.setWorldPosition(this._trailHistoryX[idx], this._trailHistoryY[idx], this._tempWorldPos.z);
                trail.node.angle = this._trailHistoryAngle[idx];
                trail.node.setWorldScale(this._baseNodeScale.x * sx, this._baseNodeScale.y * sy, this._baseNodeScale.z);
            }
        }

        // Life
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.node.destroy();
        }

        // Bounds Check (Simple)
        const margin = 50;
        if (this._tempPos.x < -GAME_SETTINGS.CANVAS_WIDTH / 2 - margin ||
            this._tempPos.x > GAME_SETTINGS.CANVAS_WIDTH / 2 + margin ||
            this._tempPos.y < -GAME_SETTINGS.CANVAS_HEIGHT / 2 - margin ||
            this._tempPos.y > GAME_SETTINGS.CANVAS_HEIGHT / 2 + margin) {
            this.node.destroy();
        }
    }

    /**
     * MaterialLabBulletInit.ts等、init()を疑似的に呼んで発光演出だけ確認したい側から寿命を
     * 上書きするための公開メソッド(lifeは通常の弾では毎回init()で3秒に固定されるprivateフィールド
     * のため、外から直接いじれない)。
     */
    public setLifeSeconds(seconds: number) {
        this.life = seconds;
    }

    /**
     * ShotRuntime.tsのFire/MultiFire/Missileノードから、生成直後(init()の後)に呼ばれる想定。
     * color/glowIntensity/scale(いずれもnullなら変更しない)で見た目を上書きする。
     * 未呼び出しなら従来通りisEnemyベースの既定色・既定の発光強度・Prefab等倍のまま。
     */
    public applyVisualOverride(color: Color | null, glowIntensity: number | null, scale: number | null = null) {
        const sprite = this.getComponent(Sprite);
        if (color) {
            this._baseColor = color;
            if (sprite) sprite.color = color;
        }
        if (glowIntensity != null && Number.isFinite(glowIntensity)) {
            this._glowIntensity = Math.max(0, glowIntensity);
        }
        if (scale != null && Number.isFinite(scale)) {
            // this.nodeを直接スケールするだけで、子(Glow/Model3D)にもCocosの親子継承で連動する。
            const s = Math.max(0.01, scale);
            this._scaleMultiplierX = s;
            this._scaleMultiplierY = s;
            this.node.setScale(this._baseNodeScale.x * s, this._baseNodeScale.y * s, this._baseNodeScale.z * s);
            this.syncColliderSize(s, s);
        }
        // 色/強度いずれかが変わった可能性があるので、グローSpriteの色を再計算する
        // (ensureGlowNodeは既存ノードがあれば新規生成せず色だけ更新する)。
        if (sprite) this.ensureGlowNode(sprite, this._baseColor);
    }

    /**
     * ShotRuntime.tsのgrowScaleX/Yパラメータから、生成直後(init()/applyVisualOverride()の後)に
     * 呼ばれる想定。現在のスケール倍率(_scaleMultiplierX/Y、既定1.0)を開始値として、
     * targetScaleX/Y倍まで線形に拡大していく(WideBeam等の拡散リング用)。
     * X/Yを別々に指定できるので、横幅だけ大きく広がるといった非均一な拡大も作れる
     * (均一に拡大したいだけなら同じ値を渡せばよい)。未呼び出しなら従来通り拡大せず、
     * applyVisualOverride()のscaleのまま固定。
     * growDurationSeconds未指定/0以下なら寿命(life)ぴったりで拡大しきる従来通りの挙動。
     * 寿命より短い値を渡すと、寿命(duration)自体は変えずに拡大だけ先に完了させ、
     * 残りの寿命は最大サイズのまま留まる(「durはそのままで拡がる速度を上げたい」場合用)。
     */
    public applyGrowth(targetScaleX: number, targetScaleY: number, growDurationSeconds: number = 0) {
        if (!Number.isFinite(targetScaleX) || targetScaleX <= 0 || !Number.isFinite(targetScaleY) || targetScaleY <= 0) return;
        this._growthEnabled = true;
        this._growthStartScaleX = this._scaleMultiplierX;
        this._growthStartScaleY = this._scaleMultiplierY;
        this._growthTargetScaleX = targetScaleX;
        this._growthTargetScaleY = targetScaleY;
        this._growthLifeTotal = this.life; // init()が既に3秒固定済みの前提(ShotRuntime.doFire()等はinit()の後に呼ぶ)
        this._growthDuration = (growDurationSeconds > 0) ? Math.min(growDurationSeconds, this.life) : this.life;
    }

    /**
     * ShotRuntime.tsのspinSpeedパラメータから、生成直後(init()の後)に呼ばれる想定。
     * 以後、寿命が尽きるまで毎フレームnode.angleにdegPerSecond*deltaTimeを加算し続ける
     * (ShockWave等、リングをその場で回転させ続ける演出用)。正で時計回り、負で反時計回り。
     * 未呼び出しなら従来通り回転せず、init()時点のangleのまま固定。
     */
    public applySpin(degPerSecond: number) {
        if (!Number.isFinite(degPerSecond)) return;
        this._spinSpeed = degPerSecond;
    }

    /**
     * ShotRuntime.tsのdoPMissilePellet()から、生成直後(init()の後)に呼ばれる想定。
     * lm/rm(自機後方の左右スラスター)から発射したミサイルが、2次関数
     * (coeffA*x^2 + coeffB*x + coeffC、xはduration秒かけて0→xRangeへ進む)に沿って
     * 「少し後方に膨らんでから前方へ抜ける」アークを描くようにする。この前後方向の式はL/Rで
     * 符号を変えない(左右対称)。sideは-1(左/lm)か+1(右/rm)で、横方向のオフセットにのみ使う。
     * duration秒経過後は通常の直進に戻り、homingAfter=trueならその時点でhomingTarget/homingTurnRateを
     * 使ってホーミングへ切り替わる(既存のisHoming/target/steerForceをそのまま使う)。
     */
    public applyArc(coeffA: number, coeffB: number, coeffC: number, xRange: number, worldScale: number, duration: number, side: number, exitSpeed: number, homingAfter: boolean, homingTarget: Node | null, homingTurnRate: number) {
        if (!Number.isFinite(duration) || duration <= 0) return;
        this._arcActive = true;
        this._arcElapsed = 0;
        this._arcDuration = duration;
        this._arcCoeffA = coeffA;
        this._arcCoeffB = coeffB;
        this._arcCoeffC = coeffC;
        this._arcXRange = xRange;
        this._arcWorldScale = worldScale;
        this._arcSide = side >= 0 ? 1 : -1;
        this._arcExitSpeed = exitSpeed;
        this._arcHomingAfter = homingAfter;
        this._arcHomingTarget = homingTarget;
        this._arcHomingTurnRate = homingTurnRate;
        this.isHoming = false; // アーク終了までホーミングは保留する

        Vec3.copy(this._arcLaunchPos, this.node.position);
        Vec3.copy(this._arcPrevWorldPos, this.node.position);

        // this.angle(init()で設定済みのラジアン、発射基準方向)を軸に、前方/横方向の単位ベクトルを作る。
        this._arcForwardAxis.x = Math.cos(this.angle);
        this._arcForwardAxis.y = Math.sin(this.angle);
        // ShotRuntime.doPMissilePellet()の符号と揃える(side=-1(L)で左(-X)、side=+1(R)で右)。
        this._arcLateralAxis.x = Math.sin(this.angle);
        this._arcLateralAxis.y = -Math.cos(this.angle);
    }

    // applyArc()で有効化された弾のみ、毎フレーム呼ばれる。2次関数上の位置を直接計算してセットし、
    // duration経過で直進(またはホーミング開始)へ引き継ぐ。
    private updateArcMotion(deltaTime: number) {
        this._arcElapsed += deltaTime;
        const t = Math.min(1, this._arcElapsed / this._arcDuration);
        const x = t * this._arcXRange;
        // 前後方向(forwardDist)の式はL/Rで符号を変えない(左右対称に同じだけ後方へ膨らんでから
        // 同じ速度で前進させるため)。左右の違いはlateralDist(横方向オフセット)の符号だけにする。
        const forwardDist = (this._arcCoeffA * x * x + this._arcCoeffB * x + this._arcCoeffC) * this._arcWorldScale;
        const lateralDist = x * this._arcWorldScale * this._arcSide;

        this._tempPos.x = this._arcLaunchPos.x + this._arcForwardAxis.x * forwardDist + this._arcLateralAxis.x * lateralDist;
        this._tempPos.y = this._arcLaunchPos.y + this._arcForwardAxis.y * forwardDist + this._arcLateralAxis.y * lateralDist;
        this._tempPos.z = this._arcLaunchPos.z;
        this.node.setPosition(this._tempPos);

        // 見た目の向きは前フレームからの移動方向(数式の形そのまま追従、係数を変えても常に正しい)。
        const dx = this._tempPos.x - this._arcPrevWorldPos.x;
        const dy = this._tempPos.y - this._arcPrevWorldPos.y;
        if (dx !== 0 || dy !== 0) {
            const facing = Math.atan2(dy, dx);
            this.node.angle = (facing * 180 / Math.PI) - 90;
        }
        Vec3.copy(this._arcPrevWorldPos, this._tempPos);

        if (t >= 1) {
            this._arcActive = false;
            // アーク終了時点の向きで直進速度を確定させる(以後は通常のMove処理が引き継ぐ)。
            const exitAngle = Math.atan2(dy, dx) || this.angle;
            this.velocity.x = Math.cos(exitAngle) * this._arcExitSpeed;
            this.velocity.y = Math.sin(exitAngle) * this._arcExitSpeed;
            if (this._arcHomingAfter && this._arcHomingTarget && this._arcHomingTarget.isValid) {
                this.isHoming = true;
                this.target = this._arcHomingTarget;
                this.steerForce = this._arcHomingTurnRate;
            }
        }
    }

    // 貫通の残り回数を消費する。0(通常)なら常にtrue(=このヒットで消滅)を返す。
    // -1(無限貫通)なら常にfalseを返す。N(残りヒット可能回数)ならデクリメントし、0になった時点でtrueを返す。
    private consumeHitAndCheckDestroy(): boolean {
        if (this.pierceRemaining === 0) return true;
        if (this.pierceRemaining < 0) return false; // 無限貫通
        this.pierceRemaining--;
        return this.pierceRemaining <= 0;
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        if (this.isEnemy) {
            // Check Hit Player
            let player = otherCollider.getComponent("PlayerController") as any;
            if (!player && otherCollider.node.parent) {
                player = otherCollider.node.parent.getComponent("PlayerController") as any;
            }

            if (player) {
                player.takeDamage(this.damage);
                if (this.consumeHitAndCheckDestroy()) {
                    this.scheduleOnce(() => {
                        if (this.node && this.node.isValid) {
                            this.node.destroy();
                        }
                    }, 0);
                }
            }
        } else {
            // Check Hit Enemy
            const enemy = otherCollider.getComponent("Enemy") as any;
            if (enemy) {
                enemy.takeDamage(this.damage);
                if (this.consumeHitAndCheckDestroy()) {
                    this.scheduleOnce(() => {
                        if (this.node && this.node.isValid) {
                            this.node.destroy();
                        }
                    }, 0);
                }
            }
        }
    }
}
