import { Node, UITransform, Size, Sprite, SpriteFrame, Texture2D, ImageAsset, Layers, resources, VideoClip } from 'cc';

/**
 * HTMLVideoElement の再生フレームを 2D Sprite テクスチャとして画面最背面に描画するヘルパー。
 *
 * Cocos の VideoPlayer コンポーネントは Web 環境では実 DOM の <video> タグを Canvas の上に
 * CSS オーバーレイ表示する実装のため、シーングラフ上のsiblingIndexに関わらず常にUIより手前に
 * 出てしまう。またそのまま HTMLVideoElement を ImageAsset に渡してもCocosは
 * HTMLCanvasElement/HTMLImageElement/ImageBitmap しかネイティブ画像ソースとして認識しないため
 * 無効な(0サイズの)テクスチャになる。そのため毎フレーム一旦 offscreen canvas に焼き込んでから
 * Texture2D に渡している。
 */
export class VideoBackground {
    private hostNode: Node | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private videoTexture: Texture2D | null = null;
    private bgSpriteFrame: SpriteFrame | null = null;
    private bgSprite: Sprite | null = null;
    private videoFrameCanvas: HTMLCanvasElement | null = null;
    private videoFrameCtx: CanvasRenderingContext2D | null = null;

    /** setup()後、呼び出し元が背景スプライトのNode/Componentに追加演出(tween等)を掛けるための参照。 */
    get spriteNode(): Node | null {
        return this.bgSprite ? this.bgSprite.node : null;
    }

    get sprite(): Sprite | null {
        return this.bgSprite;
    }

    /**
     * @param parentNode スプライトノードをこの直下の最背面(siblingIndex 0)に生成する。
     *                    画面全体の背後に敷きたい場合は各screenプレハブのルートノードを渡すこと
     *                    （スクリプトが付いているノード自身の親とは限らないので、呼び出し元で解決して渡す）
     * @param spriteNodeName parentNode直下に生成するスプライトノード名（画面ごとに一意にすること）
     * @param resourcePath resources.load に渡す VideoClip のパス（例: 'Movies/BGV_Home'）
     * @param staticBGNode 置き換える既存の静止画背景ノードがあれば渡す（非表示にする。任意）
     * @param layer スプライトノードに設定するレイヤー（省略時はUI_2D）。3D表示があるIngame画面等、
     *               専用のBackgroundCameraで描画したい場合はそのレイヤービットを渡す。
     */
    setup(parentNode: Node, spriteNodeName: string, resourcePath: string, staticBGNode?: Node | null, layer: number = Layers.Enum.UI_2D) {
        this.hostNode = parentNode;

        if (staticBGNode) {
            staticBGNode.active = false;
        }

        let spriteBGNode = parentNode.getChildByName(spriteNodeName);
        if (!spriteBGNode) {
            spriteBGNode = new Node(spriteNodeName);
            parentNode.addChild(spriteBGNode);
        }
        spriteBGNode.setSiblingIndex(0); // Canvasの最背面に配置
        spriteBGNode.layer = layer;

        const uiTransform = spriteBGNode.getComponent(UITransform) || spriteBGNode.addComponent(UITransform);
        const canvasTransform = parentNode.getComponent(UITransform);
        const bgSize = canvasTransform ? new Size(canvasTransform.contentSize.width, canvasTransform.contentSize.height) : new Size(1920, 1080);
        uiTransform.setContentSize(bgSize);

        this.bgSprite = spriteBGNode.getComponent(Sprite) || spriteBGNode.addComponent(Sprite);
        this.bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        if (typeof document === 'undefined' || this.videoElement) {
            return;
        }

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

        video.onloadeddata = () => {
            console.log(`[VideoBackground] ${resourcePath} loaded data. ReadyState:`, video.readyState);
        };
        video.onerror = (e) => {
            console.error(`[VideoBackground] ${resourcePath} video error:`, e, video.error);
        };

        resources.load(resourcePath, VideoClip, (err, clip: VideoClip) => {
            if (err || !clip) {
                console.error(`[VideoBackground] Failed to load ${resourcePath} VideoClip:`, err);
                return;
            }

            const videoUrl = clip.nativeUrl || (clip as any)._nativeAsset;
            console.log(`[VideoBackground] ${resourcePath} VideoClip loaded! URL:`, videoUrl);

            if (videoUrl) {
                video.src = videoUrl;
                video.play().catch(e => console.error(`[VideoBackground] ${resourcePath} video.play() failed:`, e));
            }
        });

        this.videoElement = video;
    }

    /** 呼び出し元コンポーネントの update() から毎フレーム呼ぶこと */
    updateFrame() {
        const video = this.videoElement;
        if (!video || !this.bgSprite || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
            return;
        }

        try {
            if (!this.videoFrameCanvas) {
                this.videoFrameCanvas = document.createElement('canvas');
                this.videoFrameCanvas.width = video.videoWidth;
                this.videoFrameCanvas.height = video.videoHeight;
                this.videoFrameCtx = this.videoFrameCanvas.getContext('2d');
            }
            this.videoFrameCtx.drawImage(video, 0, 0, this.videoFrameCanvas.width, this.videoFrameCanvas.height);

            if (!this.videoTexture) {
                this.videoTexture = new Texture2D();
                const imgAsset = new ImageAsset(this.videoFrameCanvas);
                this.videoTexture.image = imgAsset;

                this.bgSpriteFrame = new SpriteFrame();
                this.bgSpriteFrame.texture = this.videoTexture;
                this.bgSprite.spriteFrame = this.bgSpriteFrame;
                console.log("[VideoBackground] Video texture bound to 2D Sprite successfully!", video.videoWidth, "x", video.videoHeight);
            } else {
                this.videoTexture.uploadData(this.videoFrameCanvas);
            }
        } catch (e) {
            console.error("[VideoBackground] Video texture upload exception:", e);
        }
    }

    /** 呼び出し元コンポーネントの onDestroy() から呼ぶこと */
    destroy() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.remove();
            this.videoElement = null;
        }
        // スプライトノードは Canvas 直下（呼び出し元の画面ノードの兄弟）に生成されるため、
        // 画面切り替え時に呼び出し元ノードが破棄されても自動では消えない。ここで明示的に破棄する。
        if (this.bgSprite && this.bgSprite.node && this.bgSprite.node.isValid) {
            this.bgSprite.node.destroy();
        }
        this.videoTexture = null;
        this.bgSpriteFrame = null;
        this.bgSprite = null;
        this.videoFrameCanvas = null;
        this.videoFrameCtx = null;
        this.hostNode = null;
    }
}
