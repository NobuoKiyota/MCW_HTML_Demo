import { _decorator, Component, ParticleSystem2D, Color, math } from 'cc';
import { GameSpeedManager } from './GameSpeedManager';
import { GameManager } from './GameManager';

const { ccclass, property } = _decorator;

/**
 * 速度連動型のスターフィールド演出
 * GameSpeedManager の現在速度に合わせて星の速さと密度を変化させる
 */
@ccclass('StarField')
export class StarField extends Component {

    @property(ParticleSystem2D)
    public particleSystem: ParticleSystem2D = null;

    @property({ tooltip: "速度に対するパーティクルスピードの倍率" })
    public speedScale: number = 50.0;

    @property({ tooltip: "速度に対する発生量の倍率" })
    public emissionScale: number = 10.0;

    @property({ tooltip: "ベースの発生量" })
    public baseEmission: number = 5.0;

    private _speedManager: GameSpeedManager = null;

    onLoad() {
        if (!this.particleSystem) {
            this.particleSystem = this.getComponent(ParticleSystem2D);
        }

        // 初期設定
        if (this.particleSystem) {
            this.setupParticles();
        }
    }

    start() {
        // GameManager 経由で SpeedManager を取得
        if (GameManager.instance) {
            this._speedManager = GameManager.instance.speedManager;
        }
    }

    private setupParticles() {
        const ps = this.particleSystem;

        // 画面全体から降ってくるように設定 (上端から)
        // Canvasサイズは通常 800x600。GameManager等の定数があればそれを使うが、
        // 汎用的にスクリプトから調整可能なように設計。

        ps.duration = -1; // 無限
        ps.playOnAwake = true;

        // 明滅エフェクトのためのカラー設定 (黄色白 ～ 青白)
        ps.startColor = new Color(255, 255, 200, 255);
        ps.startColorVar = new Color(50, 50, 55, 0); // バリエーション
        ps.endColor = new Color(200, 255, 255, 0);   // 消えていく

        // 寿命をバラバラにして明滅感を出す
        ps.life = 2.0;
        ps.lifeVar = 1.5;

        ps.resetSystem();
    }

    update(dt: number) {
        if (!this.particleSystem || !this._speedManager) return;

        const currentSpeed = this._speedManager.getCurrentSpeed();

        // 1. スピード連動
        // パーティクルの初速をゲーム速度に合わせる
        this.particleSystem.speed = currentSpeed * this.speedScale;
        this.particleSystem.speedVar = this.particleSystem.speed * 0.2;

        // 2. 発生量連動
        // 速いほどたくさん星が出るようにする
        this.particleSystem.emissionRate = this.baseEmission + (currentSpeed * this.emissionScale);

        // 3. 長さを出す演出 (オプション: 速度が速いほどパーティクルを細長く見せる)
        // ParticleSystem2D では直接的な「伸び」は難しいが、
        // 移動速度が速いことで視覚的に線に見える効果がある。
    }
}
