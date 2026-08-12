import { _decorator, Component, Node, Vec3, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, Sprite, Color, find, ParticleSystem2D, gfx, UITransform, tween, MeshRenderer, Material } from 'cc';
// import { Enemy } from './Enemy'; // Cycle
// import { PlayerController } from './PlayerController'; // Cycle
// import { GameManager } from './GameManager'; // Cycle
import { GAME_SETTINGS, IGameManager } from './Constants';
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

    // Player/Enemyと同じ規約: "Model3D"という名前の子ノードがPrefabに埋め込まれていれば、
    // 見た目を3Dモデルに差し替えつつ、簡単な演出(常時回転+発光パルス)を自動で掛ける。無ければ何もしない
    // (既存の2Dスプライトのみの弾Prefabには一切影響しない)。
    private _model3D: Node | null = null;
    private _modelBaseScale: Vec3 = new Vec3(1, 1, 1);
    // getMaterialInstance()は呼ぶたびに新規インスタンスを作り直しGPUバッチングを崩すため、
    // Model3D検出時に1回だけ取得してキャッシュする(以後はこのインスタンスのプロパティを毎フレーム書き換えるだけ)。
    private _modelMat: Material | null = null;

    onLoad() {
        const collider = this.getComponent(BoxCollider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
        Vec3.copy(this._baseNodeScale, this.node.scale);
    }

    // Init method called by GameManager or Shooter
    init(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, gm: IGameManager) {
        this._gm = gm;
        // console.log(`[Bullet] init: x=${x}, y=${y}, angle=${angle}, speed=${speed}`); // Reduce spam
        this.node.setPosition(x, y, 0);
        // プール再利用時に前回のapplyVisualOverride(scale)が残らないよう、毎回Prefab基準スケールに
        // リセットする(scaleパラメータ未指定のShotPatternからの発射ならこのまま等倍で使われる)。
        this.node.setScale(this._baseNodeScale.x, this._baseNodeScale.y, this._baseNodeScale.z);
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
            this.node.setScale(this._baseNodeScale.x * s, this._baseNodeScale.y * s, this._baseNodeScale.z * s);
        }
        // 色/強度いずれかが変わった可能性があるので、グローSpriteの色を再計算する
        // (ensureGlowNodeは既存ノードがあれば新規生成せず色だけ更新する)。
        if (sprite) this.ensureGlowNode(sprite, this._baseColor);
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
