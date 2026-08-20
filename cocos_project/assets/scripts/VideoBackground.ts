import { Node, UITransform, Size, Sprite, SpriteFrame, Texture2D, ImageAsset, Layers, resources, VideoClip, UIOpacity, tween, Tween } from 'cc';

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
    private bgOpacity: UIOpacity | null = null;
    private videoFrameCanvas: HTMLCanvasElement | null = null;
    private videoFrameCtx: CanvasRenderingContext2D | null = null;

    // enableAutoShuffle()で有効化するIngame専用の自動切り替え(要件: 「前後に1秒のフェード、
    // ミッション中にシャッフルで動画を切り替える」)。無効時(Home画面等)は従来通りvideo.loop=trueの
    // 単純な無限ループのままで、opacityは常に255固定(見た目・挙動を一切変えない)。
    private shuffleEnabled: boolean = false;
    private cycleDurationSec: number = 30;
    private fadeDurationSec: number = 3;
    private waitDurationSec: number = 2;
    private pickNextPath: ((currentResourcePath: string) => string) | null = null;
    private currentResourcePath: string = "";

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
        this.bgOpacity = spriteBGNode.getComponent(UIOpacity) || spriteBGNode.addComponent(UIOpacity);

        this.currentResourcePath = resourcePath;

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

        video.onerror = (e) => {
            console.error(`[VideoBackground] video error:`, e, video.error);
        };

        this.videoElement = video;
        this.loadAndPlay(resourcePath, () => {
            if (this.shuffleEnabled) {
                if (this.bgOpacity) this.bgOpacity.opacity = 0;
                this.beginFadeCycle();
            }
        });
    }

    /**
     * VideoClipをロードして再生開始する(setup()の初回、およびシャッフルでの差し替え時の両方から使う
     * 共通ヘルパー)。loadedmetadata(video.duration取得可能になるタイミング)を待ってからonReadyを
     * 呼ぶ - beginFadeCycle()がフェードアウト開始タイミングをvideo.durationから逆算するため、
     * durationが未確定のまま呼んでしまうとフォールバック値頼みになってしまう。
     */
    private loadAndPlay(resourcePath: string, onReady?: () => void) {
        resources.load(resourcePath, VideoClip, (err, clip: VideoClip) => {
            if (err || !clip) {
                console.error(`[VideoBackground] Failed to load ${resourcePath} VideoClip:`, err);
                return;
            }
            const video = this.videoElement;
            if (!video) return;

            const videoUrl = clip.nativeUrl || (clip as any)._nativeAsset;
            console.log(`[VideoBackground] ${resourcePath} VideoClip loaded! URL:`, videoUrl);
            if (!videoUrl) return;

            const startPlayback = () => {
                video.currentTime = 0;
                video.play().catch(e => console.error(`[VideoBackground] ${resourcePath} video.play() failed:`, e));
                if (onReady) onReady();
            };

            video.src = videoUrl;
            if (video.readyState >= 1) {
                // 既に(別クリップ再生中に)メタデータ読み込み済みの状態からのsrc差し替えでは
                // loadedmetadataが発火しないことがあるため、readyStateを直接見て判定する。
                startPlayback();
            } else {
                video.addEventListener('loadedmetadata', startPlayback, { once: true });
            }
        });
    }

    /**
     * Ingame専用: 動画をフェードイン→再生→フェードアウト→(シャッフト先の読み込み待ち)→次の動画、
     * を無限に繰り返す自動切り替えを有効化する。setup()の直後・同期的に呼ぶこと
     * (setup()内のVideoClipロードは非同期なので、その完了より前にこのフラグを立てておく必要がある)。
     * @param cycleDurationSec 1クリップあたりの表示サイクル総時間(秒、フェードイン+ホールド+フェードアウト
     *                          の合計)。実ファイルの尺(video.duration)より長い場合はvideo.loop=trueで
     *                          内部ループさせて埋める(逆に短ければフェードアウトで途中カットされる)。
     * @param fadeDurationSec 各クリップの先頭/末尾のフェード時間(秒)
     * @param waitDurationSec フェードアウト後、次のクリップへ切り替わるまでの待機時間(秒、この間は非表示)
     * @param pickNextPath 現在の再生パスを受け取り、次に再生するresources.loadパスを返す関数
     *                      (BackgroundThemeManager.getRandomVideoPattern()等、呼び出し元が用意する)
     */
    enableAutoShuffle(cycleDurationSec: number, fadeDurationSec: number, waitDurationSec: number, pickNextPath: (currentResourcePath: string) => string) {
        this.shuffleEnabled = true;
        this.cycleDurationSec = Math.max(0.1, cycleDurationSec);
        this.fadeDurationSec = Math.max(0.05, fadeDurationSec);
        this.waitDurationSec = Math.max(0, waitDurationSec);
        this.pickNextPath = pickNextPath;
        // video.loop はsetup()側の既定でtrueのまま(cycleDurationSecが実尺より長くても内部ループで
        // 埋められるようにする)。クリップの切り替え自体はloadAndPlay()でsrcを差し替えて行う。

        // setup()の非同期ロードが既に完了して再生が始まっている状態でこのメソッドが呼ばれた場合
        // (呼び出し順序を守っていれば通常起こらないが念のため)、ここからサイクルを開始する。
        if (this.bgOpacity && this.videoElement && this.videoElement.readyState >= 1) {
            this.bgOpacity.opacity = 0;
            this.beginFadeCycle();
        }
    }

    // 現在再生中のクリップに対して、フェードイン→ホールド→フェードアウトの1サイクル分をtweenで組む。
    // タイミングはcycleDurationSec(設定値)から算出する - video.durationを見なくなったため、
    // 実ファイルの尺(仮に10秒固定でなくなっても)や内部ループの有無に関わらず一定間隔で動く。
    private beginFadeCycle() {
        const video = this.videoElement;
        const opacity = this.bgOpacity;
        if (!video || !opacity || !this.shuffleEnabled) return;

        const fade = Math.min(this.fadeDurationSec, this.cycleDurationSec / 2);
        const hold = Math.max(0, this.cycleDurationSec - fade * 2);

        tween(opacity)
            .set({ opacity: 0 })
            .to(fade, { opacity: 255 })
            .delay(hold)
            .to(fade, { opacity: 0 })
            .call(() => this.onFadeCycleEnd())
            .start();
    }

    // フェードアウト完了(=画面上は不透明度0で見えない状態)直後に呼ばれる。次のクリップを選び、
    // waitDurationSec待ってから読み込み+再生開始し、beginFadeCycle()で次のサイクルへ繋げる。
    private onFadeCycleEnd() {
        if (!this.shuffleEnabled || !this.pickNextPath || !this.bgOpacity) return;

        const nextPath = this.pickNextPath(this.currentResourcePath);
        this.currentResourcePath = nextPath;

        tween(this.bgOpacity)
            .delay(this.waitDurationSec)
            .call(() => {
                this.loadAndPlay(nextPath, () => this.beginFadeCycle());
            })
            .start();
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
        if (this.bgOpacity) {
            Tween.stopAllByTarget(this.bgOpacity);
        }
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
        this.bgOpacity = null;
        this.videoFrameCanvas = null;
        this.videoFrameCtx = null;
        this.hostNode = null;
        this.shuffleEnabled = false;
        this.pickNextPath = null;
    }
}
