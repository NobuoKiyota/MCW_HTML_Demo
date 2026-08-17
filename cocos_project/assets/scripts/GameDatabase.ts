import { _decorator, Component, CCInteger, CCFloat, TextAsset, Prefab, resources, director, JsonAsset } from 'cc';
import { EnemyData, BehaviorData, ShotPatternData, DropData, SoundData, BehaviorGraph, ShotGraph, ItemData, DropTableData, SpawnTableData, MissionDifficultyData, PlayerUpgradeParamData, EquipmentData, WeaponData, GridCellData } from './GameDataTypes';
import { GAME_SETTINGS } from './Constants';
import { CSVHelper } from './CSVHelper';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

/**
 * ゲーム内データを一元管理するためのデータベースコンポーネント
 * GameBalanceData.ts (JSON) の代わりに使用し、インスペクターでの調整を可能にする
 */
@ccclass('GameDatabase')
export class GameDatabase extends Component {

    // REFACTORED: Registory for Prefab (Named)
    // Instead of listing every EnemyData in Inspector, we just register Prefabs here.
    // CSV "PrefabName" column will map to these.
    @property({ type: [Prefab], tooltip: "敵のプレハブリスト (CSVのPrefabNameと一致させる)" })
    public enemyPrefabs: Prefab[] = [];

    // ドロップアイテムのプレハブリスト (assets/resources/Prefabs/ItemParts、Items.csvのPrefabNameと
    // 一致させる、enemyPrefabsと同じ「resources.loadDirで一括ロード→ノード名で突き合わせ」方式)。
    @property({ type: [Prefab], tooltip: "アイテムのプレハブリスト (Items.csvのPrefabNameと一致させる)" })
    public itemPrefabs: Prefab[] = [];

    // Runtime Storage (Generated from CSV)
    public enemies: EnemyData[] = [];

    // ... (rest of props)

    // --- Raw Data Storage ---
    public behaviors: BehaviorData[] = [];
    public shotPatterns: ShotPatternData[] = [];
    public drops: DropData[] = [];
    public items: ItemData[] = [];
    public dropTables: DropTableData[] = [];
    public spawnTables: SpawnTableData[] = [];
    public missionDifficulties: MissionDifficultyData[] = [];
    public playerUpgradeParams: PlayerUpgradeParamData[] = [];
    public equipment: EquipmentData[] = [];
    public weapons: WeaponData[] = [];
    public sounds: SoundData[] = [];
    public gridCells: GridCellData[] = [];

    // --- CSV Assets ---
    @property({ type: TextAsset, tooltip: "CSV: Enemies" })
    public enemyCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Behaviors" })
    public behaviorCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: ShotPatterns" })
    public shotPatternCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Drops" })
    public dropCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Items" })
    public itemCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: DropTables" })
    public dropTableCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: SpawnTables" })
    public spawnTableCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: MissionDifficulty" })
    public missionDifficultyCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: PlayerUpgrade" })
    public playerUpgradeCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Equipment" })
    public equipmentCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Weapons" })
    public weaponCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Sounds" })
    public soundCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: GridCells" })
    public gridCellCsv: TextAsset = null;

    // Singleton access helper (Component based)
    public static instance: GameDatabase = null;
    public isReady: boolean = false;

    onLoad() {
        console.log("[GameDatabase] onLoad triggered.");
        if (!GameDatabase.instance || !GameDatabase.instance.isValid) {
            GameDatabase.instance = this;
            console.log("[GameDatabase] Singleton initialized.");
        } else if (GameDatabase.instance !== this) {
            // Check for dummy hijacking
            if (GameDatabase.instance.node.name.includes("Dummy")) {
                console.log("[GameDatabase] Hijacking singleton from Dummy node.");
                const oldNode = GameDatabase.instance.node;
                GameDatabase.instance = this;
                oldNode.destroy();
            } else {
                console.warn("[GameDatabase] Duplicate valid instance found, destroying this component.");
                this.destroy(); // Component only
                return;
            }
        }

        // director.addPersistRootNode(this.node); // Removed for Single Scene

        // Fail-safe initialization
        if (!this.enemies) this.enemies = [];
        if (!this.behaviors) this.behaviors = [];
        if (!this.shotPatterns) this.shotPatterns = [];
        if (!this.drops) this.drops = [];
        if (!this.sounds) this.sounds = [];

        this.loadAllCSV();
    }

    onDestroy() {
        if (GameDatabase.instance === this) {
            GameDatabase.instance = null;
        }
    }

    start() {
        this.loadPrefabs();
    }

    private loadPrefabs() {
        resources.loadDir("Prefabs/Enemy", Prefab, (err, assets) => {
            if (err) {
                console.error("[GameDatabase] Failed to load Enemy Prefabs:", err);
                return;
            }
            this.enemyPrefabs = assets;
            console.log(`[GameDatabase] Loaded ${assets.length} Enemy Prefabs from resources/Prefabs/Enemy`);

            // CSV Load after Prefabs are ready
            this.loadAllCSV();
        });

        // Enemy同様、CSV読み込みはこちらの完了を待たない(アイテム取得はミッション開始後、
        // 十分先のタイミングでしか起きないため、並行ロードで問題ない)。
        resources.loadDir("Prefabs/ItemParts", Prefab, (err, assets) => {
            if (err) {
                console.error("[GameDatabase] Failed to load Item Prefabs:", err);
                return;
            }
            this.itemPrefabs = assets;
            console.log(`[GameDatabase] Loaded ${assets.length} Item Prefabs from resources/Prefabs/ItemParts`);
        });
    }

    private loadAllCSV() {
        // Clear old data to prevent duplicates if called multiple times (though start only runs once)
        this.behaviors = [];
        this.shotPatterns = [];
        this.drops = [];
        this.items = [];
        this.dropTables = [];
        this.spawnTables = [];
        this.missionDifficulties = [];
        this.playerUpgradeParams = [];
        this.equipment = [];
        this.weapons = [];
        this.sounds = []; // Clear old sounds
        this.enemies = []; // Clear runtime list
        this.gridCells = [];

        // Items/DropTables/SpawnTables fall back to an ASYNC resources.load() whenever their
        // Inspector TextAsset property isn't assigned (the normal case now that they're edited
        // via the Master Manager extension instead). isReady used to flip true synchronously
        // right after kicking these off, before the async loads actually resolved - any code
        // that polls `isReady` and immediately reads e.g. `spawnTables` (BehaviorTestController)
        // could catch it still empty. Track them with a pending counter so isReady only goes
        // true once every one of them has actually finished (sync ones complete immediately,
        // so they never increment this).
        let pendingAsync = 0;
        const onAsyncCsvDone = () => {
            pendingAsync--;
            if (pendingAsync <= 0) this.finishLoadAllCSV();
        };

        if (this.itemCsv) this.parseItemCSV(this.itemCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/Items", TextAsset, (err, asset) => {
                if (!err && asset) this.parseItemCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.dropTableCsv) this.parseDropTableCSV(this.dropTableCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/DropTables", TextAsset, (err, asset) => {
                if (!err && asset) this.parseDropTableCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.spawnTableCsv) this.parseSpawnTableCSV(this.spawnTableCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/SpawnTables", TextAsset, (err, asset) => {
                if (!err && asset) this.parseSpawnTableCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.missionDifficultyCsv) this.parseMissionDifficultyCSV(this.missionDifficultyCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/MissionDifficulty", TextAsset, (err, asset) => {
                if (!err && asset) this.parseMissionDifficultyCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.playerUpgradeCsv) this.parsePlayerUpgradeCSV(this.playerUpgradeCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/PlayerUpgrade", TextAsset, (err, asset) => {
                if (!err && asset) this.parsePlayerUpgradeCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.equipmentCsv) this.parseEquipmentCSV(this.equipmentCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/Equipment", TextAsset, (err, asset) => {
                if (!err && asset) this.parseEquipmentCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.weaponCsv) this.parseWeaponCSV(this.weaponCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/Weapons", TextAsset, (err, asset) => {
                if (!err && asset) this.parseWeaponCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.gridCellCsv) this.parseGridCellCSV(this.gridCellCsv.text);
        else {
            pendingAsync++;
            resources.load("Excels/GridCells", TextAsset, (err, asset) => {
                if (!err && asset) this.parseGridCellCSV(asset.text);
                onAsyncCsvDone();
            });
        }

        if (this.behaviorCsv) this.parseBehaviorCSV(this.behaviorCsv.text);
        if (this.shotPatternCsv) this.parseShotPatternCSV(this.shotPatternCsv.text);
        if (this.dropCsv) this.parseDropCSV(this.dropCsv.text);
        if (this.soundCsv) this.parseSoundCSV(this.soundCsv.text);
        if (this.enemyCsv) this.parseEnemyCSV(this.enemyCsv.text);

        // If Items/DropTables/SpawnTables were all synchronous (Inspector-assigned), this fires
        // immediately; otherwise onAsyncCsvDone() fires it once the last one resolves.
        if (pendingAsync === 0) this.finishLoadAllCSV();
    }

    private finishLoadAllCSV() {
        console.log(`[GameDatabase] Loaded: ${this.enemies.length} Enemies, ${this.items.length} Items, ${this.dropTables.length} DropTables, ${this.spawnTables.length} SpawnTables, ${this.missionDifficulties.length} MissionDifficulties, ${this.playerUpgradeParams.length} PlayerUpgradeParams, ${this.equipment.length} Equipment, ${this.weapons.length} Weapons, ${this.behaviors.length} Behaviors, ${this.shotPatterns.length} ShotPatterns, ${this.drops.length} Drops, ${this.gridCells.length} GridCells`);

        this.isReady = true;

        // Notify Manager that Database is ready (Optional, if needed for tight coupling)
        // GameManager.instance.onDatabaseReady();
    }

    private parseItemCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.items = data.map(row => {
            const item = new ItemData();
            item.id = row.ID;
            item.name = row.Name || row.ID;
            item.prefabName = row.PrefabName || row.ID;
            item.type = row.Type || "";
            item.effectType = row.EffectType || "None";
            item.effectValue = row.EffectValue !== undefined && row.EffectValue !== "" ? parseFloat(row.EffectValue) : 0;
            item.duration = row.Duration !== undefined && row.Duration !== "" ? parseFloat(row.Duration) : 0;
            item.min = row.Min !== undefined && row.Min !== "" ? parseInt(row.Min) : 1;
            item.max = row.Max !== undefined && row.Max !== "" ? parseInt(row.Max) : 1;
            item.weight = row.Weight !== undefined && row.Weight !== "" ? parseFloat(row.Weight) : 10;
            item.sellPrice = row.SellPrice !== undefined && row.SellPrice !== "" ? parseFloat(row.SellPrice) : 0;
            item.note = row.Note || "";
            return item;
        });
        console.log(`[GameDatabase] Loaded ${this.items.length} Items.`);
    }

    private parseDropTableCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.dropTables = data.map(row => {
            const dt = new DropTableData();
            dt.id = row.ID;
            dt.note = row.Note || "";
            dt.slots = [];
            for (let i = 1; i <= 5; i++) {
                const itemId = row[`ItemID_${i}`];
                const rateVal = row[`Rate_${i}`];
                if (itemId && itemId !== "" && itemId !== "None") {
                    const rate = rateVal !== undefined && rateVal !== "" ? parseFloat(rateVal) : 1.0;
                    dt.slots.push({ itemId, rate });
                }
            }
            return dt;
        });
        console.log(`[GameDatabase] Loaded ${this.dropTables.length} DropTables.`);
    }

    private parseSpawnTableCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.spawnTables = data.map(row => {
            const st = new SpawnTableData();
            st.id = row.ID;
            st.lv = row.Lv !== undefined && row.Lv !== "" ? parseFloat(row.Lv) : 1;
            st.subLv = row.SubLv !== undefined && row.SubLv !== "" ? parseFloat(row.SubLv) : 1;
            st.dist = row.Dist !== undefined && row.Dist !== "" ? parseFloat(row.Dist) : 0;
            st.min = row.Min !== undefined && row.Min !== "" ? parseInt(row.Min) : 1;
            st.max = row.Max !== undefined && row.Max !== "" ? parseInt(row.Max) : 1;
            st.lot = row.Lot || "Random";
            st.cycle = row.Cycle || "Instant";
            st.note = row.Note || "";
            st.slots = [];
            for (let i = 1; i <= 12; i++) {
                const typeId = row[`TypeID_${i}`];
                if (typeId && typeId !== "" && typeId !== "None") {
                    st.slots.push(typeId);
                }
            }
            return st;
        });
        console.log(`[GameDatabase] Loaded ${this.spawnTables.length} SpawnTables.`);
    }

    private parseMissionDifficultyCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.missionDifficulties = data.map(row => {
            const md = new MissionDifficultyData();
            md.lv = row.Lv !== undefined && row.Lv !== "" ? parseInt(row.Lv) : 1;
            md.modCountMin = row.ModCountMin !== undefined && row.ModCountMin !== "" ? parseInt(row.ModCountMin) : 0;
            md.tableCount = row.TableCount !== undefined && row.TableCount !== "" ? parseInt(row.TableCount) : 3;
            md.spawnTableIds = [];
            for (let i = 1; i <= 8; i++) {
                const v = row[`SpawnTableID_${i}`];
                if (v && v !== "" && v !== "None") md.spawnTableIds.push(v);
            }
            md.note = row.Note || "";
            return md;
        });
        console.log(`[GameDatabase] Loaded ${this.missionDifficulties.length} MissionDifficulties.`);
    }

    private parsePlayerUpgradeCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.playerUpgradeParams = data.map(row => {
            const p = new PlayerUpgradeParamData();
            p.paramId = row.ParamID;
            p.label = row.Label || row.ParamID;
            p.minValue = row.MinValue !== undefined && row.MinValue !== "" ? parseFloat(row.MinValue) : 0;
            p.maxValue = row.MaxValue !== undefined && row.MaxValue !== "" ? parseFloat(row.MaxValue) : 0;
            p.growthType = row.GrowthType || "標準";
            p.starValue = row.StarValue !== undefined && row.StarValue !== "" ? parseInt(row.StarValue) : 1;
            p.materialCategory = row.MaterialCategory || "";
            p.maxLv = row.MaxLv !== undefined && row.MaxLv !== "" ? parseInt(row.MaxLv) : 20;
            return p;
        });
        console.log(`[GameDatabase] Loaded ${this.playerUpgradeParams.length} PlayerUpgrade params.`);
    }

    // ShapeCells文字列("00;10;01"のような、2文字1組(x,y各1桁)を";"区切りで並べた形式)を
    // {x,y}配列にパースする。カンマを使わないのはMaster Managerパネル側のCSV読み書きが
    // ダブルクォート内カンマに対応していないため(Equipment.csvの列コメント参照)。
    private parseShapeCells(text: string): { x: number; y: number }[] {
        if (!text) return [];
        return text.split(';')
            .map(s => s.trim())
            .filter(s => s.length === 2)
            .map(s => ({ x: parseInt(s[0], 10), y: parseInt(s[1], 10) }));
    }

    private parseEquipmentCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.equipment = data.map(row => {
            const e = new EquipmentData();
            e.id = row.ID;
            e.name = row.Name || row.ID;
            e.category = row.Category || "";
            e.shapeCells = this.parseShapeCells(String(row.ShapeCells || ""));
            e.note = row.Note || "";
            e.unlockCost = row.UnlockCost !== undefined && row.UnlockCost !== "" ? parseFloat(row.UnlockCost) : 0;
            e.weight = row.Weight !== undefined && row.Weight !== "" ? parseFloat(row.Weight) : 0;
            // UnlockItemID_1/UnlockItemQty_1 ~ _3(最大3種類)。ItemIDが空の枠は無視する。
            e.unlockItems = [];
            for (let i = 1; i <= 3; i++) {
                const itemId = row[`UnlockItemID_${i}`];
                if (!itemId) continue;
                const qtyRaw = row[`UnlockItemQty_${i}`];
                const qty = qtyRaw !== undefined && qtyRaw !== "" ? parseInt(qtyRaw) : 1;
                e.unlockItems.push({ itemId, qty: Math.max(1, qty) });
            }
            return e;
        });
        console.log(`[GameDatabase] Loaded ${this.equipment.length} Equipment.`);
    }

    private parseWeaponCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.weapons = data.map(row => {
            const w = new WeaponData();
            w.id = row.ID;
            w.name = row.Name || row.ID;
            w.shotPatternId = row.ShotPatternID || "";
            w.group = row.Group !== undefined && row.Group !== "" ? parseInt(row.Group) : 1;
            w.starValue = row.StarValue !== undefined && row.StarValue !== "" ? parseInt(row.StarValue) : 1;
            w.type = row.Type || "Fire";
            w.penetrate = row.Penetrate !== undefined && row.Penetrate !== "" ? parseInt(row.Penetrate) : 0;
            w.category = row.Category || "";
            w.isHoming = row.IsHoming !== undefined && row.IsHoming !== "" ? parseInt(row.IsHoming) : 0;
            w.countMin = row.CountMin !== undefined && row.CountMin !== "" ? parseInt(row.CountMin) : 1;
            w.countMax = row.CountMax !== undefined && row.CountMax !== "" ? parseInt(row.CountMax) : 1;
            w.spMin = row.SPMin !== undefined && row.SPMin !== "" ? parseFloat(row.SPMin) : 0;
            w.spMax = row.SPMax !== undefined && row.SPMax !== "" ? parseFloat(row.SPMax) : 0;
            w.dmgMin = row.DmgMin !== undefined && row.DmgMin !== "" ? parseFloat(row.DmgMin) : 0;
            w.dmgMax = row.DmgMax !== undefined && row.DmgMax !== "" ? parseFloat(row.DmgMax) : 0;
            w.scaleMin = row.ScaleMin !== undefined && row.ScaleMin !== "" ? parseFloat(row.ScaleMin) : 1;
            w.scaleMax = row.ScaleMax !== undefined && row.ScaleMax !== "" ? parseFloat(row.ScaleMax) : 1;
            w.wtMin = row.WTMin !== undefined && row.WTMin !== "" ? parseFloat(row.WTMin) : 0;
            w.wtMax = row.WTMax !== undefined && row.WTMax !== "" ? parseFloat(row.WTMax) : 0;
            w.growthType = row.GrowthType || "標準";
            w.maxLv = row.MaxLv !== undefined && row.MaxLv !== "" ? parseInt(row.MaxLv) : 10;
            w.note = row.Note || "";
            w.equipmentId = row.EquipmentID || "";
            // Equipment.csv側のIDでCustomize画面グリッド用の形状データ+解放条件(UnlockCost等、
            // EquipmentUnlock.ts参照)を紐付ける(EnemyDataの_shotPattern等と同じ規約、GameDatabase側で
            // IDから解決してruntime codeが再joinしなくて済むようにする)。equipmentId未設定/該当なしなら
            // _equipmentはnullのまま(形状未定義かつ解放条件も判定不能。エラーにはしない)。
            w._equipment = w.equipmentId ? this.getEquipmentData(w.equipmentId) : null;
            return w;
        });
        console.log(`[GameDatabase] Loaded ${this.weapons.length} Weapons.`);
    }

    private parseGridCellCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.gridCells = data.map(row => {
            const c = new GridCellData();
            c.tier = row.Tier !== undefined && row.Tier !== "" ? parseInt(row.Tier) : 1;
            c.unlockCost = row.UnlockCost !== undefined && row.UnlockCost !== "" ? parseFloat(row.UnlockCost) : GAME_SETTINGS.ECONOMY.CELL_UNLOCK_COST;
            c.unlockItems = [];
            for (let i = 1; i <= 3; i++) {
                const itemId = row[`UnlockItemID_${i}`];
                if (!itemId) continue;
                const qtyRaw = row[`UnlockItemQty_${i}`];
                const qty = qtyRaw !== undefined && qtyRaw !== "" ? parseInt(qtyRaw) : 1;
                c.unlockItems.push({ itemId, qty: Math.max(1, qty) });
            }
            c.note = row.Note || "";
            return c;
        });
        // Tier昇順に並べておく(getGridCellDataForTier()のフォールバック=「最大Tier」判定を簡単にするため)。
        this.gridCells.sort((a, b) => a.tier - b.tier);
        console.log(`[GameDatabase] Loaded ${this.gridCells.length} GridCells.`);
    }

    private parseBehaviorCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.behaviors = data.map(row => {
            const d = new BehaviorData();
            d.id = row.ID;
            d.graphPath = row.GraphPath || "";
            d.note = row.Note || "";
            return d;
        });

        for (const d of this.behaviors) {
            this.loadBehaviorGraph(d);
        }
    }

    private loadBehaviorGraph(d: BehaviorData) {
        if (!d.graphPath) {
            console.warn(`[GameDatabase] BehaviorData '${d.id}' has no graphPath.`);
            return;
        }
        resources.load(d.graphPath, JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error(`[GameDatabase] Failed to load behavior graph '${d.graphPath}' for '${d.id}':`, err);
                return;
            }
            d._graph = asset.json as unknown as BehaviorGraph;
        });
    }

    private parseShotPatternCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.shotPatterns = data.map(row => {
            const d = new ShotPatternData();
            d.id = row.ID;
            d.graphPath = row.GraphPath || "";
            d.note = row.Note || "";
            return d;
        });

        for (const d of this.shotPatterns) {
            this.loadShotGraph(d);
        }
    }

    private loadShotGraph(d: ShotPatternData) {
        if (!d.graphPath) {
            console.warn(`[GameDatabase] ShotPatternData '${d.id}' has no graphPath.`);
            return;
        }
        resources.load(d.graphPath, JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error(`[GameDatabase] Failed to load shot graph '${d.graphPath}' for '${d.id}':`, err);
                return;
            }
            d._graph = asset.json as unknown as ShotGraph;
        });
    }

    private parseDropCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.drops = data.map(row => {
            const d = new DropData();
            d.id = row.ID;
            d.itemId = row.ItemID;
            d.rate = row.Rate || 0.5;
            d.min = row.Min || 1;
            d.max = row.Max || 1;
            return d;
        });
    }

    private parseEnemyCSV(text: string) {
        const data = CSVHelper.parse(text);

        for (const row of data) {
            // New System: Always create new EnemyData from CSV row
            const entry = new EnemyData();

            entry.id = row.ID;
            entry.name = row.Name;
            entry.hp = row.HP;
            entry.defense = row.Defense || 0; // New Defense Stat
            entry.contactDamage = row.ContactDamage !== undefined && row.ContactDamage !== "" ? parseFloat(row.ContactDamage) : 10;
            entry.score = row.Score || 100;

            // Prefab Linking
            const numName = row.PrefabName;
            entry.prefab = this.getPrefab(numName);

            if (!entry.prefab) {
                console.warn(`[GameDatabase] Warning: Prefab '${numName}' (for Enemy ${entry.id}) not found in 'EnemyPrefabs' list!`);
            }

            // References
            entry.behaviorId = row.BehaviorID;
            entry.speedMult = row.SpeedMult || 1.0;

            entry.shotPatternId = row.ShotPatternID;

            entry.dropTableId = row.DropTableID || row.DropID || "";

            entry.model3DPath = row.Model3DPath || "";
            entry.model3DYRot = row.Model3DYRot || 0;
            entry.scale = row.Scale !== undefined && row.Scale !== "" ? parseFloat(row.Scale) : 1.0;

            // Link Data (Cache)
            entry._behavior = this.getBehaviorData(entry.behaviorId);
            entry._shotPattern = this.getShotPatternData(entry.shotPatternId);
            entry._dropTable = this.getDropTableData(entry.dropTableId);
            entry._drops = this.getDropDataList(entry.dropId);
            entry._isFromCSV = true;

            this.enemies.push(entry);
        }
    }

    private parseSoundCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.sounds = data.map(row => {
            const d = new SoundData();
            d.id = row.ID;
            d.path = row.Path;
            d.volume = row.Volume || 1.0;
            d.cooldown = row.Cooldown || 0.05;
            d.limit = row.Limit || 0;
            d.priority = row.Priority || 0;
            return d;
        });

        console.log(`[GameDatabase] Loaded ${this.sounds.length} sound entries.`);
        if (this.sounds.length > 0) {
            console.log(`[GameDatabase] Sample Sound[0]: ID=${this.sounds[0].id}, Path=${this.sounds[0].path}`);
        }

        // プリロード開始
        if (SoundManager.instance) {
            SoundManager.instance.preloadSounds(this.sounds);
        }
    }

    // --- Getters ---

    private getPrefab(name: string): Prefab | null {
        // Strip .prefab extension if present (Robustness)
        const cleanName = name.replace(".prefab", "");
        // Search by Name in the registered list
        return this.enemyPrefabs.find(p => p.data.name === cleanName) || null;
    }

    // Items.csvのPrefabName(未設定ならID自体)でitemPrefabsから該当プレハブを探す。
    // 見つからない場合はnull(呼び出し側のGameManager.spawnItem()が汎用itemPrefab/即席生成に
    // フォールバックする)。
    public getItemPrefab(id: string): Prefab | null {
        const item = this.getItemData(id);
        const name = item && item.prefabName ? item.prefabName : id;
        if (!name) return null;
        const cleanName = name.replace(".prefab", "");
        return this.itemPrefabs.find(p => p.data.name === cleanName) || null;
    }

    // 「プレイヤーが何回目に解放するセルか」(tier、1回目/2回目…)でGridCells.csvから該当行を探す。
    // 完全一致が無ければ、定義済みの中で最大のTierの行にフォールバックする(例: 20行しか
    // 定義していないのに21個目を解放しようとした場合、20回目のコストを使い続ける)。
    // 1行も無ければnull(呼び出し側がGAME_SETTINGS.ECONOMY.CELL_UNLOCK_COSTにフォールバックする)。
    public getGridCellDataForTier(tier: number): GridCellData | null {
        if (this.gridCells.length === 0) return null;
        const exact = this.gridCells.find(c => c.tier === tier);
        if (exact) return exact;
        return this.gridCells[this.gridCells.length - 1]; // Tier昇順ソート済み(parseGridCellCSV参照)なので末尾=最大Tier
    }

    public getBehaviorData(id: string): BehaviorData | null {
        return this.behaviors.find(d => d.id === id) || null;
    }

    public getShotPatternData(id: string): ShotPatternData | null {
        return this.shotPatterns.find(d => d.id === id) || null;
    }

    public getDropDataList(id: string): DropData[] {
        return this.drops.filter(d => d.id === id); // Returns array (multiple items for same ID)
    }

    public getItemData(id: string): ItemData | null {
        return this.items.find(i => i.id === id) || null;
    }

    public getDropTableData(id: string): DropTableData | null {
        return this.dropTables.find(dt => dt.id === id) || null;
    }

    public getSpawnTableData(id: string): SpawnTableData | null {
        return this.spawnTables.find(st => st.id === id) || null;
    }

    /**
     * 総改造回数(modCount)から、現在適用すべきMissionDifficulty行を取得する。
     * ModCountMinがmodCount以下の行のうち、ModCountMinが最大のものを採用する
     * (=改造が進むほどより高いしきい値の行に切り替わっていく)。
     */
    public getMissionDifficultyForModCount(modCount: number): MissionDifficultyData | null {
        const candidates = this.missionDifficulties.filter(md => md.modCountMin <= modCount);
        if (candidates.length === 0) return null;
        return candidates.reduce((best, cur) => cur.modCountMin > best.modCountMin ? cur : best);
    }

    public getPlayerUpgradeParam(paramId: string): PlayerUpgradeParamData | null {
        return this.playerUpgradeParams.find(p => p.paramId === paramId) || null;
    }

    public getEquipmentData(id: string): EquipmentData | null {
        return this.equipment.find(e => e.id === id) || null;
    }

    public getWeaponData(id: string): WeaponData | null {
        return this.weapons.find(w => w.id === id) || null;
    }

    /**
     * IDから敵データを取得
     * @param id
     */
    public getEnemyData(id: string): EnemyData | null {
        return this.enemies.find(e => e.id === id) || null;
    }

    /**
     * ランダムな敵データを取得 (簡易版)
     */
    public getRandomEnemy(): EnemyData | null {
        // Filter out entries that don't have a Prefab assigned
        const validEnemies = this.enemies.filter(e => e.prefab !== null);

        if (validEnemies.length === 0) {
            console.warn(`[GameDatabase] No enemies with valid Prefabs found! Total enemies in list: ${this.enemies.length}`);
            if (this.enemies.length > 0) {
                console.warn(`[GameDatabase] First enemy sample: ID=${this.enemies[0].id}, Prefab=${this.enemies[0].prefab ? "OK" : "NULL"}`);
            }
            return null;
        }

        const idx = Math.floor(Math.random() * validEnemies.length);
        return validEnemies[idx];
    }

    /**
     * サウンド設定を取得（パスまたはIDで検索）
     */
    public getSoundData(query: string): SoundData | null {
        if (!this.sounds) {
            console.warn("[GameDatabase] sounds list is null. Initializing to empty.");
            this.sounds = [];
            return null;
        }
        const result = this.sounds.find(d => d.id === query || d.path === query) || null;
        if (!result) {
            // Log warning only if query looks like an ID (no slashes)
            if (query && !query.includes("/")) {
                console.warn(`[GameDatabase] Sound data NOT found for query: '${query}'. IDs available: ${this.sounds.map(s => s.id).join(", ")}`);
            }
        }
        return result;
    }
}
