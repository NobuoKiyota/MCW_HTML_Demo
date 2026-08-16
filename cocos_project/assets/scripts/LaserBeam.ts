import { _decorator, Component, Node, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, ParticleSystem, Size, Vec2, Vec3, tween, Tween, Layers } from 'cc';
import { IGameManager } from './Constants';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

// init()の引数まとめ。開発が進むにつれoptionalパラメータが積み重なり位置引数が肥大化したため
// オブジェクト引数化した(Constants.tsのSpawnLaserBeamOptionsと同じ理由)。damage〜gmは必須、
// それ以外は省略時にinit()側の初期値のまま。
export interface LaserBeamInitOptions {
    damage: number;
    damageInterval: number;
    duration: number;
    length: number;
    width: number;
    isEnemy: boolean;
    gm: IGameManager;
    particleLengthScale?: number;
    fadeOutDuration?: number;
    modelSpinRate?: number;
    hitSoundId?: string;
}

// applyOrbit()の引数まとめ。radius/speedDegPerSecは必須、それ以外は省略時0(既存の挙動と同じ)。
export interface LaserBeamOrbitOptions {
    radius: number;
    speedDegPerSec: number;
    startAngleDeg?: number;
    offsetX?: number;
    offsetY?: number;
}

/**
 * 自機/敵に追従し続ける持続ビーム(ShotRuntime.tsのLaserノード用)。GameManager.spawnLaserBeam()が
 * ownerNode(発射元)の子として生成し、そのまま追従させる(通常のBullet.tsのような velocity移動は
 * 一切行わない)。接触している間、damageInterval秒おきにdamageを繰り返し与え続けるDPS方式。
 * duration秒経過で自己破壊する。
 *
 * 見た目は3D ParticleSystem(Model3Dと同じ規約: "Particle"という名前の子ノードがあれば自動検出して
 * 再生開始する)を想定しているが、必須ではない(無ければ当たり判定だけの透明ビームになる)。
 *
 * applyOrbit()を呼ぶと、ownerNodeを中心にorbitRadius/orbitSpeedで周り続ける「周回ブレード」として
 * 使える(SweapBlade等のCircle系武器用)。duration/damageIntervalはそのまま流用でき、非常に長い
 * durationを渡せば実質「武器を持っている間ずっと回り続けるコンパニオン」として振る舞う。
 */
@ccclass('LaserBeam')
export class LaserBeam extends Component {

    private damage: number = 0;
    private damageInterval: number = 0.1;
    private duration: number = 1.0;
    private isEnemy: boolean = false;
    private _gm: IGameManager = null;
    // ダメージが実際に入った瞬間に鳴らすヒット音(Sounds.csvのID)。ShotManagerのSoundは発射音
    // (ShotRuntime.playFireSound()、生成時に1回だけ)なので、それとは別に持つ。空文字なら鳴らさない
    // (既定、既存パターンへの影響なし)。damageInterval秒おきに接触中なら毎回鳴る想定
    // (SoundManager側のグループポリフォニー/クールダウンで実際の鳴りすぎは抑制される)。
    private _hitSoundId: string = "";

    private _collider: BoxCollider2D | null = null;
    private _particle: ParticleSystem | null = null;

    // 現在接触中の相手(PlayerController or Enemyコンポーネントを持つNode)の集合。
    // BEGIN_CONTACT/END_CONTACTで出入りを管理し、tickTimerが0になるたびここへ一括ダメージを与える。
    private _touching: Set<Node> = new Set();
    private _tickTimer: number = 0;
    private _lifeTimer: number = 999; // init()で確実に上書きされる想定(Bullet.tsのlife既定値と同じ考え方)

    // duration経過後、即破棄せずfadeOutDuration秒だけ猶予を持たせるためのフェード状態。
    // 新規パーティクルの発生と当たり判定はfade開始と同時に止め(それ以上増えない/当たらない)、
    // 既に発生済みのパーティクルは自身のColor Over Lifetime設定(Particle側で作る)に従って
    // 自然にフェードアウトしてから、猶予時間経過後にノードごと破棄する。
    private _fading: boolean = false;
    private _fadeTimer: number = 0;
    private _fadeOutDuration: number = 0.5;

    // ownerNodeを中心に周回する演出用(SweapBlade等のCircle系武器)。applyOrbit()が呼ばれた
    // インスタンスだけ有効になる(既定は無効、既存のLaser/固定ビーム用途には一切影響しない)。
    // 角度は毎フレームorbitSpeed(度/秒)だけ進め、cos/sinでownerNode基準のローカル座標に変換する
    // (このノード自体がownerNode直下のLaserBeamAnchorの子として追従しているので、ローカル座標を
    // 動かすだけで自機/敵の移動にも自動でついてくる)。
    private _orbitEnabled: boolean = false;
    private _orbitRadius: number = 0;
    private _orbitSpeed: number = 0; // degrees/sec
    private _orbitAngle: number = 0;
    // 周回の中心そのものをownerNode位置からローカル座標でずらすためのオフセット(既定0,0=真上に
    // 中心)。ownerNodeの見た目(3Dモデル等)が論理位置とズレている場合に、Player側を直さず
    // このビーム側だけで見た目を合わせたい時に使う。
    private _orbitOffsetX: number = 0;
    private _orbitOffsetY: number = 0;

    // Bullet.tsと同じ規約: "Model3D"という名前の子ノードがあれば、常時回転の演出を自動で掛ける
    // (ブレード等、gltfで作った3Dモデルをそのまま埋め込みたい場合用)。無ければ何もしない。
    // 回転軸はX(RotationX、ブレードが刃を立てて振り回るような見た目を想定)。速度(秒間回転数)は
    // init()のmodelSpinRateパラメータで決まるため、tween自体はonLoad()ではなくstartModelSpin()
    // (init()から呼ぶ)で仕込む。
    private _model3D: Node | null = null;
    private _modelSpinRate: number = 1.0; // rotations/sec

    onLoad() {
        this._collider = this.getComponent(BoxCollider2D);
        if (this._collider) {
            this._collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this._collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
        // Model3Dと同じ規約: "Particle"という名前の子ノードがあれば自動検出する。
        const particleNode = this.node.getChildByName("Particle");
        if (particleNode) {
            this._particle = particleNode.getComponent(ParticleSystem);
        }
        if (!this._particle) {
            this._particle = this.getComponentInChildren(ParticleSystem);
        }

        // Model3D検出のみここで行う("Model3D"という名前の子ノード)。実際の回転tweenは
        // init()でmodelSpinRateが判明してからstartModelSpin()で仕込む。
        const modelNode = this.node.getChildByName("Model3D");
        if (modelNode) {
            this._model3D = modelNode;
        }
    }

    // ownerNodeを中心にorbitRadius/orbitSpeedで周り続ける「周回ブレード」として使える(SweapBlade等の
    // Circle系武器用)。duration/damageIntervalはそのまま流用でき、非常に長いdurationを渡せば実質
    // 「武器を持っている間ずっと回り続けるコンパニオン」として振る舞う。詳細はapplyOrbit()参照。
    //
    // Model3Dの自転速度(RotationX、秒間何回転するか)を設定する。init()から呼ばれる想定。
    // プール再利用時に前回のtweenが二重に走らないよう、開始前に必ず既存のtweenを止める。
    private startModelSpin(rotationsPerSecond: number) {
        if (!this._model3D) return;
        // GameManager.spawnLaserBeam()はforceUILayer()でthis.node以下を再帰的にUI_2Dレイヤーへ
        // 強制する(init()呼び出しより前に実行済み)。UI_2DレイヤーはUIカメラ用で3D MeshRendererを
        // 描画対象に含まないため、Model3D配下だけはPlayerの3Dモデルと同じDEFAULTレイヤーに戻して
        // おかないと、どれだけscaleを大きくしても一切描画されない(毎回init()の度に呼ぶ必要がある:
        // forceUILayer()自体はGameManager側の処理なのでこちらからは1回きりでは防げないため)。
        this.setLayerRecursive(this._model3D, Layers.BitMask.DEFAULT);
        this._modelSpinRate = rotationsPerSecond;
        Tween.stopAllByTarget(this._model3D);
        if (this._modelSpinRate === 0) return; // 0回転/秒なら静止したまま(tweenを仕込まない)
        tween(this._model3D)
            .by(1.0, { eulerAngles: new Vec3(360 * this._modelSpinRate, 0, 0) } as any, { easing: "linear" })
            .repeatForever()
            .start();
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
     * GameManager.spawnLaserBeam()から生成直後に呼ばれる。length/widthでBoxCollider2Dのサイズを
     * 決める(ビームの根本がownerNodeの位置に来るよう、offsetをlength/2だけ前方にずらす - Bulletの
     * ような移動先の概念が無いので、自前で当たり判定の位置を合わせる必要がある)。
     * particleLengthScaleは、当たり判定側の座標系(length、px相当)とParticleSystemのシーン単位が
     * 一致しないため、length * particleLengthScaleをParticleのShapeModule.length(Cone形状の
     * 発生源の長さ)へ書き込むための変換係数。ShapeModule.lengthはCone形状専用のフィールドで、
     * 変更後に発生する新しいパーティクルにのみ反映される(既に飛んでいる分は変わらない) -
     * 持続ビームは発射中ずっとパーティクルを発生させ続けるので、init()時点で1回設定すれば
     * ビーム全体に反映される。Cone以外の形状やParticle未設定の場合は何もしない。
     * modelSpinRateはModel3D(あれば)のRotationX自転速度(秒間回転数、既定1.0=1秒で1回転、
     * 0=回転させない)。Model3Dが無いインスタンスでは何もしない。
     * hitSoundIdは、damageIntervalおきに実際にダメージが入った瞬間に鳴らすSounds.csvのID
     * (既定空文字=鳴らさない)。ShotRuntime.playFireSound()の発射音とは別物。
     */
    init(opts: LaserBeamInitOptions) {
        const { damage, damageInterval, duration, length, width, isEnemy, gm,
            particleLengthScale = 1.0, fadeOutDuration = 0.5, modelSpinRate = 1.0, hitSoundId = "" } = opts;

        this.damage = damage;
        this.damageInterval = Math.max(0.02, damageInterval);
        this.duration = Math.max(0.05, duration);
        this.isEnemy = isEnemy;
        this._gm = gm;
        this._fadeOutDuration = Math.max(0, fadeOutDuration);
        this._hitSoundId = hitSoundId || "";

        this._tickTimer = this.damageInterval;
        this._lifeTimer = this.duration;
        this._fading = false;
        this._fadeTimer = 0;
        this._touching.clear();
        this._orbitEnabled = false; // プール再利用時に前回のapplyOrbit()が残らないようにする

        if (this._collider) {
            this._collider.size = new Size(Math.max(0.01, width), Math.max(0.01, length));
            this._collider.offset = new Vec2(0, length / 2);
        }

        if (this._particle) {
            this._particle.node.active = true;
            if (this._particle.shapeModule) {
                this._particle.shapeModule.length = length * particleLengthScale;
            }
            this._particle.play();
        }

        this.startModelSpin(modelSpinRate);
    }

    /**
     * ShotRuntime.tsのorbitRadius/orbitSpeedパラメータから、init()の後に呼ばれる想定。
     * 以後、ownerNode(=このノードの親であるLaserBeamAnchorのさらに親)を中心にorbitRadius px、
     * orbitSpeed度/秒で周り続ける。startAngleDegは複数枚同時展開(OrbitCutter等)する際に
     * 均等配置するための初期角度オフセット用(360/枚数ずつずらして呼び出す想定)。
     * 呼ぶと同時にcollider.offsetは(0,0)にリセットする(通常のLaserの「前方に伸びるビーム」用
     * オフセットは周回ブレードには不要で、ノード自身の位置=周回軌道上の位置がそのまま当たり判定の
     * 中心になるため)。
     * offsetX/Yは周回の中心そのものをownerNodeのローカル座標からずらす(既定0,0)。ownerNodeの
     * 見た目(3Dモデル等)が論理位置とズレている場合に、Player側の3Dモデルを直さずここだけで
     * 見た目を合わせたい時に使う。
     */
    public applyOrbit(opts: LaserBeamOrbitOptions) {
        const { radius, speedDegPerSec, startAngleDeg = 0, offsetX = 0, offsetY = 0 } = opts;
        if (!Number.isFinite(radius) || radius < 0 || !Number.isFinite(speedDegPerSec)) return;
        this._orbitEnabled = true;
        this._orbitRadius = radius;
        this._orbitSpeed = speedDegPerSec;
        this._orbitAngle = startAngleDeg;
        this._orbitOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
        this._orbitOffsetY = Number.isFinite(offsetY) ? offsetY : 0;
        if (this._collider) this._collider.offset = new Vec2(0, 0);
        this.updateOrbitPosition();
    }

    private updateOrbitPosition() {
        const rad = this._orbitAngle * Math.PI / 180;
        this.node.setPosition(this._orbitOffsetX + Math.cos(rad) * this._orbitRadius, this._orbitOffsetY + Math.sin(rad) * this._orbitRadius, 0);
    }

    update(deltaTime: number) {
        if (this._gm && this._gm.isPaused) return;

        // 周回移動はfadeOut中も止めない(消える直前だけ急に静止すると不自然なため)。
        if (this._orbitEnabled) {
            this._orbitAngle += this._orbitSpeed * deltaTime;
            this.updateOrbitPosition();
        }

        if (this._fading) {
            this._fadeTimer -= deltaTime;
            if (this._fadeTimer <= 0) {
                this.destroySelf();
            }
            return;
        }

        this._lifeTimer -= deltaTime;
        if (this._lifeTimer <= 0) {
            this.beginFadeOut();
            return;
        }

        this._tickTimer -= deltaTime;
        if (this._tickTimer <= 0) {
            this._tickTimer += this.damageInterval;
            this.applyTickDamage();
        }
    }

    // duration経過時に呼ばれる。新規パーティクルの発生と当たり判定はここで即座に止め、以後
    // fadeOutDuration秒はノードを残したまま待つ(既に発生済みのパーティクルが、Particle側で
    // 設定したColor Over Lifetimeに従って自然にフェードアウトし切るための猶予)。
    private beginFadeOut() {
        this._fading = true;
        this._fadeTimer = this._fadeOutDuration;
        this._touching.clear();

        if (this._collider) this._collider.enabled = false;
        if (this._particle) this._particle.stopEmitting();

        if (this._fadeOutDuration <= 0) {
            this.destroySelf();
        }
    }

    private destroySelf() {
        // GameManager.spawnLaserBeam()は、Enemy.onBeginContact()の「相手ノードの親に
        // PlayerControllerが付いていればPlayer本体とみなす」誤判定を避けるため、このノードを
        // ownerNodeの直接の子にせず、何もコンポーネントを持たない中間アンカーノードの子として
        // 生成している。そのアンカーごと破棄しないと、発射のたびに空ノードが自機の下に
        // 残り続けてしまう(このノード単体をdestroy()するだけでは親のアンカーは残る)。
        const parent = this.node.parent;
        if (parent && parent.isValid && parent.name === "LaserBeamAnchor") {
            parent.destroy();
        } else {
            this.node.destroy();
        }
    }

    private applyTickDamage() {
        if (this.damage <= 0) return;
        let hitAny = false;
        for (const target of this._touching) {
            if (!target || !target.isValid) continue;
            if (this.isEnemy) {
                const player = target.getComponent("PlayerController") as any;
                if (player) { player.takeDamage(this.damage); hitAny = true; }
            } else {
                const enemy = target.getComponent("Enemy") as any;
                if (enemy) { enemy.takeDamage(this.damage); hitAny = true; }
            }
        }
        // 発射音(ShotRuntime.playFireSound())とは別に、実際にダメージが入った瞬間だけ鳴らす
        // ヒット音。1tickで複数体に同時ヒットしても1回だけ(音の重なりすぎを防ぐ)。
        if (hitAny && this._hitSoundId) {
            const group = this.isEnemy ? "Enemy" : "Player";
            SoundManager.instance.play3dSE(this._hitSoundId, this.node.worldPosition, group);
        }
    }

    // ヒット相手のNode自体(PlayerController/Enemyコンポーネントが直接付いている方)を集合のキーにする。
    // Bullet.tsのonBeginContact()と同じく、コライダーが子ノードに付いている構成にも対応するため、
    // 親ノードのコンポーネントもフォールバックで見る。
    private resolveTargetNode(otherCollider: Collider2D): Node | null {
        const compName = this.isEnemy ? "PlayerController" : "Enemy";
        if (otherCollider.getComponent(compName)) return otherCollider.node;
        if (otherCollider.node.parent && otherCollider.node.parent.getComponent(compName)) return otherCollider.node.parent;
        return null;
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const target = this.resolveTargetNode(otherCollider);
        if (target) this._touching.add(target);
    }

    onEndContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const target = this.resolveTargetNode(otherCollider);
        if (target) this._touching.delete(target);
    }

    onDestroy() {
        if (this._collider) {
            this._collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this._collider.off(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
        this._touching.clear();
    }
}
