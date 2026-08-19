import { GameDatabase } from './GameDatabase';
import { WeaponData } from './GameDataTypes';
import { GROWTH_EXPONENTS, computeUpgradeCurve, creditsPerCostUnitAt } from './PlayerUpgradeCalc';
import { ISaveData, IGridPart } from './DataManager';
import { IGameManager } from './Constants';
import { isEquipmentUnlocked, canAffordEquipmentUnlock, unlockEquipment } from './EquipmentUnlock';

/**
 * Weapons.csv(SP/Dmg/Scale/WT/Count)のLv別実値を計算する。
 * PlayerUpgradeCalc.computeUpgradeCurveと同じprogress^G補間を使うが、対象パラメータが
 * 1武器につき複数(SP/Dmg/Scale/WT、Countは任意)ある点が異なるため、1Lvぶんの全ステータスを
 * まとめて返す形にしてある。Min===Maxの列はprogressに関わらず常に一定(=そのステータスは
 * このLvレンジでは成長しない)。Lvアップ購入コストはcomputeWeaponUpgradeCost()参照
 * (PlayerUpgradeCalc.computeUpgradeCurveのcost部分を流用)。
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

export interface WeaponUpgradeMaterial {
    itemId: string;
    qty: number;
}

export interface WeaponUpgradeCost {
    nextLv: number;
    creditsCost: number;
    material: WeaponUpgradeMaterial | null;
}

/**
 * 武器Lvアップ(currentLv → currentLv+1)の購入コスト。MaxLv到達済みならnull。
 * クレジットはPlayerUpgradeCalc.computeUpgradeCurve/creditsPerCostUnitAtをそのまま流用する
 * (StarValue×GrowthTypeで序盤/終盤のクレジットカーブを作る設計を、PlayerUpgrade.csvと同じく
 * Weapons.csv側にもそのまま適用する。関数自体は複製せず再利用)。
 * 素材はweapon._equipment.unlockItems(Equipment.csvのUnlockItemID_1~3、その武器の解放時に
 * 使った素材と同じもの)の先頭1種類だけを使い、progress^G(GrowthType由来の指数)でLv進捗に
 * 応じて個数をスケールする。PlayerUpgradeCalc.computeMaterialRequirement()は
 * MATERIAL_START_LV=10以降でしか素材を要求しない設計だが、武器のMaxLvは通常10前後(=PlayerUpgrade
 * 側のLvレンジよりずっと短い)なのでその前提が噛み合わず、ここでは毎Lvで素材を要求する専用の
 * 簡易カーブにしている。
 */
export function computeWeaponUpgradeCost(weapon: WeaponData, currentLv: number, gm: IGameManager): WeaponUpgradeCost | null {
    if (!weapon || !gm) return null;
    const maxLv = Math.max(1, weapon.maxLv);
    const clampedLv = Math.max(0, Math.min(currentLv, maxLv));
    if (clampedLv >= maxLv) return null; // MaxLv到達済み

    const nextLv = clampedLv + 1;
    const curve = computeUpgradeCurve(0, 1, weapon.growthType, maxLv, weapon.starValue, gm.upgradeCostUnitScale);
    const entry = curve[nextLv - 1];
    const perUnit = creditsPerCostUnitAt(nextLv, maxLv, gm);
    const creditsCost = Math.round(entry.cost * perUnit);

    let material: WeaponUpgradeMaterial | null = null;
    const unlockItems = weapon._equipment ? weapon._equipment.unlockItems : null;
    if (unlockItems && unlockItems.length > 0) {
        const g = GROWTH_EXPONENTS[weapon.growthType] !== undefined ? GROWTH_EXPONENTS[weapon.growthType] : 1.0;
        const progress = nextLv / maxLv;
        const qMin = 1;
        const qMax = qMin + Math.round((weapon.starValue || 1) * 10 / 3);
        const qty = Math.max(1, Math.round(qMin + (qMax - qMin) * Math.pow(progress, g)));
        material = { itemId: unlockItems[0].itemId, qty };
    }

    return { nextLv, creditsCost, material };
}

/**
 * 解放条件(Equipment.csv側のUnlockCost/UnlockItems)・装備条件(weight/capacity)のチェック+実行。
 * 解放条件のデータ自体はEquipmentData(weapon._equipment、EquipmentUnlock.ts参照)側に移した
 * ため、ここではWeapons.csv固有の判定は行わず、weapon._equipment経由でEquipmentUnlock.tsへ
 * 委譲するだけの薄いラッパーになっている(武器も武器以外も同じ解放ロジックで扱うため)。
 * weightは以前Weapons.csv側にも重複して存在したが(WeaponData.weight)、Equipment.csv側
 * (EquipmentData.weight)への一元管理に統合済み。weapon._equipment.weightを情報源とし、
 * DataManager.data.capacityとの予算チェックに使う。
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
        totalWeight += weapon._equipment ? weapon._equipment.weight : 0;
        if (!isWeaponUnlocked(weapon, saveData)) lockedWeaponIds.push(id);
    }

    const capacity = (saveData && typeof saveData.capacity === 'number') ? saveData.capacity : 0;
    const ok = lockedWeaponIds.length === 0 && totalWeight <= capacity;
    return { ok, totalWeight, capacity, lockedWeaponIds };
}

export interface ResolvedLoadout {
    shotPatternIds: string[];
    scaleMultByPatternId: { [shotPatternId: string]: number };
    intervalMultByPatternId: { [shotPatternId: string]: number };
    damageMultByPatternId: { [shotPatternId: string]: number };
}

/**
 * 本番プレイ用: DataManager.data.gridData.equippedParts(Customizeで実際にグリッドへ配置した
 * パーツ、最大12まで)から、weaponIdを持つ武器パーツだけを集めてShotPatternID単位の
 * Scale/WT(発射間隔)/Damage倍率マップに変換する。PlayerController.setOverrideShotPatternIds()/
 * setScaleMultipliers()/setIntervalMultipliers()/setDamageMultipliers()にそのまま渡す想定。
 *
 * PlayerWeaponManager.resolveLoadout()(scene-BehaviorTest専用、6グループのInspector
 * ドロップダウンから選ぶデバッグハーネス)とは別物 - あちらはテスト用の手動選択を情報源にするが、
 * こちらは実際の装備データ(part.weaponId/part.lv)を情報源にする。装備画面側で解放/重量
 * チェック済みの前提のため、ここではisWeaponUnlocked/checkLoadoutEquip相当の再チェックは行わない。
 */
export function resolveEquippedLoadout(equippedParts: IGridPart[] | null | undefined): ResolvedLoadout {
    const shotPatternIds: string[] = [];
    const scaleMultByPatternId: { [shotPatternId: string]: number } = {};
    const intervalMultByPatternId: { [shotPatternId: string]: number } = {};
    const damageMultByPatternId: { [shotPatternId: string]: number } = {};

    const db = GameDatabase.instance;
    if (!db || !equippedParts) {
        return { shotPatternIds, scaleMultByPatternId, intervalMultByPatternId, damageMultByPatternId };
    }

    for (const part of equippedParts) {
        if (!part.weaponId) continue; // 非武器パーツ(Cockpit等)は対象外

        const weapon = db.getWeaponData(part.weaponId);
        if (!weapon || !weapon.shotPatternId) {
            console.warn(`[WeaponCalc] resolveEquippedLoadout: Weapon '${part.weaponId}' がWeapons.csvに見つからない、またはShotPatternID未設定です。この武器はスキップされます。`);
            continue;
        }

        const lv = part.lv || 0;
        const stats = computeWeaponLevelStats(weapon, lv);
        const id = weapon.shotPatternId;

        if (!shotPatternIds.includes(id)) shotPatternIds.push(id);
        scaleMultByPatternId[id] = stats.scale;
        intervalMultByPatternId[id] = weapon.wtMin > 0 ? stats.wt / weapon.wtMin : 1.0;
        damageMultByPatternId[id] = weapon.dmgMin > 0 ? stats.dmg / weapon.dmgMin : 1.0;
    }

    return { shotPatternIds, scaleMultByPatternId, intervalMultByPatternId, damageMultByPatternId };
}
