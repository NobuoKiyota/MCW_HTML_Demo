import { _decorator, Component, Node, Graphics, Color, UITransform, Button, RichText, Label, Vec3, ScrollView, Input, input, EventKeyboard, KeyCode, BlockInputEvents } from 'cc';
import { DataManager } from './DataManager';
import { SoundManager } from './SoundManager';
import { WeaponData, EquipmentData } from './GameDataTypes';
import { isCellInHull, getCellUnlockCost, unlockCell, getEquipmentListEntries, EquipmentListEntry, canPlaceShape, shapeCellsAt, placeEquipment } from './CustomizeCalc';
import { canAffordEquipmentUnlock, unlockEquipment } from './EquipmentUnlock';

const { ccclass, property } = _decorator;

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
 * グリッド(8x8=最大64マス)はUpgradeUI.tsのRow_<ParamID>のように1つずつ手動でノードを用意するのは
 * 非現実的なため、gridContainer配下に必要なNodeを実行時に動的生成する(BuffVisualEffect.tsが
 * 星ノードを動的生成するのと同じ方針)。装備リストのScrollView本体(view/Mask/scrollBar)は
 * エディタ側で標準の方法で組み、equipmentScrollView/equipmentListContentに割り当てる想定
 * (中身の項目だけequipmentListContent配下に動的生成する)。
 *
 * リストにはWeapons.csvに紐づく武器(CustomizeCalc.EquipmentListEntry.weaponが非null)と、
 * それ以外のArmor/Utility等の純粋な装備(weapon=null)の両方が並ぶ。後者は現状クレジット解放の
 * 仕組みが無いため常に「装備可能(白)」扱いで、表示+グリッド配置のみ対応する(HP+10%等の実際の
 * 効果適用はEquipment.csv上のNoteに人間向けの説明があるだけで、まだシステムには繋がっていない)。
 *
 * 2つの操作系がある:
 *   ①セル解放: 2段階タップ方式(UpgradeUI.onUpgradeClicked()と同じ)。
 *     1回目のタップ: そのセルを選択し、共有情報欄にコストを表示するだけ(解放しない)。
 *     同じセルをもう一度タップ: 解放を実行する。
 *   ②装備配置: 装備リストの白(装備可能)項目をクリックすると配置モードに入り、グリッド上に
 *     形状(shapeCells)のゴーストを表示する(配置可能=緑/不可=赤)。矢印キーで1マスずつ移動、
 *     グリッドの別マスをクリックでジャンプ、Enterまたは緑状態でのグリッド再クリックで確定、
 *     Escapeでキャンセル。生ポインタを追いかけるドラッグ&ドロップではなく単発クリック+
 *     キーボードだけで完結させている(環境によってポインタ追従がズレて配置できないケースが
 *     あったため、より確実な方式に変更した経緯がある)。
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

    // 46(内容)+2(隙間)=48。8x8で48x8=384、gridContainerを400x400にすれば自動的に
    // 上下左右8pxずつのOffsetになる(center基準の配置計算のため)。
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
    private placementEntry: EquipmentListEntry | null = null;
    private placementGhost: Node | null = null;
    private placementGhostGraphics: Graphics | null = null;
    private placementValid: boolean = false;
    private placementAnchor: { x: number; y: number } = { x: 0, y: 0 };

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

    // セルタップ処理(2段階タップ)。
    //   1回目(未選択、または別のセルを選択中): このセルを選択して共有情報欄に表示するだけ。
    //   2回目(既にこのセルが選択済み): 実際に解放する。
    //   既に解放済み(2)のセルは常に何もしない(情報表示のみ)。
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
        const hasEnoughCredits = data.money >= getCellUnlockCost();
        if (!hasEnoughCredits) {
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

    private updateSharedInfo(armed: boolean) {
        if (!this.sharedInfoLabel) return;
        const cost = getCellUnlockCost();
        const data = DataManager.instance.data;
        const hasEnough = data.money >= cost;
        const color = hasEnough ? '#ffffff' : '#ff4444';
        let text = `<color=${color}>Unlock cell: ${cost} credits</color>`;
        if (armed) text += '\n<color=#ffff00>Tap again to confirm.</color>';
        this.sharedInfoLabel.string = text;
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

    // 1件ぶんのリスト項目(背景Graphics+名前Label+形状ミニプレビューGraphics)を組み立てる。
    // 3状態: 白=装備可能(クリックで配置モードへ) / 緑=解放可能(未解放だがクレジット足りる、
    // タップで解放購入の2段階確認) / 赤=???(未解放かつクレジット不足、名前も伏せる)。
    // 解放条件はEquipmentData側(entry.equipment)に一元化されているため、武器/非武器を問わず
    // 同じ判定になる。
    private buildEquipmentListItem(entry: EquipmentListEntry, width: number): Node {
        const { weapon, locked } = entry;
        const affordable = locked ? canAffordEquipmentUnlock(entry.equipment, DataManager.instance.data) : false;
        // 状態: 'equip'(白/装備可能) | 'unlock'(緑/解放可能) | 'hidden'(赤/???)
        const state: 'equip' | 'unlock' | 'hidden' = !locked ? 'equip' : (affordable ? 'unlock' : 'hidden');

        const item = new Node(`EquipItem_${entry.equipment.id}`);
        const uiT = item.addComponent(UITransform);
        uiT.setContentSize(width, this.listItemHeight);

        const bg = item.addComponent(Graphics);
        bg.fillColor = state === 'hidden' ? new Color(35, 35, 40, 220) : new Color(50, 50, 60, 220);
        bg.rect(-width / 2, -this.listItemHeight / 2, width, this.listItemHeight);
        bg.fill();

        const labelNode = new Node('Label');
        item.addChild(labelNode);
        const labelUiT = labelNode.addComponent(UITransform);
        labelUiT.setContentSize(width - this.listItemHeight - 16, this.listItemHeight);
        labelNode.setPosition(new Vec3(-this.listItemHeight / 2, 0, 0));
        const label = labelNode.addComponent(Label);
        label.string = state === 'hidden' ? '???' : this.entryName(entry);
        label.fontSize = 22;
        label.color = state === 'equip' ? Color.WHITE : (state === 'unlock' ? new Color(90, 230, 120, 255) : new Color(220, 70, 70, 255));
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        item.on(Node.EventType.MOUSE_ENTER, () => this.onItemHoverEnter(entry), this);
        item.on(Node.EventType.MOUSE_LEAVE, () => this.onItemHoverLeave(), this);

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
        const { weapon, locked, equipment } = entry;
        const name = this.entryName(entry);
        // 武器なら能力値、非武器(Armor/Utility等)ならEquipment.csvのNote(効果の説明文)を見せる。
        const detail = weapon ? this.formatWeaponStats(weapon) : (equipment.note || '');

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
        this.placementValid = !!layout && canPlaceShape(cells, layout, data.gridData.equippedParts);

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
            ? '<color=#5ae678>Click again or press Enter to place.</color>'
            : '<color=#dc4646>Cannot place here.</color>';
        this.sharedInfoLabel.string = `Placing ${this.entryName(this.placementEntry)}...\nArrow keys or click a cell to move, Esc to cancel.\n${hint}`;
    }

    private confirmPlacement() {
        if (!this.placementEntry || !this.placementValid) {
            SoundManager.instance.playSE('error', 'System');
            return;
        }
        const entry = this.placementEntry;
        const anchor = this.placementAnchor;
        const name = this.entryName(entry);
        const ok = placeEquipment(entry, anchor.x, anchor.y, DataManager.instance);
        this.cancelPlacement();
        if (ok) {
            SoundManager.instance.playSE('upgrade', 'System');
            if (this.sharedInfoLabel) this.sharedInfoLabel.string = `${name} equipped!`;
            this.refreshEquipmentList();
            this.refreshAll();
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
        if (this.sharedInfoLabel) this.sharedInfoLabel.string = 'Tap a locked cell to see its cost.';
    }
}
