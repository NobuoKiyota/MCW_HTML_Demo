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
    };
    inventory: { [itemId: string]: number };
    unlockedShips: string[];
    currentShipId: string;
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
                started: 0
            },
            inventory: {},
            unlockedShips: ['Default'],
            currentShipId: 'Default'
        };
    }

    public load(): ISaveData {
        const json = sys.localStorage.getItem(SAVE_KEY);
        if (json) {
            try {
                const loaded = JSON.parse(json);
                // Merge with default to ensure new fields existence
                return Object.assign(this.getInitialData(), loaded);
            } catch (e) {
                console.error("Save Load Error", e);
                return this.getInitialData();
            }
        }
        return this.getInitialData();
    }

    public save() {
        sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
        console.log("[DataManager] Saved.");
    }

    public reset() {
        sys.localStorage.removeItem(SAVE_KEY);
        this.data = this.getInitialData();
    }
}
