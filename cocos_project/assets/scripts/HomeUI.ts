import { _decorator, Component, Node, Label, director } from 'cc';
import { GameManager } from './GameManager';
import { DataManager } from './DataManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';
import { MissionUI } from './MissionUI';

const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends Component {

    @property(Label)
    public sessionStatsLabel: Label = null;

    start() {
        this.refreshUI();

        // Apply Layout
        this.applyButtonLayout("BtnTitle", 0, 160);
        this.applyButtonLayout("BtnOption", 0, 80);
        this.applyButtonLayout("BtnMission", 0, 0);
        this.applyButtonLayout("BtnCustom", 0, -80);
        this.applyButtonLayout("BtnUpgrade", 0, -160);
    }

    private applyButtonLayout(name: string, y: number, x: number = 0) {
        let btnNode = this.node.getChildByName(name);
        if (!btnNode) {
            const simpleName = name.replace("Btn", "");
            btnNode = this.node.getChildByName(simpleName);
        }

        if (btnNode) {
            btnNode.setPosition(x, y);
            const uiTrans = btnNode.getComponent("UITransform") as any;
            if (uiTrans) {
                uiTrans.setContentSize(300, 60);
            }
        }
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

        // Open Mission UI
        console.log("[HomeUI] Opening MissionUI...");
        const node = new Node("MissionUI");

        // Canvasを探して親にする（最前面表示のため）
        // Find Canvas to ensure it's on top
        // director is imported
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot.getChildByName("Canvas");

        if (canvasNode) {
            canvasNode.addChild(node);
        } else {
            this.node.addChild(node);
        }

        node.addComponent(MissionUI); // スクリプト追加で自動初期化(onLoad)
    }

    /**
     * カスタムボタン
     */
    public onCustomClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Custom Button Clicked (Not Implemented)");
    }

    /**
     * アップグレードボタン
     */
    public onUpgradeClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Upgrade Button Clicked (Not Implemented)");
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
