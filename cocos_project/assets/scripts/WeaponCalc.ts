import { GameDatabase } from './GameDatabase';
import { WeaponData } from './GameDataTypes';
import { GROWTH_EXPONENTS } from './PlayerUpgradeCalc';
import { ISaveData } from './DataManager';
import { isEquipmentUnlocked, canAffordEquipmentUnlock, unlockEquipment } from './EquipmentUnlock';

/**
 * Weapons.csv(SP/Dmg/Scale/WT/Count)のLv別実値を計算する。
 * PlayerUpgradeCalc.computeUpgradeCurveと同じprogress^G補間を使うが、対象パラメータが
 * 1武器につき複数(SP/Dmg/Scale/WT、Countは任意)ある点が異なるため、1Lvぶんの全ステータスを
 * まとめて返す形にしてある。Min===Maxの列はprogressに関わらず常に一定(=そのステータスは
 * このLvレンジでは成長しない)。コスト計算はDevice同様、Weapon強化の購入コスト方式が固まって
 * いないため未実装(必要になったらPlayerUpgradeCalc.computeUpgradeCurveのcost部分を移植する)。
 * extensions/master-manager/panels/default/index.jsのWeaponManagerプレビュー計算式と
 * 完全に一致させること。
 */

function lerpStat(min: number, max: number, growthType: string, lv: number, maxLv: number): number {
    if (min === max) return min;
    const g = GROWTH_EXPONENTS[growthType] !== undefined ? GROWTH_EXPONENTS[growthType] : 1.0;
    const lvCount = Math.max(1, Math.floor(maxLv) || 1);
    const progress = Math.max(0, Math.min(1, lv / lvCount));
    return min + (max - min) * Math.pow(progress, g);
}

export interface WeaponLevelStats {
    lv: number;
    count: number;
    sp: number;
    dmg: number;
    scale: number;
    wt: number;
}

// lv=0はMinValue(未強化)扱い、lv>=maxLvはMaxValueでクランプする。
export function computeWeaponLevelStats(weapon: WeaponData, lv: number): WeaponLevelStats {
    const clampedLv = Math.max(0, Math.min(lv, weapon.maxLv));
    return {
        lv: clampedLv,
        count: Math.round(lerpStat(weapon.countMin, weapon.countMax, weapon.growthType, clampedLv, weapon.maxLv)),
        sp: lerpStat(weapon.spMin, weapon.spMax, weapon.growthType, clampedLv, weapon.maxLv),
        dmg: lerpStat(weapon.dmgMin, weapon.dmgMax, weapon.growthType, clampedLv, weapon.maxLv),
        scale: lerpStat(weapon.scaleMin, weapon.scaleMax, weapon.growthType, clampedLv, weapon.maxLv),
        wt: lerpStat(weapon.wtMin, weapon.wtMax, weapon.growthType, clampedLv, weapon.maxLv),
    };
}

export function getWeaponLevelStats(weaponId: string, lv: number): WeaponLevelStats | null {
    const db = GameDatabase.instance;
    const weapon = db ? db.getWeaponData(weaponId) : null;
    if (!weapon) return null;
    return computeWeaponLevelStats(weapon, lv);
}

/**
 * 解放条件(Equipment.csv側のUnlockCost/UnlockItems)・装備条件(weight/capacity)のチェック+実行。
 * 解放条件のデータ自体はEquipmentData(weapon._equipment、EquipmentUnlock.ts参照)側に移した
 * ため、ここではWeapons.csv固有の判定は行わず、weapon._equipment経由でEquipmentUnlock.tsへ
 * 委譲するだけの薄いラッパーになっている(武器も武器以外も同じ解放ロジックで扱うため)。
 * weightは元々Weapons.csvにあった「装備コスト(CP消費等)」列(WeaponData.weight)で、
 * DataManager.data.capacityとの予算チェックに使う(こちらはWeapons.csv側のまま)。
 * PlayerWeaponManager.resolveLoadout()がこれらを呼んで、未解放/予算超過の武器をロードアウトから
 * 除外する(実際にどう弾かれるかをInspectorのドロップダウン+Previewのコンソールログで確認できる)。
 */

// weapon._equipment(Equipment.csv側のリンク先)が無い、または解放条件が無ければ常に解放済み。
export function isWeaponUnlocked(weapon: WeaponData, saveData: ISaveData): boolean {
    if (!weapon) return false;
    if (!weapon._equipment) return true;
    return isEquipmentUnlocked(weapon._equipment, saveData);
}

export function canAffordWeaponUnlock(weapon: WeaponData, saveData: ISaveData): boolean {
    if (!weapon || !weapon._equipment) return false;
    return canAffordEquipmentUnlock(weapon._equipment, saveData);
}

/**
 * 実際にクレジット+必要アイテムを消費して解放する(EquipmentUnlock.unlockEquipment()に委譲)。
 * 既に解放済み/お金や素材が足りない場合は何もせずfalseを返す。
 */
export function unlockWeapon(weapon: WeaponData, dataManager: { data: ISaveData; addResource: (type: string, amount: number) => void; save: () => void }): boolean {
    if (!weapon || !dataManager) return false;
    if (!weapon._equipment) return true; // 解放条件を持たない武器は常に解放済み扱い
    return unlockEquipment(weapon._equipment, dataManager);
}

export interface LoadoutCheckResult {
    ok: boolean;
    totalWeight: number;
    capacity: number;
    lockedWeaponIds: string[]; // 未解放のため装備できない武器ID(参考情報、okがfalseの理由の一つ)
}

// 複数武器を同時装備する際の予算チェック(重量合計 <= capacity)。未解放の武器が1つでも含まれていれば
// それだけでok=falseになる(解放は装備の前提条件のため)。
export function checkLoadoutEquip(weaponIds: string[], saveData: ISaveData): LoadoutCheckResult {
    const db = GameDatabase.instance;
    let totalWeight = 0;
    const lockedWeaponIds: string[] = [];

    for (const id of weaponIds) {
        const weapon = db ? db.getWeaponData(id) : null;
        if (!weapon) continue; // 存在しないIDはWeapons.csv側の問題、ここでは無視して他を続行
        totalWeight += weapon.weight;
        if (!isWeaponUnlocked(weapon, saveData)) lockedWeaponIds.push(id);
    }

    const capacity = (saveData && typeof saveData.capacity === 'number') ? saveData.capacity : 0;
    const ok = lockedWeaponIds.length === 0 && totalWeight <= capacity;
    return { ok, totalWeight, capacity, lockedWeaponIds };
}
