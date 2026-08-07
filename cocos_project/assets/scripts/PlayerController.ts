import { _decorator, Component, Node, Input, input, EventTouch, Vec3, view, math, find, Enum, Prefab, instantiate, Color } from 'cc';
import { DataManager } from './DataManager';
import { GAME_SETTINGS, IGameManager, GameState } from './Constants';
import { UIManager } from './UIManager';
import { BuffVisualEffect } from './BuffVisualEffect';
import { SoundManager } from './SoundManager';
import { GameDatabase } from './GameDatabase';
import { ShotRuntime } from './ShotRuntime';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ tooltip: "Current Speed (Read Only)" })
    public speed: number = 0;

    // Stats (Exposed for Tuning)
    @property({ tooltip: "Max HP" })
    public maxHp: number = 100;

    @property({ tooltip: "Base Max Speed (at Top Zone)" })
    public baseMaxSpeed: number = 6.0;

    @property({ tooltip: "Acceleration per frame" })
    public accel: number = 0.05;

    @property({ tooltip: "Brake Force per frame" })
    public brakeForce: number = 0.2;

    @property({ tooltip: "Friction (unused in Auto-Accel?)" })
    public friction: number = 0.98;

    @property({ tooltip: "Movement Smoothness (0.01 - 1.0)" })
    public lerpFactor: number = 0.1;

    // Shot Pattern (発射グラフ)
    @property({ tooltip: "使用する発射パターンID (ShotPatterns.csv/Master ManagerのShot Patternタブで編集)" })
    public shotPatternId: string = "SP_PLAYER_BASIC";

    // Speed Zone Params
    @property({ type: Enum({ STEP: 0, LINEAR: 1, SMOOTH: 2, EXP: 3 }), tooltip: "Speed Curve Type based on Y-Pos" })
    public speedCurveType: number = 0; // Default STEP

    @property({ tooltip: "Min Speed Ratio (at Bottom)" })
    public minSpeedRatio: number = 0.5;

    @property({ tooltip: "Max Speed Ratio (at Top)" })
    public maxSpeedRatio: number = 1.0;

    @property(Prefab)
    public powerBuffPrefab: Prefab = null;

    @property(Prefab)
    public rapidBuffPrefab: Prefab = null;

    // Audio Tuning
    @property({ tooltip: "Distance (px) for silence" })
    public audioVolDropoff: number = 800; // Far off-screen

    @property(Node)
    public model3D: Node = null;

    @property({ tooltip: "Banking Angle (Max)" })
    public maxBankingAngle: number = 30;

    public hp: number = 100;

    @property({ tooltip: "テスト用: trueの間は被弾してもダメージ処理を一切行わない" })
    public invincible: boolean = false;

    private targetPos: Vec3 = new Vec3();
    private currentPos: Vec3 = new Vec3();

    // Shot Pattern ランタイム。GameDatabase.isReady + 該当パターンのグラフJSONロード完了を
    // 待ってから構築する(上限付きリトライ、BehaviorTestController.tsと同じパターン)。
    private _shotRuntime: ShotRuntime | null = null;
    private _shotRuntimeRetryCount: number = 0;
    private static readonly SHOT_RUNTIME_MAX_RETRY = 300;

    // Cache GM
    private _gm: IGameManager = null;

    // Buff State
    public damageMultiplier: number = 1.0;
    public fireRateMultiplier: number = 1.0;
    public cargoDamagePenalty: number = 0;
    private buffPowerTimer: number = 0;
    private buffRapidTimer: number = 0;

    // Visuals (To be assigned or created)
    private powerEffectNode: Node = null;
    private rapidEffectNode: Node = null;

    public setup(gm: IGameManager) {
        this._gm = gm;
    }

    start() {
        // Initialize Input
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);

        // Initial Pos
        this.node.getPosition(this.currentPos);
        this.targetPos.set(this.currentPos);

        this.loadStats();
        this.resetBuffs(); // Ensure clean state on retry/start

        // Load HP from DataManager
        if (DataManager.instance) {
            this.hp = DataManager.instance.data.hp;
            this.maxHp = DataManager.instance.data.maxHp;
        }

        // Init UI
        if (UIManager.instance) {
            UIManager.instance.updateHP(this.hp, this.maxHp);
        }

        this._shotRuntimeRetryCount = 0;
        this.waitForShotPattern();
    }

    // GameDatabase.isReady かつ該当ShotPatternのグラフJSON非同期ロードが終わるまで待ってから
    // ShotRuntimeを構築する(BehaviorTestController.tsのwaitForDatabase()と同じ上限付きリトライ)。
    private waitForShotPattern() {
        const db = GameDatabase.instance;
        if (db && db.isReady) {
            const patternData = db.getShotPatternData(this.shotPatternId);
            if (patternData && patternData._graph) {
                this._shotRuntime = new ShotRuntime(patternData._graph, this._gm, this.node, false);
                this._shotRuntime.getSpeedMult = () => 1.0;
                this._shotRuntime.getDamageMult = () => Math.max(0.1, this.damageMultiplier - this.cargoDamagePenalty);
                this._shotRuntime.getIntervalMult = () => this.fireRateMultiplier;
                console.log(`[PlayerController] ShotRuntime ready for pattern '${this.shotPatternId}'.`);
                return;
            }
            if (!patternData) {
                // dbはready(ShotPatterns.csvを読み終えている)なのにこのIDが1件も無い
                // = Shot Patternエディタでリネーム/削除された、またはタイプミス。
                // 何度リトライしても絶対に見つからないので、30秒待たせず即座にエラーを出して諦める。
                console.error(`[PlayerController] ShotPattern '${this.shotPatternId}' が ShotPatterns.csv に存在しません(リネーム/タイプミスの可能性)。PlayerControllerのshotPatternIdプロパティを確認してください。Player will not fire.`);
                return;
            }
            // patternDataは見つかっているが_graph(JSON)の非同期ロードがまだ終わっていない。リトライで待つ。
        }

        this._shotRuntimeRetryCount++;
        if (this._shotRuntimeRetryCount > PlayerController.SHOT_RUNTIME_MAX_RETRY) {
            console.error(`[PlayerController] ShotPattern '${this.shotPatternId}' の読み込みが ${PlayerController.SHOT_RUNTIME_MAX_RETRY} 回のリトライ後も完了しませんでした。諦めます(Player will not fire)。`);
            return;
        }
        this.scheduleOnce(() => this.waitForShotPattern(), 0.1);
    }

    onDestroy() {
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    private loadStats() {
        console.log(`[Player] Stats Initialized. MaxSpeed: ${this.baseMaxSpeed}`);
    }

    private onMouseMove(event: any) {
        if (!this.canControl()) return;
        const uiLoc = event.getUILocation();
        this.updateTargetPos(uiLoc);
    }

    private onTouchMove(event: EventTouch) {
        if (!this.canControl()) return;
        const uiLoc = event.getUILocation();
        this.updateTargetPos(uiLoc);
    }

    private updateTargetPos(uiLoc: any) {
        // Player only ever operates in Ingame's world-space content (see canControl()),
        // where MainCamera sits centered on world (0,0) - screen center (640,360 in UI
        // pixels) maps to world (0,0). Previously this branched on whether the parent node
        // had a UITransform to decide between this math and convertToNodeSpaceAR(), but
        // that check stopped being reliable once the parent "Canvas" node picked up a
        // UITransform as a side effect of adding a real cc.Canvas component to it - passing
        // getUILocation()'s screen-pixel coordinates into convertToNodeSpaceAR() (which
        // expects a world position) produced incorrect, non-1:1 mouse tracking. Always use
        // the direct screen-to-world offset instead.
        const halfW = GAME_SETTINGS.SCREEN_WIDTH / 2;
        const halfH = GAME_SETTINGS.SCREEN_HEIGHT / 2;
        this.targetPos.x = uiLoc.x - halfW;
        this.targetPos.y = uiLoc.y - halfH;
        this.clampTarget();
    }

    private clampTarget() {
        const halfW = GAME_SETTINGS.CANVAS_WIDTH / 2;
        const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;

        if (this.targetPos.x < -halfW) this.targetPos.x = -halfW;
        if (this.targetPos.x > halfW) this.targetPos.x = halfW;
        if (this.targetPos.y < -halfH) this.targetPos.y = -halfH;
        if (this.targetPos.y > halfH) this.targetPos.y = halfH;
    }

    private canControl(): boolean {
        return this._gm && this._gm.state === GameState.INGAME && !this._gm.isPaused;
    }

    update(deltaTime: number) {
        if (!this.canControl()) return;

        // Buff Timers
        if (this.buffPowerTimer > 0) {
            this.buffPowerTimer -= deltaTime;
            this.updateBuffVisuals(); // Update UI/Bars every frame
            if (this.buffPowerTimer <= 0) {
                this.buffPowerTimer = 0;
                this.damageMultiplier = 1.0;
                this.updateBuffVisuals();
                console.log("[Player] Power Buff Expired");
            }
        }

        if (this.buffRapidTimer > 0) {
            this.buffRapidTimer -= deltaTime;
            this.updateBuffVisuals(); // Update UI/Bars every frame
            if (this.buffRapidTimer <= 0) {
                this.buffRapidTimer = 0;
                this.fireRateMultiplier = 1.0;
                this.updateBuffVisuals();
                console.log("[Player] Rapid Fire Buff Expired");
            }
        }

        // 1. Movement
        this.node.getPosition(this.currentPos);
        const nextX = math.lerp(this.currentPos.x, this.targetPos.x, this.lerpFactor);
        const nextY = math.lerp(this.currentPos.y, this.targetPos.y, this.lerpFactor);
        this.node.setPosition(nextX, nextY, 0);

        // Banking (3D Model Rotation)
        if (this.model3D) {
            const dx = nextX - this.currentPos.x;
            const targetRotation = -dx * 15; // Adjustment multiplier
            const currentRotation = this.model3D.eulerAngles.y;
            const nextRotation = math.lerp(currentRotation, targetRotation, 0.1);
            this.model3D.setRotationFromEuler(0, nextRotation, 0);
        }

        // 2. Physics
        const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;
        let yRatio = (this.currentPos.y + halfH) / (GAME_SETTINGS.CANVAS_HEIGHT);
        yRatio = math.clamp01(yRatio);

        let zoneMult = this.minSpeedRatio;
        switch (this.speedCurveType) {
            case 0:
                if (this.currentPos.y > 100) zoneMult = this.maxSpeedRatio;
                else if (this.currentPos.y > -100) zoneMult = (this.maxSpeedRatio + this.minSpeedRatio) / 2;
                else zoneMult = this.minSpeedRatio;
                break;
            case 1: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, yRatio); break;
            case 2: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, (1 - Math.cos(yRatio * Math.PI)) * 0.5); break;
            case 3: zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, yRatio * yRatio); break;
        }

        const targetMax = this.baseMaxSpeed * zoneMult;
        if (this.speed < targetMax) {
            this.speed += this.accel;
        } else {
            this.speed = math.lerp(this.speed, targetMax, 0.05);
        }

        // 3. Shooting: ShotRuntime(発射パターングラフ)に一任する。
        if (this._shotRuntime) {
            this._shotRuntime.tick(deltaTime, this.hp, this.maxHp);
        }

        // Manual orbit logic removed, now handled by BuffVisualEffect component
    }

    public applyBuff(type: string, duration: number, value: number) {
        if (type === "Power") {
            this.buffPowerTimer = duration;
            this.damageMultiplier = 1.0 + value;
            this.createBuffVisual("Power");
        } else if (type === "Rapid") {
            this.buffRapidTimer = duration;
            this.fireRateMultiplier = 1.0 - value;
            if (this.fireRateMultiplier < 0.1) this.fireRateMultiplier = 0.1;
            this.createBuffVisual("Rapid");
        }
        this.updateBuffVisuals();
    }

    public resetBuffs() {
        this.buffPowerTimer = 0;
        this.buffRapidTimer = 0;
        this.damageMultiplier = 1.0;
        this.fireRateMultiplier = 1.0;

        if (this.powerEffectNode) {
            this.powerEffectNode.destroy();
            this.powerEffectNode = null;
        }
        if (this.rapidEffectNode) {
            this.rapidEffectNode.destroy();
            this.rapidEffectNode = null;
        }
    }

    private createBuffVisual(type: string) {
        if (type === "Power") {
            if (!this.powerEffectNode) {
                if (this.powerBuffPrefab) {
                    // Defensive check: Ensure we are not instantiating the OptionsUI by mistake
                    if (this.powerBuffPrefab.name === "OptionsUI" || this.powerBuffPrefab.data.name === "OptionsUI") {
                        console.error("[PlayerController] OptionsUI prefab assigned to Power Buff slot! Ignoring.");
                        this.powerEffectNode = new Node("AIPowerEffect_Fallback");
                    } else {
                        this.powerEffectNode = instantiate(this.powerBuffPrefab);
                    }
                } else {
                    this.powerEffectNode = new Node("AIPowerEffect");
                    const effect = this.powerEffectNode.addComponent(BuffVisualEffect);
                    effect.starColor = new Color(255, 50, 50, 255);
                    effect.orbitRadius = 75;
                }
                this.node.addChild(this.powerEffectNode);
            }
            if (this.powerEffectNode) this.powerEffectNode.active = true;
        } else if (type === "Rapid") {
            if (!this.rapidEffectNode) {
                if (this.rapidBuffPrefab) {
                    // Defensive check
                    if (this.rapidBuffPrefab.name === "OptionsUI" || this.rapidBuffPrefab.data.name === "OptionsUI") {
                        console.error("[PlayerController] OptionsUI prefab assigned to Rapid Buff slot! Ignoring.");
                        this.rapidEffectNode = new Node("AIRapidEffect_Fallback");
                    } else {
                        this.rapidEffectNode = instantiate(this.rapidBuffPrefab);
                    }
                } else {
                    this.rapidEffectNode = new Node("AIRapidEffect");
                    const effect = this.rapidEffectNode.addComponent(BuffVisualEffect);
                    effect.starColor = new Color(0, 180, 255, 255);
                    effect.orbitRadius = 55;
                    effect.orbitSpeed = 900;
                }
                this.node.addChild(this.rapidEffectNode);
            }
            if (this.rapidEffectNode) this.rapidEffectNode.active = true;
        }
    }

    private updateBuffVisuals() {
        if (this.powerEffectNode) this.powerEffectNode.active = (this.buffPowerTimer > 0);
        if (this.rapidEffectNode) this.rapidEffectNode.active = (this.buffRapidTimer > 0);

        if (UIManager.instance) {
            UIManager.instance.updateBuffs(this.buffPowerTimer, this.buffRapidTimer);
        }
    }

    public heal(amount: number) {
        this.hp += amount;
        if (this.hp > this.maxHp) this.hp = this.maxHp;

        if (DataManager.instance) {
            DataManager.instance.setHp(this.hp);
        }

        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);
    }

    public takeDamage(amount: number) {
        if (!this.canControl()) return; // Guard for GameOver/Paused state
        if (this.invincible) return; // テスト用無敵: ダメージ処理を一切行わない
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;

        if (DataManager.instance) {
            DataManager.instance.addDamageReceived(amount);
        }

        if (this._gm && this._gm.playState) {
            this._gm.playState.damageReceived += amount;
        }

        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);

        if (this.hp <= 0) {
            this.scheduleOnce(() => {
                if (this._gm) this._gm.onGameOver();
                if (this.node && this.node.isValid) {
                    this.node.active = false;
                }
            }, 0);
        }
    }
}
