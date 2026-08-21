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
    curveHeading?: number; // "curve"パターン専用の現在の進行角度(度)。Move実行時にangleへ初期化
}

// MoveToノード実行中の直線/ベジェ補間状態。有効な間はapplyMotionが通常のMotion Stateより優先する。
interface MoveToState {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    duration: number;
    elapsed: number;
    interp: string;
    curveAmount: number;
}

// Randomノード(値ノード、フローに参加しない)のランタイム状態。
// mode="once"なら初回に1回だけ抽選して以後固定、"interval"ならinterval秒ごとに再抽選し続ける
// (Blueprint的な「LFOノード」に相当)。
interface RandomNodeState {
    value: number;
    timer: number;
}

/**
 * 3Dモデルの簡易演出(Spin/Punchノード)をランタイム側(Enemy.ts)に委譲するためのフック。
 * BehaviorRuntimeはモデルやtweenの存在を知らず、パラメータをそのまま渡すだけにする。
 */
export interface BehaviorVisualHooks {
    // duration秒かけてaxisをdegrees分(相対)回転させる。loop=trueならduration秒周期で無限に
    // 回転し続ける(回転し続ける演出用)。Spinノード自体はブロックしない(下記参照)。
    onSpin?(axis: string, degrees: number, duration: number, loop: boolean): void;
    // axisをdegrees分(相対)一瞬傾けてすぐ戻す。ブロックしない(Fire直後などに繋いで使う想定)。
    onPunch?(axis: string, degrees: number, outDuration: number, inDuration: number): void;
    // shotPatternId(空文字/"(none)"なら攻撃停止)を指定して、現在アクティブな発射パターン
    // (ShotRuntime)を切り替える。Attackノードから呼ばれる。ブロックしない。
    onAttack?(shotPatternId: string): void;
}

/**
 * 敵の行動グラフ(BehaviorGraph)を解釈・実行するランタイムインタプリタ。
 *
 * 2トラックモデル:
 *  - Motion State: 直近に実行された Move ノードのパラメータを保持し、毎フレーム座標に反映され続ける。
 *  - Flow Sequence: Start から Move/Wait/Branch/Loop/Spin/Punch を逐次たどる。Move/Branch/Loop/Punchは
 *    同一フレーム内で即座に次ノードへ進み、Wait/Spinのみがそのノードの待機時間が経過するまで
 *    フレームをまたいでブロックする。
 *
 * 発射(Fire)は本クラスの対象外。射撃タイミング・弾のパラメータは別途 ShotRuntime.ts
 * (ShotGraph/EnemyData.shotPatternId経由)が、このMovementの流れとは独立して並行実行する。
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
    private _moveTo: MoveToState | null = null;

    // Moveノードに到達する前(またはMoveTo同士の間)は、この座標に絶対値で固定する。
    // スクロールオフセットはEnemy.ts側で毎フレーム無条件に加算されるため、Motion Stateの
    // speedを0にするだけでは打ち消せない(MoveTo実行中と同じく、座標を直接上書きする必要がある)。
    private _holding: boolean = false;
    private _holdX: number = 0;
    private _holdY: number = 0;

    // Randomノードのランタイム状態(ノードIDごと)。フローの実行位置とは独立して、グラフ内の
    // 全Randomノードを毎tick更新する(interval経過中のノードは実行順に関わらず抽選し続ける必要があるため)。
    private _randomStates: Map<number, RandomNodeState> = new Map();

    constructor(graph: BehaviorGraph | null, data: EnemyData, gm: IGameManager, enemyNode: Node, visualHooks?: BehaviorVisualHooks) {
        this._data = data;
        this._gm = gm;
        this._enemyNode = enemyNode;
        this._visualHooks = visualHooks;

        this._holdX = enemyNode.position.x;
        this._holdY = enemyNode.position.y;

        if (graph && graph.nodes) {
            for (const n of graph.nodes) {
                this._nodeMap.set(n.id, n);
            }
            const start = graph.nodes.find(n => n.type === "Start");
            // startノード自体は見つかったが、その next が未接続(null)だと1歩も進めず即終了する
            // (=完全に沈黙する)。これを「Startノードが無い」場合と区別して警告する
            // (過去に実際、保存のたびにStart->最初のノードの配線が失われる不具合があったため)。
            if (start && start.next == null) {
                console.warn(`[BehaviorRuntime] Graph '${graph.id}': Start node exists but is NOT connected to anything (next=null). Nothing will ever fire.`);
            }
            this._cursor = start ? start.id : null;
            // 有効なグラフがある場合、Moveノードに到達するまでは出現位置に固定する
            // (グラフ全体が読み込めない異常系は、下のelse節でこれまで通り下方向へ流すフォールバックを維持する)。
            this._holding = true;
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
        this.updateRandomNodes(dt);
        this.runFlow(dt, hp, maxHp);
        this.applyMotion(dtScale, time, tempPos);
    }

    // グラフ内の全Randomノードを更新する。フローが到達しているかどうかに関わらず動かす
    // (interval抽選が「実行が通った時だけ進む」のは直感に反するため)。
    private updateRandomNodes(dt: number) {
        this._nodeMap.forEach((node, id) => {
            if (node.type !== "Random") return;
            const p = node.params || {};
            let state = this._randomStates.get(id);
            if (!state) {
                state = { value: this.rollRandom(p), timer: p.interval ?? 1.0 };
                this._randomStates.set(id, state);
                return;
            }
            if (p.mode === "interval") {
                state.timer -= dt;
                if (state.timer <= 0) {
                    state.value = this.rollRandom(p);
                    state.timer = p.interval ?? 1.0;
                }
            }
            // mode "once"(既定)は初回に抽選した値を変えない
        });
    }

    private rollRandom(params: any): number {
        const min = (params && params.min) ?? 0;
        const max = (params && params.max) ?? 1;
        return min + Math.random() * (max - min);
    }

    // Randomノードから配線された値があればそれを、無ければリテラル値(未指定ならfallback)を返す。
    // 配線は params["<key>Ref"] = 参照先RandomノードのID、という規約でエディタ側が書き出す。
    // paramsから読んだ値がエディタ側の過去のバグ等で文字列化されていた場合でも、演算がNaNに
    // 汚染されて機能が丸ごと沈黙する(例: MultiFireのwhile(remaining>0)が常にfalseになり
    // 発射が一切起きないのにエラーも出ない)のを避けるため、必ず数値化してから返す。
    // 数値化できない場合はfallbackを返す(NaNを絶対に上位へ流さない)。
    private resolveNum(params: any, key: string, fallback: number): number {
        const refId = params && params[`${key}Ref`];
        if (refId != null) {
            const state = this._randomStates.get(refId);
            if (state) return state.value;
        }
        const raw = params && params[key];
        if (raw == null) return fallback;
        const n = typeof raw === "number" ? raw : parseFloat(raw);
        return Number.isFinite(n) ? n : fallback;
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
                    const angle = this.resolveNum(p, "angle", 270);
                    const duration = this.resolveNum(p, "duration", 0);

                    this._motion = {
                        pattern: p.pattern ?? "straight",
                        angle,
                        // EnemyData.speedMultを反映する
                        speed: this.resolveNum(p, "speed", 2.0) * (this._data.speedMult || 1.0),
                        turn: this.resolveNum(p, "turn", 2.0),
                        curveHeading: angle,
                    };
                    this._moveTo = null; // Move実行時はMoveToの補間状態を打ち切って通常移動に戻す
                    this._holding = false; // 以降はMotion Stateに主導権を渡す

                    if (duration > 0) {
                        if (this._timerNodeId !== node.id) {
                            this._timerNodeId = node.id;
                            this._timerRemaining = duration;
                        }
                        this._timerRemaining -= dt;
                        if (this._timerRemaining <= 0) {
                            this._timerNodeId = null;
                            this._cursor = node.next ?? null;
                        }
                        return; // 指定時間経過するまで待機・移動維持
                    }

                    this._cursor = node.next ?? null;
                    continue;
                }
                case "MoveTo": {
                    const p = node.params || {};
                    if (this._timerNodeId !== node.id) {
                        this._timerNodeId = node.id;
                        const duration = this.resolveNum(p, "duration", 1.0);
                        this._timerRemaining = duration;

                        const gm = this._gm;
                        const fromId = p.from || "0";
                        const fromPoint = (fromId !== "0" && gm) ? gm.getMovePoint(fromId) : null;
                        const toPoint = gm ? gm.getMovePoint(p.to) : null;

                        if (!toPoint) {
                            console.warn(`[BehaviorRuntime] MoveTo: point '${p.to}' not found for enemy '${this._data.id}'. Holding position instead.`);
                            this._moveTo = null;
                        } else {
                            // fromが指定されていなければ、現在保持している座標(出現位置 or 前回の
                            // MoveTo到達点)から始める。_holdingで固定してきた座標と一致する。
                            const start = fromPoint || { x: this._holdX, y: this._holdY };
                            this._moveTo = {
                                fromX: start.x, fromY: start.y,
                                toX: toPoint.x, toY: toPoint.y,
                                duration, elapsed: 0,
                                interp: p.interp ?? "straight",
                                curveAmount: this.resolveNum(p, "curveAmount", 60),
                            };
                        }
                    }
                    if (this._moveTo) this._moveTo.elapsed += dt;
                    this._timerRemaining -= dt;
                    if (this._timerRemaining <= 0) {
                        this._timerNodeId = null;
                        if (this._moveTo) {
                            // 到達地点にホールド座標を更新しておく。直後にSpin等が続いても、
                            // 出現位置ではなくこの到達点に留まるようにするため。
                            this._holdX = this._moveTo.toX;
                            this._holdY = this._moveTo.toY;
                            this._holding = true;
                        }
                        this._moveTo = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 到達まで待機継続
                }
                case "Wait": {
                    const seconds = this.resolveNum(node.params, "seconds", 1.0);
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
                    // Punchと同じ「発火したら即座に次へ進む」非ブロッキング方式。回転の見た目は
                    // モデルのtween(Enemy.ts側)だけが担当し、座標(Motion State/MoveTo)には一切
                    // 関与しないため、後続のMove/MoveToと自然に並行実行される
                    // (例: Start→Spin→MoveToと繋げば「回転しながら移動」になる)。
                    // 「回転が終わるまで次に進みたくない」場合は、直後に同じdurationのWaitを繋ぐ。
                    const p = node.params || {};
                    if (this._visualHooks && this._visualHooks.onSpin) {
                        this._visualHooks.onSpin(p.axis ?? "y", this.resolveNum(p, "degrees", 360), this.resolveNum(p, "duration", 0.5), p.loop === true);
                    }
                    this._cursor = node.next ?? null;
                    continue;
                }
                case "Punch": {
                    const p = node.params || {};
                    if (this._visualHooks && this._visualHooks.onPunch) {
                        this._visualHooks.onPunch(p.axis ?? "x", this.resolveNum(p, "degrees", -30), this.resolveNum(p, "outDuration", 0.05), this.resolveNum(p, "inDuration", 0.12));
                    }
                    this._cursor = node.next ?? null;
                    continue; // ブロックしない、即座に次へ
                }
                case "Attack": {
                    // 現在アクティブな発射パターン(ShotRuntime)を切り替える。実際の切り替え処理は
                    // Enemyが所有するShotRuntimeの差し替えなのでBehaviorRuntimeの対象外 — フックへ
                    // 委譲するだけ。ブロックしない(即座に次へ進む)。
                    const p = node.params || {};
                    if (this._visualHooks && this._visualHooks.onAttack) {
                        this._visualHooks.onAttack(p.shotPatternId ?? "");
                    }
                    this._cursor = node.next ?? null;
                    continue;
                }
                default: {
                    this._cursor = node.next ?? null;
                    continue;
                }
            }
        }
    }

    private applyMotion(dtScale: number, time: number, tempPos: Vec3) {
        // MoveToノードの補間中は、そちらが座標を直接決める(通常のMotion Stateより優先)。
        // 到達先のEnemyMovePointは画面上の固定アンカーとして扱うため、スクロールオフセット等は
        // 考慮せず絶対座標をそのまま書き込む(呼び出し側=Enemy.tsが事前に足したスクロール分を上書きする)。
        if (this._moveTo) {
            const t = Math.min(1, this._moveTo.elapsed / Math.max(0.0001, this._moveTo.duration));
            const { fromX, fromY, toX, toY, interp, curveAmount } = this._moveTo;

            if (interp === "curve") {
                // 2次ベジェ: A→Bの中点を、進行方向に垂直な向きへcurveAmount分オフセットした点を
                // 制御点にする。符号でどちら側に膨らむか、大きさで膨らみ具合を調整できる。
                const dx = toX - fromX;
                const dy = toY - fromY;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const ctrlX = (fromX + toX) / 2 + nx * curveAmount;
                const ctrlY = (fromY + toY) / 2 + ny * curveAmount;
                const u = 1 - t;
                tempPos.x = u * u * fromX + 2 * u * t * ctrlX + t * t * toX;
                tempPos.y = u * u * fromY + 2 * u * t * ctrlY + t * t * toY;
            } else {
                tempPos.x = fromX + (toX - fromX) * t;
                tempPos.y = fromY + (toY - fromY) * t;
            }
            return;
        }

        // Moveノードにまだ到達していない(または直前のMoveToの到達点で待機中の)間は、その座標に
        // 絶対値で固定する。Enemy.ts側でスクロールオフセットが無条件に加算されているため、
        // Motion Stateのspeedを0にするだけでは打ち消せず、MoveToと同じく座標を直接上書きする必要がある。
        if (this._holding) {
            tempPos.x = this._holdX;
            tempPos.y = this._holdY;
            return;
        }

        const spd = this._motion.speed * dtScale;
        const trn = this._motion.turn * dtScale;

        switch (this._motion.pattern) {
            case "straight": {
                const rad = (this._motion.angle ?? 270) * Math.PI / 180;
                tempPos.x += Math.cos(rad) * spd;
                tempPos.y += Math.sin(rad) * spd;
                break;
            }
            case "curve": {
                // turnを「度/秒」の旋回速度として扱い、進行角度を毎フレーム連続的に変化させながら進む。
                if (this._motion.curveHeading == null) this._motion.curveHeading = this._motion.angle ?? 270;
                this._motion.curveHeading += this._motion.turn * (dtScale / 60);
                const rad = this._motion.curveHeading * Math.PI / 180;
                tempPos.x += Math.cos(rad) * spd;
                tempPos.y += Math.sin(rad) * spd;
                break;
            }
            case "zigzag": {
                const rad = (this._motion.angle ?? 270) * Math.PI / 180;
                const perpRad = rad + Math.PI / 2;
                tempPos.x += Math.cos(rad) * spd + Math.cos(perpRad) * Math.sin(time * 0.1) * trn;
                tempPos.y += Math.sin(rad) * spd + Math.sin(perpRad) * Math.sin(time * 0.1) * trn;
                break;
            }
            case "homing": {
                const gm = this._gm;
                if (gm && gm.playerNode) {
                    const px = gm.playerNode.position.x;
                    const py = gm.playerNode.position.y;
                    const targetAngle = Math.atan2(py - tempPos.y, px - tempPos.x) * 180 / Math.PI;
                    if (this._motion.curveHeading == null) this._motion.curveHeading = this._motion.angle ?? 270;

                    let diff = (targetAngle - this._motion.curveHeading) % 360;
                    if (diff > 180) diff -= 360;
                    if (diff < -180) diff += 360;

                    const maxTurn = (this._motion.turn > 0 ? this._motion.turn : 2.0) * (dtScale / 60) * 60;
                    const step = Math.max(-maxTurn, Math.min(maxTurn, diff));
                    this._motion.curveHeading += step;
                    const rad = this._motion.curveHeading * Math.PI / 180;
                    tempPos.x += Math.cos(rad) * spd;
                    tempPos.y += Math.sin(rad) * spd;
                } else {
                    const rad = (this._motion.angle ?? 270) * Math.PI / 180;
                    tempPos.x += Math.cos(rad) * spd;
                    tempPos.y += Math.sin(rad) * spd;
                }
                break;
            }
            default: {
                tempPos.y -= spd; // 未知パターン/グラフ欠損時のフォールバック
            }
        }
    }

    // Branchノードの評価。logic="AND"/"OR"が指定されていればcondition2/value2も評価して結合する
    // (未指定/"none"なら従来通りcondition/valueのみの単一条件)。
    private evalCondition(params: any, hp: number, maxHp: number): boolean {
        const result1 = this.evalSingleCondition(params && params.condition, (params && params.value) ?? 0, hp, maxHp);

        const logic = params && params.logic;
        if (logic !== "AND" && logic !== "OR") return result1;

        const result2 = this.evalSingleCondition(params && params.condition2, (params && params.value2) ?? 0, hp, maxHp);
        return logic === "AND" ? (result1 && result2) : (result1 || result2);
    }

    private evalSingleCondition(condition: string, value: number, hp: number, maxHp: number): boolean {
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
            case "random":
                // valueはTrue側に進む確率(%, 0-100)。このBranchノードを通過するたびに毎回抽選する。
                return Math.random() * 100 < value;
            default:
                return false;
        }
    }
}
