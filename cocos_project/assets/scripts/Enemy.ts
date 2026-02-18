import { _decorator, Component, Node, Vec3, math, Sprite, Color, director, find } from 'cc';
// import { GameManager } from './GameManager'; // Circular Dependency
import { GAME_SETTINGS, IGameManager } from './Constants';
import { SoundManager } from './SoundManager';
const { ccclass, property } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {

    public data: any = null;

    // Runtime Stats (No Inspector)
    public hp: number = 10;
    public maxHp: number = 10;
    public speed: number = 2;
    public turn: number = 2;
    public mpId: string = "MPID001";

    private time: number = 0;
    private cooldown: number = 0;

    private _startPos: Vec3 = new Vec3();
    private _tempPos: Vec3 = new Vec3();

    // Cache GM
    private _gm: IGameManager = null;

    // Shooting Params (Runtime)
    public canShoot: boolean = false;
    public fireInterval: number = 1.0;
    public bulletSpeed: number = 5;
    public bulletDamage: number = 10;
    public bulletType: number = 0;

    onLoad() {
        console.log(`[Enemy] onLoad: ${this.node.uuid}`);
    }

    start() {
        console.log(`[Enemy] start: ${this.node.uuid} HP:${this.hp}`);
        if (this.hp <= 0) console.warn(`[Enemy] Started with HP <= 0!`);
    }

    init(data: any, gm: IGameManager) {
        this._gm = gm;
        this.data = data;
        console.log(`[Enemy] init: ${this.node.uuid} DataHP:${data.hp}`);

        // Basic Stats
        this.hp = data.hp || 10;
        this.maxHp = data.hp || 10;

        // 1. Behavior
        if (data._behavior) {
            const b = data._behavior;
            this.mpId = b.logicId;
            this.speed = b.baseSpeed * (data.speedMult || 1.0);
            this.turn = b.baseTurn;
        } else {
            // Fallback (Safe default)
            this.speed = (data.speed || 2) * (data.speedMult || 1.0);
            this.turn = data.turnSpeed || 2;
            this.mpId = data.mpId || "MPID001";
        }

        // 2. Combat (EnemyBullet)
        if (data._bullet) {
            this.canShoot = true;
            const eb = data._bullet;
            this.bulletType = eb.type;
            this.fireInterval = eb.interval;
            this.bulletSpeed = eb.speed * (data.bulletSpeedMult || 1.0);
            this.bulletDamage = eb.damage * (data.bulletDmgMult || 1.0);
        } else {
            // No bullet data = No shooting
            this.canShoot = false;
        }

        this.node.getPosition(this._startPos);
    }

    update(dt: number) {
        const gm = this._gm;
        if (!gm || gm.state !== 4 || gm.isPaused) return; // 4 = INGAME

        // Time processing
        this.cooldown -= dt; // Seconds

        if (dt > 0.1) dt = 0.1;
        const frameScale = dt * 60;
        this.time += frameScale;

        this.handleMovement(frameScale);
        this.handleFiring(); // Remove dtScale arg

        // Bounds
        this.node.getPosition(this._tempPos);
        const limit = -GAME_SETTINGS.CANVAS_HEIGHT / 2 - 100;
        if (this._tempPos.y < limit) {
            this.node.destroy();
        }
    }

    handleMovement(dtScale: number) {
        const pid = this.mpId;
        const t = this.time;
        const spd = this.speed * dtScale;
        const trn = this.turn * dtScale;

        this.node.getPosition(this._tempPos);

        // Apply Scroll Speed (Relative Velocity)
        const gm = this._gm;
        if (gm && gm.speedManager) {
            // Player Speed 6.0 = 6 pixels/frame approx?
            // Need to match units. gm.currentScrollSpeed is derived from Player.speed
            this._tempPos.y -= gm.speedManager.getCurrentSpeed() * dtScale;
        }

        // Basic Directions
        if (pid === 'MPID001') { // Down
            this._tempPos.y -= spd;
        }
        else if (pid === 'MPID002') { // Up
            this._tempPos.y += spd;
        }
        else if (pid === 'MPID003') { // Right->Left
            this._tempPos.x -= spd;
        }
        else if (pid === 'MPID004') { // Left->Right
            this._tempPos.x += spd;
        }
        else if (pid === 'MPID005' || pid === 'MPID006') { // ZigZag
            this._tempPos.y -= spd;
            this._tempPos.x += Math.sin(t * 0.05) * trn;
        }
        else if (pid.startsWith('MPID009')) { // Homing
            const gm = this._gm;
            if (gm && gm.playerNode) {
                const playerPos = gm.playerNode.position;
                const dx = playerPos.x - this._tempPos.x;
                const dy = playerPos.y - this._tempPos.y;
                const angle = Math.atan2(dy, dx);
                this._tempPos.x += Math.cos(angle) * (spd * 0.5);
                this._tempPos.y += Math.sin(angle) * (spd * 0.5);
            }
        }
        else {
            this._tempPos.y -= spd; // Default
        }

        this.node.setPosition(this._tempPos);
    }

    handleFiring() {
        if (!this.canShoot) return;

        if (this.cooldown > 0) return;

        const gm = this._gm;
        if (gm) {
            let angle = -Math.PI / 2;

            if (this.bulletType === 1 && gm.playerNode) {
                const dx = gm.playerNode.position.x - this.node.position.x;
                const dy = gm.playerNode.position.y - this.node.position.y;
                angle = Math.atan2(dy, dx);
            }

            gm.spawnBullet(
                this.node.position.x,
                this.node.position.y - 20,
                angle,
                this.bulletSpeed,
                this.bulletDamage,
                true // isEnemy
            );
        }

        this.cooldown = this.fireInterval;
    }

    public takeDamage(amount: number) {
        // console.log(`[Enemy] takeDamage: ${this.node.uuid} Amount:${amount} HP:${this.hp}`);
        // Defense Calculation
        let finalDamage = amount;
        if (this.data && this.data.defense) {
            finalDamage = Math.max(1, amount - this.data.defense);
        }

        this.hp -= finalDamage;

        // Flash Effect
        this.flash();

        const isKill = this.hp <= 0;
        if (isKill) console.log(`[Enemy] KILLED: ${this.node.uuid}`);

        // ... rest of logic
        // Spawn Damage Text
        if (this._gm) {
            this._gm.spawnDamageText(this.node.position.x, this.node.position.y, finalDamage, isKill);
        }

        // Play Hit SE (3D)
        SoundManager.instance.play3dSE("sounds/SE/hit", this.node.worldPosition, "Enemy");

        if (isKill) {
            this.scheduleOnce(() => {
                this.die();
            }, 0);
        }
    }

    // --- Flash Effect (Simple Color Tint) ---
    private _sprite: Sprite | null = null;
    private _defaultColor: Color = new Color(255, 255, 255, 255);
    private _isFlashing: boolean = false;

    private flash() {
        if (this._isFlashing) return;

        if (!this._sprite) {
            this._sprite = this.getComponent(Sprite);
        }
        if (!this._sprite) return;

        // Save default color
        // Note: We need to copy the value, not the reference.
        this._defaultColor.set(this._sprite.color);

        this._isFlashing = true;

        // Flash Yellow (Requested)
        // Note: Multiplicative tint. If sprite is white, it becomes yellow.
        this._sprite.color = new Color(255, 255, 0, 255);

        this.scheduleOnce(() => {
            if (this.node.isValid && this._sprite) {
                // Restore
                this._sprite.color = this._defaultColor;
            }
            this._isFlashing = false;
        }, 0.1);
    }


    die() {
        console.log(`[Enemy] die called: ${this.node.uuid}`);
        const gm = this._gm;
        if (gm) {
            let dropped = false;

            // 1. Modular Drop System (CSV Linked)
            if (this.data && this.data._drops && this.data._drops.length > 0) {
                for (const drop of this.data._drops) {
                    // Check Rate
                    if (Math.random() <= drop.rate) {
                        gm.spawnItem(this.node.position.x, this.node.position.y, drop.itemId, drop.min);
                        dropped = true;
                    }
                }
            }
            // 2. Inspector Loot Table (Prefab based)
            else if (this.data && this.data.lootTable && this.data.lootTable.length > 0) {
                for (const item of this.data.lootTable) {
                    if (Math.random() <= item.dropRate) {
                        if (gm.spawnItemFromPrefab) {
                            gm.spawnItemFromPrefab(item.itemPrefab, this.node.position.x, this.node.position.y);
                            dropped = true;
                        }
                    }
                }
            }

            // 3. New Simple Drop (If no drop table linked)
            if (!dropped) {
                // Future: Maybe simple random drop logic if needed, or nothing.
                // For now, clean up legacy hardcoded drops.
            }

            // Play Explosion SE (3D)
            gm.spawnExplosion(this.node.worldPosition.x, this.node.worldPosition.y);
            SoundManager.instance.play3dSE("sounds/SE/explosion", this.node.worldPosition, "Enemy");
        }
        this.node.destroy();
    }
}
