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
        INITIAL_MONEY: 500000,
        UPGRADE_COST_BASE: 100,
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
    SHIP_LAYOUT: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 2, 2, 2, 1, 1, 0],
        [0, 0, 1, 1, 2, 2, 2, 1, 1, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
};

// ステート定義
export enum GameState {
    TITLE, MENU, UPGRADE, MISSION_SELECT, INGAME, RESULT, FAILURE, GRID_MODIFY
}

export const SAVE_KEY = 'SHOOTER_COCOS_V1';

// IGameManager Interface for breaking circular dependencies
export interface IGameManager {
    state: GameState;
    isPaused: boolean;
    enemyLayer: any; // Add enemyLayer for PlayerController access
    playerNode: any;
    playState: any;
    // currentScrollSpeed: number; // Global Physics -> Moved to GameSpeedManager
    speedManager: any; // GameSpeedManager type (any to avoid circular import here if needed, or import type)
    spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean): any;
    spawnItem(x: number, y: number, id: string, amount: number): void;
    spawnItemFromPrefab(prefab: any, x: number, y: number): void;
    onItemCollected(id: string, amount: number, pos?: any): void;
    onGameOver(): void;
    onMissionComplete(): void;
    spawnDamageText(x: number, y: number, amount: number, isKill: boolean): void;
    spawnExplosion(x: number, y: number): void;
}
