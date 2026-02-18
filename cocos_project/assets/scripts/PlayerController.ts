import { _decorator, Component, Node, Input, input, EventTouch, Vec3, view, math, UITransform, find, Enum, Prefab, instantiate, Color } from 'cc';
import { DataManager } from './DataManager';
import { GAME_SETTINGS, IGameManager, GameState } from './Constants';
import { UIManager } from './UIManager';
import { BuffVisualEffect } from './BuffVisualEffect';
import { SoundManager } from './SoundManager';

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

    // Bullet Params
    @property({ tooltip: "Player Bullet Speed" })
    public bulletSpeed: number = 7;

    @property({ tooltip: "Player Bullet Damage" })
    public bulletDamage: number = 10;

    @property({ tooltip: "Fire Interval (seconds)" })
    public fireInterval: number = 0.15;

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

    @property({ tooltip: "Debug: Use Homing Missiles" })
    public useHoming: boolean = false;

    public hp: number = 100;

    private targetPos: Vec3 = new Vec3();
    private currentPos: Vec3 = new Vec3();

    // Shooting
    private fireTimer: number = 0;

    // Cache GM
    private _gm: IGameManager = null;

    // Buff State
    public damageMultiplier: number = 1.0;
    public fireRateMultiplier: number = 1.0;
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

        // Init UI
        if (UIManager.instance) {
            UIManager.instance.updateHP(this.hp, this.maxHp);
        }
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
        const parentTransform = this.node.parent?.getComponent(UITransform);
        if (parentTransform) {
            const localPos = parentTransform.convertToNodeSpaceAR(new Vec3(uiLoc.x, uiLoc.y, 0));
            this.targetPos.set(localPos);
            this.clampTarget();
        } else {
            const halfW = GAME_SETTINGS.CANVAS_WIDTH / 2;
            const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;
            this.targetPos.x = uiLoc.x - halfW;
            this.targetPos.y = uiLoc.y - halfH;
            this.clampTarget();
        }
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

        // 3. Shooting
        this.fireTimer += deltaTime;
        let actualInterval = this.fireInterval * this.fireRateMultiplier;
        if (actualInterval < 0.05) actualInterval = 0.05;

        if (this.fireTimer >= actualInterval) {
            this.fireTimer = 0;
            this.fire();
        }

        // Manual orbit logic removed, now handled by BuffVisualEffect component
    }

    private findNearestEnemy(): Node {
        if (!this._gm || !this._gm.enemyLayer) return null;

        let nearest: Node = null;
        let minRateDist = Number.MAX_VALUE;
        const myPos = this.node.position;

        for (const enemy of this._gm.enemyLayer.children) {
            if (!enemy.isValid) continue;

            // Simple distance check
            const dx = enemy.position.x - myPos.x;
            const dy = enemy.position.y - myPos.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < minRateDist) {
                minRateDist = distSq;
                nearest = enemy;
            }
        }
        return nearest;
    }

    private fire() {
        const gm = this._gm;
        if (gm) {
            const angle = Math.PI / 2;
            const finalDamage = Math.floor(this.bulletDamage * this.damageMultiplier);

            const bullet = gm.spawnBullet(this.node.position.x, this.node.position.y + 20, angle, this.bulletSpeed, finalDamage, false);

            if (bullet && this.useHoming) {
                const target = this.findNearestEnemy();
                if (target) {
                    bullet.isHoming = true;
                    bullet.target = target;
                    // console.log(`[Player] Fired Homing Missile at ${target.uuid}`);
                }
            }

            // Play Shoot SE (3D)
            SoundManager.instance.play3dSE("sounds/SE/shoot", this.node.worldPosition, "Player");
        }
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
        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);
    }

    public takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
        if (UIManager.instance) UIManager.instance.updateHP(this.hp, this.maxHp);
        if (this.hp <= 0) {
            if (this._gm) this._gm.onGameOver();
            this.node.active = false;
        }
    }
}
