import { _decorator, Component, sys } from 'cc';
import { GAME_SETTINGS, SAVE_KEY } from './Constants';
import { GameDatabase } from './GameDatabase';
const { ccclass, property } = _decorator;

export interface IGridPart {
    x: number; // 配置アンカー(バウンディングボックス左上)のグリッドX
    y: number;
    w: number; // バウンディングボックス幅/高さ(当たり判定の簡易カリング/表示用)
    h: number;
    type: string; // ID or Type
    id?: string;
    // 実際に占有するマスの相対座標(x,yからの相対、EquipmentData.shapeCellsそのまま)。
    // L字/T字等の非矩形形状の正確な重なり判定に使う(CustomizeCalc.canPlaceShape()参照)。
    // 未設定ならw*hの矩形全体を占有扱いにする(初期装備の簡易配置等、shapeCells未定のパーツ用)。
    cells?: { x: number; y: number }[];
    weaponId?: string; // Weapons.csvのID(武器として配置した場合のみ)。無ければCockpit/Engine等の非武器パーツ。
    equipmentId?: string; // Equipment.csvのID。武器/非武器問わず配置元のEQ_を常に記録する(再配置除外の判定に使う)。
}

export interface ISaveData {
    money: number;
    hp: number;
    maxHp: number;
    parts: IGridPart[];
    gridData: {
        equippedParts: IGridPart[];
        layout: number[][]; // 0,1,2 state
    };
    upgradeLevels: { [key: string]: number };
    careerStats: {
        totalDistance: number;
        enemiesDefeated: number;
        itemsCollected: number;
        started: number;
        totalCreditsEarned: number;
        totalCreditsUsed: number;
        totalClearedStages: number;
        clearedStagesByDifficulty: { [difficulty: number]: number };
        totalDamageDealt: number;
        totalDamageReceived: number;
    };
    inventory: { [itemId: string]: number };
    unlockedShips: string[];
    currentShipId: string;
    // Equipment.csv(EquipmentData、武器のEquipmentIDリンク先も含む)のUnlockCost/UnlockItems条件を
    // 満たして解放済みにすると、ここへEQ_IDが追加される(unlockedShipsと同じ規約)。武器も
    // 武器以外(Armor/Utility等)もこの1つの配列で一元的に扱う(EquipmentUnlock.isEquipmentUnlocked()参照)。
    // 条件が最初から無い(UnlockCost<=0かつUnlockItemsも空)装備はここに無くても常に解放済み扱い。
    unlockedEquipmentIds: string[];
    capacity: number; // New
    // 機体ごとの永続強化Lv(PlayerUpgrade.csvのParamID: HP/CP/SP/AC/DF/TN/CR/VOS/WOS)。
    // upgradeLevelsとは別物(あちらはグリッド改造パーツ用)。未強化なら0(=Lv0、PlayerUpgrade.csvの
    // MinValue相当)。UpgradeUI.ts(実装予定)が読み書きする。
    playerParamLevels: { [shipId: string]: { [paramId: string]: number } };
}

@ccclass('DataManager')
export class DataManager {
    private static _instance: DataManager;
    public data: ISaveData;
    // load()時点でsys.localStorageにセーブが存在しなかった(=真の初回起動)場合のみtrue。
    // GameManager.loadGameManagerConfig()がGameManagerConfig.jsonのinitialCreditを反映する際、
    // 既にプレイ中のセーブのmoneyを上書きしてしまわないためのガードに使う。
    public isNewSave: boolean = false;

    public static get instance(): DataManager {
        if (!this._instance) {
            this._instance = new DataManager();
        }
        return this._instance;
    }

    constructor() {
        this.data = this.load();
    }

    public getInitialData(): ISaveData {
        return {
            money: GAME_SETTINGS.ECONOMY.INITIAL_MONEY,
            hp: 100,
            maxHp: 100,
            parts: [], // Inventory Parts (Not equipped)
            gridData: {
                // Cockpit(2x2、x=3,y=3)+初期装備武器WPN_BeamGun/EQ01_BeamGun(横1x2、x=3,y=2)を
                // 初期配置する。EQ01_BeamGunはEquipment.csv上でUnlockCost=0・UnlockItems無しの
                // 「最初から解放済み」武器なので、unlockedEquipmentIdsに追加しなくても
                // isEquipmentUnlocked()側で常に解放済み扱いになる(EquipmentUnlock.ts参照)。
                // 武器ぶんのマス(y=2, x=3-4)はSHIP_LAYOUT側も合わせて解放済み("2")にしてある。
                equippedParts: [
                    { x: 3, y: 3, w: 2, h: 2, type: "Cockpit" },
                    {
                        x: 3, y: 2, w: 2, h: 1, type: "Fire",
                        id: "part_initial_weapon",
                        weaponId: "WPN_BeamGun",
                        equipmentId: "EQ01_BeamGun",
                        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
                    },
                ],
                layout: JSON.parse(JSON.stringify(GAME_SETTINGS.SHIP_LAYOUT))
            },
            upgradeLevels: {},
            careerStats: {
                totalDistance: 0,
                enemiesDefeated: 0,
                itemsCollected: 0,
                started: 0,
                totalCreditsEarned: 0,
                totalCreditsUsed: 0,
                totalClearedStages: 0,
                clearedStagesByDifficulty: {},
                totalDamageDealt: 0,
                totalDamageReceived: 0
            },
            inventory: {},
            unlockedShips: ['Default'],
            currentShipId: 'Default',
            unlockedEquipmentIds: [],
            capacity: 50,
            playerParamLevels: {}
        };
    }

    public load(): ISaveData {
        const json = sys.localStorage.getItem(SAVE_KEY);
        this.isNewSave = !json;
        const defaults = this.getInitialData();
        if (json) {
            try {
                const loaded = JSON.parse(json);
                // Deep merge careerStats to ensure new fields exist
                if (loaded.careerStats) {
                    loaded.careerStats = Object.assign({}, defaults.careerStats, loaded.careerStats);
                }
                // gridData.layoutはGAME_SETTINGS.SHIP_LAYOUT(開発中に何度もサイズ変更される想定)の
                // コピーなので、保存済みのlayoutが現在のSHIP_LAYOUTと寸法(行数/列数)が違う場合は
                // そのまま使わず破棄する(古いセーブの10x10レイアウトを、8x8に変更した後も
                // 引きずってCustomize画面がGridContainerの外まで移動可能になってしまう不具合の対策)。
                // 解放済みセルの引き継ぎより、寸法不一致による座標破綻を避ける方を優先する。
                if (loaded.gridData && loaded.gridData.layout) {
                    const loadedLayout = loaded.gridData.layout;
                    const defaultLayout = defaults.gridData.layout;
                    const sameRows = loadedLayout.length === defaultLayout.length;
                    const sameCols = sameRows && loadedLayout.every((row: number[], i: number) => row.length === defaultLayout[i].length);
                    if (!sameRows || !sameCols) {
                        console.warn(`[DataManager] Saved gridData.layout size (${loadedLayout.length} rows) doesn't match current SHIP_LAYOUT (${defaultLayout.length} rows). Resetting gridData to defaults.`);
                        delete loaded.gridData;
                    }
                }
                // Merge with default to ensure top-level new fields existence
                return Object.assign(defaults, loaded);
            } catch (e) {
                console.error("Save Load Error", e);
                return defaults;
            }
        }
        return defaults;
    }

    public save() {
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
        console.log("[DataManager] Saved.");
    }

    public addResource(type: string, amount: number) {
        if (type === "credits" || type === "money") {
            this.data.money += amount;
            if (amount > 0) {
                this.data.careerStats.totalCreditsEarned += amount;
            } else {
                this.data.careerStats.totalCreditsUsed += Math.abs(amount);
            }
        } else if (type === "exp") {
            console.log(`[DataManager] Added ${amount} EXP (Not fully implemented)`);
        } else {
            // Add to inventory
            if (!this.data.inventory[type]) {
                this.data.inventory[type] = 0;
            }

            // Limit 99 per item
            const current = this.data.inventory[type];
            const newTotal = current + amount;

            // 加算(amount>0)で上限99を超えるMaterialアイテムは、超過分をItems.csvのSellPriceで
            // 自動売却してクレジットに変換する(従来は超過分をそのまま破棄していた)。
            // 消費(amount<0、Upgrade/Equipment解放でのアイテム消費)や、Material以外のTypeは
            // 従来通り単純に99でキャップするだけ(SellPrice未設定=0なら売却額も0、破棄と実質同じ)。
            if (amount > 0 && newTotal > 99) {
                const itemDef = GameDatabase.instance ? GameDatabase.instance.getItemData(type) : null;
                this.data.inventory[type] = 99;
                if (itemDef && itemDef.type === "Material") {
                    const overflow = newTotal - 99;
                    const sellPrice = itemDef.sellPrice > 0 ? itemDef.sellPrice : 0;
                    const soldValue = overflow * sellPrice;
                    if (soldValue > 0) {
                        this.data.money += soldValue;
                        this.data.careerStats.totalCreditsEarned += soldValue;
                    }
                    console.log(`[DataManager] ${type} exceeded 99 (+${amount}). Auto-sold ${overflow} for ${soldValue} credits (SellPrice=${sellPrice}).`);
                }
            } else {
                this.data.inventory[type] = Math.min(99, newTotal);
            }

            if (amount > 0) {
                this.data.careerStats.itemsCollected += amount;
            }

            console.log(`[DataManager] Added ${amount} to ${type}. Total: ${this.data.inventory[type]}`);
        }
        this.save();
    }

    public addDamageDealt(amount: number) {
        this.data.careerStats.totalDamageDealt += amount;
        // Don't save every hit for performance, call save occasionally
    }

    public addDamageReceived(amount: number) {
        this.data.careerStats.totalDamageReceived += amount;
        this.data.hp = Math.max(0, this.data.hp - amount);
    }

    public setHp(hp: number) {
        this.data.hp = Math.min(this.data.maxHp, Math.max(0, hp));
    }

    public incrementClearedStages(difficulty: number) {
        if (!this.data.careerStats) this.data.careerStats = this.getInitialData().careerStats;

        this.data.careerStats.totalClearedStages++;

        if (!this.data.careerStats.clearedStagesByDifficulty) {
            this.data.careerStats.clearedStagesByDifficulty = {};
        }

        if (!this.data.careerStats.clearedStagesByDifficulty[difficulty]) {
            this.data.careerStats.clearedStagesByDifficulty[difficulty] = 0;
        }
        this.data.careerStats.clearedStagesByDifficulty[difficulty]++;
        this.save();
    }

    public reset() {
        sys.localStorage.removeItem(SAVE_KEY);
        this.data = this.getInitialData();
        // フルリセット後は再び「真の初回起動」相当の状態として扱う。GameManagerConfig.jsonの
        // initialCreditをGameManager.applyInitialCreditIfNewSave()で再適用できるようにする
        // (でなければリセットしても直前のmoneyがgetInitialData()のデフォルト0のまま残ってしまう)。
        this.isNewSave = true;
    }

    public customReset(money: number, totalDist: number) {
        this.data.money = money;
        this.data.careerStats.totalDistance = totalDist;
        this.save();
    }
}
