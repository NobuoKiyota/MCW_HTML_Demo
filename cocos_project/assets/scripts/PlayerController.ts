import { _decorator, Component, Node, Input, input, EventTouch, Vec3, view, math, find, Enum, Prefab, instantiate, Color, MeshRenderer, Material } from 'cc';
import { DataManager } from './DataManager';
import { GAME_SETTINGS, IGameManager, GameState } from './Constants';
import { UIManager } from './UIManager';
import { BuffVisualEffect } from './BuffVisualEffect';
import { SoundManager } from './SoundManager';
import { GameDatabase } from './GameDatabase';
import { ShotRuntime } from './ShotRuntime';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ tooltip: "Current Speed (Read Only)" })
    public speed: number = 0;

    // Stats (Exposed for Tuning)
    @property({ tooltip: "Max HP" })
    public maxHp: number = 100;

    @property({ tooltip: "Base Max Speed (at Top Zone)" })
    public baseMaxSpeed: number = 6.0;

    @property({ tooltip: "Acceleration per frame" })
    public accel: number = 0.05;

    @property({ tooltip: "Brake Force per frame" })
    public brakeForce: number = 0.2;

    @property({ tooltip: "Friction (unused in Auto-Accel?)" })
    public friction: number = 0.98;

    @property({ tooltip: "Movement Smoothness (0.01 - 1.0)" })
    public lerpFactor: number = 0.1;

    // Shot Pattern (発射グラフ)
    @property({ tooltip: "使用する発射パターンID (ShotPatterns.csv/Master ManagerのShot Patternタブで編集)" })
    public shotPatternId: string = "SP_PLAYER_BASIC";

    // PlayerWeaponManager(デバッグ用、scene-BehaviorTest等)が指定するロードアウト全体の発射パターンID
    // (Weapons.csvのShotPatternID)を注入するための配列。@propertyではない(Inspectorで直接編集する
    // ものではなく、BehaviorTestController.beginTest()等がコード経由でsetOverrideShotPatternIds()を
    // 呼んで設定する想定)。空でなければshotPatternId(既定武器)は無視してこちらを全面的に使う
    // (足し算ではなく置き換え - 基本武器の単発連射が常時鳴り続けたまま追加武器のテストがしづらい、
    // という問題を避けるため)。空(全GroupがNone)ならshotPatternIdへフォールバックする。
    // waitForShotPattern()は毎リトライでこの配列を読み直すので、shotPatternIdの解決より後に
    // 設定されても(リトライ上限内であれば)拾える。
    public overrideShotPatternIds: string[] = [];

    public setOverrideShotPatternIds(ids: string[]) {
        this.overrideShotPatternIds = ids;
    }

    // 武器のLv別Scale成長(Weapons.csv ScaleMin/Max、WeaponCalc.computeWeaponLevelStats())を、
    // ShotPatternID単位でShotRuntimeに伝えるための倍率マップ。PlayerWeaponManager等が
    // setScaleMultipliers()で設定する。未設定のIDは1.0(無補正)として扱う。
    private _scaleMultByPatternId: Map<string, number> = new Map();

    public setScaleMultipliers(mults: { [shotPatternId: string]: number }) {
        this._scaleMultByPatternId = new Map(Object.entries(mults || {}));
    }

    // 武器のLv別WT(発射間隔)成長を、ShotPatternID単位でShotRuntimeに伝えるための倍率マップ。
    // WTMin基準の比率(WT@現在Lv ÷ WTMin)なので、Lv0では1.0(グラフ側のWait.secondsそのまま)、
    // Lvが上がるほどWTが小さくなる設計なら1.0未満になり連射が速くなる。
    // Rapid等の一時バフ(fireRateMultiplier)とは掛け算で両立する。
    private _intervalMultByPatternId: Map<string, number> = new Map();

    public setIntervalMultipliers(mults: { [shotPatternId: string]: number }) {
        this._intervalMultByPatternId = new Map(Object.entries(mults || {}));
    }

    // Speed Zone Params
    @property({ type: Enum({ STEP: 0, LINEAR: 1, SMOOTH: 2, EXP: 3 }), tooltip: "Speed Curve Type based on Y-Pos" })
    public speedCurveType: number = 0; // Default STEP

    @property({ tooltip: "Min Speed Ratio (at Bottom)" })
    public minSpeedRatio: number = 0.5;

    @property({ tooltip: "Max Speed Ratio (at Top)" })
    public maxSpeedRatio: number = 1.0;

    @property(Prefab)
    public powerBuffPrefab: Prefab = null;

    @property(Prefab)
    public rapidBuffPrefab: Prefab = null;

    // Audio Tuning
    @property({ tooltip: "Distance (px) for silence" })
    public audioVolDropoff: number = 800; // Far off-screen

    @property(Node)
    public model3D: Node = null;

    @property({ tooltip: "Banking Angle (Max)" })
    public maxBankingAngle: number = 30;

    public hp: number = 100;

    // 防御力(PlayerUpgrade.csvのDFパラメータ由来、既定0)。Enemy.takeDamage()の防御計算と
    // 同じ式(固定値減算、最低1ダメージは通す)をPlayer側にも適用する。Upgrade GUI実装時に
    // 現在Lvの値で更新される想定(既定0の間は無強化時と同じ挙動で変化なし)。
    public defense: number = 0;

    @property({ tooltip: "テスト用: trueの間は被弾してもダメージ処理を一切行わない" })
    public invincible: boolean = false;

    // 被弾後の無敵時間(フレーム数、GameManagerConfig.json由来のcontactInvincibleFrames)。
    // 弾ダメージ・Enemy機体接触ダメージ共通で適用する(takeDamage()参照)。0の間は無敵ではない。
    private _iframeCounter: number = 0;
    // 無敵中、model3Dの各パーツを真っ白に明滅させるためのトグルカウンタ/状態。
    private _blinkToggleCounter: number = 0;
    private _flashOn: boolean = false;
    private static readonly BLINK_INTERVAL_FRAMES = 2;

    // model3D配下の全MeshRendererのマテリアルインスタンスと、明滅前の元のemissive/emissiveScaleを
    // キャッシュしておく(初回被弾時に1度だけ収集)。真っ白フラッシュはemissiveを白+高いScaleに
    // 差し替えることで、albedoテクスチャの色に関わらず全体を白く発光させ、OFF時は元の値に戻す。
    private _flashMats: { mat: Material; origEmissive: Color; origEmissiveScale: Vec3 }[] = [];
    private _flashMatsReady: boolean = false;

    private targetPos: Vec3 = new Vec3();
    private currentPos: Vec3 = new Vec3();

    // Shot Pattern ランタイム。GameDatabase.isReady + 各パターンのグラフJSONロード完了を
    // 待ってから構築する(上限付きリトライ、BehaviorTestController.tsと同じパターン)。
    // overrideShotPatternIds(PlayerWeaponManager等が注入するロードアウト)が複数武器を同時に
    // 発射させうるため、単一ではなく配列で保持する。
    private _shotRuntimes: ShotRuntime[] = [];
    private _resolvedPatternIds: Set<string> = new Set();
    private _failedPatternIds: Set<string> = new Set();
    private _shotRuntimeRetryCount: number = 0;
    private static readonly SHOT_RUNTIME_MAX_RETRY = 300;

    // Cache GM
    private _gm: IGameManager = null;

    // Buff State
    public damageMultiplier: number = 1.0;
    public fireRateMultiplier: number = 1.0;
    public cargoDamagePenalty: number = 0;
    private buffPowerTimer: number = 0;
    private buffRapidTimer: number = 0;

    // Visuals (To be assigned or created)
    private powerEffectNode: Node = null;
    private rapidEffectNode: Node = null;

    // model3DのZ軸の基準姿勢(Prefab側でモデル差し替え時に設定された値)。バンキング演出は
    // 以前 setRotationFromEuler(0, nextRotation, 0) でX/Zを毎フレーム強制的に0へリセットして
    // おり、Prefab側でどんな基準Rotationを設定してもここで上書きされて消えていた。start()時に
    // 1度だけ読み取って保持し、以後はY軸(バンキング)だけをこの基準値に対して変化させる。
    // X軸はPrefab値をそのまま使わずGameManagerEditorのplayerShipBaseRotationXを基準にする
    // (下記start()/update()参照 - Yと同じ理由、Prefab側の値だとモデルの向きが誤っていたため)。
    private _model3DBaseRotZ: number = 0;
    // model3Dの基準スケール(Prefab側の値)。GameManagerEditorのplayerShipScaleMultiplierは
    // GameManager.loadGameManagerConfig()のresources.load()完了を待つ非同期値のため、
    // start()時点の1回きりのスナップショットだと「Playerのstart()の方が先に走ってしまい、
    // まだ既定値1のままだった」というタイミング競合で反映されないことがある(Remote Preview等、
    // resources.load()に数フレーム以上かかる環境で特に起きやすい)。そのためbaseScaleはstart()で
    // 1度だけ保持し、実際の倍率適用はupdate()で毎フレーム行い、_gm側の値が後から届いても
    // 自然に追従するようにしている。
    private _model3DBaseScale: Vec3 = null;
    private _appliedShipScaleMultiplier: number = null;

    public setup(gm: IGameManager) {
        this._gm = gm;
    }

    start() {
        if (this.model3D) {
            const e = this.model3D.eulerAngles;
            this._model3DBaseRotZ = e.z;
            this._model3DBaseScale = this.model3D.scale.clone();

            // X/Y軸はPrefab側の値をそのまま使わない。Prefab保存値だとモデルの向きが誤っていた
            // ため、GameManagerEditorのplayerShipBaseRotationX/Y(既定0/90度)を基準として直接
            // セットし、以後update()のバンキング計算もこの基準値からの相対角度として扱う
            // (下記参照)。ここで即座にセットしておかないと、初回フレームでPrefab側の値から
            // lerpで収束するまでの約1秒間、誤った向きのまま回転するアニメーションが見えてしまう。
            const baseX = (this._gm && typeof this._gm.playerShipBaseRotationX === 'number') ? this._gm.playerShipBaseRotationX : 0;
            const baseY = (this._gm && typeof this._gm.playerShipBaseRotationY === 'number') ? this._gm.playerShipBaseRotationY : 90;
            this.model3D.setRotationFromEuler(baseX, baseY, this._model3DBaseRotZ);
        }

        // Initialize Input
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);

        // Initial Pos
        this.node.getPosition(this.currentPos);
        this.targetPos.set(this.currentPos);

        this.loadStats();
        this.resetBuffs(); // Ensure clean state on retry/start

        // Load HP from DataManager
        if (DataManager.instance) {
            this.hp = DataManager.instance.data.hp;
            this.maxHp = DataManager.instance.data.maxHp;
        }

        // Init UI
        if (UIManager.instance) {
            UIManager.instance.updateHP(this.hp, this.maxHp);
        }

        this._shotRuntimeRetryCount = 0;
        this._shotRuntimes = [];
        this._resolvedPatternIds.clear();
        this._failedPatternIds.clear();
        this.waitForShotPattern();
    }

    // GameDatabase.isReady かつ各ShotPatternのグラフJSON非同期ロードが終わるまで待ってから
    // ShotRuntimeを構築する(BehaviorTestController.tsのwaitForDatabase()と同じ上限付きリトライ)。
    // overrideShotPatternIdsが空でなければそちらを全面的に使い(shotPatternIdは無視)、空なら
    // shotPatternId(既定装備)にフォールバックする。1つでも見つからない/読み込みきれないIDが
    // あっても他のIDの発射は止めない。
    private waitForShotPattern() {
        const db = GameDatabase.instance;
        const source = this.overrideShotPatternIds.length > 0 ? this.overrideShotPatternIds : [this.shotPatternId];
        const targetIds = Array.from(new Set(source.filter(id => id && id !== "None")));

        if (db && db.isReady) {
            for (const id of targetIds) {
                if (this._resolvedPatternIds.has(id) || this._failedPatternIds.has(id)) continue;

                const patternData = db.getShotPatternData(id);
                if (!patternData) {
                    // dbはready(ShotPatterns.csvを読み終えている)なのにこのIDが1件も無い
                    // = Shot Patternエディタでリネーム/削除された、またはタイプミス。
                    // 何度リトライしても絶対に見つからないので、30秒待たせず即座にエラーを出して諦める
                    // (このIDだけ諦めて他のIDのリトライは続ける)。
                    console.error(`[PlayerController] ShotPattern '${id}' が ShotPatterns.csv に存在しません(リネーム/タイプミスの可能性)。この武器は発射されません。`);
                    this._failedPatternIds.add(id);
                    continue;
                }
                if (!patternData._graph) continue; // _graph(JSON)の非同期ロードがまだ終わっていない。リトライで待つ。

                const runtime = new ShotRuntime(patternData._graph, this._gm, this.node, false);
                runtime.getSpeedMult = () => 1.0;
                runtime.getDamageMult = () => Math.max(0.1, this.damageMultiplier - this.cargoDamagePenalty);
                runtime.getIntervalMult = () => this.fireRateMultiplier * (this._intervalMultByPatternId.get(id) ?? 1.0);
                runtime.getScaleMult = () => this._scaleMultByPatternId.get(id) ?? 1.0;
                this._shotRuntimes.push(runtime);
                this._resolvedPatternIds.add(id);
                console.log(`[PlayerController] ShotRuntime ready for pattern '${id}'.`);
            }

            if (targetIds.every(id => this._resolvedPatternIds.has(id) || this._failedPatternIds.has(id))) return;
        }

        this._shotRuntimeRetryCount++;
        if (this._shotRuntimeRetryCount > PlayerController.SHOT_RUNTIME_MAX_RETRY) {
            const pending = targetIds.filter(id => !this._resolvedPatternIds.has(id) && !this._failedPatternIds.has(id));
            if (pending.length > 0) {
                console.error(`[PlayerController] ShotPattern [${pending.join(', ')}] の読み込みが ${PlayerController.SHOT_RUNTIME_MAX_RETRY} 回のリトライ後も完了しませんでした。諦めます。`);
            }
            return;
        }
        this.scheduleOnce(() => this.waitForShotPattern(), 0.1);
    }

    onDestroy() {
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    private loadStats() {
        console.log(`[Player] Stats Initialized. MaxSpeed: ${this.baseMaxSpeed}`);
    }

    private onMouseMove(event: any) {
        if (!this.canControl()) return;
        const uiLoc = event.getUILocation();
        this.updateTargetPos(uiLoc);
    }

    private onTouchMove(event: EventTouch) {
        if (!this.canControl()) return;
        const uiLoc = event.getUILocation();
        this.updateTargetPos(uiLoc);
    }

    private updateTargetPos(uiLoc: any) {
        // Player only ever operates in Ingame's world-space content (see canControl()),
        // where MainCamera sits centered on world (0,0) - screen center (640,360 in UI
        // pixels) maps to world (0,0). Previously this branched on whether the parent node
        // had a UITransform to decide between this math and convertToNodeSpaceAR(), but
        // that check stopped being reliable once the parent "Canvas" node picked up a
        // UITransform as a side effect of adding a real cc.Canvas component to it - passing
        // getUILocation()'s screen-pixel coordinates into convertToNodeSpaceAR() (which
        // expects a world position) produced incorrect, non-1:1 mouse tracking. Always use
        // the direct screen-to-world offset instead.
        const halfW = GAME_SETTINGS.SCREEN_WIDTH / 2;
        const halfH = GAME_SETTINGS.SCREEN_HEIGHT / 2;
        this.targetPos.x = uiLoc.x - halfW;
        this.targetPos.y = uiLoc.y - halfH;
        this.clampTarget();
    }

    private clampTarget() {
        const halfW = GAME_SETTINGS.CANVAS_WIDTH / 2;
        const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;

        if (this.targetPos.x < -halfW) this.targetPos.x = -halfW;
        if (this.targetPos.x > halfW) this.targetPos.x = halfW;
        if (this.targetPos.y < -halfH) this.targetPos.y = -halfH;
        if (this.targetPos.y > halfH) this.targetPos.y = halfH;
    }

    private canControl(): boolean {
        return this._gm && this._gm.state === GameState.INGAME && !this._gm.isPaused;
    }

    update(deltaTime: number) {
        // GameManagerEditorのplayerShipScaleMultiplierを毎フレーム適用する(_gm側の非同期JSON
        // 読み込みが完了するタイミングに関わらず追従させるため - 詳細は_model3DBaseScaleのコメント参照)。
        // 値が変化していない限りsetScale()自体は呼ばない(cloneやVec3計算を毎フレーム重ねない)。
        if (this.model3D && this._model3DBaseScale) {
            const mult = (this._gm && typeof this._gm.playerShipScaleMultiplier === 'number') ? this._gm.playerShipScaleMultiplier : 1;
            if (mult !== this._appliedShipScaleMultiplier) {
                this._appliedShipScaleMultiplier = mult;
                this.model3D.setScale(
                    this._model3DBaseScale.x * mult,
                    this._model3DBaseScale.y * mult,
                    this._model3DBaseScale.z * mult
                );
            }
        }

        if (!this.canControl()) return;

        // 被弾後の無敵時間(フレーム数)。canControl()が真の間(=INGAME中)のみ消費する。
        // 無敵中はmodel3Dを真っ白に明滅させ続け(BLINK_INTERVAL_FRAMESごとにON/OFFをループ)、
        // 無敵終了時は必ず通常の見た目に戻す。
        if (this._iframeCounter > 0) {
            this._iframeCounter--;
            this._blinkToggleCounter++;
            if (this._blinkToggleCounter >= PlayerController.BLINK_INTERVAL_FRAMES) {
                this._blinkToggleCounter = 0;
                this.setFlashWhite(!this._flashOn);
            }
            if (this._iframeCounter <= 0) {
                this.setFlashWhite(false); // 無敵終了時は必ず元の見た目に戻す
            }
        }

        // Buff Timers
        if (this.buffPowerTimer > 0) {
            this.buffPowerTimer -= deltaTime;
            this.updateBuffVisuals(); // Update UI/Bars every frame
            if (this.buffPowerTimer <= 0) {
                this.buffPowerTimer = 0;
                this.damageMultiplier = 1.0;
                this.updateBuffVisuals();
                console.log("[Player] Power Buff Expired");
            }
        }

        if (this.buffRapidTimer > 0) {
            this.buffRapidTimer -= deltaTime;
            this.updateBuffVisuals(); // Update UI/Bars every frame
            if (this.buffRapidTimer <= 0) {
                this.buffRapidTimer = 0;
                this.fireRateMultiplier = 1.0;
                this.updateBuffVisuals();
                console.log("[Player] Rapid Fire Buff Expired");
            }
        }

        // 1. Movement
        this.node.getPosition(this.currentPos);
        const nextX = math.lerp(this.currentPos.x, this.targetPos.x, this.lerpFactor);
        const nextY = math.lerp(this.currentPos.y, this.targetPos.y, this.lerpFactor);
        this.node.setPosition(nextX, nextY, 0);

        // Banking (3D Model Rotation)
        if (this.model3D) {
            const dx = nextX - this.currentPos.x;
            const baseX = (this._gm && typeof this._gm.playerShipBaseRotationX === 'number') ? this._gm.playerShipBaseRotationX : 0;
            const baseY = (this._gm && typeof this._gm.playerShipBaseRotationY === 'number') ? this._gm.playerShipBaseRotationY : 90;
            const targetRotation = baseY - dx * 15; // baseYを基準に左右バンキングだけ振れる
            const currentRotation = this.model3D.eulerAngles.y;
            const nextRotation = math.lerp(currentRotation, targetRotation, 0.1);
            this.model3D.setRotationFromEuler(baseX, nextRotation, this._model3DBaseRotZ);
        }

        // 2. Physics
        const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;
        let yRatio = (this.currentPos.y + halfH) / (GAME_SETTINGS.CANVAS_HEIGHT);
        yRatio = math.clamp01(yRatio);

        let zoneMult = this.minSpeedRatio;
        switch (this.speedCurveType) {
            case 0:
                if (this.currentPos.y > 100) zoneMult = this.maxSpeedRatio;
                else if (this.currentPos.y > -100) zoneMult = (this.maxSpeedRatio + this.minSpeedRatio) / 2;
                else zoneMult = this.minSpeedRatio;
                break;
            case 1: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, yRatio); break;
            case 2: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, (1 - Math.cos(yRatio * Math.PI)) * 0.5); break;
            case 3: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, yRatio * yRatio); break;
        }

        const targetMax = this.baseMaxSpeed * zoneMult;
        if (this.speed < targetMax) {
            this.speed += this.accel;
        } else {
            this.speed = math.lerp(this.speed, targetMax, 0.05);
        }

        // 3. Shooting: ShotRuntime(発射パターングラフ)に一任する。装備数ぶん(通常1、
        // PlayerWeaponManager経由の追加装備があればそれ以上)、それぞれ独立にtickする。
        for (const runtime of this._shotRuntimes) {
            runtime.tick(deltaTime, this.hp, this.maxHp);
        }

        // Manual orbit logic removed, now handled by BuffVisualEffect component
    }

    public applyBuff(type: string, duration: number, value: number) {
        if (type === "Power") {
            this.buffPowerTimer = duration;
            this.damageMultiplier = 1.0 + value;
            this.createBuffVisual("Power");
        } else if (type === "Rapid") {
            this.buffRapidTimer = duration;
            this.fireRateMultiplier = 1.0 - value;
            if (this.fireRateMultiplier < 0.1) this.fireRateMultiplier = 0.1;
            this.createBuffVisual("Rapid");
        }
        this.updateBuffVisuals();
    }

    public resetBuffs() {
        this.buffPowerTimer = 0;
        this.buffRapidTimer = 0;
        this.damageMultiplier = 1.0;
        this.fireRateMultiplier = 1.0;

        if (this.powerEffectNode) {
            this.powerEffectNode.destroy();
            this.powerEffectNode = null;
        }
        if (this.rapidEffectNode) {
            this.rapidEffectNode.destroy();
            this.rapidEffectNode = null;
        }
    }

    private createBuffVisual(type: string) {
        if (type === "Power") {
            if (!this.powerEffectNode) {
                if (this.powerBuffPrefab) {
                    // Defensive check: Ensure we are not instantiating the OptionsUI by mistake
                    if (this.powerBuffPrefab.name === "OptionsUI" || this.powerBuffPrefab.data.name === "OptionsUI") {
                        console.error("[PlayerController] OptionsUI prefab assigned to Power Buff slot! Ignoring.");
                        this.powerEffectNode = new Node("AIPowerEffect_Fallback");
                    } else {
                        this.powerEffectNode = instantiate(this.powerBuffPrefab);
                    }
                } else {
                    this.powerEffectNode = new Node("AIPowerEffect");
                    const effect = this.powerEffectNode.addComponent(BuffVisualEffect);
                    effect.starColor = new Color(255, 50, 50, 255);
                    effect.orbitRadius = 75;
                }
                this.node.addChild(this.powerEffectNode);
            }
            if (this.powerEffectNode) this.powerEffectNode.active = true;
        } else if (type === "Rapid") {
            if (!this.rapidEffectNode) {
                if (this.rapidBuffPrefab) {
                    // Defensive check
                    if (this.rapidBuffPrefab.name === "OptionsUI" || this.rapidBuffPrefab.data.name === "OptionsUI") {
                        console.error("[PlayerController] OptionsUI prefab assigned to Rapid Buff slot! Ignoring.");
                        this.rapidEffectNode = new Node("AIRapidEffect_Fallback");
                    } else {
                        this.rapidEffectNode = instantiate(this.rapidBuffPrefab);
                    }
                } else {
                    this.rapidEffectNode = new Node("AIRapidEffect");
                    const effect = this.rapidEffectNode.addComponent(BuffVisualEffect);
                    effect.starColor = new Color(0, 180, 255, 255);
                    effect.orbitRadius = 55;
                    effect.orbitSpeed = 900;
                }
                this.node.addChild(this.rapidEffectNode);
            }
            if (this.rapidEffectNode) this.rapidEffectNode.active = true;
        }
    }

    // model3D配下の全MeshRenderer(複数パーツで構成された機体モデル全体を対象)から
    // マテリアルインスタンスを1度だけ収集し、明滅前のemissive/emissiveScaleを保存しておく。
    // Bullet.tsのgetMaterialInstance()キャッシュと同じ理由(毎フレーム呼ぶとインスタンスが
    // 増殖しGPUバッチングを崩すため)、初回被弾時にのみ実行する。
    private ensureFlashMaterials() {
        if (this._flashMatsReady || !this.model3D) return;
        this._flashMatsReady = true;

        const renderers = this.model3D.getComponentsInChildren(MeshRenderer);
        for (const r of renderers) {
            const mat = r.getMaterialInstance(0);
            if (!mat) continue;
            const origEmissive = mat.getProperty('emissive', 0) as Color;
            const origScale = mat.getProperty('emissiveScale', 0) as Vec3;
            this._flashMats.push({
                mat,
                origEmissive: origEmissive ? origEmissive.clone() : new Color(0, 0, 0, 255),
                origEmissiveScale: origScale ? origScale.clone() : new Vec3(1, 1, 1),
            });
        }
    }

    // 被弾時の明滅演出。onにするとmodel3D全体のemissiveを白+高いScaleに差し替え、albedoの
    // 色に関わらず機体全体を真っ白に光らせる。offで各マテリアルの元のemissive/emissiveScaleへ戻す
    // (単純にmodel3D.activeを消すと「見えなくなる」だけで被弾したことが分かりづらいための対策)。
    private setFlashWhite(on: boolean) {
        this.ensureFlashMaterials();
        if (this._flashOn === on) return;
        this._flashOn = on;

        for (const entry of this._flashMats) {
            if (on) {
                entry.mat.setProperty('emissive', new Color(255, 255, 255, 255));
                entry.mat.setProperty('emissiveScale', new Vec3(3, 3, 3));
            } else {
                entry.mat.setProperty('emissive', entry.origEmissive);
                entry.mat.setProperty('emissiveScale', entry.origEmissiveScale);
            }
        }
    }

    private updateBuffVisuals() {
        if (this.powerEffectNode) this.powerEffectNode.active = (this.buffPowerTimer > 0);
        if (this.rapidEffectNode) this.rapidEffectNode.active = (this.buffRapidTimer > 0);

        if (UIManager.instance) {
            UIManager.instance.updateBuffs(this.buffPowerTimer, this.buffRapidTimer);
        }
    }

    public heal(amount: number) {
        this.hp += amount;
        if (this.hp > this.maxHp) this.hp = this.maxHp;

        if (DataManager.instance) {
            DataManager.instance.setHp(this.hp);
        }

        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);
    }

    public takeDamage(amount: number) {
        console.log(`[PlayerController] takeDamage called: amount=${amount}, canControl=${this.canControl()}, invincible=${this.invincible}, iframeCounter=${this._iframeCounter}`);

        if (!this.canControl()) return; // Guard for GameOver/Paused state
        if (this.invincible) return; // テスト用無敵: ダメージ処理を一切行わない
        if (this._iframeCounter > 0) return; // 被弾後の無敵時間中(弾・Enemy接触共通)

        if (SoundManager.instance) {
            SoundManager.instance.playSE('contactdamage', 'Player');
        }

        // 防御力計算(Enemy.takeDamage()と同じ式: 固定値減算、最低1ダメージは必ず通す)。
        const finalDamage = this.defense > 0 ? Math.max(1, amount - this.defense) : amount;

        this.hp -= finalDamage;
        if (this.hp < 0) this.hp = 0;

        if (DataManager.instance) {
            DataManager.instance.addDamageReceived(finalDamage);
        }

        if (this._gm && this._gm.playState) {
            this._gm.playState.damageReceived += finalDamage;
        }

        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);

        // 無敵時間開始(GameManagerConfig.jsonのcontactInvincibleFrames、既定5フレーム)。
        // 極端に短い値にすることで「弱い攻撃をわざと受けて無敵時間を稼ぐ」戦法を成立しにくくしている。
        this._iframeCounter = (this._gm && typeof this._gm.contactInvincibleFrames === 'number') ? this._gm.contactInvincibleFrames : 5;
        this._blinkToggleCounter = 0;
        console.log(`[PlayerController] takeDamage applied: hp=${this.hp}/${this.maxHp}, iframeCounter set to ${this._iframeCounter}, model3D=${this.model3D ? this.model3D.name : 'null'}`);

        if (this.hp <= 0) {
            this.scheduleOnce(() => {
                if (this._gm) this._gm.onGameOver();
                if (this.node && this.node.isValid) {
                    this.node.active = false;
                }
            }, 0);
        }
    }
}
