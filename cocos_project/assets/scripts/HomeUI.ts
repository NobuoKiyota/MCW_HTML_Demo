import { _decorator, Component, Node, Label } from 'cc';
import { GameManager } from './GameManager';
import { DataManager } from './DataManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends Component {

    @property(Label)
    public sessionStatsLabel: Label = null;

    start() {
        this.refreshUI();
    }

    /**
     * DataManagerから最新のデータを取得して表示
     */
    public refreshUI() {
        if (!DataManager.instance) return;
        const data = DataManager.instance.data;

        if (this.sessionStatsLabel) {
            const started = data.careerStats ? data.careerStats.started : 0;
            this.sessionStatsLabel.string = `MISSIONS STARTED: ${started}`;
        }
    }

    /**
     * ミッション開始ボタン
     */
    public onStartMissionClicked() {
        SoundManager.instance.playSE("click");
        if (GameManager.instance) {
            // インゲームシーンへ遷移
            GameManager.instance.retryGame(); // "scene" をロード
        }
    }

    /**
     * Optionボタンクリック（設定メニュー表示）
     */
    public onOptionClicked() {
        SoundManager.instance.playSE("click");
        if (OptionsUI.instance) {
            OptionsUI.instance.toggle();
        } else {
            console.warn("[HomeUI] OptionsUI instance not found.");
        }
    }

    /**
     * タイトルへ戻るボタン
     */
    public onBackToTitleClicked() {
        SoundManager.instance.playSE("click");
        if (GameManager.instance) {
            GameManager.instance.goToTitle();
        }
    }
}
