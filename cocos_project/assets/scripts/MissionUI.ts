import { _decorator, Component, Node, Label, Color, Sprite, SpriteFrame, resources, UITransform, Size, Widget, Graphics, LabelOutline, Button, EventHandler, BlockInputEvents, instantiate, Vec3, director, RichText, Layers } from 'cc';
import { GameManager } from './GameManager';
import { SoundManager } from './SoundManager';
import { DataManager } from './DataManager';
import { GameDatabase } from './GameDatabase';
import { IMissionData } from './Constants';
import { getTotalUpgradeStars } from './PlayerUpgradeCalc';
import { generateMissionFromDifficultyRow } from './MissionGenerator';
import { instantiatePrefabButton } from './UIButtonPrefab';
import { UIManager } from './UIManager';

const { ccclass, property } = _decorator;

// MissionLv(1〜10)ごとのボタン基調色。参考パレット画像のLv01〜Lv10の16進コードから採用
// (いずれも"RRGGBB+アルファ2桁"の並びだったため、RGB部分のみを使う)。
const MISSION_LV_COLORS: string[] = [
    '#85FF00', '#00FF8F', '#F7FF33', '#A911FF', '#A50000',
    '#00BBA5', '#0000BB', '#BB3400', '#86005B', '#002686',
];

function getMissionLvColor(lv: number): Color {
    const idx = Math.max(0, Math.min(MISSION_LV_COLORS.length - 1, lv - 1));
    const c = new Color();
    Color.fromHEX(c, MISSION_LV_COLORS[idx]);
    return c;
}

@ccclass('MissionUI')
export class MissionUI extends Component {

    // ミッションボタン背景(assets/resources/png/MissionBG.png、600x80の白黒バースト柄)。
    // MissionLvごとの色はGraphicsの塗りではなくSprite.colorのTintで表現する(SideBarUI.tsの
    // "png/LeftSide"等と同じ、resources.load(path + "/spriteFrame", SpriteFrame, ...)の規約)。
    // 開くたびに何度もロードし直さないよう、ロード済みのSpriteFrameをクラス全体でキャッシュする。
    private static _missionBgFrame: SpriteFrame | null = null;
    private static _missionBgLoading: boolean = false;
    private static _pendingSprites: Sprite[] = [];

    private static requestMissionBgSprite(sprite: Sprite) {
        if (MissionUI._missionBgFrame) {
            sprite.spriteFrame = MissionUI._missionBgFrame;
            return;
        }
        MissionUI._pendingSprites.push(sprite);
        if (MissionUI._missionBgLoading) return;
        MissionUI._missionBgLoading = true;
        resources.load("png/MissionBG/spriteFrame", SpriteFrame, (err, frame) => {
            MissionUI._missionBgLoading = false;
            if (err || !frame) {
                console.warn("[MissionUI] Failed to load png/MissionBG spriteFrame. Falling back to flat color buttons.", err);
                return;
            }
            MissionUI._missionBgFrame = frame;
            for (const s of MissionUI._pendingSprites) {
                if (s && s.isValid) s.spriteFrame = frame;
            }
            MissionUI._pendingSprites = [];
        });
    }

    private contentNode: Node = null;
    private dialogNode: Node = null;
    // notifyOverlayOpening()の戻り値(世代番号)。CustomizeUI.tsのoverlayGenと同じ役割。
    private overlayGen: number = 0;

    private displayedMissions: IMissionData[] = [];
    // displayedMissionsと同じ順序で、各ミッションがそのLv内で何番目のSubLv(ModCountMin昇順)
    // から生成されたかを保持する(ボタン表示用、IMissionData自体はゲームプレイ側の型なので
    // 表示専用のこの情報は混ぜずに別配列で持つ)。
    private displayedSubLvIndices: number[] = [];
    // 現在のページ(Lv)に定義されている総SubLv数と、そのうち★で解放済みのSubLv数。
    private pageSubLvTotal: number = 0;
    private pageSubLvUnlocked: number = 0;

    // ★合計(TotalUpgrade)と、それによって解放されている最大MissionLv。
    private totalStars: number = 0;
    private unlockedMaxLv: number = 0;
    // 現在表示中のページ(=MissionLv、1〜unlockedMaxLv)。
    private currentPage: number = 1;

    onLoad() {
        // Force to center (0,0) if added to Canvas
        if (this.node.parent && this.node.parent.name === "Canvas") {
            this.node.setPosition(0, 0, 0);
        }

        // UIManager.notifyOverlayOpening()経由で、他の全画面オーバーレイ(UpgradeUI/CustomizeUI/
        // PropertyUI/HistoryUI等)を開く直前に自動で閉じる(以前はUpgradeUI/CustomizeUIだけを
        // 名指しで閉じる一方通行の実装だったため、CustomizeUI.open()側にMissionUIを閉じる処理が
        // 無く、開いたままCustomizeを開くと表示が重なって操作不能になる不具合があった)。
        if (UIManager.instance) {
            this.overlayGen = UIManager.instance.notifyOverlayOpening('MissionUI', this.node, () => {
                if (this.node && this.node.isValid) this.node.destroy();
            });
        }

        // 全画面を覆ってタッチイベントをブロック(モーダル化)
        try {
            this.setupModalBackground();
        } catch (e) {
            console.warn("[MissionUI] setupModalBackground failed", e);
        }

        // データベースの準備を待ってから表示
        this.schedule(this.checkDatabaseAndInit, 0.1);
    }

    private checkDatabaseAndInit() {
        const db = GameDatabase.instance;
        if (db && db.isReady) {
            this.unschedule(this.checkDatabaseAndInit);

            this.totalStars = getTotalUpgradeStars();
            const diff = db.getMissionDifficultyForModCount(this.totalStars);
            this.unlockedMaxLv = diff ? diff.lv : 0;
            // 通常はMissionDifficulty.csvにLv1/ModCountMin0の行が必ずあるため0にはならない想定だが、
            // データ未整備等でnullだった場合の保険として1にフォールバックする。
            if (this.unlockedMaxLv <= 0) this.unlockedMaxLv = 1;
            // 開いた直後は「今の最前線」のLvページを見せる。
            this.currentPage = this.unlockedMaxLv;

            this.rollMissionsForPage(this.currentPage);
            this.initUI();
        }
    }

    // 指定MissionLvページの候補を、解放済み(ModCountMin <= totalStars)なSubLv行の中から
    // 重複無しで最大3件ランダムに選び、それぞれ実際のミッション情報(距離/報酬/貨物/目標時間)を
    // 生成する。既に通過済みのLv(=totalStarsがそのLvの最大ModCountMinを超えている)なら
    // そのLv内の全SubLv行が対象になるため、過去のLvへ戻って任意の構成を選び直せる。
    private rollMissionsForPage(lv: number) {
        const db = GameDatabase.instance;
        const gm = GameManager.instance;
        this.displayedMissions = [];
        this.displayedSubLvIndices = [];
        this.pageSubLvTotal = 0;
        this.pageSubLvUnlocked = 0;
        if (!db || !gm) return;

        // そのLvに定義されている全SubLv行(ModCountMin昇順)。何番目か(SubLv表示用)と、
        // うち何個が★で解放済みかをここから求める。
        const allRowsForLv = db.missionDifficulties.filter(md => md.lv === lv).sort((a, b) => a.modCountMin - b.modCountMin);
        this.pageSubLvTotal = allRowsForLv.length;

        const eligible = allRowsForLv.filter(md => md.modCountMin <= this.totalStars);
        this.pageSubLvUnlocked = eligible.length;
        if (eligible.length === 0) return;

        // Shuffle
        const pool = [...eligible];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const picks = pool.slice(0, 3);

        const missions: IMissionData[] = [];
        const subLvIndices: number[] = [];
        let seq = 0;
        for (const diff of picks) {
            const gen = generateMissionFromDifficultyRow(diff, this.totalStars, gm);
            if (!gen) continue;
            seq++;

            // 実際に選ばれたSpawnTable群のslots(TypeID_1..12)をそのまま合算してenemyPatternに
            // する。以前はenemyPatternが常に空/実在しないIDだったため、GameManager.spawnEnemy()が
            // 常にdb.getRandomEnemy()(完全ランダム)にフォールバックしていた
            // (=SubLv1で選ばれたはずのDEB001以外の敵も湧いていた原因)。同じ敵が複数テーブルの
            // slotsに重複して入っていれば、その分だけ出現率が上がる(重複除去はしない)。
            const enemyPattern: string[] = [];
            for (const tableId of gen.tableIds) {
                const table = db.getSpawnTableData(tableId);
                if (table && table.slots) enemyPattern.push(...table.slots);
            }

            missions.push({
                id: Date.now() + seq,
                stars: gen.lv,
                distance: Math.round(gen.distD),
                enemyPattern,
                reward: Math.round(gen.rewardG + gen.rewardH),
                cargoWeight: gen.cargoWeight,
                targetTime: Math.round(gen.targetTimeSec),
            });
            subLvIndices.push(allRowsForLv.indexOf(diff) + 1);
        }
        this.displayedMissions = missions;
        this.displayedSubLvIndices = subLvIndices;
        console.log(`[MissionUI] Rolled ${missions.length} mission(s) for Lv${lv} SubLv[${subLvIndices.join(',')}]/${this.pageSubLvTotal} (unlocked ${this.pageSubLvUnlocked}/${this.pageSubLvTotal}, totalStars=${this.totalStars}, unlockedMaxLv=${this.unlockedMaxLv}).`);
    }

    private initUI() {
        // コンテンツコンテナ
        this.setupContent();

        // ミッションボタン生成
        this.createMissionButtons();

        // 閉じるボタン(Reselectの右隣にHomeボタンとして配置)
        this.createHomeButton();

        // 再抽選ボタン
        this.createReselectButton();

        // Nodes created via `new Node(...)` default to the DEFAULT layer, not this
        // panel's UI_2D - they don't inherit layer from their parent. Without this,
        // everything under Content is logically built but invisible (MainCamera's
        // UI visibility mask doesn't include DEFAULT).
        this.forceUILayer(this.node);
    }

    /** Recursively force a node subtree onto the UI_2D layer so MainCamera can see it. */
    private forceUILayer(node: Node) {
        node.layer = Layers.Enum.UI_2D;
        for (const child of node.children) {
            this.forceUILayer(child);
        }
    }

    private setupModalBackground() {
        // Widgetで全画面化
        if (this.node) {
            const widget = this.node.addComponent(Widget);
            widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
            widget.top = widget.bottom = widget.left = widget.right = 0;

            // タッチブロック
            this.node.addComponent(BlockInputEvents);
        } else {
            console.warn("[MissionUI] node is null in setupModalBackground");
        }

        // 半透明黒背景
        const gr = this.node.addComponent(Graphics);
        gr.fillColor = new Color(0, 0, 0, 220);
        gr.rect(-2000, -2000, 4000, 4000); // 簡易的に大きく
        gr.fill();
    }

    private setupContent() {
        if (this.contentNode) {
            this.contentNode.destroy();
        }
        this.contentNode = new Node("Content");
        this.node.addChild(this.contentNode);

        // 配置を中央に(親ノードが中央にある前提)
        this.contentNode.setPosition(0, 0);
    }

    private createMissionButtons() {
        // ページ見出し(タイトル/MissionLv表示/PREV・NEXT)とミッションボタン列が重なっていた
        // (ページ見出しのY=195に対し、1件目のボタン(高さ80)がY=150で上端Y=190まで来ていたため)。
        // タイトル/見出しを上に、ボタン開始位置を下にずらして間隔を確保する。
        let y = 110;
        const gap = 110;
        const lvColor = getMissionLvColor(this.currentPage);

        // タイトル
        const titleNode = new Node("Title");
        this.contentNode.addChild(titleNode);
        titleNode.setPosition(0, 260);
        const lbl = titleNode.addComponent(Label);
        lbl.string = "SELECT MISSION";
        lbl.fontSize = 40;
        const out = titleNode.addComponent(LabelOutline);
        out.color = lvColor;
        out.width = 3;

        // ページ表示("MissionLv N")+PREV/NEXT。解放済みページ(1〜unlockedMaxLv)しか
        // 移動できない(未解放Lvはページ自体を作らないため、ユーザー指示通り表示不要)。
        this.createPageLabel(lvColor);
        this.createPageNavButton("PrevPageBtn", -260, 210, "<", this.currentPage > 1, () => this.changePage(-1));
        this.createPageNavButton("NextPageBtn", 260, 210, ">", this.currentPage < this.unlockedMaxLv, () => this.changePage(1));

        if (this.displayedMissions.length === 0) {
            const emptyNode = new Node("EmptyLabel");
            this.contentNode.addChild(emptyNode);
            emptyNode.setPosition(0, 40);
            const emptyLbl = emptyNode.addComponent(Label);
            emptyLbl.string = "No missions available on this level yet.";
            emptyLbl.fontSize = 22;
            emptyLbl.color = Color.GRAY;
            return;
        }

        this.displayedMissions.forEach((mission, i) => {
            const subLv = this.displayedSubLvIndices[i] || 0;
            this.createButton(mission, subLv, 0, y);
            y -= gap;
        });
    }

    private createPageLabel(lvColor: Color) {
        const pageNode = new Node("PageLabel");
        this.contentNode.addChild(pageNode);
        pageNode.setPosition(0, 210);
        const lbl = pageNode.addComponent(Label);
        lbl.string = `MissionLv ${this.currentPage} / ${this.unlockedMaxLv}  (SubLv ${this.pageSubLvUnlocked}/${this.pageSubLvTotal} unlocked)`;
        lbl.fontSize = 24;
        lbl.color = lvColor;
        const out = pageNode.addComponent(LabelOutline);
        out.width = 2;
    }

    private createPageNavButton(name: string, x: number, y: number, text: string, enabled: boolean, onClick: () => void) {
        const btnNode = new Node(name);
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 48;
        const h = 48;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = enabled ? new Color(60, 60, 60, 255) : new Color(30, 30, 30, 180);
        gr.roundRect(-w / 2, -h / 2, w, h, 8);
        gr.fill();
        gr.strokeColor = enabled ? Color.WHITE : new Color(90, 90, 90, 255);
        gr.lineWidth = 2;
        gr.roundRect(-w / 2, -h / 2, w, h, 8);
        gr.stroke();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;
        lbl.fontSize = 26;
        lbl.color = enabled ? Color.WHITE : new Color(100, 100, 100, 255);

        if (!enabled) return;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.9;
        btnNode.on(Button.EventType.CLICK, () => {
            SoundManager.instance.playSE("click");
            onClick();
        }, this);
    }

    private changePage(delta: number) {
        const next = this.currentPage + delta;
        if (next < 1 || next > this.unlockedMaxLv) return;
        this.currentPage = next;
        this.rollMissionsForPage(this.currentPage);
        this.initUI();
    }

    private createReselectButton() {
        instantiatePrefabButton("Prefabs/Canvas/Button-Reselect", this.contentNode, -130, -240, () => {
            SoundManager.instance.playSE("click");
            // 現在のページ(Lv)内だけを再抽選する(ページを跨がない)。
            this.rollMissionsForPage(this.currentPage);
            this.initUI();
        }, this.node, "RESELECT", new Color(100, 100, 100));
    }

    private createButton(mission: IMissionData, subLv: number, x: number, y: number) {
        const btnNode = new Node(`MissionBtn_${mission.id}`);
        this.contentNode.addChild(btnNode);
        btnNode.setPosition(x, y);

        // 背景 (Sprite) - assets/resources/png/MissionBG.png(600x80の白黒バースト柄)を
        // MissionLvごとの色でTintして使う。Cocos 3.8のcc.Graphicsにはネイティブなグラデーション
        // 塗りが無いため、以前は塗り+ハイライト円の重ね塗りで近似していたが、専用アートを
        // 用意してもらえたためSprite.colorでの単純Tintに置き換えた(ロードはクラス全体で
        // キャッシュ、複数ボタンが同時に要求しても1回だけfetchする - requestMissionBgSprite参照)。
        const w = 600;
        const h = 80;
        const baseColor = getMissionLvColor(mission.stars);
        const uiTrans = btnNode.addComponent(UITransform);
        uiTrans.setContentSize(w, h);
        const sprite = btnNode.addComponent(Sprite);
        sprite.color = baseColor;
        MissionUI.requestMissionBgSprite(sprite);

        // ボタンコンポーネント(クリック判定用 - 遷移アニメーション等に使う)
        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        // Nodeイベントでクリックをリッスン (EventHandlerを使わない)
        btnNode.on(Button.EventType.CLICK, () => {
            this.onMissionClicked(mission);
        }, this);

        // ラベル
        const labelNode = new Node("Label");
        btnNode.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.fontSize = 20; // Slightly smaller to fit info
        label.color = Color.WHITE;
        const labelOutline = labelNode.addComponent(LabelOutline);
        labelOutline.width = 2;

        label.string = `Lv${mission.stars}-SubLv${subLv}  DIST: ${mission.distance}km  TIME: ${mission.targetTime}s  CARGO: ${mission.cargoWeight}`;
        label.lineHeight = 40; // 1行表示のため調整
    }

    // 右上の"X"閉じるボタンは廃止し、Reselectの右隣に「Home」として統一した
    // (Home/Back/Closeが画面ごとにバラバラの文言・見た目だったため)。
    private createHomeButton() {
        instantiatePrefabButton("Prefabs/Canvas/Button-Home", this.contentNode, 130, -240, () => {
            this.close();
        }, this.node, "HOME", new Color(0, 150, 255));
    }

    // --- Events ---

    public onMissionClicked(mission: IMissionData) {
        SoundManager.instance.playSE("click");
        this.showConfirmDialog(mission);
    }

    public close() {
        SoundManager.instance.playSE("click");
        // node.destroy()はonDestroy()の実行をフレーム末尾まで遅延させるため、Blockerのフェード
        // アウトをここで即座に開始しておく(onDestroy()からも同じ世代番号で呼ぶので、二重に
        // 呼ばれても安全)。
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('MissionUI', this.overlayGen);
        this.node.destroy();
    }

    // node.destroy()の経路(close()呼び出し・他オーバーレイが開いた際のUIManager経由の破棄の
    // いずれでも)必ず呼ばれるので、close()を経由しない破棄経路の保険としてここでも呼ぶ
    // (世代番号が現在の登録と一致する時だけ実際にクリアされるので、close()と重複しても安全)。
    onDestroy() {
        if (UIManager.instance) UIManager.instance.notifyOverlayClosed('MissionUI', this.overlayGen);
    }

    // --- Confirm Dialog ---

    private showConfirmDialog(mission: IMissionData) {
        if (this.dialogNode) {
            this.dialogNode.destroy();
        }

        // 半透明背景(さらに上)
        this.dialogNode = new Node("Dialog");
        this.node.addChild(this.dialogNode);

        // 背景
        const bg = this.dialogNode.addComponent(Graphics);
        bg.fillColor = new Color(0, 0, 20, 240);
        bg.rect(-2000, -2000, 4000, 4000); // 全画面ブロック
        bg.fill();

        // タッチブロック
        this.dialogNode.addComponent(BlockInputEvents);

        // ウィンドウ
        const winNode = new Node("Window");
        this.dialogNode.addChild(winNode);
        const gr = winNode.addComponent(Graphics);
        gr.fillColor = new Color(50, 50, 50, 255);
        gr.roundRect(-300, -200, 600, 400, 10); // Enlarged to 600x400
        gr.fill();
        gr.strokeColor = Color.CYAN;
        gr.lineWidth = 3;
        gr.stroke();

        // テキスト
        const txtNode = new Node("Text");
        winNode.addChild(txtNode);
        txtNode.setPosition(0, 80);
        const richText = txtNode.addComponent(RichText);
        richText.fontSize = 24;
        richText.maxWidth = 500;
        richText.horizontalAlign = RichText.HorizontalAlign.CENTER;

        // Check for HP0
        const currentHp = DataManager.instance ? DataManager.instance.data.hp : 100;
        const isHpZero = currentHp <= 0;

        if (isHpZero) {
            richText.string = `<outline color=#000000 width=3><color=#ff4444>HP is 0!</color>\nRepair is required before departure.\nPlease return and restore HP.</outline>`;

            // BACK Button only
            this.createDialogButton(winNode, "BACK", 0, -120, Color.GRAY, () => {
                SoundManager.instance.playSE("click");
                this.closeDialog();
            });
        } else {
            // Check for overload
            const capacity = (DataManager.instance as any).data.capacity || 50;
            const isOverloaded = (mission.cargoWeight || 0) > capacity;
            const warning = isOverloaded ?
                `<color=#ff4444>\nWARNING: Cargo exceeds capacity!\nFirepower will be REDUCED.</color>` : "";

            richText.string = `<outline color=#000000 width=3>Start Mission?\nDistance: ${mission.distance}km\nCargo: ${mission.cargoWeight} / Cap: ${capacity}${warning}\nProceed?</outline>`;

            // YES Button
            instantiatePrefabButton("Prefabs/Canvas/Button-Yes", winNode, -120, -120, () => {
                SoundManager.instance.playSE("click");
                this.startGame(mission);
                this.closeDialog();
            }, this.dialogNode, "YES", Color.GREEN);

            // NO Button
            instantiatePrefabButton("Prefabs/Canvas/Button-No", winNode, 120, -120, () => {
                SoundManager.instance.playSE("click");
                this.closeDialog();
            }, this.dialogNode, "NO", Color.RED);
        }

        this.forceUILayer(this.dialogNode);
    }

    // Defer destruction by a frame - the dialog buttons live under dialogNode itself,
    // so destroying it synchronously from inside its own click handler corrupts the
    // component teardown order (Sprite depends on UITransform) and leaves a visual
    // ghost even though the node is gone from the hierarchy.
    private closeDialog() {
        const node = this.dialogNode;
        this.dialogNode = null;
        if (node) {
            this.scheduleOnce(() => {
                if (node.isValid) node.destroy();
            }, 0);
        }
    }

    private createDialogButton(parent: Node, text: string, x: number, y: number, color: Color, onClick: () => void) {
        const btnNode = new Node("Btn" + text);
        parent.addChild(btnNode);
        btnNode.setPosition(x, y);

        const w = 120;
        const h = 50;
        const gr = btnNode.addComponent(Graphics);
        gr.fillColor = color;
        gr.roundRect(-w / 2, -h / 2, w, h, 5);
        gr.fill();

        const lblNode = new Node("Label");
        btnNode.addChild(lblNode);
        const lbl = lblNode.addComponent(Label);
        lbl.string = text;

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;

        btnNode.on(Button.EventType.CLICK, onClick, this);
    }

    private startGame(mission: IMissionData) {
        if (GameManager.instance) {
            GameManager.instance.startInGame(mission);
            // HomeUIも閉じる必要がある？ -> シーン遷移すれば不要だが、Prefab切り替えなので、
            // GameManager側でHomePrefabを消してIngamePrefabを出す処理が走る。
            // ただしMissionUIはHomeUI（またはManager）の子として作られる。
            // Managerの子ならIngame遷移時に消えない可能性があるので、手動で消すのが安全。
        }
        if (this.node.isValid) {
            this.node.destroy();
        }
    }
}
