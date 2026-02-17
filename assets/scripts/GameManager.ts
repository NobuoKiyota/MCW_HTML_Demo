import { _decorator, Component, Node, Prefab, instantiate, Vec3, Label, director, math, Rect, Color } from 'cc';
import { GAME_SETTINGS, GameState } from './Constants';
import { DataManager } from './DataManager';
// import { PlayerController } from './PlayerController'; // Circular dependency
// import { Enemy } from './Enemy'; // Circular dependency
// import { Bullet } from './Bullet'; // Circular dependency
import { UIManager } from './UIManager';
import { GameSpeedManager } from './GameSpeedManager';
import { GameDatabase } from './GameDatabase';
import { EnemyData } from './GameDataTypes';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

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
    // @property(Label)
    // public distLabel: Label = null; // Moved to UIManager
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
        bullets: [],
        items: []
    };

    private spawnTimer: number = 0;
    private frameCount: number = 0;




    // Global Physics
    @property({ type: GameSpeedManager, tooltip: "Reference to Game Speed Manager" })
    public speedManager: GameSpeedManager = null;

    @property({ type: GameDatabase, tooltip: "Game Database (ScriptableObject-like)" })
    public gameDatabase: GameDatabase = null;

    onLoad() {
        GameManager.instance = this;

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

        // Listen to UI events
        director.on("GAME_RETRY", this.retryGame, this);
        director.on("GAME_TITLE", this.returnToTitle, this);
    }

    onDestroy() {
        director.off("GAME_RETRY", this.retryGame, this);
        director.off("GAME_TITLE", this.returnToTitle, this);
    }

    start() {
        this.initGame();
        // Initial visibility
        if (this.debugLabel) {
            this.debugLabel.node.active = this.isDebug;
        }

        // Inject GM to Player
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);
            }
        }
    }

    public initGame() {
        if (this.missionDistance > 0) {
            this.currentMission.distance = this.missionDistance;
        }
        this.playState.distance = this.currentMission.distance;
        this.state = GameState.INGAME;

        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
        }
    }

    update(deltaTime: number) {
        if (this.state !== GameState.INGAME) return;

        this.frameCount++;

        // Timer Logic
        this.spawnTimer += deltaTime;
        const interval = (GAME_SETTINGS.ENEMY.SPAWN_INTERVAL / 60); // Convert frames to seconds approx

        if (this.spawnTimer >= interval) {
            this.spawnTimer = 0;
            this.spawnEnemy();
        }

        // Distance Logic
        const speed = 6.0; // Retrieve from Player?
        // Ideally PlayerController exposes currentSpeed
        const pCtrl = this.playerNode.getComponent("PlayerController") as any;
        const currentSpeed = pCtrl ? pCtrl.speed : 0; // Need to expose speed in PlayerController

        // Update Speed Manager
        this.speedManager.setBaseSpeed(currentSpeed);

        // Get Final Speed
        const finalSpeed = this.speedManager.getCurrentSpeed();

        // Update Global Scroll Speed (used by Enemies/Bullets)
        // this.currentScrollSpeed = currentSpeed; // 1:1 mapping for now. Can scale if needed.

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

                const px = this.playerNode.position.x.toFixed(1);
                const py = this.playerNode.position.y.toFixed(1);

                let enemyInfo = "No Enemies";
                if (this.enemyLayer.children.length > 0) {
                    const e = this.enemyLayer.children[0];
                    enemyInfo = `E0: (${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)})`;
                }

                this.debugLabel.string = `Player: (${px}, ${py})\nSpeed: ${currentSpeed.toFixed(2)} (Final: ${this.speedManager.getCurrentSpeed().toFixed(2)})\nEnemies: ${this.enemyLayer.children.length}\n${enemyInfo}`;
            } else {
                if (this.debugLabel.node.active) this.debugLabel.node.active = false;
            }
        }
    }

    spawnEnemy() {
        // Method 1: Use GameDatabase (New System)
        if (this.gameDatabase && this.gameDatabase.enemies.length > 0) {
            const enemyData = this.gameDatabase.getRandomEnemy();
            if (enemyData && enemyData.prefab) {
                const node = instantiate(enemyData.prefab);
                node.parent = this.enemyLayer || this.node;

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
    }

    public retryGame() {
        console.log("[GameManager] Retrying Game...");
        // Reload current scene
        let sceneName = director.getScene().name;
        if (!sceneName || sceneName === "") {
            sceneName = "scene"; // Fallback to default scene name
        }
        console.log(`[GameManager] Loading Scene: ${sceneName}`);
        director.loadScene(sceneName);
    }

    public returnToTitle() {
        console.log("[GameManager] Returning to Title...");
        // For now, reload Main, later load Title scene
        // director.loadScene("Title"); 
        director.loadScene(director.getScene().name);
    }

    // Bullet Factory
    public spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean) {
        if (!this.bulletPrefab) return;
        const node = instantiate(this.bulletPrefab);
        node.parent = this.bulletLayer;

        // Init Bullet Component
        const bulletComp = node.getComponent("Bullet") as any;
        if (bulletComp) {
            bulletComp.init(x, y, angle, speed, damage, isEnemy, this);
        } else {
            console.warn("[GameManager] Bullet component missing on prefab!");
            // Fallback if component missing or named differently
            node.setPosition(x, y, 0);
        }
    }

    // Item Factory
    public onItemCollected(id: string, amount: number) {
        // 1. Instant Effects (HP, Buffer)
        if (id === "ItemRepair") {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl) pCtrl.heal(20);
            return;
        }

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
