import { GAME_SETTINGS } from './Constants';
import { ISaveData, IGridPart } from './DataManager';
import { EquipmentData, WeaponData } from './GameDataTypes';
import { GameDatabase } from './GameDatabase';
import { isEquipmentUnlocked } from './EquipmentUnlock';

/**
 * Home > Customize画面のグリッドセル解放ロジック。DataManager.data.gridData.layout(8x8、
 * GAME_SETTINGS.SHIP_LAYOUTがテンプレート)の値を「0=艦外(配置不可)/1=未解放セル(お金で解放)/
 * 2=解放済み」として扱う。WeaponCalc.ts(武器解放)と同じ設計方針: コスト計算とDataManager書き込みを
 * 分離し、実際の消費はunlockCell()だけが行う。
 *
 * layoutはプレイヤーのセーブデータ側(DataManager.data.gridData.layout)を直接書き換える前提
 * (GAME_SETTINGS.SHIP_LAYOUTはgetInitialData()がコピーして初期値を作るためのテンプレートであり、
 * それ自体は書き換えない)。
 */

export function isCellUnlocked(layout: number[][], x: number, y: number): boolean {
    return !!(layout && layout[y] && layout[y][x] === 2);
}

// 艦の輪郭内(0以外)かどうか。0は艦外なのでそもそも解放/配置の対象にならない。
export function isCellInHull(layout: number[][], x: number, y: number): boolean {
    return !!(layout && layout[y] && layout[y][x] !== 0 && layout[y][x] !== undefined);
}

export function getCellUnlockCost(): number {
    return GAME_SETTINGS.ECONOMY.CELL_UNLOCK_COST;
}

export function canAffordCellUnlock(saveData: ISaveData): boolean {
    return !!saveData && saveData.money >= getCellUnlockCost();
}

/**
 * 実際にクレジットを消費してセルを解放する(WeaponCalc.unlockWeapon()と同じ「消費→即save()」方式)。
 * 既に解放済み(2)ならtrue(何もしない)、艦外(0)やお金不足ならfalseを返す。
 */
export function unlockCell(x: number, y: number, dataManager: { data: ISaveData; save: () => void; addResource: (type: string, amount: number) => void }): boolean {
    if (!dataManager) return false;
    const layout = dataManager.data && dataManager.data.gridData ? dataManager.data.gridData.layout : null;
    if (!layout || !layout[y] || layout[y][x] === undefined) return false;

    if (layout[y][x] === 2) return true; // 既に解放済み
    if (layout[y][x] !== 1) return false; // 0(艦外)は解放対象外

    if (!canAffordCellUnlock(dataManager.data)) return false;

    dataManager.addResource('credits', -getCellUnlockCost()); // 内部でsave()まで行われる
    layout[y][x] = 2;
    dataManager.save(); // layout自体の変更はaddResource()経由のsave()に含まれないため明示的に呼ぶ
    return true;
}

// ============================================================
// 装備配置(EquipmentDataのshapeCellsをグリッド上に置く)
// ============================================================

// EquipmentData.shapeCells(0,0基準の相対座標)を、アンカー(ox,oy)だけずらした絶対座標にする。
export function shapeCellsAt(shapeCells: { x: number; y: number }[], ox: number, oy: number): { x: number; y: number }[] {
    return shapeCells.map(c => ({ x: c.x + ox, y: c.y + oy }));
}

// IGridPartが実際に占有する絶対座標のリストを返す。cells(shapeCells由来の正確な形状)があれば
// それを使い、無ければ(初期装備の簡易パーツ等)w*hの矩形全体を占有扱いにする。
export function partOccupiedCells(part: IGridPart): { x: number; y: number }[] {
    if (part.cells && part.cells.length > 0) return shapeCellsAt(part.cells, part.x, part.y);
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < part.h; dy++) {
        for (let dx = 0; dx < part.w; dx++) {
            cells.push({ x: part.x + dx, y: part.y + dy });
        }
    }
    return cells;
}

/**
 * 指定した絶対座標群(=配置しようとしている形状)が、(a)全マス解放済み(layout===2)かつ
 * (b)既存のequippedPartsのどれとも重ならない、を満たすか判定する。ドラッグ中のゴースト表示の
 * 色分け(緑/赤)と、確定時の最終チェックの両方で使う共通ロジック。
 * excludePartIdは、既に置かれている自分自身のパーツを動かし直す場合に、自分自身との重なりを
 * 無視するためのもの(現状のplaceEquipment()は新規配置のみでexcludePartIdは使わないが、
 * 将来の再配置機能のために用意しておく)。
 */
export function canPlaceShape(cells: { x: number; y: number }[], layout: number[][], equippedParts: IGridPart[], excludePartId?: string): boolean {
    if (!cells || cells.length === 0) return false;
    const occupied = new Set<string>();
    for (const part of equippedParts) {
        if (excludePartId && part.id && part.id === excludePartId) continue;
        for (const c of partOccupiedCells(part)) {
            occupied.add(`${c.x},${c.y}`);
        }
    }
    for (const c of cells) {
        if (!isCellUnlocked(layout, c.x, c.y)) return false;
        if (occupied.has(`${c.x},${c.y}`)) return false;
    }
    return true;
}

let _nextPartIdSeq = 1;

export interface EquipmentListEntry {
    equipment: EquipmentData;
    weapon: WeaponData | null; // nullなら武器と紐付かない純粋な装備(Armor/Utility等)
    // trueなら未解放(リスト上は名前を伏せて???表示、配置も不可)。解放条件はEquipmentData側
    // (unlockCost/unlockItems、EquipmentUnlock.ts参照)に一元化されているため、武器/非武器を
    // 問わずequipment側のデータだけで判定する。
    locked: boolean;
}

/**
 * 装備(ox,oy)にアンカーを合わせて配置する。canPlaceShape()を満たさなければ何もせずfalseを返す。
 * 成功時はDataManager.data.gridData.equippedPartsへ新しいIGridPartを追加してsave()する。
 * entry.weaponがあれば武器として(part.weaponId/typeを武器由来にする)、無ければEquipment.csv側の
 * Category(Armor/Utility等)をtypeとして記録するだけの非武器パーツになる。
 */
export function placeEquipment(entry: EquipmentListEntry, ox: number, oy: number, dataManager: { data: ISaveData; save: () => void }): boolean {
    if (!dataManager || !dataManager.data || !dataManager.data.gridData) return false;
    const { equipment, weapon } = entry;
    if (!equipment || !equipment.shapeCells || equipment.shapeCells.length === 0) return false;

    const { layout, equippedParts } = dataManager.data.gridData;
    const cells = shapeCellsAt(equipment.shapeCells, ox, oy);
    if (!canPlaceShape(cells, layout, equippedParts)) return false;

    // shapeCells自体は(0,0)基準の相対座標という規約(CSVHelper/EquipmentData参照)なので、
    // バウンディングボックスの幅/高さは常にmax(shapeCells)+1、アンカーはそのままox/oyになる。
    const xs = equipment.shapeCells.map(c => c.x);
    const ys = equipment.shapeCells.map(c => c.y);
    const part: IGridPart = {
        x: ox, y: oy,
        w: Math.max(...xs) + 1, h: Math.max(...ys) + 1,
        type: weapon ? weapon.type : equipment.category,
        id: `part_${_nextPartIdSeq++}`,
        weaponId: weapon ? weapon.id : undefined,
        equipmentId: equipment.id,
        cells: equipment.shapeCells.map(c => ({ x: c.x, y: c.y })), // 相対座標のまま保持(partOccupiedCells()がpart.x/yを足す)
    };

    equippedParts.push(part);
    dataManager.save();
    return true;
}

/**
 * Equipmentリスト(③)に出す一覧。2種類をまとめて返す:
 *   1. 武器(equipmentId/shapeCellsが設定されているもの)。解放済み/未解放を問わず全部含む
 *      (未解放の武器も存在自体は見せて、???表示+ホバーで解放条件を案内する設計のため)。
 *   2. 武器に紐付かない装備(Armor/Utility等、Equipment.csv上でどのWeaponData.equipmentIdからも
 *      参照されていないもの)。こちらもEquipmentData.unlockCost/unlockItemsで解放要否を判定する。
 * どちらも既にグリッドに配置済みのものは除外する(同じ物を何個も置けないようにする、1個までの前提)。
 */
export function getEquipmentListEntries(saveData: ISaveData): EquipmentListEntry[] {
    const db = GameDatabase.instance;
    if (!db || !saveData) return [];
    const placedWeaponIds = new Set((saveData.gridData.equippedParts || []).map(p => p.weaponId).filter(id => !!id));
    const placedEquipmentIds = new Set((saveData.gridData.equippedParts || []).map(p => p.equipmentId).filter(id => !!id));

    const weaponEntries: EquipmentListEntry[] = db.weapons
        .filter(w => w.equipmentId && w._equipment && w._equipment.shapeCells && w._equipment.shapeCells.length > 0)
        .filter(w => !placedWeaponIds.has(w.id))
        .map(w => ({ equipment: w._equipment, weapon: w, locked: !isEquipmentUnlocked(w._equipment, saveData) }));

    const weaponEquipmentIds = new Set(db.weapons.map(w => w.equipmentId).filter(id => !!id));
    const nonWeaponEntries: EquipmentListEntry[] = db.equipment
        .filter(e => e.shapeCells && e.shapeCells.length > 0)
        .filter(e => !weaponEquipmentIds.has(e.id)) // 武器から参照済みのEQ_はそちら経由で出すので二重に出さない
        .filter(e => !placedEquipmentIds.has(e.id))
        .map(e => ({ equipment: e, weapon: null, locked: !isEquipmentUnlocked(e, saveData) }));

    return [...weaponEntries, ...nonWeaponEntries];
}
