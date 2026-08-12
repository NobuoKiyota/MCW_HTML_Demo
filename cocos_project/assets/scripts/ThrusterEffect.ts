import { _decorator, Component, Node, ParticleSystem, Vec3 } from 'cc';
import { PlayerController } from './PlayerController';
const { ccclass, property } = _decorator;

/**
 * Player機の後方バーニア噴射エフェクト。PlayerController.speed(altitude/加速に応じた現在の
 * 前進速度、baseMaxSpeedが上限)を毎フレーム参照し、噴射の勢い(炎の大きさ/再生速度/密度)を
 * 連動させる。ParticleSystem(3D)を想定 - Inspectorでthrusterノード(09Burner_L/09Burner_R等、
 * ParticleSystemコンポーネント付き)を割り当てて使う。
 *
 * 注意: rateOverTime周りのプロパティ名はCocosのバージョンによって直下(ps.rateOverTime.constant)か
 * emissionサブオブジェクト配下(ps.emission.rateOverTime.constant)かが変わることがあるため、
 * 両対応かつtry/catchで安全側に倒している。エディタでInspectorのParticle System設定を確認し、
 * 実際に密度が変化しない場合はプロパティ名をコンソール警告に合わせて調整すること。
 */
@ccclass('ThrusterEffect')
export class ThrusterEffect extends Component {
    @property(PlayerController)
    public playerController: PlayerController = null;

    // 09Burner_L / 09Burner_R 等、ParticleSystemコンポーネントを付けたノードをInspectorで割り当てる。
    @property([Node])
    public thrusterNodes: Node[] = [];

    @property({ tooltip: '最低速度時の炎スケール倍率' })
    public minScale: number = 0.6;
    @property({ tooltip: '最高速度時の炎スケール倍率' })
    public maxScale: number = 1.6;
    @property({ tooltip: '最低速度時のパーティクル再生速度(simulationSpeed)' })
    public minSimSpeed: number = 0.6;
    @property({ tooltip: '最高速度時のパーティクル再生速度(simulationSpeed)' })
    public maxSimSpeed: number = 2.0;
    @property({ tooltip: 'Rate over Timeの基準値(各ParticleSystem側のInspector設定と合わせること)。0なら密度は変化させない。' })
    public baseRateOverTime: number = 30;
    @property({ tooltip: '最低速度時のRate over Time倍率' })
    public minRateMult: number = 0.3;
    @property({ tooltip: '最高速度時のRate over Time倍率' })
    public maxRateMult: number = 1.5;
    @property({ tooltip: '最低速度時のStart Speed' })
    public minStartSpeed: number = 0.3;
    @property({ tooltip: '最高速度時のStart Speed' })
    public maxStartSpeed: number = 1.3;

    // Player機の傾き(バンキング)にShape ModuleのRotation Y/Zを連動させ、炎をねじらせる。
    // 未割り当てならplayerController.model3Dを自動で使う。
    @property({ type: Node, tooltip: '傾き検出元のNode(通常はPlayerControllerのmodel3D)。未割り当てならmodel3Dを自動使用。' })
    public shipModel: Node = null;
    @property({ tooltip: 'バンキング角度(度)→Shape Module Rotation.Yへの反映倍率。0でY連動なし。' })
    public bankTwistToShapeY: number = 1.0;
    @property({ tooltip: 'バンキング角度(度)→Shape Module Rotation.Zへの反映倍率。0でZ連動なし。' })
    public bankTwistToShapeZ: number = 0.5;

    @property({ tooltip: '1秒おきに現在のratio/simSpeed/startSpeed等の実際の適用値をコンソールに出す(確認できたらオフにしてよい)。' })
    public debugLog: boolean = true;
    private _debugLogTimer: number = 0;

    private _particleSystems: ParticleSystem[] = [];
    private _rateWarned = false;
    private _shapeWarned = false;
    private _startSpeedWarned = false;
    // 各ParticleSystemの、Inspectorで手動設定したShape Module基準Rotation(Y/Z)。バンキング量は
    // この基準値に対する「上乗せ」として加算する(手動チューニングした角度を消さないため)。
    private _baseShapeRotY: number[] = [];
    private _baseShapeRotZ: number[] = [];
    // model3Dの静止時Y角度(start()相当のタイミングで1度だけ捕捉)。以後の毎フレームの
    // eulerAngles.yとの差分を「現在のバンキング量」とみなす。
    private _restModelRotY: number | null = null;

    onLoad() {
        this._particleSystems = this.thrusterNodes
            .map(n => n ? n.getComponent(ParticleSystem) : null)
            .filter((p): p is ParticleSystem => !!p);

        if (this.thrusterNodes.length > 0 && this._particleSystems.length === 0) {
            console.warn("[ThrusterEffect] thrusterNodesにParticleSystemコンポーネントが見つかりませんでした。Inspectorの割り当てを確認してください。");
        } else {
            console.log(`[ThrusterEffect] onLoad: ${this._particleSystems.length} particle system(s) found. playerController=${this.playerController ? 'OK' : 'NULL'}`);
        }

        for (const ps of this._particleSystems) {
            try {
                const rot = (ps as any).shapeModule && (ps as any).shapeModule.rotation;
                this._baseShapeRotY.push(rot ? rot.y : 0);
                this._baseShapeRotZ.push(rot ? rot.z : 0);
            } catch (e) {
                this._baseShapeRotY.push(0);
                this._baseShapeRotZ.push(0);
            }
        }
    }

    start() {
        const model = this.shipModel || (this.playerController && this.playerController.model3D);
        if (model) this._restModelRotY = model.eulerAngles.y;
    }

    update(dt: number) {
        if (!this.playerController) return;
        const maxSpeed = this.playerController.baseMaxSpeed > 0 ? this.playerController.baseMaxSpeed : 1;
        const ratio = Math.max(0, Math.min(1, this.playerController.speed / maxSpeed));

        const scale = this.minScale + (this.maxScale - this.minScale) * ratio;
        for (const node of this.thrusterNodes) {
            if (node && node.isValid) node.setScale(scale, scale, scale);
        }

        if (this._particleSystems.length === 0) return;

        const simSpeed = this.minSimSpeed + (this.maxSimSpeed - this.minSimSpeed) * ratio;
        const rateMult = this.minRateMult + (this.maxRateMult - this.minRateMult) * ratio;
        const startSpeedVal = this.minStartSpeed + (this.maxStartSpeed - this.minStartSpeed) * ratio;

        // バンキング量(現在のmodel3D.eulerAngles.y - 静止時角度)をShape ModuleのRotation Y/Zに
        // 上乗せし、傾きに応じて炎をねじらせる。
        const model = this.shipModel || (this.playerController && this.playerController.model3D);
        const bankDelta = (model && this._restModelRotY != null) ? (model.eulerAngles.y - this._restModelRotY) : 0;

        if (this.debugLog) {
            this._debugLogTimer += dt;
            if (this._debugLogTimer >= 1.0) {
                this._debugLogTimer = 0;
                console.log(`[ThrusterEffect] speed=${this.playerController.speed.toFixed(2)} ratio=${ratio.toFixed(2)} scale=${scale.toFixed(2)} simSpeed=${simSpeed.toFixed(2)} startSpeed=${startSpeedVal.toFixed(2)} rateMult=${rateMult.toFixed(2)} bankDelta=${bankDelta.toFixed(1)}`);
            }
        }

        for (let i = 0; i < this._particleSystems.length; i++) {
            const ps = this._particleSystems[i];
            if (!ps || !ps.isValid) continue;

            if (this.bankTwistToShapeY !== 0 || this.bankTwistToShapeZ !== 0) {
                try {
                    const shape = (ps as any).shapeModule;
                    if (shape && shape.rotation) {
                        const baseY = this._baseShapeRotY[i] || 0;
                        const baseZ = this._baseShapeRotZ[i] || 0;
                        shape.rotation.y = baseY + bankDelta * this.bankTwistToShapeY;
                        shape.rotation.z = baseZ + bankDelta * this.bankTwistToShapeZ;
                        // Cocosバージョンによってはgetter/setterがVec3全体の再代入を要求する場合が
                        // あるため、念のため同じ値で明示的に再代入もしておく(反映されない場合の保険)。
                        shape.rotation = new Vec3(shape.rotation.x, shape.rotation.y, shape.rotation.z);
                    } else if (!this._shapeWarned) {
                        this._shapeWarned = true;
                        console.warn("[ThrusterEffect] shapeModule.rotation が見つかりませんでした。バンキング連動の炎ねじれはスキップします。");
                    }
                } catch (e) {
                    if (!this._shapeWarned) {
                        this._shapeWarned = true;
                        console.warn("[ThrusterEffect] shapeModule.rotation適用中にエラー:", e);
                    }
                }
            }

            try {
                (ps as any).simulationSpeed = simSpeed;
            } catch (e) { /* Cocosバージョン差異は握りつぶす */ }

            try {
                const anyPs = ps as any;
                if (anyPs.startSpeed && typeof anyPs.startSpeed.constant === 'number') {
                    anyPs.startSpeed.constant = startSpeedVal;
                } else if (!this._startSpeedWarned) {
                    this._startSpeedWarned = true;
                    console.warn("[ThrusterEffect] startSpeed.constant が見つかりませんでした。Start Speed連動はスキップします。");
                }
            } catch (e) {
                if (!this._startSpeedWarned) {
                    this._startSpeedWarned = true;
                    console.warn("[ThrusterEffect] startSpeed適用中にエラー:", e);
                }
            }

            if (this.baseRateOverTime <= 0) continue;
            try {
                const anyPs = ps as any;
                const rateModule = (anyPs.rateOverTime && typeof anyPs.rateOverTime.constant === 'number')
                    ? anyPs.rateOverTime
                    : (anyPs.emission && anyPs.emission.rateOverTime && typeof anyPs.emission.rateOverTime.constant === 'number')
                        ? anyPs.emission.rateOverTime
                        : null;
                if (rateModule) {
                    rateModule.constant = this.baseRateOverTime * rateMult;
                } else if (!this._rateWarned) {
                    this._rateWarned = true;
                    console.warn("[ThrusterEffect] rateOverTime.constant / emission.rateOverTime.constant のどちらも見つかりませんでした。密度連動はスキップします(炎のスケール/再生速度連動のみ有効)。");
                }
            } catch (e) {
                if (!this._rateWarned) {
                    this._rateWarned = true;
                    console.warn("[ThrusterEffect] rateOverTime適用中にエラー:", e);
                }
            }
        }
    }
}
