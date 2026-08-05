import { Node, Vec3 } from 'cc';
import { IGameManager } from './Constants';
import { EnemyData, BehaviorGraph, BehaviorGraphNode } from './GameDataTypes';

// 1フレームで無限ループに陥らないための安全上限 (postmortem: 無限リトライがエディタをフリーズさせた事故の教訓)
const MAX_STEPS_PER_TICK = 64;

interface MotionState {
    pattern: string;
    angle: number;
    speed: number;
    turn: number;
}

/**
 * 3Dモデルの簡易演出(Spin/Punchノード)をランタイム側(Enemy.ts)に委譲するためのフック。
 * BehaviorRuntimeはモデルやtweenの存在を知らず、パラメータをそのまま渡すだけにする。
 */
export interface BehaviorVisualHooks {
    // duration秒かけてaxisをdegrees分(相対)回転させる。Spinノードはこの完了までシーケンスをブロックする。
    onSpin?(axis: string, degrees: number, duration: number): void;
    // axisをdegrees分(相対)一瞬傾けてすぐ戻す。ブロックしない(Fire直後などに繋いで使う想定)。
    onPunch?(axis: string, degrees: number, outDuration: number, inDuration: number): void;
}

/**
 * 敵の行動グラフ(BehaviorGraph)を解釈・実行するランタイムインタプリタ。
 *
 * 2トラックモデル:
 *  - Motion State: 直近に実行された Move ノードのパラメータを保持し、毎フレーム座標に反映され続ける。
 *  - Flow Sequence: Start から Move/Wait/Fire/Branch/Loop/Spin/Punch を逐次たどる。Move/Branch/Loop/Punchは
 *    同一フレーム内で即座に次ノードへ進み、Wait/Fire/Spinのみがそのノードの待機時間が経過するまで
 *    フレームをまたいでブロックする。
 */
export class BehaviorRuntime {

    private _gm: IGameManager;
    private _enemyNode: Node;
    private _data: EnemyData;
    private _nodeMap: Map<number, BehaviorGraphNode> = new Map();

    private _cursor: number | null = null;
    private _timerNodeId: number | null = null;
    private _timerRemaining: number = 0;
    private _loopCounters: Map<number, number> = new Map();
    private _elapsed: number = 0;

    private _motion: MotionState = { pattern: "straight", angle: 270, speed: 2.0, turn: 2.0 };
    private _visualHooks?: BehaviorVisualHooks;

    constructor(graph: BehaviorGraph | null, data: EnemyData, gm: IGameManager, enemyNode: Node, visualHooks?: BehaviorVisualHooks) {
        this._data = data;
        this._gm = gm;
        this._enemyNode = enemyNode;
        this._visualHooks = visualHooks;

        if (graph && graph.nodes) {
            for (const n of graph.nodes) {
                this._nodeMap.set(n.id, n);
            }
            const start = graph.nodes.find(n => n.type === "Start");
            this._cursor = start ? start.id : null;
        } else {
            console.warn(`[BehaviorRuntime] No graph available for enemy '${data.id}'. Falling back to default straight-down motion.`);
            this._cursor = null;
        }
    }

    /**
     * @param dt 秒単位のデルタタイム
     * @param dtScale Enemy.ts側の frameScale (dt*60) と同じ単位。移動量計算に使用
     * @param time Enemy.ts側で積算されている frameScale の累積値 (zigzagのsin計算用)
     * @param hp 現在HP (Branch条件用)
     * @param maxHp 最大HP (Branch条件用)
     * @param tempPos 更新対象の座標 (呼び出し側が事前にスクロールオフセットなどを適用済みのものを渡す)
     */
    public tick(dt: number, dtScale: number, time: number, hp: number, maxHp: number, tempPos: Vec3): void {
        this._elapsed += dt;
        this.runFlow(dt, hp, maxHp);
        this.applyMotion(dtScale, time, tempPos);
    }

    private runFlow(dt: number, hp: number, maxHp: number) {
        let steps = 0;
        while (this._cursor !== null && steps++ < MAX_STEPS_PER_TICK) {
            const node = this._nodeMap.get(this._cursor);
            if (!node) {
                this._cursor = null;
                break;
            }

            switch (node.type) {
                case "Start": {
                    this._cursor = node.next ?? null;
                    continue;
                }
                case "Move": {
                    const p = node.params || {};
                    this._motion = {
                        pattern: p.pattern ?? "straight",
                        angle: p.angle ?? 270,
                        speed: p.speed ?? 2.0,
                        turn: p.turn ?? 2.0,
                    };
                    this._cursor = node.next ?? null;
                    continue;
                }
                case "Wait": {
                    const seconds = (node.params && node.params.seconds) ?? 1.0;
                    if (this._timerNodeId !== node.id) {
                        this._timerNodeId = node.id;
                        this._timerRemaining = seconds;
                    }
                    this._timerRemaining -= dt;
                    if (this._timerRemaining <= 0) {
                        this._timerNodeId = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 待機継続、今フレームはここまで
                }
                case "Fire": {
                    // 弾のInterval(EnemyBulletData経由)を待機時間として使う。
                    // 元実装(handleFiring)の「スポーン直後は1インターバル待ってから初弾」という挙動を踏襲。
                    const interval = (this._data._bullet && this._data._bullet.interval) || 1.0;
                    if (this._timerNodeId !== node.id) {
                        this._timerNodeId = node.id;
                        this._timerRemaining = interval;
                    }
                    this._timerRemaining -= dt;
                    if (this._timerRemaining <= 0) {
                        this._timerNodeId = null;
                        this.doFire();
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 待機継続
                }
                case "Branch": {
                    const result = this.evalCondition(node.params, hp, maxHp);
                    this._cursor = (result ? node.trueNext : node.falseNext) ?? null;
                    continue;
                }
                case "Loop": {
                    const p = node.params || {};
                    const target = p.target ?? null;
                    const count = p.count ?? -1;
                    if (count === -1) {
                        this._cursor = target;
                        continue;
                    }
                    const remaining = this._loopCounters.has(node.id) ? this._loopCounters.get(node.id)! : count;
                    if (remaining > 0) {
                        this._loopCounters.set(node.id, remaining - 1);
                        this._cursor = target;
                    } else {
                        this._loopCounters.delete(node.id);
                        this._cursor = node.next ?? null;
                    }
                    continue;
                }
                case "Spin": {
                    const p = node.params || {};
                    if (this._timerNodeId !== node.id) {
                        this._timerNodeId = node.id;
                        this._timerRemaining = p.duration ?? 0.5;
                        if (this._visualHooks && this._visualHooks.onSpin) {
                            this._visualHooks.onSpin(p.axis ?? "y", p.degrees ?? 360, p.duration ?? 0.5);
                        }
                    }
                    this._timerRemaining -= dt;
                    if (this._timerRemaining <= 0) {
                        this._timerNodeId = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 回転完了まで待機継続
                }
                case "Punch": {
                    const p = node.params || {};
                    if (this._visualHooks && this._visualHooks.onPunch) {
                        this._visualHooks.onPunch(p.axis ?? "x", p.degrees ?? -30, p.outDuration ?? 0.05, p.inDuration ?? 0.12);
                    }
                    this._cursor = node.next ?? null;
                    continue; // ブロックしない、即座に次へ
                }
                default: {
                    this._cursor = node.next ?? null;
                    continue;
                }
            }
        }
    }

    private applyMotion(dtScale: number, time: number, tempPos: Vec3) {
        const spd = this._motion.speed * dtScale;
        const trn = this._motion.turn * dtScale;

        switch (this._motion.pattern) {
            case "straight": {
                const rad = (this._motion.angle ?? 270) * Math.PI / 180;
                tempPos.x += Math.cos(rad) * spd;
                tempPos.y += Math.sin(rad) * spd;
                break;
            }
            case "zigzag": {
                tempPos.y -= spd;
                tempPos.x += Math.sin(time * 0.05) * trn;
                break;
            }
            case "homing": {
                const gm = this._gm;
                if (gm && gm.playerNode) {
                    const dx = gm.playerNode.position.x - tempPos.x;
                    const dy = gm.playerNode.position.y - tempPos.y;
                    const angle = Math.atan2(dy, dx);
                    tempPos.x += Math.cos(angle) * (spd * 0.5);
                    tempPos.y += Math.sin(angle) * (spd * 0.5);
                } else {
                    tempPos.y -= spd;
                }
                break;
            }
            default: {
                tempPos.y -= spd; // 未知パターン/グラフ欠損時のフォールバック(旧デフォルト分岐と同じ)
            }
        }
    }

    private evalCondition(params: any, hp: number, maxHp: number): boolean {
        const condition = params && params.condition;
        const value = (params && params.value) ?? 0;

        switch (condition) {
            case "timeElapsedGT":
                return this._elapsed >= value;
            case "hpPercentLT": {
                const pct = maxHp > 0 ? (hp / maxHp) * 100 : 100;
                return pct < value;
            }
            case "distToPlayerLT": {
                const gm = this._gm;
                if (!gm || !gm.playerNode) return false;
                const dx = gm.playerNode.position.x - this._enemyNode.position.x;
                const dy = gm.playerNode.position.y - this._enemyNode.position.y;
                return Math.sqrt(dx * dx + dy * dy) < value;
            }
            default:
                return false;
        }
    }

    private doFire() {
        const gm = this._gm;
        if (!gm) return;
        const bullet = this._data._bullet;
        if (!bullet) return; // このEnemyDataに弾が設定されていなければ何もしない

        let angle = -Math.PI / 2;
        if (bullet.type === 1 && gm.playerNode) {
            const dx = gm.playerNode.position.x - this._enemyNode.position.x;
            const dy = gm.playerNode.position.y - this._enemyNode.position.y;
            angle = Math.atan2(dy, dx);
        }

        const speed = bullet.speed * (this._data.bulletSpeedMult || 1.0);
        const damage = bullet.damage * (this._data.bulletDmgMult || 1.0);

        gm.spawnBullet(
            this._enemyNode.position.x,
            this._enemyNode.position.y - 20,
            angle,
            speed,
            damage,
            true // isEnemy
        );
    }
}
