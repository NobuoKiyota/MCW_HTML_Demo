import { _decorator, Component, Node, Label, Tween, tween, v3, UIOpacity, director, LabelOutline, Color, UITransform, Vec3, Widget, Camera, Button, BlockInputEvents } from 'cc';
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
        console.log("[UIManager] onLoad triggered.");
        if (!UIManager.instance || !UIManager.instance.isValid) {
            UIManager.instance = this;
            console.log("[UIManager] Singleton initialized.");
        } else if (UIManager.instance !== this) {
            console.warn("[UIManager] Duplicate instance detected. Destroying...");
            this.node.destroy();
            return;
        }
        // director.addPersistRootNode(this.node); // Removed for Single Scene Architecture

        // Reset to (0, 0) to align with Cocos Creator 3.x standards
        this.node.setPosition(0, 0, 0);

        this.resolveReferences();

        // Force settings application (Resolution etc)
        console.log("[UIManager] Requesting SettingsManager.applySettings()");
        SettingsManager.instance.applySettings();
        console.log("[UIManager] Settings applied.");

        // Refresh Sidebar stats (Credit, Dist etc)
        if (this.sideBarUI) {
            this.sideBarUI.updateShipInfo();
        }
    }

    onDestroy() {
        if (UIManager.instance === this) {
            UIManager.instance = null;
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

        // Apply (0, 0) to Canvas and Camera
        canvas.setPosition(640, 360, 0);

        // Find camera and set to (0, 0)
        const camera = director.getScene().getComponentInChildren(Camera);
        if (camera) {
            camera.node.setPosition(640, 360, camera.node.position.z);
        }

        // --- Improved Recursive Node Search ---
        const findNodeRecursive = (node: Node, name: string): Node => {
            if (node.name === name) return node;
            for (let i = 0; i < node.children.length; ++i) {
                const res = findNodeRecursive(node.children[i], name);
                if (res) return res;
            }
            return null;
        };

        // パネル類の再取得 (再帰検索)
        if (!this.gameOverPanel || !this.gameOverPanel.isValid) {
            this.gameOverPanel = findNodeRecursive(canvas, "GameOverPanel");
        }
        if (!this.resultPanel || !this.resultPanel.isValid) {
            this.resultPanel = findNodeRecursive(canvas, "ResultPanel");
        }
        if (!this.notificationLayer || !this.notificationLayer.isValid) {
            this.notificationLayer = findNodeRecursive(canvas, "NotificationLayer") || canvas;
        }

        const ensurePanelReady = (panel: Node) => {
            if (!panel) return;
            // Ensure on top
            panel.setSiblingIndex(canvas.children.length - 1);
            // Block input background
            if (!panel.getComponent(BlockInputEvents)) {
                panel.addComponent(BlockInputEvents);
            }
        };

        const bindButton = (panel: Node, name: string, callback: Function) => {
            const btnNode = findNodeRecursive(panel, name);
            if (btnNode) {
                console.log(`[UIManager] Binding ${name} in ${panel.name}`);
                // Use Button component if exists, otherwise TOUCH_END fallback
                const btn = btnNode.getComponent(Button);
                if (btn) {
                    btnNode.on(Button.EventType.CLICK, callback, this);
                } else {
                    btnNode.on(Node.EventType.TOUCH_END, callback, this);
                }
            } else {
                console.warn(`[UIManager] ${name} NOT FOUND in ${panel.name}`);
            }
        };

        if (this.gameOverPanel) {
            console.log("[UIManager] GameOverPanel found.");
            this.gameOverPanel.active = false;
            ensurePanelReady(this.gameOverPanel);

            bindButton(this.gameOverPanel, "RetryButton", this.onRetryClicked);
            bindButton(this.gameOverPanel, "TitleButton", this.onTitleClicked);
        } else {
            console.warn("[UIManager] GameOverPanel NOT FOUND even with recursive search!");
            this.dumpCanvasChildren(canvas);
        }

        if (this.resultPanel) {
            console.log("[UIManager] ResultPanel found.");
            this.resultPanel.active = false;
            ensurePanelReady(this.resultPanel);

            // Bind Home/Title in result if needed
            bindButton(this.resultPanel, "HomeButton", this.onTitleClicked);
            bindButton(this.resultPanel, "TitleButton", this.onTitleClicked);
        } else {
            console.warn("[UIManager] ResultPanel NOT FOUND even with recursive search!");
            if (!this.gameOverPanel) this.dumpCanvasChildren(canvas);
        }

        // Reset ContentRoot in scene if it exists (e.g. scene-Main)
        const contentRoot = canvas.getChildByName("ContentRoot");
        if (contentRoot) {
            contentRoot.setPosition(0, 0, 0);
        }

        // Auto-create SideBarUI if not assigned
        if (!this.sideBarUI) {
            console.log(`[UIManager] SideBarUI not assigned. Creating child of UIManager.`);
            const node = new Node("SideBarUI");
            this.node.addChild(node);

            const trans = node.addComponent(UITransform);
            const widget = node.addComponent(Widget);
            widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
            widget.top = widget.bottom = widget.left = widget.right = 0;

            this.sideBarUI = node.addComponent(SideBarUI);
        }

        // Ensure SideBarUI is on top of Canvas content
        if (this.sideBarUI && canvas) {
            if (this.sideBarUI.node.parent !== canvas) {
                this.sideBarUI.node.parent = canvas;
            }
            const lastIndex = canvas.children.length - 1;
            this.sideBarUI.node.setSiblingIndex(lastIndex);

            const widget = this.sideBarUI.getComponent(Widget);
            if (widget) {
                widget.updateAlignment();
            }
        }
    }

    private dumpCanvasChildren(canvas: Node) {
        console.log("--- Exhaustive Node Dump for Canvas ---");
        const dump = (node: Node, indent: string, depth: number) => {
            if (depth > 4) return;
            console.log(`${indent}${node.name} (active:${node.active})`);
            for (const child of node.children) {
                dump(child, indent + "  ", depth + 1);
            }
        };
        dump(canvas, "", 0);
        console.log("---------------------------------------");
    }

    public updateHP(currentHp: number, maxHp: number) {
        if (this.sideBarUI) {
            this.sideBarUI.updateHP(currentHp, maxHp);
        }
    }

    public showGameOver() {
        if (this.gameOverPanel) {
            // Apply coordinates in case it's not set
            this.gameOverPanel.setPosition(0, 0, 0);
            this.gameOverPanel.active = true;
        }
    }

    public showResult() {
        if (this.resultPanel) {
            // Apply coordinates in case it's not set
            this.resultPanel.setPosition(0, 0, 0);
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
        let startPos = v3(0, 0, 0); // Center relative to Canvas (0,0)
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

    public spawnDamageText(x: number, y: number, amount: number, isKill: boolean) {
        if (!this.notificationLayer) return;

        // 1. Create Node
        const node = new Node("DamagePopup");
        node.layer = this.notificationLayer.layer;
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        // 2. Add Label
        const label = node.addComponent(Label);
        label.string = Math.floor(amount).toString();
        label.fontSize = 28;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = node.addComponent(LabelOutline);
        outline.width = 2;
        outline.color = Color.BLACK;

        // 3. Position and Parent
        // Position x, y is passed from Enemy (local to EnemyLayer @ 0,0)
        node.parent = this.notificationLayer;
        node.setPosition(x, y, 0);

        // 4. Initialize DamagePopup logic
        const popup = node.addComponent("DamagePopup") as any;
        const damageColor = isKill ? Color.RED : new Color(255, 200, 0, 255);
        if (popup && popup.init) {
            popup.init(amount, damageColor);
        }

        console.log(`[UIManager] Spawned Damage Text: ${amount} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
}
