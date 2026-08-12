import { GameDatabase } from './GameDatabase';
import { IGameManager } from './Constants';

/**
 * PlayerUpgrade.csv(9パラメータ: HP/CP/SP/AC/DF/TN/CR/VOS/WOS)のLv別実値・コストを計算する。
 * extensions/master-manager/panels/default/index.js のLv別プレビュー計算式と完全に一致させる
 * こと(計算式を片方だけ変えるとプレビューと実際のゲーム内数値が食い違う)。
 * 校正値(コスト単価係数/序盤・終盤ミッション基準クレジット)はGameManagerConfig.jsonを
 * 単一の情報源とし、プレビュー側もそこから読み書きする。
 */

// PlayerUpgrade.csvのParamID一覧。UpgradeUI.ts/SideBarUI.tsなど参照する側は全てここからimportし、
// 個別に配列を複製しない(9パラメータの正式リストはここが唯一の情報源)。
export const PARAM_IDS = ['HP', 'CP', 'SP', 'AC', 'DF', 'TN', 'CR', 'VOS', 'WOS'];

export const GROWTH_EXPONENTS: { [key: string]: number } = {
    '超早熟': 0.35,
    '早熟': 0.6,
    '標準': 1.0,
    '晩成': 1.6,
    '超晩成': 2.2,
};

export const MATERIAL_PREFIX: { [key: string]: string } = {
    '装甲強化パーツ': 'PT_Armor',
    '高性能エンジンパーツ': 'PT_Engine',
    '電脳強化パーツ': 'PT_Cyber',
};

export const MATERIAL_TIER_COUNT = 10;
export const MATERIAL_START_LV = 10;
export const MAX_STAR = 8;
const COST_LINEAR_FLOOR = 0.2;

export interface UpgradeLevelInfo {
    lv: number;
    value: number;
    cost: number; // 抽象コスト比重(実クレジットではない、creditsPerCostUnitAt()で変換する)
}

export interface MaterialRequirement {
    tierIndex: number;
    quantity: number;
    itemId: string | null; // MaterialCategoryが未設定/未対応の場合はnull
}

function growthExponent(growthType: string): number {
    const g = GROWTH_EXPONENTS[growthType];
    return g !== undefined ? g : 1.0;
}

// 各Lv(1..maxLv)の実値とコスト比重を計算する。コスト指数は常に1/G(正の値)なので、
// Lvが上がるほどコストが下がることは式の上で起こらない。最終Lv(MaxLv)のコストは
// StarValue×MaxLvだけで決まりGrowthTypeでは変わらないため、★の高いパラメータの最終コストが
// ★の低いパラメータを下回ることもない(GameManagerEditorのDESIGN_NOTES.md相当、詳細はMaster
// Managerパネル側の同名関数のコメント参照)。
export function computeUpgradeCurve(minValue: number, maxValue: number, growthType: string, maxLv: number, starValue: number, costUnitScale: number): UpgradeLevelInfo[] {
    const g = growthExponent(growthType);
    const costExponent = 1 / g;
    const lvCount = Math.max(1, Math.floor(maxLv) || 20);
    const finalLevelCost = (starValue || 1) * lvCount * costUnitScale;

    const result: UpgradeLevelInfo[] = [];
    for (let lv = 1; lv <= lvCount; lv++) {
        const progress = lv / lvCount;
        const value = minValue + (maxValue - minValue) * Math.pow(progress, g);
        const shapedProgress = COST_LINEAR_FLOOR * progress + (1 - COST_LINEAR_FLOOR) * Math.pow(progress, costExponent);
        const cost = finalLevelCost * shapedProgress;
        result.push({ lv, value, cost });
    }
    return result;
}

// Lv(MATERIAL_START_LV以上)で必要になる素材のTierと個数をStarValueに応じて算出する。
export function computeMaterialRequirement(lv: number, maxLv: number, growthType: string, starValue: number, materialCategory: string): MaterialRequirement | null {
    if (lv < MATERIAL_START_LV) return null;

    const g = growthExponent(growthType);
    const span = Math.max(1, maxLv - MATERIAL_START_LV);
    const matProgress = Math.min(1, (lv - MATERIAL_START_LV) / span);

    const qMin = 3;
    const qMax = qMin + Math.round(starValue * 10 / 3);
    const quantity = Math.round(qMin + (qMax - qMin) * Math.pow(matProgress, g));

    const tiersToUse = Math.max(1, Math.min(MATERIAL_TIER_COUNT, Math.round(starValue / MAX_STAR * MATERIAL_TIER_COUNT)));
    const tierIndex = Math.min(tiersToUse, 1 + Math.floor(matProgress * tiersToUse));

    const prefix = MATERIAL_PREFIX[materialCategory] || null;
    const itemId = prefix ? `${prefix}Lv${String(tierIndex).padStart(2, '0')}` : null;

    return { tierIndex, quantity, itemId };
}

// コスト比重1単位あたりの実クレジット額。序盤(Lv1付近)はEarly、終盤(MaxLv付近)はLateの基準額に
// 近づくよう線形補間する(「1ミッション ≒ ★5相当」という取り決めから逆算)。
export function creditsPerCostUnitAt(lv: number, maxLv: number, gm: IGameManager): number {
    const early = gm.missionEarlyBaselineCredits;
    const late = gm.missionLateBaselineCredits;
    const progress = maxLv > 0 ? lv / maxLv : 0;
    const missionBaseline = early + (late - early) * progress;
    const referenceUnitCost = computeUpgradeCurve(0, 1, '標準', 20, 1, gm.upgradeCostUnitScale)[0].cost;
    if (referenceUnitCost <= 0) return 0;
    return (missionBaseline / 5) / referenceUnitCost;
}

export interface UpgradeStepInfo {
    paramId: string;
    label: string;
    currentLv: number;
    maxLv: number;
    isMaxLv: boolean;
    currentValue: number;
    nextValue: number | null;   // nullならMaxLv到達済み
    creditsCost: number | null; // nullならMaxLv到達済み
    material: MaterialRequirement | null;
}

// 現在Lvから「次の1段階」に必要な情報(値・実クレジット・必要素材)をまとめて返す。
// UpgradeUI.tsの表示・購入可否判定・購入処理はすべてこの関数の戻り値を使う。
export function getUpgradeStepInfo(paramId: string, currentLv: number, gm: IGameManager): UpgradeStepInfo | null {
    const db = GameDatabase.instance;
    const def = db ? db.getPlayerUpgradeParam(paramId) : null;
    if (!def) return null;

    const maxLv = def.maxLv;
    const clampedLv = Math.max(0, Math.min(currentLv, maxLv));
    const curve = computeUpgradeCurve(def.minValue, def.maxValue, def.growthType, maxLv, def.starValue, gm.upgradeCostUnitScale);

    const currentValue = clampedLv <= 0 ? def.minValue : curve[clampedLv - 1].value;
    const isMaxLv = clampedLv >= maxLv;

    let nextValue: number | null = null;
    let creditsCost: number | null = null;
    let material: MaterialRequirement | null = null;

    if (!isMaxLv) {
        const nextLv = clampedLv + 1;
        const entry = curve[nextLv - 1];
        nextValue = entry.value;
        const perUnit = creditsPerCostUnitAt(nextLv, maxLv, gm);
        creditsCost = Math.round(entry.cost * perUnit);
        material = computeMaterialRequirement(nextLv, maxLv, def.growthType, def.starValue, def.materialCategory);
    }

    return {
        paramId: def.paramId,
        label: def.label,
        currentLv: clampedLv,
        maxLv,
        isMaxLv,
        currentValue,
        nextValue,
        creditsCost,
        material,
    };
}

// Resetで返金するクレジット/アイテムを、Lv1..currentLvの購入履歴を式から再計算して求める。
// 実際の購入履歴を別途保存する代わりに、常に「今の式で現在Lvまで買うといくらかかるか」を
// 逆算する方式(計算式やGameManagerConfig.jsonの校正値を後から調整しても矛盾が起きない)。
export interface RefundInfo {
    credits: number;
    items: { [itemId: string]: number };
}

export function computeRefund(paramId: string, currentLv: number, gm: IGameManager, refundPercent: number): RefundInfo {
    const result: RefundInfo = { credits: 0, items: {} };
    const db = GameDatabase.instance;
    const def = db ? db.getPlayerUpgradeParam(paramId) : null;
    if (!def || currentLv <= 0) return result;

    const maxLv = def.maxLv;
    const clampedLv = Math.min(currentLv, maxLv);
    const curve = computeUpgradeCurve(def.minValue, def.maxValue, def.growthType, maxLv, def.starValue, gm.upgradeCostUnitScale);

    let totalCredits = 0;
    for (let lv = 1; lv <= clampedLv; lv++) {
        const entry = curve[lv - 1];
        const perUnit = creditsPerCostUnitAt(lv, maxLv, gm);
        totalCredits += entry.cost * perUnit;

        const matReq = computeMaterialRequirement(lv, maxLv, def.growthType, def.starValue, def.materialCategory);
        if (matReq && matReq.itemId) {
            result.items[matReq.itemId] = (result.items[matReq.itemId] || 0) + matReq.quantity;
        }
    }

    const ratio = Math.max(0, Math.min(100, refundPercent)) / 100;
    result.credits = Math.round(totalCredits * ratio);
    for (const itemId of Object.keys(result.items)) {
        result.items[itemId] = Math.round(result.items[itemId] * ratio);
    }
    return result;
}
