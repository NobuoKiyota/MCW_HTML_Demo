import { _decorator, Component, Node, Label, director, Color, Widget, Graphics, Button, BlockInputEvents, instantiate, Prefab, resources, tween, v3, UIOpacity, UITransform, Size } from 'cc';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';
import { DataManager } from './DataManager';

const { ccclass, property } = _decorator;

@ccclass('ResultUI')
export class ResultUI extends Component {

    private contentNode: Node = null;

    // Stats to display
    public destroyedEnemies: number = 0;
    public collectedItemsCount: number = 0;
    public itemsList: any[] = [];
    public earnedReward: number = 0;
    public previousTotal: number = 0;

    onLoad() {
        // Force to center (0,0) if added to Canvas
        if (this.node.parent && this.node.parent.name === "Canvas") {
            this.node.setPosition(0, 0, 0);
        }

        this.setupBackground();

        this.contentNode = new Node("Content");
        this.node.addChild(this.contentNode);
        this.contentNode.setPosition(0, 0);
    }

    public setup(enemies: number, items: number, score: number, itemsList: any[] = [], reward: number = 0, prevTotal: number = 0) {
        this.destroyedEnemies = enemies;
        this.collectedItemsCount = items;
        this.itemsList = itemsList;
        this.earnedReward = reward;
        this.previousTotal = prevTotal;

        this.startSequence();
    }

    private setupBackground() {
        const widget = this.node.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;

        this.node.addComponent(BlockInputEvents);

        const gr = this.node.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 240);
        gr.rect(-2000, -2000, 4000, 4000);
        gr.fill();
    }

    private async startSequence() {
        const gm = GameManager.instance;
        const mission = gm ? gm.currentMission : null;
        const playState = gm ? gm.playState : null;

        const dist = mission ? mission.distance : 0;
        const targetTime = mission ? mission.targetTime : 0;
        const clearTime = playState ? playState.elapsedTime : 0;
        const dmgDealt = playState ? playState.damageDealt : 0;
        const dmgReceived = playState ? playState.damageReceived : 0;

        let currentY = 250;

        // 1. Heading
        const heading = this.createLabel("MISSION COMPLETE!!", 0, currentY, 64, Color.YELLOW);
        this.contentNode.addChild(heading);
        heading.getComponent(UIOpacity).opacity = 0;
        await this.fadeIn(heading, 0.3); // Shortened from 0.6
        await this.wait(0.2); // Shortened from 0.5

        // --- Phase 1: Stats & Payment ---
        currentY -= 80;
        const stats = [
            `DISTANCE: ${dist}km`,
            `TARGET TIME: ${targetTime}s`,
            `CLEAR TIME: ${clearTime.toFixed(1)}s`
        ];

        for (const str of stats) {
            const node = this.createLabel(str, 0, currentY, 32, Color.WHITE);
            this.contentNode.addChild(node);
            node.getComponent(UIOpacity).opacity = 0;
            await this.fadeIn(node, 0.2); // Halved from 0.4
            currentY -= 40;
            await this.wait(0.1); // Shortened from 0.3
        }

        // TIME BONUS?
        if (clearTime <= targetTime && targetTime > 0) {
            const bonusNode = this.createLabel("TIME BONUS!!", 0, currentY, 36, Color.CYAN);
            this.contentNode.addChild(bonusNode);
            bonusNode.getComponent(UIOpacity).opacity = 0;
            await this.fadeIn(bonusNode, 0.2); // Shortened from 0.5
            currentY -= 60;
            await this.wait(0.2); // Shortened from 0.5
        } else {
            currentY -= 20;
        }

        // --- Payment Animation (Priority) ---
        const rewardLabelNode = this.createLabel(`EARNED: ${this.earnedReward}`, 0, currentY, 36, Color.YELLOW);
        this.contentNode.addChild(rewardLabelNode);
        const totalLabelNode = this.createLabel(`TOTAL CREDITS: ${this.previousTotal}`, 0, currentY - 50, 28, Color.WHITE);
        this.contentNode.addChild(totalLabelNode);

        rewardLabelNode.getComponent(UIOpacity).opacity = 0;
        totalLabelNode.getComponent(UIOpacity).opacity = 0;
        await this.fadeIn(rewardLabelNode, 0.2); // Halved from 0.4
        await this.fadeIn(totalLabelNode, 0.2); // Halved from 0.4
        await this.wait(0.2); // Halved from 0.4

        // Counter Animation
        await this.animateCredits(rewardLabelNode.getComponent(Label), totalLabelNode.getComponent(Label));

        currentY -= 90;
        await this.wait(0.2); // Halved from 0.4

        // Combat Stats
        const combatStats = [
            `DAMAGE DEALT: ${Math.floor(dmgDealt)}`,
            `DAMAGE RECEIVED: ${Math.floor(dmgReceived)}`,
            `ENEMIES DESTROYED: ${this.destroyedEnemies}`
        ];

        for (const str of combatStats) {
            const node = this.createLabel(str, 0, currentY, 32, Color.WHITE);
            this.contentNode.addChild(node);
            node.getComponent(UIOpacity).opacity = 0;
            await this.fadeIn(node, 0.2); // Halved from 0.4
            currentY -= 40;
            await this.wait(0.1); // Halved from 0.2
        }

        await this.wait(1.0);

        // Show NEXT Button
        console.log("[ResultUI] Creating NEXT button...");
        this.createPhaseButton("NEXT", 0, -280, () => {
            console.log("[ResultUI] NEXT clicked.");
            this.startPhaseTwo();
        });
    }

    private async startPhaseTwo() {
        console.log("[ResultUI] Transitioning to Phase Two...");
        if (SoundManager.instance) {
            SoundManager.instance.playSE("click");
        }

        // Clear only non-heading Content (Keep "MISSION COMPLETE!!")
        const children = this.contentNode.children.slice();
        children.forEach(child => {
            const lbl = child.getComponent(Label);
            if (!lbl || lbl.string !== "MISSION COMPLETE!!") {
                child.destroy();
            }
        });

        let currentY = 150;
        await this.wait(0.3);

        const itemHeader = this.createLabel("ITEMS COLLECTED:", 0, currentY, 40, Color.CYAN);
        this.contentNode.addChild(itemHeader);
        itemHeader.getComponent(UIOpacity).opacity = 0;
        await this.fadeIn(itemHeader, 0.25); // Halved from 0.5
        currentY -= 70;
        await this.wait(0.2); // Shortened from 0.5

        if (this.itemsList && this.itemsList.length > 0) {
            for (const it of this.itemsList) {
                const itemStr = `${it.name} x${it.amount}`;
                const itNode = this.createLabel(itemStr, 0, currentY, 30, Color.WHITE);
                this.contentNode.addChild(itNode);
                itNode.getComponent(UIOpacity).opacity = 0;
                await this.fadeIn(itNode, 0.2); // Halved from 0.4
                currentY -= 40;
                await this.wait(0.15); // Halved from 0.3
            }
        } else {
            const none = this.createLabel("(None)", 0, currentY, 26, Color.GRAY);
            this.contentNode.addChild(none);
            none.getComponent(UIOpacity).opacity = 0;
            await this.fadeIn(none, 0.5);
        }

        await this.wait(1.0);

        // Final Home Button
        this.createHomeButton(0, -280);
    }

    private createPhaseButton(text: string, x: number, y: number, callback: () => void) {
        const btnNode = new Node("PhaseBtn");
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 240;
        const h = 70;
        const trans = btnNode.addComponent(UITransform);
        trans.setContentSize(w, h);

        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = new Color(0, 100, 200);
        gr.roundRect(-w / 2, -h / 2, w, h, 10);
        gr.fill();
        gr.strokeColor = Color.CYAN;
        gr.lineWidth = 3;
        gr.stroke();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 32;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btnNode.on(Button.EventType.CLICK, callback, this);

        btnNode.addComponent(UIOpacity).opacity = 0;
        this.fadeIn(btnNode, 0.5);

        tween(btnNode)
            .repeatForever(
                tween()
                    .to(0.8, { scale: v3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                    .to(0.8, { scale: v3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
            )
            .start();
    }

    private fadeIn(node: Node, duration: number): Promise<void> {
        return new Promise(resolve => {
            if (SoundManager.instance && node.name !== "PhaseBtn" && node.name !== "HomeButton_Fallback") {
                SoundManager.instance.playSE("result_listup");
            }
            const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            opacity.opacity = 0;
            tween(opacity)
                .to(duration, { opacity: 255 })
                .call(() => resolve())
                .start();
        });
    }

    private wait(seconds: number): Promise<void> {
        return new Promise(resolve => this.scheduleOnce(resolve, seconds));
    }

    private animateCredits(rewardLabel: Label, totalLabel: Label): Promise<void> {
        return new Promise(resolve => {
            const duration = 2.0;
            const startEarned = this.earnedReward;
            const startTotal = this.previousTotal;
            const targetTotal = startTotal + startEarned;

            let lastIntTotal = startTotal;

            let obj = { t: 0 };
            tween(obj)
                .to(duration, { t: 1.0 }, {
                    onUpdate: () => {
                        const currentEarned = Math.floor(startEarned * (1 - obj.t));
                        const currentTotal = Math.floor(startTotal + (startEarned * obj.t));
                        rewardLabel.string = `EARNED: ${currentEarned}`;
                        totalLabel.string = `TOTAL CREDITS: ${currentTotal}`;

                        if (currentTotal !== lastIntTotal) {
                            if (SoundManager.instance) SoundManager.instance.playSE("result_count");
                            lastIntTotal = currentTotal;
                        }
                    }
                })
                .call(() => {
                    rewardLabel.string = `EARNED: 0`;
                    totalLabel.string = `TOTAL CREDITS: ${targetTotal}`;
                    resolve();
                })
                .start();
        });
    }

    private createLabel(text: string, x: number, y: number, size: number, color: Color, instant: boolean = false): Node {
        const node = new Node("Label");
        node.setPosition(x, y);
        const lbl = node.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = size;
        lbl.color = color;
        node.addComponent(UIOpacity);
        if (instant) this.contentNode.addChild(node);
        return node;
    }

    private createHomeButton(x: number, y: number) {
        console.log("[ResultUI] Creating HOME button...");
        resources.load("Prefabs/UI/Button-240x60Prefab", Prefab, (err, prefab) => {
            let btnNode: Node;
            if (!err && prefab) {
                console.log("[ResultUI] Using Home Button Prefab.");
                btnNode = instantiate(prefab);
            } else {
                console.warn("[ResultUI] Home Button Prefab not found. Using Fallback.");
                btnNode = new Node("HomeButton_Fallback");
                const trans = btnNode.addComponent(UITransform);
                trans.setContentSize(240, 60);

                const gr = btnNode.addComponent(Graphics);
                gr.fillColor = new Color(0, 150, 255);
                gr.roundRect(-120, -30, 240, 60, 10);
                gr.fill();

                const lbl = this.createLabel("HOME", 0, 0, 30, Color.WHITE, true);
                btnNode.addChild(lbl);
            }

            this.contentNode.addChild(btnNode);
            btnNode.setPosition(x, y);

            // Fix TypeError: Ensure UIOpacity is present before setting opacity
            const opacity = btnNode.getComponent(UIOpacity) || btnNode.addComponent(UIOpacity);
            opacity.opacity = 0;
            this.fadeIn(btnNode, 1.0);

            const btn = btnNode.getComponent(Button) || btnNode.addComponent(Button);
            btn.transition = Button.Transition.SCALE;

            // Ensure button interaction is enabled
            btn.interactable = true;
            btnNode.active = true;

            // Listen on button component for more reliability
            btnNode.on(Button.EventType.CLICK, () => this.onHomeClicked(), this);

            tween(btnNode)
                .repeatForever(
                    tween()
                        .to(0.8, { scale: v3(1.1, 1.1, 1) }, { easing: 'sineInOut' })
                        .to(0.8, { scale: v3(1.0, 1.0, 1) }, { easing: 'sineInOut' })
                )
                .start();
        });
    }

    private onHomeClicked() {
        console.log("[ResultUI] Home Clicked.");
        if (SoundManager.instance) {
            SoundManager.instance.stopAllBGM(1.0); // Stop Result BGM
        }
        if (GameManager.instance) {
            GameManager.instance.returnToHomeTransition();
        }
        this.node.destroy();
    }
}
