import { _decorator, Component, Node, ProgressBar, Label, Tween, tween, v3, UIOpacity, director, LabelOutline, Color, Graphics, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

    public static instance: UIManager;

    @property(ProgressBar)
    public hpBar: ProgressBar = null;

    @property(Label)
    public distLabel: Label = null;

    @property(Label)
    public speedLabel: Label = null;

    @property(Node)
    public gameOverPanel: Node = null;

    @property(Node)
    public resultPanel: Node = null;

    // Buff UI (Labels)
    @property(Label)
    public buffPowerLabel: Label = null;

    @property(Label)
    public buffRapidLabel: Label = null;

    // Buff UI (Gauges)
    @property(ProgressBar)
    public buffPowerBar: ProgressBar = null;

    @property(ProgressBar)
    public buffRapidBar: ProgressBar = null;

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
            const distStr = distance.toFixed(2);
            const padded = ("00000000" + distStr).slice(-8);
            this.distLabel.string = `DIST: ${padded} km`;
        }
    }

    public updateSpeed(speed: number) {
        if (this.speedLabel) {
            const displaySpeed = Math.floor(speed * 100);
            const speedStr = displaySpeed.toString();
            const padded = ("0000" + speedStr).slice(-4);
            this.speedLabel.string = `SPD: ${padded} km/h`;
        }
    }

    /**
     * バフの残り時間を更新。ProgressBarがあればゲージとして表示。
     */
    public updateBuffs(powerTime: number, rapidTime: number) {
        const maxDur = 10.0;

        // 1. Power
        if (this.buffPowerLabel) {
            this.buffPowerLabel.node.active = (powerTime > 0);
            if (powerTime > 0) this.buffPowerLabel.string = `BuffPower: ${powerTime.toFixed(1)}s`;
        }
        if (this.buffPowerBar) {
            this.buffPowerBar.node.active = (powerTime > 0);
            this.buffPowerBar.progress = Math.min(powerTime / maxDur, 1.0);
        }

        // 2. Rapid
        if (this.buffRapidLabel) {
            this.buffRapidLabel.node.active = (rapidTime > 0);
            if (rapidTime > 0) this.buffRapidLabel.string = `BuffSpeed: ${rapidTime.toFixed(1)}s`;
        }
        if (this.buffRapidBar) {
            this.buffRapidBar.node.active = (rapidTime > 0);
            this.buffRapidBar.progress = Math.min(rapidTime / maxDur, 1.0);
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
     * @param text 表示テキスト
     * @param rarity レア度 (1-5)
     * @param pos 取得場所の座標 (Vec3)
     * @param customColor カスタムカラー
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
        label.color = this.notifyTextColor; // 文字を黒（または背景色）にする
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
