import { _decorator, Component, Node, Label, director, Button, Graphics, Color, BlockInputEvents, UITransform, Size, LabelOutline } from 'cc';
import { GameManager } from './GameManager';
import { DataManager } from './DataManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';
import { MissionUI } from './MissionUI';
import { UIManager } from './UIManager';
import { GameState } from './Constants';

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

        const buttonsRoot = this.node.getChildByName("Buttons");
        const backToTitleButtonNode = buttonsRoot ? buttonsRoot.getChildByName("BackToTitleButton") : null;
        const startMissionButtonNode = buttonsRoot ? buttonsRoot.getChildByName("StartMissionButton") : null;

        if (backToTitleButtonNode) {
            const button = backToTitleButtonNode.getComponent(Button);
            if (button) {
                button.node.off(Button.EventType.CLICK);
                button.node.on(Button.EventType.CLICK, this.onBackToTitleClicked, this);
            }
        }

        if (startMissionButtonNode) {
            const button = startMissionButtonNode.getComponent(Button);
            if (button) {
                button.node.off(Button.EventType.CLICK);
                button.node.on(Button.EventType.CLICK, this.onStartMissionClicked, this);
            }
        }

        // Hook up new buttons
        const restBtnNode = buttonsRoot?.getChildByName("Button-Rest") || this.node.getChildByName("Button-Rest");
        if (restBtnNode) {
            const btn = restBtnNode.getComponent(Button);
            if (btn) btn.node.on(Button.EventType.CLICK, this.onResetClicked, this);
        }

        const repairBtnNode = buttonsRoot?.getChildByName("VehicleRepair") || this.node.getChildByName("VehicleRepair");
        if (repairBtnNode) {
            const btn = repairBtnNode.getComponent(Button);
            if (btn) btn.node.on(Button.EventType.CLICK, this.onVehicleRepairClicked, this);
        }
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

    /**
     * リセットボタン
     */
    public onResetClicked() {
        SoundManager.instance.playSE("click");
        if (DataManager.instance) {
            DataManager.instance.customReset(1000, 0);
            this.refreshUI();
            if (UIManager.instance && UIManager.instance.sideBarUI) {
                UIManager.instance.sideBarUI.updateShipInfo();
            }
            console.log("[HomeUI] Data Reset: Credits=1000, Dist=0");
        }
    }

    /**
     * 機体修理ボタン
     */
    public onVehicleRepairClicked() {
        SoundManager.instance.playSE("click");

        // 仮のHP計算 (本来はセーブデータから取るべき)
        const currentHp = 40;
        const maxHp = 100;
        const missingHp = maxHp - currentHp;

        if (missingHp <= 0) {
            console.log("[HomeUI] Vehicle already at Max HP.");
            return;
        }

        const cost = missingHp * 10;
        this.showRepairConfirmDialog(cost, missingHp);
    }

    private showRepairConfirmDialog(cost: number, hpToHeal: number) {
        const dialogNode = new Node("RepairDialog");
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        (canvasNode || this.node).addChild(dialogNode);

        // Background
        const gr = dialogNode.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 180);
        gr.rect(-2000, -2000, 4000, 4000);
        gr.fill();
        dialogNode.addComponent(BlockInputEvents);

        // Window
        const winNode = new Node("Window");
        dialogNode.addChild(winNode);
        const winGr = winNode.addComponent(Graphics);
        winGr.fillColor = new Color(40, 40, 40, 255);
        winGr.roundRect(-200, -120, 400, 240, 10);
        winGr.fill();
        winGr.strokeColor = Color.YELLOW;
        winGr.lineWidth = 3;
        winGr.stroke();

        // Text
        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 40);
        const lbl = txtNode.addComponent(Label);
        lbl.string = `Repair Vehicle?\n\nRestore ${hpToHeal} HP\nCost: ${cost} Credits`;
        lbl.fontSize = 24;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;

        // YES Button
        this.createDialogButton(winNode, "YES", -80, -60, Color.GREEN, () => {
            const data = DataManager.instance.data;
            if (data.money >= cost) {
                DataManager.instance.addResource("money", -cost);
                SoundManager.instance.playSE("upgrade", "System");
                // Heal logic
                if (UIManager.instance && UIManager.instance.sideBarUI) {
                    UIManager.instance.sideBarUI.updateHP(100, 100);
                    UIManager.instance.sideBarUI.updateShipInfo();
                }
                this.refreshUI();
                dialogNode.destroy();
            } else {
                SoundManager.instance.playSE("error", "System");
                console.warn("[HomeUI] Not enough credits for repair.");
            }
        });

        // NO Button
        this.createDialogButton(winNode, "NO", 80, -60, Color.RED, () => {
            SoundManager.instance.playSE("cansel", "System");
            dialogNode.destroy();
        });
    }

    private createDialogButton(parent: Node, text: string, x: number, y: number, color: Color, onClick: () => void) {
        const btnNode = new Node("Btn" + text);
        parent.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 100;
        const h = 45;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = color;
        gr.roundRect(-w / 2, -h / 2, w, h, 5);
        gr.fill();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 20;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btnNode.on(Button.EventType.CLICK, onClick, this);
    }
}
