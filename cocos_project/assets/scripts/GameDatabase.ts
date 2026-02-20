import { _decorator, Component, CCInteger, CCFloat, TextAsset, Prefab, resources, director } from 'cc';
import { EnemyData, EnemyBulletData, BehaviorData, DropData, SoundData } from './GameDataTypes';
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

    // Runtime Storage (Generated from CSV)
    public enemies: EnemyData[] = [];

    // ... (rest of props)

    // --- Raw Data Storage ---
    public enemyBullets: EnemyBulletData[] = [];
    public behaviors: BehaviorData[] = [];
    public drops: DropData[] = [];
    public sounds: SoundData[] = [];

    // --- CSV Assets ---
    @property({ type: TextAsset, tooltip: "CSV: Enemies" })
    public enemyCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: EnemyBullets" })
    public bulletCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Behaviors" })
    public behaviorCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Drops" })
    public dropCsv: TextAsset = null;

    @property({ type: TextAsset, tooltip: "CSV: Sounds" })
    public soundCsv: TextAsset = null;

    // Singleton access helper (Component based)
    public static instance: GameDatabase = null;
    public isReady: boolean = false;

    onLoad() {
        if (GameDatabase.instance && GameDatabase.instance.isValid && GameDatabase.instance !== this) {
            console.log("[GameDatabase] Duplicate valid instance found, destroying this one.");
            this.node.destroy();
            return;
        }
        GameDatabase.instance = this;
        director.addPersistRootNode(this.node);

        // Fail-safe initialization
        if (!this.enemies) this.enemies = [];
        if (!this.enemyBullets) this.enemyBullets = [];
        if (!this.behaviors) this.behaviors = [];
        if (!this.drops) this.drops = [];
        if (!this.sounds) this.sounds = [];
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
    }

    private loadAllCSV() {
        // Clear old data to prevent duplicates if called multiple times (though start only runs once)
        this.enemyBullets = [];
        this.behaviors = [];
        this.drops = [];
        this.sounds = []; // Clear old sounds
        this.enemies = []; // Clear runtime list

        if (this.bulletCsv) this.parseBulletCSV(this.bulletCsv.text);
        if (this.behaviorCsv) this.parseBehaviorCSV(this.behaviorCsv.text);
        if (this.dropCsv) this.parseDropCSV(this.dropCsv.text);
        if (this.soundCsv) this.parseSoundCSV(this.soundCsv.text);
        if (this.enemyCsv) this.parseEnemyCSV(this.enemyCsv.text); // Consumes above data

        console.log(`[GameDatabase] Loaded: ${this.enemies.length} Enemies, ${this.enemyBullets.length} Bullets, ${this.behaviors.length} Behaviors, ${this.drops.length} Drops`);

        this.isReady = true;

        // Notify Manager that Database is ready (Optional, if needed for tight coupling)
        // GameManager.instance.onDatabaseReady();
    }

    private parseBulletCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.enemyBullets = data.map(row => {
            const d = new EnemyBulletData();
            d.id = row.ID;
            d.type = row.Type || 0;
            d.speed = row.Speed || 5;
            d.damage = row.Damage || 10;
            d.interval = row.Interval || 1.0;
            d.prefabName = row.PrefabName || "";
            return d;
        });
    }

    private parseBehaviorCSV(text: string) {
        const data = CSVHelper.parse(text);
        this.behaviors = data.map(row => {
            const d = new BehaviorData();
            d.id = row.ID;
            d.logicId = row.LogicID || "MPID001";
            d.baseSpeed = row.BaseSpeed || 2.0;
            d.baseTurn = row.BaseTurn || 2.0;
            return d;
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

            entry.ebId = row.EbID;
            entry.bulletSpeedMult = row.BulletSpeedMult || 1.0;
            entry.bulletDmgMult = row.BulletDmgMult || 1.0;

            entry.dropId = row.DropID;

            // Link Data (Cache)
            entry._behavior = this.getBehaviorData(entry.behaviorId);
            entry._bullet = this.getBulletData(entry.ebId);
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

    public getBulletData(id: string): EnemyBulletData | null {
        return this.enemyBullets.find(d => d.id === id) || null;
    }

    public getBehaviorData(id: string): BehaviorData | null {
        return this.behaviors.find(d => d.id === id) || null;
    }

    public getDropDataList(id: string): DropData[] {
        return this.drops.filter(d => d.id === id); // Returns array (multiple items for same ID)
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
            console.warn("[GameDatabase] No enemies with valid Prefabs found!");
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
