import { GAME_SETTINGS } from './Constants';
import { ISaveData, IGridPart } from './DataManager';
import { EquipmentData, WeaponData, IUnlockItemRequirement } from './GameDataTypes';
import { GameDatabase } from './GameDatabase';
import { isEquipmentUnlocked } from './EquipmentUnlock';

/**
 * Home > Customize画面のグリッドセル解放ロジック。DataManager.data.gridData.layout(6x6ダイヤ型、
 * GAME_SETTINGS.SHIP_LAYOUTがテンプレート)の値を「0=艦外(配置不可)/1=未解放セル(お金/アイテムで
 * 解放)/2=解放済み」として扱う。WeaponCalc.ts(武器解放)と同じ設計方針: コスト計算とDataManager
 * 書き込みを分離し、実際の消費はunlockCell()だけが行う。
 *
 * 解放コストはどのセルかではなく「これまでに何回セルを購入したか」(Tier、GridCells.csv)で決まる
 * (1回目/2回目…と回数が進むごとに同じコストが全セル共通で上がっていく方式。EquipmentDataと同じ
 * unlockItems規約でアイテム要求も持てる)。購入済み回数はcountPurchasedCells()参照。
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

// これまでにプレイヤーが購入(解放)したセル数。現在のlayoutの"2"の個数から、初期テンプレート
// (GAME_SETTINGS.SHIP_LAYOUT、初期装備の土台として最初から"2"になっているぶん)の"2"の個数を
// 差し引く。セーブデータ側に別途カウンタを持たせず、layout自体から都度算出する。
export function countPurchasedCells(layout: number[][]): number {
    const count = (l: number[][]) => (l || []).reduce((sum, row) => sum + row.filter(v => v === 2).length, 0);
    return Math.max(0, count(layout) - count(GAME_SETTINGS.SHIP_LAYOUT));
}

export interface GridCellUnlockInfo {
    tier: number; // これが「何回目」の解放になるか(購入済み回数+1)
    cost: number;
    items: IUnlockItemRequirement[];
}

// 次に解放するセルのコスト/必要アイテムを返す(GridCells.csvのTier別行、GameDatabase.
// getGridCellDataForTier())。DBが未準備/1行も定義が無ければ、旧来の全セル一律値・アイテム無しに
// フォールバックする。
export function getNextCellUnlockInfo(saveData: ISaveData): GridCellUnlockInfo {
    const layout = saveData && saveData.gridData ? saveData.gridData.layout : null;
    const tier = countPurchasedCells(layout) + 1;
    const db = GameDatabase.instance;
    const row = db ? db.getGridCellDataForTier(tier) : null;
    if (row) return { tier, cost: row.unlockCost, items: row.unlockItems };
    return { tier, cost: GAME_SETTINGS.ECONOMY.CELL_UNLOCK_COST, items: [] };
}

// 現在装備中のパーツの合計重量(SideBarUIのCARGO表示、ミッション外での「今の積載量」用)。
// 重量はEquipment.csv(EquipmentData.weight)に一元化されている(武器もWeapons.csv側のWeight列を
// 廃止しEquipment.csv側へ移植済み、WeaponCalc.checkLoadoutEquip()も同様にEquipment.csv側を見る)。
// equipmentIdはplaceEquipment()により武器/非武器を問わず常にセットされるため、このIDだけで済む。
export function computeEquippedWeight(equippedParts: IGridPart[]): number {
    if (!equippedParts) return 0;
    const db = GameDatabase.instance;
    if (!db) return 0;

    let total = 0;
    for (const part of equippedParts) {
        if (!part.equipmentId) continue;
        const equipment = db.getEquipmentData(part.equipmentId);
        if (equipment) total += equipment.weight;
    }
    return total;
}

export function canAffordCellUnlock(saveData: ISaveData): boolean {
    if (!saveData) return false;
    const info = getNextCellUnlockInfo(saveData);
    if (saveData.money < info.cost) return false;
    for (const it of info.items) {
        if ((saveData.inventory[it.itemId] || 0) < it.qty) return false;
    }
    return true;
}

/**
 * 実際にクレジット+必要アイテムを消費してセルを解放する(WeaponCalc.unlockWeapon()と同じ
 * 「消費→即save()」方式)。既に解放済み(2)ならtrue(何もしない)、艦外(0)やお金/アイテム不足なら
 * falseを返す。
 */
export function unlockCell(x: number, y: number, dataManager: { data: ISaveData; save: () => void; addResource: (type: string, amount: number) => void }): boolean {
    if (!dataManager) return false;
    const layout = dataManager.data && dataManager.data.gridData ? dataManager.data.gridData.layout : null;
    if (!layout || !layout[y] || layout[y][x] === undefined) return false;

    if (layout[y][x] === 2) return true; // 既に解放済み
    if (layout[y][x] !== 1) return false; // 0(艦外)は解放対象外

    if (!canAffordCellUnlock(dataManager.data)) return false;

    const info = getNextCellUnlockInfo(dataManager.data);
    dataManager.addResource('credits', -info.cost); // 内部でsave()まで行われる
    for (const it of info.items) dataManager.addResource(it.itemId, -it.qty);
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
    // trueなら現在グリッドに配置済み(表示専用エントリ、リスト側からのクリック操作は無し。
    // 再配置/Eject/LvUpは全てグリッド側のセルクリックで行う、CustomizeUI.ts参照)。
    equipped: boolean;
    // equipped=trueかつweaponが非nullの場合のみ意味を持つ、装備中インスタンスの現在Lv。
    equippedLv?: number;
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
 * 既にグリッドに配置済みのものも除外せず一覧に含める(表示専用、equipped=trueで区別する。
 * 「装備しているBeamGunは最初から表示しておく」要件のため)。配置操作自体はグリッド側で行うので、
 * 重複配置(1個までの制約)はplaceEquipment()側のcanPlaceShape()判定でこれまで通り防がれる。
 */
export function getEquipmentListEntries(saveData: ISaveData): EquipmentListEntry[] {
    const db = GameDatabase.instance;
    if (!db || !saveData) return [];
    const equippedParts = saveData.gridData.equippedParts || [];
    const placedWeaponPart = new Map(equippedParts.filter(p => !!p.weaponId).map(p => [p.weaponId as string, p]));
    const placedEquipmentPart = new Map(equippedParts.filter(p => !!p.equipmentId).map(p => [p.equipmentId as string, p]));

    const weaponEntries: EquipmentListEntry[] = db.weapons
        .filter(w => w.equipmentId && w._equipment && w._equipment.shapeCells && w._equipment.shapeCells.length > 0)
        .map(w => {
            const placed = placedWeaponPart.get(w.id);
            return {
                equipment: w._equipment, weapon: w,
                locked: !isEquipmentUnlocked(w._equipment, saveData),
                equipped: !!placed,
                equippedLv: placed ? (placed.lv || 0) : undefined,
            };
        });

    const weaponEquipmentIds = new Set(db.weapons.map(w => w.equipmentId).filter(id => !!id));
    const nonWeaponEntries: EquipmentListEntry[] = db.equipment
        .filter(e => e.shapeCells && e.shapeCells.length > 0)
        .filter(e => !weaponEquipmentIds.has(e.id)) // 武器から参照済みのEQ_はそちら経由で出すので二重に出さない
        .map(e => ({ equipment: e, weapon: null, locked: !isEquipmentUnlocked(e, saveData), equipped: placedEquipmentPart.has(e.id) }));

    return [...weaponEntries, ...nonWeaponEntries];
}
