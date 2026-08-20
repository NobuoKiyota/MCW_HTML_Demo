import { GameDatabase } from './GameDatabase';
import { DeviceData } from './GameDataTypes';

/**
 * DeviceManager (assets/resources/Excels/Device.csv) のLv計算ヘルパー。
 * PlayerUpgradeCalc/WeaponCalcと違い、Lv0~Lv5の性能値・必要個数はCSVの実測値をそのまま使う
 * (カーブ計算式は無い)。クレジットコストのみ式で算出する: Lv0(解放)=CreditValue、
 * LvN(N=1..5)=CreditValue×N×StarValue(ユーザー確定仕様)。
 *
 * currentLvは-1(未解放)始まりで扱う: -1→Lv0が「解放」、0→1以降が「レベルアップ」。
 */

export interface DeviceUpgradeCost {
    creditsCost: number;
    itemId: string;
    itemQty: number;
}

// LuckyParts/HyperForce等、Lv1以降のvaluesが空欄(NaN)の行は「レベルアップの概念は無し」の
// 固定アイテム扱い(Lv0のみ存在)。
export function isDeviceLevelable(device: DeviceData): boolean {
    return !!device && device.values.length > 1 && !isNaN(device.values[1]);
}

// レベルアップ不可の行は0(=Lv0のみ)を返す。
export function getDeviceMaxLv(device: DeviceData): number {
    if (!isDeviceLevelable(device)) return 0;
    let maxLv = 0;
    for (let lv = 1; lv <= 5; lv++) {
        if (isNaN(device.values[lv])) break;
        maxLv = lv;
    }
    return maxLv;
}

export function getDeviceLevelValue(device: DeviceData, lv: number): number {
    const clamped = Math.max(0, Math.min(lv, device.values.length - 1));
    return device.values[clamped];
}

// currentLvから次の1段階(未解放なら解放/Lv0、以降はLvN)に必要なコストを返す。
// 既にMaxLv到達済み(またはレベルアップ不可の行が既にLv0取得済み)ならnull。
export function computeDeviceUpgradeCost(device: DeviceData, currentLv: number): DeviceUpgradeCost | null {
    if (!device) return null;
    const maxLv = getDeviceMaxLv(device);
    if (currentLv >= maxLv) return null;

    const nextLv = currentLv + 1;
    const creditsCost = nextLv === 0 ? device.creditValue : device.creditValue * nextLv * device.starValue;
    const rawQty = device.requiredQty[nextLv];
    return {
        creditsCost,
        itemId: device.requiredItemId,
        itemQty: isNaN(rawQty) ? 0 : rawQty,
    };
}

export function getDeviceData(id: string): DeviceData | null {
    const db = GameDatabase.instance;
    return db ? db.getDeviceData(id) : null;
}
