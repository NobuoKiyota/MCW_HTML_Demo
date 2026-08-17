import { _decorator, Component, Node, Graphics, Color, UITransform, Button, RichText, Label, Vec3, ScrollView, Input, input, EventKeyboard, KeyCode, BlockInputEvents } from 'cc';
import { DataManager, IGridPart } from './DataManager';
import { SoundManager } from './SoundManager';
import { GameManager } from './GameManager';
import { UIManager } from './UIManager';
import { WeaponData, EquipmentData } from './GameDataTypes';
import { GameDatabase } from './GameDatabase';
import { isCellInHull, getNextCellUnlockInfo, canAffordCellUnlock, unlockCell, getEquipmentListEntries, EquipmentListEntry, canPlaceShape, shapeCellsAt, placeEquipment, partOccupiedCells } from './CustomizeCalc';
import { canAffordEquipmentUnlock, unlockEquipment } from './EquipmentUnlock';
import { computeWeaponLevelStats, computeWeaponUpgradeCost } from './WeaponCalc';
import { showDialogPrefab, DialogButtonSpec } from './DialogPrefab';

const { ccclass, property } = _decorator;

// シングル/ダブルクリックの判定猶予秒数。既定タップ後この時間内に同じパーツへ2回目のタップが
// 来なければ「シングルクリック」(再配置モード開始)、来れば「ダブルクリック」
// (Eject/LvUp/Cancelダイアログ)として扱う。
const DOUBLE_CLICK_WINDOW = 0.3;

interface CellRefs {
    x: number;
    y: number;
    node: Node;
    graphics: Graphics;
}

// セルの状態別の色。UpgradeUI.tsの「不足していれば赤くする」方式と揃え、状態を色だけで判別できるようにする。
const COLOR_UNLOCKED = new Color(80, 180, 255, 255);   // 2: 解放済み(空き)
const COLOR_OCCUPIED = new Color(60, 200, 120, 255);   // 2かつ既に何か装備済み
const COLOR_LOCKED = new Color(90, 90, 90, 255);        // 1: 未解放
const COLOR_SELECTED = new Color(255, 210, 60, 255);    // 1かつ選択中(2回目タップ待ち)
const COLOR_GHOST_OK = new Color(80, 220, 120, 160);    // 配置モード中: 配置可能
const COLOR_GHOST_NG = new Color(220, 80, 80, 160);     // 配置モード中: 配置不可

/**
 * scene-Home内に常駐するCustomize(グリッドセル解放+装備配置)GUI。UpgradeUI.tsと同じ
 * 「シーン常駐ノード+Panel子ノードのactive toggleで開閉」パターンを踏襲する。
 *
 * グリッド(6x6ダイヤ型、GAME_SETTINGS.SHIP_LAYOUT参照)はUpgradeUI.tsのRow_<ParamID>のように
 * 1つずつ手動でノードを用意するのは非現実的なため、gridContainer配下に必要なNodeを実行時に
 * 動的生成する(BuffVisualEffect.tsが星ノードを動的生成するのと同じ方針)。装備リストの
 * ScrollView本体(view/Mask/scrollBar)はエディタ側で標準の方法で組み、
 * equipmentScrollView/equipmentListContentに割り当てる想定(中身の項目だけ
 * equipmentListContent配下に動的生成する)。
 *
 * リストにはWeapons.csvに紐づく武器(CustomizeCalc.EquipmentListEntry.weaponが非null)と、
 * それ以外のArmor/Utility等の純粋な装備(weapon=null)の両方が並ぶ。装備中のものも除外せず
 * 表示専用エントリとして一覧に残る(entry.equipped、「BeamGunLv1 : DMG10」のようなLv+実値表示)。
 *
 * 操作系:
 *   ①セル解放: 2段階タップ方式(UpgradeUI.onUpgradeClicked()と同じ)。
 *     1回目のタップ: そのセルを選択し、共有情報欄にコストを表示するだけ(解放しない)。
 *     同じセルをもう一度タップ: 解放を実行する。コストはどのセルかではなく「何回目の解放か」で
 *     決まる(GridCells.csvのTier、CustomizeCalc.getNextCellUnlockInfo()経由)。
 *   ②新規装備配置: 装備リストの白(装備可能)項目をクリックすると配置モードに入り、グリッド上に
 *     形状(shapeCells)のゴーストを表示する(配置可能=緑/不可=赤)。矢印キーで1マスずつ移動、
 *     グリッドの別マスをクリックでジャンプ、Enterまたは緑状態でのグリッド再クリックで確定、
 *     Escapeでキャンセル。生ポインタを追いかけるドラッグ&ドロップではなく単発クリック+
 *     キーボードだけで完結させている(環境によってポインタ追従がズレて配置できないケースが
 *     あったため、より確実な方式に変更した経緯がある)。
 *   ③既存パーツの再配置: グリッド上の装備済みセルをシングルクリックすると、②と同じゴースト
 *     移動の仕組みで再配置モードに入る(startReposition()、canPlaceShapeのexcludePartIdで
 *     自分自身との重なりを無視)。確定するまでpart.x/yは変更しないため、Escapeでキャンセルすれば
 *     自動的に元の位置のまま残る。
 *   ④既存パーツの詳細操作: グリッド上の装備済みセルをダブルクリックするとEject/LvUp/Cancel
 *     ダイアログ(DialogWindow.prefab経由、openPartDetailDialog())。LvUpはさらにLvアップ確認
 *     ダイアログ(showWeaponLvUpConfirm())を開く。ダイアログの見た目自体はDialogPrefab.tsが
 *     ロードするPrefab側(エディタで調整可能)に委ねている。
 */
@ccclass('CustomizeUI')
export class CustomizeUI extends Component {
    private static _instance: CustomizeUI = null;
    public static get instance(): CustomizeUI { return this._instance; }

    // OptionsUI/UpgradeUIと同じ構造: CustomizeUIノード自体は常にactiveのままにし、
    // 表示/非表示はこのPanel子ノードだけで切り替える(onLoad()を確実に走らせるため)。
    @property(Node)
    public panel: Node = null;

    // グリッドセルの動的生成先(Inspectorで空のNodeを割り当てる想定、左上を(0,0)としてcellSizeおきに配置)。
    @property(Node)
    public gridContainer: Node = null;

    @property(RichText)
    public sharedInfoLabel: RichText = null;

    // sharedInfoLabelの折り返し幅。RichTextはstring設定のたびに自身のUITransform.contentSizeを
    // 描画された文字列の実寸に合わせて自動で変えてしまう(Inspectorで固定サイズを入れても、
    // 実行時に文字数に応じて縮んでしまう)ため、contentSizeから逆算せずここで直接指定する。
    @property
    public sharedInfoMaxWidth: number = 380;

    // 46(内容)+2(隙間)=48。6x6で48x6=288、gridContainerを300x300程度にすれば自動的に
    // 上下左右均等なOffsetになる(center基準の配置計算のため)。
    @property
    public cellSize: number = 48;

    @property
    public cellGap: number = 2;

    // 装備リスト(③)用。ScrollView本体はエディタ側で標準の方法(Create > UI Components >
    // ScrollView)で組んだものをそのまま割り当てる想定(view/Mask/scrollBar一式込み)。
    // 項目はequipmentListContent配下に実行時に動的生成する(BuffVisualEffect.tsと同じ方針)。
    // 推奨サイズ: ScrollView本体400x720 / view(Mask付き)380x720、Xを-10へオフセット /
    // content(=equipmentListContent)380xN(高さは自動計算) / scrollBar 20x720、X=+200。
    @property(ScrollView)
    public equipmentScrollView: ScrollView = null;

    // ScrollView.contentに割り当てているのと同じNode(項目を並べる先)をここにも割り当てる。
    @property(Node)
    public equipmentListContent: Node = null;

    @property
    public listItemHeight: number = 60;

    @property
    public listItemGap: number = 4;

    private cells: Map<string, CellRefs> = new Map();
    // 2段階タップの「選択中(1回目タップ済み、確定待ち)」のセル座標("x,y"形式、UpgradeUIのselectedParamIdと同じ役割)。
    private selectedKey: string | null = null;
    // 装備リスト側の2段階タップ(解放購入)の「選択中」EquipmentID。selectedKeyと同じ役割だが対象が別のため分けて持つ。
    private selectedUnlockEquipmentId: string | null = null;

    // 装備配置モード中の状態(placementEntryがnullでなければ配置モード中)。
    // グリッドをクリック、または矢印キーでゴーストを動かしてEnter/クリックで確定する。
    // 新規配置(装備リストから)・既存パーツの再配置の両方をこの同じ状態で扱う。再配置の場合のみ
    // placementMovingPartIdに元パーツのidが入り、canPlaceShape()の自己重なり除外・確定時の
    // 更新方法(新規追加 vs 既存パーツのx/y書き換え)を分岐する。
    private placementEntry: EquipmentListEntry | null = null;
    private placementMovingPartId: string | null = null;
    private placementGhost: Node | null = null;
    private placementGhostGraphics: Graphics | null = null;
    private placementValid: boolean = false;
    private placementAnchor: { x: number; y: number } = { x: 0, y: 0 };

    // グリッド上の装備済みセルのシングル/ダブルクリック判定用。1回目タップでこのパーツを保留し、
    // DOUBLE_CLICK_WINDOW以内に同じパーツへ2回目タップが来ればダブルクリック扱いにする。
    private pendingSingleClickPart: IGridPart | null = null;
    private pendingSingleClickCallback: (() => void) | null = null;

    // Eject/LvUp/Cancelダイアログ・Lvアップ確認ダイアログのうち、現在開いているものを1つだけ保持する
    // (UpgradeUI.dialogNodeと同じ役割)。
    private activeDialogNode: Node | null = null;

    private get root(): Node {
        return this.panel || this.node;
    }

    onLoad() {
        CustomizeUI._instance = this;
        this.wireGlobalButtons();
        this.buildGrid();

        // Customize表示中は背面(Home画面)のボタンを触れないようにする。BlockInputEvents自体は
        // Cocos組み込みコンポーネントで、乗っているNode以下のUI入力を後ろへ透過させない
        // (OptionsUI/UpgradeUIのPanelにも同じ意図で必要、無ければここで補う)。
        if (this.panel && !this.panel.getComponent(BlockInputEvents)) {
            this.panel.addComponent(BlockInputEvents);
        }

        // 共有情報欄の折り返し。RichText自身のcontentSizeは文字列に応じて自動で変わってしまうため
        // (Inspectorで固定サイズを設定しても実行時に上書きされる)、sharedInfoMaxWidthプロパティから
        // 直接指定する。
        if (this.sharedInfoLabel) {
            this.sharedInfoLabel.maxWidth = this.sharedInfoMaxWidth;
        }
    }

    onDestroy() {
        this.cancelPlacement();
        this.clearPendingSingleClick();
        this.closeActiveDialog();
    }

    private wireGlobalButtons() {
        const btnBack = this.root.getChildByName('BtnBack');
        if (btnBack) {
            btnBack.off(Button.EventType.CLICK);
            btnBack.on(Button.EventType.CLICK, this.onBackClicked, this);
        } else {
            console.warn("[CustomizeUI] BtnBack not found.");
        }
    }

    // gridContainer配下にセルの数だけNode(UITransform+Graphics+Button)を1回だけ生成する。
    // 生成後はcells Mapのnode/graphicsを使い回し、状態が変わるたびrefreshCell()で色だけ更新する
    // (毎回作り直さない)。
    private buildGrid() {
        if (!this.gridContainer) {
            console.warn("[CustomizeUI] gridContainer is not assigned. Cannot build grid.");
            return;
        }
        const layout = this.getLayout();
        if (!layout) return;

        this.gridContainer.removeAllChildren();
        this.cells.clear();

        const rows = layout.length;
        for (let y = 0; y < rows; y++) {
            const cols = layout[y].length;
            for (let x = 0; x < cols; x++) {
                if (!isCellInHull(layout, x, y)) continue; // 艦外(0)は生成しない

                const cellNode = new Node(`Cell_${x}_${y}`);
                const uiT = cellNode.addComponent(UITransform);
                uiT.setContentSize(this.cellSize - this.cellGap, this.cellSize - this.cellGap);

                const g = cellNode.addComponent(Graphics);

                this.gridContainer.addChild(cellNode);
                // 左上(0,0)基準、Y下向きプラスで配置(UI座標系はYが上向きプラスなので反転する)。
                const localX = x * this.cellSize - (cols * this.cellSize) / 2 + this.cellSize / 2;
                const localY = -(y * this.cellSize) + (rows * this.cellSize) / 2 - this.cellSize / 2;
                cellNode.setPosition(new Vec3(localX, localY, 0));

                const button = cellNode.addComponent(Button);
                button.transition = Button.Transition.NONE; // 色制御は自前(refreshCell)で行うため既定の色遷移は無効化
                cellNode.on(Button.EventType.CLICK, () => this.onCellClicked(x, y), this);

                const key = `${x},${y}`;
                this.cells.set(key, { x, y, node: cellNode, graphics: g });
            }
        }
        this.refreshAll();
    }

    private getLayout(): number[][] | null {
        const data = DataManager.instance && DataManager.instance.data;
        return (data && data.gridData && data.gridData.layout) ? data.gridData.layout : null;
    }

    public open() {
        if (this.panel) {
            this.panel.active = true;
        } else {
            this.node.active = true; // Panelが未割り当ての場合のフォールバック
        }
        this.selectedKey = null;
        this.selectedUnlockEquipmentId = null;
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Tap a locked cell to see its cost.';
        this.buildEquipmentList();
        this.refreshAll();
    }

    public close() {
        if (this.panel) {
            this.panel.active = false;
        } else {
            this.node.active = false;
        }
        this.cancelPlacement();
        this.clearPendingSingleClick();
        this.closeActiveDialog();
    }

    // 開いていたEject/LvUp/Cancel・Lvアップ確認ダイアログを閉じる(次のダイアログを開く前、
    // Customizeを閉じる時のどちらからも呼ぶ)。
    private closeActiveDialog() {
        if (this.activeDialogNode && this.activeDialogNode.isValid) {
            this.activeDialogNode.destroy();
        }
        this.activeDialogNode = null;
    }

    private onBackClicked() {
        SoundManager.instance.playSE('click');
        this.close();
    }

    // 現在グリッドに配置済みの全パーツが占有しているマスを"x,y"文字列のSetにする
    // (refreshCell()の色分け、配置モード中のcanPlaceShape()判定の両方で使う)。
    private getOccupiedCellSet(): Set<string> {
        const data = DataManager.instance && DataManager.instance.data;
        const parts = data && data.gridData ? data.gridData.equippedParts : [];
        const set = new Set<string>();
        for (const part of parts || []) {
            const cells = part.cells ? shapeCellsAt(part.cells, part.x, part.y) : null;
            if (cells) {
                for (const c of cells) set.add(`${c.x},${c.y}`);
            } else {
                for (let dy = 0; dy < part.h; dy++) {
                    for (let dx = 0; dx < part.w; dx++) set.add(`${part.x + dx},${part.y + dy}`);
                }
            }
        }
        return set;
    }

    private refreshAll() {
        const layout = this.getLayout();
        if (!layout) return;
        const occupied = this.getOccupiedCellSet();
        this.cells.forEach(cell => this.refreshCell(cell, layout, occupied));
    }

    private refreshCell(cell: CellRefs, layout: number[][], occupied: Set<string>) {
        const key = `${cell.x},${cell.y}`;
        const unlocked = layout[cell.y][cell.x] === 2;
        const selected = this.selectedKey === key;
        let color = COLOR_LOCKED;
        if (unlocked) {
            color = occupied.has(key) ? COLOR_OCCUPIED : COLOR_UNLOCKED;
        } else if (selected) {
            color = COLOR_SELECTED;
        }

        const g = cell.graphics;
        g.clear();
        g.fillColor = color;
        const half = (this.cellSize - this.cellGap) / 2;
        g.rect(-half, -half, this.cellSize - this.cellGap, this.cellSize - this.cellGap);
        g.fill();
    }

    // セルタップ処理。
    //   未解放(1): 2段階タップ方式(1回目=選択して共有情報欄にコスト表示、2回目=解放を確定)。
    //   解放済み(2)かつ装備アイテムが乗っている: シングルクリックで再配置モード開始、
    //     ダブルクリックでEject/LvUp/Cancelダイアログ(onOccupiedCellClicked参照)。
    //   解放済み(2)かつ空き: 情報表示のみ。
    private onCellClicked(x: number, y: number) {
        if (this.placementEntry) {
            this.onGridClickedDuringPlacement(x, y);
            return;
        }
        const layout = this.getLayout();
        if (!layout) return;
        const key = `${x},${y}`;
        const cellValue = layout[y][x];

        if (cellValue === 2) {
            const part = this.getPartAtCell(x, y);
            if (part) {
                this.onOccupiedCellClicked(part);
                return;
            }
            this.selectedKey = null;
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'This cell is already unlocked.';
            this.refreshAll();
            return;
        }

        if (this.selectedKey !== key) {
            this.selectedKey = key;
            SoundManager.instance.playSE('click');
            this.updateSharedInfo(true);
            this.refreshAll();
            return;
        }

        // 2回目タップ: 解放を確定する
        const data = DataManager.instance.data;
        if (!canAffordCellUnlock(data)) {
            SoundManager.instance.playSE('error', 'System');
            this.updateSharedInfo(true);
            return;
        }

        const ok = unlockCell(x, y, DataManager.instance);
        if (ok) {
            SoundManager.instance.playSE('upgrade', 'System');
            this.selectedKey = null;
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Cell unlocked!';
        } else {
            SoundManager.instance.playSE('error', 'System');
        }
        this.refreshAll();
    }

    // 次に解放する回(GridCells.csvのTier、購入済み回数+1)のコスト/必要アイテムを表示する。
    // どのセルを選んでいても同じ内容になる(コストはセル固有ではなく購入回数依存のため)。
    private updateSharedInfo(armed: boolean) {
        if (!this.sharedInfoLabel) return;
        const data = DataManager.instance.data;
        const info = getNextCellUnlockInfo(data);
        const hasEnough = data.money >= info.cost;
        const color = hasEnough ? '#ffffff' : '#ff4444';
        let text = `<color=${color}>Unlock cell (#${info.tier}): ${info.cost} credits</color>`;
        for (const it of info.items) {
            const have = data.inventory[it.itemId] || 0;
            const itemColor = have >= it.qty ? '#ffffff' : '#ff4444';
            text += `\n<color=${itemColor}>${it.itemId} x${it.qty} (have ${have})</color>`;
        }
        if (armed) text += '\n<color=#ffff00>Tap again to confirm.</color>';
        this.sharedInfoLabel.string = text;
    }

    // 指定セルを占有しているequippedPartsの要素を返す(無ければnull)。CustomizeCalc.
    // partOccupiedCells()(getOccupiedCellSet()と同じ占有判定ロジック)を使うが、実際のpart
    // オブジェクト自体が欲しい呼び出し元(グリッドのシングル/ダブルクリック処理)向け。
    private getPartAtCell(x: number, y: number): IGridPart | null {
        const data = DataManager.instance && DataManager.instance.data;
        const parts = data && data.gridData ? data.gridData.equippedParts : [];
        for (const part of parts || []) {
            if (partOccupiedCells(part).some(c => c.x === x && c.y === y)) return part;
        }
        return null;
    }

    // ============================================================
    // 装備済みセルのシングル/ダブルクリック判定。DOUBLE_CLICK_WINDOW以内に同じパーツへ2回目の
    // タップが来ればダブルクリック(Eject/LvUp/Cancelダイアログ)、来なければシングルクリック
    // (再配置モード開始)として扱う。
    // ============================================================

    private onOccupiedCellClicked(part: IGridPart) {
        if (this.pendingSingleClickPart && this.pendingSingleClickPart.id === part.id) {
            // ダブルクリック: 保留していたシングルクリック(再配置開始)をキャンセルし、詳細ダイアログを開く。
            this.clearPendingSingleClick();
            SoundManager.instance.playSE('click');
            this.openPartDetailDialog(part);
            return;
        }
        this.clearPendingSingleClick();
        this.pendingSingleClickPart = part;
        this.pendingSingleClickCallback = () => {
            this.pendingSingleClickPart = null;
            this.pendingSingleClickCallback = null;
            this.startReposition(part);
        };
        this.scheduleOnce(this.pendingSingleClickCallback, DOUBLE_CLICK_WINDOW);
    }

    private clearPendingSingleClick() {
        if (this.pendingSingleClickCallback) {
            this.unschedule(this.pendingSingleClickCallback);
        }
        this.pendingSingleClickPart = null;
        this.pendingSingleClickCallback = null;
    }

    // ============================================================
    // グリッド座標 <-> gridContainerローカル座標 の相互変換。buildGrid()のセル配置式と
    // 完全に一致させること(ここだけ変えるとセル位置とホバー判定がズレる)。
    // ============================================================

    private gridToLocal(x: number, y: number): Vec3 {
        const layout = this.getLayout();
        const rows = layout ? layout.length : 8;
        const cols = layout && layout[0] ? layout[0].length : 8;
        const localX = x * this.cellSize - (cols * this.cellSize) / 2 + this.cellSize / 2;
        const localY = -(y * this.cellSize) + (rows * this.cellSize) / 2 - this.cellSize / 2;
        return new Vec3(localX, localY, 0);
    }

    private localToGrid(localX: number, localY: number): { x: number; y: number } {
        const layout = this.getLayout();
        const rows = layout ? layout.length : 8;
        const cols = layout && layout[0] ? layout[0].length : 8;
        const x = Math.round((localX - this.cellSize / 2 + (cols * this.cellSize) / 2) / this.cellSize);
        const y = Math.round(((rows * this.cellSize) / 2 - this.cellSize / 2 - localY) / this.cellSize);
        return { x, y };
    }

    // ============================================================
    // 装備リスト(③): equipmentListContent(エディタ側で組んだScrollViewのcontentノード)配下に
    // getEquipmentListEntries()の項目を実行時に並べる。ScrollView本体(view/Mask/scrollBar)は
    // エディタ側で標準の方法で組んだものをequipmentScrollView/equipmentListContentに割り当てる。
    // open()のたびに中身だけ作り直す(解放/配置済み状態が変わっている可能性があるため)。
    // ============================================================

    private buildEquipmentList() {
        if (!this.equipmentScrollView || !this.equipmentListContent) {
            console.warn("[CustomizeUI] equipmentScrollView / equipmentListContent is not assigned. Cannot build equipment list.");
            return;
        }
        if (this.equipmentScrollView.content !== this.equipmentListContent) {
            console.warn("[CustomizeUI] equipmentScrollView.content does not match equipmentListContent. Assign the same Node to both in the Inspector.");
        }
        this.refreshEquipmentList();
    }

    private refreshEquipmentList() {
        const content = this.equipmentListContent;
        if (!content) return;
        content.removeAllChildren();

        const data = DataManager.instance.data;
        const entries = getEquipmentListEntries(data);
        const contentUiT = content.getComponent(UITransform) || content.addComponent(UITransform);
        const width = contentUiT.contentSize.width || 380;

        // 上から順に積んでいく前提のレイアウトなので、アンカーを上端(0.5,1)に固定する
        // (エディタ側の初期値と揃っていなくてもここで矯正する)。
        contentUiT.setAnchorPoint(0.5, 1);

        const stepY = this.listItemHeight + this.listItemGap;
        const totalHeight = Math.max(contentUiT.contentSize.height, entries.length * stepY);
        contentUiT.setContentSize(width, totalHeight);

        entries.forEach((entry, i) => {
            const item = this.buildEquipmentListItem(entry, width);
            content.addChild(item);
            item.setPosition(new Vec3(0, -i * stepY - this.listItemHeight / 2, 0));
        });
    }

    private entryName(entry: EquipmentListEntry): string {
        return entry.weapon ? entry.weapon.name : entry.equipment.name;
    }

    // 装備中エントリのリスト表示文字列。武器は"BeamGunLv1 : DMG10"形式(現在Lvの実ダメージ値、
    // WeaponCalc.computeWeaponLevelStats()参照)、非武器は名前のみ+"(equipped)"。
    private formatEquippedLabel(entry: EquipmentListEntry): string {
        if (entry.weapon) {
            const lv = entry.equippedLv || 0;
            const stats = computeWeaponLevelStats(entry.weapon, lv);
            return `${entry.weapon.name}Lv${lv} : DMG${stats.dmg.toFixed(0)}`;
        }
        return `${entry.equipment.name} (equipped)`;
    }

    // 1件ぶんのリスト項目(背景Graphics+名前Label+形状ミニプレビューGraphics)を組み立てる。
    // 4状態: 白=装備可能(クリックで配置モードへ) / 緑=解放可能(未解放だがクレジット足りる、
    // タップで解放購入の2段階確認) / 赤=???(未解放かつクレジット不足、名前も伏せる) /
    // 装備中(表示専用、クリック操作なし。再配置/Eject/LvUpは全てグリッド側のセルクリックで行う)。
    // 解放条件はEquipmentData側(entry.equipment)に一元化されているため、武器/非武器を問わず
    // 同じ判定になる。
    private buildEquipmentListItem(entry: EquipmentListEntry, width: number): Node {
        const { weapon, locked, equipped } = entry;
        const affordable = !equipped && locked ? canAffordEquipmentUnlock(entry.equipment, DataManager.instance.data) : false;
        // 状態: 'equipped'(装備中、表示専用) | 'equip'(白/装備可能) | 'unlock'(緑/解放可能) | 'hidden'(赤/???)
        const state: 'equipped' | 'equip' | 'unlock' | 'hidden' = equipped ? 'equipped' : (!locked ? 'equip' : (affordable ? 'unlock' : 'hidden'));

        const item = new Node(`EquipItem_${entry.equipment.id}`);
        const uiT = item.addComponent(UITransform);
        uiT.setContentSize(width, this.listItemHeight);

        const bg = item.addComponent(Graphics);
        bg.fillColor = state === 'hidden' ? new Color(35, 35, 40, 220) : (state === 'equipped' ? new Color(40, 55, 45, 220) : new Color(50, 50, 60, 220));
        bg.rect(-width / 2, -this.listItemHeight / 2, width, this.listItemHeight);
        bg.fill();

        const labelNode = new Node('Label');
        item.addChild(labelNode);
        const labelUiT = labelNode.addComponent(UITransform);
        labelUiT.setContentSize(width - this.listItemHeight - 16, this.listItemHeight);
        labelNode.setPosition(new Vec3(-this.listItemHeight / 2, 0, 0));
        const label = labelNode.addComponent(Label);
        label.string = state === 'hidden' ? '???' : (state === 'equipped' ? this.formatEquippedLabel(entry) : this.entryName(entry));
        label.fontSize = 22;
        label.color = state === 'equip' ? Color.WHITE : (state === 'unlock' ? new Color(90, 230, 120, 255) : (state === 'equipped' ? new Color(150, 220, 180, 255) : new Color(220, 70, 70, 255)));
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        item.on(Node.EventType.MOUSE_ENTER, () => this.onItemHoverEnter(entry), this);
        item.on(Node.EventType.MOUSE_LEAVE, () => this.onItemHoverLeave(), this);

        if (state === 'equipped') return item; // 表示専用、クリック操作は無し(グリッド側で行う)

        if (state === 'unlock') {
            // 緑(解放可能): ドラッグではなく2段階タップで解放購入する(セル解放と同じUX)。
            // 武器/非武器を問わずentry.equipment側の解放条件で判定するため、weapon=nullでも成立する。
            const unlockEntryRef = entry;
            item.on(Node.EventType.TOUCH_END, () => this.onUnlockableItemTapped(unlockEntryRef), this);
            item.on(Node.EventType.MOUSE_UP, () => this.onUnlockableItemTapped(unlockEntryRef), this);
            return item;
        }
        if (state === 'hidden') return item; // ???はタップしても何もしない(解放条件を満たしていないため)

        // 白(装備可能): 形状ミニプレビュー(右端、8px角のマス目で縮小表示)+タップで配置モードに入る
        // (ドラッグ&ドロップではなく、クリック/タップの単発イベントで完結させる。生ポインタ追従の
        // ドラッグは環境によって座標変換がずれ配置できないケースがあったため、より確実な
        // 「選択→グリッドをクリック、または矢印キーで移動してEnter/クリックで確定」方式にした)。
        const previewNode = new Node('ShapePreview');
        item.addChild(previewNode);
        previewNode.setPosition(new Vec3(width / 2 - this.listItemHeight / 2, 0, 0));
        const previewG = previewNode.addComponent(Graphics);
        this.drawShapePreview(previewG, entry.equipment, 8);

        const btn = item.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        item.on(Button.EventType.CLICK, () => this.onEquipItemClicked(entry), this);

        return item;
    }

    // マウスオーバー中(配置モード中は上書きしない、配置モードの案内文の方を優先する)。
    private onItemHoverEnter(entry: EquipmentListEntry) {
        if (this.placementEntry || !this.sharedInfoLabel) return;
        const { weapon, locked, equipment, equipped } = entry;
        const name = this.entryName(entry);
        // 武器なら能力値、非武器(Armor/Utility等)ならEquipment.csvのNote(効果の説明文)を見せる。
        const detail = weapon ? this.formatWeaponStats(weapon) : (equipment.note || '');

        if (equipped) {
            // 装備中は表示専用(操作はグリッド側のセルクリックで行う)。
            this.sharedInfoLabel.string = `${this.formatEquippedLabel(entry)}\nClick this item on the grid to move, level up, or eject it.`;
            return;
        }

        if (!locked) {
            this.sharedInfoLabel.string = `${name}${detail ? '\n' + detail : ''}\nClick to start placing it on the grid.`;
            return;
        }
        const data = DataManager.instance.data;
        if (canAffordEquipmentUnlock(equipment, data)) {
            // 緑(解放可能)は名前が見えている=存在自体は既知なので、能力値も合わせて見せてよい判断。
            this.sharedInfoLabel.string = `<color=#5ae678>${name} - Unlock for ${equipment.unlockCost} credits</color>\n${detail}\nTap to unlock.`;
        } else {
            // 赤(???)は存在自体が伏せられている状態なので、能力値も見せない。
            this.sharedInfoLabel.string = `<color=#dc4646>??? - Requires ${equipment.unlockCost} credits (you have ${data.money})</color>`;
        }
    }

    // 能力値の簡易表示。現状は武器ごとの永続Lv(装備後の強化)を記録・追跡する仕組みがまだ無いため、
    // 「現在のLv」は出せず基礎値(Weapons.csvのDmgMin/StarValue等)のみを表示する
    // (Lv別成長カーブ自体はWeaponCalc.computeWeaponLevelStats()で計算可能なので、Lv管理の仕組みが
    // できたらそちらの結果に差し替えられる)。
    private formatWeaponStats(weapon: WeaponData): string {
        const dmg = weapon.dmgMin === weapon.dmgMax ? `${weapon.dmgMin}` : `${weapon.dmgMin}-${weapon.dmgMax}`;
        return `Type: ${weapon.type}  DMG: ${dmg}  ★${weapon.starValue}`;
    }

    private onItemHoverLeave() {
        if (this.placementEntry || !this.sharedInfoLabel) return;
        if (this.selectedKey) {
            this.updateSharedInfo(true);
            return;
        }
        this.sharedInfoLabel.string = 'Tap a locked cell to see its cost.';
    }

    // 緑(解放可能)項目のタップ処理(2段階タップ、セル解放と同じUX)。解放条件は
    // entry.equipment(EquipmentUnlock.ts参照)で一元管理しているため、武器/非武器を問わず動作する。
    //   1回目: このアイテムを選択して共有情報欄に「もう一度タップで確定」を表示するだけ。
    //   同じアイテムをもう一度タップ: 実際にEquipmentUnlock.unlockEquipment()で解放購入を確定する。
    private onUnlockableItemTapped(entry: EquipmentListEntry) {
        if (this.placementEntry) return; // 配置モード中は解放購入と競合させない
        const { equipment } = entry;
        const name = this.entryName(entry);

        if (this.selectedUnlockEquipmentId !== equipment.id) {
            this.selectedUnlockEquipmentId = equipment.id;
            SoundManager.instance.playSE('click');
            if (this.sharedInfoLabel) {
                this.sharedInfoLabel.string = `<color=#5ae678>${name} - Unlock for ${equipment.unlockCost} credits</color>\n<color=#ffff00>Tap again to confirm.</color>`;
            }
            return;
        }

        const ok = unlockEquipment(equipment, DataManager.instance);
        this.selectedUnlockEquipmentId = null;
        if (ok) {
            SoundManager.instance.playSE('upgrade', 'System');
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = `${name} unlocked!`;
            this.refreshEquipmentList(); // 白(装備可能)状態に切り替わるので項目を作り直す
        } else {
            SoundManager.instance.playSE('error', 'System');
        }
    }

    private drawShapePreview(g: Graphics, equipment: EquipmentData, cellPx: number) {
        const shape = equipment ? equipment.shapeCells : null;
        if (!shape || shape.length === 0) return;
        const maxX = Math.max(...shape.map(c => c.x));
        const maxY = Math.max(...shape.map(c => c.y));
        const w = (maxX + 1) * cellPx;
        const h = (maxY + 1) * cellPx;
        g.fillColor = COLOR_UNLOCKED;
        for (const c of shape) {
            const x = c.x * cellPx - w / 2;
            const y = -c.y * cellPx + h / 2 - cellPx;
            g.rect(x, y, cellPx - 1, cellPx - 1);
        }
        g.fill();
    }

    // ============================================================
    // 装備配置(クリック+矢印キー方式)。生ポインタを追いかけるドラッグ&ドロップは環境によって
    // UI座標変換がずれてゴーストが正しく出ない/確定できないケースがあったため、単発のクリックと
    // キーボードだけで完結する、より確実な方式に切り替えた:
    //   1. 白(装備可能)項目をクリック → 配置モードに入り、形状の中心がグリッド中央付近に来る
    //      アンカーへゴーストを表示する(常に(0,0)からだとGridContainerの隅で見失いやすいため)。
    //   2. 配置モード中は矢印キーでゴーストを1マスずつ移動できる(canPlaceShape()の結果に応じて
    //      緑=配置可能/赤=配置不可の色で常に表示)。
    //   3. グリッドの好きなマスをクリックするとその場所へゴーストがジャンプする(移動のショート
    //      カット、まだ確定はしない)。
    //   4. Enterキー、または(緑=配置可能な状態で)グリッドを2回目クリックすると確定する。
    //      Escapeキー、または同じ装備リスト項目を再クリックするとキャンセルする。
    // ============================================================

    private onEquipItemClicked(entry: EquipmentListEntry) {
        if (this.placementEntry && this.placementEntry.equipment.id === entry.equipment.id) {
            this.cancelPlacement();
            return;
        }
        this.startPlacement(entry);
    }

    private startPlacement(entry: EquipmentListEntry) {
        this.cancelPlacement(); // 別の装備を選び直した場合、前の配置モードを消しておく

        this.placementEntry = entry;
        this.placementAnchor = this.getCenterAnchorFor(entry.equipment);

        this.placementGhost = new Node('PlacementGhost');
        this.placementGhostGraphics = this.placementGhost.addComponent(Graphics);
        this.gridContainer.addChild(this.placementGhost);
        this.placementGhost.setSiblingIndex(this.gridContainer.children.length - 1); // 最前面に

        input.on(Input.EventType.KEY_DOWN, this.onPlacementKeyDown, this);

        SoundManager.instance.playSE('click');
        this.updatePlacementInfo();
        this.updateGhostVisual();
    }

    // 配置モード開始時、形状の中心がだいたいグリッド中央あたりに来るようなアンカー座標を計算する。
    private getCenterAnchorFor(equipment: EquipmentData): { x: number; y: number } {
        const layout = this.getLayout();
        const rows = layout ? layout.length : 8;
        const cols = layout && layout[0] ? layout[0].length : 8;
        const shape = equipment ? equipment.shapeCells : [];
        const shapeW = shape.length > 0 ? Math.max(...shape.map(c => c.x)) + 1 : 1;
        const shapeH = shape.length > 0 ? Math.max(...shape.map(c => c.y)) + 1 : 1;
        return {
            x: Math.max(0, Math.min(cols - 1, Math.floor((cols - shapeW) / 2))),
            y: Math.max(0, Math.min(rows - 1, Math.floor((rows - shapeH) / 2))),
        };
    }

    // グリッドのセルをクリックした時、配置モード中ならそこへゴーストをジャンプさせる
    // (既に同じマスが選択済み=2回目のクリックなら、配置可能な場合に確定する)。onCellClicked()から呼ぶ。
    private onGridClickedDuringPlacement(x: number, y: number) {
        const sameSpot = this.placementAnchor.x === x && this.placementAnchor.y === y;
        if (sameSpot && this.placementValid) {
            this.confirmPlacement();
            return;
        }
        this.placementAnchor = { x, y };
        SoundManager.instance.playSE('click');
        this.updateGhostVisual();
        this.updatePlacementInfo();
    }

    private onPlacementKeyDown(event: EventKeyboard) {
        if (!this.placementEntry) return;
        switch (event.keyCode) {
            case KeyCode.ARROW_UP: this.movePlacement(0, -1); break; // グリッドはY下向きプラスなので-1
            case KeyCode.ARROW_DOWN: this.movePlacement(0, 1); break;
            case KeyCode.ARROW_LEFT: this.movePlacement(-1, 0); break;
            case KeyCode.ARROW_RIGHT: this.movePlacement(1, 0); break;
            case KeyCode.ENTER:
            case KeyCode.NUMPAD_ENTER:
                this.confirmPlacement();
                break;
            case KeyCode.ESCAPE: this.cancelPlacement(); break;
            default: break;
        }
    }

    private movePlacement(dx: number, dy: number) {
        if (!this.placementEntry) return;
        const layout = this.getLayout();
        const rows = layout ? layout.length : 8;
        const cols = layout && layout[0] ? layout[0].length : 8;
        this.placementAnchor = {
            x: Math.max(0, Math.min(cols - 1, this.placementAnchor.x + dx)),
            y: Math.max(0, Math.min(rows - 1, this.placementAnchor.y + dy)),
        };
        this.updateGhostVisual();
        this.updatePlacementInfo();
    }

    private updateGhostVisual() {
        if (!this.placementEntry || !this.placementGhost) return;
        const layout = this.getLayout();
        const data = DataManager.instance.data;
        const shape = this.placementEntry.equipment.shapeCells || [];
        const cells = shapeCellsAt(shape, this.placementAnchor.x, this.placementAnchor.y);
        // 再配置中は自分自身のパーツとの重なりを無視する(元の位置に戻す/隣接位置へずらす操作を
        // 「自分自身とぶつかっている」として弾かないようにするため、CustomizeCalc.canPlaceShape()の
        // excludePartId引数を使う)。
        this.placementValid = !!layout && canPlaceShape(cells, layout, data.gridData.equippedParts, this.placementMovingPartId || undefined);

        const g = this.placementGhostGraphics;
        g.clear();
        g.fillColor = this.placementValid ? COLOR_GHOST_OK : COLOR_GHOST_NG;
        const half = (this.cellSize - this.cellGap) / 2;
        for (const c of shape) {
            const pos = this.gridToLocal(this.placementAnchor.x + c.x, this.placementAnchor.y + c.y);
            g.rect(pos.x - half, pos.y - half, this.cellSize - this.cellGap, this.cellSize - this.cellGap);
        }
        g.fill();
    }

    private updatePlacementInfo() {
        if (!this.sharedInfoLabel || !this.placementEntry) return;
        const hint = this.placementValid
            ? '<color=#5ae678>Click again or press Enter to confirm.</color>'
            : '<color=#dc4646>Cannot place here.</color>';
        const verb = this.placementMovingPartId ? 'Moving' : 'Placing';
        this.sharedInfoLabel.string = `${verb} ${this.entryName(this.placementEntry)}...\nArrow keys or click a cell to move, Esc to cancel.\n${hint}`;
    }

    private confirmPlacement() {
        if (!this.placementEntry || !this.placementValid) {
            SoundManager.instance.playSE('error', 'System');
            return;
        }
        const entry = this.placementEntry;
        const anchor = this.placementAnchor;
        const name = this.entryName(entry);
        const movingPartId = this.placementMovingPartId;

        let ok: boolean;
        if (movingPartId) {
            // 再配置: 新規パーツを追加せず、既存パーツのx/yだけを書き換える
            // (「再移動できない場合はキャンセル(元に戻す)」は、そもそもconfirmするまでpart.x/yを
            // 一切変更しない=Escapeキャンセル/未確定のままCustomizeを閉じれば自動的に満たされる)。
            const data = DataManager.instance.data;
            const part = (data.gridData.equippedParts || []).find(p => p.id === movingPartId);
            if (part) {
                part.x = anchor.x;
                part.y = anchor.y;
                DataManager.instance.save();
                ok = true;
            } else {
                ok = false;
            }
        } else {
            ok = placeEquipment(entry, anchor.x, anchor.y, DataManager.instance);
        }

        this.cancelPlacement();
        if (ok) {
            SoundManager.instance.playSE('upgrade', 'System');
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = movingPartId ? `${name} moved!` : `${name} equipped!`;
            this.refreshEquipmentList();
            this.refreshAll();
            if (UIManager.instance && UIManager.instance.sideBarUI) UIManager.instance.sideBarUI.updateShipInfo();
        } else {
            SoundManager.instance.playSE('error', 'System');
        }
    }

    // 配置モードを中断する(確定はしない)。Escapeキー/別項目の選択/close()等から呼ぶ。
    private cancelPlacement() {
        if (!this.placementEntry) return;
        input.off(Input.EventType.KEY_DOWN, this.onPlacementKeyDown, this);
        if (this.placementGhost) {
            this.placementGhost.destroy();
            this.placementGhost = null;
            this.placementGhostGraphics = null;
        }
        this.placementEntry = null;
        this.placementMovingPartId = null;
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Tap a locked cell to see its cost.';
    }

    // 既存パーツの再配置モードを開始する(グリッド上の装備済みセルのシングルクリックから)。
    // startPlacement()と同じゴースト移動の仕組みを再利用し、初期アンカーをパーツの現在位置にする。
    private startReposition(part: IGridPart) {
        this.cancelPlacement();
        const db = GameDatabase.instance;
        if (!db || !part.equipmentId) return;
        const equipment = db.getEquipmentData(part.equipmentId);
        if (!equipment) return;
        const weapon = part.weaponId ? db.getWeaponData(part.weaponId) : null;

        const entry: EquipmentListEntry = { equipment, weapon, locked: false, equipped: true, equippedLv: part.lv || 0 };
        this.placementEntry = entry;
        this.placementMovingPartId = part.id || null;
        this.placementAnchor = { x: part.x, y: part.y };

        this.placementGhost = new Node('PlacementGhost');
        this.placementGhostGraphics = this.placementGhost.addComponent(Graphics);
        this.gridContainer.addChild(this.placementGhost);
        this.placementGhost.setSiblingIndex(this.gridContainer.children.length - 1);

        input.on(Input.EventType.KEY_DOWN, this.onPlacementKeyDown, this);

        this.updatePlacementInfo();
        this.updateGhostVisual();
    }

    // ============================================================
    // 装備済みパーツのダブルクリック: Eject/LvUp/Cancel確認ダイアログ(DialogWindow.prefab経由)。
    // ============================================================

    // ダイアログ本文用の簡易ステータス文字列("Type: Fire  DMG: 10.0  Lv0/10"等、非武器はEquipment.csvのNote)。
    private formatPartSummary(weapon: WeaponData | null, equipment: EquipmentData, lv: number): string {
        if (!weapon) return equipment.note || '';
        const stats = computeWeaponLevelStats(weapon, lv);
        return `Type: ${weapon.type}  DMG: ${stats.dmg.toFixed(1)}  Lv${lv}/${weapon.maxLv}`;
    }

    private openPartDetailDialog(part: IGridPart) {
        this.closeActiveDialog();
        const db = GameDatabase.instance;
        if (!db || !part.equipmentId) return;
        const equipment = db.getEquipmentData(part.equipmentId);
        if (!equipment) return;
        const weapon = part.weaponId ? db.getWeaponData(part.weaponId) : null;
        const lv = part.lv || 0;
        const name = weapon ? weapon.name : equipment.name;

        const gm = GameManager.instance;
        const upgradeCost = weapon && gm ? computeWeaponUpgradeCost(weapon, lv, gm) : null;
        const canLvUp = !!upgradeCost; // nullはMaxLv到達済み(または非武器パーツ)

        // ボタンPrefabは全て240x60固定なので、3個並べる時は等間隔+縮小(scale)しないと隣同士が
        // 重なる(instantiatePrefabButtonのscale引数、UpgradeUI/HomeUIのYes/No2個並びと同じ仕組み)。
        const scale = 0.55;
        const buttons: DialogButtonSpec[] = [];
        if (weapon) {
            // 3ボタン: Eject / Level Up / Cancel
            buttons.push({
                prefabPath: "Prefabs/Canvas/Button-Reselect", x: -190, y: -110, scale, label: "EJECT",
                color: new Color(200, 60, 60), onClick: () => { this.ejectPart(part); this.closeActiveDialog(); },
            });
            buttons.push({
                prefabPath: "Prefabs/Canvas/Button-Yes", x: 0, y: -110, scale, label: "LEVEL UP",
                color: new Color(60, 160, 60), interactable: canLvUp,
                onClick: () => { this.closeActiveDialog(); this.showWeaponLvUpConfirm(part, weapon); },
            });
            buttons.push({
                prefabPath: "Prefabs/Canvas/Button-No", x: 190, y: -110, scale, label: "CANCEL",
                color: new Color(90, 90, 90), onClick: () => this.closeActiveDialog(),
            });
        } else {
            // 2ボタン: Eject / Cancel(非武器パーツにはLvUpの概念が無い)
            buttons.push({
                prefabPath: "Prefabs/Canvas/Button-Reselect", x: -150, y: -110, scale, label: "EJECT",
                color: new Color(200, 60, 60), onClick: () => { this.ejectPart(part); this.closeActiveDialog(); },
            });
            buttons.push({
                prefabPath: "Prefabs/Canvas/Button-No", x: 150, y: -110, scale, label: "CANCEL",
                color: new Color(90, 90, 90), onClick: () => this.closeActiveDialog(),
            });
        }

        showDialogPrefab(this.root, name, this.formatPartSummary(weapon, equipment, lv), buttons, (node) => {
            this.activeDialogNode = node;
        }, { width: 560, height: 280 });
    }

    // Ejectを実行する。返金は無し(Equipment.csvの解放状態はunlockedEquipmentIdsに残り続けるため、
    // 再配置は引き続き無料)。
    private ejectPart(part: IGridPart) {
        const data = DataManager.instance.data;
        const parts = data.gridData.equippedParts || [];
        const idx = parts.findIndex(p => p.id === part.id);
        if (idx < 0) return;
        const db = GameDatabase.instance;
        const equipment = db && part.equipmentId ? db.getEquipmentData(part.equipmentId) : null;
        const name = equipment ? equipment.name : (part.type || 'Item');

        parts.splice(idx, 1);
        DataManager.instance.save();
        SoundManager.instance.playSE('click');
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = `${name} ejected.`;
        this.refreshEquipmentList();
        this.refreshAll();
        if (UIManager.instance && UIManager.instance.sideBarUI) UIManager.instance.sideBarUI.updateShipInfo();
    }

    // ============================================================
    // 武器Lvアップ確認ダイアログ(DialogWindow.prefab経由)。
    // ============================================================

    private showWeaponLvUpConfirm(part: IGridPart, weapon: WeaponData) {
        this.closeActiveDialog();
        const gm = GameManager.instance;
        if (!gm) return;
        const currentLv = part.lv || 0;
        const cost = computeWeaponUpgradeCost(weapon, currentLv, gm);
        if (!cost) return; // MaxLv到達済み(LvUpボタンは非活性のはずだが念のため)

        const data = DataManager.instance.data;
        const hasEnoughCredits = data.money >= cost.creditsCost;
        const hasEnoughMaterial = !cost.material || (data.inventory[cost.material.itemId] || 0) >= cost.material.qty;
        const creditColor = hasEnoughCredits ? '#ffffff' : '#ff4444';

        let itemLine = 'No material required';
        let itemColor = '#ffffff';
        if (cost.material) {
            const have = data.inventory[cost.material.itemId] || 0;
            itemColor = have >= cost.material.qty ? '#ffffff' : '#ff4444';
            itemLine = `${cost.material.itemId} x${cost.material.qty} (have ${have})`;
        }

        const curStats = computeWeaponLevelStats(weapon, currentLv);
        const nextStats = computeWeaponLevelStats(weapon, cost.nextLv);
        const body =
            `Lv${currentLv} → Lv${cost.nextLv}\n` +
            `<color=${creditColor}>${cost.creditsCost} credits</color>\n` +
            `<color=${itemColor}>${itemLine}</color>\n` +
            `ShootSpeed ${curStats.sp.toFixed(2)} → <color=#66ff66>${nextStats.sp.toFixed(2)}</color>\n` +
            `Damage ${curStats.dmg.toFixed(2)} → <color=#66ff66>${nextStats.dmg.toFixed(2)}</color>\n` +
            `WaitTime ${curStats.wt.toFixed(3)} → <color=#66ff66>${nextStats.wt.toFixed(3)}</color>`;

        const buttons: DialogButtonSpec[] = [
            {
                // UpgradeUI.showUpgradeConfirm()と同じx=±90/scale=0.65の組み合わせ
                // (240px幅のボタンをこの間隔に並べる際は縮小しないと重なる)。
                prefabPath: "Prefabs/Canvas/Button-Yes", x: -90, y: -150, scale: 0.65, label: "YES",
                color: Color.GREEN,
                onClick: () => {
                    if (!hasEnoughCredits || !hasEnoughMaterial) {
                        SoundManager.instance.playSE('error', 'System');
                        return;
                    }
                    this.executeWeaponLvUp(part, cost);
                    this.closeActiveDialog();
                },
            },
            {
                prefabPath: "Prefabs/Canvas/Button-No", x: 90, y: -150, scale: 0.65, label: "NO",
                color: Color.GRAY, onClick: () => this.closeActiveDialog(),
            },
        ];

        showDialogPrefab(this.root, "Do you want to level up?", body, buttons, (node) => {
            this.activeDialogNode = node;
        }, { width: 560, height: 420 });
    }

    private executeWeaponLvUp(part: IGridPart, cost: { nextLv: number; creditsCost: number; material: { itemId: string; qty: number } | null }) {
        DataManager.instance.addResource('credits', -cost.creditsCost);
        if (cost.material) {
            DataManager.instance.addResource(cost.material.itemId, -cost.material.qty);
        }
        part.lv = cost.nextLv;
        DataManager.instance.save();

        SoundManager.instance.playSE('upgrade', 'System');
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = `Leveled up to Lv${cost.nextLv}!`;
        this.refreshEquipmentList();
        this.refreshAll();
    }
}
