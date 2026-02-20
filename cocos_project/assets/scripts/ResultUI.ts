import { _decorator, Component, Node, Label, director, Color, Widget, Graphics, Button, EventHandler, BlockInputEvents } from 'cc';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('ResultUI')
export class ResultUI extends Component {

    private contentNode: Node = null;

    // Stats to display
    public destroyedEnemies: number = 0;
    public collectedItems: number = 0;
    public score: number = 0; // If checking score

    onLoad() {
        // Force to center (0,0) if added to Canvas
        if (this.node.parent && this.node.parent.name === "Canvas") {
            this.node.setPosition(0, 0, 0);
        }

        this.setupBackground();
        this.setupContent();
    }

    public setup(enemies: number, items: number, score: number) {
        this.destroyedEnemies = enemies;
        this.collectedItems = items;
        this.score = score;
        this.updateLabels();
    }

    private setupBackground() {
        const widget = this.node.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;

        this.node.addComponent(BlockInputEvents);

        const gr = this.node.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 200);
        gr.rect(-2000, -2000, 4000, 4000);
        gr.fill();
    }

    private setupContent() {
        this.contentNode = new Node("Content");
        this.node.addChild(this.contentNode);

        // Title
        const title = this.createLabel("MISSION COMPLETE", 0, 200, 50, Color.YELLOW);
        this.contentNode.addChild(title);

        // Stats
        this.createLabel("ENEMIES DESTROYED:", -200, 50, 30, Color.WHITE, "LblEnemiesTitle");
        this.createLabel("0", 200, 50, 30, Color.WHITE, "LblEnemiesVal");

        this.createLabel("ITEMS COLLECTED:", -200, -50, 30, Color.WHITE, "LblItemsTitle");
        this.createLabel("0", 200, -50, 30, Color.WHITE, "LblItemsVal");

        // Home Button
        this.createButton("HOME", 0, -200, () => this.onHomeClicked());
    }

    private createLabel(text: string, x: number, y: number, size: number, color: Color, name: string = "Label"): Node {
        const node = new Node(name);
        this.contentNode.addChild(node);
        node.setPosition(x, y);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        return node;
    }

    private createButton(text: string, x: number, y: number, callback: () => void) {
        const btnNode = new Node("Btn" + text);
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 200;
        const h = 60;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(0, 150, 255, 255);
        gr.roundRect(-w / 2, -h / 2, w, h, 10);
        gr.fill();
        gr.strokeColor = Color.WHITE;
        gr.lineWidth = 2;
        gr.stroke();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 30;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;

        btnNode.on(Button.EventType.CLICK, () => {
            SoundManager.instance.playSE("click");
            callback();
        }, this);
    }

    private updateLabels() {
        // Find labels by name and update
        const lblEnemies = this.contentNode.getChildByName("LblEnemiesVal")?.getComponent(Label);
        if (lblEnemies) lblEnemies.string = this.destroyedEnemies.toString();

        const lblItems = this.contentNode.getChildByName("LblItemsVal")?.getComponent(Label);
        if (lblItems) lblItems.string = this.collectedItems.toString();
    }

    private onHomeClicked() {
        // Return to Title via GameManager
        if (GameManager.instance) {
            GameManager.instance.goToTitle();
        }
        this.node.destroy();
    }
}
