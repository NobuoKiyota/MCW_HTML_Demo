import { _decorator, Component, Node, Input, input, EventTouch, Vec3, view, math, UITransform, find, Enum } from 'cc';
import { DataManager } from './DataManager';
import { GAME_SETTINGS, IGameManager, GameState } from './Constants';
// import { GameManager } from './GameManager'; // Cycle
import { UIManager } from './UIManager';

const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    @property({ tooltip: "Current Speed (Read Only)" })
    public speed: number = 0;

    // ... (Stats properties omitted for brevity, they remain unchanged) ...

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

    public hp: number = 100;

    private targetPos: Vec3 = new Vec3();
    private currentPos: Vec3 = new Vec3();

    // Shooting
    private fireTimer: number = 0;

    // Cache GM
    private _gm: IGameManager = null;

    public setup(gm: IGameManager) {
        this._gm = gm;
    }

    start() {
        // Initialize Input
        // Mouse for Desktop
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        // input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this); // Unused
        // input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);     // Unused

        // Touch for Mobile (Fallbacks)
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        // input.on(Input.EventType.TOUCH_START, this.onTouchStart, this); // Unused
        // input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);     // Unused

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
        // Convert UI World Space to Node Local Space (Parent)
        const parentTransform = this.node.parent?.getComponent(UITransform);
        if (parentTransform) {
            const localPos = parentTransform.convertToNodeSpaceAR(new Vec3(uiLoc.x, uiLoc.y, 0));
            this.targetPos.set(localPos);
            this.clampTarget();
        } else {
            // Fallback
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

    // Helper to check state
    private canControl(): boolean {
        return this._gm && this._gm.state === GameState.INGAME;
    }

    update(deltaTime: number) {
        if (!this.canControl()) return;

        // --- 1. Movement (X/Y) ---
        // Smooth Movement (Lerp) to Mouse Pointer
        this.node.getPosition(this.currentPos);
        const nextX = math.lerp(this.currentPos.x, this.targetPos.x, this.lerpFactor);
        const nextY = math.lerp(this.currentPos.y, this.targetPos.y, this.lerpFactor);
        this.node.setPosition(nextX, nextY, 0);

        // --- 2. Forward Speed Physics (Z-axis concept) ---
        // Calculate Zone Multiplier based on Y Position
        // Map Y (-Height/2 to +Height/2) to 0.0 - 1.0
        const halfH = GAME_SETTINGS.CANVAS_HEIGHT / 2;
        // Clamp Y to safe range
        let yRatio = (this.currentPos.y + halfH) / (GAME_SETTINGS.CANVAS_HEIGHT);
        yRatio = math.clamp01(yRatio);

        let zoneMult = this.minSpeedRatio;

        switch (this.speedCurveType) {
            case 0: // STEP (Original)
                if (this.currentPos.y > 100) zoneMult = this.maxSpeedRatio;
                else if (this.currentPos.y > -100) zoneMult = (this.maxSpeedRatio + this.minSpeedRatio) / 2; // Mid
                else zoneMult = this.minSpeedRatio;
                break;
            case 1: // LINEAR
                zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, yRatio);
                break;
            case 2: // SMOOTH (Sine EaseInOut)
                // -cos(t*PI) + 1 / 2 logic or SmoothStep
                const t = yRatio * Math.PI;
                const smoothT = (1 - Math.cos(t)) * 0.5; // EaseInOut
                zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, smoothT);
                break;
            case 3: // EXP (Exponential - Sharp Top)
                const expT = yRatio * yRatio; // Quadratic
                zoneMult = math.lerp(this.minSpeedRatio, this.maxSpeedRatio, expT);
                break;
        }

        const targetMax = this.baseMaxSpeed * zoneMult;

        // Auto-Accelerate Logic (Always seek targetMax)
        if (this.speed < targetMax) {
            this.speed += this.accel;
        } else {
            // Natural deceleration if we entered a slower zone (Top -> Bot)
            // Use friction to slow down to new targetMax
            this.speed = math.lerp(this.speed, targetMax, 0.05); // Smooth brake
        }

        // --- 3. Shooting Logic ---
        this.fireTimer += deltaTime;
        if (this.fireTimer >= this.fireInterval) {
            this.fireTimer = 0;
            this.fire();
        }
    }

    private fire() {
        const gm = this._gm;
        if (gm) {
            const angle = Math.PI / 2; // Up
            gm.spawnBullet(
                this.currentPos.x,
                this.currentPos.y + 20,
                angle,
                this.bulletSpeed,
                this.bulletDamage,
                false
            );
        }
    }

    public heal(amount: number) {
        this.hp += amount;
        if (this.hp > this.maxHp) this.hp = this.maxHp;

        console.log(`[Player] Healed: ${amount}. HP: ${this.hp}/${this.maxHp}`);

        if (UIManager.instance) {
            UIManager.instance.updateHP(this.hp, this.maxHp);
        }
    }

    public takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;

        console.log(`[Player] Taken damage: ${amount}. HP: ${this.hp}/${this.maxHp}`);

        if (UIManager.instance) {
            UIManager.instance.updateHP(this.hp, this.maxHp);
        }

        if (this.hp <= 0) {
            const gm = this._gm;
            if (gm) gm.onGameOver();
            console.log("Game Over");
            this.node.active = false; // Hide player
        }
    }
}
