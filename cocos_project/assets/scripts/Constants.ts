import { GAME_BALANCE_DATA } from "./GameBalanceData";

/**
 * ゲーム全体の設定定数 (V5 Port)
 */
export const GAME_SETTINGS = {
    // 画面設定 (Cocos Reference Resolution)
    // 画面設定 (Cocos Reference Resolution)
    // 全体解像度 (1280x720)
    SCREEN_WIDTH: 1280,
    SCREEN_HEIGHT: 720,

    // ゲームプレイ領域 (中央 800x600)
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,

    // エクセル同期データへの参照
    BALANCE: GAME_BALANCE_DATA,

    // 自機（プレイヤー）設定
    PLAYER: Object.assign({}, GAME_BALANCE_DATA.PLAYER || {}, {
        BASE_LERP: 0.1,
        BASE_SIZE: 40,
        BASE_FIRE_COOLDOWN: 15,
    }),

    // 弾丸設定
    BULLET: {
        SPEED: 7,
        SIZE: 10,
        DAMAGE: 10,
    },

    // 物理・移動設定
    PHYSICS: Object.assign({
        MIN_SPEED: 0,
        FRICTION: 0.98,
        BASE_MAX_SPEED: 6.0,
        BASE_ACCEL: 0.05,
        BRAKE_FORCE: 0.2,
        MISSION_SCALE: 100,
        CARGO_HP_BASE: 100,
        MISSILE_COOLDOWN: 60
    }, GAME_BALANCE_DATA.PHYSICS || {}),

    // 敵スポーン設定
    ENEMY: {
        SPAWN_INTERVAL: 60,
        SIZE: 40,
    },

    // 荷物（Cargo）設定
    CARGO: Object.assign({
        WEIGHT_COEFFICIENT: 0.2,
        FIRE_RATE_COEFFICIENT: 0.1,
    }, GAME_BALANCE_DATA.CARGO || {}),

    // アイテム定義
    ECONOMY: {
        INITIAL_MONEY: 0,
        UPGRADE_COST_BASE: 100,
        // Customize画面のグリッドセル解放コスト(1マスあたり、固定額)。DataManager.data.gridData.layoutの
        // 値1(未解放)のマスをタップで解放する際にこの額を消費する(CustomizeCalc.ts参照)。
        CELL_UNLOCK_COST: 200,
        ITEMS: {
            "ItemMoney": { name: "クレジット", rare: 1, type: "money", value: 100 },
            "ItemRepair": { name: "緊急修理キット", rare: 2, type: "buff", value: 20 },
            "ItemA": { name: "強化合金", rare: 1, type: "material" },
            "ItemB": { name: "高出力チップ", rare: 2, type: "material" },
            "ItemC": { name: "謎のコア", rare: 3, type: "material" },
            "BoostAccel": { name: "加速ブースター", rare: 2, type: "buff", duration: 0 },
            "BoostApex": { name: "APEXブースト", rare: 3, type: "buff", duration: 600 },
            "ItemF": { name: "高純度チタン", rare: 2, type: "material" },
            "ItemG": { name: "反重力ユニット", rare: 3, type: "material" },
            "ItemH": { name: "量子回路", rare: 3, type: "material" },
            "ItemI": { name: "超伝導コイル", rare: 3, type: "material" },
            "ItemJ": { name: "AIニューロコア", rare: 4, type: "material" },
            "ItemK": { name: "ゼロ点エネルギー", rare: 4, type: "material" },
            "ItemL": { name: "ダークマター結晶", rare: 5, type: "material" },
            "ItemPowerUp": { name: "火力増幅ユニット", rare: 3, type: "buff", duration: 10, value: 0.3 },
            "ItemRapidFire": { name: "急速冷却装置", rare: 3, type: "buff", duration: 10, value: 0.8 }
        }
    },

    // アップグレードテーブル生成関数
    getPartUpgradeTable: () => {
        const table: any = {};
        // @ts-ignore
        const parts = Object.assign({}, GAME_BALANCE_DATA.WEAPONS || {}, GAME_BALANCE_DATA.PART_TEMPLATES || {});

        const OVERRIDES: any = {
            "Collector": { base: 40, scale: 20 },
            "WeaponOS": { base: 0, scale: 5 },
            "Shield": { base: 0, scale: 2 },
            "ItemEff": { base: 0, scale: 10 },
            "BeamGun": { base: 10, scale: 2 },
            "Missile": { base: 20, scale: 3 },
            "Bomb": { base: 30, scale: 4 },
            "TwinBeam": { base: 18, scale: 3 },
            "Laser": { base: 25, scale: 5 }
        };

        Object.keys(parts).forEach(imgId => {
            const p = parts[imgId];
            const list: any[] = [];
            const baseCost = p.UpgradeCost || 1000;
            const costMult = 1.15;

            // @ts-ignore
            const ov = OVERRIDES[imgId] || { base: p.Damage || 0, scale: (p.Damage || 10) * 0.1 };

            for (let lv = 0; lv <= 100; lv++) {
                const cost = Math.floor(baseCost * Math.pow(costMult, lv));
                const val = ov.base + (lv * ov.scale);

                list.push({
                    Level: lv,
                    Cost: cost,
                    ValueTotal: val,
                    MaterialID: (lv % 10 === 0 && lv > 0) ? "ItemA" : null,
                    MaterialCount: Math.floor(lv / 10)
                });
            }
            table[imgId] = list;
            // @ts-ignore
            if (p.ID && p.ID !== imgId) table[p.ID] = list;
        });
        return table;
    },

    // 船体レイアウト
    // Home > CustomizeのGrid仕様(8x8、CellGap込みで(46+2)x8=384、Offset(8,8))に合わせて8x8に変更。
    // 0=艦外(配置不可)/1=未解放セル(お金で解放)/2=解放済み(初期装備の土台)。CustomizeCalc.ts参照。
    // (3,3)-(4,4)の2x2は元々Cockpit専用の土台だったが、初期装備武器(WPN_BeamGun、
    // EQ01_BeamGun、ShapeCells="00;10;"の横1x2)を追加で置く場所として、その直上の行
    // (y=2, x=3-4)も解放済みにしている(DataManager.getInitialData()参照)。
    SHIP_LAYOUT: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 1, 2, 2, 1, 0, 0],
        [0, 1, 1, 2, 2, 1, 1, 0],
        [0, 1, 1, 2, 2, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0]
    ]
};

// ステート定義
export enum GameState {
    TITLE, HOME, MENU, UPGRADE, MISSION_SELECT, INGAME, RESULT, FAILURE, GRID_MODIFY
}

export const SAVE_KEY = 'SHOOTER_COCOS_V1';

export interface IMissionData {
    id: number;
    stars: number;
    distance: number;
    enemyPattern: string[];
    reward: number;
    cargoWeight: number; // New: 30/50/70
    targetTime: number;  // New: in seconds
}

// GameManager.spawnLaserBeam()/IGameManager.spawnLaserBeam()の引数まとめ。ShockWave/SweapBlade等の
// 開発でoptionalパラメータが積み重なり位置引数が18個近くまで肥大化したため、呼び出し側
// (ShotRuntime.doLaser())が組み立てやすいよう1つのオブジェクトにまとめた
// (LaserBeam.init()/applyOrbit()も同じ理由でオブジェクト引数化している。LaserBeamInitOptions/
// LaserBeamOrbitOptions参照)。ownerNode/angle/damage/damageInterval/duration/length/width/isEnemyは
// 必須、それ以外は省略時に既存の初期値のまま(GameManager.spawnLaserBeam()実装側で補う)。
export interface SpawnLaserBeamOptions {
    ownerNode: any;
    angle: number;
    damage: number;
    damageInterval: number;
    duration: number;
    length: number;
    width: number;
    isEnemy: boolean;
    prefabName?: string;
    particleLengthScale?: number;
    fadeOutDuration?: number;
    orbitRadius?: number;
    orbitSpeed?: number;
    orbitStartAngle?: number;
    modelSpinRate?: number;
    orbitOffsetX?: number;
    orbitOffsetY?: number;
    hitSoundId?: string;
}

// IGameManager Interface for breaking circular dependencies
export interface IGameManager {
    state: GameState;
    isPaused: boolean;
    enemyLayer: any; // Add enemyLayer for PlayerController access
    playerNode: any;
    playState: any;
    currentMission: IMissionData; // Update type
    // currentScrollSpeed: number; // Global Physics -> Moved to GameSpeedManager
    speedManager: any; // GameSpeedManager type (any to avoid circular import here if needed, or import type)
    spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, prefabName?: string): any;
    // 自機/敵に追従し続ける持続ビーム(ShotRuntime.tsのLaserノード用)。spawnBulletと違い
    // ownerNodeの子として生成され、x/y座標は取らない(親の位置にそのまま追従するため)。
    spawnLaserBeam(opts: SpawnLaserBeamOptions): any;
    spawnItem(x: number, y: number, id: string, amount: number): void;
    spawnItemFromPrefab(prefab: any, x: number, y: number): void;
    onItemCollected(id: string, amount: number, pos?: any): void;
    onGameOver(): void;
    onMissionComplete(): void;
    spawnDamageText(x: number, y: number, amount: number, isKill: boolean): void;
    spawnExplosion(x: number, y: number, isKill?: boolean): void;
    goToHome(): void;
    // 行動パターン検証用テストシーン向けAPI (BehaviorTestController.ts から使用)
    spawnEnemyById(id: string): any;
    despawnAllEnemies(): void;
    testMode: boolean;
    // BehaviorGraphのMoveToノードが参照するEnemyMovePoint。id="0"は「現在地」の予約語なので
    // 実際にMovePointsコンテナへ登録されることはなく、常にnullを返す想定。
    getMovePoint(id: string): { x: number; y: number } | null;
    // 自機発射のホーミングミサイル(ShotRuntime.tsのMissileノード)が最寄りの敵を狙うために使う。
    findNearestEnemyTo(x: number, y: number): any;
    // GameDatabase参照。GameDatabase.instance(シングルトン)のフォールバックと組み合わせて使う
    // (Enemy.dieのドロップテーブル抽選、GameManager.onItemCollected/spawnFromSpawnTable等)。
    gameDatabase: any;
    // GameManagerEditor(MasterManagerパネル)で編集する assets/resources/Data/GameManagerConfig.json
    // の値。PlayerController.update()がPlayer機3Dモデルの基準スケールに掛ける倍率として読む。
    playerShipScaleMultiplier: number;
    // Player機3DモデルのX/Y軸基準角度(度)。Prefab側の値は使わずこちらを基準にする
    // (PlayerController.ts参照 - Prefab保存値だとモデルの向きが誤っていた)。
    playerShipBaseRotationX: number;
    playerShipBaseRotationY: number;
    // 同じくGameManagerConfig.json由来。Bullet.ts update()の発光(グロー拡縮/明滅、3Dモデルの
    // emissiveパルス)を全弾(自機/敵とも)共通で調整する。個別の弾の色/glowIntensity自体は
    // 引き続きShotPattern側のFire/MultiFire/Missileノードパラメータで上書きできる(こちらは
    // その上に掛かる全体のパルス演出の基礎値)。
    bulletPulseSpeed: number;
    bulletGlowScale: number;
    bulletGlowScalePulse: number;
    bulletGlowAlpha: number;
    bulletEmissiveBase: number;
    bulletEmissiveAmplitude: number;
    // SpawnTable(assets/resources/Excels/SpawnTables.csv)のIDを指定して出現テーブルを実行する。
    // (行動パターン検証用テストシーンのTキーから使用。将来的にはミッション側からも呼ばれる想定)
    // onSpawnedは実際に1体生成される度(Cycleが非Instantなら時間差で複数回)呼ばれる。
    spawnFromSpawnTable(tableId: string, onSpawned?: () => void): { spawnedIds: string[] } | null;
    // ミッション生成時、一度選ばれた同一SpawnTable IDをその後何回ぶんの抽選から除外するか
    // (ローテーション式、経過後は再び候補に復帰する。1ミッション内の総出現回数に上限は無い)。
    // GameManagerConfig.json由来(GameManagerEditorタブで調整)。MissionManager(実装予定)が参照する。
    missionMaxDuplicateSpawnTable: number;
    // Mission距離D = 開始margin(A) + SpawnTable合計(B) + 終了margin(C)。A/Cは固定値。
    missionMarginStartKm: number;
    missionMarginEndKm: number;
    // 目標到達時間(秒) = (D / (想定最高速度[km/分] × 速度係数)) × 60。速度係数は「常に最高速度では
    // 走らない」ことの補正値(0.5=常に最高速度の半分で走ると仮定)。
    missionAssumedMaxSpeedKmPerMin: number;
    missionTargetSpeedRatio: number;
    // 貨物報酬 H = 重量(t, Lv毎にBaseMin~BaseMax+PerLv*(Lv-1)の範囲でランダム) × 単価(PriceBase+PricePerLv*(Lv-1))
    missionCargoWeightBaseMin: number;
    missionCargoWeightBaseMax: number;
    missionCargoWeightPerLv: number;
    missionCargoPriceBase: number;
    missionCargoPricePerLv: number;
    // 目標時間との差(秒)がStepSecondsごとにPercentPerStep%のボーナス/ペナルティ。
    // ボーナス上限CapPercent%、ペナルティ下限-FloorPercent%(=最低保証)。
    missionBonusStepSeconds: number;
    missionBonusPercentPerStep: number;
    missionBonusCapPercent: number;
    missionPenaltyFloorPercent: number;
    // Player被弾(弾・Enemy機体接触共通)後の無敵時間(フレーム数指定)。GameManagerConfig.json由来、
    // GameManagerEditorタブで調整する。フレーム数を極端に小さくすることで「弱い攻撃をわざと受けて
    // 無敵時間を稼ぐ」戦法を成立しにくくする意図(既定5フレーム)。
    contactInvincibleFrames: number;
    // Upgrade GUI(実装予定)のResetボタンで返金するクレジット/アイテムの割合(%)。既定80。
    resetRefundPercent: number;
    // PlayerUpgrade.csvのTNパラメータ(生のpixel/sec値、60~90等)をPlayerController.lerpFactorへ
    // 変換する際の除数。lerpFactor = TN値 / この値。既定600(TN=60で現行既定のlerpFactor=0.1相当)。
    tnLerpDivisor: number;
    // PlayerUpgradeManagerのLv別プレビュー(extensions/master-manager/panels/default/index.js)と
    // 完全に同じ意味・同じ既定値を持つ、コスト計算の校正値。プレビューとゲーム内実際の必要
    // クレジット計算が食い違わないよう、この3つはGameManagerConfig.json側を単一の情報源とする。
    upgradeCostUnitScale: number;
    missionEarlyBaselineCredits: number;
    missionLateBaselineCredits: number;
    // Upgrade GUIの各Labelのフォントサイズ。UpgradeUI.tsが起動時に適用する。
    upgradeButtonFontSize: number;
    upgradeNoticeFontSize: number;
    upgradeSharedInfoFontSize: number;
}
