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

/**
 * ドロップテーブルデータ (DropTable)
 * 1つのIDに対して複数のアイテムが登録される想定
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
    public dropId: string = "";

    @property({ tooltip: "3Dモデル(glTF)のresourcesパス。空なら従来通り2Dスプライトのみ表示 (例: Gltf/Enemies/Common/Enemy006)" })
    public model3DPath: string = "";

    @property({ type: CCFloat, tooltip: "3Dモデルの初期Y軸回転(度)。モデルの向きがゲーム内で逆な場合に180などを指定" })
    public model3DYRot: number = 0;

    // Runtime Cache (Optional, populated by DB)
    public _behavior: BehaviorData = null;
    public _shotPattern: ShotPatternData = null;
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
