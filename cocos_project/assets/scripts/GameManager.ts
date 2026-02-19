import { _decorator, Component, Node, Prefab, instantiate, Vec3, Label, director, math, Rect, Color, ParticleSystem2D, UIOpacity, Vec2 } from 'cc';
import { GAME_SETTINGS, GameState, IGameManager } from './Constants';
import { DataManager } from './DataManager';
// import { PlayerController } from './PlayerController'; // Circular dependency
// import { Enemy } from './Enemy'; // Circular dependency
// import { Bullet } from './Bullet'; // Circular dependency
import { UIManager } from './UIManager';
import { GameSpeedManager } from './GameSpeedManager';
import { GameDatabase } from './GameDatabase';
import { EnemyData } from './GameDataTypes';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component implements IGameManager {

    public static instance: GameManager;

    @property(Node)
    public playerNode: Node = null;

    @property(Node)
    public bulletLayer: Node = null;

    @property(Node)
    public enemyLayer: Node = null;

    @property(Node)
    public itemLayer: Node = null;

    @property(Prefab)
    public enemyPrefab: Prefab = null;

    @property(Prefab)
    public bulletPrefab: Prefab = null;

    @property(Prefab)
    public itemPrefab: Prefab = null;

    // UI Refs
    @property(Label)
    public debugLabel: Label = null; // New Debug Label

    @property({ tooltip: "Debug Mode" })
    public isDebug: boolean = true;

    @property({ tooltip: "Initial Mission Distance" })
    public missionDistance: number = 3000;

    @property({ tooltip: "Scroll Speed Scale (Relative to Player Speed)" })
    public scrollSpeedScale: number = 1.0;

    // State
    public state: GameState = GameState.TITLE;
    public currentMission: any = { distance: 3000, stars: 1 }; // Placeholder
    public playState: any = {
        distance: 3000,
        enemies: [], // References to EnemyComponents
        items: []
    };

    public isPaused: boolean = false;

    private spawnTimer: number = 0;
    private frameCount: number = 0;

    // Global Physics
    @property({ type: GameSpeedManager, tooltip: "Reference to Game Speed Manager" })
    public speedManager: GameSpeedManager = null;

    @property({ type: GameDatabase, tooltip: "Game Database (ScriptableObject-like)" })
    public gameDatabase: GameDatabase = null;

    // --- Prefab Architecture ---
    @property({ type: Node, tooltip: "Root node to place game/home content" })
    public contentRoot: Node = null;

    @property({ type: Prefab, tooltip: "Prefab for Home Screen" })
    public homePrefab: Prefab = null;

    @property({ type: Prefab, tooltip: "Prefab for InGame World" })
    public ingamePrefab: Prefab = null;

    private currentContentNode: Node = null;

    onLoad() {
        if (GameManager.instance && GameManager.instance !== this) {
            this.node.destroy();
            return;
        }
        GameManager.instance = this;
        // director.addPersistRootNode(this.node); // No longer needed if in Main Scene

        // Auto-resolve SpeedManager
        if (!this.speedManager) {
            this.speedManager = this.getComponent(GameSpeedManager);
        }
        if (!this.speedManager) {
            console.warn("[GameManager] GameSpeedManager not assigned. Adding default.");
            this.speedManager = this.addComponent(GameSpeedManager);
        }

        // Auto-resolve GameDatabase
        if (!this.gameDatabase) {
            this.gameDatabase = this.getComponent(GameDatabase);
        }

        // Ensure state objects exist
        if (!this.currentMission) this.currentMission = { distance: 3000, stars: 1 };
        if (!this.playState) this.playState = { distance: 3000, enemies: [], items: [] };

        // Listen to UI events
        director.on("GAME_RETRY", this.retryGame, this);
        director.on("GAME_TITLE", this.goToTitle, this);
    }

    onDestroy() {
        director.off("GAME_RETRY", this.retryGame, this);
        director.off("GAME_TITLE", this.goToTitle, this);
    }

    start() {
        // Initial visibility
        if (this.debugLabel) {
            this.debugLabel.node.active = this.isDebug;
        }

        // Start with Home if nothing loaded? Or check state?
        // For now, let's assume we start at Home if in Main Scene
        if (this.state === GameState.TITLE) {
            // Already handled by Title Scene? 
            // If we are in Main Scene directly (dev), maybe load Home.
        }
    }

    // --- Content Switching Logic ---

    private switchContent(prefab: Prefab) {
        if (!this.contentRoot) {
            console.error("[GameManager] ContentRoot not assigned!");
            return null;
        }

        // Clear existing
        if (this.currentContentNode && this.currentContentNode.isValid) {
            this.currentContentNode.destroy();
        }
        this.currentContentNode = null;

        // Instantiate new
        if (prefab) {
            this.currentContentNode = instantiate(prefab);
            this.contentRoot.addChild(this.currentContentNode);
            return this.currentContentNode;
        }
        return null;
    }

    public goToHome() {
        console.log("[GameManager] Switch to Home via Prefab");
        this.state = GameState.MENU;
        this.switchContent(this.homePrefab);
        SoundManager.instance.playBGM("bgm_outgame01", 1.0);

        // If UIManager is present, ensure sideBar logic if needed
        if (UIManager.instance) {
            // Force resolve if UIManager is persistent
            UIManager.instance.resolveReferences();
        }
    }

    public startInGame() {
        console.log("[GameManager] Starting InGame via Prefab...");

        const node = this.switchContent(this.ingamePrefab);
        if (!node) {
            console.error("[GameManager] Failed to instantiate InGame Prefab!");
            return;
        }

        // Force resolve references from the new instance
        this.resolveInGameReferences(node);

        // Safety check for distance objects
        if (!this.currentMission) this.currentMission = { distance: 3000, stars: 1 };
        if (!this.playState) this.playState = { distance: 3000, enemies: [], items: [] };

        if (this.missionDistance > 0) {
            this.currentMission.distance = this.missionDistance;
        }
        this.playState.distance = this.currentMission.distance;
        this.playState.items = []; // Reset items
        this.state = GameState.INGAME;

        // Inject GM to Player
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);
            }
        }

        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
        }

        // Start BGM
        SoundManager.instance.playBGM("bgm_ingame01", 1.0);
    }

    public retryGame() {
        console.log("[GameManager] Retrying Game...");
        // Just call startInGame, which re-instantiates the prefab
        this.startInGame();
    }

    public goToTitle() {
        console.log("[GameManager] Going to Title Scene...");
        director.loadScene("scene-Title"); // Title is still a separate scene
    }

    /**
     * 新しく生成されたインゲームノードツリーから参照を取得
     */
    private resolveInGameReferences(rootNode: Node) {
        if (!rootNode) return;

        // Prefab root might be "IngameRoot" or similar.
        // We look for children inside it.

        this.playerNode = rootNode.getChildByName("Player") || rootNode.getChildByPath("GameLayer/Player");
        this.bulletLayer = rootNode.getChildByName("BulletLayer") || rootNode.getChildByPath("GameLayer/BulletLayer");
        this.enemyLayer = rootNode.getChildByName("EnemyLayer") || rootNode.getChildByPath("GameLayer/EnemyLayer");
        this.itemLayer = rootNode.getChildByName("ItemLayer") || rootNode.getChildByPath("GameLayer/ItemLayer");

        console.log(`[GameManager] References resolved from Prefab: Player=${!!this.playerNode}, EnemyLayer=${!!this.enemyLayer}`);
    }

    public setPaused(paused: boolean) {
        this.isPaused = paused;
        if (this.speedManager) {
            this.speedManager.setPaused(paused);
        }

        // 一時停止時に全てのSEを止める（必要に応じて）
        if (paused && SoundManager.instance) {
            SoundManager.instance.stopAllSE();
        }
    }

    update(deltaTime: number) {
        if (this.state !== GameState.INGAME || this.isPaused) return;

        this.frameCount++;

        // Timer Logic
        this.spawnTimer += deltaTime;
        const interval = (GAME_SETTINGS.ENEMY.SPAWN_INTERVAL / 60); // Convert frames to seconds approx

        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0;
            this.spawnEnemy();
        }

        // Distance Logic
        const pCtrl = this.playerNode ? this.playerNode.getComponent("PlayerController") as any : null;
        const currentSpeed = pCtrl ? pCtrl.speed : 0;

        // Update Speed Manager
        this.speedManager.setBaseSpeed(currentSpeed);

        // Get Final Speed
        const finalSpeed = this.speedManager.getCurrentSpeed();

        // Conversion logic (similar to engine.js)
        const physics = GAME_SETTINGS.PHYSICS as any;
        const distDivisor = physics.MISSION_DIVISOR || 2000;
        const distDec = (finalSpeed * physics.MISSION_SCALE) / distDivisor;
        this.playState.distance -= distDec;

        if (this.playState.distance <= 0) {
            this.playState.distance = 0;
            this.onMissionComplete();
        }

        // UI Update (via UIManager)
        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
            UIManager.instance.updateSpeed(currentSpeed);
        }

        // Debug Label Update
        if (this.debugLabel) {
            if (this.isDebug) {
                if (!this.debugLabel.node.active) this.debugLabel.node.active = true;

                let px = "0.0";
                let py = "0.0";
                if (this.playerNode) {
                    px = this.playerNode.position.x.toFixed(1);
                    py = this.playerNode.position.y.toFixed(1);
                }

                let enemyInfo = "No Enemies";
                if (this.enemyLayer && this.enemyLayer.children.length > 0) {
                    const e = this.enemyLayer.children[0];
                    enemyInfo = `E0: (${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)})`;
                }

                this.debugLabel.string = `Player: (${px}, ${py})\nSpeed: ${currentSpeed.toFixed(2)} (Final: ${this.speedManager.getCurrentSpeed().toFixed(2)})\nEnemies: ${this.enemyLayer ? this.enemyLayer.children.length : 0}\n${enemyInfo}`;
            } else {
                if (this.debugLabel.node.active) this.debugLabel.node.active = false;
            }
        }
    }

    spawnEnemy() {
        if (!this.gameDatabase || !this.gameDatabase.isReady) return;
        if (!this.enemyLayer) return;

        // Method 1: Use GameDatabase (New System)
        if (this.gameDatabase && this.gameDatabase.enemies.length > 0) {
            const enemyData = this.gameDatabase.getRandomEnemy();
            if (enemyData && enemyData.prefab) {
                const node = instantiate(enemyData.prefab);
                node.parent = this.enemyLayer; // Prefab base ref

                // Random X, Top Y
                const x = (Math.random() * GAME_SETTINGS.CANVAS_WIDTH) - (GAME_SETTINGS.CANVAS_WIDTH / 2);
                const y = (GAME_SETTINGS.CANVAS_HEIGHT / 2) + 50;
                node.setPosition(x, y, 0);

                const enemyComp = node.getComponent("Enemy") as any;
                if (enemyComp) {
                    enemyComp.init(enemyData, this);
                }
                return;
            } else {
                // Debug: Why failed?
                if (!enemyData) console.warn("[GameManager] GameDatabase returned null EnemyData.");
                else if (!enemyData.prefab) console.warn(`[GameManager] EnemyData '${enemyData.id}' has no Prefab!`);
            }
        } else {
            console.warn("[GameManager] No enemies found in GameDatabase!");
        }
    }

    public onMissionComplete() {
        this.state = GameState.RESULT;
        console.log("Mission Complete!");

        // Save Data?
        DataManager.instance.save();

        if (UIManager.instance) {
            UIManager.instance.showResult();
        }

        // Stop BGM with fade out
        SoundManager.instance.stopBGM(2.0);
    }

    // Bullet Factory
    public spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean): any {
        if (!this.bulletPrefab) return null;
        const node = instantiate(this.bulletPrefab);
        node.parent = this.bulletLayer;

        // Init Bullet Component
        const bulletComp = node.getComponent("Bullet") as any;
        if (bulletComp) {
            bulletComp.init(x, y, angle, speed, damage, isEnemy, this);
            return bulletComp;
        } else {
            console.warn("[GameManager] Bullet component missing on prefab!");
            // Fallback if component missing or named differently
            node.setPosition(x, y, 0);
            return null;
        }
    }

    // Item Factory
    public onItemCollected(id: string, amount: number, pos?: Vec3) {
        // UI Notification
        const def = GAME_SETTINGS.ECONOMY.ITEMS[id];
        const name = def ? def.name : id;
        const rarity = def ? (def.rare || 1) : 1;

        // 1. Instant Effects (HP, Buffer)
        const pCtrl = this.playerNode.getComponent("PlayerController") as any;

        if (id === "ItemRepair") {
            if (UIManager.instance) UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
            SoundManager.instance.playSE("itemget01", "System");
            if (pCtrl && pCtrl.heal) pCtrl.heal(def ? def.value : 20);
            return;
        }

        if (id === "ItemPowerUp") {
            if (UIManager.instance) {
                UIManager.instance.showBuffNotification("POWER UP!", new Color(255, 50, 50), pos);
            }
            SoundManager.instance.playSE("powerup01", "System");
            const val = def ? (def.value || 0.3) : 0.3;
            const dur = def ? (def.duration || 10) : 10;
            if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Power", dur, val);
            return;
        }

        if (id === "ItemRapidFire") {
            if (UIManager.instance) {
                UIManager.instance.showBuffNotification("SPEED UP!", new Color(0, 200, 255), pos);
            }
            SoundManager.instance.playSE("powerup01", "System");
            const val = def ? (def.value || 0.8) : 0.8;
            const dur = def ? (def.duration || 10) : 10;
            if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Rapid", dur, val);
            return;
        }

        // Standard Item Log (for materials, etc.)
        if (UIManager.instance) {
            UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
        }
        SoundManager.instance.playSE("itemget01", "System");

        // 2. Storage for Result
        // Check if exists
        const existing = this.playState.items.find((i: any) => i.id === id);
        if (existing) {
            existing.amount += amount;
        } else {
            this.playState.items.push({ id: id, amount: amount });
        }
    }

    public spawnItem(x: number, y: number, id: string, amount: number) {
        if (!this.itemPrefab) return;
        const node = instantiate(this.itemPrefab);
        node.parent = this.itemLayer;
        node.setPosition(x, y, 0);

        const itemComp = node.getComponent("Item") as any;
        if (itemComp) {
            itemComp.init(id, amount, this);
        }
    }

    public spawnItemFromPrefab(prefab: Prefab, x: number, y: number) {
        if (!prefab) return;
        const node = instantiate(prefab);
        node.parent = this.itemLayer || this.node;
        node.setPosition(x, y, 0);

        // Ensure Item component is initialized if it exists and needs it?
        // Usually Prefab has Item component pre-configured.
        // If it needs GM reference, we might need to get it.
        const itemComp = node.getComponent("Item") as any;
        if (itemComp && itemComp.init) {
            // For Prefab-based items, ID might be internal or not needed in the same way.
            // Or we pass a dummy ID/Amount if strictly required.
            // Let's assume Prefab is self-contained OR we set GM.
            itemComp.gm = this;
        }
    }

    public onGameOver() {
        if (this.state === GameState.FAILURE) return;
        this.state = GameState.FAILURE;
        console.log("Game Over Triggered");

        this.processResult(false);

        if (UIManager.instance) {
            UIManager.instance.showGameOver();
        }

        // Stop BGM with fade out
        SoundManager.instance.stopBGM(2.0);
    }

    // Damage Text
    @property(Prefab)
    public damageLabelPrefab: Prefab = null;

    public spawnDamageText(x: number, y: number, amount: number, isKill: boolean) {
        let node: Node = null;

        if (this.damageLabelPrefab) {
            node = instantiate(this.damageLabelPrefab);
        } else {
            // Fallback: Create Programmatically
            node = new Node("DamageText");
            const label = node.addComponent(Label);
            label.fontSize = 20;
            label.lineHeight = 22;
        }

        node.parent = this.node.parent || this.node; // Attach to global UI or World? Canvas relative better.
        node.setPosition(x, y, 0);

        // Add Logic Component if missing (e.g. fresh node)
        let popup = node.getComponent("DamagePopup") as any;
        if (!popup) {
            popup = node.addComponent("DamagePopup");
        }

        // Color Logic
        // Kill = Red (#AA0000), Hit = White (#FFFFFF)
        const color = isKill ? new Color(170, 0, 0, 255) : new Color(255, 255, 255, 255);

        if (popup && popup.init) {
            popup.init(amount, color);
        }
    }

    @property(Prefab)
    public explosionPrefab: Prefab = null;

    public spawnExplosion(x: number, y: number) {
        // console.log(`[GameManager] spawnExplosion called`);
        // Priority 1: Use Prefab (Editor Configured)
        if (this.explosionPrefab) {
            // console.log("[GameManager] Spawning Explosion Prefab");
            const node = instantiate(this.explosionPrefab);
            node.parent = this.node.parent || this.node;
            node.setWorldPosition(x, y, 0);

            // Ensure it destroys itself or we schedule it
            // If the prefab has AutoRemoveOnFinish (Cocos2d-x style) or custom script, good.
            // If not, we safe-guard destroy it after 1-2 sec.
            this.scheduleOnce(() => {
                if (node.isValid) node.destroy();
            }, 2.0);
            return;
        }

        // console.log("[GameManager] Spawning Fallback Explosion (Programmatic)");
        // Priority 2: Fallback Programmatic Explosion
        const node = new Node("Explosion");
        node.layer = this.node.layer;
        node.parent = this.node.parent || this.node;
        node.setWorldPosition(x, y, 0);

        const ps = node.addComponent(ParticleSystem2D);

        // Configuration
        ps.duration = 0.5;
        ps.life = 0.5;
        ps.lifeVar = 0.2;

        // Emission
        ps.totalParticles = 50;
        ps.emissionRate = 999; // Burst
        ps.angle = 90;
        ps.angleVar = 360;
        ps.speed = 200;
        ps.speedVar = 50;

        // Gravity
        ps.gravity = new Vec2(0, 0);

        // Color: White -> Red -> Transparent
        ps.startColor = new Color(255, 255, 200, 255);
        ps.startColorVar = new Color(0, 0, 0, 0);
        ps.endColor = new Color(255, 50, 0, 0);
        ps.endColorVar = new Color(0, 0, 0, 0);

        // Size
        ps.startSize = 30;
        ps.startSizeVar = 10;
        ps.endSize = 60;
        ps.endSizeVar = 20;

        // Blend: Additive
        (ps as any).srcBlendFactor = 770; // SRC_ALPHA
        (ps as any).dstBlendFactor = 1;   // ONE

        ps.resetSystem();

        this.scheduleOnce(() => {
            if (node.isValid) node.destroy();
        }, 1.0);
    }

    private processResult(isSuccess: boolean) {
        // Save Logic
        const dm = DataManager.instance;
        const data = dm.data;

        // 1. Distance Stats
        const traveled = this.currentMission.distance - this.playState.distance;
        data.careerStats.totalDistance += Math.floor(traveled);
        data.careerStats.started++;

        // 2. Process Items (Money & Materials)
        let sessionMoney = 0;

        for (const item of this.playState.items) {
            // Check Definition
            const def = GAME_SETTINGS.ECONOMY.ITEMS[item.id];
            if (!def) {
                // Default fallback if ID is not in constants
                if (item.id === "ItemMoney" || item.id === "ItemA") { // ItemA is placeholder for now
                    sessionMoney += 100 * item.amount;
                }
                continue;
            }

            if (def.type === "money") {
                sessionMoney += def.value * item.amount;
            } else if (def.type === "material") {
                // Add to persistent inventory
                if (!data.inventory[item.id]) data.inventory[item.id] = 0;
                data.inventory[item.id] += item.amount;
            }
        }

        // Apply Money
        data.money += sessionMoney;
        console.log(`[GameManager] Result Processed. Money Earned: ${sessionMoney}. Total: ${data.money}`);

        dm.save();
    }
}
