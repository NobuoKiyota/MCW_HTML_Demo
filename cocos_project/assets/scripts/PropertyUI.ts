import { _decorator, Component, Node, Label, Color, Graphics, BlockInputEvents, UITransform, Size, Button, director } from 'cc';
import { DataManager } from './DataManager';
import { GAME_SETTINGS } from './Constants';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('PropertyUI')
export class PropertyUI extends Component {

    private page: number = 0;
    private maxPage: number = 0;
    private itemsPerPage: number = 60; // 30x2 = 60
    private windowNode: Node = null;
    private listNode: Node = null;
    private pageLabel: Label = null;

    onLoad() {
        this.setupUI();
    }

    private setupUI() {
        const sideWidth = 1040;
        const sideHeight = 800;

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

        const winGr = this.windowNode.addComponent(Graphics);
        winGr.fillColor = new Color(20, 20, 30, 255);
        winGr.roundRect(-sideWidth / 2, -sideHeight / 2, sideWidth, sideHeight, 15);
        winGr.fill();
        winGr.strokeColor = Color.CYAN;
        winGr.lineWidth = 4;
        winGr.stroke();

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

        // Pagination Labels
        const pageNode = new Node("PageLabel");
        this.windowNode.addChild(pageNode);
        pageNode.setPosition(0, -sideHeight / 2 + 60);
        this.pageLabel = pageNode.addComponent(Label);
        this.pageLabel.string = "PAGE: 1 / 1";
        this.pageLabel.fontSize = 24;

        // Buttons
        this.createButton("Prev", -150, -sideHeight / 2 + 60, 100, 40, "< PREV", () => this.changePage(-1));
        this.createButton("Next", 150, -sideHeight / 2 + 60, 100, 40, "NEXT >", () => this.changePage(1));
        this.createButton("Close", sideWidth / 2 - 80, sideHeight / 2 - 50, 120, 50, "CLOSE", () => this.close());

        this.refreshList();
    }

    private createButton(name: string, x: number, y: number, w: number, h: number, text: string, onClick: () => void) {
        const btnNode = new Node(name);
        this.windowNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(50, 50, 70, 255);
        gr.roundRect(-w / 2, -h / 2, w, h, 5);
        gr.fill();
        gr.strokeColor = Color.WHITE;
        gr.lineWidth = 2;
        gr.stroke();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 20;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btnNode.on(Button.EventType.CLICK, onClick, this);
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

        const startX = -480;
        const startY = 280;
        const colGap = 500;
        const rowGap = 20;

        for (let i = startIdx; i < endIdx; i++) {
            const relativeIdx = i - startIdx;
            const col = Math.floor(relativeIdx / 30);
            const row = relativeIdx % 30;

            const itemId = itemKeys[i];
            const count = inventory[itemId];
            const def = GAME_SETTINGS.ECONOMY.ITEMS[itemId];
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
        SoundManager.instance.playSE("cansel", "System");
        this.node.destroy();
    }
}
