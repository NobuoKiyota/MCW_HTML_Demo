import { _decorator, Component, Label, Toggle, input, Input, KeyCode, EventKeyboard } from 'cc';
import { GameManager } from './GameManager';
import { PlayerController } from './PlayerController';
import { GameDatabase } from './GameDatabase';
import { DataManager } from './DataManager';
import { Enemy } from './Enemy';
import { SpawnTableData } from './GameDataTypes';
import { PlayerWeaponManager } from './PlayerWeaponManager';
const { ccclass, property } = _decorator;

/**
 * 行動パターン検証用テストシーン専用のコントローラ。
 * EnemyData / SpawnTableDataをそれぞれ1件ずつ選択してSpawn/Despawn/SpawnTable実行し、
 * Player/Enemyの無敵状態を切り替えられるようにする。
 * シーン構築(UI配置・Inspector参照割当)はCocos Editor上で手動で行う前提。
 *
 * キー操作:
 *   上/下   : 選択フォーカスをENE(敵ID単体)⇔ST(SpawnTable)で切り替える
 *   左/右   : フォーカス中の選択(ENEなら敵ID、STならSpawnTable ID)をPrev/Next
 *   Enter   : フォーカス中の対象を実行(ENEなら選択IDを1体Spawn、STならSpawnTable実行)
 *   Delete  : 出現中の敵を全てDespawn
 */
@ccclass('BehaviorTestController')
export class BehaviorTestController extends Component {

    @property(GameManager)
    public gameManager: GameManager = null;

    // Inspectorでの手動割当は不要。IngameプレハブはstartInGame()実行時(=実行時)に生成されるため、
    // 生成後に gameManager.playerNode から自動解決する。
    private playerController: PlayerController = null;

    @property({ type: PlayerWeaponManager, tooltip: "デバッグ用: Group1~6の初期装備武器をInspectorのプルダウンで指定する場合に割り当てる(任意、未割当なら通常通りshotPatternIdの1武器のみ発射)" })
    public playerWeaponManager: PlayerWeaponManager = null;

    @property({ type: Label, tooltip: "選択中のEnemyDataを表示するLabel" })
    public selectedEnemyLabel: Label = null;

    @property({ type: Label, tooltip: "選択中のSpawnTableIDを表示するLabel" })
    public selectedSpawnTableLabel: Label = null;

    @property({ type: Label, tooltip: "T(SpawnTable実行)後の結果(Dist設定値/出現数/生成ID一覧)を表示するLabel" })
    public spawnTableDebugLabel: Label = null;

    @property({ type: Label, tooltip: "選択中のテストMission(仮生成プレビュー)を表示するLabel" })
    public selectedMissionLabel: Label = null;

    @property({ type: Label, tooltip: "Mission(仮)クリア結果ダイアログを表示するLabel。普段は非表示、距離0到達時のみ表示する" })
    public resultLabel: Label = null;

    @property({ type: Toggle, tooltip: "ONの間プレイヤーを無敵にする" })
    public playerInvincibleToggle: Toggle = null;

    @property({ type: Toggle, tooltip: "ONの間、以後スポーンする敵を無敵にする(既存の出現中の敵にも即時反映)" })
    public enemyInvincibleToggle: Toggle = null;

    private _enemyIds: string[] = [];
    private _selectedIndex: number = 0;

    private _spawnTableIds: string[] = [];
    private _selectedSTIndex: number = 0;

    // 上下キーで切り替える選択フォーカス。左右キーはこちらが指す方のリストだけを動かす。
    private _focus: 'ENE' | 'ST' | 'MISSION' = 'ENE';

    // Mission(仮生成)プレビュー。ModCountMinとの比較に使う総改造回数は0~30をランダム抽選する
    // (PlayerManager未実装のため、実際の機体改造回数の代わりに使うテスト用の値)。
    private _currentMissionPreview: {
        modCount: number; lv: number; tableCount: number;
        tableIds: string[]; tableDists: number[];
        distA: number; distB: number; distC: number; distD: number;
        rewardG: number; cargoWeight: number; cargoPrice: number; rewardH: number;
        targetTimeSec: number;
    } | null = null;

    // MissionDifficulty.csvに実際に登録されているModCountMin値の一覧(重複除去・昇順)。
    // Prev/Nextはこの中を巡回する(DBが読み込まれた時点で1度だけ算出する)。
    private _missionTestModCounts: number[] = [];
    private _missionTestIndex: number = 0;

    // Mission実行中の状態。testMode中はGameManager.update()がゴール判定(Result画面遷移)を
    // 行わない(BehaviorTestController.beginTest()参照)ため、距離0到達はここで独自に監視する。
    private _missionRunning: boolean = false;
    private _missionElapsedSec: number = 0;
    private _missionSpawnQueue: { id: string; triggerAtDistance: number; fired: boolean }[] = [];

    // 直近のSpawnTable実行結果。spawnedCountはGameManager.spawnFromSpawnTable()のonSpawned
    // コールバックで1体生成されるたびに増える(Cycleが非Instantなら時間差でこの値だけが伸びて
    // いく)。残り距離はここに固定せず、update()で毎フレームgameManager.playState.distanceから
    // 読み直して表示するので、Tキーを押していない間も実際に減っていく様子が見える。
    // nullの間はまだ一度もTを押していない状態。
    private _lastSpawnSummary: { spawnedCount: number; total: number; types: string[] } | null = null;

    private _retryCount: number = 0;

    // GameDatabaseの準備待ちリトライ上限 (0.1秒間隔 x 300回 = 最大30秒で諦める)
    private static readonly MAX_RETRY = 300;

    onLoad() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        if (this.resultLabel) this.resultLabel.node.active = false;
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.ARROW_UP:
            case KeyCode.ARROW_DOWN:
                this._focus = this._focus === 'ENE' ? 'ST' : (this._focus === 'ST' ? 'MISSION' : 'ENE');
                this.updateSelectedLabel();
                this.updateSelectedSpawnTableLabel();
                this.updateSelectedMissionLabel();
                break;
            case KeyCode.ARROW_LEFT:
                if (this._focus === 'ENE') this.onPrevEnemy();
                else if (this._focus === 'ST') this.onPrevSpawnTable();
                else this.onPrevMission();
                break;
            case KeyCode.ARROW_RIGHT:
                if (this._focus === 'ENE') this.onNextEnemy();
                else if (this._focus === 'ST') this.onNextSpawnTable();
                else this.onNextMission();
                break;
            case KeyCode.ENTER:
                // フォーカス中の対象を実行する: ENEなら単体Spawn、STならSpawnTable実行、MISSIONならMission開始。
                if (this._focus === 'ENE') this.onSpawnClicked();
                else if (this._focus === 'ST') this.onRunSpawnTableClicked();
                else this.onStartMissionClicked();
                break;
            case KeyCode.DELETE:
                this.onDespawnClicked();
                break;
        }
    }

    start() {
        if (!this.gameManager) {
            console.error("[BehaviorTestController] gameManager is not assigned in the Inspector.");
            return;
        }

        // GameManager.start()自身もtitlePrefab/homePrefabが設定されていればgoToTitle()/goToHome()を
        // 呼び、switchContent()+applyCameraForState()でカメラをTitle/Home位置(640,360)にセットする。
        // このコンポーネントのstart()とGameManagerのstart()はCocosの同一ライフサイクル内で走り、
        // どちらが後に実行されるかはノード順・初回ロード時のリソース読み込みタイミングなどに左右され
        // 保証されない。startInGame()をここで直接呼ぶと、GameManager側のgoToTitle()が後から実行され
        // カメラがTitle位置のまま上書きされてしまうことがある(初回Playでのみ再現し、停止して再度
        // Playすると直るのはこのタイミング差のため)。scheduleOnce(0)で次フレームに回し、全コンポーネント
        // のstart()が完了した後に確実に実行されるようにする。
        this.scheduleOnce(() => this.beginTest(), 0);
    }

    private beginTest() {
        // 自動スポーン/ミッション距離カウントダウンを止めてから、既存の startInGame() を再利用して
        // Ingameプレハブの展開・カメラ設定・参照解決(playerNode/enemyLayer/bulletLayer等)を行う。
        // (Enemy.update()/GameManager.update() は state === INGAME でなければ何もしないため必須)
        this.gameManager.testMode = true;
        this.gameManager.startInGame(null);

        if (this.gameManager.playerNode) {
            this.playerController = this.gameManager.playerNode.getComponent(PlayerController);
        }
        if (!this.playerController) {
            console.warn("[BehaviorTestController] Could not resolve PlayerController from gameManager.playerNode.");
        } else if (this.playerWeaponManager) {
            // playerControllerが確実に有効になった直後(=Player node生成後)にこの場で直接反映する。
            // PlayerController側のwaitForShotPattern()は毎リトライ読み直すので順序に厳密な制約は
            // ないが、コンポーネント間のロード順を推測に頼らずここで同期的に配線する。
            const ids = this.playerWeaponManager.resolveSelectedShotPatternIds();
            this.playerController.setExtraShotPatternIds(ids);
            console.log(`[BehaviorTestController] PlayerWeaponManagerから${ids.length}件の追加ShotPatternIDを反映: [${ids.join(', ')}]`);
        }

        this._retryCount = 0;
        this.waitForDatabase();
    }

    private waitForDatabase() {
        const db = GameDatabase.instance;
        if (db && db.isReady && db.enemies.length > 0) {
            this._enemyIds = db.enemies.map(e => e.id);
            this._selectedIndex = 0;
            this._spawnTableIds = db.spawnTables.map(t => t.id);
            this._selectedSTIndex = 0;
            this.updateSelectedLabel();
            this.updateSelectedSpawnTableLabel();

            this._missionTestModCounts = Array.from(new Set(db.missionDifficulties.map(d => d.modCountMin))).sort((a, b) => a - b);
            this._missionTestIndex = 0;
            this.refreshMissionPreview(this._missionTestModCounts[0]);
            this.updateSelectedMissionLabel();
            console.log(`[BehaviorTestController] Loaded ${this._enemyIds.length} enemies, ${this._spawnTableIds.length} SpawnTables from GameDatabase.`);
            return;
        }

        this._retryCount++;
        if (this._retryCount > BehaviorTestController.MAX_RETRY) {
            console.error("[BehaviorTestController] GameDatabase did not become ready in time. Giving up.");
            if (this.selectedEnemyLabel) this.selectedEnemyLabel.string = "(GameDatabase not ready)";
            return;
        }

        this.scheduleOnce(() => this.waitForDatabase(), 0.1);
    }

    private updateSelectedLabel() {
        if (!this.selectedEnemyLabel) return;
        const marker = this._focus === 'ENE' ? '▶ ' : '';
        if (this._enemyIds.length === 0) {
            this.selectedEnemyLabel.string = `${marker}(no enemies)`;
            return;
        }
        this.selectedEnemyLabel.string = `${marker}ENE ${this._selectedIndex + 1}/${this._enemyIds.length}: ${this._enemyIds[this._selectedIndex]}`;
    }

    private updateSelectedSpawnTableLabel() {
        if (!this.selectedSpawnTableLabel) return;
        const marker = this._focus === 'ST' ? '▶ ' : '';
        if (this._spawnTableIds.length === 0) {
            this.selectedSpawnTableLabel.string = `${marker}(no spawn tables)`;
            return;
        }
        this.selectedSpawnTableLabel.string = `${marker}ST ${this._selectedSTIndex + 1}/${this._spawnTableIds.length}: ${this._spawnTableIds[this._selectedSTIndex]}`;
    }

    // 選択中の全出現中Enemyに現在のInvincibleトグル値を適用する(onEnemyInvincibleToggledと同じ処理)。
    // SpawnTableは1回で複数体まとめてSpawnし、GameManager.spawnFromSpawnTable()はIDのリストしか
    // 返さない(Nodeは返さない)ため、個別にNodeを受け取って適用するのではなく、この一括適用を
    // Spawn/SpawnTable両方の直後で呼ぶ形にしている。
    private applyEnemyInvincibleToAll() {
        if (!this.gameManager || !this.gameManager.enemyLayer || !this.enemyInvincibleToggle) return;
        const invincible = this.enemyInvincibleToggle.isChecked;
        for (const child of this.gameManager.enemyLayer.children) {
            const enemyComp = child.getComponent(Enemy);
            if (enemyComp) enemyComp.invincible = invincible;
        }
    }

    // --- UI Event Handlers (Cocos EditorのButton/ToggleコンポーネントのClick/Checkイベントから呼ぶ) ---

    public onNextEnemy() {
        if (this._enemyIds.length === 0) return;
        this._selectedIndex = (this._selectedIndex + 1) % this._enemyIds.length;
        this.updateSelectedLabel();
    }

    public onPrevEnemy() {
        if (this._enemyIds.length === 0) return;
        this._selectedIndex = (this._selectedIndex - 1 + this._enemyIds.length) % this._enemyIds.length;
        this.updateSelectedLabel();
    }

    public onNextSpawnTable() {
        if (this._spawnTableIds.length === 0) return;
        this._selectedSTIndex = (this._selectedSTIndex + 1) % this._spawnTableIds.length;
        this.updateSelectedSpawnTableLabel();
    }

    public onPrevSpawnTable() {
        if (this._spawnTableIds.length === 0) return;
        this._selectedSTIndex = (this._selectedSTIndex - 1 + this._spawnTableIds.length) % this._spawnTableIds.length;
        this.updateSelectedSpawnTableLabel();
    }

    // Enemy単体Spawn/SpawnTable実行/Mission開始のいずれかを行ったら、前回Missionの結果表示は
    // 用済みなので消す(距離0到達時にshowMissionResult()が再度表示する)。
    private hideMissionResult() {
        if (this.resultLabel) this.resultLabel.node.active = false;
    }

    public onSpawnClicked() {
        if (!this.gameManager || this._enemyIds.length === 0) return;
        this.hideMissionResult();

        const id = this._enemyIds[this._selectedIndex];
        const node = this.gameManager.spawnEnemyById(id);
        if (!node) return;

        const enemyComp = node.getComponent(Enemy);
        if (enemyComp && this.enemyInvincibleToggle) {
            enemyComp.invincible = this.enemyInvincibleToggle.isChecked;
        }
    }

    public onDespawnClicked() {
        if (!this.gameManager) return;
        this.gameManager.despawnAllEnemies();
    }

    public onRunSpawnTableClicked() {
        if (!this.gameManager || this._spawnTableIds.length === 0) return;
        this.hideMissionResult();

        const id = this._spawnTableIds[this._selectedSTIndex];
        const db = GameDatabase.instance;
        const table = db ? db.getSpawnTableData(id) : null;

        // 残り距離をこのSpawnTable行のDist値からスタートさせる(ミッション既定の3000等ではなく)。
        // 以降はGameManager.update()が通常通り速度に応じて減らし続ける(testMode中はゴール判定
        // だけ行わない)ので、「このSpawnTableのDist付近に到達した状態」を素早く再現できる。
        if (table && this.gameManager.playState) {
            this.gameManager.playState.distance = table.dist;
        }

        // spawnFromSpawnTable()呼び出し中(Instant Cycleの場合)にonSpawnedが同期的に発火する
        // ことがあるので、summaryオブジェクトは呼び出し前に用意して参照経由で共有する。
        const summary = { spawnedCount: 0, total: 0, types: [] as string[] };
        this._lastSpawnSummary = summary;

        const result = this.gameManager.spawnFromSpawnTable(id, () => {
            summary.spawnedCount++;
            this.applyEnemyInvincibleToAll(); // 時間差で生成された分にも無敵トグルを反映する
            this.refreshSpawnTableDebugLabel();
        });

        if (!result) {
            this._lastSpawnSummary = null;
            if (this.spawnTableDebugLabel) this.spawnTableDebugLabel.string = `ST '${id}': FAILED (see console)`;
            return;
        }

        // 種類は重複を除いた一覧(出現数は同じIDが複数含まれうるため、行を分けて見やすくする)。
        summary.total = result.spawnedIds.length;
        summary.types = Array.from(new Set(result.spawnedIds));
        this.refreshSpawnTableDebugLabel();
    }

    // 残り距離は固定表示にせず、毎フレームgameManager.playState.distanceを読み直して表示する
    // (GameManager.update()はtestModeでも距離を減らし続けるが、ゴール判定はしない)。
    // 出現数は "spawnedCount/total" (時間差生成の進捗が見えるように)。
    private refreshSpawnTableDebugLabel() {
        if (!this.spawnTableDebugLabel || !this._lastSpawnSummary || !this.gameManager) return;
        const dist = Math.max(0, Math.floor(this.gameManager.playState.distance));
        const s = this._lastSpawnSummary;
        this.spawnTableDebugLabel.string =
            `残り距離: ${dist}\n出現数: ${s.spawnedCount}/${s.total}\n種類: ${s.types.join(', ')}`;
    }

    update(deltaTime: number) {
        this.refreshSpawnTableDebugLabel();
        this.updateMissionRuntime(deltaTime);
    }

    public onPlayerInvincibleToggled() {
        if (!this.playerController || !this.playerInvincibleToggle) return;
        this.playerController.invincible = this.playerInvincibleToggle.isChecked;
    }

    public onEnemyInvincibleToggled() {
        this.applyEnemyInvincibleToAll();
    }

    // --- Mission(仮生成) ---
    // MissionDifficulty.csv(Lv, ModCountMin, TableCount)とSpawnTables.csv(Lv, SubLv, Dist)から、
    // 「機体の総改造回数(modCount)」を仮の乱数(0~30、PlayerManager未実装のためのプレースホルダー)
    // として1件のミッションをプレビュー生成する。実際の生成アルゴリズムはMissionManager実装時に
    // ここから移植する想定。

    private refreshMissionPreview(modCount: number) {
        const db = GameDatabase.instance;
        if (!db || !this.gameManager) { this._currentMissionPreview = null; return; }

        const diff = db.getMissionDifficultyForModCount(modCount);
        if (!diff) { this._currentMissionPreview = null; return; }

        const pool = db.spawnTables.filter(st => st.lv === diff.lv);
        if (pool.length === 0) { this._currentMissionPreview = null; return; }

        // 同一SpawnTable IDの重複選出はGameManagerConfig.jsonのGlobalRule(missionMaxDuplicateSpawnTable)
        // まで許可する。上限に達したIDを除外しながら抽選し、guardで無限ループを防ぐ(300回で諦める)。
        const maxDup = Math.max(1, this.gameManager.missionMaxDuplicateSpawnTable || 2);
        const dupCount: { [id: string]: number } = {};
        const selected: SpawnTableData[] = [];
        let guard = 0;
        while (selected.length < diff.tableCount && guard < 300) {
            guard++;
            const cand = pool[Math.floor(Math.random() * pool.length)];
            const cur = dupCount[cand.id] || 0;
            if (cur >= maxDup) continue;
            dupCount[cand.id] = cur + 1;
            selected.push(cand);
        }
        // SubLv昇順(弱い順)に並べ、開始margin(A)を消費した直後から順に発火させる。
        selected.sort((a, b) => a.subLv - b.subLv);

        const gm = this.gameManager;
        const distA = gm.missionMarginStartKm;
        const distC = gm.missionMarginEndKm;
        const distB = selected.reduce((sum, st) => sum + st.dist, 0);
        const distD = distA + distB + distC;

        const lv = diff.lv;
        const rewardG = Math.round(distD * lv);

        const wMin = gm.missionCargoWeightBaseMin + (lv - 1) * gm.missionCargoWeightPerLv;
        const wMax = gm.missionCargoWeightBaseMax + (lv - 1) * gm.missionCargoWeightPerLv;
        const cargoWeight = Math.round(wMin + Math.random() * Math.max(0, wMax - wMin));
        const cargoPrice = gm.missionCargoPriceBase + (lv - 1) * gm.missionCargoPricePerLv;
        const rewardH = cargoWeight * cargoPrice;

        const assumedSpeed = Math.max(0.001, gm.missionAssumedMaxSpeedKmPerMin * gm.missionTargetSpeedRatio);
        const targetTimeSec = (distD / assumedSpeed) * 60;

        this._currentMissionPreview = {
            modCount, lv, tableCount: diff.tableCount,
            tableIds: selected.map(s => s.id), tableDists: selected.map(s => s.dist),
            distA, distB, distC, distD,
            rewardG, cargoWeight, cargoPrice, rewardH,
            targetTimeSec,
        };
    }

    // 表示は改造回数のみ(詳細なミッション内訳はMission開始/結果表示側でのみ使う)。
    private updateSelectedMissionLabel() {
        if (!this.selectedMissionLabel) return;
        const marker = this._focus === 'MISSION' ? '▶ ' : '';
        if (this._missionTestModCounts.length === 0 || !this._currentMissionPreview) {
            this.selectedMissionLabel.string = `${marker}MISSION (生成失敗 - MissionDifficulty/SpawnTables未設定?)`;
            return;
        }
        this.selectedMissionLabel.string =
            `${marker}MISSION ${this._missionTestIndex + 1}/${this._missionTestModCounts.length}: 改造回数${this._currentMissionPreview.modCount}`;
    }

    // MissionDifficulty.csvに登録されている各IDのModCountMin(最低改造回数)を巡回する。
    public onNextMission() {
        if (this._missionTestModCounts.length === 0) return;
        this._missionTestIndex = (this._missionTestIndex + 1) % this._missionTestModCounts.length;
        this.refreshMissionPreview(this._missionTestModCounts[this._missionTestIndex]);
        this.updateSelectedMissionLabel();
    }

    public onPrevMission() {
        if (this._missionTestModCounts.length === 0) return;
        this._missionTestIndex = (this._missionTestIndex - 1 + this._missionTestModCounts.length) % this._missionTestModCounts.length;
        this.refreshMissionPreview(this._missionTestModCounts[this._missionTestIndex]);
        this.updateSelectedMissionLabel();
    }

    public onStartMissionClicked() {
        if (!this.gameManager || !this.gameManager.playState || !this._currentMissionPreview) return;
        this.hideMissionResult();
        const p = this._currentMissionPreview;

        // Missionスタートと同時にCreditを0にリセットし、HPを全回復する(このMission単体で
        // どれだけ稼げるかを毎回0地点から体感するためのテスト用挙動)。
        if (DataManager.instance) {
            DataManager.instance.data.money = 0;
        }
        if (this.playerController) {
            this.playerController.heal(this.playerController.maxHp);
        }

        this.gameManager.despawnAllEnemies();
        this.gameManager.playState.distance = p.distD;
        this._missionElapsedSec = 0;
        this._missionRunning = true;

        // 各SpawnTableの発火しきい値(残り距離)は「そのテーブルより後ろの全テーブルのdist合計 + C」。
        // 先頭(SubLv最小)のテーブルが最初に、末尾のテーブルが終了margin(C)の直前に発火する。
        let remaining = p.distC;
        const triggers: { id: string; triggerAtDistance: number }[] = [];
        for (let i = p.tableIds.length - 1; i >= 0; i--) {
            remaining += p.tableDists[i];
            triggers.unshift({ id: p.tableIds[i], triggerAtDistance: remaining });
        }
        this._missionSpawnQueue = triggers.map(t => ({ ...t, fired: false }));

        console.log(`[BehaviorTestController] Mission(仮) started. modCount=${p.modCount} Lv=${p.lv} D=${p.distD} tables=[${p.tableIds.join(', ')}]`);
    }

    private updateMissionRuntime(dt: number) {
        if (!this._missionRunning || !this.gameManager || !this.gameManager.playState) return;

        this._missionElapsedSec += dt;
        const dist = this.gameManager.playState.distance;

        for (const t of this._missionSpawnQueue) {
            if (!t.fired && dist <= t.triggerAtDistance) {
                t.fired = true;
                this.gameManager.spawnFromSpawnTable(t.id, () => this.applyEnemyInvincibleToAll());
            }
        }

        if (dist <= 0) {
            this._missionRunning = false;
            this.showMissionResult();
        }
    }

    private showMissionResult() {
        if (!this._currentMissionPreview || !this.gameManager) return;
        const p = this._currentMissionPreview;
        const gm = this.gameManager;

        const diffSec = p.targetTimeSec - this._missionElapsedSec; // +なら早着、-なら遅着
        const stepSec = gm.missionBonusStepSeconds || 2;
        const percentPerStep = gm.missionBonusPercentPerStep || 2;
        const steps = Math.floor(Math.abs(diffSec) / stepSec);
        let percent = Math.sign(diffSec) * steps * percentPerStep;
        percent = Math.min(gm.missionBonusCapPercent, Math.max(-gm.missionPenaltyFloorPercent, percent));
        const multiplier = 1 + percent / 100;

        const baseReward = p.rewardG + p.rewardH;
        const finalReward = Math.round(baseReward * multiplier);

        if (DataManager.instance) {
            DataManager.instance.addResource('credits', finalReward);
        }

        if (this.resultLabel) {
            this.resultLabel.node.active = true;
            this.resultLabel.string =
                `[Mission Clear (仮)]\n` +
                `Lv${p.lv} Table x${p.tableCount}\n` +
                `目標${p.targetTimeSec.toFixed(1)}s / 実測${this._missionElapsedSec.toFixed(1)}s (${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%)\n` +
                `G=${p.rewardG} + H=${p.rewardH} → 獲得クレジット: ${finalReward}`;
        }

        console.log(`[BehaviorTestController] Mission(仮) complete. elapsed=${this._missionElapsedSec.toFixed(1)}s target=${p.targetTimeSec.toFixed(1)}s reward=${finalReward}`);
    }
}
