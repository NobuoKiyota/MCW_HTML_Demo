import { _decorator, Component, Enum } from 'cc';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

/**
 * MasterManagerで管理・調整するカテゴリタグ
 */
export enum MasterCategoryTag {
    Player = 0,
    Mission = 1,
    Enemy = 2,
    Sound = 3,
}
Enum(MasterCategoryTag);

/**
 * ゲーム全体の調整・管理を一元化する総合マネージャー
 */
@ccclass('MasterManager')
export class MasterManager extends Component {
    private static _instance: MasterManager | null = null;

    public static get instance(): MasterManager | null {
        return MasterManager._instance;
    }

    @property({
        type: MasterCategoryTag,
        tooltip: '調整対象のカテゴリタグを選択'
    })
    public activeTag: MasterCategoryTag = MasterCategoryTag.Player;

    // ==========================================
    // 1. Player 設定
    // ==========================================
    @property({ tooltip: 'プレイヤー最大HP' })
    public playerMaxHp: number = 100;

    @property({ tooltip: 'プレイヤー移動速度' })
    public playerMoveSpeed: number = 300;

    @property({ tooltip: 'プレイヤー攻撃力倍率' })
    public playerAttackMultiplier: number = 1.0;

    // ==========================================
    // 2. Mission 設定
    // ==========================================
    @property({ tooltip: 'ミッション目標距離' })
    public missionTargetDistance: number = 1000;

    @property({ tooltip: '敵生成間隔（秒）' })
    public enemySpawnInterval: number = 2.0;

    // ==========================================
    // 3. Enemy 設定
    // ==========================================
    @property({ tooltip: '敵HP倍率' })
    public enemyHpMultiplier: number = 1.0;

    @property({ tooltip: '敵移動速度倍率' })
    public enemySpeedMultiplier: number = 1.0;

    // ==========================================
    // 4. Sound 設定
    // ==========================================
    @property({ tooltip: 'BGM主音量 (0.0 ~ 1.0)' })
    public bgmVolume: number = 1.0;

    @property({ tooltip: 'SE主音量 (0.0 ~ 1.0)' })
    public seVolume: number = 1.0;

    onLoad() {
        if (MasterManager._instance && MasterManager._instance !== this) {
            if (this.node.name.includes("Dummy")) {
                MasterManager._instance = this;
            } else {
                this.destroy();
                return;
            }
        } else {
            MasterManager._instance = this;
        }
    }

    start() {
        this.applySettings();
    }

    /**
     * 設定パラメータを関連するマネージャーやコンポーネントに反映
     */
    public applySettings() {
        console.log(`[MasterManager] Active Tag: ${MasterCategoryTag[this.activeTag]} - Applying settings...`);

        // SoundManager への反映
        if (SoundManager.instance) {
            SoundManager.instance.setBgmVolume(this.bgmVolume);
            SoundManager.instance.setSeVolume(this.seVolume);
        }
    }

    /**
     * Cocos Creator Inspector でプロパティ値が更新された時の通知ハンドラ
     */
    onValidate() {
        this.applySettings();
    }
}
