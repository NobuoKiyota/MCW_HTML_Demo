import { _decorator, Component, Node, Label, Prefab, instantiate, director, Vec3, Color, game, resources, UITransform, Sprite, BoxCollider2D } from 'cc';
import { UIManager } from './UIManager';
import { GameState, GAME_SETTINGS, IGameManager } from './Constants'; // Removed Constants
import { SoundManager } from './SoundManager';
import { GameSpeedManager } from './GameSpeedManager';
import { GameDatabase } from './GameDatabase';
import { ResultUI } from './ResultUI'; // Import Added Here
import { DataManager } from './DataManager';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component implements IGameManager {

    public static instance: GameManager = null;

    @property(Label)
    public debugLabel: Label = null;

    @property(Prefab)
    public titlePrefab: Prefab = null;

    @property(Prefab)
    public homePrefab: Prefab = null;

    @property(Prefab)
    public ingamePrefab: Prefab = null;

    @property(Prefab)
    public bulletPrefab: Prefab = null;

    @property(Prefab)
    public itemPrefab: Prefab = null;

    @property(GameDatabase)
    public gameDatabase: GameDatabase = null;

    public state: GameState = GameState.TITLE;
    public score: number = 0;
    public isPaused: boolean = false;
    public isDebug: boolean = false;

    // References to current scene objects
    public playerNode: Node = null;
    public bulletLayer: Node = null;
    public enemyLayer: Node = null;
    public itemLayer: Node = null; // Add ItemLayer ref

    // Managers
    public speedManager: GameSpeedManager = new GameSpeedManager();

    // Spawn Logic
    private spawnTimer: number = 0;
    private frameCount: number = 0; // For performance check or periodic log

    // InGame State (Distance, etc)
    public playState: any = {
        distance: 3000,
        enemies: [],
        items: [],
        killedEnemies: 0,
        collectedItemsCount: 0
    };

    public currentMission: any = null;
    public missionDistance: number = 3000;

    // Current Active Content Node (Title or Ingame)
    private currentContentNode: Node = null;

    onLoad() {
        console.log("[GameManager] onLoad triggered.");
        if (!GameManager.instance || !GameManager.instance.isValid) {
            GameManager.instance = this;
            console.log("[GameManager] Singleton initialized.");
        } else if (GameManager.instance !== this) {
            // Check for dummy hijacking
            if (GameManager.instance.node.name.includes("Dummy")) {
                console.log("[GameManager] Hijacking singleton from Dummy node.");
                const oldNode = GameManager.instance.node;
                GameManager.instance = this;
                oldNode.destroy();
            } else {
                console.warn("[GameManager] Duplicate valid instance found, destroying this component.");
                this.destroy(); // Destroy component only, not node
                return;
            }
        }

        // Force this node to (0,0,0) to avoid world-space offsets
        this.node.setPosition(0, 0, 0);

        console.log("[GameManager] onLoad completed. Ready for start.");
        this.speedManager.reset();

        // Fallback for Item Prefab if not assigned in Inspector
        if (!this.itemPrefab) {
            console.log("[GameManager] itemPrefab not assigned. Attempting to load from resources/Prefabs/Item...");
            resources.load("Prefabs/Item", Prefab, (err, prefab) => {
                if (!err && prefab) {
                    this.itemPrefab = prefab;
                    console.log("[GameManager] itemPrefab loaded successfully from resources.");
                } else {
                    console.warn("[GameManager] Failed to load itemPrefab from resources. Please ensure it exists in assets/resources/Prefabs/Item.");
                }
            });
        }

        // Scene Transition Listeners
        director.on("GAME_RETRY", this.retryGame, this);
        director.on("GAME_TITLE", this.goToTitle, this);
    }

    onDestroy() {
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    }

    start() {
        // Show Title on start
        console.log("[GameManager] start. Showing Title.");
        this.switchContent(this.titlePrefab);

        // BGM handled in goToTitle essentially
        if (SoundManager.instance) {
            SoundManager.instance.playBGM("bgm_outgame01", 1.0);
        }
    }

    /**
     * Switch content (Prefab) under Canvas
     * Returns the instantiated node
     */
    public switchContent(prefab: Prefab) {
        if (!prefab) {
            console.error("[GameManager] switchContent failed: Prefab is null.");
            return null;
        }

        console.log(`[GameManager] switchContent: switching to ${prefab.name}`);

        // 1. Find Canvas
        // Since this node is PersistRoot, it is NOT under Canvas usually.
        // We need to find the Canvas in the scene.
        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");
        if (!canvas) {
            console.error("[GameManager] Canvas not found in scene!");
            return null;
        }

        // Reset to (640, 360)
        canvas.setPosition(640, 360, 0);

        // 2. Clear previous content
        // We assume we tag the content node or keep track of it
        if (this.currentContentNode && this.currentContentNode.isValid) {
            this.currentContentNode.destroy();
            this.currentContentNode = null;
        }

        // Also cleanup old references
        this.playerNode = null;
        this.bulletLayer = null;
        this.enemyLayer = null;
        this.itemLayer = null;

        // 3. Instantiate new
        const node = instantiate(prefab);
        canvas.addChild(node);
        // Force to (0, 0) in Canvas local
        node.setPosition(0, 0, 0);
        node.setSiblingIndex(0); // Put at bottom (behind UI)
        this.currentContentNode = node;

        console.log(`[GameManager] Switched content to ${prefab.data.name}`);

        // SideBarUI Visibility: Active except on Title
        if (UIManager.instance && UIManager.instance.sideBarUI) {
            const shouldBeActive = this.state !== GameState.TITLE;
            UIManager.instance.sideBarUI.node.active = shouldBeActive;

            if (shouldBeActive) {
                UIManager.instance.sideBarUI.updateShipInfo();
            }
        }

        return node;
    }

    public startInGame(mission: any = null) {
        console.log("[GameManager] Starting InGame via Prefab...");

        if (mission) {
            this.currentMission = mission;
        }

        this.state = GameState.INGAME;

        const node = this.switchContent(this.ingamePrefab);
        if (!node) {
            console.error("[GameManager] Failed to instantiate InGame Prefab!");
            return;
        }

        // Force resolve references from the new instance
        this.resolveInGameReferences(node);

        // Safety check for distance objects
        if (!this.currentMission) this.currentMission = { distance: 3000, stars: 1, reward: 0 };
        if (!this.playState) this.playState = { distance: 3000, enemies: [], items: [], killedEnemies: 0, collectedItemsCount: 0 };

        if (this.currentMission.distance > 0) {
            this.missionDistance = this.currentMission.distance;
        }

        this.playState.distance = this.currentMission.distance;
        this.playState.killedEnemies = 0;
        this.playState.collectedItemsCount = 0;
        this.playState.items = []; // Reset items

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
        console.log("[GameManager] Switch to Title via Prefab");
        this.state = GameState.TITLE;
        this.switchContent(this.titlePrefab);

        if (SoundManager.instance) {
            // Title BGM same as Outgame? Or different?
            // Usually same for now.
            SoundManager.instance.playBGM("bgm_outgame01", 1.0);
        }
    }

    public goToHome() {
        console.log("[GameManager] Switch to Home via Prefab");
        this.state = GameState.HOME;
        this.switchContent(this.homePrefab);

        if (SoundManager.instance) {
            SoundManager.instance.playBGM("bgm_outgame01", 1.0);
        }
    }

    /**
     * 新しく生成されたインゲームノードツリーから参照を取得
     */
    private resolveInGameReferences(rootNode: Node) {
        if (!rootNode) return;

        // Recursive search helper
        const findNode = (node: Node, name: string): Node => {
            if (node.name === name) return node;
            for (let i = 0; i < node.children.length; ++i) {
                const res = findNode(node.children[i], name);
                if (res) return res;
            }
            return null;
        };

        this.playerNode = findNode(rootNode, "Player");
        this.bulletLayer = findNode(rootNode, "BulletLayer");
        this.enemyLayer = findNode(rootNode, "EnemyLayer");
        this.itemLayer = findNode(rootNode, "ItemLayer");

        if (!this.playerNode) console.error("[GameManager] Player Node NOT FOUND in Prefab!");
        if (!this.enemyLayer) console.error("[GameManager] EnemyLayer Node NOT FOUND in Prefab!");

        // Force zero positions to ensure coordinate sync between layers
        // This fixes the issue where layers in the prefab had (640, 360) offsets
        if (this.bulletLayer) this.bulletLayer.setPosition(0, 0, 0);
        if (this.enemyLayer) this.enemyLayer.setPosition(0, 0, 0);
        if (this.itemLayer) this.itemLayer.setPosition(0, 0, 0);

        // Notify UIManager to resolve its references (GameOverPanel etc) from the new prefab
        if (UIManager.instance) {
            UIManager.instance.resolveReferences();
        }

        // Background and StarField might also need reset if they were offset
        const bgLayer = findNode(rootNode, "BackgroundLayer");
        if (bgLayer) bgLayer.setPosition(0, 0, 0);
        const starField = findNode(rootNode, "StarField");
        if (starField) starField.setPosition(0, 0, 0);

        console.log(`[GameManager] References resolved: Player=${this.playerNode?.name}, EnemyLayer=${this.enemyLayer?.name}`);

        // Ensure PlayerController setup
        if (this.playerNode) {
            // Player should also be at (0, 0) or offset by code, but we want its parent to be (0,0)
            // Wait, Player is sibling to layers. If layers are (0,0), Player should be near (0,0) or (0, -200)
            // Let's not force Player position here as Bullet spawn uses this.node.position relative to BulletLayer

            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);
            } else {
                console.error("[GameManager] PlayerController component NOT FOUND on Player Node!");
            }
        }
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
        // Fallback to singleton if inspector reference is null (common after hijacking)
        const db = this.gameDatabase || GameDatabase.instance;

        if (!db || !db.isReady) {
            if (this.frameCount % 60 === 0) { // Log occasionally
                console.warn("[GameManager] spawnEnemy skipped: GameDatabase is NOT READY or null.");
            }
            return;
        }

        if (!this.enemyLayer) {
            console.error("[GameManager] spawnEnemy failed: enemyLayer is null.");
            return;
        }

        // Method 1: Use GameDatabase (New System)
        if (db.enemies.length > 0) {
            const enemyData = db.getRandomEnemy();
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
                console.log(`[GameManager] Spawned enemy: ${enemyData.id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
                return;
            } else {
                // Debug: Why failed?
                if (!enemyData) console.warn("[GameManager] GameDatabase returned null EnemyData.");
                else if (!enemyData.prefab) console.warn(`[GameManager] EnemyData '${enemyData.id}' has no Prefab!`);
            }
        } else {
            if (this.frameCount % 60 === 0) {
                console.warn("[GameManager] No enemies found in GameDatabase runtime list!");
            }
        }
    }

    public onMissionComplete() {
        if (this.state === GameState.RESULT) return;

        this.state = GameState.RESULT;
        console.log("Mission Complete!");

        // Add Mission Reward
        if (this.currentMission && this.currentMission.reward > 0) {
            console.log(`[GameManager] Granting Mission Reward: ${this.currentMission.reward}`);
            DataManager.instance.addResource("credits", this.currentMission.reward);
        }

        // Save Data
        DataManager.instance.save();

        if (UIManager.instance) {
            // UIManager.instance.showResult(); // Deprecated
        }

        // Apply ResultUI dynamically
        console.log("[GameManager] Showing ResultUI...");
        const node = new Node("ResultUI");

        // Canvasを探して親にする
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot.getChildByName("Canvas");
        if (canvasNode) {
            canvasNode.addChild(node);
        } else {
            this.node.addChild(node);
        }

        const resUI = node.addComponent(ResultUI);

        // Get stats from playState
        const enemies = this.playState.killedEnemies || 0;
        const items = this.playState.collectedItemsCount || 0;
        const score = 0; // Score logic if implemented

        resUI.setup(enemies, items, score);

        // Stop BGM with fade out
        SoundManager.instance.stopBGM(2.0);
    }

    // Bullet Factory
    public spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean): any {
        if (!this.bulletPrefab) {
            console.error("[GameManager] bulletPrefab is NULL! Cannot spawn bullet.");
            return null;
        }

        // Check if bulletLayer is assigned, if not, fallback to self or scene root
        let parent = this.bulletLayer;
        if (!parent) {
            console.warn("[GameManager] bulletLayer is NULL! Using GameManager node as parent.");
            parent = this.node;
        }

        const node = instantiate(this.bulletPrefab);
        node.parent = parent;
        node.setPosition(x, y, 0);

        // Init Bullet Component
        const bulletComp = node.getComponent("Bullet") as any;
        if (bulletComp) {
            bulletComp.init(x, y, angle, speed, damage, isEnemy, this);
            return bulletComp;
        } else {
            console.error("[GameManager] 'Bullet' component missing on instantiated prefab!");
            return null;
        }
    }

    // Item Factory
    public onItemCollected(id: string, amount: number, pos?: Vec3) {
        console.log(`[GameManager] onItemCollected called: ${id} x${amount} at ${pos}`);

        // Count it
        if (!this.playState.collectedItemsCount) this.playState.collectedItemsCount = 0;
        this.playState.collectedItemsCount++;

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
                UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
            }
            SoundManager.instance.playSE("powerup01", "System");
            if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Power", def ? def.duration : 10, def ? def.value : 0.5);
            return;
        }

        if (id === "ItemRapidFire") {
            if (UIManager.instance) {
                UIManager.instance.showBuffNotification("RAPID FIRE!", new Color(0, 150, 255), pos);
                UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
            }
            SoundManager.instance.playSE("powerup01", "System");
            if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Rapid", def ? def.duration : 10, def ? def.value : 0.5);
            return;
        }

        // 2. Resource Items (Credits, Exp)
        if (id === "Credit") {
            // Save to persistent data via DataManager
            DataManager.instance.addResource("credits", amount);
            SoundManager.instance.playSE("coin01", "System");
            if (UIManager.instance) UIManager.instance.showItemLog(`Credits +${amount}`, 1, pos);
        } else if (id === "Exp") {
            DataManager.instance.addResource("exp", amount);
            SoundManager.instance.playSE("coin01", "System");
            if (UIManager.instance) UIManager.instance.showItemLog(`EXP +${amount}`, 1, pos);
        } else {
            // General Item
            if (UIManager.instance) UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
            SoundManager.instance.playSE("itemget01", "System");
        }
    }

    public spawnItem(x: number, y: number, id: string, amount: number) {
        if (!this.itemLayer) {
            console.warn(`[GameManager] spawnItem aborted: itemLayer is missing!`);
            return;
        }

        let node: Node = null;
        if (this.itemPrefab) {
            node = instantiate(this.itemPrefab);
        } else {
            console.log(`[GameManager] itemPrefab is null. Creating item programmatically for ${id}...`);
            node = new Node("Item_" + id);

            // Add Visual (Sprite)
            const transform = node.addComponent(UITransform);
            transform.setContentSize(40, 40);

            const sprite = node.addComponent(Sprite);
            // Color will be set in Item.init() based on type

            // Add Physics (Collider)
            const collider = node.addComponent(BoxCollider2D);
            collider.size.width = 40;
            collider.size.height = 40;
            collider.sensor = true; // Non-blocking

            // Add Script
            node.addComponent("Item");
        }

        node.parent = this.itemLayer;
        node.setPosition(x, y, 0);

        const itemComp = node.getComponent("Item") || node.addComponent("Item") as any;
        if (itemComp) {
            itemComp.init(id, amount, this);
            console.log(`[GameManager] Registered Item: ${id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        } else {
            console.warn(`[GameManager] Item component could not be added/found for ${id}`);
        }
    }

    public spawnItemFromPrefab(prefab: Prefab, x: number, y: number) {
        if (!prefab || !this.itemLayer) return;

        const node = instantiate(prefab);
        node.parent = this.itemLayer;
        node.setPosition(x, y, 0);

        // Init Item
        const itemComp = node.getComponent("Item") as any;
        // ...
    }

    public spawnDamageText(x: number, y: number, amount: number, isKill: boolean) {
        if (UIManager.instance) {
            UIManager.instance.spawnDamageText(x, y, amount, isKill);
        }
    }

    public spawnExplosion(x: number, y: number, isKill: boolean = false) {
        // Increment kill count if applicable
        if (isKill) {
            if (!this.playState.killedEnemies) this.playState.killedEnemies = 0;
            this.playState.killedEnemies++;
        }

        // Dynamic Load Explosion effect
        resources.load("Prefabs/Particle/ExplosionA", Prefab, (err, prefab) => {
            if (err) {
                console.warn("[GameManager] Failed to load ExplosionA:", err);
                return;
            }
            if (!this.node || !this.node.isValid) return;

            const node = instantiate(prefab);
            // Spawn in content layer or bullet layer? Let's use bulletLayer as a "VFX" layer fallback
            node.parent = this.enemyLayer || this.node.parent;

            // USE World Position to avoid (640, 360) offset issues from Canvas/Layers
            node.setWorldPosition(new Vec3(x, y, 0));

            // Auto-destruct after 1.5s (Typical for Cocos particle FX if not set to auto-remove)
            this.scheduleOnce(() => {
                if (node.isValid) node.destroy();
            }, 2.0);
        });
    }

    public onGameOver() {
        if (this.state === GameState.FAILURE) return;
        this.state = GameState.FAILURE;
        console.log("Game Over!");

        // Save progress (collected items etc)
        DataManager.instance.save();

        if (UIManager.instance) {
            UIManager.instance.showGameOver();
        }

        SoundManager.instance.stopBGM(1.0);
    }
}
