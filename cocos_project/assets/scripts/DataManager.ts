import { _decorator, Component, sys } from 'cc';
import { GAME_SETTINGS, SAVE_KEY } from './Constants';
const { ccclass, property } = _decorator;

export interface IGridPart {
    x: number;
    y: number;
    w: number;
    h: number;
    type: string; // ID or Type
    id?: string;
}

export interface ISaveData {
    money: number;
    hp: number;
    maxHp: number;
    parts: IGridPart[];
    gridData: {
        equippedParts: any[];
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
    capacity: number; // New
}

@ccclass('DataManager')
export class DataManager {
    private static _instance: DataManager;
    public data: ISaveData;

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
                equippedParts: [
                    { x: 4, y: 4, w: 2, h: 2, type: "Cockpit" },
                    { x: 4, y: 6, w: 2, h: 2, type: "Engine" },
                    { x: 2, y: 4, w: 1, h: 2, type: "BeamGun" }, // Main
                    { x: 7, y: 4, w: 1, h: 2, type: "BeamGun" }
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
            capacity: 50
        };
    }

    public load(): ISaveData {
        const json = sys.localStorage.getItem(SAVE_KEY);
        const defaults = this.getInitialData();
        if (json) {
            try {
                const loaded = JSON.parse(json);
                // Deep merge careerStats to ensure new fields exist
                if (loaded.careerStats) {
                    loaded.careerStats = Object.assign({}, defaults.careerStats, loaded.careerStats);
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
            const newValue = Math.min(99, current + amount);
            this.data.inventory[type] = newValue;

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
    }

    public customReset(money: number, totalDist: number) {
        this.data.money = money;
        this.data.careerStats.totalDistance = totalDist;
        this.save();
    }
}
