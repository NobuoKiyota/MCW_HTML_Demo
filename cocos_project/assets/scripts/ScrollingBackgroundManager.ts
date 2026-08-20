import { _decorator, Component, Node, Sprite, SpriteFrame, Texture2D, ImageAsset, UITransform, UIOpacity, resources, VideoClip, Layers } from 'cc';
import { GAME_SETTINGS } from './Constants';
import { BackgroundThemeManager } from './BackgroundThemeManager';

const { ccclass } = _decorator;

interface TileEntry {
    node: Node;
}

/**
 * Ingame背景を「PNG/MP4いずれかの素材を90度(等)回転させた縦長タイルとして縦に連結し、
 * 隙間なくスクロールさせる」形で描画するマネージャ。CloudManager.tsと同じ
 * static instanceシングルトン+setup()/update()パターンを踏襲する。
 *
 * フルスクリーン1枚のVideoBackground.tsとは別物(Ingame専用、置き換え)。Home画面は
 * 引き続きVideoBackground.tsを使うため無関係。
 *
 * MP4の場合、HTMLVideoElementのデコードは1系統だけ用意し、そこから焼き込んだ1枚の
 * SpriteFrame(=Texture2D)を全タイルのSpriteで共有する - デコードコストはタイル枚数に
 * 依存しない(VideoBackground.tsのoffscreen canvas焼き込み手法をそのまま流用)。
 */
@ccclass('ScrollingBackgroundManager')
export class ScrollingBackgroundManager extends Component {

    public static instance: ScrollingBackgroundManager = null;

    private _parent: Node | null = null;
    private _layer: number = 0;
    private _groupNode: Node | null = null;
    private _groupOpacity: UIOpacity | null = null;
    private _tiles: TileEntry[] = [];
    private _tileScreenHeight: number = 0;
    private _scrollSpeed: number = 0;

    // --- MP4ソース用(PNGの場合は使わない) ---
    private _isVideo: boolean = false;
    private _videoElement: HTMLVideoElement | null = null;
    private _videoFrameCanvas: HTMLCanvasElement | null = null;
    private _videoFrameCtx: CanvasRenderingContext2D | null = null;
    private _videoTexture: Texture2D | null = null;

    onLoad() {
        ScrollingBackgroundManager.instance = this;
    }

    /**
     * ミッションごとにGameManager.resolveInGameReferences()から呼ぶ。BackgroundThemeManagerの
     * プールからPNG/MP4いずれか1本をランダムに選び、rotationDegで指定した角度に回転したタイルを
     * 画面幅いっぱい・縦に隙間なく並べる。回転角度はここでタイル形状を決めるため、setup()以降に
     * 変えても再タイル化はされない(mid-mission変更非対応、要件通り)。
     * @param parent タイルNodeの親(wrapper2等、他の背景要素と同じCanvasラッパー)
     * @param layer タイルNodeに設定するレイヤー(BG_ONLY_LAYER想定)
     * @param rotationDeg タイルの回転角度(0/90/180/270想定、0で無回転)
     */
    public setup(parent: Node, layer: number, rotationDeg: number) {
        this.clearAll();
        this._parent = parent;
        this._layer = layer;

        this._groupNode = new Node("ScrollingBGGroup");
        parent.addChild(this._groupNode);
        this._groupNode.layer = layer;
        this._groupNode.setPosition(0, 0, 0);
        this._groupOpacity = this._groupNode.addComponent(UIOpacity);

        const pick = BackgroundThemeManager.instance
            ? BackgroundThemeManager.instance.getRandomBackgroundPattern()
            : { path: "Movies/BGV_Ingame001_Galaxy_Base", isVideo: true };

        this._isVideo = pick.isVideo;
        if (pick.isVideo) {
            this.setupVideoSource(pick.path, rotationDeg);
        } else {
            this.setupImageSource(pick.path, rotationDeg);
        }
    }

    // 毎フレームGameManager.update()から呼ぶ。scrollSpeedPxPerSec/opacityはGameManagerEditorの
    // 値を毎フレーム反映する(ズーム/色相サイクル演出updateVideoBGColorEffect()と同じ理由 - 非同期
    // 読み込みのGameManagerConfig.jsonが後から更新されても次のフレームから自然に追従するため)。
    public applyTunables(scrollSpeedPxPerSec: number, opacity: number) {
        this._scrollSpeed = scrollSpeedPxPerSec;
        if (this._groupOpacity) this._groupOpacity.opacity = opacity;
    }

    update(dt: number) {
        if (this._isVideo) this.updateVideoFrame();
        if (this._tiles.length === 0 || this._tileScreenHeight <= 0) return;

        const dy = this._scrollSpeed * dt;
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
            if (newY < -wrapMargin) {
                // 下に抜けたタイルを、現在の最上段のさらに上へ再配置する(コンベアベルト、
                // CloudManager.tsのラップ処理と同じ考え方)。
                topY += this._tileScreenHeight;
                tile.node.setPosition(tile.node.position.x, topY, 0);
            }
        }
    }

    private setupImageSource(path: string, rotationDeg: number) {
        resources.load(path, SpriteFrame, (err, frame: SpriteFrame) => {
            if (err || !frame || !this._groupNode || !this._groupNode.isValid) {
                console.error(`[ScrollingBackgroundManager] Failed to load image ${path}:`, err);
                return;
            }
            const srcW = frame.originalSize.width;
            const srcH = frame.originalSize.height;
            this.buildTiles(frame, srcW, srcH, rotationDeg);
        });
    }

    private setupVideoSource(path: string, rotationDeg: number) {
        if (typeof document === 'undefined') return;

        const video = document.createElement('video');
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.style.position = 'absolute';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';
        document.body.appendChild(video);
        video.onerror = (e) => console.error(`[ScrollingBackgroundManager] video error:`, e, video.error);
        this._videoElement = video;

        resources.load(path, VideoClip, (err, clip: VideoClip) => {
            if (err || !clip) {
                console.error(`[ScrollingBackgroundManager] Failed to load video ${path}:`, err);
                return;
            }
            const videoUrl = clip.nativeUrl || (clip as any)._nativeAsset;
            if (!videoUrl) return;
            video.src = videoUrl;

            const onReady = () => {
                if (!this._groupNode || !this._groupNode.isValid) return;
                const srcW = video.videoWidth;
                const srcH = video.videoHeight;
                if (srcW === 0 || srcH === 0) return;

                this._videoFrameCanvas = document.createElement('canvas');
                this._videoFrameCanvas.width = srcW;
                this._videoFrameCanvas.height = srcH;
                this._videoFrameCtx = this._videoFrameCanvas.getContext('2d');

                this._videoTexture = new Texture2D();
                this._videoTexture.image = new ImageAsset(this._videoFrameCanvas);
                const sharedFrame = new SpriteFrame();
                sharedFrame.texture = this._videoTexture;

                this.buildTiles(sharedFrame, srcW, srcH, rotationDeg);
                video.play().catch(e => console.error(`[ScrollingBackgroundManager] video.play() failed:`, e));
            };

            if (video.readyState >= 1) onReady();
            else video.addEventListener('loadedmetadata', onReady, { once: true });
        });
    }

    // MP4ソースの場合、毎フレームHTMLVideoElementの現在フレームをoffscreen canvasへ焼き込み、
    // 共有Texture2Dへアップロードする(VideoBackground.updateFrame()と同じ手法)。全タイルの
    // Spriteは同じSpriteFrame(=同じTexture2D)を参照しているため、この1回のアップロードだけで
    // 全タイルに反映される。
    private updateVideoFrame() {
        const video = this._videoElement;
        if (!video || !this._videoFrameCtx || !this._videoTexture || video.readyState < 2) return;
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        try {
            this._videoFrameCtx.drawImage(video, 0, 0, this._videoFrameCanvas.width, this._videoFrameCanvas.height);
            this._videoTexture.uploadData(this._videoFrameCanvas);
        } catch (e) {
            console.error("[ScrollingBackgroundManager] Video texture upload exception:", e);
        }
    }

    // srcW/srcH(元画像/動画の実ピクセルサイズ)とrotationDegから、画面幅いっぱいに収まる
    // タイル1枚分のサイズを算出し、画面高さ+1枚をカバーする枚数だけSpriteノードを生成して
    // 縦に隙間なく並べる。90/270度回転時は見た目の横幅が元の「高さ」基準になる点に注意。
    private buildTiles(frame: SpriteFrame, srcW: number, srcH: number, rotationDeg: number) {
        if (!this._groupNode || !this._groupNode.isValid || srcW <= 0 || srcH <= 0) return;

        const normalizedRot = ((rotationDeg % 360) + 360) % 360;
        const isSideways = normalizedRot === 90 || normalizedRot === 270;

        const canvasWidth = GAME_SETTINGS.CANVAS_WIDTH;
        const canvasHeight = GAME_SETTINGS.CANVAS_HEIGHT;
        const scale = isSideways ? canvasWidth / srcH : canvasWidth / srcW;
        const tileScreenHeight = (isSideways ? srcW : srcH) * scale;
        if (tileScreenHeight <= 0) return;
        this._tileScreenHeight = tileScreenHeight;

        const tileCount = Math.max(2, Math.ceil(canvasHeight / tileScreenHeight) + 1);
        const startY = (tileCount - 1) / 2 * tileScreenHeight;

        for (let i = 0; i < tileCount; i++) {
            const node = new Node(`ScrollingBGTile${i}`);
            this._groupNode.addChild(node);
            node.layer = this._layer;
            node.angle = normalizedRot;

            const trans = node.addComponent(UITransform);
            trans.setContentSize(srcW * scale, srcH * scale);

            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.spriteFrame = frame;

            node.setPosition(0, startY - i * tileScreenHeight, 0);
            this._tiles.push({ node });
        }
    }

    private clearAll() {
        if (this._videoElement) {
            this._videoElement.pause();
            this._videoElement.remove();
            this._videoElement = null;
        }
        if (this._groupNode && this._groupNode.isValid) {
            this._groupNode.destroy();
        }
        this._groupNode = null;
        this._groupOpacity = null;
        this._tiles = [];
        this._tileScreenHeight = 0;
        this._videoFrameCanvas = null;
        this._videoFrameCtx = null;
        this._videoTexture = null;
        this._isVideo = false;
    }

    onDestroy() {
        this.clearAll();
        if (ScrollingBackgroundManager.instance === this) ScrollingBackgroundManager.instance = null;
    }
}
