import { _decorator, Component, Node, Label, Color, Sprite, UITransform, Size, Widget, Graphics, LabelOutline, resources, SpriteFrame, Button } from 'cc';
import { DataManager, getCurrentGridData } from './DataManager';
import { GameManager } from './GameManager';
import { GameState } from './Constants';
import { UIManager } from './UIManager';
import { SoundManager } from './SoundManager';
import { getTotalUpgradeStars, getUpgradedParamValue } from './PlayerUpgradeCalc';
import { computeEquippedWeight } from './CustomizeCalc';
import { GameDatabase } from './GameDatabase';

// Customizeで装備した武器の最大搭載数(表示行数もこれに合わせて固定12行にする)。
const MAX_EQUIPPED_WEAPONS_DISPLAY = 12;

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
    // Prefab側で手作業レイアウトする場合は、"BarFill"という名前の子ノード(塗りつぶし部分)を
    // 持つバー背景ノードをここに割り当てる(updateHP()等がgetChildByName("BarFill")で参照する)。
    @property(Node)
    public hpBarNode: Node = null;

    @property(Label)
    public buffPowerLabel: Label = null;
    @property(Node)
    public buffPowerBarNode: Node = null;

    @property(Label)
    public buffRapidLabel: Label = null;
    @property(Node)
    public buffRapidBarNode: Node = null;

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

    // 改造(Vehicle Upgrade)の合計購入回数を★nで表示する。Prefab側に手動で用意した
    // "TotalUpgradeLabel"という名前のノードがあればそれを使う(setupNodes()参照)。
    @property(Label)
    public totalUpgradeLabel: Label = null;

    // そのミッション中の撃墜数/与ダメージ(GameManager.playState.killedEnemies/damageDealt由来、
    // ミッション開始時に0リセットされる)。GameManager.update()からUIManager経由で毎フレーム
    // updateMissionStats()が呼ばれる(SideBarUI.tsにはGameManager本体への直接参照を持たせない
    // 既存方針を踏襲)。
    @property(Label)
    public shootDownScoreLabel: Label = null;
    @property(Label)
    public damageCounterLabel: Label = null;

    // Customizeで装備した武器一覧(Lv付き、最大MAX_EQUIPPED_WEAPONS_DISPLAY行固定)。
    // Prefab側に手動で用意した"Equipments"という名前のノードがあればそれを使う。
    @property(Label)
    public equipmentsLabel: Label = null;

    // State for Dynamic Layout
    private _isPowerActive: boolean = false;
    private _isRapidActive: boolean = false;

    // ダメージカウンターの表示上の「カウントアップ演出」用。実値(_targetDamage)へ向けて
    // _displayedDamageを毎フレーム加速的に近づける(常に上昇し続けているように見せる)。
    // 値が減った(=ミッション開始でリセットされた)場合は演出せず即座に追従する。
    private _displayedDamage: number = 0;
    private _targetDamage: number = 0;

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
        if (!this.missionLabel) {
            this.missionLabel = this.createLabel(this.leftPanel, "DESTINATION\n3000 km", 0, 0, 24, Color.WHITE, true);
            // make mission label clickable to open mission selection
            const btn = this.missionLabel.node.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
            this.missionLabel.node.on(Button.EventType.CLICK, this.onMissionLabelClicked, this);
        }
        if (!this.timerLabel) this.timerLabel = this.createLabel(this.leftPanel, "TIME: 00:00", 0, 0, 20, Color.WHITE, true);
        if (!this.speedLabel) this.speedLabel = this.createLabel(this.leftPanel, "SPD: 0 km/h", 0, 0, 20, Color.YELLOW, true);
        if (!this.hpLabel) this.hpLabel = this.createLabel(this.leftPanel, "VEHICLE INTEGRITY", 0, 0, 20, Color.WHITE, true);
        if (!this.hpBarNode) this.hpBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 12, Color.GREEN);

        if (!this.buffPowerLabel) this.buffPowerLabel = this.createLabel(this.leftPanel, "POWER: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffPowerBarNode) this.buffPowerBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.RED);

        if (!this.buffRapidLabel) this.buffRapidLabel = this.createLabel(this.leftPanel, "RAPID: READY", 0, 0, 20, Color.GRAY, true);
        if (!this.buffRapidBarNode) this.buffRapidBarNode = this.createBar(this.leftPanel, 0, 0, innerWidth, 10, Color.CYAN);

        // SideBarUI.prefab側でエディタ手動配置されたバーノードはcreateBar()を経由しない
        // (=一度も.rect()/.fill()が呼ばれず、Graphicsに色などのスタイルは保存されていても
        // 実際の描画パスが空のまま)。ここで1回だけ明示的に描画する(以後の更新はsetScale()のみ)。
        this.paintBarGraphics(this.hpBarNode);
        this.paintBarGraphics(this.buffPowerBarNode);
        this.paintBarGraphics(this.buffRapidBarNode);

        if (!this.equipmentsLabel) {
            const found = this.findChildByNames(this.leftPanel, ["Equipments"]);
            this.equipmentsLabel = (found && found.getComponent(Label)) || null;
        }

        // RightPanel（1回のみ）
        if (!this.rightPanel) {
            this.rightPanel = this.createPanel("RightPanel", sideWidth, false, new Color(0, 20, 50, 200));
            this.node.addChild(this.rightPanel);
        }

        // RightPanelラベル。全項目、Prefab側に手動で用意されたノードがあればまず名前で探して使う
        // (Inspector未割当かつPrefab側にも見つからない場合のみ、最終手段としてcreateLabelで
        // コード側固定座標にフォールバック生成する)。Prefab側の手動配置を尊重し、コードが
        // 勝手に別位置へ複製生成してレイアウトが崩れて見える、という事態を避けるため。
        if (!this.shipNameLabel) {
            const found = this.findChildByNames(this.rightPanel, ["ShipNameLabel", "VehicleStatus", "VehicleStatusLabel"]);
            this.shipNameLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "VEHICLE STATUS", 0, 310, 20, Color.YELLOW, false);
        }
        if (!this.moneyTitleLabel) {
            const found = this.findChildByNames(this.rightPanel, ["MoneyTitleLabel", "CreditsLabel", "Credits"]);
            this.moneyTitleLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "CREDITS: 0", 0, 280, 24, Color.WHITE, false);
        }
        // TotalUpgradeLabelはPrefab側に手動で用意されている想定(Inspectorで未割当の場合のみ、
        // 名前で探す→それでも無ければ最終手段としてcreateLabelでフォールバック生成する)。
        if (!this.totalUpgradeLabel) {
            const found = this.findChildByNames(this.rightPanel, ["TotalUpgradeLabel"]);
            this.totalUpgradeLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "TotalUpgrade: ★0", 0, 250, 20, Color.WHITE, false);
        }
        if (!this.shipStatsLabel) {
            const found = this.findChildByNames(this.rightPanel, ["ShipStatsLabel", "VehicleStats", "VehicleStatsLabel"]);
            this.shipStatsLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "MAX HP: 100\nACCEL: 100\n...", 0, 80, 20, Color.WHITE, false);
        }
        // CARGO/Shoot-Down/DamageはLabel見出し+実数を2行表示にするため、フォールバック生成時の
        // Y間隔も2行ぶん確保する(30px間隔だと1行目と2行目が次のLabelと重なってしまうため60pxに)。
        if (!this.cargoLabel) {
            const found = this.findChildByNames(this.rightPanel, ["CargoLabel", "Cargo"]);
            this.cargoLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "CARGO\n-- / --", 0, -140, 20, Color.YELLOW, false);
        }
        // ShootDownScoreLabel/DamageCounterLabelもTotalUpgradeLabelと同じく、Prefab側に手動で
        // 用意されている場合はそれを使う(名前の表記ゆれをいくつか試す。それでも見つからなければ
        // 最終手段としてcreateLabelでフォールバック生成する)。
        if (!this.shootDownScoreLabel) {
            const found = this.findChildByNames(this.rightPanel, ["EnemiesDestroyed", "EnemiesDestroyedLabel", "ShootDownScoreLabel", "Shoot-DownScoreLabel", "ShootDownScore", "Shoot-DownScore"]);
            this.shootDownScoreLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "ENEMIES DESTROYED\n0", 0, -200, 20, Color.WHITE, false);
        }
        if (!this.damageCounterLabel) {
            const found = this.findChildByNames(this.rightPanel, ["DamageCounterLabel", "DamageCounter"]);
            this.damageCounterLabel = (found && found.getComponent(Label)) || this.createLabel(this.rightPanel, "DAMAGE\n0", 0, -260, 20, Color.WHITE, false);
        }

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

    // SideBarUI.prefab側でエディタ手動配置済みのため、位置(x/y)は上書きしない
    // (以前はここでnode.setPosition()していたが、手動レイアウトを毎フレーム/毎更新で
    // 上書きしてしまうため廃止。show/hideの切り替えだけ行う)。
    private setNodeVisible(node: Node, visible: boolean, x: number = 0, y: number = 0) {
        if (node) {
            node.active = visible;
        }
    }

    // Prefab側に手動で用意されたノードを、いくつかの想定名で順に探す(表記ゆれ対策)。
    // 見つからなければnull(呼び出し側がcreateLabel()等でフォールバック生成する)。
    private findChildByNames(parent: Node, names: string[]): Node | null {
        for (const name of names) {
            const found = parent.getChildByName(name);
            if (found) return found;
        }
        return null;
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

    // エディタで手動配置されたバーノード(BG+子"BarFill")用。createBar()と違い、既存のUITransform
    // /Graphics(色などのスタイルはPrefab側で保存済み)をそのまま使い、パス(rect+fill)だけを描く。
    private paintBarGraphics(barNode: Node) {
        if (!barNode || !barNode.isValid) return;

        const bgTrans = barNode.getComponent(UITransform);
        const bgGr = barNode.getComponent(Graphics);
        if (bgTrans && bgGr) {
            const w = bgTrans.contentSize.width;
            const h = bgTrans.contentSize.height;
            bgGr.clear();
            bgGr.rect(-w / 2, -h / 2, w, h);
            bgGr.fill();
        }

        const fillNode = barNode.getChildByName("BarFill");
        if (fillNode) {
            const fillTrans = fillNode.getComponent(UITransform);
            const fillGr = fillNode.getComponent(Graphics);
            if (fillTrans && fillGr) {
                const w = fillTrans.contentSize.width;
                const h = fillTrans.contentSize.height;
                fillGr.clear();
                fillGr.rect(0, -h / 2, w, h);
                fillGr.fill();
            }
        }
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

    // GameManager.playState.killedEnemies/damageDealt(ミッション開始時に0リセット、以後加算のみ)
    // をそのまま表示する。撃墜数は即座に反映、ダメージは_targetDamageに記録するだけで実際の
    // 表示更新(カウントアップ演出)はupdate()側が行う。
    public updateMissionStats(kills: number, damage: number) {
        if (this.shootDownScoreLabel && this.shootDownScoreLabel.isValid) {
            this.shootDownScoreLabel.string = `ENEMIES DESTROYED\n${kills}`;
        }
        this._targetDamage = damage;
    }

    update(deltaTime: number) {
        if (!this.damageCounterLabel || !this.damageCounterLabel.isValid) return;
        if (this._displayedDamage === this._targetDamage) return;

        if (this._targetDamage < this._displayedDamage) {
            // ミッション開始等でリセットされた場合は演出せず即座に追従する。
            this._displayedDamage = this._targetDamage;
        } else {
            // 常に上昇し続けているように見せるカウントアップ演出。差分の一定割合+最低1/フレームで
            // 近づけることで、差が大きい時は速く・小さい時もゼロに漸近して止まらないようにする。
            const diff = this._targetDamage - this._displayedDamage;
            const step = Math.max(1, diff * deltaTime * 6);
            this._displayedDamage = Math.min(this._targetDamage, this._displayedDamage + step);
        }

        this.damageCounterLabel.string = `DAMAGE\n${Math.floor(this._displayedDamage)}`;
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

    // PlayerUpgrade.csvの現在Lvにおける実値を取得する(GameDatabase未準備の間は0)。
    private getUpgradedValue(paramId: string): number {
        const gm = GameManager.instance;
        if (!gm) return 0;
        return getUpgradedParamValue(paramId, gm);
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

        // PlayerUpgrade.csv(HP/CP/SP/AC/DF/TN/CR/VOS/WOS)の現在Lvの実値をそのまま表示する
        // (以前はGAME_SETTINGS.PLAYERの固定値+data.capacityを見ていたが、Upgrade GUI導入後は
        // こちらが最新の実値の情報源になる)。CPは積載量としてCargo表示にも使う。
        const cp = this.getUpgradedValue('CP');
        if (this.shipStatsLabel) {
            const hp = this.getUpgradedValue('HP');
            const sp = this.getUpgradedValue('SP');
            const ac = this.getUpgradedValue('AC');
            const df = this.getUpgradedValue('DF');
            const tn = this.getUpgradedValue('TN');
            const cr = this.getUpgradedValue('CR');
            const vos = this.getUpgradedValue('VOS');
            const wos = this.getUpgradedValue('WOS');
            this.shipStatsLabel.string =
                `HP: ${hp.toFixed(0)}\nCP: ${cp.toFixed(0)}\nSP: ${sp.toFixed(0)}\nAC: ${ac.toFixed(0)}\nDF: ${df.toFixed(1)}\n` +
                `TN: ${tn.toFixed(0)}\nCR: ${cr.toFixed(0)}\nVOS: ${vos.toFixed(1)}%\nWOS: ${wos.toFixed(1)}%`;
        }

        if (this.cargoLabel) {
            if (!isIngame) {
                // 容量(CP)自体はミッション中でなくても既に分かっている値なので、Upgrade直後に
                // 効果を確認できるよう常に表示する("-- / --"だとCPを上げても何も見えず
                // 変化が分からないという問題があった)。積載重量側も、旧仕様の「ミッション専用の
                // 貨物重量」ではなく、Customizeで現在装備中のパーツ(武器)の合計重量を表示する
                // ことで、Home画面でも装備変更の影響がすぐ分かるようにする。
                const equippedWeight = computeEquippedWeight(getCurrentGridData(data).equippedParts);
                this.cargoLabel.string = `CARGO\n${equippedWeight.toFixed(0)} / ${cp.toFixed(0)}`;
            } else {
                const gm = GameManager.instance;
                const currentCargo = gm && gm.currentMission ? gm.currentMission.cargoWeight : 0;
                this.cargoLabel.string = `CARGO\n${currentCargo} / ${cp.toFixed(0)}`;
            }
        }

        if (this.totalUpgradeLabel) {
            this.totalUpgradeLabel.string = `TotalUpgrade\n★${getTotalUpgradeStars()}`;
        }

        this.updateEquipmentsList(data);

        if (!isIngame) {
            this.updateTimer(-1); // Resets to --:-- or 00:00
        }
    }

    // Customizeで装備した武器一覧を"Equipments:"見出し+固定12行の箇条書きで表示する
    // (例: "・BeamGun:Lv1")。武器未装備のパーツ(Cockpit等、weaponId無し)は対象外。
    // 表示のLvは1始まり(part.lv=0 → "Lv1")。行数は常にMAX_EQUIPPED_WEAPONS_DISPLAYで固定し、
    // 空きスロットは見出しだけの空行にする。
    private updateEquipmentsList(data: any) {
        if (!this.equipmentsLabel) return;

        const parts: any[] = getCurrentGridData(data).equippedParts || [];
        const db = GameDatabase.instance;
        const weapons = parts.filter(p => !!p.weaponId);

        const lines: string[] = ["Equipments:"];
        for (let i = 0; i < MAX_EQUIPPED_WEAPONS_DISPLAY; i++) {
            const part = weapons[i];
            if (!part) {
                lines.push("・");
                continue;
            }
            const equipment = db && part.equipmentId ? db.getEquipmentData(part.equipmentId) : null;
            const name = equipment ? equipment.name : (part.weaponId || part.type || "?");
            const lv = (part.lv || 0) + 1;
            lines.push(`・${name}:Lv${lv}`);
        }

        this.equipmentsLabel.string = lines.join("\n");
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

    /**
     * Handler executed when the mission label/button in the sidebar is clicked.
     */
    private onMissionLabelClicked() {
        SoundManager.instance?.playSE("click");
        if (UIManager.instance) {
            UIManager.instance.openMissionUI();
        }
    }
}
