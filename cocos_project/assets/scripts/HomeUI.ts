import { _decorator, Component, Node, Label, director, Button, Graphics, Color, BlockInputEvents, UITransform, Size, LabelOutline, Layers } from 'cc';
import { GameManager } from './GameManager';
import { VideoBackground } from './VideoBackground';
import { DataManager } from './DataManager';
import { OptionsUI } from './OptionsUI';
import { SoundManager } from './SoundManager';
import { UIManager } from './UIManager';
import { GameState } from './Constants';
import { PropertyUI } from './PropertyUI';
import { HistoryUI } from './HistoryUI';
import { UpgradeUI } from './UpgradeUI';
import { CustomizeUI } from './CustomizeUI';
import { instantiatePrefabButton } from './UIButtonPrefab';
import { AchievementManager } from './AchievementManager';
import { AchievementData } from './GameDataTypes';
import { showDialogPrefab } from './DialogPrefab';

const { ccclass, property } = _decorator;

@ccclass('HomeUI')
export class HomeUI extends Component {

    @property(Label)
    public sessionStatsLabel: Label = null;

    // Home画面は「ミッション結果→Home」「改造/装備購入(Home上のオーバーレイ操作)→Homeに居続ける」等、
    // 実績条件を満たしうる全ての操作の後に必ず戻ってくる/居続けるハブ画面である。実績判定
    // (AchievementManager.checkAndUnlock())をあちこちのアクション箇所に埋め込むのではなく、
    // このHome常駐の定期チェックポイント(start()時+update()のスロットル監視)1箇所に集約する。
    // 将来「装備品が開発可能になった」アナウンス等も同じ仕組みに相乗りさせる想定。
    private static readonly ACHIEVEMENT_CHECK_INTERVAL_SEC = 1.0;
    private _achievementCheckTimer: number = 0;

    start() {
        this.setupVideoBackground();
        this.refreshUI();
        this.checkAchievements();

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
     * ミッション開始ボタン。実体はUIManager.openMissionUI()に一本化した
     * (SideBarUI.onMissionLabelClicked()経由の入り口と重複実装していたのを統合、
     * 多重生成ガード・レイヤー設定・SE再生もそちら側だけで完結する)。
     */
    public onStartMissionClicked() {
        console.log("[HomeUI] Opening MissionUI...");
        if (UIManager.instance) {
            UIManager.instance.openMissionUI();
        } else {
            console.warn("[HomeUI] UIManager instance not found, cannot open MissionUI.");
        }
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
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        const parent = canvasNode || this.node;

        // showRepairConfirmDialog()と同じ多重生成ガード(連打で何枚も積み重なるのを防ぐ)。
        const existing = parent.getChildByName("ResetDialog");
        if (existing) existing.destroy();

        const dialogNode = new Node("ResetDialog");
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
            SoundManager.instance.playSE("click"); // NOでclick音(Sounds.csvに"cancel"は無い)
            dialogNode.destroy();
        }, dialogNode, "NO", Color.GRAY, 0.5, 0.65);
    }

    /**
     * Propertyボタン
     */
    public onPropertyClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Opening PropertyUI...");
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        const parent = canvasNode || this.node;

        // onStartMissionClicked()と同じ多重生成ガード(連打で何枚も積み重なるのを防ぐ)。
        // 他画面(MissionUI/CustomizeUI等)との相互排他はPropertyUI.onLoad()が
        // UIManager.notifyOverlayOpening()経由で行う。
        const existing = parent.getChildByName("PropertyUI");
        if (existing) existing.destroy();

        const node = new Node("PropertyUI");
        parent.addChild(node);
        node.addComponent(PropertyUI);
    }

    /**
     * Historyボタン
     */
    public onHistoryClicked() {
        SoundManager.instance.playSE("click");
        console.log("[HomeUI] Opening HistoryUI...");
        const sceneRoot = director.getScene();
        const canvasNode = sceneRoot?.getChildByName("Canvas");
        const parent = canvasNode || this.node;

        const existing = parent.getChildByName("HistoryUI");
        if (existing) existing.destroy();

        const node = new Node("HistoryUI");
        parent.addChild(node);
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
            SoundManager.instance.playSE("click"); // Sounds.csvに"cancel"は無い
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

        this._achievementCheckTimer += dt;
        if (this._achievementCheckTimer >= HomeUI.ACHIEVEMENT_CHECK_INTERVAL_SEC) {
            this._achievementCheckTimer = 0;
            this.checkAchievements();
        }
    }

    // AchievementManager.checkAndUnlock()を呼ぶ唯一のcall site。新規達成があれば、専用ダイアログ+
    // 専用SEで通知する(複数件は1つのダイアログにまとめて表示 = 報酬は既にcheckAndUnlock()側で合算済み)。
    private checkAchievements() {
        const unlocked = AchievementManager.instance.checkAndUnlock();
        if (unlocked.length === 0) return;
        this.showAchievementDialog(unlocked);
        SoundManager.instance.playSE("SE_AchievementUnlock", "System");
    }

    // 実績が複数まとめて解放された場合(要件: 複数達成分を合算して1回のダイアログで通知)、
    // タイトル一覧+報酬一覧が伸びるぶんウィンドウサイズもOKボタンのY座標も足りなくなり見切れていた
    // (DialogWindow.prefab側のBody/Titleは固定レイアウトのPrefabで、行数に応じて自動調整されない)。
    // DialogWindow.prefabのBody RichTextの既定行高24px(1行1件になるよう報酬も" / "区切りではなく
    // 改行区切りにして折り返し幅に依存しない確定行数にする)を基準に、行数からウィンドウ高さと
    // OKボタンのY座標を逆算する。件数が極端に多い場合は末尾を省略表示する(スクロール等は導入しない)。
    private static readonly ACHIEVEMENT_DIALOG_LINE_HEIGHT = 24;
    private static readonly ACHIEVEMENT_DIALOG_MAX_TITLE_LINES = 10;
    private static readonly ACHIEVEMENT_DIALOG_MAX_REWARD_LINES = 8;

    private showAchievementDialog(unlocked: AchievementData[]) {
        let totalCredits = 0;
        const itemLines: string[] = [];
        for (const ach of unlocked) {
            totalCredits += ach.rewardCredits || 0;
            for (const it of ach.rewardItems || []) {
                itemLines.push(`${it.itemId} x${it.qty}`);
            }
        }

        let titleLinesArr = unlocked.map(a => `・${a.label}`);
        if (titleLinesArr.length > HomeUI.ACHIEVEMENT_DIALOG_MAX_TITLE_LINES) {
            const hidden = titleLinesArr.length - HomeUI.ACHIEVEMENT_DIALOG_MAX_TITLE_LINES;
            titleLinesArr = titleLinesArr.slice(0, HomeUI.ACHIEVEMENT_DIALOG_MAX_TITLE_LINES);
            titleLinesArr.push(`…ほか${hidden}件`);
        }

        const rewardParts: string[] = [];
        if (totalCredits > 0) rewardParts.push(`Credit +${totalCredits}`);
        rewardParts.push(...itemLines);
        let rewardLinesArr = rewardParts;
        if (rewardLinesArr.length > HomeUI.ACHIEVEMENT_DIALOG_MAX_REWARD_LINES) {
            const hidden = rewardLinesArr.length - HomeUI.ACHIEVEMENT_DIALOG_MAX_REWARD_LINES;
            rewardLinesArr = rewardLinesArr.slice(0, HomeUI.ACHIEVEMENT_DIALOG_MAX_REWARD_LINES);
            rewardLinesArr.push(`…ほか${hidden}件`);
        }

        const bodySections = [titleLinesArr.join("\n")];
        if (rewardLinesArr.length > 0) bodySections.push(`報酬:\n${rewardLinesArr.join("\n")}`);
        const body = bodySections.join("\n\n");

        // DialogWindow.prefab既定(Body Y=-30、行高24px)を基準に、行数ぶん(タイトル+空行+
        // "報酬:"見出し+報酬各行)だけBodyの下端がどこまで伸びるかを計算し、OKボタン・ウィンドウ高さを
        // それに応じて広げる(小さい実績1〜2件のケースでは従来通りの見た目のまま)。
        const lineCount = titleLinesArr.length + (rewardLinesArr.length > 0 ? 2 + rewardLinesArr.length : 0);
        const lh = HomeUI.ACHIEVEMENT_DIALOG_LINE_HEIGHT;
        const bodyHeight = lineCount * lh;
        const bodyBottomY = -30 - bodyHeight / 2;
        const buttonY = Math.min(-110, bodyBottomY - 45);
        const windowHeight = Math.max(320, (Math.abs(buttonY) + 60) * 2);

        let dialogNodeRef: Node = null;
        showDialogPrefab(this.node, "実績解放!", body, [
            {
                prefabPath: "Prefabs/Canvas/Button-Yes", x: 0, y: buttonY, label: "OK",
                color: new Color(255, 200, 60),
                onClick: () => { if (dialogNodeRef && dialogNodeRef.isValid) dialogNodeRef.destroy(); },
            },
        ], (node) => { dialogNodeRef = node; }, { width: 560, height: windowHeight });
    }

    onDestroy() {
        this.videoBG.destroy();
    }
}
