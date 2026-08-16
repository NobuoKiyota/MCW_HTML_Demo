import { ISaveData } from './DataManager';
import { EquipmentData } from './GameDataTypes';

/**
 * 装備(Equipment.csv、武器かどうかを問わない)の解放条件チェック+実行。WeaponCalc.tsの
 * isWeaponUnlocked()等は元々ここと同じロジックをWeaponData側に直接持っていたが、解放条件の
 * データ自体をEquipmentData側(UnlockCost/UnlockItemID_1~3/UnlockItemQty_1~3)へ移したため、
 * 武器も武器以外(Armor/Utility等)も同じこのロジックで一元的に扱えるようにした。
 * WeaponCalc.ts/CustomizeCalc.tsの両方がこのファイルに依存する形にし、循環importを避けている。
 */

// unlockCost<=0かつunlockItemsが空の装備は常に解放済み。それ以外はDataManager.data.unlockedEquipmentIdsに
// 含まれているかで判定する。
export function isEquipmentUnlocked(equipment: EquipmentData, saveData: ISaveData): boolean {
    if (!equipment) return false;
    if (equipment.unlockCost <= 0 && (!equipment.unlockItems || equipment.unlockItems.length === 0)) return true;
    return !!(saveData && saveData.unlockedEquipmentIds && saveData.unlockedEquipmentIds.includes(equipment.id));
}

export function canAffordEquipmentUnlock(equipment: EquipmentData, saveData: ISaveData): boolean {
    if (!equipment || !saveData) return false;
    if (saveData.money < equipment.unlockCost) return false;
    for (const req of equipment.unlockItems || []) {
        const have = saveData.inventory[req.itemId] || 0;
        if (have < req.qty) return false;
    }
    return true;
}

/**
 * 実際にクレジット+必要アイテムを消費して解放する(UpgradeUI.tsのLv購入と同じ「消費→即save()」方式)。
 * 既に解放済み/お金や素材が足りない場合は何もせずfalseを返す(既に解放済みならtrue)。
 */
export function unlockEquipment(equipment: EquipmentData, dataManager: { data: ISaveData; addResource: (type: string, amount: number) => void; save: () => void }): boolean {
    if (!equipment || !dataManager) return false;
    if (isEquipmentUnlocked(equipment, dataManager.data)) return true;
    if (!canAffordEquipmentUnlock(equipment, dataManager.data)) return false;

    if (equipment.unlockCost > 0) dataManager.addResource('credits', -equipment.unlockCost);
    for (const req of equipment.unlockItems || []) {
        dataManager.addResource(req.itemId, -req.qty);
    }

    if (!dataManager.data.unlockedEquipmentIds) dataManager.data.unlockedEquipmentIds = [];
    dataManager.data.unlockedEquipmentIds.push(equipment.id);
    dataManager.save(); // unlockCost<=0かつunlockItemsが空でここまで来ることは無いが、念のため明示的にsave()しておく
    return true;
}
