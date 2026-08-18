import { _decorator, Component, Node, Label, Button, Color, Graphics, RichText, BlockInputEvents, Layers } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';
import { UIManager } from './UIManager';
import { getUpgradeStepInfo, computeRefund, PARAM_IDS, UpgradeStepInfo } from './PlayerUpgradeCalc';
import { instantiatePrefabButton } from './UIButtonPrefab';

const { ccclass, property } = _decorator;

// ③Noticeに表示する簡単な英語の効果説明(PlayerUpgrade.csvには持たせず、ここで固定管理する)。
// 表示枠が狭いため、できるだけ短い語句にする。
const PARAM_DESCRIPTIONS: { [paramId: string]: string } = {
    HP: 'Hull durability.',
    CP: 'Cargo capacity limit.',
    SP: 'Maximum speed.',
    AC: 'Acceleration.',
    DF: 'Damage reduction.',
    TN: 'Turning speed.',
    CR: 'Item pickup range.',
    VOS: 'Boosts all airframe stats.',
    WOS: 'Boosts all weapon stats.',
};

// ①BtnUpgradeに表示する固定文言(コスト情報は共有情報欄へ移したため、ここは常に同じ表示)。
const UPGRADE_BUTTON_TEXT = 'UPGRADE';

interface RowRefs {
    paramId: string;
    root: Node;
    btnUpgrade: Node;
    btnUpgradeButton: Button | null;
    btnUpgradeLabel: Label | null;
    btnReset: Node;
    btnResetButton: Button | null;
    labelNotice: Label | null;
}

/**
 * scene-Home内に常駐するUpgrade GUI。OptionsUIと同じ「シーン常駐ノード+active toggleで開閉」
 * パターン。Row(9パラメータ分の子ノード、命名規則 Row_<ParamID>)を走査する。
 *
 * 各行の構成: ParamName(編集済み固定表示) / ①BtnUpgrade(購入ボタン) / ③LabelNotice(効果説明、固定文)
 * / ④BtnReset(パラメータ別Reset)。②(必要クレジット/必要素材)は行ごとに表示せず、上部の共有情報欄
 * (sharedInfoLabel)に集約する。
 *
 * 購入は2段階タップ方式(マウスhoverに依存しないため、タッチ操作でも同じ挙動になる):
 *   1回目のタップ: そのパラメータを選択し、共有情報欄にコスト/必要素材を表示するだけ(購入しない)
 *   同じ行をもう一度タップ: 購入を実行する
 * 別の行をタップすると選択がそちらに移る(未確定の1回目タップはキャンセル扱い)。
 */
@ccclass('UpgradeUI')
export class UpgradeUI extends Component {
    private static _instance: UpgradeUI = null;
    public static get instance(): UpgradeUI { return this._instance; }

    // OptionsUIと同じ構造: このコンポーネントが乗るUpgradeUIノード自体は常にactiveのままにし、
    // 実際に表示/非表示を切り替えるのはこのPanel子ノードだけにする。Cocosではノードがシーン開始時
    // からinactiveだとonLoad()が期待通りに走らないことがあるため、UpgradeUIノード自体を非表示に
    // するのは避ける(OptionsUI.panelと同じ役割、Inspectorでドラッグして割り当てる)。
    @property(Node)
    public panel: Node = null;

    // 上部の共有メッセージウィンドウ(「Labelvalu」という名前で作成予定、タイプミスだが踏襲する)。
    // 2行: 1行目=必要クレジット、2行目=必要素材。色は不足しているリソースだけ赤くする。
    @property(RichText)
    public sharedInfoLabel: RichText = null;

    private rows: RowRefs[] = [];
    private dialogNode: Node = null;
    // 2段階タップの「選択中(1回目タップ済み、確定待ち)」のパラメータID。
    private selectedParamId: string | null = null;

    private get root(): Node {
        return this.panel || this.node;
    }

    onLoad() {
        UpgradeUI._instance = this;
        this.collectRows();
        this.wireGlobalButtons();
        this.applyFontSizes();
    }

    private collectRows() {
        this.rows = [];
        const rowContainer = this.root.getChildByName('Row') || this.root;

        for (const child of rowContainer.children) {
            if (!child.name.startsWith('Row_')) continue;
            const key = child.name.slice('Row_'.length).toUpperCase();
            const paramId = PARAM_IDS.find(p => p === key);
            if (!paramId) {
                console.warn(`[UpgradeUI] Row node '${child.name}' does not match any known ParamID (${PARAM_IDS.join(', ')}). Skipping.`);
                continue;
            }

            const btnUpgradeNode = child.getChildByName('BtnUpgrade');
            const btnResetNode = child.getChildByName('BtnReset');
            const labelNoticeNode = child.getChildByName('LabelNotice');

            if (!btnUpgradeNode || !btnResetNode || !labelNoticeNode) {
                console.warn(`[UpgradeUI] Row '${child.name}' is missing expected child nodes (BtnUpgrade/BtnReset/LabelNotice). Skipping.`);
                continue;
            }

            const row: RowRefs = {
                paramId,
                root: child,
                btnUpgrade: btnUpgradeNode,
                btnUpgradeButton: btnUpgradeNode.getComponent(Button),
                btnUpgradeLabel: btnUpgradeNode.getComponentInChildren(Label),
                btnReset: btnResetNode,
                btnResetButton: btnResetNode.getComponent(Button),
                labelNotice: labelNoticeNode.getComponentInChildren(Label),
            };
            this.rows.push(row);

            btnUpgradeNode.off(Button.EventType.CLICK);
            btnUpgradeNode.on(Button.EventType.CLICK, () => this.onUpgradeClicked(paramId), this);
            btnResetNode.off(Button.EventType.CLICK);
            btnResetNode.on(Button.EventType.CLICK, () => this.onResetClicked(paramId), this);

            if (row.labelNotice) {
                row.labelNotice.string = PARAM_DESCRIPTIONS[paramId] || '';
            }
            if (row.btnUpgradeLabel) {
                row.btnUpgradeLabel.string = UPGRADE_BUTTON_TEXT;
            }
        }

        if (this.rows.length !== PARAM_IDS.length) {
            console.warn(`[UpgradeUI] Expected ${PARAM_IDS.length} rows, found ${this.rows.length}. Missing: ${PARAM_IDS.filter(p => !this.rows.find(r => r.paramId === p)).join(', ')}`);
        }
    }

    // GameManagerConfig.jsonのフォントサイズ設定を各Labelへ適用する(GameManagerEditorタブで調整)。
    private applyFontSizes() {
        const gm = GameManager.instance;
        if (!gm) return;
        for (const row of this.rows) {
            if (row.btnUpgradeLabel) row.btnUpgradeLabel.fontSize = gm.upgradeButtonFontSize;
            if (row.labelNotice) row.labelNotice.fontSize = gm.upgradeNoticeFontSize;
        }
        if (this.sharedInfoLabel) this.sharedInfoLabel.fontSize = gm.upgradeSharedInfoFontSize;
    }

    private wireGlobalButtons() {
        const btnAllReset = this.root.getChildByName('BtnAllReset');
        if (btnAllReset) {
            btnAllReset.off(Button.EventType.CLICK);
            btnAllReset.on(Button.EventType.CLICK, this.onAllResetClicked, this);
        } else {
            console.warn("[UpgradeUI] BtnAllReset not found.");
        }

        const btnBack = this.root.getChildByName('BtnBack');
        if (btnBack) {
            btnBack.off(Button.EventType.CLICK);
            btnBack.on(Button.EventType.CLICK, this.onBackClicked, this);
            // 「Back」「Close」「X」等、画面ごとにバラバラだった「元の画面へ戻る」ボタンの文言を
            // 「HOME」に統一する(Prefab自体は変更せず、子Labelの文字列だけ実行時に上書きする)。
            const label = btnBack.getComponentInChildren(Label);
            if (label) label.string = "HOME";
        } else {
            console.warn("[UpgradeUI] BtnBack not found.");
        }
    }

    // notifyOverlayOpening()の戻り値(世代番号)。CustomizeUI.tsのoverlayGenと同じ役割。
    private overlayGen: number = 0;

    public open() {
        // MissionUI/CustomizeUI/PropertyUI/HistoryUI等、他の全画面オーバーレイと排他にする
        // (UIManager.notifyOverlayOpening()参照、CustomizeUI.open()と同じ規約)。
        if (UIManager.instance) this.overlayGen = UIManager.instance.notifyOverlayOpening('UpgradeUI', this.root, () => this.close());

        if (this.panel) {
            this.panel.active = true;
        } else {
            this.node.active = true; // Panelが未割り当ての場合のフォールバック
        }
        this.selectedParamId = null;
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Tap an upgrade button to see its cost.';
        this.refreshAll();
    }

    public close() {
        if (this.panel) {
            this.panel.active = false;
        } else {
            this.node.active = false;
        }
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('UpgradeUI', this.overlayGen);
    }

    private getShipId(): string {
        return (DataManager.instance && DataManager.instance.data.currentShipId) || 'Default';
    }

    private getCurrentLv(paramId: string): number {
        const data = DataManager.instance.data;
        const shipLevels = data.playerParamLevels[this.getShipId()];
        return (shipLevels && shipLevels[paramId]) || 0;
    }

    private setCurrentLv(paramId: string, lv: number) {
        const data = DataManager.instance.data;
        const shipId = this.getShipId();
        if (!data.playerParamLevels[shipId]) data.playerParamLevels[shipId] = {};
        data.playerParamLevels[shipId][paramId] = lv;
    }

    private refreshAll() {
        const gm = GameManager.instance;
        if (!gm || !DataManager.instance) return;
        for (const row of this.rows) {
            this.refreshRow(row, gm);
        }
    }

    private refreshRow(row: RowRefs, gm: GameManager) {
        const currentLv = this.getCurrentLv(row.paramId);
        const info = getUpgradeStepInfo(row.paramId, currentLv, gm);
        if (!info) return;

        // グレーアウトはLvMax到達時のみ(=それ以上プレビューする内容が無い)。クレジット/素材不足は
        // ボタンを無効化せず、1回目タップ(プレビュー)は常に許可する。不足の判定・拒否は
        // onUpgradeClicked()の2回目タップ(確定)側だけで行う(共有情報欄の赤字表示+errorSEで伝える)。
        if (row.btnUpgradeButton) row.btnUpgradeButton.interactable = !info.isMaxLv;

        if (row.btnResetButton) row.btnResetButton.interactable = currentLv > 0;

        // 選択中の行があれば、購入等で状態が変わった後も共有情報欄を最新の内容に保つ。
        if (this.selectedParamId === row.paramId) {
            this.updateSharedInfo(row.paramId, false);
        }
    }

    // パラメータの実値を表示用に整形する。VOS/WOSは倍率(%)、DFは小数点1桁、それ以外は整数。
    // SideBarUI.tsのStatus欄の表示形式と合わせてある。
    private formatParamValue(paramId: string, value: number): string {
        if (paramId === 'VOS' || paramId === 'WOS') return `${value.toFixed(0)}%`;
        if (paramId === 'DF') return value.toFixed(1);
        return value.toFixed(0);
    }

    // 共有情報欄(sharedInfoLabel)に、指定パラメータの次Lvのコスト/必要素材/効果値の変化を表示する。
    // armed=trueの間は「もう一度タップで確認ダイアログを開く」案内を付け足す(2段階タップの1回目)。
    private updateSharedInfo(paramId: string, armed: boolean) {
        if (!this.sharedInfoLabel) return;
        const gm = GameManager.instance;
        if (!gm) return;

        const currentLv = this.getCurrentLv(paramId);
        const info = getUpgradeStepInfo(paramId, currentLv, gm);
        if (!info) {
            this.sharedInfoLabel.string = '';
            return;
        }

        if (info.isMaxLv) {
            this.sharedInfoLabel.string = `${info.label}: LvMax`;
            return;
        }

        const data = DataManager.instance.data;
        const hasEnoughCredits = data.money >= (info.creditsCost || 0);
        const creditColor = hasEnoughCredits ? '#ffffff' : '#ff4444';

        let itemLine = 'No material required';
        let itemColor = '#ffffff';
        if (info.material && info.material.itemId) {
            const have = data.inventory[info.material.itemId] || 0;
            itemColor = have >= info.material.quantity ? '#ffffff' : '#ff4444';
            itemLine = `${info.material.itemId} x${info.material.quantity} (have ${have})`;
        }

        const valueLine = (info.nextValue != null)
            ? `${this.formatParamValue(paramId, info.currentValue)} ▶ <color=#66ff66>${this.formatParamValue(paramId, info.nextValue)}</color>`
            : '';

        let text =
            `<color=${creditColor}>${info.label} ▶Lv${info.currentLv + 1} : ${info.creditsCost} credits</color>\n` +
            `${valueLine}\n` +
            `<color=${itemColor}>${itemLine}</color>`;
        if (armed) text += '\n<color=#ffff00>Tap again to confirm.</color>';
        this.sharedInfoLabel.string = text;
    }

    // ①BtnUpgradeのクリック処理(2段階タップ)。
    //   1回目(未選択、または別の行を選択中): このパラメータを選択して共有情報欄に表示するだけ。
    //   2回目(既にこのパラメータが選択済み): 確認ダイアログ(showUpgradeConfirm)を開く
    //   (以前はここで即購入していたが、実行前に必ず確認させたいという要望のため
    //   ワンクッション挟むようにした。購入の実処理自体はexecuteUpgradePurchase()に分離)。
    private onUpgradeClicked(paramId: string) {
        const gm = GameManager.instance;
        if (!gm) return;
        const currentLv = this.getCurrentLv(paramId);
        const info = getUpgradeStepInfo(paramId, currentLv, gm);
        if (!info || info.isMaxLv) return;

        if (this.selectedParamId !== paramId) {
            this.selectedParamId = paramId;
            SoundManager.instance.playSE('click');
            this.updateSharedInfo(paramId, true);
            return;
        }

        SoundManager.instance.playSE('click');
        this.showUpgradeConfirm(paramId, info);
    }

    // Upgrade実行確認ダイアログ。コスト/必要素材/効果値の変化(現在値▶次Lv値)を表示し、
    // YESで実際に購入する。素材/クレジット不足はここで初めて弾く(以前のonUpgradeClicked内の
    // チェックをそのまま移動しただけ、判定内容は変更していない)。
    private showUpgradeConfirm(paramId: string, info: UpgradeStepInfo | null) {
        if (!info) return;
        if (this.dialogNode) {
            this.dialogNode.destroy();
            this.dialogNode = null;
        }

        const data = DataManager.instance.data;
        const hasEnoughCredits = data.money >= (info.creditsCost || 0);
        const hasEnoughMaterial = !info.material || !info.material.itemId ||
            (data.inventory[info.material.itemId] || 0) >= info.material.quantity;
        const creditColor = hasEnoughCredits ? '#ffffff' : '#ff4444';

        let itemLine = 'No material required';
        let itemColor = '#ffffff';
        if (info.material && info.material.itemId) {
            const have = data.inventory[info.material.itemId] || 0;
            itemColor = have >= info.material.quantity ? '#ffffff' : '#ff4444';
            itemLine = `${info.material.itemId} x${info.material.quantity} (have ${have})`;
        }
        const valueLine = (info.nextValue != null)
            ? `${this.formatParamValue(paramId, info.currentValue)} ▶ <color=#66ff66>${this.formatParamValue(paramId, info.nextValue)}</color>`
            : '';

        this.dialogNode = new Node("UpgradeConfirmDialog");
        this.root.addChild(this.dialogNode);

        const bg = this.dialogNode.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 200);
        bg.rect(-2000, -2000, 4000, 4000);
        bg.fill();
        this.dialogNode.addComponent(BlockInputEvents);

        const winNode = new Node("Window");
        this.dialogNode.addChild(winNode);
        const winGr = winNode.addComponent(Graphics);
        winGr.fillColor = new Color(20, 40, 60, 255);
        winGr.roundRect(-260, -140, 520, 280, 10);
        winGr.fill();
        winGr.strokeColor = Color.CYAN;
        winGr.lineWidth = 3;
        winGr.stroke();

        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 40);
        const richText = txtNode.addComponent(RichText);
        richText.fontSize = 24;
        richText.maxWidth = 460;
        richText.horizontalAlign = RichText.HorizontalAlign.CENTER;
        richText.string =
            `<outline color=#000000 width=2>${info.label} Lv${info.currentLv} ▶ Lv${info.currentLv + 1}</outline>\n` +
            `<outline color=#000000 width=2>${valueLine}</outline>\n` +
            `<outline color=#000000 width=2><color=${creditColor}>${info.creditsCost} credits</color></outline>\n` +
            `<outline color=#000000 width=2><color=${itemColor}>${itemLine}</color></outline>`;

        instantiatePrefabButton("Prefabs/Canvas/Button-Yes", winNode, -90, -90, () => {
            if (!hasEnoughCredits || !hasEnoughMaterial) {
                SoundManager.instance.playSE('error', 'System');
                return;
            }
            this.executeUpgradePurchase(paramId, info);
            this.closeDialog();
        }, this.dialogNode, "YES", Color.GREEN, 0.5, 0.65);
        instantiatePrefabButton("Prefabs/Canvas/Button-No", winNode, 90, -90, () => {
            SoundManager.instance.playSE("click");
            this.closeDialog();
        }, this.dialogNode, "NO", Color.GRAY, 0.5, 0.65);

        this.forceUILayer(this.dialogNode);
    }

    // 実際の購入処理(旧onUpgradeClickedの2回目タップ部分をそのまま移設)。
    private executeUpgradePurchase(paramId: string, info: UpgradeStepInfo) {
        const currentLv = this.getCurrentLv(paramId);

        DataManager.instance.addResource('credits', -(info.creditsCost || 0));
        if (info.material && info.material.itemId) {
            DataManager.instance.addResource(info.material.itemId, -info.material.quantity);
        }
        this.setCurrentLv(paramId, currentLv + 1);
        DataManager.instance.save();

        SoundManager.instance.playSE('upgrade', 'System');
        // 購入後も選択状態を保つ(同じ行を続けてタップすれば次のLvもすぐ確認ダイアログを開ける)。
        this.refreshAll();
        this.updateSharedInfo(paramId, true);
        // SideBarUIのCREDITS/CARGO/TotalUpgrade表示はaddResource()だけでは自動更新されない
        // (このUIとSideBarUIは別コンポーネントで、明示的に呼ばない限り再描画されない)ため、
        // ここで明示的に更新する。これが無いと購入は実際に成功していてもクレジットが
        // 減っていないように見えてしまう。
        if (UIManager.instance && UIManager.instance.sideBarUI) {
            UIManager.instance.sideBarUI.updateShipInfo();
        }
    }

    private onResetClicked(paramId: string) {
        if (this.getCurrentLv(paramId) <= 0) return;
        SoundManager.instance.playSE('click');
        this.showResetConfirm([paramId]);
    }

    private onAllResetClicked() {
        SoundManager.instance.playSE('click');
        this.showResetConfirm(PARAM_IDS);
    }

    private onBackClicked() {
        SoundManager.instance.playSE('click');
        this.close();
    }

    // --- Reset確認ダイアログ ---
    // HomeUI.ts/MissionUI.tsと同じ手法(Graphics+RichText+手動Buttonノード)で構築する。
    private showResetConfirm(paramIds: string[]) {
        if (this.dialogNode) {
            this.dialogNode.destroy();
            this.dialogNode = null;
        }

        const gm = GameManager.instance;
        const refundPercent = gm ? gm.resetRefundPercent : 80;

        this.dialogNode = new Node("ResetDialog");
        this.root.addChild(this.dialogNode);

        const bg = this.dialogNode.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 0, 200);
        bg.rect(-2000, -2000, 4000, 4000);
        bg.fill();
        this.dialogNode.addComponent(BlockInputEvents);

        const winNode = new Node("Window");
        this.dialogNode.addChild(winNode);
        const winGr = winNode.addComponent(Graphics);
        winGr.fillColor = new Color(60, 20, 20, 255);
        winGr.roundRect(-260, -140, 520, 280, 10);
        winGr.fill();
        winGr.strokeColor = Color.RED;
        winGr.lineWidth = 3;
        winGr.stroke();

        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 40);
        const richText = txtNode.addComponent(RichText);
        richText.fontSize = 22;
        richText.maxWidth = 460;
        richText.horizontalAlign = RichText.HorizontalAlign.CENTER;
        richText.string =
            `<outline color=#000000 width=2>When a reset is performed, ${refundPercent}% of the credits and materials are refunded.</outline>\n` +
            `<outline color=#000000 width=2><color=#ff4444>!!! No further refund is provided if the amount exceeds 99 units.</color></outline>`;

        instantiatePrefabButton("Prefabs/Canvas/Button-Yes", winNode, -90, -90, () => {
            this.executeReset(paramIds);
            this.closeDialog();
        }, this.dialogNode, "YES", Color.RED, 0.5, 0.65);
        instantiatePrefabButton("Prefabs/Canvas/Button-No", winNode, 90, -90, () => {
            SoundManager.instance.playSE("click");
            this.closeDialog();
        }, this.dialogNode, "NO", Color.GRAY, 0.5, 0.65);

        this.forceUILayer(this.dialogNode);
    }

    private closeDialog() {
        const node = this.dialogNode;
        this.dialogNode = null;
        if (node) {
            this.scheduleOnce(() => {
                if (node.isValid) node.destroy();
            }, 0);
        }
    }

    private executeReset(paramIds: string[]) {
        const gm = GameManager.instance;
        if (!gm) return;
        const refundPercent = gm.resetRefundPercent;

        let totalCreditRefund = 0;
        const totalItemRefund: { [itemId: string]: number } = {};

        for (const paramId of paramIds) {
            const currentLv = this.getCurrentLv(paramId);
            if (currentLv <= 0) continue;

            const refund = computeRefund(paramId, currentLv, gm, refundPercent);
            totalCreditRefund += refund.credits;
            for (const itemId of Object.keys(refund.items)) {
                totalItemRefund[itemId] = (totalItemRefund[itemId] || 0) + refund.items[itemId];
            }
            this.setCurrentLv(paramId, 0);
        }

        if (totalCreditRefund > 0) DataManager.instance.addResource('credits', totalCreditRefund);
        for (const itemId of Object.keys(totalItemRefund)) {
            if (totalItemRefund[itemId] > 0) DataManager.instance.addResource(itemId, totalItemRefund[itemId]);
        }
        DataManager.instance.save();

        // Resetしたパラメータが選択中(確定待ち)だった場合、古い情報を共有情報欄に残さない。
        if (this.selectedParamId && paramIds.includes(this.selectedParamId)) {
            this.selectedParamId = null;
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Tap an upgrade button to see its cost.';
        }

        SoundManager.instance.playSE('upgrade', 'System');
        console.log(`[UpgradeUI] Reset ${paramIds.join(', ')}: refunded ${totalCreditRefund} credits + ${JSON.stringify(totalItemRefund)}`);
        this.refreshAll();
        if (UIManager.instance && UIManager.instance.sideBarUI) {
            UIManager.instance.sideBarUI.updateShipInfo();
        }
    }

    /** Recursively force a node subtree onto the UI_2D layer so MainCamera can see it (matches HomeUI/MissionUI). */
    private forceUILayer(node: Node) {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) {
            this.forceUILayer(child);
        }
    }
}
