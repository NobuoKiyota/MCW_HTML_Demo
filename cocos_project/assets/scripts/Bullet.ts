import { _decorator, Component, Node, Vec3, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, Sprite, Color, find } from 'cc';
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

    // Cache GM
    private _gm: IGameManager = null;

    onLoad() {
        const collider = this.getComponent(BoxCollider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
        }
    }

    // Init method called by GameManager or Shooter
    init(x: number, y: number, angle: number, speed: number, damage: number, isEnemy: boolean, gm: IGameManager) {
        this._gm = gm;
        console.log(`[Bullet] init: x=${x}, y=${y}, angle=${angle}, speed=${speed}`);
        this.node.setPosition(x, y, 0);
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.isEnemy = isEnemy;
        this.life = 3.0; // Seconds

        // Set Velocity
        this.velocity.x = Math.cos(angle) * speed;
        this.velocity.y = Math.sin(angle) * speed;

        // Visual Rotation 
        this.node.angle = (angle * 180 / Math.PI) - 90;

        // Color differentiation
        const sprite = this.getComponent(Sprite);
        if (sprite) {
            sprite.color = isEnemy ? new Color(255, 100, 100) : new Color(100, 255, 100);
        }
    }

    update(deltaTime: number) {
        // Need to check GameState? 
        // We can check if GameManager node has state, OR just move always if Bullet exists.
        // To avoid finding GM every frame, let's assume Bullets pause only if timeScale is 0, which Cocos handles.
        // IF we really need valid game state:
        // const gm = find("GameManager").getComponent("GameManager") as any as IGameManager;
        // if (gm && gm.state !== 4) return;

        // Ensure paused if needed. For now, strict check might be heavy. 
        // Let's rely on TimeScale or GM pausing the Director/Scene.

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
