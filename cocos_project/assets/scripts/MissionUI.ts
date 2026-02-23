import { _decorator, Component, Node, Label, Color, Sprite, UITransform, Size, Widget, Graphics, LabelOutline, Button, EventHandler, BlockInputEvents, instantiate, Vec3, director, RichText } from 'cc';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';
import { DataManager } from './DataManager';
import { GameDatabase } from './GameDatabase';
import { IMissionData } from './Constants';

const { ccclass, property } = _decorator;

// MISSION_LIST is now loaded from GameDatabase (CSV)

@ccclass('MissionUI')
export class MissionUI extends Component {

    private contentNode: Node = null;
    private dialogNode: Node = null;

    private displayedMissions: IMissionData[] = [];

    onLoad() {
        // Force to center (0,0) if added to Canvas
        if (this.node.parent && this.node.parent.name === "Canvas") {
            this.node.setPosition(0, 0, 0);
        }

        // 全画面を覆ってタッチイベントをブロック（モーダル化）
        this.setupModalBackground();

        // データベースの準備を待ってから表示
        this.schedule(this.checkDatabaseAndInit, 0.1);
    }

    private checkDatabaseAndInit() {
        const db = GameDatabase.instance;
        if (db && db.isReady) {
            this.unschedule(this.checkDatabaseAndInit);
            this.shuffleMissions();
            this.initUI();
        }
    }

    private shuffleMissions() {
        const db = GameDatabase.instance;
        if (!db || !db.missions || db.missions.length === 0) return;

        // Clone and Shuffle
        const all = [...db.missions];
        for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [all[i], all[j]] = [all[j], all[i]];
        }

        // Pick top 3
        this.displayedMissions = all.slice(0, 3);
        console.log(`[MissionUI] Shuffled missions. Displaying: ${this.displayedMissions.map(m => m.id).join(", ")}`);
    }

    private initUI() {
        // コンテンツコンテナ
        this.setupContent();

        // ミッションボタン生成
        this.createMissionButtons();

        // 閉じるボタン
        this.createCloseButton();

        // 再抽選ボタン
        this.createReselectButton();
    }

    private setupModalBackground() {
        // Widgetで全画面化
        const widget = this.node.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;

        // タッチブロック
        this.node.addComponent(BlockInputEvents);

        // 半透明黒背景
        const gr = this.node.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 220);
        gr.rect(-2000, -2000, 4000, 4000); // 簡易的に大きく
        gr.fill();
    }

    private setupContent() {
        if (this.contentNode) {
            this.contentNode.destroy();
        }
        this.contentNode = new Node("Content");
        this.node.addChild(this.contentNode);

        // 配置を中央に（親ノードが中央にある前提）
        this.contentNode.setPosition(0, 0);
    }

    private createMissionButtons() {
        let y = 150;
        const gap = 110;

        // タイトル
        const titleNode = new Node("Title");
        this.contentNode.addChild(titleNode);
        titleNode.setPosition(0, 250);
        const lbl = titleNode.addComponent(Label);
        lbl.string = "SELECT MISSION";
        lbl.fontSize = 40;
        const out = titleNode.addComponent(LabelOutline);
        out.width = 2;

        this.displayedMissions.forEach((mission, index) => {
            this.createButton(mission, 0, y);
            y -= gap;
        });
    }

    private createReselectButton() {
        const btnNode = new Node("ReselectBtn");
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(0, -240); // 画面下部

        const w = 240;
        const h = 60;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(100, 100, 100);
        gr.roundRect(-w / 2, -h / 2, w, h, 10);
        gr.fill();
        gr.strokeColor = Color.YELLOW;
        gr.lineWidth = 3;
        gr.stroke();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = "RESELECT";
        lbl.fontSize = 28;
        lbl.color = Color.YELLOW;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;

        btnNode.on(Button.EventType.CLICK, () => {
            SoundManager.instance.playSE("click");
            this.shuffleMissions();
            this.initUI();
        }, this);
    }

    private createButton(mission: IMissionData, x: number, y: number) {
        const btnNode = new Node(`MissionBtn_${mission.id}`);
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        // 背景 (Graphics)
        const w = 600;
        const h = 80;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(0, 100, 200, 255);
        gr.roundRect(-w / 2, -h / 2, w, h, 10);
        gr.fill();
        // 枠線
        gr.strokeColor = Color.WHITE;
        gr.lineWidth = 2;
        gr.stroke();

        // ボタンコンポーネント(クリック判定用 - 遷移アニメーション等に使う)
        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        // Nodeイベントでクリックをリッスン (EventHandlerを使わない)
        btnNode.on(Button.EventType.CLICK, () => {
            this.onMissionClicked(mission);
        }, this);

        // ラベル
        const labelNode = new Node("Label");
        btnNode.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.fontSize = 20; // Slightly smaller to fit info
        label.color = Color.WHITE;

        // 敵リストを表示しない
        // const enemies = mission.enemyPattern.length > 3 ? 
        //     `${mission.enemyPattern.slice(0, 2).join(", ")}...` : 
        //     mission.enemyPattern.join(", ");

        label.string = `★${mission.stars}  DIST: ${mission.distance}km  TIME: ${mission.targetTime}s  CARGO: ${mission.cargoWeight}`;
        label.lineHeight = 40; // 1行表示のため調整
    }

    private createCloseButton() {
        const btnNode = new Node("CloseBtn");
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(350, 250); // 右上

        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = Color.RED;
        gr.circle(0, 0, 25);
        gr.fill();
        gr.strokeColor = Color.WHITE;
        gr.lineWidth = 2;
        gr.stroke();

        const lblNode = new Node("X");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = "X";
        lbl.fontSize = 30;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;

        btnNode.on(Button.EventType.CLICK, () => {
            this.close();
        }, this);
    }

    // --- Events ---

    public onMissionClicked(mission: IMissionData) {
        SoundManager.instance.playSE("click");
        this.showConfirmDialog(mission);
    }

    public close() {
        SoundManager.instance.playSE("click");
        this.node.destroy();
    }

    // --- Confirm Dialog ---

    private showConfirmDialog(mission: IMissionData) {
        if (this.dialogNode) {
            this.dialogNode.destroy();
        }

        // 半透明背景（さらに上）
        this.dialogNode = new Node("Dialog");
        this.node.addChild(this.dialogNode);

        // 背景
        const bg = this.dialogNode.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 20, 240);
        bg.rect(-2000, -2000, 4000, 4000); // 全画面ブロック
        bg.fill();

        // タッチブロック
        this.dialogNode.addComponent(BlockInputEvents);

        // ウィンドウ
        const winNode = new Node("Window");
        this.dialogNode.addChild(winNode);
        const gr = winNode.addComponent(Graphics);
        gr.fillColor = new Color(50, 50, 50, 255);
        gr.roundRect(-300, -200, 600, 400, 10); // Enlarged to 600x400
        gr.fill();
        gr.strokeColor = Color.CYAN;
        gr.lineWidth = 3;
        gr.stroke();

        // テキスト
        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 80);
        const richText = txtNode.addComponent(RichText);
        richText.fontSize = 24;
        richText.maxWidth = 500;
        richText.horizontalAlign = RichText.HorizontalAlign.CENTER;

        // Check for HP0
        const currentHp = DataManager.instance ? DataManager.instance.data.hp : 100;
        const isHpZero = currentHp <= 0;

        if (isHpZero) {
            richText.string = `<outline color=#000000 width=3><color=#ff4444>HP is 0!</color>\nRepair is required before departure.\nPlease return and restore HP.</outline>`;

            // BACK Button only
            this.createDialogButton(winNode, "BACK", 0, -120, Color.GRAY, () => {
                SoundManager.instance.playSE("click");
                if (this.dialogNode) {
                    this.dialogNode.destroy();
                    this.dialogNode = null;
                }
            });
        } else {
            // Check for overload
            const capacity = (DataManager.instance as any).data.capacity || 50;
            const isOverloaded = (mission.cargoWeight || 0) > capacity;
            const warning = isOverloaded ?
                `<color=#ff4444>\nWARNING: Cargo exceeds capacity!\nFirepower will be REDUCED.</color>` : "";

            richText.string = `<outline color=#000000 width=3>Start Mission?\nDistance: ${mission.distance}km\nCargo: ${mission.cargoWeight} / Cap: ${capacity}${warning}\nProceed?</outline>`;

            // YES Button
            this.createDialogButton(winNode, "YES", -120, -120, Color.GREEN, () => {
                SoundManager.instance.playSE("click");
                this.startGame(mission);
            });

            // NO Button
            this.createDialogButton(winNode, "NO", 120, -120, Color.RED, () => {
                SoundManager.instance.playSE("click");
                if (this.dialogNode) {
                    this.dialogNode.destroy();
                    this.dialogNode = null;
                }
            });
        }
    }

    private createDialogButton(parent: Node, text: string, x: number, y: number, color: Color, onClick: () => void) {
        const btnNode = new Node("Btn" + text);
        parent.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 120;
        const h = 50;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = color;
        gr.roundRect(-w / 2, -h / 2, w, h, 5);
        gr.fill();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;

        btnNode.on(Button.EventType.CLICK, onClick, this);
    }

    private startGame(mission: IMissionData) {
        if (GameManager.instance) {
            GameManager.instance.startInGame(mission);
            // HomeUIも閉じる必要がある？ -> シーン遷移すれば不要だが、Prefab切り替えなので、
            // GameManager側でHomePrefabを消してIngamePrefabを出す処理が走る。
            // ただしMissionUIはHomeUI（またはManager）の子として作られる。
            // Managerの子ならIngame遷移時に消えない可能性があるので、手動で消すのが安全。
        }
        if (this.node.isValid) {
            this.node.destroy();
        }
    }
}
