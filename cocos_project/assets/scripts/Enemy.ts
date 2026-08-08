import { _decorator, Component, Node, Vec3, math, Sprite, Color, director, find, Layers, Prefab, resources, instantiate, tween } from 'cc';
// import { GameManager } from './GameManager'; // Circular Dependency
import { GAME_SETTINGS, IGameManager, GameState } from './Constants';
import { SoundManager } from './SoundManager';
import { DataManager } from './DataManager';
import { BehaviorRuntime, BehaviorVisualHooks } from './BehaviorRuntime';
import { ShotRuntime } from './ShotRuntime';
import { GameDatabase } from './GameDatabase';
const { ccclass, property } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {

    public data: any = null;

    // Runtime Stats (No Inspector)
    public hp: number = 10;
    public maxHp: number = 10;

    @property({ tooltip: "テスト用: trueの間は被弾してもダメージ・死亡処理を一切行わない" })
    public invincible: boolean = false;

    private time: number = 0;

    private _startPos: Vec3 = new Vec3();
    private _tempPos: Vec3 = new Vec3();

    // Cache GM
    private _gm: IGameManager = null;

    // 行動グラフ(BehaviorGraph)のランタイム実行エンジン。移動のみを担当する。
    private _behaviorRuntime: BehaviorRuntime | null = null;

    // 発射パターングラフ(ShotGraph)のランタイム実行エンジン。移動とは独立して並行実行する
    // (2トラック方式: 動きながら撃つ、を移動グラフ側に埋め込まずに表現できるようにするため)。
    private _shotRuntime: ShotRuntime | null = null;

    // PlayerController.model3D と同じパターン: 2Dの当たり判定ノードに3Dモデルを子として取り付ける (任意)
    public model3D: Node = null;

    @property({ type: Prefab, tooltip: "3DモデルのPrefab(glTFインポート時に自動生成されるサブアセット)をここに直接ドラッグ&ドロップで設定できます。設定した場合、CSVのModel3DPathより優先されます。" })
    public model3DPrefab: Prefab = null;

    @property({ tooltip: "3Dモデルの初期Y軸回転(度)。model3DPrefabをドラッグ設定した場合のみ使用(CSV経由の場合はModel3DYRot列を使用)。モデルの向きが逆な場合に180などを指定。" })
    public model3DPrefabYRot: number = 0;

    @property({ tooltip: "3Dモデルのスケール(一律倍率)。GLBのエクスポート単位とゲーム内スケールが合わない場合にここで調整する。model3DPrefab/CSV経由どちらにも適用される。" })
    public model3DScale: number = 1.0;

    @property({ tooltip: "敵Prefabノード全体に対する一律スケール倍率(x, y, z等倍率)。インスペクターで設定可能。" })
    public enemyScale: number = 1.0;

    @property({ tooltip: "ONの間、横移動によるバンク(左右への傾き)の代わりに常時自機の方向を向く。モデルの正面軸によっては下のOffsetで調整が必要。" })
    public faceTowardPlayer: boolean = false;

    @property({ tooltip: "faceTowardPlayer使用時の追加Y回転オフセット(度)。モデルが自機と違う方向を向く場合に90/180/-90などで調整する。" })
    public faceTowardPlayerOffset: number = 0;

    // 3Dモデルの「素の」向き(埋め込み/生成直後に記録)。バンキング/注視/Spin/Punchはこれを基準に加算する。
    private _model3DBaseRot: Vec3 = new Vec3();
    private _model3DYaw: number = 0;
    // BehaviorGraphのSpin/Punchノードが加える相対回転オフセット (x/y/z度)。
    // tweenでこのプレーンオブジェクトの値を動かし、毎フレームベース角度に合成する。
    private _animOffset = { x: 0, y: 0, z: 0 };
    // 軸ごとに現在再生中のtweenを覚えておく。Tween.stopAllByTargetは_animOffset全体を対象に
    // 止めてしまう(=他の軸で再生中のSpin/Punchまで巻き込んで止まる)ため、X/Y/Z同時に別々の
    // Spin/Punchを走らせたい場合は「新しく始める軸と同じ軸のtweenだけ」を止める必要がある。
    private _axisTweens: { x: any; y: any; z: any } = { x: null, y: null, z: null };

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

        // Node Scale (Uniform x, y, z)
        const scaleVal = (data && data.scale !== undefined && data.scale !== null && !isNaN(Number(data.scale))) ? Number(data.scale) : this.enemyScale;
        this.node.setScale(scaleVal, scaleVal, scaleVal);

        // Behavior(移動): BehaviorGraph(ノードグラフ)ランタイムに一任する。
        const graph = data._behavior ? data._behavior._graph : null;
        const visualHooks: BehaviorVisualHooks = {
            onSpin: (axis, degrees, duration, loop) => this.playSpin(axis, degrees, duration, loop),
            onPunch: (axis, degrees, outDuration, inDuration) => this.playPunch(axis, degrees, outDuration, inDuration),
            onAttack: (shotPatternId) => this.setActiveShotPattern(shotPatternId),
        };
        this._behaviorRuntime = new BehaviorRuntime(graph, data, gm, this.node, visualHooks);

        // Shot(発射): ShotGraphが設定されていれば、移動とは独立したもう1つのランタイムとして
        // 並行実行する。未設定(shotPatternIdが空/該当パターン無し)の敵は単に発射しない。
        const shotGraph = data._shotPattern ? data._shotPattern._graph : null;
        if (shotGraph) {
            this._shotRuntime = new ShotRuntime(shotGraph, gm, this.node, true);
        } else if (data.shotPatternId) {
            // ShotPatternIDは指定されているのに_graphが無い = GameDatabaseでIDが見つからないか、
            // グラフJSONの非同期ロードがinit()の時点でまだ終わっていない(タイミング競合)。
            console.warn(`[Enemy] init: shotPatternId='${data.shotPatternId}' was set for ${data.id} but no graph was resolved (_shotPattern=${data._shotPattern ? "found" : "null"}). This enemy will not fire.`);
        } else {
            console.log(`[Enemy] init: ${data.id} has no shotPatternId set (ShotPatterns.csv). It will only fire if a Behavior Attack node sets one.`);
        }

        this.attachModel3D(data);

        this.node.getPosition(this._startPos);
    }

    /**
     * 3Dモデル(glTF由来)を子ノードとして取り付ける。優先順位はPlayerController/GameManagerの
     * PlayerShip3D埋め込みパターンと同じ:
     *   1. プレハブ側に既に"Model3D"という名前の子ノードが埋め込まれていればそれをそのまま使う
     *      (Prefab編集画面でも見た目・位置・スケールをその場で確認しながら調整できる)
     *   2. model3DPrefab (Inspectorでドラッグ設定、実行時にinstantiateして子ノード化)
     *   3. EnemyData.model3DPath (CSV経由、resources.loadで非同期ロード)
     * いずれの経路でも、当たり判定・行動ロジックは既存の2Dノード(Sprite/Collider2D)のまま維持し、
     * 見た目だけを3Dモデルに置き換える。GameManager.forceUILayer() は既にinit()より前に呼ばれ終えて
     * いるため、ここで追加/発見する子ノードはUI_2Dに巻き込まれず、明示的にDEFAULTレイヤーへ設定する。
     *
     * 注意: この処理は init() 経由でのみ実行される。つまりCocos EditorでPrefabを開いて編集している
     * だけの状態(Playを押していない状態)では実行されない。埋め込み済みの子ノード(方式1)であれば
     * Prefab編集画面でもその場で見えるが、model3DPrefab/CSV(方式2,3)は実際にゲームを再生して
     * スポーンさせるまで画面に現れない。
     */
    private attachModel3D(data: any) {
        const existing = this.node.getChildByName("Model3D");
        if (existing) {
            existing.layer = Layers.BitMask.DEFAULT;
            this.model3D = existing;
            this.finalizeModel3D();
            console.log(`[Enemy] Reused embedded Model3D child node for ${data.id}.`);
            return;
        }

        if (this.model3DPrefab) {
            this.instantiateModel3D(this.model3DPrefab, this.model3DPrefabYRot || 0);
            return;
        }

        if (!data.model3DPath) return;

        resources.load(data.model3DPath, Prefab, (err, prefab) => {
            if (err || !prefab) {
                console.warn(`[Enemy] Failed to load 3D model '${data.model3DPath}' for ${data.id}:`, err);
                return;
            }
            if (!this.node || !this.node.isValid) return; // 読み込み完了前に敵が破棄された場合のガード
            this.instantiateModel3D(prefab, data.model3DYRot || 0);
        });
    }

    private instantiateModel3D(prefab: Prefab, yRot: number) {
        const modelNode = instantiate(prefab);
        modelNode.name = "Model3D";
        modelNode.layer = Layers.BitMask.DEFAULT;
        this.node.addChild(modelNode);
        modelNode.setPosition(0, 0, 0);
        modelNode.setRotationFromEuler(0, yRot, 0);
        const s = this.model3DScale || 1.0;
        modelNode.setScale(s, s, s);
        this.model3D = modelNode;

        this.finalizeModel3D();
    }

    // 3Dモデル取り付け後の共通処理: 平面Spriteを隠し、素の向きをバンキング/注視/攻撃パンチの基準として記録する。
    private finalizeModel3D() {
        this.hideFlatSprite();
        if (this.model3D) {
            this._model3DBaseRot = this.model3D.eulerAngles.clone();
            this._model3DYaw = this._model3DBaseRot.y;
        }
    }

    // 平面Spriteは3Dモデルの下に隠す(二重表示防止)。当たり判定(Collider2D)のサイズ計算に
    // 使われるUITransformは維持したいので、Spriteの削除ではなく透明化で対応する
    // (Playerの3Dモデル対応時と同じ理由・同じ手法)。
    private hideFlatSprite() {
        const sprite = this.getComponent(Sprite);
        if (sprite) sprite.color = new Color(255, 255, 255, 0);
    }

    update(dt: number) {
        const gm = this._gm;
        if (!gm || gm.state !== GameState.INGAME || gm.isPaused) return;

        if (dt > 0.1) dt = 0.1;
        const frameScale = dt * 60;
        this.time += frameScale;

        this.handleMovement(dt, frameScale);

        if (this._shotRuntime) {
            this._shotRuntime.tick(dt, this.hp, this.maxHp);
        }

        // Bounds
        this.node.getPosition(this._tempPos);
        const limit = -GAME_SETTINGS.CANVAS_HEIGHT / 2 - 100;
        if (this._tempPos.y < limit) {
            this.node.destroy();
        }
    }

    handleMovement(dt: number, dtScale: number) {
        this.node.getPosition(this._tempPos);
        const oldX = this._tempPos.x;

        // Apply Scroll Speed (Relative Velocity)
        const gm = this._gm;
        if (gm && gm.speedManager) {
            // Player Speed 6.0 = 6 pixels/frame approx?
            // Need to match units. gm.currentScrollSpeed is derived from Player.speed
            this._tempPos.y -= gm.speedManager.getCurrentSpeed() * dtScale;
        }

        // 行動グラフに沿った移動(Move系ノードのパターン)は BehaviorRuntime に一任する。
        // _tempPos はスクロールオフセット適用後の座標。
        if (this._behaviorRuntime) {
            this._behaviorRuntime.tick(dt, dtScale, this.time, this.hp, this.maxHp, this._tempPos);
        }

        this.node.setPosition(this._tempPos);

        if (this.model3D) {
            this.updateModel3DVisual(this._tempPos.x - oldX);
        }
    }

    /**
     * 3Dモデルの向きを毎フレーム更新する。PlayerController.model3D のバンキング処理と同じ考え方で、
     * バンキング/自機注視(Y、lerpで滑らかに追従)と、BehaviorGraphのSpin/Punchノードによる
     * 相対オフセット(_animOffset、X/Y/Z)を毎フレーム合成してsetRotationFromEulerする。
     */
    private updateModel3DVisual(dx: number) {
        let targetYaw: number;
        const gm = this._gm;

        if (this.faceTowardPlayer && gm && gm.playerNode) {
            const pdx = gm.playerNode.position.x - this.node.position.x;
            const pdy = gm.playerNode.position.y - this.node.position.y;
            // モデルの正面軸の定義次第で符号/軸が逆になることがある。逆を向く場合は
            // faceTowardPlayerOffsetを90/180/-90などに調整するか、この式のatan2引数を入れ替える。
            targetYaw = Math.atan2(pdx, pdy) * 180 / Math.PI + this.faceTowardPlayerOffset;
        } else {
            // Playerのバンキングと同じ式 (横移動量に比例して左右に傾く)
            targetYaw = this._model3DBaseRot.y - dx * 15;
        }

        this._model3DYaw = math.lerp(this._model3DYaw, targetYaw, 0.1);

        this.model3D.setRotationFromEuler(
            this._model3DBaseRot.x + this._animOffset.x,
            this._model3DYaw + this._animOffset.y,
            this._model3DBaseRot.z + this._animOffset.z
        );
    }

    /**
     * BehaviorGraphのSpinノードから呼ばれる。指定軸をduration秒かけてdegrees分(相対)回転させる。
     * Spinノード自体はブロックしないので、これは背後で再生される演出にすぎない。
     * 例: 登場時に axis="y", degrees=360, duration=0.6 でその場を向いたまま1回転しながら出現。
     *
     * loop=trueの場合はduration秒周期でdegrees分の回転を無限に繰り返す(回転し続ける演出台や
     * ドリル状の武器など、常時回転し続けるオブジェクトを表現する用途)。次に同じ軸でSpin/Punchが
     * 実行されるまで回り続ける(他の軸で別のSpin/Punchが走っていても止めない — X/Y/Z同時に
     * 別々のSpinを繋げば3軸同時に回転させられる)。
     */
    private playSpin(axis: string, degrees: number, duration: number, loop: boolean = false) {
        if (!this.model3D) return;
        const key = (axis === 'x' || axis === 'z') ? axis : 'y';
        this.stopAxisTween(key);

        const t = loop
            ? tween(this._animOffset).by(duration, { [key]: degrees } as any, { easing: 'linear' }).repeatForever()
            : tween(this._animOffset).by(duration, { [key]: degrees } as any, { easing: 'quadInOut' });
        this._axisTweens[key] = t;
        t.start();
    }

    /**
     * BehaviorGraphのPunchノードから呼ばれる。指定軸を一瞬だけdegrees分(相対)傾けてすぐ戻す。
     * ブロックしないノードなので、通常はFireノードの直後に繋いで攻撃の反動演出として使う。
     * 同じ軸で連射/連続実行された場合のみ前のtweenを打ち切る(他の軸で回転中のSpin等は止めない)。
     */
    private playPunch(axis: string, degrees: number, outDuration: number, inDuration: number) {
        if (!this.model3D) return;
        const key = (axis === 'y' || axis === 'z') ? axis : 'x';
        this.stopAxisTween(key);

        const t = tween(this._animOffset)
            .to(outDuration, { [key]: degrees } as any, { easing: 'quadOut' })
            .to(inDuration, { [key]: 0 } as any, { easing: 'quadIn' });
        this._axisTweens[key] = t;
        t.start();
    }

    // 指定軸で現在再生中のtween(あれば)だけを止める。他の軸のtweenには一切触れない。
    private stopAxisTween(key: 'x' | 'y' | 'z') {
        const running = this._axisTweens[key];
        if (running) {
            running.stop();
            this._axisTweens[key] = null;
        }
    }

    /**
     * BehaviorGraphのAttackノードから呼ばれる。現在アクティブな発射パターン(ShotRuntime)を
     * 差し替える(既存のShotRuntimeがあれば単純に新しいインスタンスへ置き換えるだけ — 新しい
     * パターンはStartノードから再スタートする)。id が空文字/"(none)"なら攻撃を停止する。
     * 未知のIDが指定された場合は警告のみ出し、現在のShotRuntimeはそのまま維持する
     * (タイプミス等で誤って攻撃が止まってしまうのを避けるため)。
     */
    private setActiveShotPattern(id: string) {
        if (!id || id === '(none)') {
            this._shotRuntime = null;
            return;
        }
        const db = GameDatabase.instance;
        const patternData = db ? db.getShotPatternData(id) : null;
        if (!patternData || !patternData._graph) {
            console.warn(`[Enemy] Attack: ShotPattern '${id}' not found or not loaded yet for ${this.data ? this.data.id : '?'}. Keeping previous attack.`);
            return;
        }
        this._shotRuntime = new ShotRuntime(patternData._graph, this._gm, this.node, true);
    }

    public takeDamage(amount: number) {
        if (this.invincible) return; // テスト用無敵: ダメージ・被弾演出・死亡処理を一切行わない

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

            // Track total damage dealt by player
            if (DataManager.instance) {
                DataManager.instance.addDamageDealt(finalDamage);
            }
            if (this._gm && this._gm.playState) {
                this._gm.playState.damageDealt += finalDamage;
            }
        }

        // Play Hit SE (3D)
        SoundManager.instance.play3dSE("shoothit01", this.node.worldPosition, "Enemy");

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
        console.log(`[Enemy] die called: ${this.node.uuid} Data: ${this.data ? this.data.id : 'null'}`);
        const gm = this._gm;
        if (gm) {
            let dropped = false;

            // 1. Modular Drop Table System (DropTableID -> up to 5 ItemID + Rate slots)
            const dropTable = this.data ? (this.data._dropTable || (gm.db ? gm.db.getDropTableData(this.data.dropTableId) : null)) : null;

            if (dropTable && dropTable.slots && dropTable.slots.length > 0) {
                console.log(`[Enemy] checking ${dropTable.slots.length} drop slots from DropTable '${dropTable.id}'...`);
                for (const slot of dropTable.slots) {
                    if (!slot.itemId || slot.itemId === 'None') continue;

                    const rnd = Math.random();
                    if (rnd <= slot.rate) {
                        const itemMaster = gm.db ? gm.db.getItemData(slot.itemId) : null;
                        const minCnt = itemMaster ? itemMaster.min : 1;
                        const maxCnt = itemMaster ? itemMaster.max : 1;
                        const count = Math.floor(Math.random() * (maxCnt - minCnt + 1)) + minCnt;

                        console.log(`[Enemy] DROP SUCCESS: ${slot.itemId} x${count} (Roll:${rnd.toFixed(2)} <= Rate:${slot.rate})`);
                        gm.spawnItem(this.node.position.x, this.node.position.y, slot.itemId, count);
                        dropped = true;
                    } else {
                        console.log(`[Enemy] DROP FAIL: ${slot.itemId} (Roll:${rnd.toFixed(2)} > Rate:${slot.rate})`);
                    }
                }
            }
            // 1.5 Legacy Drop Fallback
            else if (this.data && this.data._drops && this.data._drops.length > 0) {
                for (const drop of this.data._drops) {
                    const rnd = Math.random();
                    if (rnd <= drop.rate) {
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

            // Play Explosion (Programmatic spawn)
            gm.spawnExplosion(this.node.worldPosition.x, this.node.worldPosition.y, true);
            SoundManager.instance.play3dSE("exploson01", this.node.worldPosition, "Enemy");
        }
        this.node.destroy();
    }
}
