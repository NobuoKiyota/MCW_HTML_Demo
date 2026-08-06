import { _decorator, Component, Label, Toggle, input, Input, KeyCode, EventKeyboard } from 'cc';
import { GameManager } from './GameManager';
import { PlayerController } from './PlayerController';
import { GameDatabase } from './GameDatabase';
import { Enemy } from './Enemy';
const { ccclass, property } = _decorator;

/**
 * 行動パターン検証用テストシーン専用のコントローラ。
 * EnemyData を1体ずつ選択してSpawn/Despawnし、Player/Enemyの無敵状態を切り替えられるようにする。
 * シーン構築(UI配置・Inspector参照割当)はCocos Editor上で手動で行う前提。
 */
@ccclass('BehaviorTestController')
export class BehaviorTestController extends Component {

    @property(GameManager)
    public gameManager: GameManager = null;

    // Inspectorでの手動割当は不要。IngameプレハブはstartInGame()実行時(=実行時)に生成されるため、
    // 生成後に gameManager.playerNode から自動解決する。
    private playerController: PlayerController = null;

    @property({ type: Label, tooltip: "選択中のEnemyDataを表示するLabel" })
    public selectedEnemyLabel: Label = null;

    @property({ type: Toggle, tooltip: "ONの間プレイヤーを無敵にする" })
    public playerInvincibleToggle: Toggle = null;

    @property({ type: Toggle, tooltip: "ONの間、以後スポーンする敵を無敵にする(既存の出現中の敵にも即時反映)" })
    public enemyInvincibleToggle: Toggle = null;

    private _enemyIds: string[] = [];
    private _selectedIndex: number = 0;
    private _retryCount: number = 0;

    // GameDatabaseの準備待ちリトライ上限 (0.1秒間隔 x 300回 = 最大30秒で諦める)
    private static readonly MAX_RETRY = 300;

    onLoad() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    // 矢印キーでの操作: ← Prev / → Next / ↑ Spawn / ↓ Despawn (ボタン連打の代替)
    private onKeyDown(event: EventKeyboard) {
        switch (event.keyCode) {
            case KeyCode.ARROW_LEFT:
                this.onPrevEnemy();
                break;
            case KeyCode.ARROW_RIGHT:
                this.onNextEnemy();
                break;
            case KeyCode.ARROW_UP:
                this.onSpawnClicked();
                break;
            case KeyCode.ARROW_DOWN:
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
        }

        this._retryCount = 0;
        this.waitForDatabase();
    }

    private waitForDatabase() {
        const db = GameDatabase.instance;
        if (db && db.isReady && db.enemies.length > 0) {
            this._enemyIds = db.enemies.map(e => e.id);
            this._selectedIndex = 0;
            this.updateSelectedLabel();
            console.log(`[BehaviorTestController] Loaded ${this._enemyIds.length} enemies from GameDatabase.`);
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
        if (this._enemyIds.length === 0) {
            this.selectedEnemyLabel.string = "(no enemies)";
            return;
        }
        this.selectedEnemyLabel.string = `${this._selectedIndex + 1}/${this._enemyIds.length}: ${this._enemyIds[this._selectedIndex]}`;
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

    public onSpawnClicked() {
        if (!this.gameManager || this._enemyIds.length === 0) return;

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

    public onPlayerInvincibleToggled() {
        if (!this.playerController || !this.playerInvincibleToggle) return;
        this.playerController.invincible = this.playerInvincibleToggle.isChecked;
    }

    public onEnemyInvincibleToggled() {
        if (!this.gameManager || !this.gameManager.enemyLayer || !this.enemyInvincibleToggle) return;
        const invincible = this.enemyInvincibleToggle.isChecked;
        for (const child of this.gameManager.enemyLayer.children) {
            const enemyComp = child.getComponent(Enemy);
            if (enemyComp) enemyComp.invincible = invincible;
        }
    }
}
