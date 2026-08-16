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

// PMissileノードが発射中(LRLRL…の順に1発ずつブロックしながら撃っている間)の状態。
// MultiFireStateと同型だが、PMissileは常に(staggerDelay<=0でも)ブロック式で発射する
// (同時発射は仕様上サポートしない)ため別のstateとして持つ。
interface PMissileState {
    remaining: number;
    timer: number;
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
    private _pMissileState: PMissileState | null = null;
    // Laserノードが発射中(持続ビームのduration秒間、フローをブロックしている間)の残り秒数。
    // 生成はnullから遷移する最初の1回だけ行う(以後はカウントダウンのみ)。
    private _laserRemaining: number | null = null;
    // GameManager.laserPrefabsReadyがまだfalse(resources.loadDir("Prefabs/Lasers", ...)の非同期
    // ロード中)にLaserノードへ到達すると、doLaser()が1回失敗して二度と生成されない
    // (SweapBlade等、durationが非常に長い/Wait→Loopで戻ってこない「常駐コンパニオン型」パターンだと
    // その1回の失敗がそのままそのプレイ全体で武器が沈黙し続けることを意味してしまう)。
    // 失敗時はここで0.1秒おきにリトライし、LASER_MAX_RETRY回(=約3秒)を超えたら諦める
    // (postmortem由来: 他singletonの準備待ちリトライは必ず上限を設ける)。
    private static readonly LASER_MAX_RETRY = 30;
    private _laserRetryTimer: number = 0;
    private _laserRetryCount: number = 0;
    private _elapsed: number = 0;

    private _randomStates: Map<number, RandomNodeState> = new Map();

    // Rapid/Powerバフ等、撃ち手側の倍率をShotRuntimeに知らせるためのフック。
    // ShotRuntime自体はプレイヤー/エネミーどちらの概念も知らず、この関数経由で値を取得するだけにする。
    public getSpeedMult: () => number = () => 1.0;
    public getDamageMult: () => number = () => 1.0;
    public getIntervalMult: () => number = () => 1.0;
    // Weapons.csvのScaleMin/Max(Lv別成長カーブ、WeaponCalc.computeWeaponLevelStats()参照)を
    // ShotGraphの見た目に反映するためのフック。PlayerControllerがこのShotRuntime構築時に、
    // このパターンに対応する武器の現在Lvでの実Scale値を返す関数をセットする(既定1.0=無補正、
    // 武器システム未連動のEnemy/旧パターンには一切影響しない)。
    public getScaleMult: () => number = () => 1.0;

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
                case "PMissile": {
                    const p = node.params || {};
                    const count = Math.max(1, Math.round(this.resolveNum(p, "count", 5)));
                    const staggerDelay = Math.max(0.01, this.resolveNum(p, "staggerDelay", 0.15));

                    if (!this._pMissileState) {
                        this._pMissileState = { remaining: count, timer: 0 };
                    }

                    // MultiFireと違い同時発射オプションは無い(常にLRLRL…の順で1発ずつブロック発射)。
                    if (this._pMissileState.timer <= 0) {
                        this.doPMissilePellet(p, count, this._pMissileState.remaining);
                        this._pMissileState.remaining--;
                        this._pMissileState.timer = staggerDelay;
                    } else {
                        this._pMissileState.timer -= dt;
                    }

                    if (this._pMissileState.remaining <= 0) {
                        this._pMissileState = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // 残弾を撃ち切るまで待機継続
                }
                case "Laser": {
                    const p = node.params || {};
                    const duration = Math.max(0.05, this.resolveNum(p, "duration", 1.0));

                    if (this._laserRemaining == null) {
                        // 最初の1回だけビームを生成する(以後は自分の寿命が尽きるまで自機に追従して
                        // 光り続けるので、ここでは何度も生成しない)。
                        if (this._laserRetryTimer > 0) {
                            this._laserRetryTimer -= dt;
                            return; // GameManager.laserPrefabsReady待ちでリトライ中
                        }
                        const spawned = this.doLaser(p);
                        if (!spawned) {
                            this._laserRetryCount++;
                            if (this._laserRetryCount > ShotRuntime.LASER_MAX_RETRY) {
                                console.error(`[ShotRuntime] Laser node ${node.id}: spawnLaserBeam() failed ${ShotRuntime.LASER_MAX_RETRY} times in a row. Giving up - this weapon will not fire.`);
                                this._laserRetryCount = 0;
                                this._cursor = node.next ?? null;
                                continue;
                            }
                            this._laserRetryTimer = 0.1;
                            return; // 0.1秒後に再試行
                        }
                        this._laserRetryCount = 0;
                        this._laserRemaining = duration;
                    }

                    this._laserRemaining -= dt;
                    if (this._laserRemaining <= 0) {
                        this._laserRemaining = null;
                        this._cursor = node.next ?? null;
                        continue;
                    }
                    return; // duration秒経過までフローをブロックする(連続で撃ち直さないようにするため)
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
        // 武器のLv別Scale成長(Weapons.csv ScaleMin/Max、WeaponCalc.computeWeaponLevelStats())を
        // 反映する倍率。PlayerControllerが未設定なら常に1.0(無補正)なので、武器システムと連動して
        // いないEnemyパターン等には一切影響しない。
        const scaleMult = this.getScaleMult();
        const color = this.parseHexColor(p && p.color);
        const hasGlow = p && p.glowIntensity != null;
        const glowIntensity = hasGlow ? this.resolveNum(p, "glowIntensity", 1.0) : null;
        const hasScale = p && p.scale != null;
        const baseScale = hasScale ? this.resolveNum(p, "scale", 1.0) : 1.0;
        // scaleパラメータ自体が未指定でも、getScaleMult()が1.0以外(=Lvアップで大きくなる武器)なら
        // その分だけは反映する必要があるので、どちらか一方でも該当すればapplyVisualOverride()を呼ぶ。
        const scale = (hasScale || scaleMult !== 1.0) ? baseScale * scaleMult : null;
        if (color || glowIntensity != null || scale != null) {
            bullet.applyVisualOverride(color, glowIntensity, scale);
        }
        // 時間経過でスケールが拡大していく弾(WideBeam等の拡散リング用)。growScale未指定/0以下なら
        // 何もしない(既存のFire/MultiFire/Missileパターンには一切影響しない)。
        // growScaleX/Yを個別指定すれば横幅だけ大きく広げる等の非均一な拡大も可能(未指定ならgrowScaleを両軸に使う)。
        // scaleMultは開始・目標どちらにも掛けるので、Lvが上がるほどリング全体が丸ごと大きくなる。
        if (p && p.growScale != null && typeof bullet.applyGrowth === "function") {
            const growScale = this.resolveNum(p, "growScale", 1.0);
            const growScaleX = (p.growScaleX != null ? this.resolveNum(p, "growScaleX", growScale) : growScale) * scaleMult;
            const growScaleY = (p.growScaleY != null ? this.resolveNum(p, "growScaleY", growScale) : growScale) * scaleMult;
            // growDuration未指定(0以下)なら寿命(duration)ぴったりで拡大しきる従来通りの挙動。
            // 寿命より短い値を指定すると、寿命自体は変えずに拡大だけ先に完了させ、残り時間は
            // 最大サイズのまま留まる(durを変えずに拡がる速度だけ上げたい場合用)。
            const growDuration = this.resolveNum(p, "growDuration", 0);
            if (growScale > 0) bullet.applyGrowth(growScaleX, growScaleY, growDuration);
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
            // duration未指定(0以下)なら既定の3秒寿命のまま(既存Fireパターンへの影響なし)。
            // グラフエディタ側もdurationの既定値を0(=未指定扱い)としているため、0はここで弾く。
            // growScaleの拡大タイムラインを寿命そのものと一致させたいパターンだけ明示的に指定する。
            const duration = this.resolveNum(p, "duration", 0);
            if (duration > 0 && typeof bullet.setLifeSeconds === "function") {
                bullet.setLifeSeconds(duration);
            }
            // spinSpeed未指定(0)なら回転なし(既存Fireパターンへの影響なし)。ShockWave等、
            // その場に留まるリングをZ軸回転させ続けたいパターンだけ明示的に指定する。
            const spinSpeed = this.resolveNum(p, "spinSpeed", 0);
            if (spinSpeed !== 0 && typeof bullet.applySpin === "function") {
                bullet.applySpin(spinSpeed);
            }
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

    // PMissileの1発分。indexInBurst(残数)を見て左(lm)/右(rm)を交互に振り分け(0番目=左から開始、
    // LRLRL…の順)、自機中心からsideOffset分だけ横にずらした位置から発射する。Bullet.applyArc()に
    // 2次関数の係数一式を渡し、その後の直進速度/ホーミング可否もここで確定させる
    // (ホーミング先はMissileノードと同じく発射時に1回だけ解決し、アーク終了時までBullet側で保持する)。
    private doPMissilePellet(p: any, totalCount: number, remaining: number) {
        const gm = this._gm;
        if (!gm) return;

        const pelletIndex = totalCount - remaining; // 0-based、発射順
        const side = (pelletIndex % 2 === 0) ? -1 : 1; // 偶数番目(0,2,4...)=左(lm)、奇数番目=右(rm)

        const baseAngleDeg = this.resolveAimAngleDeg(p, this._isEnemy ? 270 : 90);
        const baseAngleRad = baseAngleDeg * Math.PI / 180;
        // 進行方向を基準に「左(-X)」を指す単位ベクトル。side=-1(L)でこの向きにそのまま、
        // side=+1(R)で反転(=右)させる(Bullet.applyArc()側の_arcLateralAxisと符号を揃えること)。
        const lateralAxisX = Math.sin(baseAngleRad);
        const lateralAxisY = -Math.cos(baseAngleRad);
        const sideOffset = this.resolveNum(p, "sideOffset", 15);
        const spawnX = this._ownerNode.position.x + lateralAxisX * sideOffset * side;
        const spawnY = this._ownerNode.position.y + lateralAxisY * sideOffset * side;

        const speed = this.resolveNum(p, "speed", 3.0) * this.getSpeedMult();
        const damage = this.resolveNum(p, "damage", 15) * this.getDamageMult();
        const pierceCount = this.resolveNum(p, "pierceCount", 0);

        const bullet = gm.spawnBullet(spawnX, spawnY, baseAngleRad, speed, damage, this._isEnemy, p.prefabName);
        if (!bullet) {
            console.warn('[ShotRuntime] PMissile pellet FAILED: gm.spawnBullet() returned null.');
            return;
        }
        bullet.pierceRemaining = pierceCount;
        this.applyVisualParams(bullet, p);
        this.playFireSound(p, this._ownerNode.position);

        const isHomingRequested = p.homing === true;
        let homingTarget: any = null;
        if (isHomingRequested) {
            homingTarget = this._isEnemy ? gm.playerNode : gm.findNearestEnemyTo(spawnX, spawnY);
        }

        if (typeof bullet.applyArc === "function") {
            const coeffA = this.resolveNum(p, "arcCoeffA", 3);
            const coeffB = this.resolveNum(p, "arcCoeffB", -4); // 負値=後方に膨らんでから前進(L/Rで符号は変えない、左右対称)
            const coeffC = this.resolveNum(p, "arcCoeffC", -2);
            const xRange = this.resolveNum(p, "arcXRange", 2);
            const worldScale = this.resolveNum(p, "arcWorldScale", 10);
            const arcDuration = Math.max(0.05, this.resolveNum(p, "arcDuration", 0.5));
            const turnRate = this.resolveNum(p, "turnRate", 0.1);
            bullet.applyArc(coeffA, coeffB, coeffC, xRange, worldScale, arcDuration, side, speed, isHomingRequested, homingTarget, turnRate);
        }

        console.log(`[ShotRuntime] PMissile pellet ${pelletIndex + 1}/${totalCount} OK: side=${side < 0 ? 'L' : 'R'} spawn=(${spawnX.toFixed(0)},${spawnY.toFixed(0)}) speed=${speed.toFixed(2)} damage=${damage.toFixed(1)} homing=${isHomingRequested}`);
    }

    // Laserノードから(GameManager.laserPrefabsReady待ちのリトライを含め)呼ばれる。戻り値は
    // 1枚でも生成に成功したか(呼び出し元がリトライすべきかどうかの判定に使う)。
    // 以後はGameManager.spawnLaserBeam()が生成したLaserBeamコンポーネント自身がduration秒間、
    // 自機に追従しながら接触判定・DPSダメージを管理する。LaserBeamはBullet.tsの
    // applyVisualOverride/applyGrowthに相当する仕組みを持たないため、color/glowIntensity/scale等は
    // ここでは適用しない(見た目はParticleSystem側で作る想定)。
    private doLaser(p: any): boolean {
        const gm = this._gm;
        if (!gm) return false;

        const angleDeg = this.resolveAimAngleDeg(p, this._isEnemy ? 270 : 90);
        const angleRad = angleDeg * Math.PI / 180;
        const damage = this.resolveNum(p, "damage", 10) * this.getDamageMult();
        const damageInterval = this.resolveNum(p, "damageInterval", 0.1);
        const duration = Math.max(0.05, this.resolveNum(p, "duration", 1.0));
        const length = this.resolveNum(p, "length", 300);
        const width = this.resolveNum(p, "width", 20);
        const particleLengthScale = this.resolveNum(p, "particleLengthScale", 1.0);
        const fadeOutDuration = this.resolveNum(p, "fadeOutDuration", 0.5);
        // orbitRadius>0ならSweapBlade等のCircle系武器として、ownerNode中心にorbitCount枚を均等配置
        // しつつ周回させる(既定0=従来通りの固定ビーム1本、orbitCountもこの時は無視)。
        const orbitRadius = this.resolveNum(p, "orbitRadius", 0);
        const orbitSpeed = this.resolveNum(p, "orbitSpeed", 0);
        const orbitCount = orbitRadius > 0 ? Math.max(1, Math.round(this.resolveNum(p, "orbitCount", 1))) : 1;
        // 周回の中心をownerNodeのローカル座標からずらすオフセット(既定0,0)。ownerNodeの見た目
        // (3Dモデル等)が論理位置とズレている場合に、Player側を直さずここだけで見た目を合わせたい時用。
        const orbitOffsetX = this.resolveNum(p, "orbitOffsetX", 0);
        const orbitOffsetY = this.resolveNum(p, "orbitOffsetY", 0);
        // Model3D(あれば)のRotationX自転速度(秒間回転数、既定1.0)。Model3Dが無いprefabでは無視される。
        const modelSpinRate = this.resolveNum(p, "modelSpinRate", 1.0);
        // damageIntervalおきに実際にダメージが入った瞬間だけ鳴らすヒット音(Sounds.csvのID)。
        // soundId(発射音、playFireSound()参照)とは別物、空文字なら鳴らさない。
        const hitSoundId: string = (p && typeof p.hitSoundId === "string") ? p.hitSoundId : "";

        let spawnedCount = 0;
        for (let i = 0; i < orbitCount; i++) {
            const orbitStartAngle = orbitRadius > 0 ? (360 / orbitCount) * i : 0;
            const beam = gm.spawnLaserBeam({
                ownerNode: this._ownerNode, angle: angleRad, damage, damageInterval, duration, length, width,
                isEnemy: this._isEnemy, prefabName: p.prefabName, particleLengthScale, fadeOutDuration,
                orbitRadius, orbitSpeed, orbitStartAngle, modelSpinRate, orbitOffsetX, orbitOffsetY, hitSoundId,
            });
            if (beam) spawnedCount++;
        }

        if (spawnedCount > 0) {
            this.playFireSound(p, this._ownerNode.position);
            console.log(`[ShotRuntime] Laser OK: count=${spawnedCount}/${orbitCount} angle=${angleDeg.toFixed(0)}deg damage=${damage.toFixed(1)} interval=${damageInterval.toFixed(2)}s duration=${duration.toFixed(2)}s length=${length} width=${width}${orbitRadius > 0 ? ` orbitRadius=${orbitRadius} orbitSpeed=${orbitSpeed}` : ''}`);
            return true;
        } else {
            console.warn('[ShotRuntime] Laser FAILED: gm.spawnLaserBeam() returned null (will retry if laserPrefabs are still loading).');
            return false;
        }
    }
}
