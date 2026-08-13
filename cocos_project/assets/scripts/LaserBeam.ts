import { _decorator, Component, Node, BoxCollider2D, Contact2DType, Collider2D, IPhysics2DContact, ParticleSystem, Size, Vec2 } from 'cc';
import { IGameManager } from './Constants';
const { ccclass, property } = _decorator;

/**
 * 自機/敵に追従し続ける持続ビーム(ShotRuntime.tsのLaserノード用)。GameManager.spawnLaserBeam()が
 * ownerNode(発射元)の子として生成し、そのまま追従させる(通常のBullet.tsのような velocity移動は
 * 一切行わない)。接触している間、damageInterval秒おきにdamageを繰り返し与え続けるDPS方式。
 * duration秒経過で自己破壊する。
 *
 * 見た目は3D ParticleSystem(Model3Dと同じ規約: "Particle"という名前の子ノードがあれば自動検出して
 * 再生開始する)を想定しているが、必須ではない(無ければ当たり判定だけの透明ビームになる)。
 */
@ccclass('LaserBeam')
export class LaserBeam extends Component {

    private damage: number = 0;
    private damageInterval: number = 0.1;
    private duration: number = 1.0;
    private isEnemy: boolean = false;
    private _gm: IGameManager = null;

    private _collider: BoxCollider2D | null = null;
    private _particle: ParticleSystem | null = null;

    // 現在接触中の相手(PlayerController or Enemyコンポーネントを持つNode)の集合。
    // BEGIN_CONTACT/END_CONTACTで出入りを管理し、tickTimerが0になるたびここへ一括ダメージを与える。
    private _touching: Set<Node> = new Set();
    private _tickTimer: number = 0;
    private _lifeTimer: number = 999; // init()で確実に上書きされる想定(Bullet.tsのlife既定値と同じ考え方)

    onLoad() {
        this._collider = this.getComponent(BoxCollider2D);
        if (this._collider) {
            this._collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this._collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
        // Model3Dと同じ規約: "Particle"という名前の子ノードがあれば自動検出する。
        const particleNode = this.node.getChildByName("Particle");
        if (particleNode) {
            this._particle = particleNode.getComponent(ParticleSystem);
        }
        if (!this._particle) {
            this._particle = this.getComponentInChildren(ParticleSystem);
        }
    }

    /**
     * GameManager.spawnLaserBeam()から生成直後に呼ばれる。length/widthでBoxCollider2Dのサイズを
     * 決める(ビームの根本がownerNodeの位置に来るよう、offsetをlength/2だけ前方にずらす - Bulletの
     * ような移動先の概念が無いので、自前で当たり判定の位置を合わせる必要がある)。
     * particleLengthScaleは、当たり判定側の座標系(length、px相当)とParticleSystemのシーン単位が
     * 一致しないため、length * particleLengthScaleをParticleのShapeModule.length(Cone形状の
     * 発生源の長さ)へ書き込むための変換係数。ShapeModule.lengthはCone形状専用のフィールドで、
     * 変更後に発生する新しいパーティクルにのみ反映される(既に飛んでいる分は変わらない) -
     * 持続ビームは発射中ずっとパーティクルを発生させ続けるので、init()時点で1回設定すれば
     * ビーム全体に反映される。Cone以外の形状やParticle未設定の場合は何もしない。
     */
    init(damage: number, damageInterval: number, duration: number, length: number, width: number, isEnemy: boolean, gm: IGameManager, particleLengthScale: number = 1.0) {
        this.damage = damage;
        this.damageInterval = Math.max(0.02, damageInterval);
        this.duration = Math.max(0.05, duration);
        this.isEnemy = isEnemy;
        this._gm = gm;

        this._tickTimer = this.damageInterval;
        this._lifeTimer = this.duration;
        this._touching.clear();

        if (this._collider) {
            this._collider.size = new Size(Math.max(0.01, width), Math.max(0.01, length));
            this._collider.offset = new Vec2(0, length / 2);
        }

        if (this._particle) {
            this._particle.node.active = true;
            if (this._particle.shapeModule) {
                this._particle.shapeModule.length = length * particleLengthScale;
            }
            this._particle.play();
        }
    }

    update(deltaTime: number) {
        if (this._gm && this._gm.isPaused) return;

        this._lifeTimer -= deltaTime;
        if (this._lifeTimer <= 0) {
            // GameManager.spawnLaserBeam()は、Enemy.onBeginContact()の「相手ノードの親に
            // PlayerControllerが付いていればPlayer本体とみなす」誤判定を避けるため、このノードを
            // ownerNodeの直接の子にせず、何もコンポーネントを持たない中間アンカーノードの子として
            // 生成している。そのアンカーごと破棄しないと、発射のたびに空ノードが自機の下に
            // 残り続けてしまう(このノード単体をdestroy()するだけでは親のアンカーは残る)。
            const parent = this.node.parent;
            if (parent && parent.isValid && parent.name === "LaserBeamAnchor") {
                parent.destroy();
            } else {
                this.node.destroy();
            }
            return;
        }

        this._tickTimer -= deltaTime;
        if (this._tickTimer <= 0) {
            this._tickTimer += this.damageInterval;
            this.applyTickDamage();
        }
    }

    private applyTickDamage() {
        if (this.damage <= 0) return;
        for (const target of this._touching) {
            if (!target || !target.isValid) continue;
            if (this.isEnemy) {
                const player = target.getComponent("PlayerController") as any;
                if (player) player.takeDamage(this.damage);
            } else {
                const enemy = target.getComponent("Enemy") as any;
                if (enemy) enemy.takeDamage(this.damage);
            }
        }
    }

    // ヒット相手のNode自体(PlayerController/Enemyコンポーネントが直接付いている方)を集合のキーにする。
    // Bullet.tsのonBeginContact()と同じく、コライダーが子ノードに付いている構成にも対応するため、
    // 親ノードのコンポーネントもフォールバックで見る。
    private resolveTargetNode(otherCollider: Collider2D): Node | null {
        const compName = this.isEnemy ? "PlayerController" : "Enemy";
        if (otherCollider.getComponent(compName)) return otherCollider.node;
        if (otherCollider.node.parent && otherCollider.node.parent.getComponent(compName)) return otherCollider.node.parent;
        return null;
    }

    onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const target = this.resolveTargetNode(otherCollider);
        if (target) this._touching.add(target);
    }

    onEndContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: IPhysics2DContact | null) {
        const target = this.resolveTargetNode(otherCollider);
        if (target) this._touching.delete(target);
    }

    onDestroy() {
        if (this._collider) {
            this._collider.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            this._collider.off(Contact2DType.END_CONTACT, this.onEndContact, this);
        }
        this._touching.clear();
    }
}
