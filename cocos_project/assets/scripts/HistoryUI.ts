import { _decorator, Component, Node, Label, Color, Graphics, BlockInputEvents, UITransform, Sprite, SpriteFrame, resources } from 'cc';
import { DataManager } from './DataManager';
import { SoundManager } from './SoundManager';
import { instantiatePrefabButton } from './UIButtonPrefab';
import { UIManager } from './UIManager';

const { ccclass, property } = _decorator;

// assets/resources/png/UI800x600_History.png(元800x600、Windowと同サイズなのでそのまま使う)。
const BG_PATH = "png/UI800x600_History/spriteFrame";

@ccclass('HistoryUI')
export class HistoryUI extends Component {

    private readonly sideWidth = 800;
    private readonly sideHeight = 600;
    // 現在は統計項目が1ページに収まる本数だが、DifficultyがCSV側で増えるとstatLinesも増える
    // ため、PropertyUI.tsと同じページ送り方式をあらかじめ用意しておく。
    private readonly linesPerPage = 12;

    private windowNode: Node = null;
    private statsNode: Node = null;
    private pageLabel: Label = null;
    private statLines: string[] = [];
    private page: number = 0;
    private maxPage: number = 1;
    // notifyOverlayOpening()の戻り値(世代番号)。CustomizeUI.tsのoverlayGenと同じ役割。
    private overlayGen: number = 0;

    onLoad() {
        // MissionUI/CustomizeUI/UpgradeUI/PropertyUI等、他の全画面オーバーレイと排他にする
        // (UIManager.notifyOverlayOpening()参照、PropertyUI.ts と同じ規約)。
        if (UIManager.instance) {
            this.overlayGen = UIManager.instance.notifyOverlayOpening('HistoryUI', this.node, () => {
                if (this.node && this.node.isValid) this.node.destroy();
            });
        }
        this.setupUI();
    }

    // close()を経由しない破棄経路の保険。close()からも同じ世代番号で呼ぶので、二重に呼ばれても安全。
    onDestroy() {
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('HistoryUI', this.overlayGen);
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
        titleLabel.string = "MISSION HISTORY & STATS";
        titleLabel.fontSize = 32;
        titleLabel.color = Color.YELLOW;

        // Stats Container
        this.statsNode = new Node("Stats");
        this.windowNode.addChild(this.statsNode);
        this.statsNode.setPosition(0, 0);

        this.buildStatLines();

        // Pagination Label
        const pageNode = new Node("PageLabel");
        this.windowNode.addChild(pageNode);
        pageNode.setPosition(0, -sideHeight / 2 + 100);
        this.pageLabel = pageNode.addComponent(Label);
        this.pageLabel.fontSize = 24;

        // Buttons: 最下段に横並び(Prev / Close / Next)。以前はCloseだけ右上に置いていたのを統一。
        const btnY = -sideHeight / 2 + 50;
        instantiatePrefabButton("Prefabs/Canvas/Button-Prev", this.windowNode, -220, btnY, () => this.changePage(-1), this.windowNode, "<<PREV", Color.WHITE);
        instantiatePrefabButton("Prefabs/Canvas/Button-Close", this.windowNode, 0, btnY, () => this.close(), this.windowNode, "CLOSE", Color.WHITE);
        instantiatePrefabButton("Prefabs/Canvas/Button-Next2", this.windowNode, 220, btnY, () => this.changePage(1), this.windowNode, "NEXT>>", Color.WHITE);

        this.refreshStatsPage();
    }

    // MissionUI.ts等と同じ規約: 背景アートが無い/ロード失敗した場合のみ、以前のGraphics塗り+
    // 枠線にフォールバックする(CLAUDE.mdの「Prefab/アセット欠如に対して防御的に」の方針)。
    private loadWindowBackground(sideWidth: number, sideHeight: number) {
        const sprite = this.windowNode.addComponent(Sprite);
        resources.load(BG_PATH, SpriteFrame, (err, frame) => {
            if (err || !frame || !this.windowNode || !this.windowNode.isValid) {
                console.warn(`[HistoryUI] Failed to load ${BG_PATH}. Falling back to flat panel color.`, err);
                const winGr = this.windowNode.addComponent(Graphics);
                winGr.fillColor = new Color(30, 30, 40, 255);
                winGr.roundRect(-sideWidth / 2, -sideHeight / 2, sideWidth, sideHeight, 15);
                winGr.fill();
                winGr.strokeColor = Color.YELLOW;
                winGr.lineWidth = 4;
                winGr.stroke();
                return;
            }
            sprite.spriteFrame = frame;
        });
    }

    private buildStatLines() {
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
            `RECOVERY/CLEAR RATIO: ${stats.totalClearedStages > 0 ? (stats.totalDamageReceived / stats.totalClearedStages).toFixed(1) : '0.0'}`,
        ];

        // Difficulty breakdown
        statLines.push("--- STAGES CLEARED PER DIFFICULTY ---");
        for (let i = 1; i <= 10; i++) {
            const count = stats.clearedStagesByDifficulty[i] || 0;
            if (count > 0 || i <= 3) {
                statLines.push(`DIFFICULTY ${i}: ${count} Stages`);
            }
        }

        this.statLines = statLines;
        this.maxPage = Math.max(1, Math.ceil(statLines.length / this.linesPerPage));
        if (this.page >= this.maxPage) this.page = this.maxPage - 1;
    }

    private refreshStatsPage() {
        this.statsNode.removeAllChildren();

        const startIdx = this.page * this.linesPerPage;
        const endIdx = Math.min(startIdx + this.linesPerPage, this.statLines.length);

        const startY = 210;
        const lineGap = 30;

        for (let i = startIdx; i < endIdx; i++) {
            const lineNode = new Node("Stat_" + i);
            this.statsNode.addChild(lineNode);
            lineNode.setPosition(0, startY - (i - startIdx) * lineGap);
            const lbl = lineNode.addComponent(Label);
            lbl.string = this.statLines[i];
            lbl.fontSize = 20;
            lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        }

        this.pageLabel.string = `PAGE: ${this.page + 1} / ${this.maxPage}`;
    }

    private changePage(delta: number) {
        SoundManager.instance.playSE("click");
        this.page += delta;
        if (this.page < 0) this.page = 0;
        if (this.page >= this.maxPage) this.page = this.maxPage - 1;
        this.refreshStatsPage();
    }

    private close() {
        SoundManager.instance.playSE("click");
        // node.destroy()はonDestroy()の実行をフレーム末尾まで遅延させるため、Blockerのフェード
        // アウトをここで即座に開始しておく(onDestroy()からも同じ世代番号で呼ぶので、二重に
        // 呼ばれても安全)。
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('HistoryUI', this.overlayGen);
        this.node.destroy();
    }
}
