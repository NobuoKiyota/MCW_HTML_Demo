import { Node, Color, Vec3 } from 'cc';
import { IGameManager } from './Constants';
import { ShotGraph, ShotGraphNode } from './GameDataTypes';
import { SoundManager } from './SoundManager';

// 1フレームで無限ループに陥らないための安全上限 (BehaviorRuntime.tsと同じ理由、postmortem由来)
const MAX_STEPS_PER_TICK = 64;

// Randomノード(値ノード、フローに参加しない)のランタイム状態。BehaviorRuntime.tsと同じ規約。
interface RandomNodeState {
    value: number;
    timer: number;
}

// MultiFireノードが発射中(staggerDelay>0で複数発をブロックしながら撃っている間)の状態。
interface MultiFireState {
    remaining: number; // 残り発射数
    timer: number;     // 次弾までの残り秒数
}

/**
 * ショットグラフ(ShotGraph)を解釈・実行するランタイムインタプリタ。
 * BehaviorRuntime.tsと同じ設計(カーソル逐次実行/タイマーノード追跡/Loopカウンタ/Random値配線)を
 * 持つが、Motion State(自分自身の移動)の概念はなく、弾を生成するだけの単純なフローになる。
 * コードはBehaviorRuntime.tsとあえて共有せず複製する(稼働実績のあるBehaviorRuntime.tsに手を
 * 入れるリスクを避けるため。過度な抽象化より多少の重複を許容する、というこのプロジェクトの方針)。
 *
 * Start/Wait/Branch/Loop/Random/Reroute/Commentは、Behavior Pattern Editor側の
 * LiteGraphノードクラス(behavior/*)をそのままShot Patternエディタでも流用する
 * (ウィジェットのみで実行ロジックを持たないため、意味は完全に共通)。
 */
export class ShotRuntime {

    private _gm: IGameManager;
    private _ownerNode: Node;
    private _isEnemy: boolean;
    private _nodeMap: Map<number, ShotGraphNode> = new Map();

    private _cursor: number | null = null;
    private _timerNodeId: number | null = null;
    private _timerRemaining: number = 0;
    private _loopCounters: Map<number, number> = new Map();
    private _multiFireState: MultiFireState | null = null;
    private _elapsed: number = 0;

    private _randomStates: Map<number, RandomNodeState> = new Map();

    // Rapid/Powerバフ等、撃ち手側の倍率をShotRuntimeに知らせるためのフック。
    // ShotRuntime自体はプレイヤー/エネミーどちらの概念も知らず、この関数経由で値を取得するだけにする。
    public getSpeedMult: () => number = () => 1.0;
    public getDamageMult: () => number = () => 1.0;
    public getIntervalMult: () => number = () => 1.0;

    constructor(graph: ShotGraph | null, gm: IGameManager, ownerNode: Node, isEnemy: boolean) {
        this._gm = gm;
        this._ownerNode = ownerNode;
        this._isEnemy = isEnemy;

        if (graph && graph.nodes) {
            for (const n of graph.nodes) {
                this._nodeMap.set(n.id, n);
            }
            const start = graph.nodes.find(n => n.type === "Start");
            // startノード自体は見つかったが、その next が未接続(null)だと1歩も進めず即終了する
            // (=完全に沈黙する)。これを「Startノードが無い」場合と区別して警告する
            // (過去に実際、保存のたびにStart->最初のノードの配線が失われる不具合があったため)。
            if (start && start.next == null) {
                console.warn(`[ShotRuntime] Graph '${graph.id}': Start node exists but is NOT connected to anything (next=null). Nothing will ever fire.`);
            }
            this._cursor = start ? start.id : null;
            console.log(`[ShotRuntime] Constructed for '${graph.id}' (isEnemy=${isEnemy}, ${graph.nodes.length} nodes). Start cursor: ${this._cursor}`);
            if (this._cursor === null) {
                console.warn(`[ShotRuntime] Graph '${graph.id}' has no Start node - this ShotRuntime will never fire.`);
            }
        } else {
            this._cursor = null;
            console.warn('[ShotRuntime] Constructed with no graph (null) - this ShotRuntime will never fire.');
        }
    }

    /**
     * @param dt 秒単位のデルタタイム
     * @param hp 撃ち手の現在HP (Branch条件用)
     * @param maxHp 撃ち手の最大HP (Branch条件用)
     */
    public tick(dt: number, hp: number, maxHp: number): void {
        this._elapsed += dt;
        this.updateRandomNodes(dt);
        this.runFlow(dt, hp, maxHp);
    }

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
        });
    }

    private rollRandom(params: any): number {
        const min = (params && params.min) ?? 0;
        const max = (params && params.max) ?? 1;
        return min + Math.random() * (max - min);
    }

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
                case "Fire": {
                    this.doFire(node.params || {});
                    this._cursor = node.next ?? null;
                    continue;
                }
                case "MultiFire": {
                    const p = node.params || {};
                    const count = Math.max(1, Math.round(this.resolveNum(p, "count", 1)));
                    const staggerDelay = this.resolveNum(p, "staggerDelay", 0);

                    if (!this._multiFireState) {
                        this._multiFireState = { remaining: count, timer: 0 };
                    }

                    // staggerDelay<=0なら同時発射(拡散弾): 1tick内でcount発すべて撃ち切る。
                    if (staggerDelay <= 0) {
                        while (this._multiFireState.remaining > 0) {
                            this.doMultiFirePellet(p, count, this._multiFireState.remaining);
                            this._multiFireState.remaining--;
                        }
                        this._multiFireState = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }

                    // staggerDelay>0(連射): MoveToと同じ要領で、1発ごとに時間を消費してブロックする。
                    if (this._multiFireState.timer <= 0) {
                        this.doMultiFirePellet(p, count, this._multiFireState.remaining);
                        this._multiFireState.remaining--;
                        this._multiFireState.timer = staggerDelay;
                    } else {
                        this._multiFireState.timer -= dt;
                    }

                    if (this._multiFireState.remaining <= 0) {
                        this._multiFireState = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 残弾を撃ち切るまで待機継続
                }
                case "Missile": {
                    this.doMissile(node.params || {});
                    this._cursor = node.next ?? null;
                    continue;
                }
                case "Wait": {
                    const seconds = this.resolveNum(node.params, "seconds", 1.0) * this.getIntervalMult();
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
                    return;
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
                default: {
                    // Random/Reroute/Commentはフローを消費しない値/装飾ノードなので、ここに来ることは
                    // 通常無い(RandomはaddInput経由でのみ参照され、Rerouteは常にnextを持つ)。
                    // 万一未知のtypeが来ても安全にnextへ抜ける。
                    this._cursor = node.next ?? null;
                    continue;
                }
            }
        }
    }

    // Branchノードの評価。BehaviorRuntime.tsのevalCondition/evalSingleConditionと同じロジック。
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
                const dx = gm.playerNode.position.x - this._ownerNode.position.x;
                const dy = gm.playerNode.position.y - this._ownerNode.position.y;
                return Math.sqrt(dx * dx + dy * dy) < value;
            }
            case "random":
                return Math.random() * 100 < value;
            default:
                return false;
        }
    }

    // aim=atPlayerなら自機方向、それ以外はangle(度、0=右,90=上,180=左,270=下)をそのまま使う。
    private resolveAimAngleDeg(p: any, fallbackAngle: number): number {
        if (p.aim === "atPlayer") {
            const gm = this._gm;
            if (gm && gm.playerNode) {
                const dx = gm.playerNode.position.x - this._ownerNode.position.x;
                const dy = gm.playerNode.position.y - this._ownerNode.position.y;
                return Math.atan2(dy, dx) * 180 / Math.PI;
            }
        }
        return this.resolveNum(p, "angle", fallbackAngle);
    }

    // "#rrggbb"形式のcolorパラメータをcc.Colorへ変換する。空/不正な形式ならnull(=既定色のまま)。
    private parseHexColor(hex: any): Color | null {
        if (typeof hex !== "string" || hex.length === 0) return null;
        const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        return new Color((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 255);
    }

    // Fire/MultiFire/Missile共通: 発射直後のbulletにcolor/glowIntensity/scaleパラメータを適用する。
    // いずれも未指定ならBullet.ts側の既定(isEnemyベースの色、強度1.0、等倍)のまま変化しない。
    private applyVisualParams(bullet: any, p: any) {
        if (!bullet || typeof bullet.applyVisualOverride !== "function") return;
        const color = this.parseHexColor(p && p.color);
        const hasGlow = p && p.glowIntensity != null;
        const glowIntensity = hasGlow ? this.resolveNum(p, "glowIntensity", 1.0) : null;
        const hasScale = p && p.scale != null;
        const scale = hasScale ? this.resolveNum(p, "scale", 1.0) : null;
        if (color || glowIntensity != null || scale != null) {
            bullet.applyVisualOverride(color, glowIntensity, scale);
        }
    }

    // Fire/MultiFire/Missile共通: soundId(ShotManagerのSound列、Sounds.csvのID)が設定されていれば
    // 発射位置で3D再生する。未設定(空文字)なら何もしない(既定は無音、既存パターンへの影響なし)。
    private playFireSound(p: any, worldPos: Vec3) {
        if (!p || !p.soundId) return;
        const group = this._isEnemy ? "Enemy" : "Player";
        SoundManager.instance.play3dSE(p.soundId, worldPos, group);
    }

    private doFire(p: any) {
        const gm = this._gm;
        if (!gm) {
            console.warn('[ShotRuntime] doFire: _gm is null, cannot spawn bullet.');
            return;
        }

        const angleDeg = this.resolveAimAngleDeg(p, this._isEnemy ? 270 : 90);
        const angleRad = angleDeg * Math.PI / 180;
        const speed = this.resolveNum(p, "speed", 5.0) * this.getSpeedMult();
        const damage = this.resolveNum(p, "damage", 10) * this.getDamageMult();
        const pierceCount = this.resolveNum(p, "pierceCount", 0);

        const bullet = gm.spawnBullet(
            this._ownerNode.position.x,
            this._ownerNode.position.y,
            angleRad,
            speed,
            damage,
            this._isEnemy,
            p.prefabName
        );
        if (bullet) {
            bullet.pierceRemaining = pierceCount;
            this.applyVisualParams(bullet, p);
            this.playFireSound(p, this._ownerNode.position);
            console.log(`[ShotRuntime] Fire OK: pos=(${this._ownerNode.position.x.toFixed(0)},${this._ownerNode.position.y.toFixed(0)}) angle=${angleDeg.toFixed(0)}deg speed=${speed.toFixed(2)} damage=${damage.toFixed(1)} isEnemy=${this._isEnemy}`);
        } else {
            console.warn('[ShotRuntime] Fire FAILED: gm.spawnBullet() returned null (check GameManager.bulletPrefab is assigned).');
        }
    }

    // MultiFireの1発分。indexInBurst(残数)をangleSpreadに割り振って扇状に広げる。
    private doMultiFirePellet(p: any, totalCount: number, remaining: number) {
        const gm = this._gm;
        if (!gm) return;

        const centerDeg = this.resolveAimAngleDeg(p, this._isEnemy ? 270 : 90);
        const angleSpread = this.resolveNum(p, "angleSpread", 0);
        const pelletIndex = totalCount - remaining; // 0-based, 発射順
        // count=1ならspreadは無関係に中心角のみ。count>1ならcenterDegを中心に均等配置する。
        const t = totalCount > 1 ? (pelletIndex / (totalCount - 1)) - 0.5 : 0;
        const angleDeg = centerDeg + t * angleSpread;
        const angleRad = angleDeg * Math.PI / 180;

        const speed = this.resolveNum(p, "speed", 5.0) * this.getSpeedMult();
        const damage = this.resolveNum(p, "damage", 10) * this.getDamageMult();
        const pierceCount = this.resolveNum(p, "pierceCount", 0);

        const bullet = gm.spawnBullet(
            this._ownerNode.position.x,
            this._ownerNode.position.y,
            angleRad,
            speed,
            damage,
            this._isEnemy,
            p.prefabName
        );
        if (bullet) {
            bullet.pierceRemaining = pierceCount;
            this.applyVisualParams(bullet, p);
            this.playFireSound(p, this._ownerNode.position);
            console.log(`[ShotRuntime] MultiFire pellet ${pelletIndex + 1}/${totalCount} OK: angle=${angleDeg.toFixed(0)}deg speed=${speed.toFixed(2)} damage=${damage.toFixed(1)}`);
        } else {
            console.warn('[ShotRuntime] MultiFire pellet FAILED: gm.spawnBullet() returned null.');
        }
    }

    private doMissile(p: any) {
        const gm = this._gm;
        if (!gm) return;

        const angleDeg = this.resolveNum(p, "angle", this._isEnemy ? 270 : 90);
        const angleRad = angleDeg * Math.PI / 180;
        const speed = this.resolveNum(p, "speed", 3.0) * this.getSpeedMult();
        const damage = this.resolveNum(p, "damage", 15) * this.getDamageMult();
        const pierceCount = this.resolveNum(p, "pierceCount", 0);

        const bullet = gm.spawnBullet(
            this._ownerNode.position.x,
            this._ownerNode.position.y,
            angleRad,
            speed,
            damage,
            this._isEnemy,
            p.prefabName
        );
        if (!bullet) {
            console.warn('[ShotRuntime] Missile FAILED: gm.spawnBullet() returned null.');
            return;
        }
        bullet.pierceRemaining = pierceCount;
        this.applyVisualParams(bullet, p);
        this.playFireSound(p, this._ownerNode.position);
        console.log(`[ShotRuntime] Missile OK: angle=${angleDeg.toFixed(0)}deg speed=${speed.toFixed(2)} damage=${damage.toFixed(1)} homing=${p.homing === true}`);

        if (p.homing === true) {
            // 自機発射なら最寄りの敵、敵発射なら自機をターゲットにする。
            const target = this._isEnemy ? gm.playerNode : gm.findNearestEnemyTo(this._ownerNode.position.x, this._ownerNode.position.y);
            if (target) {
                bullet.isHoming = true;
                bullet.target = target;
                bullet.steerForce = this.resolveNum(p, "turnRate", 0.1);
            }
        }
    }
}
