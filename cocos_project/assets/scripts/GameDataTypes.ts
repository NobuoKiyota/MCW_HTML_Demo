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
 * BehaviorGraphNodeと同型だが、type語彙が発射系(Fire/MultiFire/Missile)になる。
 * Start/Wait/Branch/Loop/Random/Reroute/CommentはBehaviorGraphと共通の意味を持つ
 * (エディタ側でも同じLiteGraphノードクラス(behavior/*)をそのまま流用する)。
 */
export interface ShotGraphNode {
    id: number;
    type: "Start" | "Fire" | "MultiFire" | "Missile" | "Wait" | "Branch" | "Loop" | "Random" | "Reroute" | "Comment";
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

    public slots: string[] = []; // TypeID_1..8 のうち "None" 以外の値のみ

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
