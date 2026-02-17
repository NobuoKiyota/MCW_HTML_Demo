import { _decorator, Component, Node, Vec3, Sprite, Color, BoxCollider2D, Collider2D, Contact2DType, IPhysics2DContact, find } from 'cc';
// import { GameManager } from './GameManager';
// import { PlayerController } from './PlayerController';
import { GAME_SETTINGS, IGameManager } from './Constants';

const { ccclass, property } = _decorator;

@ccclass('Item')
export class Item extends Component {

    public id: string = "";
    public amount: number = 1;
    public isMagnet: boolean = false;

    private velocity: Vec3 = new Vec3(0, -2, 0); // Fall speed
    private _tempPos: Vec3 = new Vec3();
    private speed: number = 2.0;

    // Magnet
    private magnetSpeed: number = 8.0;
    private magnetThreshold: number = 150; // Distance to start magneting (or global magnet)

    // Cache GM
    private _gm: IGameManager = null;

    onLoad() {
        const collider = this.getComponent(BoxCollider2D);
        if (collider) {
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            // Ensure sensor
            collider.sensor = true;
        }
    }

    init(id: string, amount: number, gm: IGameManager) {
        this._gm = gm;
        this.id = id;
        this.amount = amount;
        this.isMagnet = false;

        // Visual setup
        const sprite = this.getComponent(Sprite);
        if (sprite) {
            const def = GAME_SETTINGS.ECONOMY.ITEMS[id];
            if (def) {
                if (def.type === 'material') sprite.color = Color.YELLOW;
                else if (def.type === 'buff') sprite.color = Color.GREEN;
                else sprite.color = Color.CYAN;
            } else {
                if (id.includes("Item")) sprite.color = Color.YELLOW;
                else sprite.color = Color.CYAN;
            }
        }
    }

    update(dt: number) {
        const gm = this._gm;
        if (!gm || gm.state !== 4) return;

        this.node.getPosition(this._tempPos);
        const playerPos = gm.playerNode.position;

        // Magnet Logic (Simplified)
        // Check distance
        const dist = Vec3.distance(this._tempPos, playerPos);

        // Auto magnet if close or flag set (e.g. by Item Attractor)
        if (this.isMagnet || dist < this.magnetThreshold) {
            this.isMagnet = true; // Once caught, stay caught

            // Move towards player
            const dx = playerPos.x - this._tempPos.x;
            const dy = playerPos.y - this._tempPos.y;
            const angle = Math.atan2(dy, dx);

            const move = this.magnetSpeed * dt * 60;
            this._tempPos.x += Math.cos(angle) * move;
            this._tempPos.y += Math.sin(angle) * move;
        } else {
            // Just fall
            this._tempPos.y -= this.speed * dt * 60;
        }

        this.node.setPosition(this._tempPos);

        // Bounds
        if (this._tempPos.y < -GAME_SETTINGS.CANVAS_HEIGHT / 2 - 50) {
            this.node.destroy();
        }
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        let player = otherCollider.getComponent("PlayerController") as any;
        if (!player && otherCollider.node.parent) {
            player = otherCollider.node.parent.getComponent("PlayerController") as any;
        }

        if (player) {
            this.collect();
        }
    }

    collect() {
        // console.log(`[Item] Collected ${this.id} x${this.amount}`);
        if (this._gm) {
            this._gm.onItemCollected(this.id, this.amount);
        }
        this.node.destroy();
    }
}
