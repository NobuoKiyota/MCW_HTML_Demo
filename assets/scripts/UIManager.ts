import { _decorator, Component, Node, ProgressBar, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

    public static instance: UIManager;

    @property(ProgressBar)
    public hpBar: ProgressBar = null;

    @property(Label)
    public distLabel: Label = null;

    @property(Label)
    public speedLabel: Label = null; // New Speed Label

    @property(Node)
    public gameOverPanel: Node = null;

    @property(Node)
    public resultPanel: Node = null;

    onLoad() {
        UIManager.instance = this;
        if (this.gameOverPanel) this.gameOverPanel.active = false;
        if (this.resultPanel) this.resultPanel.active = false;
    }

    public updateHP(currentHp: number, maxHp: number) {
        if (this.hpBar) {
            this.hpBar.progress = currentHp / maxHp;
        }
    }

    public showGameOver() {
        if (this.gameOverPanel) {
            this.gameOverPanel.active = true;
        }
    }

    public showResult() {
        if (this.resultPanel) {
            this.resultPanel.active = true;
        }
    }

    public updateDist(distance: number) {
        if (this.distLabel) {
            // "03000.00 km" - Manual padding for ES5 compatibility
            const distStr = distance.toFixed(2);
            const padded = ("00000000" + distStr).slice(-8);
            this.distLabel.string = `DIST: ${padded} km`;
        }
    }

    public updateSpeed(speed: number) {
        if (this.speedLabel) {
            // "0500 km/h"
            const displaySpeed = Math.floor(speed * 100);
            const speedStr = displaySpeed.toString();
            const padded = ("0000" + speedStr).slice(-4);
            this.speedLabel.string = `SPD: ${padded} km/h`;
        }
    }

    // Button Events
    public onRetryClicked() {
        console.log("[UIManager] Retry Clicked");
        director.emit("GAME_RETRY");
    }

    public onTitleClicked() {
        console.log("[UIManager] Title Clicked");
        director.emit("GAME_TITLE");
    }
}

import { director } from 'cc';


