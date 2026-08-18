import { _decorator, Component, Node, Label, Tween, tween, v3, UIOpacity, director, LabelOutline, Color, UITransform, Vec3, Widget, Button, BlockInputEvents, Layers, Graphics, Canvas } from 'cc';
import { SideBarUI } from './SideBarUI';
import { SettingsManager } from './SettingsManager';
import { GameManager } from './GameManager';
import { GameState } from './Constants';
import { MissionUI } from './MissionUI';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

    public static instance: UIManager;

    // @property(Label)
    // public distLabel: Label = null; // Removed

    // @property(Label)
    // public speedLabel: Label = null; // Removed

    @property(Node)
    public gameOverPanel: Node = null;

    @property(Node)
    public resultPanel: Node = null;

    @property(Node)
    public notificationLayer: Node = null;

    // --- Notification Configs ---
    @property({ tooltip: "Notification Font Size" })
    public notifyFontSize: number = 24;

    @property({ tooltip: "Notification Display Duration (seconds)" })
    public notifyDuration: number = 2.0;

    @property({ tooltip: "Outline Width for Glowing Effect" })
    public outlineWidth: number = 2;

    @property(Color)
    public notifyTextColor: Color = new Color(0, 0, 0, 255); // 文字本体の色 (デフォルト黒)

    // --- SideBar Integration ---
    @property({ type: SideBarUI })
    public sideBarUI: SideBarUI = null;

    onLoad() {
        console.log("[UIManager] onLoad triggered.");
        if (!UIManager.instance || !UIManager.instance.isValid) {
            UIManager.instance = this;
            console.log("[UIManager] Singleton initialized.");
        } else if (UIManager.instance !== this) {
            console.warn("[UIManager] Duplicate instance detected. Destroying...");
            this.node.destroy();
            return;
        }
        // director.addPersistRootNode(this.node); // Removed for Single Scene Architecture

        // Reset to (0, 0) to align with Cocos Creator 3.x standards
        this.node.setPosition(0, 0, 0);

        this.resolveReferences();

        // Force settings application (Resolution etc)
        console.log("[UIManager] Requesting SettingsManager.applySettings()");
        SettingsManager.instance.applySettings();
        console.log("[UIManager] Settings applied.");

        // Refresh Sidebar stats (Credit, Dist etc)
        if (this.sideBarUI) {
            this.sideBarUI.updateShipInfo();
        }
    }

    onDestroy() {
        if (UIManager.instance === this) {
            UIManager.instance = null;
        }
    }

    public resolveReferences() {
        const sceneName = director.getScene().name;
        console.log(`[UIManager] Resolving references for scene: ${sceneName}`);

        const canvas = director.getScene().getChildByName("Canvas");
        console.log(`[UIManager] Canvas found: ${!!canvas}, name: ${canvas?.name}`);
        if (!canvas) {
            console.error("[UIManager] Canvas NOT FOUND in Scene! Scene children:");
            director.getScene().children.forEach((child, i) => {
                console.log(`  [${i}] ${child.name}`);
            });
            return;
        }

        // Canvas position is owned exclusively by GameManager.applyCameraForState(), which
        // keeps it following MainCamera's current center (640,360 outside Ingame, 0,0
        // during Ingame) so SideBarUI stays framed correctly in every state. This used to
        // hardcode (640,360,0) here, which ran after applyCameraForState() (resolveReferences()
        // is called from switchContent(), itself called after applyCameraForState()) and
        // silently overwrote it every time, permanently pinning SideBarUI to the corner
        // during Ingame regardless of what GameManager set.

        // Camera is owned exclusively by GameManager (MainCamera + applyCameraForState());
        // UIManager no longer searches for, creates, or repositions any camera here.

        // --- Improved Recursive Node Search ---
        const findNodeRecursive = (node: Node, name: string): Node => {
            if (node.name === name) return node;
            for (let i = 0; i < node.children.length; ++i) {
                const res = findNodeRecursive(node.children[i], name);
                if (res) return res;
            }
            return null;
        };

        // パネル類の再取得 (再帰検索)
        if (!this.gameOverPanel || !this.gameOverPanel.isValid) {
            this.gameOverPanel = findNodeRecursive(canvas, "GameOverPanel");
        }
        if (!this.resultPanel || !this.resultPanel.isValid) {
            this.resultPanel = findNodeRecursive(canvas, "ResultPanel");
        }
        if (!this.notificationLayer || !this.notificationLayer.isValid) {
            this.notificationLayer = findNodeRecursive(canvas, "NotificationLayer") || canvas;
        }

        // --- SideBarUI Visibility Check ---
        if (this.sideBarUI && !this.sideBarUI.isValid) {
            this.sideBarUI = null;
        }

        const ensurePanelReady = (panel: Node) => {
            if (!panel) return;
            // Ensure on top
            panel.setSiblingIndex(canvas.children.length - 1);
            // Block input background
            if (!panel.getComponent(BlockInputEvents)) {
                panel.addComponent(BlockInputEvents);
            }
        };

        const bindButton = (panel: Node, name: string, callback: Function) => {
            const btnNode = findNodeRecursive(panel, name);
            if (!btnNode) {
                console.warn(`[UIManager] ${name} NOT FOUND in ${panel.name}`);
                return;
            }

            // Ensure Button component exists (resolves "cc:Node" issue)
            let btn = btnNode.getComponent(Button);
            if (!btn) {
                btn = btnNode.addComponent(Button);
                console.log(`[UIManager] Added Button to ${name}`);
            }

            // Bind CLICK event without destructive off() calls
            btn.node.on(Button.EventType.CLICK, callback, this);
            console.log(`[UIManager] CLICK bound to ${name}`);
        };

        if (this.gameOverPanel) {
            console.log("[UIManager] GameOverPanel ready.");
            this.gameOverPanel.active = false;
            ensurePanelReady(this.gameOverPanel);

            bindButton(this.gameOverPanel, "Button(RETRY)", this.onRetryClicked);
            bindButton(this.gameOverPanel, "Button(TITLE)", this.onTitleClicked);
        } else {
            console.warn("[UIManager] GameOverPanel NOT FOUND even with recursive search!");
            this.dumpCanvasChildren(canvas);
        }

        if (this.resultPanel) {
            console.log("[UIManager] ResultPanel found.");
            this.resultPanel.active = false;
            ensurePanelReady(this.resultPanel);

            // Bind Home/Title in result if needed
            bindButton(this.resultPanel, "HomeButton", this.onTitleClicked);
            bindButton(this.resultPanel, "TitleButton", this.onTitleClicked);
        } else {
            console.warn("[UIManager] ResultPanel NOT FOUND even with recursive search!");
            if (!this.gameOverPanel) this.dumpCanvasChildren(canvas);
        }

        // Reset ContentRoot in scene if it exists (e.g. scene-Main)
        const contentRoot = canvas.getChildByName("ContentRoot");
        if (contentRoot) {
            contentRoot.setPosition(0, 0, 0);
        }

        // Auto-create or find existing SideBarUI
        if (!this.sideBarUI) {
            // First, check if it already exists in the hierarchy (e.g. child of Canvas)
            const existingSideBarNode = findNodeRecursive(canvas, "SideBarUI");
            if (existingSideBarNode) {
                console.log("[UIManager] Found existing SideBarUI in hierarchy.");
                this.sideBarUI = existingSideBarNode.getComponent(SideBarUI);
            }

            // If still not found, create it
            if (!this.sideBarUI) {
                console.log(`[UIManager] SideBarUI not found. Creating child of UIManager.`);
                const node = new Node("SideBarUI");
                node.layer = Layers.Enum.UI_2D; // was `1`, which isn't any layer MainCamera's visibility mask includes
                this.node.addChild(node);

                const trans = node.addComponent(UITransform);
                // Standard UI Node creation - Position/Widget handled in Editor
                this.sideBarUI = node.addComponent(SideBarUI);
            }
        }

        // Ensure SideBarUI is on top of Canvas content and active
        if (this.sideBarUI && this.sideBarUI.isValid && canvas) {
            if (this.sideBarUI.node.parent !== canvas) {
                console.log(`[UIManager] Reparenting SideBarUI to Canvas.`);
                this.sideBarUI.node.parent = canvas;
            }

            const gm = GameManager.instance;
            this.setSideBarActive(gm ? (gm.state !== GameState.TITLE) : true);

            const lastIndex = canvas.children.length - 1;
            this.sideBarUI.node.setSiblingIndex(lastIndex);

            // SideBarUI自体の座標強制は廃止 (Editor/Widgetに任せる)
            // ただしUIManager自体の位置がズレているとの報告があるため、UIManager(this.node)を(0,0)に固定
            this.node.setPosition(0, 0, 0);

            const w = this.sideBarUI.getComponent(Widget);
            if (w) w.updateAlignment();
            console.log(`[UIManager] SideBarUI status checked. Parent(UIManager) reset to (0,0).`);
        } else {
            console.warn(`[UIManager] SideBarUI NOT READY. instance=${!!this.sideBarUI}, valid=${this.sideBarUI?.isValid}, canvas=${!!canvas}`);
        }
    }

    private dumpCanvasChildren(canvas: Node) {
        console.log("--- Exhaustive Node Dump for Canvas ---");
        const dump = (node: Node, indent: string, depth: number) => {
            if (depth > 4) return;
            console.log(`${indent}${node.name} (active:${node.active})`);
            for (const child of node.children) {
                dump(child, indent + "  ", depth + 1);
            }
        };
        dump(canvas, "", 0);
        console.log("---------------------------------------");
    }

    public showGameOver() {
        if (this.gameOverPanel && this.gameOverPanel.isValid) {
            this.scheduleOnce(() => {
                if (!this.gameOverPanel || !this.gameOverPanel.isValid) return;
                this.setNodeAndParentsActive(this.gameOverPanel, true);
                this.gameOverPanel.setPosition(0, 0, 0);
                console.log("[UIManager] showGameOver triggered (deferred).");
            }, 0);
        } else {
            console.error("[UIManager] showGameOver: gameOverPanel is null or invalid!");
        }
    }

    public showResult() {
        if (this.resultPanel) {
            this.setNodeAndParentsActive(this.resultPanel, true);

            // Apply coordinates in case it's not set
            this.resultPanel.setPosition(0, 0, 0);
            console.log("[UIManager] showResult triggered.");
        } else {
            console.error("[UIManager] showResult: resultPanel is null!");
        }
    }

    public setSideBarActive(active: boolean) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            console.log(`[UIManager] setSideBarActive: ${active} (Node was ${this.sideBarUI.node.active})`);
            this.setNodeAndParentsActive(this.sideBarUI.node, active);
            if (active) {
                this.sideBarUI.updateLayout();
                this.sideBarUI.updateShipInfo();
            }
        }
    }

    // --- Overlay coordination -------------------------------------------
    // Home画面のフルスクリーンオーバーレイ(MissionUI/CustomizeUI/UpgradeUI/PropertyUI/
    // HistoryUI等)は同時に1つしか開けないようにする。以前はMissionUI.onLoad()がUpgradeUI/
    // CustomizeUIだけを名指しで閉じる一方通行の実装で、CustomizeUI.open()側には対応する
    // 処理が無かったため「MissionUIを開いたままCustomizeを開くと表示が重なって操作不能になる」
    // 不具合があった。各画面が互いをimportして閉じ合う(N対N)代わりに、ここに「現在開いている
    // ものと、それを閉じる関数」を1つだけ記録し、次のオーバーレイが開く直前に自動で閉じる。
    // 各画面はopen()/onLoad()の先頭でnotifyOverlayOpening()を、閉じる際(close()やonDestroy())に
    // notifyOverlayClosed()を呼ぶだけでよい。
    private currentOverlayName: string | null = null;
    private currentOverlayClose: (() => void) | null = null;
    // node.destroy()はonDestroy()の実行をフレーム末尾まで遅延させる(isValidは即falseになるが
    // コンポーネントのライフサイクルコールバックは同期的には走らない)。そのため「同じ名前の
    // オーバーレイが即座に閉じて開き直す」ケース(例: MissionUIが開いている状態でSideBarUIの
    // DESTINATIONラベルを再度押す→UIManager.openMissionUI()が呼ばれる)で、旧インスタンスの
    // 遅延onDestroy()が後から発火すると、名前だけの一致判定(===name)では新インスタンスの
    // 登録を誤って消してしまう(結果、Blockerがフェードアウトしてしまい「ガードが効かない」
    // 症状になっていた)。世代カウンタを追加し、閉じる側は「自分が登録した世代と一致する時だけ」
    // 実際にクリアするようにする。
    private overlayGeneration = 0;

    // 各画面自前のBlockInputEvents(CustomizeUIのPanel、MissionUI/PropertyUI/HistoryUIの
    // 全画面Dimmer等)は、そのノード自身のUITransform境界内でしか入力を止められない。
    // UpgradeUIには元々それすら無く、CustomizeUIのPanelも画面全体を覆うサイズとは限らない
    // ため、「パネルの外側なら下の階層(HomeUIのボタン等)をクリックできてしまう」隙間が
    // 残っていた。そこで共有の全画面Blockerを用意し、overlay側のノードのすぐ手前のsibling
    // (=同じ親の中で、overlay自身より1つだけ描画順が手前)に差し込むようにした。
    //
    // ただしこれだけでは不十分だった: MissionUI/PropertyUI/HistoryUIは永続Canvas配下に、
    // HomeUIのCustomize/Upgradeボタン等はprefab-Home内蔵Canvas配下という「別カメラ・別ツリー」
    // に住んでいる。描画順(z-order)はCocosの2D UIバッチャーがツリーをまたいでも一貫して
    // 解決してくれる一方、タッチ/クリックのヒットテストはカメラ単位で行われる。
    // 一度は「別ツリー側にも同じBlockInputEvents方式のBlockerを重ねる」対策を試したが、
    // BlockInputEventsを別カメラの木に置くと、そのカメラのタッチ判定自体が丸ごと無効化される
    // らしく、今度はMissionUI自身のボタン(persistent Canvas側、Blockerとは別カメラの
    // MissionUIの中身)まで反応しなくなってしまった。BlockInputEvents方式はカメラをまたぐと
    // 信頼できないため、別カメラ側は「ノードを直接非表示(active=false)にする」方式に変更した
    // (setContentButtonsActive()参照、CustomizeUI/UpgradeUI自身はprefab-Home内蔵Canvasの
    // 中に住んでいるため該当せず、単一Blockerのままで足りる)。
    private overlayBlockerNode: Node | null = null;
    private overlayBlockerOpacity: UIOpacity | null = null;
    private readonly overlayBlockerFadeDuration = 0.18;
    private readonly overlayBlockerMaxAlpha = 160;

    /**
     * オーバーレイを開く直前に呼ぶ。既に何か(別画面はもちろん、同じ画面の多重生成も含む)
     * 記録されていれば、まずそのcloseFnを呼んでから新しいものに差し替える。これにより
     * 「ボタン連打で同じ画面のNodeが積み重なる」問題も「別画面同士が同時に開いて表示が
     * 崩れる」問題も同じ仕組みで防げる。overlayNodeにはその画面の実際のルートNode
     * (CustomizeUI/UpgradeUIならthis.panel、MissionUI/PropertyUI/HistoryUIならthis.node)を
     * 渡すこと — 全画面Blockerをそのすぐ手前に差し込むために使う。
     * 戻り値の世代番号を呼び出し側で保持し、notifyOverlayClosed()に渡すこと
     * (同名の遅延closeが新しい登録を誤って消さないようにするため)。
     */
    public notifyOverlayOpening(name: string, overlayNode: Node, closeFn: () => void): number {
        if (this.currentOverlayClose) {
            console.log(`[UIManager] Closing overlay '${this.currentOverlayName}' before opening '${name}'.`);
            this.currentOverlayClose();
        }
        this.overlayGeneration++;
        this.currentOverlayName = name;
        this.currentOverlayClose = closeFn;
        this.showOverlayBlocker(overlayNode);
        return this.overlayGeneration;
    }

    /**
     * オーバーレイを閉じた際に呼ぶ。notifyOverlayOpening()の戻り値をそのまま渡すこと。
     * 名前と世代番号の両方が現在の登録と一致する時だけクリアする(名前だけの一致判定だと、
     * 「開いたまま同名で即座に開き直す」ケースで旧インスタンスの遅延onDestroy()が新しい
     * 登録を誤って消してしまう)。close()から即座に呼び、かつonDestroy()からも呼ぶ
     * (dup-guardによる破棄等close()を経由しない破棄経路の保険)想定で、2回呼ばれても
     * 安全なようにこの条件一致チェックだけで十分にidempotentになっている。
     */
    public notifyOverlayClosed(name: string, generation: number) {
        if (this.currentOverlayName === name && this.overlayGeneration === generation) {
            this.currentOverlayName = null;
            this.currentOverlayClose = null;
            this.hideOverlayBlockerDelayed();
        }
    }

    private ensureOverlayBlocker(): Node {
        if (this.overlayBlockerNode && this.overlayBlockerNode.isValid) return this.overlayBlockerNode;
        const node = new Node("OverlayInputBlocker");
        const uiT = node.addComponent(UITransform);
        uiT.setContentSize(4000, 4000); // Widget未設定でも確実に画面全体を覆う余裕を持たせる
        const gr = node.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 255); // 実際の見た目はUIOpacityのフェードで制御する
        gr.rect(-2000, -2000, 4000, 4000);
        gr.fill();
        node.addComponent(BlockInputEvents);
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;
        node.active = false;
        this.overlayBlockerNode = node;
        this.overlayBlockerOpacity = opacity;
        return node;
    }

    // 現在アクティブなコンテンツルート(GameManager.switchContent()が生成するprefab-Home等、
    // 自前でCanvasコンポーネントを持つプレハブ)のCanvasノードを探す。永続Canvas("Canvas"という
    // 名前の直接の子)自体は除外する。見つからなければnull。
    private findContentCanvas(): Node | null {
        const scene = director.getScene();
        if (!scene) return null;
        for (const child of scene.children) {
            if (child.name === "Canvas") continue;
            const canvasComp = child.getComponentInChildren(Canvas);
            if (canvasComp) return canvasComp.node;
        }
        return null;
    }

    private isDescendantOf(node: Node, ancestor: Node): boolean {
        let cur: Node | null = node;
        while (cur) {
            if (cur === ancestor) return true;
            cur = cur.parent;
        }
        return false;
    }

    // overlayがコンテンツルート(prefab-Home等)の外にいる場合だけ、そちらのHomeUI主要ボタン群
    // ("Buttons"コンテナ)を非表示にする。CustomizeUI/UpgradeUIのようにoverlay自身がコンテンツ
    // ルートの中に住んでいる場合は何もしない(自分自身のボタンを消してしまうため)。
    // hide側で復元する時はoverlayNode=nullを渡し、無条件に元へ戻す。
    private setContentButtonsActive(overlayNode: Node | null, active: boolean) {
        const contentCanvas = this.findContentCanvas();
        if (!contentCanvas || !contentCanvas.isValid) return;
        if (overlayNode && this.isDescendantOf(overlayNode, contentCanvas)) return;
        const buttonsNode = contentCanvas.getChildByName('Buttons');
        if (buttonsNode) buttonsNode.active = active;
    }

    private showOverlayBlocker(overlayNode: Node) {
        if (!overlayNode || !overlayNode.isValid || !overlayNode.parent) return;
        const blocker = this.ensureOverlayBlocker();
        const parent = overlayNode.parent;
        blocker.layer = overlayNode.layer;
        if (blocker.parent !== parent) {
            parent.addChild(blocker);
        }
        blocker.active = true;
        // 「blockerを末尾へ→overlayNodeをさらに末尾へ」の順で動かす。overlayNode.getSiblingIndex()
        // を読んでblockerをそこへ移動させる方式だと、2回目以降の呼び出しでインデックスがズレる
        // ことがあったため、絶対位置(末尾)基準にしてblocker→overlayNodeの順を常に保証する。
        blocker.setSiblingIndex(parent.children.length - 1);
        overlayNode.setSiblingIndex(parent.children.length - 1);
        const opacity = this.overlayBlockerOpacity;
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(this.overlayBlockerFadeDuration, { opacity: this.overlayBlockerMaxAlpha })
            .start();

        this.setContentButtonsActive(overlayNode, false);
    }

    private hideOverlayBlockerDelayed() {
        const blocker = this.overlayBlockerNode;
        const opacity = this.overlayBlockerOpacity;
        if (blocker && blocker.isValid && opacity) {
            Tween.stopAllByTarget(opacity);
            tween(opacity)
                .to(this.overlayBlockerFadeDuration, { opacity: 0 })
                .call(() => {
                    // フェード完了までBlockInputEvents(=blocker.active)はtrueのままにしておくことで、
                    // 閉じるアニメ中に下の階層を連打されても素通りしないようにする。
                    if (blocker.isValid) blocker.active = false;
                })
                .start();
        }
        // Buttonsコンテナの復元自体は視覚的な演出が無いので即座に行う(フェード完了を待つ必要は無い)。
        this.setContentButtonsActive(null, true);
    }

    /**
     * Convenience helper for opening the mission selection popup from anywhere
     * (HomeUI.onStartMissionClicked() / SideBarUI.onMissionLabelClicked()共通の入り口)。
     */
    public openMissionUI() {
        console.log("[UIManager] openMissionUI called.");
        const scene = director.getScene();
        const canvas = scene.getChildByName("Canvas");
        const parent = canvas || scene;

        // 以前はここで既存の"MissionUI"ノードを先に破棄していたが、node.destroy()はonDestroy()の
        // 実行をフレーム末尾まで遅延させるため、新ノードのonLoad()(→notifyOverlayOpening())より
        // 前後関係が不定になり、世代不一致のはずのBlockerフェードアウトが誤発火する不具合が
        // あった。MissionUIのonLoad()がnotifyOverlayOpening()経由で「今開いている物」を同期的に
        // 閉じてくれるので、ここでの事前破棄は不要(むしろ二重破棄の原因になる)。
        const node = new Node("MissionUI");
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        node.addComponent(MissionUI);
        // play click sound if available
        if (SoundManager.instance) {
            SoundManager.instance.playSE("click");
        }
    }

    /**
     * バフUIを強制リセット（サイドバーが表示されていない状態でも安全に呼び出し可能）
     */
    public resetBuffs() {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateBuffs(0, 0);
        }
    }

    private setNodeAndParentsActive(node: Node, active: boolean) {
        if (!node) return;
        node.active = active;
        if (active) {
            const canvas = node.scene.getChildByName("Canvas");
            let p = node.parent;
            while (p && p !== canvas && p !== node.scene as any) {
                if (!p.active) {
                    console.log(`[UIManager] Activating parent layer: ${p.name}`);
                    p.active = true;
                }
                p = p.parent;
            }
        }
    }

    public updateDist(distance: number) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateMissionInfo(distance);
        }
    }

    public updateHP(currentHp: number, maxHp: number) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateHP(currentHp, maxHp);
        }
    }

    public updateSpeed(speed: number) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateSpeed(speed);
        }
    }

    public updateBuffs(powerTime: number, rapidTime: number) {
        // SideBar UI
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateBuffs(powerTime, rapidTime);
        }
    }

    public updateTimer(time: number) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateTimer(time);
        }
    }

    public updateMissionStats(kills: number, damage: number) {
        if (this.sideBarUI && this.sideBarUI.isValid) {
            this.sideBarUI.updateMissionStats(kills, damage);
        }
    }

    private getRarityColor(rarity: number): Color {
        switch (rarity) {
            case 5: return new Color(255, 215, 0, 255);   // Gold
            case 4: return new Color(180, 50, 255, 255);  // Purple
            case 3: return new Color(50, 150, 255, 255);  // Blue
            case 2: return new Color(100, 255, 50, 255);  // Green
            default: return new Color(255, 255, 255, 255); // White
        }
    }

    /**
     * バフ取得時などの強調通知を表示
     */
    public showBuffNotification(text: string, color: Color, pos: Vec3) {
        this.showItemLog(text, 5, pos, color);
    }

    /**
     * 指定された位置へ通知を表示
     */
    public showItemLog(text: string, rarity: number = 1, pos?: Vec3, customColor?: Color) {
        if (!this.notificationLayer) return;

        const textColor = customColor || this.getRarityColor(rarity);

        // --- 1. Notification Container ---
        const node = new Node("Notification");
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        // --- 2. Text Label ---
        const labelNode = new Node("Label");
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = this.notifyFontSize;
        label.color = this.notifyTextColor;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        // Outline for Glowing Effect
        const outline = labelNode.addComponent(LabelOutline);
        if (outline) {
            outline.color = textColor;
            outline.width = this.outlineWidth;
        }

        labelNode.parent = node;

        // --- 3. Position Calculation ---
        let startPos = v3(0, 0, 0); // Center relative to Canvas (0,0)
        if (pos) {
            const uiTransform = this.notificationLayer.getComponent(UITransform);
            if (uiTransform) {
                startPos = uiTransform.convertToNodeSpaceAR(pos);
                startPos.y += 40;
            } else {
                console.warn("[UIManager] notificationLayer missing UITransform, cannot convert position.");
            }
        }

        // --- 4. Opacity & Lifetime ---
        const op = node.addComponent(UIOpacity);
        op.opacity = 255 * 0.75;

        node.parent = this.notificationLayer;
        node.setPosition(startPos);

        // Animation: Slide Up & Fade Out
        const targetY = startPos.y + 60;

        tween(node)
            .to(0.4, { position: v3(startPos.x, targetY, 0) }, { easing: "sineOut" })
            .delay(this.notifyDuration)
            .to(0.8, { position: v3(startPos.x, targetY + 80, 0) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();

        tween(op)
            .delay(this.notifyDuration)
            .to(0.8, { opacity: 0 })
            .start();

        // Safety Destruction
        this.scheduleOnce(() => {
            if (node.isValid) node.destroy();
        }, this.notifyDuration + 2.0);
    }

    public onRetryClicked() {
        console.log("[UIManager] onRetryClicked");
        director.emit("GAME_RETRY");
    }

    public onTitleClicked() {
        console.log("[UIManager] onTitleClicked (Returning to HOME)");
        director.emit("GAME_HOME"); // Emit HOME instead of TITLE for better flow
    }

    public spawnDamageText(x: number, y: number, amount: number, isKill: boolean) {
        if (!this.notificationLayer) return;

        // 1. Create Node
        const node = new Node("DamagePopup");
        node.layer = this.notificationLayer.layer;
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        // 2. Add Label
        const label = node.addComponent(Label);
        label.string = Math.floor(amount).toString();
        label.fontSize = 28;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = node.addComponent(LabelOutline);
        outline.width = 2;
        outline.color = Color.BLACK;

        // 3. Position and Parent
        // Position x, y is passed from Enemy (local to EnemyLayer @ 0,0)
        node.parent = this.notificationLayer;
        node.setPosition(x, y, 0);

        // 4. Initialize DamagePopup logic
        const popup = node.addComponent("DamagePopup") as any;
        const damageColor = isKill ? Color.RED : new Color(255, 200, 0, 255);
        if (popup && popup.init) {
            popup.init(amount, damageColor);
        }

        console.log(`[UIManager] Spawned Damage Text: ${amount} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    }
}
