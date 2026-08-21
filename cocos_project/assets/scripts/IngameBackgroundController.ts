import { _decorator, Component, Node, Layers } from 'cc';
import { SkyBackgroundManager } from './SkyBackgroundManager';
import { ScrollingBackgroundManager } from './ScrollingBackgroundManager';
import { StarField } from './StarField';
import { CloudManager } from './CloudManager';
import { GameSpeedManager } from './GameSpeedManager';
import { BG_ONLY_LAYER, FG_CLOUD_LAYER } from './Constants';

const { ccclass, property } = _decorator;

/**
 * Ingame背景全体(スカイ・動画タイル・星フィールド・遠景雲・前景雲)を一括統括する総合コントローラー。
 * Prefab(StageBackground)またはスクリプトから生成され、各サブレイヤーのセットアップ、
 * 速度連動、パラメータ同期、バースト演出を集中制御する。
 */
@ccclass('IngameBackgroundController')
export class IngameBackgroundController extends Component {

    public static instance: IngameBackgroundController = null;

    // --- 各サブレイヤーコンポーネント (Prefab等で事前にアタッチされている場合はInspectorでバインド可能) ---
    @property({ type: SkyBackgroundManager, tooltip: "最背面スカイ背景マネージャ" })
    public skyManager: SkyBackgroundManager = null;

    @property({ type: ScrollingBackgroundManager, tooltip: "動画/テクスチャタイル背景マネージャ" })
    public scrollingManager: ScrollingBackgroundManager = null;

    @property({ type: StarField, tooltip: "星パーティクル演出" })
    public starField: StarField = null;

    @property({ type: CloudManager, tooltip: "雲マネージャ" })
    public cloudManager: CloudManager = null;

    // --- レイヤーごとの有効/無効フラグ ---
    @property({ tooltip: "最背面スカイ背景を有効にするか" })
    public enableSky: boolean = true;

    @property({ tooltip: "動画/タイル背景を有効にするか" })
    public enableScrollingBG: boolean = true;

    @property({ tooltip: "星パーティクルを有効にするか" })
    public enableStarField: boolean = true;

    @property({ tooltip: "雲演出を有効にするか" })
    public enableClouds: boolean = true;

    // --- 各レイヤーのパラメータ ---
    @property({ tooltip: "スカイ背景のスクロール速度(px/秒)" })
    public skyScrollSpeed: number = 30;

    @property({ tooltip: "スカイ背景の不透明度(0-255)" })
    public skyOpacity: number = 255;

    @property({ tooltip: "動画/タイル背景のスクロール速度(px/秒)" })
    public videoScrollSpeed: number = 60;

    @property({ tooltip: "動画/タイル背景の不透明度(0-255)" })
    public videoOpacity: number = 255;

    @property({ tooltip: "動画/タイル背景の回転角度(度)" })
    public videoRotationDeg: number = 90;

    private _parent: Node | null = null;
    private _speedManager: GameSpeedManager | null = null;

    onLoad() {
        IngameBackgroundController.instance = this;
    }

    /**
     * GameManager.resolveInGameReferences() やテストシーンから呼ぶ初期化メソッド。
     * 必要なサブマネージャが存在しない場合は自動的に子ノードとして動的生成する。
     * @param parent 背景全体の親ノード(Canvasラッパー、wrapper2想定)
     * @param speedManager 自機速度管理用マネージャ(省略時はGameManagerから取得)
     */
    public setup(parent: Node, speedManager?: GameSpeedManager) {
        this.clearAll();
        this._parent = parent;
        this._speedManager = speedManager || null;

        // 1. 最背面スカイ背景 (SkyBackgroundManager)
        if (this.enableSky) {
            let skyNode = this.node.getChildByName("SkyLayer");
            if (!skyNode) {
                skyNode = new Node("SkyLayer");
                this.node.addChild(skyNode);
            }
            skyNode.setSiblingIndex(0);
            this.skyManager = skyNode.getComponent(SkyBackgroundManager) || skyNode.addComponent(SkyBackgroundManager);
            this.skyManager.setup(parent, BG_ONLY_LAYER, "Materials/sky01");
            this.skyManager.applyTunables(this.skyScrollSpeed, this.skyOpacity);
        }

        // 2. 動画/テクスチャタイル背景 (ScrollingBackgroundManager)
        if (this.enableScrollingBG) {
            let scrollNode = this.node.getChildByName("ScrollingLayer");
            if (!scrollNode) {
                scrollNode = new Node("ScrollingLayer");
                this.node.addChild(scrollNode);
            }
            this.scrollingManager = scrollNode.getComponent(ScrollingBackgroundManager) || scrollNode.addComponent(ScrollingBackgroundManager);
            this.scrollingManager.setup(parent, BG_ONLY_LAYER, this.videoRotationDeg);
            this.scrollingManager.applyTunables(this.videoScrollSpeed, this.videoOpacity);
        }

        // 3. 星パーティクル演出 (StarField)
        if (this.enableStarField) {
            let starNode = this.node.getChildByName("StarFieldLayer");
            if (!starNode) {
                // 既存のStarFieldノードがあれば優先して探索
                const existingStar = parent.getChildByName("StarField") || parent.getChildByName("StarFieldLayer");
                if (existingStar) {
                    starNode = existingStar;
                } else {
                    starNode = new Node("StarFieldLayer");
                    parent.addChild(starNode);
                }
            }
            starNode.layer = BG_ONLY_LAYER;
            this.starField = starNode.getComponent(StarField) || starNode.addComponent(StarField);
            if (this._speedManager) {
                this.starField.setSpeedManager(this._speedManager);
            }
        }

        // 4. 雲演出 (CloudManager: 奥=BG_ONLY_LAYER, 手前=FG_CLOUD_LAYER)
        if (this.enableClouds) {
            let cloudNode = this.node.getChildByName("CloudLayer");
            if (!cloudNode) {
                cloudNode = new Node("CloudLayer");
                this.node.addChild(cloudNode);
            }
            this.cloudManager = cloudNode.getComponent(CloudManager) || cloudNode.addComponent(CloudManager);
            this.cloudManager.setup(parent, BG_ONLY_LAYER, FG_CLOUD_LAYER);
        }

        console.log("[IngameBackgroundController] Background system setup completed.");
    }

    /**
     * GameManager.update() またはプレビューUIから毎フレーム呼ばれるパラメータ同期。
     */
    public applyTunables(
        skySpeed: number = this.skyScrollSpeed,
        skyOpacity: number = this.skyOpacity,
        videoSpeed: number = this.videoScrollSpeed,
        videoOpacity: number = this.videoOpacity
    ) {
        this.skyScrollSpeed = skySpeed;
        this.skyOpacity = skyOpacity;
        this.videoScrollSpeed = videoSpeed;
        this.videoOpacity = videoOpacity;

        if (this.skyManager && this.skyManager.isValid && this.enableSky) {
            this.skyManager.applyTunables(skySpeed, skyOpacity);
        }
        if (this.scrollingManager && this.scrollingManager.isValid && this.enableScrollingBG) {
            this.scrollingManager.applyTunables(videoSpeed, videoOpacity);
        }
    }

    /**
     * 星の集中線バースト演出をトリガーする。
     */
    public triggerStarBurst(durationSec: number = 3.0, speedMultiplier: number = 3.0, emissionMultiplier: number = 2.5) {
        if (this.starField && this.starField.isValid && this.enableStarField) {
            this.starField.triggerBurst(durationSec, speedMultiplier, emissionMultiplier);
        }
    }

    /**
     * 手動で速度を設定する (プレビュー専用シーン用)。
     */
    public setManualSpeed(speed: number) {
        if (this.starField && this.starField.isValid) {
            this.starField.setManualSpeed(speed);
        }
    }

    public clearAll() {
        if (this.skyManager && this.skyManager.isValid) {
            this.skyManager.clearAll();
        }
        if (this.scrollingManager && this.scrollingManager.isValid) {
            // ScrollingBackgroundManager has clearAll internal
        }
        if (this.cloudManager && this.cloudManager.isValid) {
            // CloudManager has destroy handling
        }
    }

    onDestroy() {
        this.clearAll();
        if (IngameBackgroundController.instance === this) {
            IngameBackgroundController.instance = null;
        }
    }
}
