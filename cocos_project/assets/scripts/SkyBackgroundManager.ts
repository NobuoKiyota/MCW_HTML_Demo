import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, resources } from 'cc';
import { GAME_SETTINGS } from './Constants';

const { ccclass, property } = _decorator;

interface SkyTileEntry {
    node: Node;
}

/**
 * Ingame画面の最背面(最下層)に常駐し、sky01.png(800x4320)をゆっくり縦リールループスクロールさせる専用マネージャ。
 * 動画背景(ScrollingBackgroundManager)や雲(CloudManager)の下に敷くベース背景として動作する。
 */
@ccclass('SkyBackgroundManager')
export class SkyBackgroundManager extends Component {

    public static instance: SkyBackgroundManager = null;

    @property({ tooltip: "スクロール速度(px/秒)。プラス値で下方向(前進感)へスクロール" })
    public scrollSpeedPxPerSec: number = 30;

    @property({ tooltip: "不透明度 (0〜255)" })
    public opacity: number = 255;

    private _parent: Node | null = null;
    private _layer: number = 0;
    private _groupNode: Node | null = null;
    private _groupOpacity: UIOpacity | null = null;
    private _tiles: SkyTileEntry[] = [];
    private _tileScreenHeight: number = 0;
    private _resourcePath: string = "Materials/sky01";

    onLoad() {
        SkyBackgroundManager.instance = this;
    }

    /**
     * GameManager.resolveInGameReferences() からミッション開始時に呼ぶ。
     * @param parent タイルNodeの親(wrapper2等のCanvasラッパー)
     * @param layer タイルNodeに設定するレイヤー(BG_ONLY_LAYER想定)
     * @param resourcePath resources.load用パス(省略時は "Materials/sky01")
     */
    public setup(parent: Node, layer: number, resourcePath: string = "Materials/sky01") {
        this.clearAll();
        this._parent = parent;
        this._layer = layer;
        this._resourcePath = resourcePath;

        this._groupNode = new Node("SkyBGGroup");
        parent.addChild(this._groupNode);
        // 最背面に配置(動画や雲より奥)
        this._groupNode.setSiblingIndex(0);
        this._groupNode.layer = layer;
        this._groupNode.setPosition(0, 0, 0);

        this._groupOpacity = this._groupNode.addComponent(UIOpacity);
        this._groupOpacity.opacity = this.opacity;

        this.loadAndBuildTiles();
    }

    /**
     * GameManagerEditorなどの設定値から毎フレーム速度・不透明度を反映する。
     */
    public applyTunables(scrollSpeedPxPerSec: number, opacity: number) {
        this.scrollSpeedPxPerSec = scrollSpeedPxPerSec;
        this.opacity = opacity;
        if (this._groupOpacity && this._groupOpacity.isValid) {
            this._groupOpacity.opacity = opacity;
        }
    }

    private loadAndBuildTiles() {
        const tryBuild = (frame: SpriteFrame) => {
            if (!this._groupNode || !this._groupNode.isValid || !frame) return;

            const srcW = frame.originalSize?.width || frame.rect?.width || 800;
            const srcH = frame.originalSize?.height || frame.rect?.height || 4320;
            if (srcW <= 0 || srcH <= 0) return;

            const canvasWidth = GAME_SETTINGS.CANVAS_WIDTH;
            const canvasHeight = GAME_SETTINGS.CANVAS_HEIGHT;

            // 画面幅いっぱいにフィットさせ、縦横比を維持
            const scale = canvasWidth / srcW;
            const tileScreenHeight = srcH * scale;
            this._tileScreenHeight = tileScreenHeight;

            // 画面を隙間なくカバーするのに必要なタイル枚数(最低2枚)
            const tileCount = Math.max(2, Math.ceil(canvasHeight / tileScreenHeight) + 1);
            const startY = (tileCount - 1) / 2 * tileScreenHeight;

            for (let i = 0; i < tileCount; i++) {
                const node = new Node(`SkyTile_${i}`);
                this._groupNode.addChild(node);
                node.layer = this._layer;

                const trans = node.addComponent(UITransform);
                trans.setContentSize(canvasWidth, tileScreenHeight);

                const sprite = node.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.type = Sprite.Type.SIMPLE;
                sprite.spriteFrame = frame;

                node.setPosition(0, startY - i * tileScreenHeight, 0);
                this._tiles.push({ node });
            }

            console.log(`[SkyBackgroundManager] Sky tiles initialized successfully (${tileCount} tiles, height=${tileScreenHeight.toFixed(1)}px, scale=${scale.toFixed(2)}).`);
        };

        // 1. Cocos 3.x 規約の /spriteFrame サブアセットパスで試行
        const spriteFramePath = this._resourcePath.endsWith("/spriteFrame") ? this._resourcePath : `${this._resourcePath}/spriteFrame`;
        resources.load(spriteFramePath, SpriteFrame, (err, frame: SpriteFrame) => {
            if (!err && frame) {
                tryBuild(frame);
                return;
            }

            // 2. 直指定(SpriteFrame)でフォールバック試行
            resources.load(this._resourcePath, SpriteFrame, (err2, frame2: SpriteFrame) => {
                if (!err2 && frame2) {
                    tryBuild(frame2);
                    return;
                }

                // 3. ImageAsset から動的生成フォールバック
                resources.load(this._resourcePath, (err3, imgAsset: any) => {
                    if (!err3 && imgAsset) {
                        const sf = SpriteFrame.createWithImage(imgAsset);
                        if (sf) {
                            tryBuild(sf);
                            return;
                        }
                    }
                    console.error(`[SkyBackgroundManager] Failed to load sky asset from ${this._resourcePath}:`, err, err2, err3);
                });
            });
        });
    }

    update(dt: number) {
        if (this._tiles.length === 0 || this._tileScreenHeight <= 0) return;

        const dy = this.scrollSpeedPxPerSec * dt;
        if (dy === 0) return;

        let topY = -Infinity;
        for (const tile of this._tiles) {
            if (!tile.node.isValid) continue;
            topY = Math.max(topY, tile.node.position.y);
        }

        const wrapMargin = GAME_SETTINGS.CANVAS_HEIGHT / 2 + this._tileScreenHeight / 2;
        for (const tile of this._tiles) {
            if (!tile.node.isValid) continue;
            const newY = tile.node.position.y - dy;
            tile.node.setPosition(tile.node.position.x, newY, 0);

            // 画面下端を抜けたら最上段タイルのさらに上へラップ再配置
            if (newY < -wrapMargin) {
                topY += this._tileScreenHeight;
                tile.node.setPosition(tile.node.position.x, topY, 0);
            }
        }
    }

    public clearAll() {
        if (this._groupNode && this._groupNode.isValid) {
            this._groupNode.destroy();
        }
        this._groupNode = null;
        this._groupOpacity = null;
        this._tiles = [];
        this._tileScreenHeight = 0;
    }

    onDestroy() {
        this.clearAll();
        if (SkyBackgroundManager.instance === this) {
            SkyBackgroundManager.instance = null;
        }
    }
}
