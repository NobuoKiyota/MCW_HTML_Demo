import { _decorator, Component, Node, Vec3, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, Sprite, Color, find, ParticleSystem2D } from 'cc';
// import { Enemy } from './Enemy'; // Cycle
// import { PlayerController } from './PlayerController'; // Cycle
// import { GameManager } from './GameManager'; // Cycle
import { GAME_SETTINGS, IGameManager } from './Constants';
const { ccclass, property } = _decorator;

@ccclass('Bullet')
export class Bullet extends Component {

    public isEnemy: boolean = false;
    public damage: number = 10;

    private speed: number = 0;
    private angle: number = 0;
    private life: number = 0;

    private velocity: Vec3 = new Vec3();
    private _tempPos: Vec3 = new Vec3();

    // Homing
    public isHoming: boolean = false;
    public target: Node = null;
    public steerForce: number = 0.1; // Radians per frame approx

    // Cache GM
    private _gm: IGameManager = null;

    @property(ParticleSystem2D)
    public particleEffect: ParticleSystem2D = null;

    onLoad() {
        const collider = this.getComponent(BoxCollider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    // Init method called by GameManager or Shooter
    init(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, gm: IGameManager) {
        this._gm = gm;
        // console.log(`[Bullet] init: x=${x}, y=${y}, angle=${angle}, speed=${speed}`); // Reduce spam
        this.node.setPosition(x, y, 0);
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.life = 3.0; // Seconds

        // Reset Homing
        this.isHoming = false;
        this.target = null;

        // Set Velocity
        this.velocity.x = Math.cos(angle) * speed;
        this.velocity.y = Math.sin(angle) * speed;

        // Visual Rotation 
        this.node.angle = (angle * 180 / Math.PI) - 90;

        // Color differentiation
        const sprite = this.getComponent(Sprite);
        let bulletColor = isEnemy ? new Color(255, 100, 100) : new Color(100, 255, 100);

        if (sprite) {
            sprite.color = bulletColor;
        }

        // Sync Particle Color
        if (!this.particleEffect) this.particleEffect = this.getComponentInChildren(ParticleSystem2D);
        if (this.particleEffect) {
            this.particleEffect.startColor = bulletColor.clone();
            this.particleEffect.resetSystem();
        }
    }

    update(deltaTime: number) {
        if (this._gm && this._gm.isPaused) return;

        // Homing Logic
        if (this.isHoming && this.target && this.target.isValid) {
            const tPos = this.target.position;
            const cPos = this.node.position;

            const dx = tPos.x - cPos.x;
            const dy = tPos.y - cPos.y;

            let desiredAngle = Math.atan2(dy, dx);

            // Steer current angle towards desired angle
            // Simple approach: rotate velocity vector
            let currentAngle = Math.atan2(this.velocity.y, this.velocity.x);

            // Normalize angles
            while (desiredAngle - currentAngle > Math.PI) desiredAngle -= Math.PI * 2;
            while (desiredAngle - currentAngle < -Math.PI) desiredAngle += Math.PI * 2;

            // Steer
            const maxSteer = this.steerForce;
            if (desiredAngle > currentAngle) {
                currentAngle += Math.min(maxSteer, desiredAngle - currentAngle);
            } else {
                currentAngle -= Math.min(maxSteer, currentAngle - desiredAngle);
            }

            // Update Velocity
            this.velocity.x = Math.cos(currentAngle) * this.speed;
            this.velocity.y = Math.sin(currentAngle) * this.speed;

            // Update Visual Angle
            this.node.angle = (currentAngle * 180 / Math.PI) - 90;
        }

        // Move
        this.node.getPosition(this._tempPos);

        const moveScale = deltaTime * 60;

        this._tempPos.x += this.velocity.x * moveScale;
        this._tempPos.y += this.velocity.y * moveScale;

        // Apply Scroll Speed (Only for Enemy Bullets/Objects)
        // Player bullets should travel independent of scroll speed (Arcade Style)
        if (this.isEnemy && this._gm && this._gm.speedManager) {
            this._tempPos.y -= this._gm.speedManager.getCurrentSpeed() * moveScale;
        }

        this.node.setPosition(this._tempPos);

        // Life
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.node.destroy();
        }

        // Bounds Check (Simple)
        const margin = 50;
        if (this._tempPos.x < -GAME_SETTINGS.CANVAS_WIDTH / 2 - margin ||
            this._tempPos.x > GAME_SETTINGS.CANVAS_WIDTH / 2 + margin ||
            this._tempPos.y < -GAME_SETTINGS.CANVAS_HEIGHT / 2 - margin ||
            this._tempPos.y > GAME_SETTINGS.CANVAS_HEIGHT / 2 + margin) {
            this.node.destroy();
        }
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        if (this.isEnemy) {
            // Check Hit Player
            let player = otherCollider.getComponent("PlayerController") as any;
            if (!player && otherCollider.node.parent) {
                player = otherCollider.node.parent.getComponent("PlayerController") as any;
            }

            if (player) {
                player.takeDamage(this.damage);
                this.node.destroy();
            }
        } else {
            // Check Hit Enemy
            const enemy = otherCollider.getComponent("Enemy") as any;
            if (enemy) {
                enemy.takeDamage(this.damage);
                this.node.destroy();
            }
        }
    }
}
