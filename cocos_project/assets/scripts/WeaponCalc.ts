import { GameDatabase } from './GameDatabase';
import { WeaponData } from './GameDataTypes';
import { GROWTH_EXPONENTS } from './PlayerUpgradeCalc';

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
