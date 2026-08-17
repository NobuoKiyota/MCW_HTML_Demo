import { _decorator, Component, Node, Label, director, Button, Graphics, Color, BlockInputEvents, UITransform, Size, LabelOutline, Layers } from 'cc';
import { GameManager } from './GameManager';
import { VideoBackground } from './VideoBackground';
import { DataManager } from './DataManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';
import { MissionUI } from './MissionUI';
import { UIManager } from './UIManager';
import { GameState } from './Constants';
import { PropertyUI } from './PropertyUI';
import { HistoryUI } from './HistoryUI';
import { UpgradeUI } from './UpgradeUI';
import { CustomizeUI } from './CustomizeUI';
import { instantiatePrefabButton } from './UIButtonPrefab';

const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends Component {

    @property(Label)
    public sessionStatsLabel: Label = null;

    start() {
        this.setupVideoBackground();
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

        const propertyBtnNode = buttonsRoot?.getChildByName("BtnProperty") || this.node.getChildByName("BtnProperty");
        if (propertyBtnNode) {
            const btn = propertyBtnNode.getComponent(Button);
            if (btn) btn.node.on(Button.EventType.CLICK, this.onPropertyClicked, this);
        }

        const historyBtnNode = buttonsRoot?.getChildByName("BtnHistory") || this.node.getChildByName("BtnHistory");
        if (historyBtnNode) {
            const btn = historyBtnNode.getComponent(Button);
            if (btn) btn.node.on(Button.EventType.CLICK, this.onHistoryClicked, this);
        }

        const restBtnNode = buttonsRoot?.getChildByName("Button-Rest") || buttonsRoot?.getChildByName("BtnReset") || this.node.getChildByName("BtnReset");
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

        // Canvasを探して親にする（最前面表示のため）
        // Find Canvas to ensure it's on top
        // director is imported
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot.getChildByName("Canvas");
        const parent = canvasNode || this.node;

        // Guard against stacking multiple instances if this handler fires more than
        // once (e.g. repeated clicks before the first panel is visibly up) - each
        // instance carries a full-screen BlockInputEvents, so leftover copies pile up
        // and swallow all future input.
        const existing = parent.getChildByName("MissionUI");
        if (existing) existing.destroy();

        const node = new Node("MissionUI");
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);

        node.addComponent(MissionUI); // スクリプト追加で自動初期化(onLoad)
    }

    /**
     * カスタムボタン
     */
    public onCustomClicked() {
        SoundManager.instance.playSE("click");
        if (CustomizeUI.instance) {
            CustomizeUI.instance.open();
        } else {
            console.warn("[HomeUI] CustomizeUI instance not found (is the CustomizeUI node under Home Canvas, with CustomizeUI.ts attached?).");
        }
    }

    /**
     * アップグレードボタン
     */
    public onUpgradeClicked() {
        SoundManager.instance.playSE("click");
        if (UpgradeUI.instance) {
            UpgradeUI.instance.open();
        } else {
            console.warn("[HomeUI] UpgradeUI instance not found (is the UpgradeUI node under Home Canvas, with UpgradeUI.ts attached?).");
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

    /**
     * リセットボタン
     */
    public onResetClicked() {
        SoundManager.instance.playSE("click");
        this.showResetConfirmDialog();
    }

    private showResetConfirmDialog() {
        const dialogNode = new Node("ResetDialog");
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
        winGr.fillColor = new Color(60, 20, 20, 255);
        winGr.roundRect(-200, -100, 400, 200, 10);
        winGr.fill();
        winGr.strokeColor = Color.RED;
        winGr.lineWidth = 3;
        winGr.stroke();

        // Text
        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 30);
        const lbl = txtNode.addComponent(Label);
        lbl.string = "RESET ALL DATA?\n\nProgress will be lost.";
        lbl.fontSize = 24;
        lbl.horizontalAlign = Label.HorizontalAlign.CENTER;

        // YES Button
        instantiatePrefabButton("Prefabs/Canvas/Button-Yes", winNode, -80, -50, () => {
            if (DataManager.instance) {
                DataManager.instance.reset(); // Full Reset instead of custom
                // Resetで再び「初回起動」相当になるため、GameManagerConfig.jsonのinitialCreditを
                // 再適用する(でないとmoneyがgetInitialData()の既定値0のままになってしまう)。
                if (GameManager.instance) GameManager.instance.applyInitialCreditIfNewSave();
                SoundManager.instance.playSE("click"); // YESでclick音
                this.refreshUI();
                if (UIManager.instance && UIManager.instance.sideBarUI) {
                    UIManager.instance.sideBarUI.updateHP(100, 100);
                    UIManager.instance.sideBarUI.updateShipInfo();
                }
                console.log("[HomeUI] Data Reset Complete");
                dialogNode.destroy();
            }
        }, dialogNode, "YES", Color.RED, 0.5, 0.65);

        // NO Button
        instantiatePrefabButton("Prefabs/Canvas/Button-No", winNode, 80, -50, () => {
            SoundManager.instance.playSE("cansel", "System"); // NOでcancel音
            dialogNode.destroy();
        }, dialogNode, "NO", Color.GRAY, 0.5, 0.65);
    }

    /**
     * Propertyボタン
     */
    public onPropertyClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Opening PropertyUI...");
        const node = new Node("PropertyUI");
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        (canvasNode || this.node).addChild(node);
        node.addComponent(PropertyUI);
    }

    /**
     * Historyボタン
     */
    public onHistoryClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Opening HistoryUI...");
        const node = new Node("HistoryUI");
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        (canvasNode || this.node).addChild(node);
        node.addComponent(HistoryUI);
    }

    /**
     * 機体修理ボタン
     */
    public onVehicleRepairClicked() {
        SoundManager.instance.playSE("click");

        const data = DataManager.instance.data;
        const currentHp = data.hp;
        const maxHp = data.maxHp;
        const missingHp = maxHp - currentHp;

        if (missingHp <= 0) {
            console.log("[HomeUI] Vehicle already at Max HP.");
            return;
        }

        // Cost is 10 credits per 1 HP? Or variable based on requirement?
        // Todo said "残HPに応じて変動するように変更"
        // Current implementation already does missingHp * 10.
        // I will keep it but ensure it's using the actual data.
        const cost = Math.ceil(missingHp * 10);
        this.showRepairConfirmDialog(cost, missingHp);
    }

    private showRepairConfirmDialog(cost: number, hpToHeal: number) {
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        const parent = canvasNode || this.node;

        // Same accumulation guard as onStartMissionClicked() - avoid stacking multiple
        // full-screen BlockInputEvents layers from repeated clicks.
        const existing = parent.getChildByName("RepairDialog");
        if (existing) existing.destroy();

        const dialogNode = new Node("RepairDialog");
        dialogNode.layer = Layers.Enum.UI_2D;
        parent.addChild(dialogNode);

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
        instantiatePrefabButton("Prefabs/Canvas/Button-Yes", winNode, -80, -60, () => {
            const data = DataManager.instance.data;
            if (data.money >= cost) {
                DataManager.instance.addResource("money", -cost);
                SoundManager.instance.playSE("upgrade", "System");
                // Heal logic
                DataManager.instance.setHp(data.maxHp);
                if (UIManager.instance && UIManager.instance.sideBarUI) {
                    UIManager.instance.sideBarUI.updateHP(data.maxHp, data.maxHp);
                    UIManager.instance.sideBarUI.updateShipInfo();
                }
                this.refreshUI();
                dialogNode.destroy();
            } else {
                SoundManager.instance.playSE("error", "System");
                console.warn("[HomeUI] Not enough credits for repair.");
            }
        }, dialogNode, "YES", Color.GREEN, 0.5, 0.65);

        // NO Button
        instantiatePrefabButton("Prefabs/Canvas/Button-No", winNode, 80, -60, () => {
            SoundManager.instance.playSE("cansel", "System");
            dialogNode.destroy();
        }, dialogNode, "NO", Color.RED, 0.5, 0.65);

        // Nodes created via `new Node(...)` default to the DEFAULT layer and don't
        // inherit it from their parent - without this, Window/Text/Buttons are built
        // but invisible to MainCamera's UI_2D-only visibility mask.
        this.forceUILayer(dialogNode);
    }

    /** Recursively force a node subtree onto the UI_2D layer so MainCamera can see it. */
    private forceUILayer(node: Node) {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) {
            this.forceUILayer(child);
        }
    }

    private videoBG = new VideoBackground();

    private setupVideoBackground() {
        // "HomeUi"(this.node) の親がプレハブの実質ルート(=シーンCanvas直下に追加されるノード)
        const parentNode = this.node.parent || this.node;
        const homeBG = parentNode.getChildByName("HomeBG");
        this.videoBG.setup(parentNode, "VideoBGSpriteNode", "Movies/BGV_Home", homeBG);
    }

    update(dt: number) {
        this.videoBG.updateFrame();
    }

    onDestroy() {
        this.videoBG.destroy();
    }
}
