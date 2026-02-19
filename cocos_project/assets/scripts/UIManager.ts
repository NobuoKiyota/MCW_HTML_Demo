import { _decorator, Component, Node, Label, Tween, tween, v3, UIOpacity, director, LabelOutline, Color, UITransform, Vec3 } from 'cc';
import { SideBarUI } from './SideBarUI';
import { SettingsManager } from './SettingsManager';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

    public static instance: UIManager;

    // @property(Label)
    // public distLabel: Label = null; // Removed

    // @property(Label)
    // public speedLabel: Label = null; // Removed

    @property(Node)
    public gameOverPanel: Node = null;

    @property(Node)
    public resultPanel: Node = null;

    @property(Node)
    public notificationLayer: Node = null;

    // --- Notification Configs ---
    @property({ tooltip: "Notification Font Size" })
    public notifyFontSize: number = 24;

    @property({ tooltip: "Notification Display Duration (seconds)" })
    public notifyDuration: number = 2.0;

    @property({ tooltip: "Outline Width for Glowing Effect" })
    public outlineWidth: number = 2;

    @property(Color)
    public notifyTextColor: Color = new Color(0, 0, 0, 255); // 文字本体の色 (デフォルト黒)

    // --- SideBar Integration ---
    @property({ type: SideBarUI })
    public sideBarUI: SideBarUI = null;

    onLoad() {
        if (UIManager.instance && UIManager.instance !== this) {
            this.node.destroy();
            return;
        }
        UIManager.instance = this;
        // director.addPersistRootNode(this.node); // Removed for Single Scene Architecture

        this.resolveReferences();

        // Force settings application (Resolution etc)
        SettingsManager.instance.applySettings();

        // Refresh Sidebar stats (Credit, Dist etc)
        if (this.sideBarUI) {
            this.sideBarUI.updateShipInfo();
        }
    }

    /**
     * 新しいシーンに合わせてパネルなどの参照を再取得する
     */
    public resolveReferences() {
        const sceneName = director.getScene().name;
        console.log(`[UIManager] Resolving references for scene: ${sceneName}`);

        const canvas = director.getScene().getChildByName("Canvas");
        if (!canvas) return;

        // パネル類の再取得
        if (!this.gameOverPanel || !this.gameOverPanel.isValid) {
            this.gameOverPanel = canvas.getChildByName("GameOverPanel") || canvas.getChildByPath("UILayer/GameOverPanel");
        }
        if (!this.resultPanel || !this.resultPanel.isValid) {
            this.resultPanel = canvas.getChildByName("ResultPanel") || canvas.getChildByPath("UILayer/ResultPanel");
        }
        if (!this.notificationLayer || !this.notificationLayer.isValid) {
            this.notificationLayer = canvas.getChildByName("NotificationLayer") || canvas.getChildByPath("UILayer/NotificationLayer") || canvas;
        }

        if (this.gameOverPanel) this.gameOverPanel.active = false;
        if (this.resultPanel) this.resultPanel.active = false;

        // Auto-create SideBarUI if not assigned
        if (!this.sideBarUI) {
            console.log(`[UIManager] SideBarUI not assigned. Creating child of UIManager.`);
            const node = new Node("SideBarUI");
            this.node.addChild(node);
            this.sideBarUI = node.addComponent(SideBarUI);
        }
    }

    public updateHP(currentHp: number, maxHp: number) {
        if (this.sideBarUI) {
            this.sideBarUI.updateHP(currentHp, maxHp);
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
        if (this.sideBarUI) {
            this.sideBarUI.updateMissionInfo(distance);
        }
    }

    public updateSpeed(speed: number) {
        if (this.sideBarUI) {
            this.sideBarUI.updateSpeed(speed);
        }
    }

    public updateBuffs(powerTime: number, rapidTime: number) {
        // SideBar UI
        if (this.sideBarUI) {
            this.sideBarUI.updateBuffs(powerTime, rapidTime);
        }
    }

    private getRarityColor(rarity: number): Color {
        switch (rarity) {
            case 5: return new Color(255, 215, 0, 255);   // Gold
            case 4: return new Color(180, 50, 255, 255);  // Purple
            case 3: return new Color(50, 150, 255, 255);  // Blue
            case 2: return new Color(100, 255, 50, 255);  // Green
            default: return new Color(255, 255, 255, 255); // White
        }
    }

    /**
     * バフ取得時などの強調通知を表示
     */
    public showBuffNotification(text: string, color: Color, pos: Vec3) {
        this.showItemLog(text, 5, pos, color);
    }

    /**
     * 指定された位置へ通知を表示
     */
    public showItemLog(text: string, rarity: number = 1, pos?: Vec3, customColor?: Color) {
        if (!this.notificationLayer) return;

        const textColor = customColor || this.getRarityColor(rarity);

        // --- 1. Notification Container ---
        const node = new Node("Notification");
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        // --- 2. Text Label ---
        const labelNode = new Node("Label");
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = this.notifyFontSize;
        label.color = this.notifyTextColor;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        // Outline for Glowing Effect
        const outline = labelNode.addComponent(LabelOutline);
        if (outline) {
            outline.color = textColor;
            outline.width = this.outlineWidth;
        }

        labelNode.parent = node;

        // --- 3. Position Calculation ---
        let startPos = v3(0, 0, 0);
        if (pos) {
            const uiTransform = this.notificationLayer.getComponent(UITransform);
            startPos = uiTransform.convertToNodeSpaceAR(pos);
            startPos.y += 40;
        }

        // --- 4. Opacity & Lifetime ---
        const op = node.addComponent(UIOpacity);
        op.opacity = 255 * 0.75;

        node.parent = this.notificationLayer;
        node.setPosition(startPos);

        // Animation: Slide Up & Fade Out
        const targetY = startPos.y + 60;

        tween(node)
            .to(0.4, { position: v3(startPos.x, targetY, 0) }, { easing: "sineOut" })
            .delay(this.notifyDuration)
            .to(0.8, { position: v3(startPos.x, targetY + 80, 0) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();

        tween(op)
            .delay(this.notifyDuration)
            .to(0.8, { opacity: 0 })
            .start();

        // Safety Destruction
        this.scheduleOnce(() => {
            if (node.isValid) node.destroy();
        }, this.notifyDuration + 2.0);
    }

    public onRetryClicked() {
        director.emit("GAME_RETRY");
    }

    public onTitleClicked() {
        director.emit("GAME_TITLE");
    }
}
