import { _decorator, Component, Node, Label, Color, Sprite, UITransform, Size, Widget, Graphics, LabelOutline, resources, SpriteFrame } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { GameState, GAME_SETTINGS } from './Constants';
import { UIManager } from './UIManager';

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
        'Timer',
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
        'BuffRapid': 35, // Label + Bar
        'Timer': 35      // New
    },

    // セクションごとの追加パディング（必要に応じて調整）
    PADDING: {
        'Mission': 0,
        'Speed': 10,
        'Timer': 0,
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

    @property(Label)
    public timerLabel: Label = null; // TIME: 00:00

    // --- Right Panel Elements (Ship Info) ---
    @property(Label)
    public shipNameLabel: Label = null;

    @property(Label)
    public shipStatsLabel: Label = null; // Level, EXP etc

    @property(Label)
    public cargoLabel: Label = null; // Cargo Weight / Capacity

    @property(Label)
    public moneyTitleLabel: Label = null; // New: Display current credits in Right Panel

    // State for Dynamic Layout
    private _isPowerActive: boolean = false;
    private _isRapidActive: boolean = false;

    onLoad() {
        this.node.active = true;

        // ★Editor設定完全尊重（一切変更しない）
        if (SideBarUI.instance && SideBarUI.instance.isValid && SideBarUI.instance !== this) {
            SideBarUI.instance.node.destroy();
        }
        SideBarUI.instance = this;

        if (UIManager.instance) {
            UIManager.instance.sideBarUI = this;
        }

        // ★即時実行（scheduleOnce削除）
        console.log("[SideBarUI] onLoad pos:", this.node.getWorldPosition());
        this.setupNodes();
        this.updateLayout();
        this.updateShipInfo();
    }

    /**
     * ノードの生成または取得を行う
     */
    private setupNodes() {
        const sideWidth = 240;
        const innerWidth = 180;

        // LeftPanel（1回のみ）
        if (!this.leftPanel) {
            this.leftPanel = this.createPanel("LeftPanel", sideWidth, true, new Color(0, 20, 50, 200));
            this.node.addChild(this.leftPanel);
            this.createPlate(this.leftPanel, 0, 160, 220, 180, new Color(0, 0, 0, 150));
        }

        // ラベル作成（LeftPanel内）
        if (!this.missionLabel) this.missionLabel = this.createLabel(this.leftPanel, "DESTINATION\n3000 km", 0, 0, 24, Color.WHITE, true);
        if (!this.timerLabel) this.timerLabel = this.createLabel(this.leftPanel, "TIME: 00:00", 0, 0, 20, Color.WHITE, true);
        if (!this.speedLabel) this.speedLabel = this.createLabel(this.leftPanel, "SPD: 0 km/h", 0, 0, 20, Color.YELLOW, true);
        if (!this.hpLabel) this.hpLabel = this.createLabel(this.leftPanel, "VEHICLE INTEGRITY", 0, 0, 20, Color.WHITE, true);
        if (!this.hpBarNode) this.hpBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 12, Color.GREEN);

        if (!this.buffPowerLabel) this.buffPowerLabel = this.createLabel(this.leftPanel, "POWER: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffPowerBarNode) this.buffPowerBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.RED);

        if (!this.buffRapidLabel) this.buffRapidLabel = this.createLabel(this.leftPanel, "RAPID: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffRapidBarNode) this.buffRapidBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.CYAN);

        // RightPanel（1回のみ）
        if (!this.rightPanel) {
            this.rightPanel = this.createPanel("RightPanel", sideWidth, false, new Color(0, 20, 50, 200));
            this.node.addChild(this.rightPanel);
        }

        // RightPanelラベル
        if (!this.shipNameLabel) this.shipNameLabel = this.createLabel(this.rightPanel, "VEHICLE STATUS", 0, 310, 20, Color.YELLOW, false);
        if (!this.moneyTitleLabel) this.moneyTitleLabel = this.createLabel(this.rightPanel, "CREDITS: 0", 0, 280, 24, Color.WHITE, false);
        if (!this.shipStatsLabel) this.shipStatsLabel = this.createLabel(this.rightPanel, "MAX HP: 100\nACCEL: 100\n...", 0, 80, 20, Color.WHITE, false);
        if (!this.cargoLabel) this.cargoLabel = this.createLabel(this.rightPanel, "CARGO: -- / --", 0, -120, 20, Color.YELLOW, false);

        console.log("[SideBarUI] setupNodes completed. Nodes created.");
    }

    /**
     * 現在の状態（Active/Inactive）に基づいてレイアウトを再計算
     */
    public updateLayout() {
        console.log("[SideBarUI] updateLayout: SideBarUI worldPos=", this.node.getWorldPosition());
        if (!this.leftPanel) return;

        let currentY = SIDEBAR_CONFIG.START_Y; // 元に戻す
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
                    case 'Timer':
                        this.setNodeVisible(this.timerLabel?.node, true, labelX, currentY);
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

        // ★Widget完全削除！手動位置指定のみ
        // 親SideBarUIからの相対位置を手動設定

        const sprite = node.addComponent(Sprite);
        const path = isLeft ? "png/LeftSide" : "png/RightSide";

        resources.load(path + "/spriteFrame", SpriteFrame, (err, spriteFrame) => {
            if (err) {
                console.warn(`Failed to load: ${path}`);
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

        // ★手動位置設定（SideBarUI基準）
        node.setPosition(isLeft ? -520 : 520, 0); // Left:-130, Right:+130
        console.log(`[SideBarUI] ${name} positioned at:`, node.position);
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

        // Reduced margin for Right Panel (10 instead of 20)
        const margin = isLeft ? 20 : 10;
        const panelWidth = 240;
        const posX = isLeft ? (-panelWidth / 2 + margin) : (panelWidth / 2 - margin);
        node.setPosition(posX, y);

        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(0, 0, 0, 255);
        outline.width = 2;

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
        console.log("[SideBarUI] start() called, DataManager:", !!DataManager.instance);

        // ★HP初期化を強制（DataManager依存を排除）
        const data = DataManager.instance?.data;
        const hp = data?.hp ?? 100;
        const maxHp = data?.maxHp ?? 100;
        console.log("[SideBarUI] Initial HP:", hp, "/", maxHp);

        this.updateHP(hp, maxHp);
        this.updateShipInfo();

        // 初期状態のミッション・速度表示
        this.updateMissionInfo(-1);
        this.updateSpeed(0);
    }

    public updateHP(current: number, max: number) {
        if (!this.node || !this.node.isValid) return;
        console.log("[SideBarUI] updateHP called:", current, "/", max);

        if (this.hpLabel && this.hpLabel.isValid) {
            this.hpLabel.string = `HP: ${Math.floor(current)}/${Math.floor(max)}`;
            this.hpLabel.color = current <= max * 0.3 ? Color.RED : Color.GREEN;
        }

        // ★Bar更新を確実化
        if (this.hpBarNode && this.hpBarNode.isValid) {
            const fill = this.hpBarNode.getChildByName("BarFill");
            if (fill && fill.isValid) {
                const ratio = Math.max(0, Math.min(1, (current || 0) / (max || 1)));
                fill.setScale(ratio, 1, 1);
                console.log("[SideBarUI] HP bar ratio:", ratio);
            }
        }
    }

    public updateBuffs(powerTime: number, rapidTime: number) {
        if (!this.node || !this.node.isValid) return;

        const maxDur = 10.0;
        let layoutChanged = false;

        // Power Check
        const isPowerActive = powerTime > 0;
        if (this._isPowerActive !== isPowerActive) {
            this._isPowerActive = isPowerActive;
            layoutChanged = true;
        }

        if (this.buffPowerLabel && this.buffPowerLabel.isValid) {
            if (isPowerActive) {
                this.buffPowerLabel.string = `POWER: ${powerTime.toFixed(1)}s`;
                this.buffPowerLabel.color = Color.RED;
            } else {
                this.buffPowerLabel.string = "POWER: READY";
                this.buffPowerLabel.color = Color.GRAY;
            }
        }
        if (this.buffPowerBarNode && this.buffPowerBarNode.isValid) {
            const fill = this.buffPowerBarNode.getChildByName("BarFill");
            if (fill && fill.isValid) {
                const ratio = isPowerActive ? (powerTime / maxDur) : 0;
                fill.setScale(Math.min(ratio, 1), 1, 1);
            }
        }

        // Rapid Check
        const isRapidActive = rapidTime > 0;
        if (this._isRapidActive !== isRapidActive) {
            this._isRapidActive = isRapidActive;
            layoutChanged = true;
        }

        if (this.buffRapidLabel && this.buffRapidLabel.isValid) {
            if (isRapidActive) {
                this.buffRapidLabel.string = `RAPID: ${rapidTime.toFixed(1)}s`;
                this.buffRapidLabel.color = Color.CYAN;
            } else {
                this.buffRapidLabel.string = "RAPID: READY";
                this.buffRapidLabel.color = Color.GRAY;
            }
        }
        if (this.buffRapidBarNode && this.buffRapidBarNode.isValid) {
            const fill = this.buffRapidBarNode.getChildByName("BarFill");
            if (fill && fill.isValid) {
                const ratio = isRapidActive ? (rapidTime / maxDur) : 0;
                fill.setScale(Math.min(ratio, 1), 1, 1);
            }
        }

        if (layoutChanged) {
            this.updateLayout();
        }
    }

    public updateMissionInfo(dist: number) {
        if (!this.node || !this.node.isValid) return;
        if (!this.missionLabel || !this.missionLabel.isValid) return;

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
            this.shipNameLabel.string = "VEHICLE STATUS";
            this.shipNameLabel.color = Color.YELLOW;
        }

        const isIngame = GameManager.instance && GameManager.instance.state === GameState.INGAME;

        if (this.moneyTitleLabel) {
            this.moneyTitleLabel.string = `CREDITS: ${data.money || 0}`;
        }

        if (this.shipStatsLabel) {
            const maxHp = data.maxHp || 100;
            const ship = GAME_SETTINGS.PLAYER as any;
            this.shipStatsLabel.string = `MAX HP: ${maxHp}\nACCEL: ${ship.ACCEL || 100}\nSPEED: ${ship.SPEED || 550}\nFRICTION: 0.98\nLERP: 0.1\nCAPACITY: ${data.capacity || 50}`;
        }

        if (this.cargoLabel) {
            if (!isIngame) {
                this.cargoLabel.string = "CARGO: -- / --";
            } else {
                const gm = GameManager.instance;
                const currentCargo = gm && gm.currentMission ? gm.currentMission.cargoWeight : 0;
                this.cargoLabel.string = `CARGO: ${currentCargo} / ${data.capacity || 50}`;
            }
        }

        if (!isIngame) {
            this.updateTimer(-1); // Resets to --:-- or 00:00
        }
    }

    public updateTimer(time: number) {
        if (!this.timerLabel) return;
        if (time < 0) {
            this.timerLabel.string = "TIME: 00:00";
            return;
        }
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        const minStr = min < 10 ? "0" + min : "" + min;
        const secStr = sec < 10 ? "0" + sec : "" + sec;
        this.timerLabel.string = `TIME: ${minStr}:${secStr}`;
    }
}
