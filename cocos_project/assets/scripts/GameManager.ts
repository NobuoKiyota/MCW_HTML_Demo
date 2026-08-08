import { _decorator, Component, Node, Label, Prefab, instantiate, director, Vec3, Color, game, resources, UITransform, Sprite, BoxCollider2D, LabelOutline, tween, v3, UIOpacity, BlockInputEvents, Graphics, Size, CCInteger, CCFloat, Camera, DirectionalLight, Light, Vec3 as Vec3Type, Layers, Canvas } from 'cc';
import './enginePatches';
import { UIManager } from './UIManager';
import { GameState, GAME_SETTINGS, IGameManager } from './Constants'; // Removed Constants
import { SoundManager } from './SoundManager';
import { GameSpeedManager } from './GameSpeedManager';
import { GameDatabase } from './GameDatabase';
import { ResultUI } from './ResultUI'; // Import Added Here
import { DataManager } from './DataManager';
import { CocosLogger } from './CocosLogger';
import { CocosDiagnostic } from './CocosDiagnostic';
import { MovePoint } from './MovePoint';


const { ccclass, property } = _decorator;

// Dedicated layer for background-only content (BackgroundLayer/StarField), separate from
// UI_2D. Cocos's 2D UI batcher always draws after (on top of) 3D opaque content regardless
// of Z position - if the background stayed on UI_2D, MainCamera would keep redrawing it over
// the Player's 3D ship no matter how the ship's Z was adjusted. Giving background content its
// own layer lets a dedicated, lower-priority BackgroundCamera draw it first, while MainCamera
// (which no longer includes this bit in its visibility) draws the 3D ship and remaining UI_2D
// content on top without re-drawing the background itself.
const BG_ONLY_LAYER = 1 << 19;

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

    // Prefabs/Bullets 配下から名前で引ける弾のPrefabリスト(GameDatabase.enemyPrefabsと同じ方式)。
    // ShotRuntime.tsのFire/MultiFire/MissileノードのprefabNameパラメータで見た目を選べるようにする。
    // 未指定/該当なしの場合はbulletPrefab(既定)にフォールバックする。
    public bulletPrefabs: Prefab[] = [];

    @property(Prefab)
    public itemPrefab: Prefab = null;

    @property(GameDatabase)
    public gameDatabase: GameDatabase = null;

    public state: GameState = GameState.TITLE;
    public score: number = 0;
    public isPaused: boolean = false;
    public isDebug: boolean = false;

    @property({ tooltip: "行動パターン検証用テストシーン専用フラグ: trueの間は自動スポーン/ミッション距離カウントダウンを止める" })
    public testMode: boolean = false;

    // References to current scene objects
    public playerNode: Node = null;
    public bulletLayer: Node = null;
    public enemyLayer: Node = null;
    public itemLayer: Node = null; // Add ItemLayer ref

    // BehaviorGraphのMoveToノードが参照するEnemyMovePoint(EMP)。id -> ローカル座標(enemyLayerと同じ空間)。
    // Ingameプレハブ/シーン内の "MovePoints" コンテナ配下に置かれたMovePointコンポーネント付きノードから
    // resolveInGameReferences() が起動時に収集する。
    public movePoints: Map<string, Vec3> = new Map();

    // Managers
    public speedManager: GameSpeedManager = new GameSpeedManager();

    // Spawn Logic
    private spawnTimer: number = 0;
    private frameCount: number = 0; // For performance check or periodic log

    // InGame State (Distance, etc)
    private missionStartHp: number = 100;
    public playState: any = {
        distance: 3000,
        enemies: [],
        items: [],
        killedEnemies: 0,
        collectedItemsCount: 0,
        elapsedTime: 0,
        damageDealt: 0,    // New
        damageReceived: 0, // New
        itemsList: []      // New: {id, name, amount, rare}
    };

    public currentMission: any = null;
    public missionDistance: number = 3000;

    // Current Active Content Node (Title or Ingame)
    private currentContentNode: Node = null;

    // Single persistent camera, owned exclusively by GameManager. Never searched-for,
    // reactivated, or recreated per content switch - see applyCameraForState().
    private mainCamera: Camera = null;

    // Dedicated background-only camera, lower priority than mainCamera so it draws first.
    // See BG_ONLY_LAYER for why this exists - Cocos's 2D UI batcher always draws over 3D
    // content regardless of Z, so the space background needs its own render pass ahead of
    // the Player's 3D ship instead of sharing mainCamera's UI_2D pass.
    private bgCamera: Camera = null;

    // Dedicated DEFAULT-layer (3D) camera, HIGHER priority than mainCamera so it draws
    // LAST. Same root cause as bgCamera but on the other end: mainCamera's own UI_2D pass
    // draws after its own 3D pass within a single camera, so any UI_2D content (HUD panels,
    // enemies, etc.) that visually overlaps the Player's 3D ship would occlude it again -
    // this was already observed once with the background and is expected to recur with any
    // other UI_2D element. Moving all DEFAULT-layer 3D content to its own camera drawn after
    // mainCamera guarantees it always renders on top, regardless of what UI_2D content
    // happens to overlap it on screen.
    private foregroundCamera: Camera = null;

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

        // Initialize AI Bridge Telemetry & Diagnostics
        CocosLogger.initGlobalHook();
        if (!this.node.getComponent(CocosDiagnostic)) {
            this.node.addComponent(CocosDiagnostic);
        }

        console.log("[GameManager] onLoad completed. Ready for start.");

        this.speedManager.reset();

        // ensure scene basic setup (lighting & camera) in case it was corrupted or missing
        this.ensureSceneSetup();

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

        // 弾の見た目バリエーション(Prefabs/Bullets)を読み込む。1件も無くても既定のbulletPrefabで
        // 動作するので、フォルダが空/未作成でもエラー扱いにはしない。
        resources.loadDir("Prefabs/Bullets", Prefab, (err, assets) => {
            if (err) {
                console.log("[GameManager] No Prefabs/Bullets folder found (optional) - using bulletPrefab only.");
                return;
            }
            this.bulletPrefabs = assets;
            console.log(`[GameManager] Loaded ${assets.length} Bullet Prefab variant(s) from resources/Prefabs/Bullets.`);
        });

        // Scene Transition Listeners
        director.on("GAME_RETRY", this.retryGame, this);
        director.on("GAME_TITLE", this.goToTitle, this);
        director.on("GAME_HOME", this.goToHome, this);
    }

    /**
     * Ensures basic lighting and camera settings exist in the scene (DirectionalLight + blue clear color).
     * Called during onLoad when recovering from a corrupted or cloned scene.
     */
    private ensureSceneSetup() {
        const scene = director.getScene();
        if (!scene) return;

        // Single persistent MainCamera - create once if missing, never again after that.
        // All position/visibility configuration happens in applyCameraForState().
        let camNode = scene.getChildByName("MainCamera");
        if (!camNode) {
            console.log("[GameManager] Creating missing MainCamera.");
            camNode = new Node("MainCamera");
            camNode.addComponent(Camera);
            scene.addChild(camNode);
        }
        this.mainCamera = camNode.getComponent(Camera);

        // Dedicated background-only camera - create once if missing, never again after that.
        let bgCamNode = scene.getChildByName("BackgroundCamera");
        if (!bgCamNode) {
            console.log("[GameManager] Creating missing BackgroundCamera.");
            bgCamNode = new Node("BackgroundCamera");
            bgCamNode.addComponent(Camera);
            scene.addChild(bgCamNode);
        }
        this.bgCamera = bgCamNode.getComponent(Camera);

        // Dedicated foreground (DEFAULT-layer / 3D ship) camera - create once if missing.
        let fgCamNode = scene.getChildByName("ForegroundCamera");
        if (!fgCamNode) {
            console.log("[GameManager] Creating missing ForegroundCamera.");
            fgCamNode = new Node("ForegroundCamera");
            fgCamNode.addComponent(Camera);
            scene.addChild(fgCamNode);
        }
        this.foregroundCamera = fgCamNode.getComponent(Camera);

        // directional light - only add if missing
        let lightNode = scene.getChildByName("DirectionalLight");
        if (!lightNode) {
            if (typeof DirectionalLight !== "function") {
                console.warn("[GameManager] DirectionalLight class unavailable at runtime (Feature Crop likely excludes the '3d' module) - skipping directional light setup.");
            } else {
                console.log("[GameManager] Creating missing directional light.");
                lightNode = new Node("DirectionalLight");
                const light = lightNode.addComponent(DirectionalLight);
                light.color = new Color(255, 255, 255, 255);
                light.illuminance = 65000; // Standard daylight
                lightNode.eulerAngles = new Vec3Type(-45, -45, 0);
                scene.addChild(lightNode);
            }
        }
    }

    /**
     * Single source of truth for MainCamera position/visibility. Call right after
     * `this.state` changes. UI states (Title/Home/Result/...) center on world (640,360)
     * where the persistent Canvas and UI content prefabs live; Ingame content is placed
     * at world (0,0) (see switchContent()'s isIngame branch), so the camera needs to
     * move between exactly these two points depending on state.
     */
    private applyCameraForState() {
        if (!this.mainCamera) return;
        const isIngame = this.state === GameState.INGAME;
        // DEFAULT-layer content (SideBarUI's panel children, the Player's 3D ship) is now
        // handled exclusively by foregroundCamera (drawn after mainCamera - see below), so
        // it always renders on top of any UI_2D content instead of being occluded by
        // whatever UI_2D element happens to overlap it on screen.
        const uiMask = Layers.BitMask.UI_2D | Layers.BitMask.UI_3D;
        this.mainCamera.visibility = uiMask;
        this.mainCamera.node.setPosition(isIngame ? 0 : 640, isIngame ? 0 : 360, 1000);
        // A Camera node created via the editor's "Create > Camera" menu defaults to
        // PERSPECTIVE projection, which breaks UI screen-to-world hit testing (clicks land
        // in the wrong place) even though on-screen rendering can look approximately right.
        // Force ORTHO unconditionally so this doesn't depend on how MainCamera was set up.
        this.mainCamera.projection = Camera.ProjectionType.ORTHO;
        this.mainCamera.orthoHeight = 360;
        // Far=1000 (the default) means anything past world Z=0 (camera Z 1000 minus far
        // 1000) gets clipped. The Player's 3D model's baked-in local Z offset, compounded
        // by its parent's 8x scale, can push it to world Z ~ -157 - past that threshold and
        // invisible from a straight-on ortho view even though an angled Scene-view camera
        // (much closer, perspective) doesn't hit the same clip. Give real headroom.
        this.mainCamera.far = 2000;
        // BackgroundCamera now owns clearing the screen to the "space black" / "UI blue"
        // backdrop color (see below) and draws first - mainCamera must NOT clear on top of
        // it, or it would erase whatever BackgroundCamera just drew.
        this.mainCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
        this.mainCamera.priority = 1;
        this.mainCamera.node.active = true;
        this.mainCamera.enabled = true;

        // BackgroundCamera: same view transform as mainCamera (so background content lines
        // up with everything else) but only sees BG_ONLY_LAYER content, drawn first (lower
        // priority) so mainCamera's 3D ship and UI_2D content composite on top of it instead
        // of being redrawn-over by the background every frame.
        if (this.bgCamera) {
            this.bgCamera.visibility = BG_ONLY_LAYER;
            this.bgCamera.node.setPosition(this.mainCamera.node.position);
            this.bgCamera.projection = Camera.ProjectionType.ORTHO;
            this.bgCamera.orthoHeight = 360;
            this.bgCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            // Ingame's SpaceBackground.ts cross-fades semi-transparent nebula images capped
            // at ~50% opacity by design - a vivid blue clear color washes them out
            // completely. Space should read as black behind them; UI screens keep the
            // existing blue (BackgroundCamera has nothing to draw on UI screens, so this
            // clear color is effectively the whole screen's backdrop there too).
            this.bgCamera.clearColor = new Color(0, 0, 0, 0);
            this.bgCamera.priority = 0;
            this.bgCamera.node.active = true;
            this.bgCamera.enabled = true;
        }

        // ForegroundCamera: same view transform as mainCamera but only sees DEFAULT-layer
        // content (Player's 3D ship, SideBarUI's DEFAULT-layer children), drawn LAST
        // (highest priority) so nothing UI_2D can occlude it. Never clears anything - it
        // only adds 3D content on top of whatever mainCamera already drew.
        if (this.foregroundCamera) {
            this.foregroundCamera.visibility = Layers.BitMask.DEFAULT;
            this.foregroundCamera.node.setPosition(this.mainCamera.node.position);
            this.foregroundCamera.projection = Camera.ProjectionType.ORTHO;
            this.foregroundCamera.orthoHeight = 360;
            this.foregroundCamera.far = 2000; // see mainCamera.far comment above
            this.foregroundCamera.clearFlags = Camera.ClearFlag.DONT_CLEAR;
            this.foregroundCamera.priority = 2;
            this.foregroundCamera.node.active = true;
            this.foregroundCamera.enabled = true;
        }

        // The persistent Canvas (SideBarUI's parent) is saved at world (640,360) to match
        // the UI-state camera center. During Ingame, mainCamera recenters to (0,0), but
        // Canvas's own position never moved - SideBarUI is Widget-anchored to Canvas's
        // edges, so it visually slides into a corner whenever Canvas and the camera center
        // disagree. Keep Canvas following mainCamera's current center so anything anchored
        // to it (SideBarUI) stays framed correctly in every state, not just non-Ingame ones.
        const scene = director.getScene();
        const persistentCanvas = scene ? scene.getChildByName("Canvas") : null;
        if (persistentCanvas) {
            // X/Y only - copying mainCamera's full position (including its Z=1000) pushed
            // Canvas past the camera's own near clip plane, hiding everything under it
            // (SideBarUI, Home/Mission content) on every non-Ingame screen.
            persistentCanvas.setPosition(isIngame ? 0 : 640, isIngame ? 0 : 360, 0);
        }
    }

    /**
     * Recursively force a node subtree onto the UI_2D layer, so Cocos's 2D UI batcher
     * actually draws it - Sprite-based Ingame content (background, enemies, bullets,
     * items) is saved on the DEFAULT layer, which the 2D batcher never walks. Only the
     * Player's 3D model subtree should stay on DEFAULT (set separately) - don't call
     * this on the player node itself.
     */
    private forceUILayer(node: Node) {
        node.layer = Layers.BitMask.UI_2D;
        for (const child of node.children) {
            this.forceUILayer(child);
        }
    }

    /**
     * Recursively force a node subtree onto BG_ONLY_LAYER, so only BackgroundCamera draws
     * it (see BG_ONLY_LAYER) - keeps the space background from being redrawn over the
     * Player's 3D ship by mainCamera's UI_2D pass.
     */
    private forceBackgroundLayer(node: Node) {
        node.layer = BG_ONLY_LAYER;
        for (const child of node.children) {
            this.forceBackgroundLayer(child);
        }
    }

    /**
     * Apply patches at runtime to engine classes that are causing preview errors.
     */
    private patchSpriteMethods() {
        try {
            const proto: any = Sprite.prototype as any;
            const origSize = proto._applySpriteSize;
            proto._applySpriteSize = function () {
                if (!this._uiProps) return;
                return origSize.apply(this, arguments);
            };
            const origFrame = proto._applySpriteFrame;
            proto._applySpriteFrame = function () {
                if (!this._uiProps) return;
                return origFrame.apply(this, arguments);
            };
            console.log("[GameManager] Patched Sprite methods to guard _uiProps.");
        } catch (e) {
            console.warn("[GameManager] Failed to patch Sprite methods", e);
        }
    }

    onDestroy() {
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    }

    start() {
        console.log("[GameManager] start triggered.");
        // prefer title, fallback to home if title missing
        if (this.titlePrefab) {
            this.goToTitle();
        } else if (this.homePrefab) {
            console.warn("[GameManager] titlePrefab missing, falling back to homePrefab.");
            this.goToHome();
        } else {
            console.error("[GameManager] No titlePrefab or homePrefab assigned! UI will not appear.");
        }

        // BGM handled within goToTitle/goToHome
    }

    /**
     * Switch content (Prefab) under Canvas or Scene root
     * Returns the instantiated node
     */
    public switchContent(prefab: Prefab) {
        if (!prefab) {
            console.error("[GameManager] switchContent failed: Prefab is null.");
            return null;
        }

        console.log(`[GameManager] switchContent: switching to ${prefab.name}`);

        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");

        // 1. Clear previous content
        if (this.currentContentNode && this.currentContentNode.isValid) {
            this.currentContentNode.destroy();
            this.currentContentNode = null;
        }

        // Also cleanup old references
        this.playerNode = null;
        this.bulletLayer = null;
        this.enemyLayer = null;
        this.itemLayer = null;

        // 2. Instantiate new
        const node = instantiate(prefab);
        console.log(`[GameManager] Instantiated prefab: ${prefab.name}, node name: ${node.name}, children count: ${node.children.length}`);

        // --- Decision: Place in Canvas or Scene root? ---
        // Ingame content (3D) should be in World space (Scene root)
        // UI content (Title, Home) should be in Screen space (Canvas) -
        // UNLESS the content prefab already brings its own Canvas+Camera (self-contained screen),
        // in which case nesting it under the persistent Canvas would create a Canvas-in-Canvas conflict.
        const isIngame = prefab.name.toLowerCase().includes("ingame") || this.state === GameState.INGAME;
        const hasOwnCanvas = !!node.getComponentInChildren(Canvas);
        console.log(`[GameManager] isIngame: ${isIngame}, hasOwnCanvas: ${hasOwnCanvas}`);

        if (isIngame || hasOwnCanvas) {
            scene.addChild(node);
            // In world space, (0,0,0) is center. Layers are already at (0,0) in prefab usually.
            node.setPosition(0, 0, 0);
            console.log(isIngame
                ? "[GameManager] Ingame content placed in Scene Root for 3D rendering."
                : "[GameManager] UI content has its own Canvas; placed in Scene Root to avoid nested Canvas.");
        } else {
            if (!canvas) {
                console.error("[GameManager] Canvas not found in scene and content has no own Canvas - cannot place UI content.");
                return null;
            }
            console.log(`[GameManager] Canvas before adding UI content: ${canvas.name}, children: ${canvas.children.length}`);
            canvas.addChild(node);
            node.setPosition(0, 0, 0);
            node.setSiblingIndex(0); // Put at bottom (behind persistent UI)
            console.log(`[GameManager] UI content placed in Canvas. Canvas now has ${canvas.children.length} children.`);
        }

        // Camera is no longer searched-for/created here - GameManager owns a single
        // persistent MainCamera configured by applyCameraForState() on every state change.

        if (node.children.length === 0) {
            console.warn("[GameManager] Instantiated prefab has no child nodes. May be empty.");
        }

        this.currentContentNode = node;

        // 3. Force UI to resolve references for the new content (GameOver, HUD etc)
        if (UIManager.instance) {
            UIManager.instance.resolveReferences();
        }

        // 4. SideBarUI Visibility
        if (UIManager.instance) {
            const shouldBeActive = (this.state !== GameState.TITLE);
            UIManager.instance.setSideBarActive(shouldBeActive);
        }

        return node;
    }

    public startInGame(mission: any = null) {
        console.log("[GameManager] Starting InGame via Prefab...");

        if (mission) {
            this.currentMission = mission;
        }

        this.state = GameState.INGAME;
        this.applyCameraForState();
        this.isPaused = false; // Freeze Fix: Ensure game is unpaused on mission start

        // Reset HP for the session
        if (DataManager.instance) {
            // If mission is non-null, it's a new embarkation from Home -> Save CURRENT HP
            if (mission) {
                this.missionStartHp = DataManager.instance.data.hp;
                console.log(`[GameManager] New mission start. HP recorded: ${this.missionStartHp}`);
            }

            // Restore HP to whatever it was at the start of THIS mission (Retry uses this too)
            DataManager.instance.setHp(this.missionStartHp);
            console.log(`[GameManager] HP restored to mission start value: ${this.missionStartHp}`);
        }

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
        this.playState.elapsedTime = 0; // Reset Timer
        this.playState.damageDealt = 0;    // Reset
        this.playState.damageReceived = 0; // Reset
        this.playState.itemsList = [];      // Reset

        // Inject GM to Player
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && pCtrl.setup) {
                pCtrl.setup(this);

                // --- Cargo Penalty ---
                const data = DataManager.instance.data;
                const weight = this.currentMission ? (this.currentMission.cargoWeight || 0) : 0;
                const capacity = data.capacity || 50;
                if (weight > capacity) {
                    console.log(`[GameManager] Cargo penalty applied: ${weight} > ${capacity}`);
                    pCtrl.cargoDamagePenalty = 1.0; // Subtract 1.0 from multiplier
                } else {
                    pCtrl.cargoDamagePenalty = 0;
                }
            }
        }

        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
            UIManager.instance.resetBuffs(); // Ensure clean UI state
        }

        // Start BGM
        if (SoundManager.instance) {
            SoundManager.instance.pauseBGM(1.0); // Pause OutGame Atmosphere
            SoundManager.instance.playBGM("bgm_ingame01", 1.0);
        }
    }

    public retryGame() {
        console.log("[GameManager] Retrying Game...");
        // Just call startInGame, which re-instantiates the prefab
        this.startInGame();
    }

    public goToTitle() {
        console.log("[GameManager] Switch to Title via Prefab");
        this.state = GameState.TITLE;
        this.applyCameraForState();
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
        this.applyCameraForState();
        this.switchContent(this.homePrefab);

        if (SoundManager.instance) {
            if (!SoundManager.instance.resumeBGM(1.5)) {
                SoundManager.instance.playBGM("bgm_outgame01", 1.0);
            }
        }

        if (UIManager.instance) {
            UIManager.instance.resetBuffs();
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

        // Camera is handled exclusively by applyCameraForState() (called from startInGame()
        // when this.state was set to INGAME) - no per-content camera setup needed here.

        this.playerNode = findNode(rootNode, "Player");
        this.bulletLayer = findNode(rootNode, "BulletLayer");
        this.enemyLayer = findNode(rootNode, "EnemyLayer");
        this.itemLayer = findNode(rootNode, "ItemLayer");

        // Player.prefab's root node carries a legacy 2D Sprite (with its required UITransform)
        // alongside PlayerController. The 2D visual is no longer used (player is fully
        // represented by the 3D ship model now) - explicitly disable it here in case the
        // prefab's saved state has it enabled, rather than relying on the prefab alone.
        // Cocos refuses removeComponent(UITransform) while a Sprite on the same node still
        // depends on it (same class of error seen earlier with MissionUI dialogs), so this
        // stays a runtime enabled=false rather than an actual component removal; removing
        // the Sprite/UITransform components outright (if desired) must be done from the
        // Cocos Editor Inspector (Remove Component), not via script.
        if (this.playerNode) {
            const legacySprite = this.playerNode.getComponent(Sprite);
            if (legacySprite) {
                legacySprite.enabled = false;
            }
            // ensure layer is Default for 3D rendering
            this.playerNode.layer = Layers.BitMask.DEFAULT;
        }

        if (!this.playerNode) console.error("[GameManager] Player Node NOT FOUND in Prefab!");
        if (!this.enemyLayer) console.error("[GameManager] EnemyLayer Node NOT FOUND in Prefab!");

        // Force zero positions to ensure coordinate sync between layers
        // This fixes the issue where layers in the prefab had (640, 360) offsets from Canvas space
        if (this.playerNode) this.playerNode.setPosition(0, -200, 0); // Start at bottom center
        if (this.bulletLayer) this.bulletLayer.setPosition(0, 0, 0);
        if (this.enemyLayer) this.enemyLayer.setPosition(0, 0, 0);
        if (this.itemLayer) this.itemLayer.setPosition(0, 0, 0);

        // Notify UIManager to resolve its references (GameOverPanel etc) from the new prefab
        if (UIManager.instance) {
            UIManager.instance.resolveReferences();
        }

        // Background and StarField might also need reset if they were offset.
        // BackgroundLayer is saved inactive in the prefab (leftover from earlier
        // debugging) - force it active or the space backdrop never renders.
        // They're also saved on the DEFAULT layer: Cocos's 2D UI batcher only walks
        // UI_2D-layer content, so a 2D Sprite on DEFAULT never gets drawn even though
        // the camera's visibility mask includes DEFAULT (that mask is what lets the
        // Player's 3D mesh show through the same camera - a completely different
        // render path with its own layer rules).
        // Zero out any leftover offset on the wrapper nodes between rootNode and the
        // layers above (e.g. "640x360_Canvas" / "Canvas") - these used to sit nested
        // inside the persistent UI Canvas at a (640,360)-ish offset under the old
        // architecture. Now that Ingame content is placed at Scene root (0,0,0) by
        // switchContent(), any leftover local offset saved on these wrapper nodes
        // shifts everything under them out from under MainCamera's Ingame view.
        const wrapper1 = findNode(rootNode, "640x360_Canvas");
        if (wrapper1) wrapper1.setPosition(0, 0, 0);
        const wrapper2 = findNode(rootNode, "Canvas");
        if (wrapper2) wrapper2.setPosition(0, 0, 0);

        // BackgroundLayer/StarField go on BG_ONLY_LAYER (not UI_2D) so only BackgroundCamera
        // draws them - see BG_ONLY_LAYER for why (2D UI otherwise always draws over the
        // Player's 3D ship regardless of Z, no matter how the ship's Z is adjusted).
        const bgLayer = findNode(rootNode, "BackgroundLayer");
        if (bgLayer) {
            bgLayer.active = true;
            bgLayer.setPosition(0, 0, 0);
            this.forceBackgroundLayer(bgLayer);
        }
        const starField = findNode(rootNode, "StarField");
        if (starField) {
            starField.setPosition(0, 0, 0);
            this.forceBackgroundLayer(starField);
        }

        // EnemyMovePoint(EMP)収集: "MovePoints" コンテナ配下のMovePointコンポーネント付き子ノードを
        // ID -> ローカル座標のマップにする。他のレイヤーと同様(0,0,0)に矯正してenemyLayerと同じ
        // 座標空間で参照できるようにする。コンテナが無いシーン(未対応の旧シーン等)では単に空のまま。
        this.movePoints.clear();
        const movePointsContainer = findNode(rootNode, "MovePoints");
        if (movePointsContainer) {
            movePointsContainer.setPosition(0, 0, 0);
            for (const child of movePointsContainer.children) {
                const mp = child.getComponent(MovePoint);
                if (mp && mp.pointId) {
                    this.movePoints.set(mp.pointId, child.position.clone());
                }
            }
            console.log(`[GameManager] Collected ${this.movePoints.size} MovePoint(s).`);
        }

        console.log(`[GameManager] References resolved: Player=${this.playerNode?.name}, EnemyLayer=${this.enemyLayer?.name}`);

        // Attach a 3D model to the player only if one isn't already present. Player.prefab
        // now ships with its own embedded "PlayerShip3D" child node - only fall back to
        // dynamically loading the standalone Prefabs/PlayerShip_3D resource (an older
        // workaround for when the prefab had no embedded model) if neither the Inspector's
        // model3D field NOR an existing child node covers it. Without this guard, both the
        // embedded child and a freshly-instantiated resource copy render simultaneously as
        // two overlapping ships.
        if (this.playerNode) {
            const pCtrl = this.playerNode.getComponent("PlayerController") as any;
            if (pCtrl && !pCtrl.model3D) {
                const existingModel = this.playerNode.getChildByName("PlayerShip3D") || this.playerNode.getChildByName("PlayerShip_3D");
                if (existingModel) {
                    existingModel.layer = Layers.BitMask.DEFAULT;
                    pCtrl.model3D = existingModel;
                    console.log("[GameManager] Reused existing embedded 3D model on PlayerNode (no dynamic load needed).");
                } else {
                    resources.load("Prefabs/PlayerShip_3D", Prefab, (err, prefab) => {
                        if (!err && prefab) {
                            const node = instantiate(prefab);
                            node.layer = Layers.BitMask.DEFAULT;
                            this.playerNode.addChild(node);
                            node.setPosition(0, 0, 0);
                            pCtrl.model3D = node;
                            console.log("[GameManager] Attached 3D model to PlayerNode (dynamic load fallback).");
                        } else {
                            console.warn("[GameManager] Unable to load PlayerShip_3D prefab for 3D model.");
                        }
                    });
                }
            }
        }

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
        this.playState.elapsedTime += deltaTime;

        // Timer Logic (行動パターン検証用テストシーンでは自動湧きを止める)
        if (!this.testMode) {
            this.spawnTimer += deltaTime;
            const interval = (GAME_SETTINGS.ENEMY.SPAWN_INTERVAL / 60); // Convert frames to seconds approx

            if (this.spawnTimer >= interval) {
                this.spawnTimer = 0;
                this.spawnEnemy();
            }
        }

        // Distance Logic
        const pCtrl = this.playerNode ? this.playerNode.getComponent("PlayerController") as any : null;
        const currentSpeed = pCtrl ? pCtrl.speed : 0;

        // Update Speed Manager (敵のスクロールオフセット計算に使われるため testMode でも継続する)
        this.speedManager.setBaseSpeed(currentSpeed);

        // ミッション距離カウントダウン/ゴール判定はテストシーンでは行わない
        if (!this.testMode) {
            // Get Final Speed
            const finalSpeed = this.speedManager.getCurrentSpeed();

            // Conversion logic (similar to engine.js)
            const physics = GAME_SETTINGS.PHYSICS as any;
            const distDivisor = physics.MISSION_DIVISOR || 2000;
            const distDec = (finalSpeed * physics.MISSION_SCALE) / distDivisor;
            this.playState.distance -= distDec;

            if (this.playState.distance <= 0) {
                this.playState.distance = 0;
                this.triggerGoalSequence();
            }
        }

        // UI Update (via UIManager)
        if (UIManager.instance) {
            UIManager.instance.updateDist(this.playState.distance);
            UIManager.instance.updateSpeed(currentSpeed);
            UIManager.instance.updateTimer(this.playState.elapsedTime);
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
            let enemyData: any = null;
            const mission = this.currentMission;

            if (mission && mission.enemyPattern && mission.enemyPattern.length > 0) {
                // Pick random ID from the mission's defined pattern
                const pattern = mission.enemyPattern;
                const randomId = pattern[Math.floor(Math.random() * pattern.length)];
                enemyData = db.getEnemyData(randomId);

                // Fallback to random if the specific ID is invalid or missing prefab
                if (!enemyData || !enemyData.prefab) {
                    enemyData = db.getRandomEnemy();
                }
            } else {
                enemyData = db.getRandomEnemy();
            }

            if (enemyData && enemyData.prefab) {
                this._instantiateEnemy(enemyData);
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

    /**
     * 指定した EnemyData を実際にインスタンス化してenemyLayerに配置する共通処理。
     * ランダム抽選(spawnEnemy)・ID指定(spawnEnemyById)の両方から呼ばれる。
     */
    private _instantiateEnemy(enemyData: any): Node | null {
        if (!this.enemyLayer) {
            console.error("[GameManager] _instantiateEnemy failed: enemyLayer is null.");
            return null;
        }

        const node = instantiate(enemyData.prefab);
        node.parent = this.enemyLayer; // Prefab base ref
        this.forceUILayer(node);

        // Random X, Top Y
        const x = (Math.random() * GAME_SETTINGS.CANVAS_WIDTH) - (GAME_SETTINGS.CANVAS_WIDTH / 2);
        const y = (GAME_SETTINGS.CANVAS_HEIGHT / 2) + 50;
        node.setPosition(x, y, 0);

        const enemyComp = node.getComponent("Enemy") as any;
        if (enemyComp) {
            enemyComp.init(enemyData, this);
        }
        console.log(`[GameManager] Spawned enemy: ${enemyData.id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        return node;
    }

    /**
     * 行動パターン検証用テストシーンから、IDを指定して敵を1体スポーンする。
     */
    public spawnEnemyById(id: string): Node | null {
        const db = this.gameDatabase || GameDatabase.instance;
        if (!db || !db.isReady) {
            console.warn(`[GameManager] spawnEnemyById('${id}') skipped: GameDatabase is NOT READY or null.`);
            return null;
        }

        const enemyData = db.getEnemyData(id);
        if (!enemyData || !enemyData.prefab) {
            console.warn(`[GameManager] spawnEnemyById('${id}') failed: EnemyData not found or has no Prefab.`);
            return null;
        }

        return this._instantiateEnemy(enemyData);
    }

    /**
     * 行動パターン検証用テストシーンから、現在出現している敵を全て破棄する。
     */
    public despawnAllEnemies(): void {
        if (!this.enemyLayer) return;
        // 走査中に破棄すると children が変化するため、事前に配列へコピーしてから破棄する。
        const children = this.enemyLayer.children.slice();
        for (const child of children) {
            child.destroy();
        }
    }

    /**
     * BehaviorGraphのMoveToノードから使うEnemyMovePointの座標を取得する。
     * id="0"(または空文字)は「現在地」を表す予約語のため、常にnullを返す
     * (呼び出し側=BehaviorRuntimeがその場合は敵の現在位置を使う)。
     */
    public getMovePoint(id: string): { x: number; y: number } | null {
        if (!id || id === "0") return null;
        const p = this.movePoints.get(id);
        return p ? { x: p.x, y: p.y } : null;
    }

    public triggerGoalSequence() {
        if (this.state === GameState.RESULT) return;
        this.state = GameState.RESULT;
        this.applyCameraForState();

        console.log("[GameManager] GOAL Distance reached! Triggering sequence...");

        // 1. Stop Game World
        this.isPaused = true;
        if (SoundManager.instance) {
            SoundManager.instance.stopBGM(0.5);
        }

        // 2. Show GOAL Decorative Text
        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");
        if (canvas) {
            // 2. Show GOAL Decorative Text
            const goalNode = new Node("GOAL_Text");
            canvas.addChild(goalNode);
            goalNode.setPosition(0, 0, 0);

            const lbl = goalNode.addComponent(Label);
            lbl.string = "GOAL!!";
            lbl.fontSize = 120;
            lbl.lineHeight = 130; // Prevent clipping
            lbl.color = Color.YELLOW;
            lbl.overflow = Label.Overflow.NONE;

            const outline = goalNode.addComponent(LabelOutline);
            outline.color = Color.BLACK;
            outline.width = 6;

            // Ensure UITransform is enough
            const trans = goalNode.getComponent(UITransform) || goalNode.addComponent(UITransform);
            trans.setContentSize(new Size(800, 200));

            // UI Sound with GOAL text
            if (SoundManager.instance) {
                SoundManager.instance.playBGM("sounds/BGM/shooter_BGM_Result", 0.5);
            }

            // Simple scale pop
            tween(goalNode)
                .set({ scale: v3(0, 0, 0) })
                .to(0.5, { scale: v3(1.1, 1.1, 1) }, { easing: 'backOut' })
                .to(0.2, { scale: v3(1, 1, 1) })
                .start();

            // 3. Blackout (0.5s fade, shorter wait)
            this.scheduleOnce(() => {
                const blackout = new Node("Blackout");
                canvas.addChild(blackout);
                blackout.setPosition(0, 0, 0);
                blackout.addComponent(BlockInputEvents);

                const graphics = blackout.addComponent(Graphics);
                graphics.fillColor = new Color(0, 0, 0, 0);
                graphics.rect(-2000, -2000, 4000, 4000);
                graphics.fill();

                const opacity = blackout.addComponent(UIOpacity);
                tween(opacity)
                    .to(0.5, { opacity: 255 }) // Halved from 1.0
                    .call(() => {
                        goalNode.destroy();
                        this.onMissionComplete();
                        // Fade in blackout briefly or let ResultUI handle its own appearance
                        tween(opacity)
                            .delay(0.2) // Shortened from 0.5
                            .to(0.3, { opacity: 0 }) // Shortened from 0.5
                            .call(() => blackout.destroy())
                            .start();
                    })
                    .start();
            }, 1.0); // Wait 1s (Halved from 2s) for GOAL text to be seen
        } else {
            this.onMissionComplete();
        }
    }

    public onMissionComplete() {
        if (this.state === GameState.FAILURE) return; // Failure takes precedence

        console.log("Mission Complete!");

        // 1. Add Mission Reward with Time Bonus/Penalty
        let actualReward = 0;
        let prevCredits = DataManager.instance ? DataManager.instance.data.money : 0;

        if (this.currentMission && this.currentMission.reward > 0) {
            actualReward = this.currentMission.reward;
            const targetTime = this.currentMission.targetTime || 60;
            const timeBonus = 0.1; // ±10%

            if (this.playState.elapsedTime <= targetTime) {
                actualReward = Math.floor(actualReward * (1 + timeBonus));
                console.log(`[GameManager] Target Time met! Bonus applied: ${actualReward}`);
            } else {
                actualReward = Math.floor(actualReward * (1 - timeBonus));
                console.log(`[GameManager] Target Time exceeded! Penalty applied: ${actualReward}`);
            }

            if (DataManager.instance) {
                DataManager.instance.addResource("credits", actualReward);
            }
        }

        // 2. Track Cleared Stage
        if (DataManager.instance) {
            const difficulty = this.currentMission ? (this.currentMission.stars || 1) : 1;
            DataManager.instance.incrementClearedStages(difficulty);
            DataManager.instance.save();
        }

        // 4. Apply ResultUI dynamically
        console.log("[GameManager] Showing ResultUI...");
        const node = new Node("ResultUI");

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

        resUI.setup(enemies, items, 0, this.playState.itemsList, actualReward, prevCredits);
    }

    /**
     * Transition back to Home with blackout and crossfade
     */
    public returnToHomeTransition() {
        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");
        if (!canvas) {
            this.goToHome();
            return;
        }

        const blackout = new Node("HomeTransitionBlackout");
        canvas.addChild(blackout);
        blackout.setSiblingIndex(canvas.children.length - 1);
        blackout.addComponent(BlockInputEvents);

        const graphics = blackout.addComponent(Graphics);
        graphics.fillColor = Color.BLACK;
        graphics.rect(-2000, -2000, 4000, 4000);
        graphics.fill();

        const opacity = blackout.addComponent(UIOpacity);
        opacity.opacity = 0;

        tween(opacity)
            .to(0.5, { opacity: 255 }) // Halved from 1.0
            .call(() => {
                // Crossfade BGM
                if (SoundManager.instance) {
                    SoundManager.instance.playBGM("sounds/BGM/Shooter_OutgameA", 1.0);
                }
                // Switch Content
                this.goToHome();

                // Fade out blackout after switching scene content
                this.scheduleOnce(() => {
                    tween(opacity)
                        .to(0.5, { opacity: 0 }) // Halved from 1.0
                        .call(() => {
                            if (blackout.isValid) blackout.destroy();
                        })
                        .start();
                }, 0.1);
            })
            .start();
    }

    // Prefabs/Bullets から名前で1件引く(拡張子省略可、GameDatabase.getPrefab()と同じ規約)。
    // 見つからなければnull(呼び出し側でbulletPrefabへフォールバックする)。
    private getBulletPrefab(name: string): Prefab | null {
        if (!name) return null;
        const cleanName = name.replace(".prefab", "");
        return this.bulletPrefabs.find(p => p.data.name === cleanName) || null;
    }

    // Bullet Factory. prefabNameを指定すると Prefabs/Bullets 内の該当Prefabを使う
    // (ShotRuntime.tsのFire/MultiFire/Missileノードのprefab切り替え用)。未指定/該当なしなら
    // 既定のbulletPrefabにフォールバックする。
    public spawnBullet(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, prefabName?: string): any {
        const prefab = (prefabName && this.getBulletPrefab(prefabName)) || this.bulletPrefab;
        if (!prefab) {
            console.error("[GameManager] bulletPrefab is NULL! Cannot spawn bullet.");
            return null;
        }

        // Check if bulletLayer is assigned, if not, fallback to self or scene root
        let parent = this.bulletLayer;
        if (!parent) {
            console.warn("[GameManager] bulletLayer is NULL! Using GameManager node as parent.");
            parent = this.node;
        }

        const node = instantiate(prefab);
        node.parent = parent;
        this.forceUILayer(node);
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

    // Enemyの最寄り探索 (ShotRuntime.tsのMissileノード, homing=ON時にプレイヤー発射のターゲットを
    // 決めるために使う。PlayerController.findNearestEnemy()の一般化版)。
    public findNearestEnemyTo(x: number, y: number): Node | null {
        if (!this.enemyLayer) return null;
        let nearest: Node | null = null;
        let minDistSq = Number.MAX_VALUE;
        for (const enemy of this.enemyLayer.children) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - x;
            const dy = enemy.position.y - y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = enemy;
            }
        }
        return nearest;
    }

    // Item Factory
    public onItemCollected(id: string, amount: number, pos?: Vec3) {
        console.log(`[GameManager] onItemCollected called: ${id} x${amount} at ${pos}`);

        // Count it
        if (!this.playState.collectedItemsCount) this.playState.collectedItemsCount = 0;
        this.playState.collectedItemsCount++;

        const db = this.db;
        const itemMaster = db ? db.getItemData(id) : null;
        const def = GAME_SETTINGS.ECONOMY.ITEMS[id];

        const name = itemMaster ? itemMaster.name : (def ? def.name : id);
        const effectType = itemMaster ? itemMaster.effectType : (def ? def.type : "None");
        const effectValue = itemMaster && itemMaster.effectValue > 0 ? itemMaster.effectValue : (def ? def.value || 0 : 0);
        const duration = itemMaster && itemMaster.duration > 0 ? itemMaster.duration : (def ? def.duration || 0 : 0);
        const rarity = def ? (def.rare || 1) : 1;

        const pCtrl = this.playerNode.getComponent("PlayerController") as any;

        // Effect Execution based on EffectType (Data-driven)
        switch (effectType) {
            case 'Heal':
                const healAmt = effectValue > 0 ? effectValue * amount : 20;
                if (UIManager.instance) UIManager.instance.showItemLog(`${name} (+${healAmt} HP)`, rarity, pos);
                SoundManager.instance.playSE("itemget01", "System");
                if (pCtrl && pCtrl.heal) pCtrl.heal(healAmt);
                break;

            case 'PowerUp':
                const pVal = effectValue > 0 ? effectValue : 0.5;
                const pDur = duration > 0 ? duration : 10;
                if (UIManager.instance) {
                    UIManager.instance.showBuffNotification("POWER UP!", new Color(255, 50, 50), pos);
                    UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                }
                SoundManager.instance.playSE("powerup01", "System");
                if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Power", pDur, pVal);
                break;

            case 'RapidFire':
                const rVal = effectValue > 0 ? effectValue : 0.5;
                const rDur = duration > 0 ? duration : 10;
                if (UIManager.instance) {
                    UIManager.instance.showBuffNotification("RAPID FIRE!", new Color(0, 150, 255), pos);
                    UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                }
                SoundManager.instance.playSE("powerup01", "System");
                if (pCtrl && pCtrl.applyBuff) pCtrl.applyBuff("Rapid", rDur, rVal);
                break;

            case 'Credit':
                const crAmt = (effectValue > 0 ? effectValue : 10) * amount;
                if (DataManager.instance) DataManager.instance.addResource("credits", crAmt);
                SoundManager.instance.playSE("coin01", "System");
                if (UIManager.instance) UIManager.instance.showItemLog(`Credits +${crAmt}`, 1, pos);
                break;

            case 'Exp':
                const expAmt = (effectValue > 0 ? effectValue : 10) * amount;
                if (DataManager.instance) DataManager.instance.addResource("exp", expAmt);
                SoundManager.instance.playSE("coin01", "System");
                if (UIManager.instance) UIManager.instance.showItemLog(`EXP +${expAmt}`, 1, pos);
                break;

            case 'Material':
            case 'UnlockTrigger':
                const matAmt = (effectValue > 0 ? effectValue : 1) * amount;
                if (DataManager.instance && DataManager.instance.addResource) {
                    DataManager.instance.addResource(id, matAmt);
                }
                SoundManager.instance.playSE("itemget01", "System");
                if (UIManager.instance) UIManager.instance.showItemLog(`🔩 ${name} +${matAmt}`, rarity, pos);
                break;

            default:
                // General Item or None
                if (UIManager.instance) UIManager.instance.showItemLog(`${name} x${amount}`, rarity, pos);
                SoundManager.instance.playSE("itemget01", "System");
                break;
        }

        // --- Multi-item Listing for Result screen ---
        let exist = this.playState.itemsList.find((it: any) => it.id === id);
        if (exist) {
            exist.amount += amount;
        } else {
            this.playState.itemsList.push({ id, name, amount, rare: rarity });
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
        this.forceUILayer(node);
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
        this.forceUILayer(node);
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
        this.applyCameraForState();
        console.log("Game Over!");

        // Reset Buffs
        const pCtrl = this.playerNode?.getComponent("PlayerController") as any;
        if (pCtrl && pCtrl.resetBuffs) pCtrl.resetBuffs();

        // Save progress (collected items etc)
        DataManager.instance.save();

        if (UIManager.instance) {
            UIManager.instance.showGameOver();
        }

        SoundManager.instance.stopBGM(1.0);
    }
}
