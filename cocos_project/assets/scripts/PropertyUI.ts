import { _decorator, Component, Node, Label, Color, Graphics, BlockInputEvents, UITransform, Sprite, SpriteFrame, resources } from 'cc';
import { DataManager } from './DataManager';
import { GameDatabase } from './GameDatabase';
import { SoundManager } from './SoundManager';
import { instantiatePrefabButton } from './UIButtonPrefab';
import { UIManager } from './UIManager';

const { ccclass, property } = _decorator;

// assets/resources/png/UI1040x800Property.png(元1040x800、13:10)。Canvasのdesign resolution
// (1280x720)に高さが収まるよう、同じアスペクト比のまま936x720に縮小して使う。
const BG_PATH = "png/UI1040x800Property/spriteFrame";

@ccclass('PropertyUI')
export class PropertyUI extends Component {

    private readonly sideWidth = 936;
    private readonly sideHeight = 720;

    private page: number = 0;
    private maxPage: number = 0;
    private itemsPerPage: number = 60; // 30x2 = 60
    private windowNode: Node = null;
    private listNode: Node = null;
    private pageLabel: Label = null;
    // notifyOverlayOpening()の戻り値(世代番号)。CustomizeUI.tsのoverlayGenと同じ役割。
    private overlayGen: number = 0;

    onLoad() {
        // MissionUI/CustomizeUI/UpgradeUI/HistoryUI等、他の全画面オーバーレイと排他にする
        // (UIManager.notifyOverlayOpening()参照)。HomeUI.onPropertyClicked()側にも連打防止の
        // 多重生成ガードがあるが、SideBarUI等の別経路から開かれる場合に備えてここでも
        // 相互排他を保証しておく。
        if (UIManager.instance) {
            this.overlayGen = UIManager.instance.notifyOverlayOpening('PropertyUI', this.node, () => {
                if (this.node && this.node.isValid) this.node.destroy();
            });
        }
        this.setupUI();
    }

    // close()を経由しない破棄経路(多重生成ガードによる破棄、他オーバーレイが開いた際の
    // UIManager経由の破棄)の保険。close()からも同じ世代番号で呼ぶので、二重に呼ばれても安全。
    onDestroy() {
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('PropertyUI', this.overlayGen);
    }

    private setupUI() {
        const sideWidth = this.sideWidth;
        const sideHeight = this.sideHeight;

        // Dimmer
        const dimmer = this.node.addComponent(Graphics);
        dimmer.fillColor = new Color(0, 0, 0, 200);
        dimmer.rect(-2000, -2000, 4000, 4000);
        dimmer.fill();
        this.node.addComponent(BlockInputEvents);

        // Window
        this.windowNode = new Node("Window");
        this.node.addChild(this.windowNode);
        const winTrans = this.windowNode.addComponent(UITransform);
        winTrans.setContentSize(sideWidth, sideHeight);
        this.loadWindowBackground(sideWidth, sideHeight);

        // Title
        const titleNode = new Node("Title");
        this.windowNode.addChild(titleNode);
        titleNode.setPosition(0, sideHeight / 2 - 50);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = "PROPERTY - INVENTORY";
        titleLabel.fontSize = 32;
        titleLabel.color = Color.CYAN;

        // List Container
        this.listNode = new Node("List");
        this.windowNode.addChild(this.listNode);
        this.listNode.setPosition(0, 0);

        // Pagination Label
        const pageNode = new Node("PageLabel");
        this.windowNode.addChild(pageNode);
        pageNode.setPosition(0, -sideHeight / 2 + 100);
        this.pageLabel = pageNode.addComponent(Label);
        this.pageLabel.string = "PAGE: 1 / 1";
        this.pageLabel.fontSize = 24;

        // Buttons: 最下段に横並び(Prev / Close / Next)。以前はCloseだけ右上に置いていたのを統一。
        const btnY = -sideHeight / 2 + 50;
        instantiatePrefabButton("Prefabs/Canvas/Button-Prev", this.windowNode, -220, btnY, () => this.changePage(-1), this.windowNode, "<<PREV", Color.WHITE);
        instantiatePrefabButton("Prefabs/Canvas/Button-Close", this.windowNode, 0, btnY, () => this.close(), this.windowNode, "CLOSE", Color.WHITE);
        instantiatePrefabButton("Prefabs/Canvas/Button-Next2", this.windowNode, 220, btnY, () => this.changePage(1), this.windowNode, "NEXT>>", Color.WHITE);

        this.refreshList();
    }

    // MissionUI.ts等と同じ規約: 背景アートが無い/ロード失敗した場合のみ、以前のGraphics塗り+
    // 枠線にフォールバックする(CLAUDE.mdの「Prefab/アセット欠如に対して防御的に」の方針)。
    private loadWindowBackground(sideWidth: number, sideHeight: number) {
        const sprite = this.windowNode.addComponent(Sprite);
        resources.load(BG_PATH, SpriteFrame, (err, frame) => {
            if (err || !frame || !this.windowNode || !this.windowNode.isValid) {
                console.warn(`[PropertyUI] Failed to load ${BG_PATH}. Falling back to flat panel color.`, err);
                const winGr = this.windowNode.addComponent(Graphics);
                winGr.fillColor = new Color(20, 20, 30, 255);
                winGr.roundRect(-sideWidth / 2, -sideHeight / 2, sideWidth, sideHeight, 15);
                winGr.fill();
                winGr.strokeColor = Color.CYAN;
                winGr.lineWidth = 4;
                winGr.stroke();
                return;
            }
            sprite.spriteFrame = frame;
        });
    }

    private refreshList() {
        this.listNode.removeAllChildren();
        const data = DataManager.instance.data;
        const inventory = data.inventory;
        const itemKeys = Object.keys(inventory).filter(k => inventory[k] > 0);

        this.maxPage = Math.max(1, Math.ceil(itemKeys.length / this.itemsPerPage));
        if (this.page >= this.maxPage) this.page = this.maxPage - 1;

        const startIdx = this.page * this.itemsPerPage;
        const endIdx = Math.min(startIdx + this.itemsPerPage, itemKeys.length);

        this.pageLabel.string = `PAGE: ${this.page + 1} / ${this.maxPage}`;

        // 元は1040幅設計(startX=-480, colGap=500)だったので、936幅(936/1040=0.9)に合わせて
        // 同じ比率で縮小する。
        const startX = -432;
        const startY = 252;
        const colGap = 450;
        const rowGap = 18;

        for (let i = startIdx; i < endIdx; i++) {
            const relativeIdx = i - startIdx;
            const col = Math.floor(relativeIdx / 30);
            const row = relativeIdx % 30;

            const itemId = itemKeys[i];
            const count = inventory[itemId];
            // Items.csv(GameDatabase.getItemData)を正とする。旧GAME_SETTINGS.ECONOMY.ITEMS(廃止済みの
            // ID体系)を参照していたため、現行のItems.csv由来のIDが「名前不明」のまま生IDで表示されて
            // いたのを修正。GameDatabase未ロード/該当ID無しの場合のみ生IDへフォールバックする。
            const db = GameDatabase.instance;
            const def = db ? db.getItemData(itemId) : null;
            const itemName = def ? def.name : itemId;

            const itemNode = new Node("Item_" + itemId);
            this.listNode.addChild(itemNode);
            itemNode.setPosition(startX + col * colGap, startY - row * rowGap);

            const lbl = itemNode.addComponent(Label);
            lbl.string = `${itemName} ${count > 1 ? ' x' + count : ''}`;
            lbl.fontSize = 18;
            lbl.horizontalAlign = Label.HorizontalAlign.LEFT;

            // Anchor Set (Left)
            const trans = itemNode.getComponent(UITransform);
            trans.setAnchorPoint(0, 0.5);
        }
    }

    private changePage(delta: number) {
        SoundManager.instance.playSE("click");
        this.page += delta;
        if (this.page < 0) this.page = 0;
        if (this.page >= this.maxPage) this.page = this.maxPage - 1;
        this.refreshList();
    }

    private close() {
        SoundManager.instance.playSE("click");
        // node.destroy()はonDestroy()の実行をフレーム末尾まで遅延させるため、Blockerのフェード
        // アウトをここで即座に開始しておく(onDestroy()からも同じ世代番号で呼ぶので、二重に
        // 呼ばれても安全)。
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('PropertyUI', this.overlayGen);
        this.node.destroy();
    }
}
