import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * ゲーム全体のスクロール速度や時間進行を一元管理するクラス
 */
@ccclass('GameSpeedManager')
export class GameSpeedManager extends Component {

    @property({ tooltip: "Base Speed (Debug/ReadOnly)" })
    private _baseSpeed: number = 0;

    @property({ tooltip: "Global Speed Multiplier" })
    private _speedMultiplier: number = 1.0;

    @property({ tooltip: "Paused State" })
    private _isPaused: boolean = false;

    @property({ tooltip: "Forced Scroll Speed (-1 to disable)" })
    private _forcedSpeed: number = -1;

    /**
     * 現在の有効なスクロール速度を取得
     * @returns {number} 最終的なスクロール速度
     */
    public getCurrentSpeed(): number {
        if (this._isPaused) return 0;

        // 強制スクロールが有効な場合
        if (this._forcedSpeed >= 0) {
            return this._forcedSpeed * this._speedMultiplier;
        }

        return this._baseSpeed * this._speedMultiplier;
    }

    /**
     * プレイヤーの現在速度をベース速度として設定
     * @param speed 
     */
    public setBaseSpeed(speed: number) {
        this._baseSpeed = speed;
    }

    /**
     * スピード倍率を設定 (通常は1.0, ブースト時は2.0など)
     * @param mult 
     */
    public setMultiplier(mult: number) {
        this._speedMultiplier = mult;
    }

    /**
     * ゲーム進行の一時停止/再開 (UI等は止まらない想定)
     * @param paused 
     */
    public setPaused(paused: boolean) {
        this._isPaused = paused;
    }

    /**
     * 強制スクロール速度を設定 (ボス戦などで使用)。
     * 解除するには -1 をセット。
     * @param speed 
     */
    public setForcedSpeed(speed: number) {
        this._forcedSpeed = speed;
    }

    // デバッグ用情報取得
    public getDebugInfo(): string {
        return `Base: ${this._baseSpeed.toFixed(2)}, Mult: ${this._speedMultiplier.toFixed(2)}, Paused: ${this._isPaused}, Final: ${this.getCurrentSpeed().toFixed(2)}`;
    }
}
