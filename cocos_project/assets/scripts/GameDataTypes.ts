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
 * 敵の弾丸データ (EnemyBullet)
 */
@ccclass('EnemyBulletData')
export class EnemyBulletData {
    @property
    public id: string = "";

    @property({ type: CCInteger, tooltip: "Bullet Type (0: Normal, 1: Aim, etc)" })
    public type: number = 0;

    @property({ type: CCFloat })
    public speed: number = 5.0;

    @property({ type: CCInteger })
    public damage: number = 10;

    @property({ type: CCFloat })
    public interval: number = 1.0;

    @property({ tooltip: "Prefab Name or Resource Path" })
    public prefabName: string = "";
}

/**
 * 敵の行動データ (Behavior)
 */
@ccclass('BehaviorData')
export class BehaviorData {
    @property
    public id: string = "";

    @property({ tooltip: "Internal Logic ID (e.g. MPID001)" })
    public logicId: string = "MPID001";

    @property({ type: CCFloat })
    public baseSpeed: number = 2.0;

    @property({ type: CCFloat })
    public baseTurn: number = 2.0;
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

    @property({ tooltip: "敵弾ID" })
    public ebId: string = ""; // EnemyBullet ID

    @property({ type: CCFloat, tooltip: "弾速倍率" })
    public bulletSpeedMult: number = 1.0;

    @property({ type: CCFloat, tooltip: "弾威力倍率" })
    public bulletDmgMult: number = 1.0;

    @property({ tooltip: "ドロップテーブルID" })
    public dropId: string = "";

    // Runtime Cache (Optional, populated by DB)
    public _behavior: BehaviorData = null;
    public _bullet: EnemyBulletData = null;
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
