import { GameDatabase } from './GameDatabase';
import { MissionDifficultyData, SpawnTableData } from './GameDataTypes';
import { IGameManager } from './Constants';

/**
 * MissionDifficulty.csv(1行 = 特定Lv内のSubLv段階、GameDataTypes.ts:MissionDifficultyData参照)
 * から、実際に1ミッションぶんの距離/報酬/貨物/目標時間/使用SpawnTableを生成する。
 * 元はBehaviorTestController.refreshMissionPreview()に直書きされていたテスト用プレビュー生成
 * ロジックをそのまま抽出したもの(計算式自体は変更していない)。MissionUI.ts(本番のSELECT
 * MISSION画面)とBehaviorTestController.ts(行動パターン検証シーンのMissionプレビュー)の
 * 両方から呼ばれる共通の情報源にする(二重管理を避けるため、この計算式はここ1箇所のみに置く)。
 */
export interface GeneratedMission {
    modCount: number;
    lv: number;
    tableCount: number;
    tableIds: string[];
    tableDists: number[];
    distA: number;
    distB: number;
    distC: number;
    distD: number;
    rewardG: number;
    cargoWeight: number;
    cargoPrice: number;
    rewardH: number;
    targetTimeSec: number;
}

// modCountは表示/ログ用の情報としてそのまま結果に含めるだけで、diffの選定自体には使わない
// (どの行を使うかは呼び出し側が既に決めている前提 - MissionUI.tsは解放済みSubLv行から
// ランダムに選んだ特定の行を渡し、BehaviorTestController.tsは従来通りgetMissionDifficultyForModCount()
// で選んだ行を渡す)。
export function generateMissionFromDifficultyRow(diff: MissionDifficultyData, modCount: number, gm: IGameManager): GeneratedMission | null {
    const db = GameDatabase.instance;
    if (!db || !gm || !diff) return null;

    // MissionDifficulty.csv側でSpawnTableIDsが指定されていればそれだけを候補にする(個別選定)。
    // 未指定(空)なら従来通りlv一致の全SpawnTable行を候補にする(後方互換)。
    const pool = diff.spawnTableIds && diff.spawnTableIds.length > 0
        ? db.spawnTables.filter(st => diff.spawnTableIds.includes(st.id))
        : db.spawnTables.filter(st => st.lv === diff.lv);
    if (pool.length === 0) return null;

    // ローテーション式抽選: 一度選ばれたSpawnTable IDは、その後
    // missionMaxDuplicateSpawnTable(GameManagerConfig.jsonのGlobalRule)回ぶんの抽選から
    // 除外され、その回数が経過すると再び候補に復帰する。1ミッション内での総出現回数に上限は
    // 設けない(ガチャ的に長いミッションでは同じTableが何度も出ることがあり得るのは意図通り)。
    // 目的はあくまで「直近で連続/近接して同じTableばかり選ばれる」のを防ぐことで、
    // 全候補を必ず1回は出現させる保証は無い。pool.length <= 除外ターン数だと毎回全滅する
    // 可能性があるため、その場合はクールダウンを1ターン進めて再試行する(guardで無限ループ防止、
    // 300回で諦める)。
    const cooldownTurns = Math.max(1, gm.missionMaxDuplicateSpawnTable || 2);
    const cooldown: { [id: string]: number } = {};
    const selected: SpawnTableData[] = [];
    let guard = 0;
    while (selected.length < diff.tableCount && guard < 300) {
        guard++;
        const eligible = pool.filter(st => (cooldown[st.id] || 0) <= 0);
        if (eligible.length === 0) {
            for (const id in cooldown) cooldown[id] = Math.max(0, cooldown[id] - 1);
            continue;
        }
        const cand = eligible[Math.floor(Math.random() * eligible.length)];
        selected.push(cand);
        for (const id in cooldown) cooldown[id] = Math.max(0, cooldown[id] - 1);
        cooldown[cand.id] = cooldownTurns;
    }
    // SubLv昇順(弱い順)に並べ、開始margin(A)を消費した直後から順に発火させる。
    selected.sort((a, b) => a.subLv - b.subLv);

    const distA = gm.missionMarginStartKm;
    const distC = gm.missionMarginEndKm;
    const distB = selected.reduce((sum, st) => sum + st.dist, 0);
    const distD = distA + distB + distC;

    const lv = diff.lv;
    const rewardG = Math.round(distD * lv);

    const wMin = gm.missionCargoWeightBaseMin + (lv - 1) * gm.missionCargoWeightPerLv;
    const wMax = gm.missionCargoWeightBaseMax + (lv - 1) * gm.missionCargoWeightPerLv;
    const cargoWeight = Math.round(wMin + Math.random() * Math.max(0, wMax - wMin));
    const cargoPrice = gm.missionCargoPriceBase + (lv - 1) * gm.missionCargoPricePerLv;
    const rewardH = cargoWeight * cargoPrice;

    const assumedSpeed = Math.max(0.001, gm.missionAssumedMaxSpeedKmPerMin * gm.missionTargetSpeedRatio);
    const targetTimeSec = (distD / assumedSpeed) * 60;

    return {
        modCount, lv, tableCount: diff.tableCount,
        tableIds: selected.map(s => s.id), tableDists: selected.map(s => s.dist),
        distA, distB, distC, distD,
        rewardG, cargoWeight, cargoPrice, rewardH,
        targetTimeSec,
    };
}
