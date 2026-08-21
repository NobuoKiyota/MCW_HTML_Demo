import { _decorator, Component, Node, Label, Prefab, instantiate, director, Vec3, Vec4, Color, game, Game, resources, UITransform, Sprite, BoxCollider2D, LabelOutline, tween, v3, UIOpacity, BlockInputEvents, Graphics, Size, CCInteger, CCFloat, Camera, DirectionalLight, Light, Vec3 as Vec3Type, Layers, Canvas, JsonAsset, Animation, AnimationClip } from 'cc';
import './enginePatches';
import { UIManager } from './UIManager';
import { OptionsUI } from './OptionsUI';
import { GameState, GAME_SETTINGS, IGameManager, SpawnLaserBeamOptions, BG_ONLY_LAYER, ENEMY_ONLY_LAYER, FG_CLOUD_LAYER } from './Constants'; // Removed Constants
import { SoundManager } from './SoundManager';
import { GameSpeedManager } from './GameSpeedManager';
import { GameDatabase } from './GameDatabase';
import { ResultUI } from './ResultUI'; // Import Added Here
import { DataManager, getCurrentGridData } from './DataManager';
import { CocosLogger } from './CocosLogger';
import { CocosDiagnostic } from './CocosDiagnostic';
import { MovePoint } from './MovePoint';
import { StarField } from './StarField';
import { GoalWarningEffect } from './GoalWarningEffect';
import { RemainDistanceHUD } from './RemainDistanceHUD';
import { resolveEquippedLoadout } from './WeaponCalc';
import { SkyManager } from './SkyManager';


const { ccclass, property } = _decorator;

// Dedicated layer for background-only content (BackgroundLayer/StarField), separate from
// UI_2D. Cocos's 2D UI batcher always draws after (on top of) 3D opaque content regardless
// of Z position - if the background stayed on UI_2D, MainCamera would keep redrawing it over
// the Player's 3D ship no matter how the ship's Z was adjusted. Giving background content its
// own layer lets a dedicated, lower-priority BackgroundCamera draw it first, while MainCamera
// (which no longer includes this bit in its visibility) draws the 3D ship and remaining UI_2D
// content on top without re-drawing the background itself.
// (BG_ONLY_LAYER自体はConstants.tsからimport - BackgroundStudioUI.ts等、GameManager以外からも
// 参照する必要が生じたため、ENEMY_ONLY_LAYER/FG_CLOUD_LAYERと同じ場所に集約した)

// SpawnTableData.cycle (Instant/Rapid/Normal/Slow, see MasterManager's Cycle dropdown) ->
// seconds between each individual spawn within one spawnFromSpawnTable() call. Named presets
// instead of a hand-typed seconds value in the CSV, so pacing stays consistent across many
// SpawnTable rows instead of drifting row-by-row (e.g. someone typing 0.3 in one row and 3
// in another by mistake).
const CYCLE_INTERVAL_SECONDS: { [key: string]: number } = {
    Instant: 0,
    Rapid: 0.15,
    Normal: 0.4,
    Slow: 0.8,
};

@ccclass('GameManager')
export class GameManager extends Component implements IGameManager {

    public static instance: GameManager = null;

    // 時間ボーナス判定のノーカウント範囲(秒)。目標タイムとの差がこの範囲内ならボーナス/ペナルティ
    // 無し(onMissionComplete()参照)。シビアすぎるという指摘を受けて追加。
    private static readonly TIME_BONUS_MARGIN_SEC = 2.0;

    @property(Label)
    public debugLabel: Label = null;

    @property(Prefab)
    public titlePrefab: Prefab = null;

    @property(Prefab)
    public homePrefab: Prefab = null;

    @property(Prefab)
    public ingamePrefab: Prefab = null;

    @property(Prefab)
    public bulletPrefab: Prefab = null;

    // Prefabs/Bullets 配下から名前で引ける弾のPrefabリスト(GameDatabase.enemyPrefabsと同じ方式)。
    // ShotRuntime.tsのFire/MultiFire/MissileノードのprefabNameパラメータで見た目を選べるようにする。
    // 未指定/該当なしの場合はbulletPrefab(既定)にフォールバックする。
    public bulletPrefabs: Prefab[] = [];
    // resources.loadDir("Prefabs/Bullets", ...)完了フラグ。onLoad()からTitle/Homeを経由する通常
    // フローでは十分先に完了するが、scene-BehaviorTest/scene-MaterialLabのようにGameManagerの
    // onLoad()直後に即発射が始まるテスト用シーンだと、この非同期ロードが終わる前に最初の数発が
    // 発射されてしまうことがある(prefabName指定があっても見つからずbulletPrefab既定に化ける)。
    // spawnBullet()側でこのフラグを見て、未完了ならその発射をスキップする(誤った見た目の弾が
    // 出るくらいなら、起動直後の数発だけ発射をスキップする方がまだ違和感が少ないため)。
    private bulletPrefabsReady: boolean = false;

    // Prefabs/Lasers 配下から名前で引けるレーザービームのPrefabリスト(bulletPrefabsと同じ方式)。
    // 通常のBullet(飛んでいく弾)とは別物 - LaserBeamコンポーネント付きの、自機に追従し続ける
    // 持続ビーム用Prefab。ShotRuntime.tsのLaserノードから使う。
    public laserPrefabs: Prefab[] = [];
    private laserPrefabsReady: boolean = false;

    // アイテムごとの専用Prefab(GameDatabase.getItemPrefab()、Prefabs/ItemParts)が見つからなかった
    // 場合にのみ使う汎用フォールバック。未割り当てなら即席の無地四角(spawnItem()参照)まで落ちる。
    @property(Prefab)
    public itemPrefab: Prefab = null;

    @property(GameDatabase)
    public gameDatabase: GameDatabase = null;

    // GOAL到達時、Playerのアクロバット退場演出(triggerPlayerAerobaticOutro())で再生する
    // AnimationClip(任意)。Cocos純正のAnimation Editorでカーブ/イージング/継続回転を
    // 視覚的に調整できるようにするための差し込み口。未割り当てなら簡易tween版にフォールバックする。
    @property(AnimationClip)
    public playerOutroClip: AnimationClip = null;

    // ミッション開始時、Playerの軽い登場演出として再生するAnimationClip(任意)。playerOutroClipと
    // 同じPlayer上のAnimationコンポーネントを共有する(defaultClipを都度差し替えて再生するだけなので、
    // Inspector上でどちらが「Default Clip」になっていても実行時の挙動には影響しない)。
    // ノンブロッキングで再生する(入力停止はしない)ため、position/rotationはPlayerController側の
    // 毎フレームのマウス追従/バンク処理と同じプロパティを取り合ってしまう - クリップ側はscaleの
    // ポップインや、パーティクル子ノードのactive切り替えなど「操作と競合しないプロパティ」だけを
    // キーフレームすること(詳細はplayPlayerStartAnimation()のコメント参照)。
    @property(AnimationClip)
    public playerStartClip: AnimationClip = null;

    public state: GameState = GameState.TITLE;
    public score: number = 0;
    public isPaused: boolean = false;
    public isDebug: boolean = false;

    @property({ tooltip: "行動パターン検証用テストシーン専用フラグ: trueの間は自動スポーン/ミッション距離カウントダウンを止める" })
    public testMode: boolean = false;

    // References to current scene objects
    public playerNode: Node = null;
    public bulletLayer: Node = null;
    public enemyLayer: Node = null;
    public itemLayer: Node = null; // Add ItemLayer ref

    // BehaviorGraphのMoveToノードが参照するEnemyMovePoint(EMP)。id -> ローカル座標(enemyLayerと同じ空間)。
    // Ingameプレハブ/シーン内の "MovePoints" コンテナ配下に置かれたMovePointコンポーネント付きノードから
    // resolveInGameReferences() が起動時に収集する。
    public movePoints: Map<string, Vec3> = new Map();

    // Managers
    public speedManager: GameSpeedManager = new GameSpeedManager();

    // Spawn Logic
    private spawnTimer: number = 0;
    private frameCount: number = 0; // For performance check or periodic log

    // 距離トリガー式の敵湧きキュー(BehaviorTestController.tsの_missionSpawnQueueと同じ役割)。
    // currentMission.spawnTableIdsが設定されている(MissionUI経由の本番ミッション)場合のみ
    // startInGame()で組み立てられ、update()がplayState.distanceと突き合わせて発火させる。
    // キューが1件以上ある間は、下の継続タイマー式ランダム湧き(spawnEnemy())を止める
    // (両方同時に湧かせると、マージン区間が本来の「静かな区間」にならないため)。
    private _missionSpawnQueue: { id: string; triggerAtDistance: number; fired: boolean }[] = [];

    // GOAL接近演出(残り100km時のGUI予告)を1ミッション中1回だけ出すためのフラグ。
    // startInGame()でミッションごとにリセットする。
    private _goalApproachShown: boolean = false;

    // resolveInGameReferences()が収集する背景StarFieldのコンポーネント参照。
    // GOAL到達時などにtriggerBurst()を呼んで一時的に「集中線」演出を出すために使う。
    private starField: StarField = null;

    // GOAL接近中(残り100km以下)にPlayerへ重ねる警告オーラのノード(showGoalWarning()が生成、
    // playerNodeの子として自動追従する)。playerNode自体がミッションごとに再生成されるため、
    // 明示的にhideGoalWarning()を呼ぶ箇所(outro開始時/Home・Title遷移時)以外でも
    // ノードごと自然に破棄される。
    private goalWarningNode: Node = null;

    // resolveInGameReferences()が収集する残り距離HUD(RemainDistanceノード)。
    // GameManagerのisPausedに関わらず明滅させ続けたいので、専用コンポーネントに委譲する。
    private remainDistanceHUD: RemainDistanceHUD = null;

    // showGoalText()が生成したGOAL!!テキストノード。outro完了後にfinishGoalSequence()側で
    // 破棄する必要があるため、生成元と破棄元が別メソッドになった分の橋渡しとして保持する。
    private _goalTextNode: Node = null;

    // InGame State (Distance, etc)
    private missionStartHp: number = 100;
    public playState: any = {
        distance: 3000,
        enemies: [],
        items: [],
        killedEnemies: 0,
        totalEnemiesSpawned: 0, // 敵全滅ボーナス判定用(killedEnemies>=totalEnemiesSpawned)
        collectedItemsCount: 0,
        elapsedTime: 0,
        damageDealt: 0,    // New
        damageReceived: 0, // New
        itemsList: []      // New: {id, name, amount, rare}
    };

    public currentMission: any = null;
    public missionDistance: number = 3000;

    // Current Active Content Node (Title or Ingame)
    private currentContentNode: Node = null;

    // Ingame(startInGame経由でscene-BehaviorTestも共有)のMP4背景。BackgroundLayerの静止画に
    // 代わり、BG_ONLY_LAYER(UI_2Dではない)に敷くことでbgCameraだけが描画する - Player3Dモデルを
    // 隠してしまわないようにするため。切り替えのたびswitchContent()内でdestroy()して作り直す。
    // Ingame背景(縦スクロールタイル)。ミッションごとにresolveInGameReferences()で作り直す
    // (CloudManagerと同じ、Editor側のPrefab編集は不要)。

    // GameManagerEditor(MasterManagerパネル)経由でassets/resources/Data/GameManagerConfig.json
    // から読み込む倍率。PlayerController.update()がPlayer機3Dモデルの基準スケールに掛ける
    // (IGameManager経由で公開 - Constants.ts参照)。JSON読み込み完了前にPlayerが生成された
    // 場合の安全な既定値として1のまま(PlayerController側は毎フレーム再適用するので、後から
    // この値が更新されても自然に反映される)。
    public playerShipScaleMultiplier: number = 1;
    // Player機3DモデルのX/Y軸基準角度(度)。既定X=0/Y=90 - Prefab保存値だとモデルの向きが
    // 誤っていたための修正(PlayerController.ts参照)。
    public playerShipBaseRotationX: number = 0;
    public playerShipBaseRotationY: number = 90;

    // WASD/矢印キー移動速度(OptionsUIのKeySpeedSlider)がユーザーに許容する範囲(px/秒)。
    // OptionsUI.ts側にハードコードしていた定数をここへ移し、GameManagerEditorから調整できる
    // ようにした(マウスのtargetPos瞬間移動+lerpに対し、WASDは一定速度でtargetPosを動かす
    // だけなので、上限を上げないとマウス操作より体感が遅くなる問題への対応)。
    public keySpeedMin: number = 200;
    public keySpeedMax: number = 2000;

    // 弾(自機/敵とも共通、Bullet.ts)の発光パルス基礎値。既定値はBullet.ts実装時の固定値と同じ。
    // IGameManager経由でBullet.update()が毎フレーム参照する(Constants.ts参照)。
    public bulletPulseSpeed: number = 6;
    public bulletGlowScale: number = 1.7;
    public bulletGlowScalePulse: number = 0.25;
    public bulletGlowAlpha: number = 160;
    public bulletEmissiveBase: number = 0.6;
    public bulletEmissiveAmplitude: number = 0.4;

    // ミッション生成(MissionManager実装予定)が、一度選んだ同一SpawnTable IDをその後何回ぶんの
    // 抽選から除外するか(ローテーション式クールダウン、経過後は再び候補に復帰する。1ミッション内
    // の総出現回数に上限は無い)。GameManagerConfig.json由来、GameManagerEditorタブで調整する
    // (GlobalRule扱い)。
    public missionMaxDuplicateSpawnTable: number = 2;
    // Mission関連パラメータ(仮実装、BehaviorTestController.tsのMission仮生成が参照)。
    // 既定値はGameManagerConfig.jsonが未ロードの間に使う安全値。
    public missionMarginStartKm: number = 15;
    public missionMarginEndKm: number = 15;
    public missionAssumedMaxSpeedKmPerMin: number = 600;
    public missionTargetSpeedRatio: number = 0.5;
    public missionCargoWeightBaseMin: number = 30;
    public missionCargoWeightBaseMax: number = 50;
    public missionCargoWeightPerLv: number = 10;
    public missionCargoPriceBase: number = 30;
    public missionCargoPricePerLv: number = 20;
    public missionBonusStepSeconds: number = 2;
    public missionBonusPercentPerStep: number = 2;
    public missionBonusCapPercent: number = 20;
    public missionPenaltyFloorPercent: number = 50;
    // Player被弾後の無敵時間(フレーム数、弾・Enemy機体接触共通)。PlayerController.tsが参照する。
    public contactInvincibleFrames: number = 5;
    // Upgrade GUI(実装予定)のReset返金割合(%)とTN→lerpFactor変換除数。
    public resetRefundPercent: number = 80;
    public tnLerpDivisor: number = 600;
    // PlayerUpgradeManagerのLv別プレビューと同じコスト計算の校正値(単一の情報源)。
    public upgradeCostUnitScale: number = 1.9;
    public missionEarlyBaselineCredits: number = 1500;
    public missionLateBaselineCredits: number = 50000;
    public upgradeButtonFontSize: number = 24;
    public upgradeNoticeFontSize: number = 16;
    public upgradeSharedInfoFontSize: number = 24;
    // 初回起動(セーブ未作成)時のみDataManagerへ適用する初期保有クレジット。既存セーブには
    // 影響しない(GameManagerConfig.json由来、GameManagerEditorタブで調整)。
    public initialCredit: number = 0;

    // 旧: Ingame背景(スクロール/スカイ)のパラメータをここに個別で持っていたが、SkyManager統合に
    // 伴い廃止した。スカイ/動画/星/雲の全設定は SkyManager.ts が assets/resources/Data/SkyConfig.json
    // から直接読み込み保持する(Master Managerの「🌌 SkyManager」タブ経由で編集)。GameManager側で
    // 別の値を毎フレーム上書きすると、SkyConfig.jsonでの調整が反映されなくなるため持たない。

    // Single persistent camera, owned exclusively by GameManager. Never searched-for,
    // reactivated, or recreated per content switch - see applyCameraForState().
    private mainCamera: Camera = null;

    // Dedicated background-only camera, lower priority than mainCamera so it draws first.
    // See BG_ONLY_LAYER for why this exists - Cocos's 2D UI batcher always draws over 3D
    // content regardless of Z, so the space background needs its own render pass ahead of
    // the Player's 3D ship instead of sharing mainCamera's UI_2D pass.
    private bgCamera: Camera = null;

    // Dedicated DEFAULT-layer (3D) camera, HIGHER priority than mainCamera so it draws
    // LAST. Same root cause as bgCamera but on the other end: mainCamera's own UI_2D pass
    // draws after its own 3D pass within a single camera, so any UI_2D content (HUD panels,
    // enemies, etc.) that visually overlaps the Player's 3D ship would occlude it again -
    // this was already observed once with the background and is expected to recur with any
    // other UI_2D element. Moving all DEFAULT-layer 3D content to its own camera drawn after
    // mainCamera guarantees it always renders on top, regardless of what UI_2D content
    // happens to overlap it on screen.
    private foregroundCamera: Camera = null;

    // ENEMY_ONLY_LAYER専用カメラ(Enemyの3Dモデルのみ描画)。Playerと同居していたDEFAULTレイヤーから
    // Enemyを分離し、雲の前景レイヤーをEnemyとPlayerの間に挟めるようにするための新カメラ。
    private enemyCamera: Camera = null;

    // FG_CLOUD_LAYER専用カメラ("薄い"/"程よく薄い"雲層のみ描画)。Enemy/Bullet/UIより手前、
    // Playerより奥に描画する。
    private cloudFrontCamera: Camera = null;

    // Ingame背景一元統合マネージャ(スカイ・動画・星・雲を一括制御)
    private skyManager: SkyManager = null;

    onLoad() {
        console.log("[GameManager] onLoad triggered.");
        if (!GameManager.instance || !GameManager.instance.isValid) {
            GameManager.instance = this;
            console.log("[GameManager] Singleton initialized.");
        } else if (GameManager.instance !== this) {
            // Check for dummy hijacking
            if (GameManager.instance.node.name.includes("Dummy")) {
                console.log("[GameManager] Hijacking singleton from Dummy node.");
                const oldNode = GameManager.instance.node;
                GameManager.instance = this;
                oldNode.destroy();
            } else {
                console.warn("[GameManager] Duplicate valid instance found, destroying this component.");
                this.destroy(); // Destroy component only, not node
                return;
            }
        }

        // Force this node to (0,0,0) to avoid world-space offsets
        this.node.setPosition(0, 0, 0);

        // Initialize AI Bridge Telemetry & Diagnostics
        CocosLogger.initGlobalHook();
        if (!this.node.getComponent(CocosDiagnostic)) {
            this.node.addComponent(CocosDiagnostic);
        }

        // マウスのtargetPos追従はcanvas範囲内でしかMOUSE_MOVEが発火しないため、カーソルが
        // ウィンドウ外に出るとPlayerControllerが無反応になる(弾幕を避けている最中だと致命的)。
        // ウィンドウ/タブがフォーカスを失った瞬間(Game.EVENT_HIDE、Web/Electron/ネイティブ
        // 共通でCocosが検知してくれる)にIngame中ならOptionsUIを強制的に開いて一時停止する
        // ことで、「操作不能なまま被弾し続ける」事故を防ぐ(toggle()ではなくensureOpen()を使い、
        // 既に開いている場合に誤って閉じないようにする)。
        game.on(Game.EVENT_HIDE, this.onGameHide, this);

        console.log("[GameManager] onLoad completed. Ready for start.");

        this.speedManager.reset();

        // ensure scene basic setup (lighting & camera) in case it was corrupted or missing
        this.ensureSceneSetup();

        this.loadGameManagerConfig();
        this.loadBulletConfig();

        // アイテムのPrefabはGameDatabase.itemPrefabs(Prefabs/ItemParts一括ロード、Items.csvの
        // PrefabNameで突き合わせ)から取得する(spawnItem()参照)。itemPrefabはそれが見つからない
        // 場合の手動フォールバック用に残すのみで、ここでの自動ロードは行わない。

        // 弾の見た目バリエーション(Prefabs/Bullets)を読み込む。1件も無くても既定のbulletPrefabで
        // 動作するので、フォルダが空/未作成でもエラー扱いにはしない。
        resources.loadDir("Prefabs/Bullets", Prefab, (err, assets) => {
            if (err) {
                console.log("[GameManager] No Prefabs/Bullets folder found (optional) - using bulletPrefab only.");
                this.bulletPrefabsReady = true;
                return;
            }
            this.bulletPrefabs = assets;
            this.bulletPrefabsReady = true;
            console.log(`[GameManager] Loaded ${assets.length} Bullet Prefab variant(s) from resources/Prefabs/Bullets.`);
        });

        // レーザービーム用Prefab(Prefabs/Lasers)を読み込む。1件も無ければLaserノードは
        // spawnLaserBeam()側で警告を出すだけに留める(bulletPrefabのような既定フォールバックは無い -
        // ビジュアルが全く異なるPrefabを間違えて使うより、出さない方がまだ違和感が少ないため)。
        resources.loadDir("Prefabs/Lasers", Prefab, (err, assets) => {
            if (err) {
                console.log("[GameManager] No Prefabs/Lasers folder found (optional) - Laser nodes will not fire until one exists.");
                this.laserPrefabsReady = true;
                return;
            }
            this.laserPrefabs = assets;
            this.laserPrefabsReady = true;
            console.log(`[GameManager] Loaded ${assets.length} Laser Prefab variant(s) from resources/Prefabs/Lasers.`);
        });

        // Scene Transition Listeners
        director.on("GAME_RETRY", this.retryGame, this);
        director.on("GAME_TITLE", this.goToTitle, this);
        director.on("GAME_HOME", this.goToHome, this);
    }

    /**
     * Ensures basic lighting and camera settings exist in the scene (DirectionalLight + blue clear color).
     * Called during onLoad when recovering from a corrupted or cloned scene.
     */
    private ensureSceneSetup() {
        const scene = director.getScene();
        if (!scene) return;

        // Single persistent MainCamera - create once if missing, never again after that.
        // All position/visibility configuration happens in applyCameraForState().
        let camNode = scene.getChildByName("MainCamera");
        if (!camNode) {
            console.log("[GameManager] Creating missing MainCamera.");
            camNode = new Node("MainCamera");
            camNode.addComponent(Camera);
            scene.addChild(camNode);
        }
        this.mainCamera = camNode.getComponent(Camera);

        // Dedicated background-only camera - create once if missing, never again after that.
        let bgCamNode = scene.getChildByName("BackgroundCamera");
        if (!bgCamNode) {
            console.log("[GameManager] Creating missing BackgroundCamera.");
            bgCamNode = new Node("BackgroundCamera");
            bgCamNode.addComponent(Camera);
            scene.addChild(bgCamNode);
        }
        this.bgCamera = bgCamNode.getComponent(Camera);

        // Dedicated foreground (DEFAULT-layer / Player 3D ship only) camera - create once if missing.
        let fgCamNode = scene.getChildByName("ForegroundCamera");
        if (!fgCamNode) {
            console.log("[GameManager] Creating missing ForegroundCamera.");
            fgCamNode = new Node("ForegroundCamera");
            fgCamNode.addComponent(Camera);
            scene.addChild(fgCamNode);
        }
        this.foregroundCamera = fgCamNode.getComponent(Camera);

        // Dedicated Enemy-only camera (ENEMY_ONLY_LAYER) - create once if missing. Enemies used
        // to share ForegroundCamera/DEFAULT with the Player, which meant nothing could ever
        // render between "always behind everything" and "always in front of everything". Splitting
        // them out lets the cloud foreground layer sit between Enemy and Player (雲で敵は隠れるが
        // Playerは常に見える、see CloudManager).
        let enemyCamNode = scene.getChildByName("EnemyCamera");
        if (!enemyCamNode) {
            console.log("[GameManager] Creating missing EnemyCamera.");
            enemyCamNode = new Node("EnemyCamera");
            enemyCamNode.addComponent(Camera);
            scene.addChild(enemyCamNode);
        }
        this.enemyCamera = enemyCamNode.getComponent(Camera);

        // Dedicated cloud-foreground camera (FG_CLOUD_LAYER) - create once if missing. Draws the
        // "薄い"/"程よく薄い" cloud layers on top of Enemy/Bullet/UI but still behind Player.
        let cloudFgCamNode = scene.getChildByName("CloudFrontCamera");
        if (!cloudFgCamNode) {
            console.log("[GameManager] Creating missing CloudFrontCamera.");
            cloudFgCamNode = new Node("CloudFrontCamera");
            cloudFgCamNode.addComponent(Camera);
            scene.addChild(cloudFgCamNode);
        }
        this.cloudFrontCamera = cloudFgCamNode.getComponent(Camera);

        // directional light - only add if missing
        let lightNode = scene.getChildByName("DirectionalLight");
        if (!lightNode) {
            if (typeof DirectionalLight !== "function") {
                console.warn("[GameManager] DirectionalLight class unavailable at runtime (Feature Crop likely excludes the '3d' module) - skipping directional light setup.");
            } else {
                console.log("[GameManager] Creating missing directional light.");
                lightNode = new Node("DirectionalLight");
                const light = lightNode.addComponent(DirectionalLight);
                light.color = new Color(255, 255, 255, 255);
                light.illuminance = 65000; // Standard daylight
                lightNode.eulerAngles = new Vec3Type(-45, -45, 0);
                scene.addChild(lightNode);
            }
        }
    }

    /**
     * Single source of truth for MainCamera position/visibility. Call right after
     * `this.state` changes. UI states (Title/Home/Result/...) center on world (640,360)
     * where the persistent Canvas and UI content prefabs live; Ingame content is placed
     * at world (0,0) (see switchContent()'s isIngame branch), so the camera needs to
     * move between exactly these two points depending on state.
     */
    private applyCameraForState() {
        if (!this.mainCamera) return;
        const isIngame = this.state === GameState.INGAME;
        // DEFAULT-layer content (SideBarUI's panel children, the Player's 3D ship) is now
        // handled exclusively by foregroundCamera (drawn after mainCamera - see below), so
        // it always renders on top of any UI_2D content instead of being occluded by
        // whatever UI_2D element happens to overlap it on screen.
        const uiMask = Layers.BitMask.UI_2D | Layers.BitMask.UI_3D;
        this.mainCamera.visibility = uiMask;
        this.mainCamera.node.setPosition(isIngame ? 0 : 640, isIngame ? 0 : 360, 1000);
        // A Camera node created via the editor's "Create > Camera" menu defaults to
        // PERSPECTIVE projection, which breaks UI screen-to-world hit testing (clicks land
        // in the wrong place) even though on-screen rendering can look approximately right.
        // Force ORTHO unconditionally so this doesn't depend on how MainCamera was set up.
        this.mainCamera.projection = Camera.ProjectionType.ORTHO;
        this.mainCamera.orthoHeight = 360;
        // Far=1000 (the default) means anything past world Z=0 (camera Z 1000 minus far
        // 1000) gets clipped. The Player's 3D model's baked-in local Z offset, compounded
        // by its parent's 8x scale, can push it to world Z ~ -157 - past that threshold and
        // invisible from a straight-on ortho view even though an angled Scene-view camera
        // (much closer, perspective) doesn't hit the same clip. Give real headroom.
        this.mainCamera.far = 2000;
        // BackgroundCamera now owns clearing the screen to the "space black" / "UI blue"
        // backdrop color (see below) and draws first - mainCamera must NOT clear on top of
        // it, or it would erase whatever BackgroundCamera just drew.
        this.mainCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
        this.mainCamera.priority = 1;
        this.mainCamera.node.active = true;
        this.mainCamera.enabled = true;

        // BackgroundCamera: same view transform as mainCamera (so background content lines
        // up with everything else) but only sees BG_ONLY_LAYER content, drawn first (lower
        // priority) so mainCamera's 3D ship and UI_2D content composite on top of it instead
        // of being redrawn-over by the background every frame.
        if (this.bgCamera) {
            this.bgCamera.visibility = BG_ONLY_LAYER;
            this.bgCamera.node.setPosition(this.mainCamera.node.position);
            this.bgCamera.projection = Camera.ProjectionType.ORTHO;
            this.bgCamera.orthoHeight = 360;
            this.bgCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            // Ingame's SpaceBackground.ts cross-fades semi-transparent nebula images capped
            // at ~50% opacity by design - a vivid blue clear color washes them out
            // completely. Space should read as black behind them; UI screens keep the
            // existing blue (BackgroundCamera has nothing to draw on UI screens, so this
            // clear color is effectively the whole screen's backdrop there too).
            this.bgCamera.clearColor = new Color(0, 0, 0, 0);
            this.bgCamera.priority = 0;
            this.bgCamera.node.active = true;
            this.bgCamera.enabled = true;
        }

        // EnemyCamera: ENEMY_ONLY_LAYERのみを描画。以前はForegroundCameraでPlayerと同居していたが、
        // 分離することで「雲の前景レイヤーはEnemyより手前・Playerより奥」という重なりを作れるようにする。
        if (this.enemyCamera) {
            this.enemyCamera.visibility = ENEMY_ONLY_LAYER;
            this.enemyCamera.node.setPosition(this.mainCamera.node.position);
            this.enemyCamera.projection = Camera.ProjectionType.ORTHO;
            this.enemyCamera.orthoHeight = 360;
            this.enemyCamera.far = 2000;
            this.enemyCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
            this.enemyCamera.priority = 2;
            this.enemyCamera.node.active = true;
            this.enemyCamera.enabled = true;
        }

        // CloudFrontCamera: FG_CLOUD_LAYERのみを描画(CloudManagerの手前(near)層)。
        // Enemy/Bullet/UIより手前、Playerより奥に来るよう、enemyCameraとforegroundCameraの間の
        // priorityに置く。
        if (this.cloudFrontCamera) {
            this.cloudFrontCamera.visibility = FG_CLOUD_LAYER;
            this.cloudFrontCamera.node.setPosition(this.mainCamera.node.position);
            this.cloudFrontCamera.projection = Camera.ProjectionType.ORTHO;
            this.cloudFrontCamera.orthoHeight = 360;
            this.cloudFrontCamera.far = 2000;
            this.cloudFrontCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
            this.cloudFrontCamera.priority = 3;
            this.cloudFrontCamera.node.active = true;
            this.cloudFrontCamera.enabled = true;
        }

        // ForegroundCamera: same view transform as mainCamera but only sees DEFAULT-layer
        // content (Player's 3D ship only now that Enemy has its own EnemyCamera/ENEMY_ONLY_LAYER,
        // plus SideBarUI's DEFAULT-layer children), drawn LAST (highest priority) so nothing -
        // not even the cloud foreground layer - can occlude it. Never clears anything - it
        // only adds 3D content on top of whatever the other cameras already drew.
        if (this.foregroundCamera) {
            this.foregroundCamera.visibility = Layers.BitMask.DEFAULT;
            this.foregroundCamera.node.setPosition(this.mainCamera.node.position);
            this.foregroundCamera.projection = Camera.ProjectionType.ORTHO;
            this.foregroundCamera.orthoHeight = 360;
            this.foregroundCamera.far = 2000; // see mainCamera.far comment above
            this.foregroundCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
            this.foregroundCamera.priority = 4;
            this.foregroundCamera.node.active = true;
            this.foregroundCamera.enabled = true;
        }

        // The persistent Canvas (SideBarUI's parent) is saved at world (640,360) to match
        // the UI-state camera center. During Ingame, mainCamera recenters to (0,0), but
        // Canvas's own position never moved - SideBarUI is Widget-anchored to Canvas's
        // edges, so it visually slides into a corner whenever Canvas and the camera center
        // disagree. Keep Canvas following mainCamera's current center so anything anchored
        // to it (SideBarUI) stays framed correctly in every state, not just non-Ingame ones.
        const scene = director.getScene();
        const persistentCanvas = scene ? scene.getChildByName("Canvas") : null;
        if (persistentCanvas) {
            // X/Y only - copying mainCamera's full position (including its Z=1000) pushed
            // Canvas past the camera's own near clip plane, hiding everything under it
            // (SideBarUI, Home/Mission content) on every non-Ingame screen.
            persistentCanvas.setPosition(isIngame ? 0 : 640, isIngame ? 0 : 360, 0);
        }
    }

    /**
     * Recursively force a node subtree onto the UI_2D layer, so Cocos's 2D UI batcher
     * actually draws it - Sprite-based Ingame content (background, enemies, bullets,
     * items) is saved on the DEFAULT layer, which the 2D batcher never walks. Only the
     * Player's 3D model subtree should stay on DEFAULT (set separately) - don't call
     * this on the player node itself.
     */
    private forceUILayer(node: Node) {
        node.layer = Layers.BitMask.UI_2D;
        for (const child of node.children) {
            this.forceUILayer(child);
        }
    }

    /**
     * Recursively force a node subtree onto BG_ONLY_LAYER, so only BackgroundCamera draws
     * it (see BG_ONLY_LAYER) - keeps the space background from being redrawn over the
     * Player's 3D ship by mainCamera's UI_2D pass.
     */
    private forceBackgroundLayer(node: Node) {
        node.layer = BG_ONLY_LAYER;
        for (const child of node.children) {
            this.forceBackgroundLayer(child);
        }
    }

    /**
     * "#rrggbb"文字列(GameManagerEditorのcolor入力の値)を、cc.AmbientInfoのgroundAlbedo/skyColor
     * (Vec4、0〜1正規化 + w=強度)に変換する。Color.fromHEX()でRGBをパースし、wは1.0固定とする
     * (HDR強度の個別調整はGameManagerConfig.jsonでは今回サポートしない)。
     */
    private hexToNormalizedVec4(hex: string): Vec4 {
        const c = new Color();
        Color.fromHEX(c, hex);
        return new Vec4(c.r / 255, c.g / 255, c.b / 255, 1);
    }

    /**
     * GameManagerEditor(MasterManagerパネル)で編集したassets/resources/Data/GameManagerConfig.json
     * を読み込み適用する。playerShipScaleMultiplier/背景動画エフェクト系の数値はGameManager自身の
     * フィールドに保持し(PlayerController.update()やupdateVideoBGColorEffect()が毎フレーム参照)、
     * ambientSkyIllum/groundLightingColorはシーンのAmbient(cc.SceneGlobals.ambient)へ直接適用する。
     * SceneGlobalsはシーン全体に1つなのでswitchContent()のたびに再適用する必要はなく、起動時の
     * 1回だけでよい。
     */
    private loadGameManagerConfig() {
        resources.load("Data/GameManagerConfig", JsonAsset, (err, asset: JsonAsset) => {
            if (err || !asset) {
                console.warn("[GameManager] Failed to load Data/GameManagerConfig.json, using defaults.", err);
                return;
            }
            const config = asset.json as {
                playerShipScaleMultiplier?: number; playerShipBaseRotationX?: number; playerShipBaseRotationY?: number; ambientSkyIllum?: number; groundLightingColor?: string;
                missionMaxDuplicateSpawnTable?: number;
                missionMarginStartKm?: number; missionMarginEndKm?: number;
                missionAssumedMaxSpeedKmPerMin?: number; missionTargetSpeedRatio?: number;
                missionCargoWeightBaseMin?: number; missionCargoWeightBaseMax?: number; missionCargoWeightPerLv?: number;
                missionCargoPriceBase?: number; missionCargoPricePerLv?: number;
                missionBonusStepSeconds?: number; missionBonusPercentPerStep?: number;
                missionBonusCapPercent?: number; missionPenaltyFloorPercent?: number;
                contactInvincibleFrames?: number;
                resetRefundPercent?: number; tnLerpDivisor?: number;
                upgradeCostUnitScale?: number; missionEarlyBaselineCredits?: number; missionLateBaselineCredits?: number;
                upgradeButtonFontSize?: number; upgradeNoticeFontSize?: number; upgradeSharedInfoFontSize?: number;
                initialCredit?: number;
                keySpeedMin?: number; keySpeedMax?: number;
            };

            if (typeof config.playerShipScaleMultiplier === 'number') {
                this.playerShipScaleMultiplier = config.playerShipScaleMultiplier;
            }
            if (typeof config.playerShipBaseRotationX === 'number') {
                this.playerShipBaseRotationX = config.playerShipBaseRotationX;
            }
            if (typeof config.playerShipBaseRotationY === 'number') {
                this.playerShipBaseRotationY = config.playerShipBaseRotationY;
            }
            if (typeof config.missionMaxDuplicateSpawnTable === 'number') this.missionMaxDuplicateSpawnTable = config.missionMaxDuplicateSpawnTable;
            if (typeof config.missionMarginStartKm === 'number') this.missionMarginStartKm = config.missionMarginStartKm;
            if (typeof config.missionMarginEndKm === 'number') this.missionMarginEndKm = config.missionMarginEndKm;
            if (typeof config.missionAssumedMaxSpeedKmPerMin === 'number') this.missionAssumedMaxSpeedKmPerMin = config.missionAssumedMaxSpeedKmPerMin;
            if (typeof config.missionTargetSpeedRatio === 'number') this.missionTargetSpeedRatio = config.missionTargetSpeedRatio;
            if (typeof config.missionCargoWeightBaseMin === 'number') this.missionCargoWeightBaseMin = config.missionCargoWeightBaseMin;
            if (typeof config.missionCargoWeightBaseMax === 'number') this.missionCargoWeightBaseMax = config.missionCargoWeightBaseMax;
            if (typeof config.missionCargoWeightPerLv === 'number') this.missionCargoWeightPerLv = config.missionCargoWeightPerLv;
            if (typeof config.missionCargoPriceBase === 'number') this.missionCargoPriceBase = config.missionCargoPriceBase;
            if (typeof config.missionCargoPricePerLv === 'number') this.missionCargoPricePerLv = config.missionCargoPricePerLv;
            if (typeof config.missionBonusStepSeconds === 'number') this.missionBonusStepSeconds = config.missionBonusStepSeconds;
            if (typeof config.missionBonusPercentPerStep === 'number') this.missionBonusPercentPerStep = config.missionBonusPercentPerStep;
            if (typeof config.missionBonusCapPercent === 'number') this.missionBonusCapPercent = config.missionBonusCapPercent;
            if (typeof config.missionPenaltyFloorPercent === 'number') this.missionPenaltyFloorPercent = config.missionPenaltyFloorPercent;
            if (typeof config.contactInvincibleFrames === 'number') this.contactInvincibleFrames = config.contactInvincibleFrames;
            if (typeof config.resetRefundPercent === 'number') this.resetRefundPercent = config.resetRefundPercent;
            if (typeof config.tnLerpDivisor === 'number') this.tnLerpDivisor = config.tnLerpDivisor;
            if (typeof config.upgradeCostUnitScale === 'number') this.upgradeCostUnitScale = config.upgradeCostUnitScale;
            if (typeof config.missionEarlyBaselineCredits === 'number') this.missionEarlyBaselineCredits = config.missionEarlyBaselineCredits;
            if (typeof config.missionLateBaselineCredits === 'number') this.missionLateBaselineCredits = config.missionLateBaselineCredits;
            if (typeof config.upgradeButtonFontSize === 'number') this.upgradeButtonFontSize = config.upgradeButtonFontSize;
            if (typeof config.upgradeNoticeFontSize === 'number') this.upgradeNoticeFontSize = config.upgradeNoticeFontSize;
            if (typeof config.upgradeSharedInfoFontSize === 'number') this.upgradeSharedInfoFontSize = config.upgradeSharedInfoFontSize;
            if (typeof config.initialCredit === 'number') {
                this.initialCredit = config.initialCredit;
                this.applyInitialCreditIfNewSave();
            }
            if (typeof config.keySpeedMin === 'number') this.keySpeedMin = config.keySpeedMin;
            if (typeof config.keySpeedMax === 'number') this.keySpeedMax = config.keySpeedMax;

            const scene = director.getScene();
            const ambient = scene && (scene as any).globals ? (scene as any).globals.ambient : null;
            if (ambient) {
                if (typeof config.ambientSkyIllum === 'number') {
                    ambient.skyIllum = config.ambientSkyIllum;
                }
                if (typeof config.groundLightingColor === 'string') {
                    ambient.groundAlbedo = this.hexToNormalizedVec4(config.groundLightingColor);
                }
                console.log(`[GameManager] Applied Ambient from GameManagerConfig.json (skyIllum=${config.ambientSkyIllum}, groundLightingColor=${config.groundLightingColor}).`);
            } else {
                console.warn("[GameManager] Scene has no globals.ambient - could not apply ambientSkyIllum/groundLightingColor.");
            }

            console.log(`[GameManager] GameManagerConfig loaded. playerShipScaleMultiplier=${this.playerShipScaleMultiplier}`);
        });
    }

    /**
     * GameManagerConfig.jsonのinitialCreditを、DataManager.isNewSave(真の初回起動、または
     * HomeUIのResetボタンによるフルリセット直後)の場合のみDataManager.data.moneyへ適用する。
     * 既にプレイ中のセーブのmoneyを後から上書きしてしまわないためのガード。
     * loadGameManagerConfig()(起動時1回)と、HomeUIのResetボタン(DataManager.reset()の直後)の
     * 両方から呼ばれる - Reset後はDataManager.reset()がisNewSaveを再びtrueにするため、
     * ここを呼び直すだけでResetのたびに最新のinitialCreditが反映される。
     */
    public applyInitialCreditIfNewSave() {
        if (DataManager.instance && DataManager.instance.isNewSave) {
            DataManager.instance.data.money = this.initialCredit;
            DataManager.instance.save();
            console.log(`[GameManager] Applied initialCredit=${this.initialCredit} to fresh save.`);
        }
    }

    /**
     * 弾(Bullet.ts)専用の発光パルス設定。ShotManagerタブ(MasterManagerパネル)で編集する
     * assets/resources/Data/BulletConfig.jsonを読み込む。GameManager自体の設定とは無関係な
     * 弾専用の値のため、GameManagerConfig.jsonから分離した別ファイル・別ローダーにしている
     * (Bullet.tsはこれまで通りIGameManager経由でGameManagerのbulletXxxフィールドを読むだけで、
     * 読み込み元ファイルが分かれたこと自体は感知しない)。
     */
    private loadBulletConfig() {
        resources.load("Data/BulletConfig", JsonAsset, (err, asset: JsonAsset) => {
            if (err || !asset) {
                console.warn("[GameManager] Failed to load Data/BulletConfig.json, using defaults.", err);
                return;
            }
            const config = asset.json as {
                bulletPulseSpeed?: number; bulletGlowScale?: number; bulletGlowScalePulse?: number;
                bulletGlowAlpha?: number; bulletEmissiveBase?: number; bulletEmissiveAmplitude?: number;
            };
            if (typeof config.bulletPulseSpeed === 'number') this.bulletPulseSpeed = config.bulletPulseSpeed;
            if (typeof config.bulletGlowScale === 'number') this.bulletGlowScale = config.bulletGlowScale;
            if (typeof config.bulletGlowScalePulse === 'number') this.bulletGlowScalePulse = config.bulletGlowScalePulse;
            if (typeof config.bulletGlowAlpha === 'number') this.bulletGlowAlpha = config.bulletGlowAlpha;
            if (typeof config.bulletEmissiveBase === 'number') this.bulletEmissiveBase = config.bulletEmissiveBase;
            if (typeof config.bulletEmissiveAmplitude === 'number') this.bulletEmissiveAmplitude = config.bulletEmissiveAmplitude;
            console.log(`[GameManager] BulletConfig loaded. bulletPulseSpeed=${this.bulletPulseSpeed}`);
        });
    }

    /**
     * Apply patches at runtime to engine classes that are causing preview errors.
     */
    private patchSpriteMethods() {
        try {
            const proto: any = Sprite.prototype as any;
            const origSize = proto._applySpriteSize;
            proto._applySpriteSize = function () {
                if (!this._uiProps) return;
                return origSize.apply(this, arguments);
            };
            const origFrame = proto._applySpriteFrame;
            proto._applySpriteFrame = function () {
                if (!this._uiProps) return;
                return origFrame.apply(this, arguments);
            };
            console.log("[GameManager] Patched Sprite methods to guard _uiProps.");
        } catch (e) {
            console.warn("[GameManager] Failed to patch Sprite methods", e);
        }
    }

    onDestroy() {
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    }

    private onGameHide() {
        if (this.state === GameState.INGAME && OptionsUI.instance) {
            OptionsUI.instance.ensureOpen();
        }
    }

    start() {
        console.log("[GameManager] start triggered.");
        // prefer title, fallback to home if title missing
        if (this.titlePrefab) {
            this.goToTitle();
        } else if (this.homePrefab) {
            console.warn("[GameManager] titlePrefab missing, falling back to homePrefab.");
            this.goToHome();
        } else {
            console.error("[GameManager] No titlePrefab or homePrefab assigned! UI will not appear.");
        }

        // BGM handled within goToTitle/goToHome
    }

    /**
     * Switch content (Prefab) under Canvas or Scene root
     * Returns the instantiated node
     */
    public switchContent(prefab: Prefab) {
        if (!prefab) {
            console.error("[GameManager] switchContent failed: Prefab is null.");
            return null;
        }

        console.log(`[GameManager] switchContent: switching to ${prefab.name}`);

        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");

        // 1. Clear previous content
        if (this.currentContentNode && this.currentContentNode.isValid) {
            this.currentContentNode.destroy();
            this.currentContentNode = null;
        }

        // Also cleanup old references
        this.playerNode = null;
        this.bulletLayer = null;
        this.enemyLayer = null;
        this.itemLayer = null;

        // 2. Instantiate new
        const node = instantiate(prefab);
        console.log(`[GameManager] Instantiated prefab: ${prefab.name}, node name: ${node.name}, children count: ${node.children.length}`);

        // --- Decision: Place in Canvas or Scene root? ---
        // Ingame content (3D) should be in World space (Scene root)
        // UI content (Title, Home) should be in Screen space (Canvas) -
        // UNLESS the content prefab already brings its own Canvas+Camera (self-contained screen),
        // in which case nesting it under the persistent Canvas would create a Canvas-in-Canvas conflict.
        const isIngame = prefab.name.toLowerCase().includes("ingame") || this.state === GameState.INGAME;
        const hasOwnCanvas = !!node.getComponentInChildren(Canvas);
        console.log(`[GameManager] isIngame: ${isIngame}, hasOwnCanvas: ${hasOwnCanvas}`);

        if (isIngame || hasOwnCanvas) {
            scene.addChild(node);
            // In world space, (0,0,0) is center. Layers are already at (0,0) in prefab usually.
            node.setPosition(0, 0, 0);
            console.log(isIngame
                ? "[GameManager] Ingame content placed in Scene Root for 3D rendering."
                : "[GameManager] UI content has its own Canvas; placed in Scene Root to avoid nested Canvas.");
        } else {
            if (!canvas) {
                console.error("[GameManager] Canvas not found in scene and content has no own Canvas - cannot place UI content.");
                return null;
            }
            console.log(`[GameManager] Canvas before adding UI content: ${canvas.name}, children: ${canvas.children.length}`);
            canvas.addChild(node);
            node.setPosition(0, 0, 0);
            node.setSiblingIndex(0); // Put at bottom (behind persistent UI)
            console.log(`[GameManager] UI content placed in Canvas. Canvas now has ${canvas.children.length} children.`);
        }

        // Camera is no longer searched-for/created here - GameManager owns a single
        // persistent MainCamera configured by applyCameraForState() on every state change.

        if (node.children.length === 0) {
            console.warn("[GameManager] Instantiated prefab has no child nodes. May be empty.");
        }

        this.currentContentNode = node;

        // 3. Force UI to resolve references for the new content (GameOver, HUD etc)
        if (UIManager.instance) {
            UIManager.instance.resolveReferences();
        }

        // 4. SideBarUI Visibility
        if (UIManager.instance) {
            const shouldBeActive = (this.state !== GameState.TITLE);
            UIManager.instance.setSideBarActive(shouldBeActive);
        }

        return node;
    }

    public startInGame(mission: any = null) {
        console.log("[GameManager] Starting InGame via Prefab...");

        if (mission) {
            this.currentMission = mission;
        }

        this.state = GameState.INGAME;
        this.applyCameraForState();
        this.isPaused = false; // Freeze Fix: Ensure game is unpaused on mission start

        // Reset HP for the session
        if (DataManager.instance) {
            // If mission is non-null, it's a new embarkation from Home -> Save CURRENT HP
            if (mission) {
                this.missionStartHp = DataManager.instance.data.hp;
                console.log(`[GameManager] New mission start. HP recorded: ${this.missionStartHp}`);
            }

            // Restore HP to whatever it was at the start of THIS mission (Retry uses this too)
            DataManager.instance.setHp(this.missionStartHp);
            console.log(`[GameManager] HP restored to mission start value: ${this.missionStartHp}`);
        }

        const node = this.switchContent(this.ingamePrefab);
        if (!node) {
            console.error("[GameManager] Failed to instantiate InGame Prefab!");
            return;
        }

        // Force resolve references from the new instance
        this.resolveInGameReferences(node);

        // Safety check for distance objects
        if (!this.currentMission) this.currentMission = { distance: 3000, stars: 1, reward: 0 };
        if (!this.playState) this.playState = { distance: 3000, enemies: [], items: [], killedEnemies: 0, collectedItemsCount: 0 };

        if (this.currentMission.distance > 0) {
            this.missionDistance = this.currentMission.distance;
        }

        this.playState.distance = this.currentMission.distance;
        this.playState.killedEnemies = 0;
        this.playState.totalEnemiesSpawned = 0;
        this.playState.collectedItemsCount = 0;
        this.playState.items = []; // Reset items
        this.playState.elapsedTime = 0; // Reset Timer
        this.playState.damageDealt = 0;    // Reset
        this.playState.damageReceived = 0; // Reset
        this.playState.itemsList = [];      // Reset
        this.spawnTimer = 0;
        this._goalApproachShown = false;
        this.hideGoalWarning();

        // 距離トリガー式の湧きキューを組み立てる(MissionUI経由の本番ミッションのみ、
        // BehaviorTestController.onStartMissionClicked()と同じアルゴリズム)。各SpawnTableの
        // 発火しきい値(残り距離)は「そのテーブルより後ろの全テーブルのdist合計+終了margin」。
        // 先頭(SubLv最小)のテーブルが最初に、末尾のテーブルが終了margin直前に発火する。
        this._missionSpawnQueue = [];
        const spawnTableIds = this.currentMission.spawnTableIds;
        const spawnTableDists = this.currentMission.spawnTableDists;
        if (spawnTableIds && spawnTableIds.length > 0 && spawnTableDists && spawnTableDists.length === spawnTableIds.length) {
            let remaining = this.currentMission.marginEndKm || 0;
            const triggers: { id: string; triggerAtDistance: number; fired: boolean }[] = [];
            for (let i = spawnTableIds.length - 1; i >= 0; i--) {
                remaining += spawnTableDists[i];
                triggers.unshift({ id: spawnTableIds[i], triggerAtDistance: remaining, fired: false });
            }
            this._missionSpawnQueue = triggers;
            console.log(`[GameManager] Mission spawn queue built: ${triggers.length} table(s) [${spawnTableIds.join(', ')}].`);
        }

        // Inject GM to Player
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);

                // --- Cargo Penalty ---
                const data = DataManager.instance.data;
                const weight = this.currentMission ? (this.currentMission.cargoWeight || 0) : 0;
                const capacity = data.capacity || 50;
                if (weight > capacity) {
                    console.log(`[GameManager] Cargo penalty applied: ${weight} > ${capacity}`);
                    pCtrl.cargoDamagePenalty = 1.0; // Subtract 1.0 from multiplier
                } else {
                    pCtrl.cargoDamagePenalty = 0;
                }

                // --- Customizeで実際に装備した武器を発射に反映 ---
                // 以前はPlayerController.shotPatternId(Inspector既定の固定1パターン)が常に
                // 使われ続け、装備/Lvが発射に一切反映されていなかった(PlayerWeaponManagerは
                // scene-BehaviorTest専用のデバッグハーネスで、本番では一度も呼ばれていなかった)。
                const equippedParts = getCurrentGridData(data).equippedParts;
                const loadout = resolveEquippedLoadout(equippedParts);
                if (pCtrl.setOverrideShotPatternIds) pCtrl.setOverrideShotPatternIds(loadout.shotPatternIds);
                if (pCtrl.setScaleMultipliers) pCtrl.setScaleMultipliers(loadout.scaleMultByPatternId);
                if (pCtrl.setIntervalMultipliers) pCtrl.setIntervalMultipliers(loadout.intervalMultByPatternId);
                if (pCtrl.setDamageMultipliers) pCtrl.setDamageMultipliers(loadout.damageMultByPatternId);
                console.log(`[GameManager] Equipped loadout resolved: ${loadout.shotPatternIds.join(', ') || '(none, falling back to default shotPatternId)'}`);
            }
        }

        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
            UIManager.instance.resetBuffs(); // Ensure clean UI state
        }
        if (this.remainDistanceHUD) this.remainDistanceHUD.setDistance(this.playState.distance);

        // Start BGM
        if (SoundManager.instance) {
            SoundManager.instance.pauseBGM(1.0); // Pause OutGame Atmosphere
            SoundManager.instance.playBGM("bgm_ingame01", 1.0);
        }

        this.playPlayerStartAnimation();
    }

    // ミッション開始時のPlayer軽演出。ノンブロッキング(isPausedにしない、入力も止めない)なので、
    // PlayerController側のマウス追従/バンクと同時に動く。そのため、position/rotationを
    // 動かすクリップだと毎フレーム取り合いになって暴れる - scaleのポップインや、子ノード
    // (例: PlayerShip3D配下のパーティクル演出ノード)のactive切り替えなど、PlayerControllerが
    // 触らないプロパティだけで組む前提。
    private playPlayerStartAnimation() {
        if (!this.playerStartClip || !this.playerNode) return;
        const anim = this.playerNode.getComponent(Animation) || this.playerNode.addComponent(Animation);
        anim.defaultClip = this.playerStartClip;
        anim.play();

        if (SoundManager.instance) {
            SoundManager.instance.playSE('SE_Anim_Thruster1', 'Player');
        }

        // 演出時間 = Startクリップ自身の尺(秒)。ハードコードした秒数ではなくクリップのdurationを
        // 基準にすることで、クリップの長さを変えても弾遅延/STARTロゴ/集中線が自動的に追従する。
        const presentationSec = this.playerStartClip.duration;

        const pCtrl = this.playerNode.getComponent("PlayerController") as any;
        if (pCtrl && pCtrl.delayFiring) {
            pCtrl.delayFiring(presentationSec);
        }

        this.showStartText(presentationSec);

        if (this.skyManager) {
            this.skyManager.triggerBurst(presentationSec, 6.0, 4.5);
            if (this.currentMission) {
                this.skyManager.applyMissionTheme(this.currentMission.lv, presentationSec);
            }
        }
    }

    // GOALのshowGoalText()と対になる、ミッション開始時のSTARTロゴ。GOAL側と違い後続の画面遷移を
    // 待つ相手がいないので、durationSec表示した後は自分でフェードアウトして自己完結する。
    private showStartText(durationSec: number) {
        const scene = director.getScene();
        const canvas = scene ? scene.getChildByName("Canvas") : null;
        if (!canvas) return;

        const node = new Node("START_Text");
        canvas.addChild(node);
        node.setPosition(0, 0, 0);

        const lbl = node.addComponent(Label);
        lbl.string = "START!!";
        lbl.fontSize = 120;
        lbl.lineHeight = 130;
        lbl.color = Color.CYAN; // GOALの黄色と差別化
        lbl.overflow = Label.Overflow.NONE;

        const outline = node.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 6;

        const trans = node.getComponent(UITransform) || node.addComponent(UITransform);
        trans.setContentSize(new Size(800, 200));

        const opacity = node.addComponent(UIOpacity);

        tween(node)
            .set({ scale: v3(0, 0, 0) })
            .to(0.4, { scale: v3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.15, { scale: v3(1, 1, 1) })
            .start();

        const holdSec = Math.max(0, durationSec - 0.6);
        tween(opacity)
            .delay(holdSec)
            .to(0.4, { opacity: 0 })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();
    }

    public retryGame() {
        console.log("[GameManager] Retrying Game...");
        // Just call startInGame, which re-instantiates the prefab
        this.startInGame();
    }

    public goToTitle() {
        console.log("[GameManager] Switch to Title via Prefab");
        this.hideGoalWarning();
        this.state = GameState.TITLE;
        this.applyCameraForState();
        this.switchContent(this.titlePrefab);

        if (SoundManager.instance) {
            // Title BGM same as Outgame? Or different?
            // Usually same for now.
            SoundManager.instance.playBGM("bgm_outgame01", 1.0);
        }
    }

    public goToHome() {
        console.log("[GameManager] Switch to Home via Prefab");
        this.hideGoalWarning();
        this.state = GameState.HOME;
        this.applyCameraForState();
        this.switchContent(this.homePrefab);

        if (SoundManager.instance) {
            if (!SoundManager.instance.resumeBGM(1.5)) {
                SoundManager.instance.playBGM("bgm_outgame01", 1.0);
            }
        }

        if (UIManager.instance) {
            UIManager.instance.resetBuffs();
        }
    }

    /**
     * 新しく生成されたインゲームノードツリーから参照を取得
     */
    private resolveInGameReferences(rootNode: Node) {
        if (!rootNode) return;

        // Recursive search helper
        const findNode = (node: Node, name: string): Node => {
            if (node.name === name) return node;
            for (let i = 0; i < node.children.length; ++i) {
                const res = findNode(node.children[i], name);
                if (res) return res;
            }
            return null;
        };

        // Camera is handled exclusively by applyCameraForState() (called from startInGame()
        // when this.state was set to INGAME) - no per-content camera setup needed here.

        this.playerNode = findNode(rootNode, "Player");
        this.bulletLayer = findNode(rootNode, "BulletLayer");
        this.enemyLayer = findNode(rootNode, "EnemyLayer");
        this.itemLayer = findNode(rootNode, "ItemLayer");

        // Player.prefab's root node carries a legacy 2D Sprite (with its required UITransform)
        // alongside PlayerController. The 2D visual is no longer used (player is fully
        // represented by the 3D ship model now) - explicitly disable it here in case the
        // prefab's saved state has it enabled, rather than relying on the prefab alone.
        // Cocos refuses removeComponent(UITransform) while a Sprite on the same node still
        // depends on it (same class of error seen earlier with MissionUI dialogs), so this
        // stays a runtime enabled=false rather than an actual component removal; removing
        // the Sprite/UITransform components outright (if desired) must be done from the
        // Cocos Editor Inspector (Remove Component), not via script.
        if (this.playerNode) {
            const legacySprite = this.playerNode.getComponent(Sprite);
            if (legacySprite) {
                legacySprite.enabled = false;
            }
            // ensure layer is Default for 3D rendering
            this.playerNode.layer = Layers.BitMask.DEFAULT;
        }

        if (!this.playerNode) console.error("[GameManager] Player Node NOT FOUND in Prefab!");
        if (!this.enemyLayer) console.error("[GameManager] EnemyLayer Node NOT FOUND in Prefab!");

        // Force zero positions to ensure coordinate sync between layers
        // This fixes the issue where layers in the prefab had (640, 360) offsets from Canvas space
        if (this.playerNode) this.playerNode.setPosition(0, -200, 0); // Start at bottom center
        if (this.bulletLayer) this.bulletLayer.setPosition(0, 0, 0);
        if (this.enemyLayer) this.enemyLayer.setPosition(0, 0, 0);
        if (this.itemLayer) this.itemLayer.setPosition(0, 0, 0);

        // Notify UIManager to resolve its references (GameOverPanel etc) from the new prefab
        if (UIManager.instance) {
            UIManager.instance.resolveReferences();
        }

        // Background and StarField might also need reset if they were offset.
        // BackgroundLayer is saved inactive in the prefab (leftover from earlier
        // debugging) - force it active or the space backdrop never renders.
        // They're also saved on the DEFAULT layer: Cocos's 2D UI batcher only walks
        // UI_2D-layer content, so a 2D Sprite on DEFAULT never gets drawn even though
        // the camera's visibility mask includes DEFAULT (that mask is what lets the
        // Player's 3D mesh show through the same camera - a completely different
        // render path with its own layer rules).
        // Zero out any leftover offset on the wrapper nodes between rootNode and the
        // layers above (e.g. "640x360_Canvas" / "Canvas") - these used to sit nested
        // inside the persistent UI Canvas at a (640,360)-ish offset under the old
        // architecture. Now that Ingame content is placed at Scene root (0,0,0) by
        // switchContent(), any leftover local offset saved on these wrapper nodes
        // shifts everything under them out from under MainCamera's Ingame view.
        const wrapper1 = findNode(rootNode, "640x360_Canvas");
        if (wrapper1) wrapper1.setPosition(0, 0, 0);
        const wrapper2 = findNode(rootNode, "Canvas");
        if (wrapper2) wrapper2.setPosition(0, 0, 0);

        // BackgroundLayer/StarField go on BG_ONLY_LAYER (not UI_2D) so only BackgroundCamera
        // draws them - see BG_ONLY_LAYER for why (2D UI otherwise always draws over the
        // Player's 3D ship regardless of Z, no matter how the ship's Z is adjusted).
        const bgLayer = findNode(rootNode, "BackgroundLayer");
        if (bgLayer) {
            bgLayer.active = true;
            bgLayer.setPosition(0, 0, 0);
            this.forceBackgroundLayer(bgLayer);
        }
        const starField = findNode(rootNode, "StarField");
        if (starField) {
            starField.setPosition(0, 0, 0);
            this.forceBackgroundLayer(starField);
            this.starField = starField.getComponent(StarField);
        } else {
            this.starField = null;
        }

        // 残り距離HUD(RemainDistanceノード、RichText)。専用コンポーネントを実行時にアタッチ
        // (Prefab自体はエディタ側でノード配置のみ済んでいれば良い、JSONは直接編集しない)。
        const remainDistanceNode = findNode(rootNode, "RemainDistance");
        if (remainDistanceNode) {
            this.remainDistanceHUD = remainDistanceNode.getComponent(RemainDistanceHUD) || remainDistanceNode.addComponent(RemainDistanceHUD);
        } else {
            this.remainDistanceHUD = null;
        }

        // 既存の静止画クロスフェード(BackgroundLayer)はもう使わないため非表示にする。
        if (bgLayer) bgLayer.active = false;

        // Ingame背景一元統合システム (SkyManager)
        // 最背面スカイ、動画/タイル、星フィールド、雲を一括セットアップ
        if (this.skyManager && this.skyManager.isValid) {
            this.skyManager.node.destroy();
        }
        const skyNode = new Node("SkyManager");
        (wrapper2 || rootNode).addChild(skyNode);
        skyNode.setSiblingIndex(0);
        this.skyManager = skyNode.addComponent(SkyManager);
        // setup()内でSkyConfig.jsonから読み込んだ全パラメータを使ってレイヤーを構築するため、
        // GameManager側からapplyTunables()で別の値を上書きしない(SkyConfig.jsonでの調整が
        // 反映されなくなる不具合の対策)。
        this.skyManager.setup(wrapper2 || rootNode, BG_ONLY_LAYER, FG_CLOUD_LAYER, this.speedManager);

        // EnemyMovePoint(EMP)収集: "MovePoints" コンテナ配下のMovePointコンポーネント付き子ノードを
        // ID -> ローカル座標のマップにする。他のレイヤーと同様(0,0,0)に矯正してenemyLayerと同じ
        // 座標空間で参照できるようにする。コンテナが無いシーン(未対応の旧シーン等)では単に空のまま。
        this.movePoints.clear();
        const movePointsContainer = findNode(rootNode, "MovePoints");
        if (movePointsContainer) {
            movePointsContainer.setPosition(0, 0, 0);
            for (const child of movePointsContainer.children) {
                const mp = child.getComponent(MovePoint);
                if (mp && mp.pointId) {
                    this.movePoints.set(mp.pointId, child.position.clone());
                }
            }
            console.log(`[GameManager] Collected ${this.movePoints.size} MovePoint(s).`);
        }

        console.log(`[GameManager] References resolved: Player=${this.playerNode?.name}, EnemyLayer=${this.enemyLayer?.name}`);

        // Attach a 3D model to the player only if one isn't already present. Player.prefab
        // now ships with its own embedded "PlayerShip3D" child node - only fall back to
        // dynamically loading the standalone Prefabs/PlayerShip_3D resource (an older
        // workaround for when the prefab had no embedded model) if neither the Inspector's
        // model3D field NOR an existing child node covers it. Without this guard, both the
        // embedded child and a freshly-instantiated resource copy render simultaneously as
        // two overlapping ships.
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && !pCtrl.model3D) {
                const existingModel = this.playerNode.getChildByName("PlayerShip3D") || this.playerNode.getChildByName("PlayerShip_3D");
                if (existingModel) {
                    existingModel.layer = Layers.BitMask.DEFAULT;
                    pCtrl.model3D = existingModel;
                    console.log("[GameManager] Reused existing embedded 3D model on PlayerNode (no dynamic load needed).");
                } else {
                    resources.load("Prefabs/PlayerShip_3D", Prefab, (err, prefab) => {
                        if (!err && prefab) {
                            const node = instantiate(prefab);
                            node.layer = Layers.BitMask.DEFAULT;
                            this.playerNode.addChild(node);
                            node.setPosition(0, 0, 0);
                            pCtrl.model3D = node;
                            console.log("[GameManager] Attached 3D model to PlayerNode (dynamic load fallback).");
                        } else {
                            console.warn("[GameManager] Unable to load PlayerShip_3D prefab for 3D model.");
                        }
                    });
                }
            }
        }

        // Ensure PlayerController setup
        if (this.playerNode) {
            // Player should also be at (0, 0) or offset by code, but we want its parent to be (0,0)
            // Wait, Player is sibling to layers. If layers are (0,0), Player should be near (0,0) or (0, -200)
            // Let's not force Player position here as Bullet spawn uses this.node.position relative to BulletLayer

            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);
            } else {
                console.error("[GameManager] PlayerController component NOT FOUND on Player Node!");
            }
        }
    }

    public setPaused(paused: boolean) {
        this.isPaused = paused;
        if (this.speedManager) {
            this.speedManager.setPaused(paused);
        }

        // 一時停止時に全てのSEを止める（必要に応じて）
        if (paused && SoundManager.instance) {
            SoundManager.instance.stopAllSE();
        }
    }

    update(deltaTime: number) {
        if (this.state !== GameState.INGAME || this.isPaused) return;

        this.frameCount++;
        this.playState.elapsedTime += deltaTime;

        // Timer Logic (行動パターン検証用テストシーンでは自動湧きを止める)。
        // _missionSpawnQueueが組まれているミッション(MissionUI経由の本番ミッション)では、
        // こちらの継続タイマー式ランダム湧きは止める - 両方同時に湧かせると、開始/終了margin
        // が「静かな区間」にならず、SpawnTable側で選んだLv相応の敵構成の意味も薄れるため。
        if (!this.testMode && this._missionSpawnQueue.length === 0) {
            this.spawnTimer += deltaTime;
            const interval = (GAME_SETTINGS.ENEMY.SPAWN_INTERVAL / 60); // Convert frames to seconds approx

            if (this.spawnTimer >= interval) {
                this.spawnTimer = 0;
                this.spawnEnemy();
            }
        }

        // Distance Logic
        const pCtrl = this.playerNode ? this.playerNode.getComponent("PlayerController") as any : null;
        const currentSpeed = pCtrl ? pCtrl.speed : 0;

        // Update Speed Manager (敵のスクロールオフセット計算に使われるため testMode でも継続する)
        this.speedManager.setBaseSpeed(currentSpeed);

        // 距離カウントダウン自体はtestModeでも行う(BehaviorTestControllerのSpawnTable
        // デバッグログが実際に減っていく「残り距離」を表示できるようにするため)。ただし
        // ゴール判定(Result画面遷移)はtestModeでは行わない - 0になってもテストセッションを
        // 終わらせたくない、という明示的な要望のため。
        // Get Final Speed
        const finalSpeed = this.speedManager.getCurrentSpeed();

        // Conversion logic (similar to engine.js)
        const physics = GAME_SETTINGS.PHYSICS as any;
        const distDivisor = physics.MISSION_DIVISOR || 2000;
        const distDec = (finalSpeed * physics.MISSION_SCALE) / distDivisor;
        this.playState.distance -= distDec;
        if (this.playState.distance < 0) this.playState.distance = 0;

        // 距離トリガー式の湧きキュー消化(BehaviorTestController.updateMissionRuntime()と同じ判定)。
        // 残り距離がしきい値以下になった時点で該当SpawnTableを1回だけ発火する。
        if (this._missionSpawnQueue.length > 0) {
            for (const t of this._missionSpawnQueue) {
                if (!t.fired && this.playState.distance <= t.triggerAtDistance) {
                    t.fired = true;
                    this.spawnFromSpawnTable(t.id);
                }
            }
        }

        // GOAL接近予告(残り100km、1ミッション1回のみ)。testModeでも見た目確認できるよう出す
        // (ゴール判定自体と違い、演出だけなのでゲームを止めたりはしない)。
        if (!this._goalApproachShown && this.playState.distance > 0 && this.playState.distance <= 100) {
            this._goalApproachShown = true;
            this.showGoalApproachingCue();
            this.showGoalWarning();
        }

        if (!this.testMode && this.playState.distance <= 0) {
            this.beginGoalSequence();
        }

        // UI Update (via UIManager)
        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
            UIManager.instance.updateSpeed(currentSpeed);
            UIManager.instance.updateTimer(this.playState.elapsedTime);
            UIManager.instance.updateMissionStats(this.playState.killedEnemies || 0, this.playState.damageDealt || 0);
        }
        if (this.remainDistanceHUD) this.remainDistanceHUD.setDistance(this.playState.distance);

        // Debug Label Update
        if (this.debugLabel) {
            if (this.isDebug) {
                if (!this.debugLabel.node.active) this.debugLabel.node.active = true;

                let px = "0.0";
                let py = "0.0";
                if (this.playerNode) {
                    px = this.playerNode.position.x.toFixed(1);
                    py = this.playerNode.position.y.toFixed(1);
                }

                let enemyInfo = "No Enemies";
                if (this.enemyLayer && this.enemyLayer.children.length > 0) {
                    const e = this.enemyLayer.children[0];
                    enemyInfo = `E0: (${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)})`;
                }

                this.debugLabel.string = `Player: (${px}, ${py})\nSpeed: ${currentSpeed.toFixed(2)} (Final: ${this.speedManager.getCurrentSpeed().toFixed(2)})\nEnemies: ${this.enemyLayer ? this.enemyLayer.children.length : 0}\n${enemyInfo}`;
            } else {
                if (this.debugLabel.node.active) this.debugLabel.node.active = false;
            }
        }
    }

    spawnEnemy() {
        // Fallback to singleton if inspector reference is null (common after hijacking)
        const db = this.gameDatabase || GameDatabase.instance;

        if (!db || !db.isReady) {
            if (this.frameCount % 60 === 0) { // Log occasionally
                console.warn("[GameManager] spawnEnemy skipped: GameDatabase is NOT READY or null.");
            }
            return;
        }

        if (!this.enemyLayer) {
            console.error("[GameManager] spawnEnemy failed: enemyLayer is null.");
            return;
        }

        // Method 1: Use GameDatabase (New System)
        if (db.enemies.length > 0) {
            let enemyData: any = null;
            const mission = this.currentMission;

            if (mission && mission.enemyPattern && mission.enemyPattern.length > 0) {
                // Pick random ID from the mission's defined pattern
                const pattern = mission.enemyPattern;
                const randomId = pattern[Math.floor(Math.random() * pattern.length)];
                enemyData = db.getEnemyData(randomId);

                // Fallback to random if the specific ID is invalid or missing prefab
                if (!enemyData || !enemyData.prefab) {
                    enemyData = db.getRandomEnemy();
                }
            } else {
                enemyData = db.getRandomEnemy();
            }

            if (enemyData && enemyData.prefab) {
                this._instantiateEnemy(enemyData);
                return;
            } else {
                // Debug: Why failed?
                if (!enemyData) console.warn("[GameManager] GameDatabase returned null EnemyData.");
                else if (!enemyData.prefab) console.warn(`[GameManager] EnemyData '${enemyData.id}' has no Prefab!`);
            }
        } else {
            if (this.frameCount % 60 === 0) {
                console.warn("[GameManager] No enemies found in GameDatabase runtime list!");
            }
        }
    }

    /**
     * 指定した EnemyData を実際にインスタンス化してenemyLayerに配置する共通処理。
     * ランダム抽選(spawnEnemy)・ID指定(spawnEnemyById)の両方から呼ばれる。
     */
    private _instantiateEnemy(enemyData: any): Node | null {
        if (!this.enemyLayer) {
            console.error("[GameManager] _instantiateEnemy failed: enemyLayer is null.");
            return null;
        }

        const node = instantiate(enemyData.prefab);
        node.parent = this.enemyLayer; // Prefab base ref
        this.forceUILayer(node);

        // Random X, Top Y
        const x = (Math.random() * GAME_SETTINGS.CANVAS_WIDTH) - (GAME_SETTINGS.CANVAS_WIDTH / 2);
        const y = (GAME_SETTINGS.CANVAS_HEIGHT / 2) + 50;
        node.setPosition(x, y, 0);

        const enemyComp = node.getComponent("Enemy") as any;
        if (enemyComp) {
            enemyComp.init(enemyData, this);
        }
        if (this.playState) {
            this.playState.totalEnemiesSpawned = (this.playState.totalEnemiesSpawned || 0) + 1;
        }
        console.log(`[GameManager] Spawned enemy: ${enemyData.id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        return node;
    }

    /**
     * 行動パターン検証用テストシーンから、IDを指定して敵を1体スポーンする。
     */
    public spawnEnemyById(id: string): Node | null {
        const db = this.gameDatabase || GameDatabase.instance;
        if (!db || !db.isReady) {
            console.warn(`[GameManager] spawnEnemyById('${id}') skipped: GameDatabase is NOT READY or null.`);
            return null;
        }

        const enemyData = db.getEnemyData(id);
        if (!enemyData || !enemyData.prefab) {
            console.warn(`[GameManager] spawnEnemyById('${id}') failed: EnemyData not found or has no Prefab.`);
            return null;
        }

        return this._instantiateEnemy(enemyData);
    }

    /**
     * 行動パターン検証用テストシーンから、現在出現している敵を全て破棄する。
     */
    public despawnAllEnemies(): void {
        if (!this.enemyLayer) return;
        // 走査中に破棄すると children が変化するため、事前に配列へコピーしてから破棄する。
        const children = this.enemyLayer.children.slice();
        for (const child of children) {
            child.destroy();
        }
    }

    /**
     * BehaviorGraphのMoveToノードから使うEnemyMovePointの座標を取得する。
     * id="0"(または空文字)は「現在地」を表す予約語のため、常にnullを返す
     * (呼び出し側=BehaviorRuntimeがその場合は敵の現在位置を使う)。
     */
    public getMovePoint(id: string): { x: number; y: number } | null {
        if (!id || id === "0") return null;
        const p = this.movePoints.get(id);
        return p ? { x: p.x, y: p.y } : null;
    }

    /**
     * SpawnTable(assets/resources/Excels/SpawnTables.csv)のIDを指定して出現テーブルを実行する。
     * 出現数はMin~Maxからランダムに1つ決め、Lotモードで実際に出す敵/デブリIDを決定する:
     *   - One:    候補から1種を抽選し、出現数分すべてそのIDで生成
     *   - Two:    候補から重複無しで2種を抽選し、出現枠ごとに毎回その2種のどちらかを抽選
     *   - Random: 出現枠ごとに毎回、候補全体からランダムに1つ選ぶ
     * DropTable抽選(Enemy.die())と同じ「候補配列からMath.random()で選ぶ」パターンを踏襲。
     * 出現サイクル(table.cycle: Instant/Rapid/Normal/Slow、CYCLE_INTERVAL_SECONDS参照)が
     * Instant以外の場合、1体ずつinterval秒間隔でscheduleOnceして時間差生成する(一斉湧き防止)。
     * そのため戻り値のspawnedIdsは「実際に生成済み」ではなく「今回のロールで生成予定」のID一覧
     * (呼び出し側=BehaviorTestControllerがデバッグログに反映する。Instantの場合のみ、この
     * 関数が返った時点で実際に生成済み)。見つからない/候補が無い等の異常系はnullを返す。
     * onSpawnedを渡すと、実際に1体生成される度(Instant/staggeredどちらの経路でも)に呼ばれる
     * ので、呼び出し側は進捗(例: "3/12")を組み立てられる。
     */
    public spawnFromSpawnTable(tableId: string, onSpawned?: () => void): { spawnedIds: string[] } | null {
        const db = this.gameDatabase || GameDatabase.instance;
        if (!db || !db.isReady) {
            console.warn(`[GameManager] spawnFromSpawnTable('${tableId}') skipped: GameDatabase is NOT READY or null.`);
            return null;
        }

        const table = db.getSpawnTableData(tableId);
        if (!table || !table.slots || table.slots.length === 0) {
            console.warn(`[GameManager] spawnFromSpawnTable('${tableId}') failed: SpawnTableData not found or has no slots.`);
            return null;
        }

        const min = Math.min(table.min, table.max);
        const max = Math.max(table.min, table.max);
        const count = Math.floor(Math.random() * (max - min + 1)) + min;

        const idsToSpawn: string[] = [];
        if (table.lot === "One") {
            const chosen = table.slots[Math.floor(Math.random() * table.slots.length)];
            for (let i = 0; i < count; i++) idsToSpawn.push(chosen);
        } else if (table.lot === "Two" && table.slots.length > 1) {
            // 重複無しで2種抽選 (候補が1種類しかない場合はRandomと同じ扱いにフォールバック)
            const pool = table.slots.slice();
            const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            const second = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            const pair = [first, second];
            for (let i = 0; i < count; i++) idsToSpawn.push(pair[Math.floor(Math.random() * pair.length)]);
        } else {
            // Random (またはTwoでも候補1種類しか無かった場合のフォールバック)
            for (let i = 0; i < count; i++) idsToSpawn.push(table.slots[Math.floor(Math.random() * table.slots.length)]);
        }

        // 出現サイクル: Instant(0秒)なら全部同一フレームで即時生成、それ以外は1体ずつ
        // interval秒間隔でscheduleOnceして時間差生成する(でないと出現数分が一斉湧きになる)。
        const interval = CYCLE_INTERVAL_SECONDS[table.cycle] ?? 0;
        const spawnOne = (id: string) => {
            // Instant以外は数百ms〜数秒後に呼ばれるので、その間にIngameを抜けている可能性がある
            // (Despawn/シーン切り替え等)。無効な状態で生成しないよう都度チェックする。
            if (this.state !== GameState.INGAME || !this.enemyLayer) return;
            const enemyData = db.getEnemyData(id);
            if (!enemyData || !enemyData.prefab) {
                console.warn(`[GameManager] spawnFromSpawnTable('${tableId}'): EnemyData '${id}' not found or has no Prefab, skipping.`);
                return;
            }
            this._instantiateEnemy(enemyData);
            if (onSpawned) onSpawned();
        };

        if (interval <= 0) {
            for (const id of idsToSpawn) spawnOne(id);
        } else {
            idsToSpawn.forEach((id, i) => {
                this.scheduleOnce(() => spawnOne(id), interval * i);
            });
        }

        console.log(`[GameManager] spawnFromSpawnTable('${tableId}'): Lot=${table.lot}, cycle=${table.cycle}(${interval}s), count=${count}, planned=[${idsToSpawn.join(', ')}]`);
        return { spawnedIds: idsToSpawn };
    }

    /**
     * 残り距離100km到達時に一度だけ出すGOAL接近予告のGUI演出。ゲームは止めず、
     * 短時間のテキストポップアップのみでプレイヤーに「そろそろゴール」を意識させる。
     */
    private showGoalApproachingCue() {
        console.log("[GameManager] Goal approaching (distance <= 100km). Showing cue.");

        const scene = director.getScene();
        const canvas = scene ? scene.getChildByName("Canvas") : null;
        if (!canvas) return;

        const node = new Node("GoalApproach_Text");
        canvas.addChild(node);
        node.setPosition(0, 180, 0);

        const lbl = node.addComponent(Label);
        lbl.string = "GOAL APPROACHING!";
        lbl.fontSize = 44;
        lbl.lineHeight = 50;
        lbl.color = Color.YELLOW;
        lbl.overflow = Label.Overflow.NONE;

        const outline = node.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 4;

        const trans = node.getComponent(UITransform) || node.addComponent(UITransform);
        trans.setContentSize(new Size(700, 80));

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;

        tween(node)
            .set({ scale: v3(0.7, 0.7, 1) })
            .to(0.3, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();

        tween(opacity)
            .to(0.25, { opacity: 255 })
            .delay(1.4)
            .to(0.5, { opacity: 0 })
            .call(() => node.destroy())
            .start();

        if (SoundManager.instance) {
            SoundManager.instance.playSE('powerup01', 'System');
        }
    }

    /**
     * GOAL到達直後の入り口。GOAL!!テキスト(showGoalText())とPlayerのアクロバット退場演出
     * (triggerPlayerAerobaticOutro())を同時に開始し、実際の画面遷移(finishGoalSequence())は
     * outroが終わるまで待つ。triggerPlayerAerobaticOutro()が最初にisPausedをtrueにするため、
     * 以後このフレーム以降update()冒頭のガード(state!==INGAME||isPaused)で再入が防止される。
     */
    private beginGoalSequence() {
        if (this.isPaused) return; // 既にoutro中/GOAL演出中
        console.log("[GameManager] GOAL Distance reached! Triggering sequence...");
        this.state = GameState.RESULT;

        // 残っている敵とPlayerのバフを撃破扱いにせず静かに消す(アイテムドロップ/撃破数加算/
        // 爆発演出なし)。outroやGOALロゴの邪魔にならないよう最初に片付けておく。
        this.clearEnemiesAndBuffsForGoal();

        // GOAL!!ロゴはoutroアニメーション(150フレーム)の完了を待たず、outroの開始と同時に出す
        // (アニメ終了後に出すと「間が悪い」というフィードバックのため)。一方、実際の画面遷移
        // (ブラックアウト→Result)はoutroが最後まで終わるのを待ってから行う
        // (finishGoalSequence()、triggerPlayerAerobaticOutro()のonComplete経由)。
        this.showGoalText();
        this.triggerPlayerAerobaticOutro(() => {
            this.finishGoalSequence();
        });
    }

    // GOAL到達時、残っている敵とPlayerのバフを撃破/消費扱いにせず静かに消す。Enemy.die()を
    // 経由するとアイテムドロップ/撃破数加算/爆発演出が全部走ってしまうため、あえて
    // node.destroy()を直接呼んで何もドロップさせずに片付ける。
    private clearEnemiesAndBuffsForGoal() {
        if (this.enemyLayer) {
            const enemies = this.enemyLayer.children.slice();
            for (const e of enemies) e.destroy();
        }

        const pCtrl = this.playerNode ? (this.playerNode.getComponent("PlayerController") as any) : null;
        if (pCtrl && pCtrl.resetBuffs) pCtrl.resetBuffs();
    }

    // bulletLayer上のPlayer弾(isEnemy===false)だけを破棄する。敵弾はそのまま残しても
    // 演出上問題ない(すぐ後のfinishGoalSequence()のブラックアウトで隠れる)ため対象外。
    private clearPlayerBullets() {
        if (!this.bulletLayer) return;
        const children = this.bulletLayer.children.slice();
        for (const c of children) {
            const b = c.getComponent("Bullet") as any;
            if (b && b.isEnemy === false) {
                c.destroy();
            }
        }
    }

    // GOAL接近中(残り100km以下)、Playerに重ねて半透明・赤点灯の警告オーラを表示する。
    // playerNodeの子として追従させるので、SideBarUI等の常設UIには一切影響しない
    // (以前ミッションを抜けても点灯しっぱなしになっていたのは、SideBar側のラベル更新が
    // isPaused/ステート遷移でそもそも呼ばれなくなり、自己リセット処理が実行されないまま
    // 止まっていたのが原因。今回はplayerNode配下に直接ぶら下げ、outro開始時/Home・Title遷移時に
    // 明示的にhideGoalWarning()を呼ぶことで同じ問題を避けている)。
    private showGoalWarning() {
        if (this.goalWarningNode || !this.playerNode) return;
        const node = new Node("GoalWarningGhost");
        node.addComponent(GoalWarningEffect);
        this.playerNode.addChild(node);
        node.setPosition(0, 0, 0);
        this.goalWarningNode = node;
    }

    private hideGoalWarning() {
        if (this.goalWarningNode) {
            if (this.goalWarningNode.isValid) this.goalWarningNode.destroy();
            this.goalWarningNode = null;
        }
    }

    /**
     * GOAL到達時、beginGoalSequence()がshowGoalText()と同時に呼ぶPlayerのアクロバット退場演出。
     * 弾を止め(isPaused=trueでcanControl()経由の新規発射/移動入力を止め、既存弾も明示的に破棄)、
     * playerOutroClip(Inspectorで割り当てたAnimationClip)があればそれを再生し、無ければ
     * 簡易tween版にフォールバックする。完了したらonComplete()(=finishGoalSequence())を呼ぶ。
     */
    private triggerPlayerAerobaticOutro(onComplete: () => void) {
        const pNode = this.playerNode;
        const pCtrl = pNode ? (pNode.getComponent("PlayerController") as any) : null;
        if (!pNode || !pCtrl) {
            onComplete();
            return;
        }

        console.log("[GameManager] Player aerobatic outro starting.");

        this.isPaused = true; // 新規発射/移動入力を止める(canControl()経由)
        this.clearPlayerBullets();
        this.hideGoalWarning();

        // 集中線バースト。outro開始と同時に長めに掛けることで、粒子が実際に画面を埋めるだけの
        // 時間を確保する(ParticleSystem2Dのspeed/emissionRateはCocosの仕様上、新規発生分にしか
        // 効かないため、短すぎると古い(遅い)粒子に埋もれて「確認できない」ほど薄まってしまう)。
        if (this.skyManager) {
            this.skyManager.triggerBurst(3.2, 6.0, 4.5);
        }

        if (this.playerOutroClip) {
            this.playAnimationClipOutro(pNode, onComplete);
        } else {
            this.playTweenFallbackOutro(pNode, pCtrl, onComplete);
        }
    }

    // playerOutroClip(Cocos純正Animation Editorで作成した.anim)がInspectorに割り当てられている
    // 場合の再生経路。位置/回転/スケールをまとめてキーフレームで自由に調整できるため、
    // 「旋回し続ける」「緩急をつける」といった作り込みはこちら側(エディタ上の作業)に任せる。
    //
    // AnimationClipはtweenと違い「現在値からの相対移動」ではなく絶対座標のキーフレームを
    // 再生する仕組みのため、再生開始の瞬間にPlayerの位置がクリップの最初のキーフレーム座標へ
    // 一瞬でスナップする。GOAL到達時、Playerは画面内のどこにいるか分からない(プレイヤー操作の
    // 結果なので)ため、再生直前に位置だけを固定の基準点(ローカル原点=Player.prefabを編集モードで
    // 開いた時に見える初期位置と同じ)へ矯正しておく - クリップ側はこの原点から動き始める前提で
    // キーフレームを打てば、実際のプレイ内容に関わらず毎回同じ見た目で再生される
    // (回転/スケールは通常のゲームプレイ中もpNode自体には触れていないため、リセット不要)。
    private playAnimationClipOutro(pNode: Node, onComplete: () => void) {
        pNode.setPosition(0, 0, 0);

        const anim = pNode.getComponent(Animation) || pNode.addComponent(Animation);
        anim.defaultClip = this.playerOutroClip;
        anim.play();

        if (SoundManager.instance) {
            SoundManager.instance.playSE('SE_Anim_Thruster2', 'Player');
        }

        anim.once(Animation.EventType.FINISHED, () => {
            if (pNode.isValid) pNode.active = false;
            onComplete();
        }, this);
    }

    // playerOutroClip未割り当て時の簡易フォールバック。専用グラフ/AnimationClipを用意するまでの
    // 繋ぎとして、tweenだけでスラローム→縮小消失の一連を再現する。
    private playTweenFallbackOutro(pNode: Node, pCtrl: any, onComplete: () => void) {
        const model: Node = pCtrl.model3D || null;
        const startScale = pNode.scale.clone();

        const burst = () => {
            if (!pNode.isValid) return;
            const wp = pNode.worldPosition;
            this.spawnExplosion(wp.x, wp.y, false);
            if (SoundManager.instance) SoundManager.instance.playSE('missile01', 'Player');
        };

        // スラローム経由点(Player自身のローカル座標系。原点付近を基準に左右へ振る)
        const p1 = v3(220, 90, 0);
        const p2 = v3(-220, 170, 0);
        const p3 = v3(180, -40, 0);
        const p4 = v3(-160, 100, 0);
        const vanish = v3(560, 420, 0);

        tween(pNode)
            .to(0.4, { position: p1 }, { easing: 'sineInOut' })
            .call(burst)
            .to(0.35, { position: p2 }, { easing: 'sineInOut' }) // 緩急: 短く速いターン
            .call(burst)
            .to(0.55, { position: p3 }, { easing: 'sineInOut' }) // 緩急: 長く溜める
            .call(burst)
            .to(0.3, { position: p4 }, { easing: 'sineInOut' })  // 緩急: また短く速く
            .to(0.15, { scale: v3(startScale.x * 1.15, startScale.y * 1.15, startScale.z * 1.15) })
            .to(0.6, { position: vanish, scale: v3(0.05, 0.05, 0.05) }, { easing: 'quadIn' })
            .call(() => {
                if (pNode.isValid) pNode.active = false;
                onComplete();
            })
            .start();

        // バンク(旋回)風の見た目。Node.angle(Z軸)は2D的な単純回転として安全にtween可能なため使う
        // (model3D.eulerAnglesの直接tweenはこのプロジェクトの既存コード(Enemy.ts)でも避けられている手法)。
        // 「旋回し続けないとしょぼい」フィードバックを踏まえ、往復角度の緩急を強めに付けてある。
        // ただしこれはあくまで簡易フォールバックであり、本格的に「回り続ける」「加減速する」演出は
        // playerOutroClip(Animation Editorで作るカーブ)側で作り込む想定(このメソッドの上のコメント参照)。
        if (model) {
            tween(model)
                .to(0.4, { angle: -35 }, { easing: 'sineInOut' })
                .to(0.35, { angle: 35 }, { easing: 'sineInOut' })
                .to(0.55, { angle: -20 }, { easing: 'sineInOut' })
                .to(0.3, { angle: 40 }, { easing: 'sineInOut' })
                .to(0.6, { angle: 0 }, { easing: 'sineInOut' })
                .start();
        }
    }

    // GOAL!!テキストのポップイン表示だけを担当する。beginGoalSequence()からoutro開始と同時に
    // 呼ばれる(outro完了を待たない)。実際の画面遷移はfinishGoalSequence()側が別途担当する。
    private showGoalText() {
        const scene = director.getScene();
        const canvas = scene ? scene.getChildByName("Canvas") : null;
        if (!canvas) return;

        if (SoundManager.instance) {
            SoundManager.instance.stopBGM(0.5);
            SoundManager.instance.playBGM("sounds/BGM/shooter_BGM_Result", 0.5);
        }

        const goalNode = new Node("GOAL_Text");
        canvas.addChild(goalNode);
        goalNode.setPosition(0, 0, 0);

        const lbl = goalNode.addComponent(Label);
        lbl.string = "GOAL!!";
        lbl.fontSize = 120;
        lbl.lineHeight = 130; // Prevent clipping
        lbl.color = Color.YELLOW;
        lbl.overflow = Label.Overflow.NONE;

        const outline = goalNode.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 6;

        const trans = goalNode.getComponent(UITransform) || goalNode.addComponent(UITransform);
        trans.setContentSize(new Size(800, 200));

        // Simple scale pop
        tween(goalNode)
            .set({ scale: v3(0, 0, 0) })
            .to(0.5, { scale: v3(1.1, 1.1, 1) }, { easing: 'backOut' })
            .to(0.2, { scale: v3(1, 1, 1) })
            .start();

        this._goalTextNode = goalNode;
    }

    // Playerのoutro(150フレームのAnimationClip、または簡易tween版)が完全に終わってから呼ばれる。
    // ブラックアウト→カメラ移動→Result画面遷移という「次画面への切り替え」はここに一本化し、
    // outroが終わるまで絶対に先へ進まないようにする。
    private finishGoalSequence() {
        const scene = director.getScene();
        const canvas = scene ? scene.getChildByName("Canvas") : null;
        if (!canvas) {
            // Canvasが見つからずブラックアウト演出自体を出せない異常系。カメラ移動が一瞬
            // 見えてしまう可能性はあるが、演出無しの即時完了ではこれが精一杯。
            if (this._goalTextNode && this._goalTextNode.isValid) this._goalTextNode.destroy();
            this._goalTextNode = null;
            this.applyCameraForState();
            this.onMissionComplete();
            return;
        }

        const blackout = new Node("Blackout");
        canvas.addChild(blackout);
        blackout.setPosition(0, 0, 0);
        blackout.addComponent(BlockInputEvents);

        const graphics = blackout.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 0);
        graphics.rect(-2000, -2000, 4000, 4000);
        graphics.fill();

        const opacity = blackout.addComponent(UIOpacity);
        tween(opacity)
            .to(0.5, { opacity: 255 })
            .call(() => {
                if (this._goalTextNode && this._goalTextNode.isValid) this._goalTextNode.destroy();
                this._goalTextNode = null;
                // 画面が完全に黒で覆われた今のタイミングでカメラ/CanvasをUI状態の座標
                // (640,360)へ移動する(以前はここより早く呼んでいたため、Ingame画面がまだ見えている
                // 状態でカメラだけ先にジャンプし、画面全体が一瞬(-640,-360)ずれて見えるバグがあった)。
                this.applyCameraForState();
                this.onMissionComplete();
                tween(opacity)
                    .delay(0.2)
                    .to(0.3, { opacity: 0 })
                    .call(() => blackout.destroy())
                    .start();
            })
            .start();
    }

    public onMissionComplete() {
        if (this.state === GameState.FAILURE) return; // Failure takes precedence

        console.log("Mission Complete!");

        // 1. Add Mission Reward with Time/No-Damage/All-Kills Bonus
        // ボーナス%は基礎報酬(rewardG)にのみ掛かる(荷物報酬rewardHは対象外)。3種のボーナスは
        // それぞれ独立に%を求めて合計してから1回だけ掛ける(複利ではなく単純加算)。
        // rewardG/rewardHが無い(旧来の固定ミッション等)場合はreward全体をrewardG扱いにフォールバックする。
        let actualReward = 0;
        let prevCredits = DataManager.instance ? DataManager.instance.data.money : 0;
        // ResultUIへそのまま渡すボーナス内訳(表示専用、計算はここが唯一の情報源)。
        let timeBonusPct = 0;
        let noDamageBonusPct = 0;
        let allKillsBonusPct = 0;
        const totalSpawnedForResult = this.playState.totalEnemiesSpawned || 0;

        if (this.currentMission && this.currentMission.reward > 0) {
            const rewardG = (typeof this.currentMission.rewardG === 'number') ? this.currentMission.rewardG : this.currentMission.reward;
            const rewardH = (typeof this.currentMission.rewardH === 'number') ? this.currentMission.rewardH : 0;
            const lv = this.currentMission.stars || 1;

            // 時間ボーナス: 目標タイムとの差が±TIME_BONUS_MARGIN_SEC以内はノーカウント(ボーナスも
            // ペナルティも無し)。それを超えて早ければ+10%、遅ければ-10%。
            const targetTime = this.currentMission.targetTime || 60;
            const timeDelta = this.playState.elapsedTime - targetTime; // 負=早い、正=遅い
            if (Math.abs(timeDelta) <= GameManager.TIME_BONUS_MARGIN_SEC) {
                timeBonusPct = 0;
                console.log(`[GameManager] Time bonus: none (within ±${GameManager.TIME_BONUS_MARGIN_SEC}s margin, delta=${timeDelta.toFixed(1)}s)`);
            } else if (timeDelta < 0) {
                timeBonusPct = 0.1;
                console.log("[GameManager] Time bonus: +10%");
            } else {
                timeBonusPct = -0.1;
                console.log("[GameManager] Time penalty: -10%");
            }

            // 被弾0ボーナス: +5% × MissionLv
            if ((this.playState.damageReceived || 0) <= 0) {
                noDamageBonusPct = 0.05 * lv;
                console.log(`[GameManager] No-damage bonus: +${(noDamageBonusPct * 100).toFixed(0)}%`);
                // AchievementManager.ts「初無傷クリア」実績用のカウンタ加算(判定はAchievementManagerのみが行う)。
                if (DataManager.instance) DataManager.instance.data.careerStats.noDamageClearCount++;
            }

            // 敵全滅ボーナス: +10% × MissionLv(gm.despawnAllEnemies()/GOAL時のclearEnemiesAndBuffsForGoal()は
            // 撃破扱いにしないためkilledEnemiesを増やさない = 未撃破のまま残っていれば全滅にならない)
            const killed = this.playState.killedEnemies || 0;
            if (totalSpawnedForResult > 0 && killed >= totalSpawnedForResult) {
                allKillsBonusPct = 0.1 * lv;
                console.log(`[GameManager] All-kills bonus: +${(allKillsBonusPct * 100).toFixed(0)}% (${killed}/${totalSpawnedForResult})`);
                // AchievementManager.ts「初全敵撃破クリア」実績用のカウンタ加算(判定はAchievementManagerのみが行う)。
                if (DataManager.instance) DataManager.instance.data.careerStats.allKillsClearCount++;
            }

            // AchievementManager.ts「Lv<NN>AllSubMissionClearCount」「MissionClearComplete」実績用。missionLv/subLvはMissionUI.
            // rollMissionsForPage()が付与する(旧来の固定ミッション等では未設定のためスキップ)。
            if (DataManager.instance && typeof this.currentMission.missionLv === 'number' && typeof this.currentMission.subLv === 'number') {
                const data = DataManager.instance.data;
                if (!data.clearedMissionSubLvs) data.clearedMissionSubLvs = {};
                const cleared = data.clearedMissionSubLvs[this.currentMission.missionLv] || [];
                if (!cleared.includes(this.currentMission.subLv)) cleared.push(this.currentMission.subLv);
                data.clearedMissionSubLvs[this.currentMission.missionLv] = cleared;
            }

            const bonusPct = timeBonusPct + noDamageBonusPct + allKillsBonusPct;
            actualReward = Math.floor(rewardG * (1 + bonusPct)) + rewardH;
            console.log(`[GameManager] Reward: rewardG=${rewardG} x(1+${bonusPct.toFixed(2)}) + rewardH=${rewardH} = ${actualReward}`);

            if (DataManager.instance) {
                DataManager.instance.addResource("credits", actualReward);
            }
        }

        // 2. Track Cleared Stage
        if (DataManager.instance) {
            const difficulty = this.currentMission ? (this.currentMission.stars || 1) : 1;
            DataManager.instance.incrementClearedStages(difficulty);
            DataManager.instance.save();
        }

        // 4. Apply ResultUI dynamically
        console.log("[GameManager] Showing ResultUI...");
        const node = new Node("ResultUI");

        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot.getChildByName("Canvas");
        if (canvasNode) {
            canvasNode.addChild(node);
        } else {
            this.node.addChild(node);
        }

        const resUI = node.addComponent(ResultUI);

        // Get stats from playState
        const enemies = this.playState.killedEnemies || 0;
        const items = this.playState.collectedItemsCount || 0;

        resUI.setup(enemies, items, 0, this.playState.itemsList, actualReward, prevCredits, {
            timeBonusPct, noDamageBonusPct, allKillsBonusPct,
            totalEnemiesSpawned: totalSpawnedForResult,
        });
    }

    /**
     * Transition back to Home with blackout and crossfade
     */
    public returnToHomeTransition(onArrived?: () => void) {
        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");
        if (!canvas) {
            this.goToHome();
            if (onArrived) onArrived();
            return;
        }

        const blackout = new Node("HomeTransitionBlackout");
        canvas.addChild(blackout);
        blackout.setSiblingIndex(canvas.children.length - 1);
        blackout.addComponent(BlockInputEvents);

        const graphics = blackout.addComponent(Graphics);
        graphics.fillColor = Color.BLACK;
        graphics.rect(-2000, -2000, 4000, 4000);
        graphics.fill();

        const opacity = blackout.addComponent(UIOpacity);
        opacity.opacity = 0;

        tween(opacity)
            .to(0.5, { opacity: 255 }) // Halved from 1.0
            .call(() => {
                // Crossfade BGM
                if (SoundManager.instance) {
                    SoundManager.instance.playBGM("sounds/BGM/Shooter_OutgameA", 1.0);
                }
                // Switch Content
                this.goToHome();
                if (onArrived) onArrived();

                // Fade out blackout after switching scene content
                this.scheduleOnce(() => {
                    tween(opacity)
                        .to(0.5, { opacity: 0 }) // Halved from 1.0
                        .call(() => {
                            if (blackout.isValid) blackout.destroy();
                        })
                        .start();
                }, 0.1);
            })
            .start();
    }

    // Prefabs/Bullets から名前で1件引く(拡張子省略可、GameDatabase.getPrefab()と同じ規約)。
    // 見つからなければnull(呼び出し側でbulletPrefabへフォールバックする)。
    private getBulletPrefab(name: string): Prefab | null {
        if (!name) return null;
        const cleanName = name.replace(".prefab", "");
        return this.bulletPrefabs.find(p => p.data.name === cleanName) || null;
    }

    // Bullet Factory. prefabNameを指定すると Prefabs/Bullets 内の該当Prefabを使う
    // (ShotRuntime.tsのFire/MultiFire/Missileノードのprefab切り替え用)。未指定/該当なしなら
    // 既定のbulletPrefabにフォールバックする。
    public spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, prefabName?: string): any {
        // prefabName指定ありなのにbulletPrefabsがまだ非同期ロード中だと、本来存在するはずの
        // PrefabがgetBulletPrefab()で見つからず、既定のbulletPrefab(見た目が違う)に化けてしまう。
        // 見た目が違う弾を出すより、起動直後のこの一瞬だけ発射をスキップする方が違和感が少ない。
        if (prefabName && !this.bulletPrefabsReady) {
            console.warn(`[GameManager] spawnBullet: prefabName='${prefabName}' requested but bulletPrefabs still loading - skipping this shot.`);
            return null;
        }
        const prefab = (prefabName && this.getBulletPrefab(prefabName)) || this.bulletPrefab;
        if (!prefab) {
            console.error("[GameManager] bulletPrefab is NULL! Cannot spawn bullet.");
            return null;
        }

        // Check if bulletLayer is assigned, if not, fallback to self or scene root
        let parent = this.bulletLayer;
        if (!parent) {
            console.warn("[GameManager] bulletLayer is NULL! Using GameManager node as parent.");
            parent = this.node;
        }

        const node = instantiate(prefab);
        node.parent = parent;
        this.forceUILayer(node);
        node.setPosition(x, y, 0);

        // Init Bullet Component
        const bulletComp = node.getComponent("Bullet") as any;
        if (bulletComp) {
            bulletComp.init(x, y, angle, speed, damage, isEnemy, this);
            return bulletComp;
        } else {
            console.error("[GameManager] 'Bullet' component missing on instantiated prefab!");
            return null;
        }
    }

    // prefabNameからPrefabs/Lasers内の該当Prefabを引く。見つからなければnull(spawnBullet()の
    // getBulletPrefab()と同じ方式だが、既定フォールバックPrefabは持たない)。
    private getLaserPrefab(name: string): Prefab | null {
        if (!name) return null;
        const cleanName = name.replace(".prefab", "");
        return this.laserPrefabs.find(p => p.data.name === cleanName) || null;
    }

    // Laser Beam Factory (ShotRuntime.tsのLaserノード用)。通常のBulletと違い、ownerNode
    // (自機/敵の発射元ノード)の子として生成し、そのまま自機に追従し続ける持続ビームにする。
    // duration秒後にLaserBeamコンポーネント自身が寿命切れで自己破壊する。
    public spawnLaserBeam(opts: SpawnLaserBeamOptions): any {
        const { ownerNode, angle, damage, damageInterval, duration, length, width, isEnemy, prefabName,
            particleLengthScale = 1.0, fadeOutDuration = 0.5, orbitRadius = 0, orbitSpeed = 0,
            orbitStartAngle = 0, modelSpinRate = 1.0, orbitOffsetX = 0, orbitOffsetY = 0, hitSoundId = "" } = opts;

        if (!this.laserPrefabsReady) {
            console.warn(`[GameManager] spawnLaserBeam: prefabName='${prefabName}' requested but laserPrefabs still loading - skipping this beam.`);
            return null;
        }
        const prefab = this.getLaserPrefab(prefabName);
        if (!prefab) {
            console.error(`[GameManager] spawnLaserBeam: Laser Prefab '${prefabName}' not found in Prefabs/Lasers.`);
            return null;
        }
        if (!ownerNode || !ownerNode.isValid) {
            console.warn("[GameManager] spawnLaserBeam: ownerNode is invalid, skipping.");
            return null;
        }

        // LaserBeamをownerNodeの直接の子にすると、Enemy.onBeginContact()の「相手ノードの親に
        // PlayerControllerが付いていればPlayer本体とみなす」というフォールバック判定に引っかかり、
        // ビームが敵に触れるたびに接触ダメージ(CDMG)がPlayerへ誤って入ってしまう(実際に報告された
        // バグ)。何もコンポーネントを持たない中間ノードを1つ挟むことでこれを回避する
        // (中間ノード自体はownerNodeの子として一緒に動くので追従には影響しない)。
        const anchor = new Node("LaserBeamAnchor");
        anchor.parent = ownerNode;
        anchor.setPosition(0, 0, 0);

        const node = instantiate(prefab);
        node.parent = anchor;
        this.forceUILayer(node);
        node.setPosition(0, 0, 0);
        node.angle = (angle * 180 / Math.PI) - 90;

        const laserComp = node.getComponent("LaserBeam") as any;
        if (laserComp) {
            laserComp.init({ damage, damageInterval, duration, length, width, isEnemy, gm: this, particleLengthScale, fadeOutDuration, modelSpinRate, hitSoundId });
            // orbitRadius>0の場合のみ周回モードを有効化(SweapBlade等のCircle系武器用、既定0=無効で
            // 従来通りの固定ビームのまま)。呼ぶとcollider.offsetが(0,0)にリセットされ、以後は
            // ownerNode中心にorbitRadius/orbitSpeedで周り続ける(applyOrbit()参照)。
            if (orbitRadius > 0 && typeof laserComp.applyOrbit === "function") {
                laserComp.applyOrbit({ radius: orbitRadius, speedDegPerSec: orbitSpeed, startAngleDeg: orbitStartAngle, offsetX: orbitOffsetX, offsetY: orbitOffsetY });
            }
            return laserComp;
        } else {
            console.error(`[GameManager] 'LaserBeam' component missing on instantiated Laser prefab '${prefabName}'! (Prefabs/Lasers/配下はLaserBeamコンポーネントが必要 - Prefabs/Bulletsで使うBulletコンポーネントとは別物なので、Bullet系Prefabを流用した場合は要確認)`);
            // node.destroy()だけだとanchor(LaserBeamAnchor、既にownerNodeの子として繋がっている)が
            // 子を失ったまま残り続けてしまう。呼び出し元(ShotRuntime.doLaser())が失敗時に
            // リトライする設計のため、anchorごと破棄しておかないと失敗のたびに空ノードが
            // ownerNode配下に溜まり続ける(実際に報告された不具合)。
            anchor.destroy();
            return null;
        }
    }

    // Enemyの最寄り探索 (ShotRuntime.tsのMissileノード, homing=ON時にプレイヤー発射のターゲットを
    // 決めるために使う。PlayerController.findNearestEnemy()の一般化版)。
    public findNearestEnemyTo(x: number, y: number): Node | null {
        if (!this.enemyLayer) return null;
        let nearest: Node | null = null;
        let minDistSq = Number.MAX_VALUE;
        for (const enemy of this.enemyLayer.children) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - x;
            const dy = enemy.position.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = enemy;
            }
        }
        return nearest;
    }

    // PT_<Category>Lv<NN>形式の改造パーツ素材ID(PT_ArmorLv01等)から末尾のLv番号を取り出し、
    // "Parts LvNN Get xN"という簡易表記を作る。ID自体にLvが無い(想定外の命名)場合はLv表記を省略する。
    private formatPartsPickupLabel(id: string, amount: number): string {
        const lvMatch = id.match(/Lv(\d+)/i);
        const lvText = lvMatch ? ` Lv${lvMatch[1]}` : '';
        return `Parts${lvText} Get x${amount}`;
    }

    // Item Factory
    public onItemCollected(id: string, amount: number, pos?: Vec3) {
        console.log(`[GameManager] onItemCollected called: ${id} x${amount} at ${pos}`);

        // Count it
        if (!this.playState.collectedItemsCount) this.playState.collectedItemsCount = 0;
        this.playState.collectedItemsCount++;

        const db = this.gameDatabase || GameDatabase.instance;
        const itemMaster = db ? db.getItemData(id) : null;
        const def = GAME_SETTINGS.ECONOMY.ITEMS[id];

        const name = itemMaster ? itemMaster.name : (def ? def.name : id);
        const effectType = itemMaster ? itemMaster.effectType : (def ? def.type : "None");
        const effectValue = itemMaster && itemMaster.effectValue > 0 ? itemMaster.effectValue : (def ? def.value || 0 : 0);
        const duration = itemMaster && itemMaster.duration > 0 ? itemMaster.duration : (def ? def.duration || 0 : 0);
        const rarity = def ? (def.rare || 1) : 1;

        const pCtrl = this.playerNode.getComponent("PlayerController") as any;

        // Effect Execution based on EffectType (Data-driven)
        switch (effectType) {
            case 'Heal':
                const healAmt = effectValue > 0 ? effectValue * amount : 20;
                if (UIManager.instance) UIManager.instance.showItemLog(`${name} (+${healAmt} HP)`, rarity, pos);
                SoundManager.instance.playSE("itemget01", "System");
                if (pCtrl && pCtrl.heal) pCtrl.heal(healAmt);
                break;

            case 'PowerUp':
                const pVal = effectValue > 0 ? effectValue : 0.5;
                const pDur = duration > 0 ? duration : 10;
                if (UIManager.instance) {
                    UIManager.instance.showBuffNotification("POWER UP!", new Color(255, 50, 50), pos);
                    UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                }
                SoundManager.instance.playSE("powerup01", "System");
                if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Power", pDur, pVal);
                break;

            case 'RapidFire':
                const rVal = effectValue > 0 ? effectValue : 0.5;
                const rDur = duration > 0 ? duration : 10;
                if (UIManager.instance) {
                    UIManager.instance.showBuffNotification("RAPID FIRE!", new Color(0, 150, 255), pos);
                    UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                }
                SoundManager.instance.playSE("powerup01", "System");
                if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Rapid", rDur, rVal);
                break;

            case 'Credit':
                const crAmt = (effectValue > 0 ? effectValue : 10) * amount;
                if (DataManager.instance) DataManager.instance.addResource("credits", crAmt);
                SoundManager.instance.playSE("coin01", "System");
                if (UIManager.instance) UIManager.instance.showItemLog(`Credits +${crAmt}`, 1, pos);
                break;

            case 'Exp':
                const expAmt = (effectValue > 0 ? effectValue : 10) * amount;
                if (DataManager.instance) DataManager.instance.addResource("exp", expAmt);
                SoundManager.instance.playSE("coin01", "System");
                if (UIManager.instance) UIManager.instance.showItemLog(`EXP +${expAmt}`, 1, pos);
                break;

            case 'Material':
            case 'UnlockTrigger':
                const matAmt = (effectValue > 0 ? effectValue : 1) * amount;
                if (DataManager.instance && DataManager.instance.addResource) {
                    DataManager.instance.addResource(id, matAmt);
                }
                SoundManager.instance.playSE("itemget01", "System");
                if (UIManager.instance) {
                    // PT_で始まる改造パーツ素材は正式名称(Items.csvのName、"Armor reinforcement_Lv01"等)が
                    // 長く、画面上のポップアップでは見づらいため"Parts LvNN Get xN"の簡易表記にする。
                    // 実際に何を取得したかはResult画面(playState.itemsList→ResultUI.ts)側で正式名称を表示する。
                    const pickupLabel = id.startsWith('PT_') ? this.formatPartsPickupLabel(id, matAmt) : `🔩 ${name} +${matAmt}`;
                    UIManager.instance.showItemLog(pickupLabel, rarity, pos);
                }
                break;

            default:
                // General Item or None
                if (UIManager.instance) UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                SoundManager.instance.playSE("itemget01", "System");
                break;
        }

        // --- Multi-item Listing for Result screen ---
        let exist = this.playState.itemsList.find((it: any) => it.id === id);
        if (exist) {
            exist.amount += amount;
        } else {
            this.playState.itemsList.push({ id, name, amount, rare: rarity });
        }
    }

    public spawnItem(x: number, y: number, id: string, amount: number) {
        if (!this.itemLayer) {
            console.warn(`[GameManager] spawnItem aborted: itemLayer is missing!`);
            return;
        }

        let node: Node = null;
        // 1. Items.csvのPrefabNameでPrefabs/ItemParts配下から専用Prefabを探す(Enemyと同じ方式)。
        const db = this.gameDatabase || GameDatabase.instance;
        const dedicatedPrefab = db ? db.getItemPrefab(id) : null;
        if (dedicatedPrefab) {
            node = instantiate(dedicatedPrefab);
        } else if (this.itemPrefab) {
            // 2. 専用Prefabが無ければInspector割り当ての汎用Prefabにフォールバック。
            console.log(`[GameManager] No dedicated prefab for '${id}' in Prefabs/ItemParts. Falling back to generic itemPrefab.`);
            node = instantiate(this.itemPrefab);
        } else {
            // 3. どちらも無ければ最終手段として無地四角を即席生成する。
            console.log(`[GameManager] No prefab found for '${id}'. Creating item programmatically...`);
            node = new Node("Item_" + id);

            // Add Visual (Sprite)
            const transform = node.addComponent(UITransform);
            transform.setContentSize(40, 40);

            const sprite = node.addComponent(Sprite);
            // Color will be set in Item.init() based on type

            // Add Physics (Collider)
            const collider = node.addComponent(BoxCollider2D);
            collider.size.width = 40;
            collider.size.height = 40;
            collider.sensor = true; // Non-blocking

            // Add Script
            node.addComponent("Item");
        }

        node.parent = this.itemLayer;
        this.forceUILayer(node);
        node.setPosition(x, y, 0);

        const itemComp = node.getComponent("Item") || node.addComponent("Item") as any;
        if (itemComp) {
            itemComp.init(id, amount, this);
            console.log(`[GameManager] Registered Item: ${id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        } else {
            console.warn(`[GameManager] Item component could not be added/found for ${id}`);
        }
    }

    public spawnItemFromPrefab(prefab: Prefab, x: number, y: number) {
        if (!prefab || !this.itemLayer) return;

        const node = instantiate(prefab);
        node.parent = this.itemLayer;
        this.forceUILayer(node);
        node.setPosition(x, y, 0);

        // Init Item
        const itemComp = node.getComponent("Item") as any;
        // ...
    }

    public spawnDamageText(x: number, y: number, amount: number, isKill: boolean) {
        if (UIManager.instance) {
            UIManager.instance.spawnDamageText(x, y, amount, isKill);
        }
    }

    public spawnExplosion(x: number, y: number, isKill: boolean = false) {
        // Increment kill count if applicable
        if (isKill) {
            if (!this.playState.killedEnemies) this.playState.killedEnemies = 0;
            this.playState.killedEnemies++;
        }

        // Dynamic Load Explosion effect
        resources.load("Prefabs/Particle/ExplosionA", Prefab, (err, prefab) => {
            if (err) {
                console.warn("[GameManager] Failed to load ExplosionA:", err);
                return;
            }
            if (!this.node || !this.node.isValid) return;

            const node = instantiate(prefab);
            // Spawn in content layer or bullet layer? Let's use bulletLayer as a "VFX" layer fallback
            node.parent = this.enemyLayer || this.node.parent;

            // USE World Position to avoid (640, 360) offset issues from Canvas/Layers
            node.setWorldPosition(new Vec3(x, y, 0));

            // Auto-destruct after 1.5s (Typical for Cocos particle FX if not set to auto-remove)
            this.scheduleOnce(() => {
                if (node.isValid) node.destroy();
            }, 2.0);
        });
    }

    public onGameOver() {
        if (this.state === GameState.FAILURE) return;
        this.state = GameState.FAILURE;
        this.applyCameraForState();
        console.log("Game Over!");

        // Reset Buffs
        const pCtrl = this.playerNode?.getComponent("PlayerController") as any;
        if (pCtrl && pCtrl.resetBuffs) pCtrl.resetBuffs();

        // Save progress (collected items etc)
        DataManager.instance.save();

        if (UIManager.instance) {
            UIManager.instance.showGameOver();
        }

        SoundManager.instance.stopBGM(1.0);
    }
}
