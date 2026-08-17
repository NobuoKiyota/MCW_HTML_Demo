import { _decorator, Prefab, CCInteger, CCFloat } from 'cc';
const { ccclass, property } = _decorator;

/**
 * ドロップアイテムの定義
 * プレハブと確率、個数を定義する
 */
@ccclass('LootDropItem')
export class LootDropItem {

    @property({ type: Prefab, tooltip: "ドロップするアイテムのプレハブ" })
    public itemPrefab: Prefab = null;

    @property({ type: CCFloat, tooltip: "ドロップ確率 (0.0 - 1.0)" })
    public dropRate: number = 0.5;

    @property({ type: CCInteger, tooltip: "最小個数" })
    public minCount: number = 1;

    @property({ type: CCInteger, tooltip: "最大個数" })
    public maxCount: number = 1;

    @property({ type: CCFloat, tooltip: "重み (抽選テーブル用 - 将来拡張)" })
    public weight: number = 10;
}

/**
 * 行動グラフ内の1ノード (ランタイム用プレーンデータ、@ccclass不要)
 */
export interface BehaviorGraphNode {
    id: number;
    type: "Start" | "Move" | "MoveTo" | "Wait" | "Branch" | "Loop" | "Spin" | "Punch" | "Attack" | "Reroute" | "Comment" | "Random";
    params?: { [key: string]: any };
    next?: number;      // Start/Move/Wait/Loop の通常遷移先ノードID
    trueNext?: number;  // Branch: 条件成立時の遷移先ノードID
    falseNext?: number; // Branch: 条件不成立時の遷移先ノードID
}

/**
 * 行動グラフ (ランタイム用プレーンデータ、@ccclass不要)
 * assets/resources/Data/Behaviors/*.json をそのままパースした形
 */
export interface BehaviorGraph {
    id: string;
    nodes: BehaviorGraphNode[];
}

/**
 * ショットグラフ内の1ノード (ランタイム用プレーンデータ、@ccclass不要)
 * BehaviorGraphNodeと同型だが、type語彙が発射系(Fire/MultiFire/Missile/PMissile/Laser)になる。
 * Start/Wait/Branch/Loop/Random/Reroute/CommentはBehaviorGraphと共通の意味を持つ
 * (エディタ側でも同じLiteGraphノードクラス(behavior/*)をそのまま流用する)。
 * PMissileは自機後方の左右スラスター(lm/rm)からLRLRL…の順に発射し、放物線状(2次関数)の
 * 初速アークを描いた後に直進/ホーミングへ移行する専用ノード(ShotRuntime.doPMissilePellet()/
 * Bullet.applyArc()参照)。
 * Laserは自機/敵に追従し続ける持続ビームで、duration秒間フローをブロックしながら接触相手に
 * damageInterval秒おきdamageを与え続ける(ShotRuntime.doLaser()/LaserBeam.ts参照、
 * Bullet.tsとは別の専用コンポーネントで実装されている)。
 */
export interface ShotGraphNode {
    id: number;
    type: "Start" | "Fire" | "MultiFire" | "Missile" | "PMissile" | "Laser" | "Wait" | "Branch" | "Loop" | "Random" | "Reroute" | "Comment";
    params?: { [key: string]: any };
    next?: number;
    trueNext?: number;
    falseNext?: number;
}

/**
 * ショットグラフ (ランタイム用プレーンデータ、@ccclass不要)
 * assets/resources/Data/ShotPatterns/*.json をそのままパースした形
 */
export interface ShotGraph {
    id: string;
    nodes: ShotGraphNode[];
}

/**
 * 敵の行動データ (Behavior)
 * 実体の行動ロジックはノードグラフ(BehaviorGraph)としてJSONに切り出し、
 * ここではそのJSONアセットへの参照(graphPath)のみを持つ。
 */
@ccclass('BehaviorData')
export class BehaviorData {
    @property
    public id: string = "";

    @property({ tooltip: "行動グラフJSONのresourcesパス (例: Data/Behaviors/BH_ZAKO_BASIC)" })
    public graphPath: string = "";

    @property
    public note: string = "";

    // Runtime Cache (GameDatabaseがresources.loadで読み込んだグラフをここに格納)
    public _graph: BehaviorGraph | null = null;
}

/**
 * 発射パターンデータ (ShotPattern)
 * BehaviorDataと同型。実体の発射ロジックはノードグラフ(ShotGraph)としてJSONに切り出し、
 * ここではそのJSONアセットへの参照(graphPath)のみを持つ。プレイヤー・エネミー共通で使う。
 */
@ccclass('ShotPatternData')
export class ShotPatternData {
    @property
    public id: string = "";

    @property({ tooltip: "発射グラフJSONのresourcesパス (例: Data/ShotPatterns/SP_ZAKO_BASIC)" })
    public graphPath: string = "";

    @property
    public note: string = "";

    // Runtime Cache (GameDatabaseがresources.loadで読み込んだグラフをここに格納)
    public _graph: ShotGraph | null = null;
}

export enum ItemType {
    Score = "Score",
    Heal = "Heal",
    Misc = "Misc",
    Buff = "Buff",
    PowerUp = "PowerUp",
    Weapon = "Weapon",
    Material = "Material"
}

export enum ItemEffectType {
    Heal = "Heal",
    PowerUp = "PowerUp",
    RapidFire = "RapidFire",
    Credit = "Credit",
    Exp = "Exp",
    Score = "Score",
    Material = "Material",
    UnlockTrigger = "UnlockTrigger",
    None = "None"
}

/**
 * アイテムデータ (ItemMaster)
 */
@ccclass('ItemData')
export class ItemData {
    @property
    public id: string = "";

    @property
    public name: string = "";

    @property
    public prefabName: string = "";

    @property
    public type: string = "";

    @property({ tooltip: "効果タイプ: Heal, PowerUp, RapidFire, Credit, Exp, Score, Material, UnlockTrigger, None" })
    public effectType: string = "None";

    @property({ type: CCFloat, tooltip: "効果の数値 (回復量, スコア, バフ倍率等)" })
    public effectValue: number = 0;

    @property({ type: CCFloat, tooltip: "効果の持続時間 (秒)" })
    public duration: number = 0;

    @property({ type: CCInteger })
    public min: number = 1;

    @property({ type: CCInteger })
    public max: number = 1;

    @property({ type: CCFloat })
    public weight: number = 10;

    @property({ type: CCFloat, tooltip: "1個あたりの売却額。Materialアイテムが所持数上限(99)を超えた場合、超過分の自動売却に使う(DataManager.addResource参照)" })
    public sellPrice: number = 0;

    @property
    public note: string = "";
}

export interface DropItemSlot {
    itemId: string;
    rate: number;
}

/**
 * ドロップテーブルデータ (DropTable)
 * 最大5つのアイテムID＋確率を管理
 */
@ccclass('DropTableData')
export class DropTableData {
    @property
    public id: string = "";

    public slots: DropItemSlot[] = [];

    @property
    public note: string = "";
}

/**
 * 出現テーブルデータ (SpawnTable)
 * 1つのIDに対して最大8つの敵/デブリID(slots)＋出現数範囲(min/max)＋抽選モード(lot)を持つ。
 * DropTableData/DropItemSlotと同じ「固定スロット＋Math.random()抽選」パターン。
 * ミッション側はこのSpawnTableを距離区間ごとに組み合わせて出現パターンを構成する想定
 * (dist は将来ミッション側の「残り距離がこの値付近」等の条件付けに使うためのフィールドで、
 * 現時点ではデータとして保持するのみ)。
 */
@ccclass('SpawnTableData')
export class SpawnTableData {
    @property
    public id: string = "";

    @property({ type: CCFloat, tooltip: "難易度レベル" })
    public lv: number = 1;

    @property({ type: CCFloat, tooltip: "同一Lv内での強弱順(小さいほど弱い)。ミッション生成時、選出したSpawnTableをこの値の昇順で並べて再生する" })
    public subLv: number = 1;

    @property({ type: CCFloat, tooltip: "この行が有効になる距離(ミッション側で合算し、区間合計距離Bとして使用する)" })
    public dist: number = 0;

    @property({ type: CCInteger, tooltip: "最小出現数" })
    public min: number = 1;

    @property({ type: CCInteger, tooltip: "最大出現数" })
    public max: number = 1;

    @property({ tooltip: "抽選モード: One(1種を選び出現数分全てそのID) / Two(2種を選び出現枠ごとにどちらか抽選) / Random(出現枠ごとに全候補から毎回抽選)" })
    public lot: string = "Random";

    @property({ tooltip: "出現サイクル(1体ずつ生成する間隔のプリセット): Instant(全て同時) / Rapid / Normal / Slow。実際の秒数はGameManager側のプリセット表で計算する(CSVに秒数を直接手打ちしない)" })
    public cycle: string = "Instant";

    public slots: string[] = []; // TypeID_1..12 のうち "None" 以外の値のみ

    @property
    public note: string = "";
}

/**
 * ミッション難易度テーブル (assets/resources/Excels/MissionDifficulty.csv)
 * 機体の総改造回数(modCount)がModCountMin以上になった行のうち、最もModCountMinが大きい行を
 * 採用する形で「現在の難易度Lv」と「ミッション生成時に組み合わせるSpawnTable本数」を決める。
 * 同じLv内でも改造が進むほど(=ModCountMinが大きい行を踏むほど)TableCountが増えていく想定
 * (例: Lv1/ModCountMin2/TableCount4 → 改造が進みLv1/ModCountMin6/TableCount5に切り替わる)。
 */
@ccclass('MissionDifficultyData')
export class MissionDifficultyData {
    @property({ type: CCInteger, tooltip: "難易度レベル" })
    public lv: number = 1;

    @property({ type: CCInteger, tooltip: "この行が適用される総改造回数の下限(この値以上で適用)" })
    public modCountMin: number = 0;

    @property({ type: CCInteger, tooltip: "ミッション生成時に組み合わせるSpawnTableの本数" })
    public tableCount: number = 3;

    // SpawnTableID_1~8(各列プルダウンでSpawnTables.csvのID or Noneを選ぶ、TypeID_1~12等と同じ
    // 規約)のうちNoneでない値だけをまとめたもの。空(=全列None)なら従来通りlv一致の全SpawnTable行を
    // 候補にする(後方互換、BehaviorTestController.refreshMissionPreview()参照)。
    public spawnTableIds: string[] = [];

    @property
    public note: string = "";
}

/**
 * Customize画面グリッドのセル解放コスト (assets/resources/Excels/GridCells.csv)
 * どのセルか(x,y)ではなく、「プレイヤーがこれまでに何回セルを購入したか」という通し番号
 * (Tier、1回目/2回目/3回目…)でコストを引く。CustomizeCalc.countPurchasedCells()が
 * DataManager.data.gridData.layoutと初期テンプレート(GAME_SETTINGS.SHIP_LAYOUT)の"2"の
 * 個数差から購入済み回数を算出し、次のTier(購入済み回数+1)の行をここから引く。
 * 該当Tierの行が無い場合は、定義済みの中で最大のTierの行にフォールバックする(それも無ければ
 * GAME_SETTINGS.ECONOMY.CELL_UNLOCK_COSTの固定値・アイテム無しにフォールバック、後方互換)。
 */
@ccclass('GridCellData')
export class GridCellData {
    @property({ type: CCInteger, tooltip: "何回目の解放か(1回目/2回目/3回目…)" })
    public tier: number = 1;

    @property({ type: CCFloat, tooltip: "この回の解放に必要なクレジット" })
    public unlockCost: number = 200;

    // UnlockItemID_1/UnlockItemQty_1 ~ _3(最大3種類、EquipmentDataのunlockItemsと同じ規約)。
    // ItemIDが空の枠は無視する。GameDatabase.parseGridCellCSV()が設定する。
    public unlockItems: IUnlockItemRequirement[] = [];

    @property
    public note: string = "";
}

/**
 * 機体永続強化パラメータ定義 (assets/resources/Excels/PlayerUpgrade.csv)
 * PlayerManager(実装予定)が、MinValue/MaxValue/GrowthType/MaxLvから各Lv1..MaxLvの実値・必要コストを
 * べき指数カーブで自動計算する際の元データ。GrowthTypeの5種と指数の対応はMasterManagerパネルの
 * プレビュー計算式(index.js)と実行時計算式(将来PlayerManager.ts側に実装)で一致させる必要がある。
 */
@ccclass('PlayerUpgradeParamData')
export class PlayerUpgradeParamData {
    @property
    public paramId: string = "";

    @property
    public label: string = "";

    @property({ type: CCFloat, tooltip: "Lv1(未強化)時点の値" })
    public minValue: number = 0;

    @property({ type: CCFloat, tooltip: "MaxLv到達時の値" })
    public maxValue: number = 0;

    @property({ tooltip: "成長傾向: 超早熟/早熟/標準/晩成/超晩成" })
    public growthType: string = "標準";

    @property({ type: CCInteger, tooltip: "コスト計算の基準となるパラメータ価値(★の数)" })
    public starValue: number = 1;

    @property({ tooltip: "強化に必要なアイテムの分類(装甲強化パーツ/高性能エンジンパーツ/電脳強化パーツ)" })
    public materialCategory: string = "";

    @property({ type: CCInteger, tooltip: "最大レベル" })
    public maxLv: number = 20;
}

/**
 * 装備品の固定形状定義 (assets/resources/Excels/Equipment.csv)
 * Customize画面のグリッド(最大8x8)に配置する武器/装備のマス形状を、基準セル(0,0)からの
 * 相対座標リストで持つ。回転は無し(固定向き)。座標は各1桁(0~7)なので、CSV上は
 * カンマを使わず"xy"を2文字1組として";"区切りで並べる(Master Managerパネル側のCSV
 * 読み書きがダブルクォート内カンマに対応していないため、カンマは使わない)。
 * 例: "00;10" = (0,0)と(1,0)の2マス。
 */
// UnlockItemID_1~3/UnlockItemQty_1~3をパースした結果。EquipmentUnlock.ts参照。
export interface IUnlockItemRequirement {
    itemId: string; // Items.csvのID
    qty: number;
}

@ccclass('EquipmentData')
export class EquipmentData {
    @property
    public id: string = "";

    @property
    public name: string = "";

    @property({ tooltip: "分類: Weapon/Armor/Utility等" })
    public category: string = "";

    // ShapeCells文字列をパース済みの{x,y}配列。GameDatabase.parseEquipmentCSV()が設定する。
    public shapeCells: { x: number; y: number }[] = [];

    @property
    public note: string = "";

    @property({ type: CCFloat, tooltip: "解放に必要なクレジット(0=最初から解放済み、UnlockItemsも空の場合のみ)。DataManager.data.unlockedEquipmentIdsとセットで使う(EquipmentUnlock.ts参照)" })
    public unlockCost: number = 0;

    // UnlockItemID_1/UnlockItemQty_1 ~ UnlockItemID_3/UnlockItemQty_3(最大3種類)をパースした結果。
    // ItemIDが空の枠は無視する。GameDatabase.parseEquipmentCSV()が設定する。
    public unlockItems: IUnlockItemRequirement[] = [];

    // 非武器パーツ(Armor/Utility等)の重量(CustomizeCalc.computeEquippedWeight()参照)。
    // Category=Weaponの行はWeaponData.weight(Weapons.csv)側が重量の情報源なので、
    // 二重計上を避けるためこちらは0のままにしておく想定。
    @property({ type: CCFloat, tooltip: "装備重量(非武器パーツのみ使用。武器はWeapons.csv側のWeightが情報源)" })
    public weight: number = 0;
}

/**
 * 武器マスタデータ (assets/resources/Excels/Weapons.csv)
 * 装備としてのメタデータ(StarValue/Group/Category等、Weightのみ二重管理を避けるためEquipment.csv
 * (equipmentId経由の_equipment.weight)に一元化済み)＋Lv別成長パラメータを持ち、
 * ShotPatternIDで実際の発射グラフ(ShotPatternData)と紐付ける。PlayerUpgradeParamDataと同じく
 * MinValue/MaxValue/GrowthType/MaxLvから各Lvの実値をべき指数カーブで計算する想定だが、
 * 対象パラメータがSP/Dmg/Scale/WTの4つ(min===maxの列は成長しない扱い)ある点が異なる
 * (WeaponCalc.ts参照、extensions/master-manager/panels/default/index.jsのプレビュー計算式と一致させること)。
 */
@ccclass('WeaponData')
export class WeaponData {
    @property
    public id: string = "";

    @property
    public name: string = "";

    @property({ tooltip: "発射グラフ(ShotPatternData)のID (assets/resources/Excels/ShotPatterns.csv)" })
    public shotPatternId: string = "";

    @property({ type: CCInteger, tooltip: "排他グループ(同グループ内は1つしか装備できない、等の将来ルール用)" })
    public group: number = 1;

    // 装備コスト(CP消費等)はEquipment.csv(EquipmentData.weight、_equipment経由)に一元化した。
    // 以前はWeapons.csv側にも同名のWeight列があり二重管理になっていたため、こちらは削除済み。

    @property({ type: CCInteger, tooltip: "パラメータ価値(★の数)。ShapeCellsの形状とは非連動" })
    public starValue: number = 1;

    @property({ tooltip: "攻撃タイプ: Fire/Wide/Missile/Laser/Wave/Circle" })
    public type: string = "Fire";

    @property({ type: CCInteger, tooltip: "貫通するか(0/1)" })
    public penetrate: number = 0;

    @property({ tooltip: "武器カテゴリ(将来のグルーピング/表示用の任意ラベル)" })
    public category: string = "";

    @property({ type: CCInteger, tooltip: "誘導(ホーミング)するか(0/1)" })
    public isHoming: number = 0;

    @property({ type: CCInteger, tooltip: "Lv1時点の発射数" })
    public countMin: number = 1;

    @property({ type: CCInteger, tooltip: "MaxLv到達時の発射数" })
    public countMax: number = 1;

    @property({ type: CCFloat, tooltip: "Lv1時点のSP(弾速)" })
    public spMin: number = 0;

    @property({ type: CCFloat, tooltip: "MaxLv到達時のSP" })
    public spMax: number = 0;

    @property({ type: CCFloat, tooltip: "Lv1時点のダメージ" })
    public dmgMin: number = 0;

    @property({ type: CCFloat, tooltip: "MaxLv到達時のダメージ" })
    public dmgMax: number = 0;

    @property({ type: CCFloat, tooltip: "Lv1時点のスケール(弾の大きさ/レーザー幅等)" })
    public scaleMin: number = 1;

    @property({ type: CCFloat, tooltip: "MaxLv到達時のスケール" })
    public scaleMax: number = 1;

    @property({ type: CCFloat, tooltip: "Lv1時点のWT(発射間隔、秒。Lvが上がるほど小さくなり連射が速くなる想定)" })
    public wtMin: number = 0;

    @property({ type: CCFloat, tooltip: "MaxLv到達時のWT" })
    public wtMax: number = 0;

    @property({ tooltip: "成長傾向: 超早熟/早熟/標準/晩成/超晩成 (PlayerUpgradeParamDataと同じ対応表)" })
    public growthType: string = "標準";

    @property({ type: CCInteger, tooltip: "最大レベル" })
    public maxLv: number = 10;

    @property
    public note: string = "";

    @property({ tooltip: "Equipment.csv(EquipmentData)側のID。Customize画面グリッド用の形状を紐付ける(未設定なら形状未定義のまま)。解放条件(UnlockCost等)もこちらのEquipmentData側で管理する(EquipmentUnlock.ts参照)" })
    public equipmentId: string = "";

    // Runtime Cache (GameDatabaseがequipmentId経由で解決する。EnemyDataの_shotPattern等と同じ規約)
    public _equipment: EquipmentData = null;
}

/**
 * ドロップテーブルデータ (旧互換用 DropData)
 */
@ccclass('DropData')
export class DropData {
    @property
    public id: string = "";

    // どのアイテムが出るか
    @property
    public itemId: string = "";

    @property({ type: CCFloat })
    public rate: number = 0.5;

    @property({ type: CCInteger })
    public min: number = 1;

    @property({ type: CCInteger })
    public max: number = 1;
}

/**
 * 敵データ (Master)
 * 他のテーブルを参照するIDを持つ
 */
@ccclass('EnemyData')
export class EnemyData {

    @property({ tooltip: "ユニークID (例: EN001)" })
    public id: string = "";

    @property({ tooltip: "表示名" })
    public name: string = "Enemy";

    @property({ type: Prefab, tooltip: "敵のプレハブ" })
    public prefab: Prefab = null;

    @property({ type: CCInteger, tooltip: "HP", min: 1 })
    public hp: number = 100;

    @property({ type: CCInteger, tooltip: "防御力 (固定値減少)" })
    public defense: number = 0;

    @property({ type: CCInteger, tooltip: "Playerとの機体接触時に与える固定ダメージ(CDMG)" })
    public contactDamage: number = 10;

    @property({ type: CCInteger, tooltip: "撃破時のスコア" })
    public score: number = 100;

    // --- References ---

    @property({ tooltip: "行動パターンID" })
    public behaviorId: string = "";

    @property({ type: CCFloat, tooltip: "速度倍率" })
    public speedMult: number = 1.0;

    @property({ tooltip: "発射パターンID" })
    public shotPatternId: string = "";

    @property({ tooltip: "ドロップテーブルID" })
    public dropTableId: string = "";

    public get dropId(): string { return this.dropTableId; }
    public set dropId(v: string) { this.dropTableId = v; }

    @property({ tooltip: "3Dモデル(glTF)のresourcesパス。空なら従来通り2Dスプライトのみ表示 (例: Gltf/Enemies/Common/Enemy006)" })
    public model3DPath: string = "";

    @property({ type: CCFloat, tooltip: "3Dモデルの初期Y軸回転(度)。モデルの向きがゲーム内で逆な場合に180などを指定" })
    public model3DYRot: number = 0;

    @property({ type: CCFloat, tooltip: "敵Prefabノード全体に対する一律スケール倍率(x, y, z等倍率)" })
    public scale: number = 1.0;

    // Runtime Cache (Optional, populated by DB)
    public _behavior: BehaviorData = null;
    public _shotPattern: ShotPatternData = null;
    public _dropTable: DropTableData = null;
    public _drops: DropData[] = [];
    public _isFromCSV: boolean = false; // Validation Flag
}

/**
 * サウンドデータ (Sound)
 */
@ccclass('SoundData')
export class SoundData {
    @property
    public id: string = "";

    @property({ tooltip: "Resource Path relative to assets/resources/" })
    public path: string = "";

    @property({ type: CCFloat, tooltip: "音量倍率 (0.0 - 1.0)" })
    public volume: number = 1.0;

    @property({ type: CCFloat, tooltip: "重複再生防止期間 (秒)" })
    public cooldown: number = 0.05;

    @property({ type: CCInteger, tooltip: "同時再生制限数 (0は無制限)" })
    public limit: number = 0;

    @property({ type: CCInteger, tooltip: "優先度 (0: 後発優先/古いのを消す, 1: 先発優先/新しいのを無視)" })
    public priority: number = 0;
}
