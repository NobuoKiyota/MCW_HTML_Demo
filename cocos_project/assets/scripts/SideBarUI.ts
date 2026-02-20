import { _decorator, Component, Node, Label, Color, Sprite, UITransform, Size, Widget, Graphics, LabelOutline, resources, SpriteFrame } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { GameState } from './Constants';

const { ccclass, property } = _decorator;

/**
 * サイドバーのレイアウト設定
 * ここで表示順序や間隔を調整できます。
 */
const SIDEBAR_CONFIG = {
    // 左パネルの要素の表示順序
    // 'Mission', 'Speed', 'HP', 'BuffPower', 'BuffRapid' のいずれかを指定
    ORDER: [
        'Mission',
        'Speed',
        'HP',
        'BuffPower',
        'BuffRapid'
    ],

    // 開始位置（上からのオフセット）
    START_Y: 300,

    // 各要素間の基本マージン
    DEFAULT_GAP: 2,

    // 各要素の高さ設定（レイアウト計算用）
    HEIGHTS: {
        'Mission': 35,
        'Speed': 35,
        'HP': 35, // Label + Bar
        'BuffPower': 35, // Label + Bar
        'BuffRapid': 35  // Label + Bar
    },

    // セクションごとの追加パディング（必要に応じて調整）
    PADDING: {
        'Mission': 0,
        'Speed': 0,
        'HP': 10, // HPバーの下に少し余白
        'BuffPower': 10,
        'BuffRapid': 0
    }
};

@ccclass('SideBarUI')
export class SideBarUI extends Component {

    public static instance: SideBarUI;

    @property(Node)
    public leftPanel: Node = null;

    @property(Node)
    public rightPanel: Node = null;

    // --- Left Panel Elements (Mission & Player) ---
    @property(Label)
    public hpLabel: Label = null;
    private hpBarNode: Node = null;

    @property(Label)
    public buffPowerLabel: Label = null;
    private buffPowerBarNode: Node = null;

    @property(Label)
    public buffRapidLabel: Label = null;
    private buffRapidBarNode: Node = null;

    @property(Label)
    public missionLabel: Label = null; // DIST: XXXX km

    @property(Label)
    public speedLabel: Label = null; // SPD: XXXX km/h

    // --- Right Panel Elements (Ship Info) ---
    @property(Label)
    public shipNameLabel: Label = null;

    @property(Label)
    public shipStatsLabel: Label = null; // Level, EXP etc

    @property(Label)
    public cargoLabel: Label = null; // Cargo Weight / Capacity

    // State for Dynamic Layout
    private _isPowerActive: boolean = false;
    private _isRapidActive: boolean = false;

    onLoad() {
        SideBarUI.instance = this;
        this.setupNodes();
        this.updateLayout();
    }

    /**
     * ノードの生成または取得を行う
     */
    private setupNodes() {
        const sideWidth = 240;
        const innerWidth = 180; // 内部要素の最大幅（200から180に縮小して余裕を持たせる）

        // --- Left Panel ---
        if (!this.leftPanel) {
            this.leftPanel = this.createPanel("LeftPanel", sideWidth, true, new Color(0, 20, 50, 200));
            this.node.addChild(this.leftPanel);
            this.createPlate(this.leftPanel, 0, 160, 220, 180, new Color(0, 0, 0, 150));
        }

        // 手動でアサインされていない場合のみ生成
        if (!this.missionLabel) this.missionLabel = this.createLabel(this.leftPanel, "DESTINATION\n3000 km", 0, 0, 24, Color.WHITE, true);
        if (!this.speedLabel) this.speedLabel = this.createLabel(this.leftPanel, "SPD: 0 km/h", 0, 0, 24, Color.WHITE, true);
        if (!this.hpLabel) this.hpLabel = this.createLabel(this.leftPanel, "HP: 100/100", 0, 0, 24, Color.GREEN, true);
        if (!this.hpBarNode) this.hpBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 15, Color.GREEN);

        if (!this.buffPowerLabel) this.buffPowerLabel = this.createLabel(this.leftPanel, "POWER: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffPowerBarNode) this.buffPowerBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.RED);

        if (!this.buffRapidLabel) this.buffRapidLabel = this.createLabel(this.leftPanel, "RAPID: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffRapidBarNode) this.buffRapidBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.CYAN);

        // --- Right Panel ---
        if (!this.rightPanel) {
            this.rightPanel = this.createPanel("RightPanel", sideWidth, false, new Color(0, 20, 50, 200));
            this.node.addChild(this.rightPanel);
        }

        if (!this.shipNameLabel) this.shipNameLabel = this.createLabel(this.rightPanel, "SS-ALPHA-01", 0, 300, 28, Color.CYAN, false);
        if (!this.shipStatsLabel) this.shipStatsLabel = this.createLabel(this.rightPanel, "CREDITS: 0\nTOTAL DIST: 0 km", 0, 100, 20, Color.WHITE, false);
        if (!this.cargoLabel) this.cargoLabel = this.createLabel(this.rightPanel, "CARGO: EMPTY", 0, -100, 20, Color.YELLOW, false);
    }

    /**
     * 現在の状態（Active/Inactive）に基づいてレイアウトを再計算
     */
    private updateLayout() {
        if (!this.leftPanel) return;

        let currentY = SIDEBAR_CONFIG.START_Y;
        const panelWidth = 240;
        const margin = 20;
        // 左パネルのラベル開始位置：パネルの左端(-120) + 余白(20) = -100
        const labelX = -panelWidth / 2 + margin;
        const barX = 0; // バーは中央揃え

        for (const type of SIDEBAR_CONFIG.ORDER) {
            const gap = SIDEBAR_CONFIG.DEFAULT_GAP;
            const height = SIDEBAR_CONFIG.HEIGHTS[type] || 30;
            const padding = SIDEBAR_CONFIG.PADDING[type] || 0;

            let isVisible = true;
            if (type === 'BuffPower') isVisible = this._isPowerActive;
            if (type === 'BuffRapid') isVisible = this._isRapidActive;

            if (isVisible) {
                switch (type) {
                    case 'Mission':
                        this.setNodeVisible(this.missionLabel?.node, true, labelX, currentY);
                        break;
                    case 'Speed':
                        this.setNodeVisible(this.speedLabel?.node, true, labelX, currentY);
                        break;
                    case 'HP':
                        this.setNodeVisible(this.hpLabel?.node, true, labelX, currentY);
                        this.setNodeVisible(this.hpBarNode, true, barX, currentY - 30);
                        break;
                    case 'BuffPower':
                        this.setNodeVisible(this.buffPowerLabel?.node, true, labelX, currentY);
                        this.setNodeVisible(this.buffPowerBarNode, true, barX, currentY - 25);
                        break;
                    case 'BuffRapid':
                        this.setNodeVisible(this.buffRapidLabel?.node, true, labelX, currentY);
                        this.setNodeVisible(this.buffRapidBarNode, true, barX, currentY - 25);
                        break;
                }
                currentY -= (height + gap + padding);
            } else {
                switch (type) {
                    case 'BuffPower':
                        this.setNodeVisible(this.buffPowerLabel?.node, false);
                        this.setNodeVisible(this.buffPowerBarNode, false);
                        break;
                    case 'BuffRapid':
                        this.setNodeVisible(this.buffRapidLabel?.node, false);
                        this.setNodeVisible(this.buffRapidBarNode, false);
                        break;
                }
            }
        }
    }

    private setNodeVisible(node: Node, visible: boolean, x: number = 0, y: number = 0) {
        if (node) {
            node.active = visible;
            if (visible) {
                node.setPosition(x, y);
            }
        }
    }

    private createPanel(name: string, w: number, isLeft: boolean, color: Color): Node {
        const node = new Node(name);
        const trans = node.addComponent(UITransform);
        trans.setContentSize(new Size(w, 720));

        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.top = 0;
        widget.bottom = 0;

        if (isLeft) {
            widget.isAlignLeft = true;
            widget.left = 0;
        } else {
            widget.isAlignRight = true;
            widget.right = 0;
        }

        const sprite = node.addComponent(Sprite);
        const path = isLeft ? "png/LeftSide" : "png/RightSide";

        resources.load(path + "/spriteFrame", SpriteFrame, (err, spriteFrame) => {
            if (err) {
                console.warn(`[SideBarUI] Failed to load spriteFrame: ${path}`, err);
                const bgNode = new Node("FallbackBG");
                node.addChild(bgNode);
                const gr = bgNode.addComponent(Graphics);
                gr.fillColor = color;
                gr.rect(-w / 2, -360, w, 720);
                gr.fill();
            } else {
                sprite.spriteFrame = spriteFrame;
            }
        });

        return node;
    }

    private createLabel(parent: Node, text: string, x: number, y: number, fontSize: number, color: Color, isLeft: boolean = true): Label {
        const node = new Node("Label");
        parent.addChild(node);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = color;
        label.lineHeight = fontSize + 4;

        // アンカーを設定して端に揃える
        const trans = node.getComponent(UITransform) || node.addComponent(UITransform);
        trans.setAnchorPoint(isLeft ? 0 : 1, 0.5);
        label.horizontalAlign = isLeft ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.RIGHT;

        const margin = 20;
        const panelWidth = 240;
        const posX = isLeft ? (-panelWidth / 2 + margin) : (panelWidth / 2 - margin);
        node.setPosition(posX, y);

        const outline = node.addComponent(LabelOutline);
        label.outlineColor = new Color(0, 0, 0, 255);
        label.outlineWidth = 2;

        return label;
    }

    private createBar(parent: Node, x: number, y: number, w: number, h: number, color: Color): Node {
        const bgNode = new Node("BarBG");
        parent.addChild(bgNode);
        bgNode.setPosition(x, y);

        const trans = bgNode.addComponent(UITransform);
        trans.setContentSize(w, h); // 明示的にサイズを設定

        // BG (中央の錨点はそのまま)
        const gr = bgNode.addComponent(Graphics);
        gr.fillColor = new Color(50, 50, 50, 255);
        gr.rect(-w / 2, -h / 2, w, h);
        gr.fill();

        // Fill Container
        const fillNode = new Node("BarFill");
        bgNode.addChild(fillNode);

        // Fillは左端を錨点にする
        const fillTrans = fillNode.addComponent(UITransform);
        fillTrans.setContentSize(w, h);
        fillTrans.setAnchorPoint(0, 0.5);
        fillNode.setPosition(-w / 2, 0);

        const fillGr = fillNode.addComponent(Graphics);
        fillGr.fillColor = color;
        fillGr.rect(0, -h / 2, w, h);
        fillGr.fill();

        return bgNode;
    }

    private createPlate(parent: Node, x: number, y: number, w: number, h: number, color: Color) {
        const node = new Node("Plate");
        parent.addChild(node);
        node.setPosition(x, y);
        node.setSiblingIndex(0);

        const gr = node.addComponent(Graphics);
        gr.fillColor = color;
        gr.rect(-w / 2, -h / 2, w, h);
        gr.fill();
    }

    start() {
        this.updateShipInfo();
        // 初期HPを一旦減った状態にする (ユーザーの要望)
        this.updateHP(40, 100);

        // 初期状態のミッション・速度表示
        this.updateMissionInfo(-1);
        this.updateSpeed(0);
    }

    public updateHP(current: number, max: number) {
        if (this.hpLabel) this.hpLabel.string = `HP: ${Math.floor(current)}/${max}`;
        if (this.hpBarNode) {
            const fill = this.hpBarNode.getChildByName("BarFill");
            if (fill) {
                const ratio = max > 0 ? (current / max) : 0;
                fill.setScale(ratio, 1, 1);
            }
        }
    }

    public updateBuffs(powerTime: number, rapidTime: number) {
        const maxDur = 10.0;
        let layoutChanged = false;

        // Power Check
        const isPowerActive = powerTime > 0;
        if (this._isPowerActive !== isPowerActive) {
            this._isPowerActive = isPowerActive;
            layoutChanged = true;
        }

        if (this.buffPowerLabel && isPowerActive) {
            this.buffPowerLabel.string = `POWER: ${powerTime.toFixed(1)}s`;
            this.buffPowerLabel.color = Color.RED;
        }
        if (this.buffPowerBarNode && isPowerActive) {
            const fill = this.buffPowerBarNode.getChildByName("BarFill");
            if (fill) {
                const ratio = (powerTime / maxDur);
                fill.setScale(Math.min(ratio, 1), 1, 1);
            }
        }

        // Rapid Check
        const isRapidActive = rapidTime > 0;
        if (this._isRapidActive !== isRapidActive) {
            this._isRapidActive = isRapidActive;
            layoutChanged = true;
        }

        if (this.buffRapidLabel && isRapidActive) {
            this.buffRapidLabel.string = `RAPID: ${rapidTime.toFixed(1)}s`;
            this.buffRapidLabel.color = Color.CYAN;
        }
        if (this.buffRapidBarNode && isRapidActive) {
            const fill = this.buffRapidBarNode.getChildByName("BarFill");
            if (fill) {
                const ratio = (rapidTime / maxDur);
                fill.setScale(Math.min(ratio, 1), 1, 1);
            }
        }

        if (layoutChanged) {
            this.updateLayout();
        }
    }

    public updateMissionInfo(dist: number) {
        if (!this.missionLabel) return;

        const isIngame = GameManager.instance && GameManager.instance.state === GameState.INGAME;
        if (!isIngame || dist < 0) {
            this.missionLabel.string = "DESTINATION\n--- km";
        } else {
            this.missionLabel.string = `DESTINATION\n${dist.toFixed(0)} km`;
        }
    }

    public updateSpeed(speed: number) {
        if (!this.speedLabel) return;

        const isIngame = GameManager.instance && GameManager.instance.state === GameState.INGAME;
        if (!isIngame || speed <= 0) {
            this.speedLabel.string = "SPD: 0 km/h";
        } else {
            const displaySpeed = Math.floor(speed * 100);
            this.speedLabel.string = `SPD: ${displaySpeed} km/h`;
        }
    }

    public updateShipInfo() {
        const data = DataManager.instance ? DataManager.instance.data : null;
        if (!data) return;

        if (this.shipNameLabel) {
            this.shipNameLabel.string = "SS-ALPHA-01";
        }

        if (this.shipStatsLabel) {
            const money = data.money || 0;
            const totalDist = data.careerStats ? data.careerStats.totalDistance : 0;
            this.shipStatsLabel.string = `CREDITS: ${money}\nTOTAL DIST: ${totalDist} km\n`;
        }
    }
}
