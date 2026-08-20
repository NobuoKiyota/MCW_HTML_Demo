import { DataManager, ISaveData } from './DataManager';
import { GameDatabase } from './GameDatabase';
import { AchievementData } from './GameDataTypes';
import { isEquipmentUnlocked } from './EquipmentUnlock';

/**
 * 実績報酬(Achievement)の唯一の判定役。DataManager.data.careerStats等の各種カウンタを
 * Achievements.csv(GameDatabase.getAllAchievements())の条件と照合し、新規達成分をまとめて
 * 報酬付与する。呼び出し元はHomeUI.ts常駐の定期チェックポイント(update()のスロットル監視+
 * start())の1箇所のみ - 各アクション箇所(グリッド解放/装備購入/ミッション完了)はcareerStats
 * への単純なカウンタ加算だけを行い(CustomizeCalc.ts/EquipmentUnlock.ts/GameManager.ts/
 * UpgradeUI.ts参照)、達成判定自体はここに集約する(あちこちに判定ロジックを分散させないための設計)。
 */
export class AchievementManager {
    private static _instance: AchievementManager;
    public static get instance(): AchievementManager {
        if (!this._instance) this._instance = new AchievementManager();
        return this._instance;
    }

    /**
     * 未達成の実績を判定し、達成していれば報酬をまとめて1回で付与してunlockedAchievementIdsに
     * 記録する。新規に達成した実績の配列を返す(呼び出し側がダイアログ表示に使う、空配列なら
     * 達成なし)。DataManager/GameDatabaseがまだ準備できていない場合は何もせず空配列を返す。
     */
    public checkAndUnlock(): AchievementData[] {
        const db = GameDatabase.instance;
        const dm = DataManager.instance;
        if (!db || !db.isReady || !dm) return [];
        if (!dm.data.unlockedAchievementIds) dm.data.unlockedAchievementIds = [];

        const newlyUnlocked: AchievementData[] = [];
        for (const ach of db.getAllAchievements()) {
            if (dm.data.unlockedAchievementIds.includes(ach.id)) continue;
            if (this.isConditionMet(ach, dm.data, db)) {
                newlyUnlocked.push(ach);
            }
        }
        if (newlyUnlocked.length === 0) return [];

        // 複数達成分をここで合算してから1回だけ払い出す(要件: 「実績解放は複数溜まっていたら
        // 合算して一度に報酬を支払う」)。ArchievementsComplete等の「他の実績が全部揃ったら」系条件は
        // このループより前の時点(=まだ何もunlockedAchievementIdsに積まれていない状態)で評価済みなので、
        // 同一tick内で連鎖達成することはなく、次回のcheckAndUnlock()呼び出しで正しく判定される。
        let totalCredits = 0;
        const itemTotals: { [itemId: string]: number } = {};
        for (const ach of newlyUnlocked) {
            dm.data.unlockedAchievementIds.push(ach.id);
            totalCredits += ach.rewardCredits || 0;
            for (const it of ach.rewardItems || []) {
                itemTotals[it.itemId] = (itemTotals[it.itemId] || 0) + it.qty;
            }
        }

        if (totalCredits > 0) dm.addResource('credits', totalCredits);
        for (const itemId of Object.keys(itemTotals)) {
            dm.addResource(itemId, itemTotals[itemId]);
        }
        dm.save();

        console.log(`[AchievementManager] Unlocked ${newlyUnlocked.length} achievement(s): ${newlyUnlocked.map(a => a.id).join(', ')} (credits=${totalCredits}, items=${JSON.stringify(itemTotals)})`);
        return newlyUnlocked;
    }

    // ConditionType(Achievements.csv、Master Manager AchievementManagerタブのSCHEMA.fixedListと
    // 完全に一致させること)ごとの判定式。
    private isConditionMet(ach: AchievementData, data: ISaveData, db: GameDatabase): boolean {
        const stats = data.careerStats;
        const param = ach.conditionParam;

        // LvNNAllSubMissionClearCount(NN=01~10等、可変)はMissionLv別の固定スロットではなく
        // ConditionType名自体にLv番号を埋め込む規約(Achievements.csv参照)。正規表現で吸収し、
        // Lv11以降が将来追加されても switch に手を入れずに対応できるようにしておく。
        const lvMatch = ach.conditionType.match(/^Lv(\d+)AllSubMissionClearCount$/);
        if (lvMatch) {
            return this.isMissionLvFullyCleared(parseInt(lvMatch[1], 10), data, db);
        }

        switch (ach.conditionType) {
            case 'MissionClearCount':
                return (stats.totalClearedStages || 0) >= param;
            case 'NoDamageClearCount':
                return (stats.noDamageClearCount || 0) >= param;
            case 'AllKillsClearCount':
                return (stats.allKillsClearCount || 0) >= param;
            case 'CustomizeCount':
                return (stats.customizeActionCount || 0) >= param;
            case 'EquipmentPurchaseCount':
                return (stats.equipmentPurchaseCount || 0) >= param;
            case 'VehicleUpgradeCount':
                return (stats.vehicleUpgradeCount || 0) >= param;
            case 'DamageTotalCount':
                return (stats.totalDamageDealt || 0) >= param;
            case 'DamageTakenTotalCount':
                return (stats.totalDamageReceived || 0) >= param;

            // 定義済みの全MissionLv(db.missionDifficulties)について、LvNNAllSubMissionClearCountと
            // 同じ判定を全Lv分ANDで満たす(Sub含む完全制覇)。
            case 'MissionClearComplete': {
                const lvs = Array.from(new Set(db.missionDifficulties.map(md => md.lv)));
                if (lvs.length === 0) return false;
                return lvs.every(lv => this.isMissionLvFullyCleared(lv, data, db));
            }

            // Equipment.csv全行がisEquipmentUnlocked()済み(=最初から無条件解放の行も含めて全て所持)。
            case 'EquipmentPurchaseComplete': {
                if (db.equipment.length === 0) return false;
                return db.equipment.every(eq => isEquipmentUnlocked(eq, data));
            }

            // 自分自身を除く全実績がunlockedAchievementIdsに含まれているか(メタ実績)。
            case 'ArchievementsComplete': {
                const others = db.getAllAchievements().map(a => a.id).filter(id => id !== ach.id);
                if (others.length === 0) return false;
                return others.every(id => data.unlockedAchievementIds.includes(id));
            }

            // 以下2つは対応するゲーム機能(新機体開発UI/Items.csvのレア度フラグ)がまだ実装されて
            // いないため、判定材料となるデータが存在しない。機能実装時にここへ条件式を追加する
            // (現時点では「エラーにはしないが達成もしない」プレースホルダとして扱う)。
            case 'FirstVehicleCreate':
            case 'FirstRarePartsGet':
                return false;

            default:
                console.warn(`[AchievementManager] Unknown ConditionType '${ach.conditionType}' for achievement '${ach.id}'.`);
                return false;
        }
    }

    // そのMissionLvに定義されている全SubLv行数(MissionUI.rollMissionsForPage()のallRowsForLvと
    // 同じ情報源)と、実際にクリア済みのSubLv数を比較する。
    private isMissionLvFullyCleared(lv: number, data: ISaveData, db: GameDatabase): boolean {
        const totalSubLv = db.missionDifficulties.filter(md => md.lv === lv).length;
        if (totalSubLv <= 0) return false;
        const cleared = (data.clearedMissionSubLvs && data.clearedMissionSubLvs[lv]) || [];
        return cleared.length >= totalSubLv;
    }
}
