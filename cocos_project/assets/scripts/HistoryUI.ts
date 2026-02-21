import { _decorator, Component, Node, Label, Color, Graphics, BlockInputEvents, UITransform, Button } from 'cc';
import { DataManager } from './DataManager';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('HistoryUI')
export class HistoryUI extends Component {

    private windowNode: Node = null;

    onLoad() {
        this.setupUI();
    }

    private setupUI() {
        const sideWidth = 800;
        const sideHeight = 600;

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
        winGr.fillColor = new Color(30, 30, 40, 255);
        winGr.roundRect(-sideWidth / 2, -sideHeight / 2, sideWidth, sideHeight, 15);
        winGr.fill();
        winGr.strokeColor = Color.YELLOW;
        winGr.lineWidth = 4;
        winGr.stroke();

        // Title
        const titleNode = new Node("Title");
        this.windowNode.addChild(titleNode);
        titleNode.setPosition(0, sideHeight / 2 - 50);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = "MISSION HISTORY & STATS";
        titleLabel.fontSize = 32;
        titleLabel.color = Color.YELLOW;

        // Stats Container
        const statsNode = new Node("Stats");
        this.windowNode.addChild(statsNode);
        statsNode.setPosition(0, 0);

        const data = DataManager.instance.data;
        const stats = data.careerStats;

        const statLines = [
            `TOTAL MISSIONS STARTED: ${stats.started}`,
            `TOTAL MISSIONS COMPLETED: ${stats.totalClearedStages}`,
            `TOTAL DISTANCE TRAVELED: ${stats.totalDistance.toFixed(0)} km`,
            `TOTAL ENEMIES DEFEATED: ${stats.enemiesDefeated}`,
            `TOTAL ITEMS COLLECTED: ${stats.itemsCollected}`,
            `TOTAL CREDITS EARNED: ${stats.totalCreditsEarned}`,
            `TOTAL CREDITS USED: ${stats.totalCreditsUsed}`,
            `TOTAL DAMAGE DEALT: ${Math.floor(stats.totalDamageDealt)}`,
            `TOTAL DAMAGE RECEIVED: ${Math.floor(stats.totalDamageReceived)}`,
            `RECOVERY/CLEAR RATIO: ${stats.totalClearedStages > 0 ? (stats.totalDamageReceived / stats.totalClearedStages).toFixed(1) : '0.0'}`
        ];

        // Difficulty breakdown
        statLines.push("--- STAGES CLEARED PER DIFFICULTY ---");
        for (let i = 1; i <= 10; i++) {
            const count = stats.clearedStagesByDifficulty[i] || 0;
            if (count > 0 || i <= 3) {
                statLines.push(`DIFFICULTY ${i}: ${count} Stages`);
            }
        }

        const startY = 150;
        const lineGap = 30;

        for (let i = 0; i < statLines.length; i++) {
            const lineNode = new Node("Stat_" + i);
            statsNode.addChild(lineNode);
            lineNode.setPosition(0, startY - i * lineGap);
            const lbl = lineNode.addComponent(Label);
            lbl.string = statLines[i];
            lbl.fontSize = 20;
            lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        }

        // Close Button
        this.createButton("Close", sideWidth / 2 - 80, sideHeight / 2 - 50, 120, 50, "CLOSE", () => this.close());
    }

    private createButton(name: string, x: number, y: number, w: number, h: number, text: string, onClick: () => void) {
        const btnNode = new Node(name);
        this.windowNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(70, 70, 90, 255);
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

    private close() {
        SoundManager.instance.playSE("cansel", "System");
        this.node.destroy();
    }
}
