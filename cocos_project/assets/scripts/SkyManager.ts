import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, UIOpacity, resources, JsonAsset, VideoClip, Texture2D, ImageAsset, ParticleSystem2D, Color, tween, Tween } from 'cc';
import { GAME_SETTINGS } from './Constants';
import { GameSpeedManager } from './GameSpeedManager';
import { BackgroundThemeManager } from './BackgroundThemeManager';

const { ccclass, property } = _decorator;

const CLOUD_ASPECT = 256 / 512;

interface CloudSpawnRange {
    layer: number;
    alphaMin: number;
    alphaMax: number;
    sizeMin: number;
    sizeMax: number;
    speedScaleMin: number;
    speedScaleMax: number;
    rotationMin: number;
    rotationMax: number;
}

interface ActiveCloud {
    node: Node;
    speedScale: number;
    halfHeight: number;
}

interface TileEntry {
    node: Node;
}

/**
 * Ingame背景の全要素(最背面スカイ・動画タイル・星フィールド・遠景雲・前景雲)を一元管理する統合マネージャ。
 * 旧CloudManager / SkyBackgroundManager / ScrollingBackgroundManager / IngameBackgroundController を完全統合。
 */
@ccclass('SkyManager')
export class SkyManager extends Component {

    public static instance: SkyManager = null;

    // ==========================================
    // 1. 最背面スカイ背景 (Sky01 / Seamless Vertical Loop)
    // ==========================================
    @property({ tooltip: "最背面スカイ背景を有効にするか" })
    public enableSky: boolean = true;
    @property({ tooltip: "スカイ背景をミッション開始時にランダム抽選するか" })
    public randomSky: boolean = true;
    @property({ tooltip: "スカイ背景の自動検知対象フォルダ(resources配下の相対パス)" })
    public skyFolder: string = "Materials/Sky";
    @property({ tooltip: "スカイ背景の画像パス(resources.load用、randomSky=false時使用)" })
    public skyResourcePath: string = "Materials/Sky/sky01";
    @property({ tooltip: "スカイ背景のティントカラー(HEX)" })
    public skyColor: string = "#FFFFFF";
    @property({ tooltip: "スカイ背景のスクロール速度(px/秒)" })
    public skyScrollSpeed: number = 30;
    @property({ tooltip: "スカイ背景の不透明度(0〜255)" })
    public skyOpacity: number = 255;
    @property({
        type: [String],
        tooltip: "MissionLv 1〜10の系統色(HEX文字列、index 0 = Lv1)。SkyConfig.jsonで一元管理される"
    })
    public lvColors: string[] = [
        "#85FF00", "#00FF8F", "#F7FF33", "#A911FF", "#A50000",
        "#00BBA5", "#0000BB", "#BB3400", "#86005B", "#002686"
    ];
    @property({
        type: [String],
        tooltip: "スカイ背景パターンプール(SkyConfig.jsonで一元管理される)"
    })
    public skyPatterns: string[] = [
        "Materials/Sky/sky01", "Materials/Sky/sky02", "Materials/Sky/sky03", "Materials/Sky/sky04", "Materials/Sky/sky05",
        "Materials/Sky/sky06", "Materials/Sky/sky07", "Materials/Sky/sky08", "Materials/Sky/sky09", "Materials/Sky/sky10"
    ];

    // ==========================================
    // 2. 動画/画像背景 (フェードイン→ホールド→フェードアウト→待機→再抽選、スクロールなし)
    // ==========================================
    @property({ tooltip: "動画/画像背景を有効にするか" })
    public enableVideo: boolean = true;
    @property({ tooltip: "動画/画像のY座標位置(px、0で画面中央)" })
    public videoPosY: number = 0;
    @property({ tooltip: "1クリップの表示サイクル総時間(秒、フェードイン+ホールド+フェードアウトの合計)" })
    public videoCycleDurationSec: number = 30;
    @property({ tooltip: "各クリップの先頭/末尾のフェード時間(秒)" })
    public videoFadeDurationSec: number = 3;
    @property({ tooltip: "フェードアウト後、次のクリップへ切り替わるまでの待機時間(秒)" })
    public videoWaitDurationSec: number = 2;
    @property({ tooltip: "動画/画像の最大不透明度(0〜255、フェードイン到達値)" })
    public videoOpacity: number = 255;
    @property({ tooltip: "動画/画像の回転角度(度)" })
    public videoRotationDeg: number = 0;
    @property({
        type: [String],
        tooltip: "背景動画パターンプール(SkyConfig.jsonで一元管理される)"
    })
    public videoPatterns: string[] = ["Movies/BGV_Ingame001_Galaxy_Base"];

    // ==========================================
    // 3. 星フィールド演出 (StarField / Particles)
    // ==========================================
    @property({ tooltip: "星パーティクル演出を有効にするか" })
    public enableStarField: boolean = true;
    @property({ tooltip: "速度に対する星スピード倍率" })
    public starSpeedScale: number = 50.0;
    @property({ tooltip: "速度に対する発生量倍率" })
    public starEmissionScale: number = 10.0;
    @property({ tooltip: "ベースの発生量" })
    public starBaseEmission: number = 5.0;

    // ==========================================
    // 4. 雲演出 (Clouds / Far & Near Layers)
    // ==========================================
    @property({ tooltip: "雲演出を有効にするか" })
    public enableClouds: boolean = true;
    @property({ tooltip: "雲生成間隔(秒)の下限" })
    public spawnIntervalMin: number = 0.5;
    @property({ tooltip: "雲生成間隔(秒)の上限" })
    public spawnIntervalMax: number = 1.4;
    @property({ tooltip: "奥(遠景)になる確率(0〜1)" })
    public farLayerChance: number = 0.45;
    @property({ tooltip: "画面幅に対する生成X座標のランダム範囲割合" })
    public spawnXRangeRatio: number = 0.8;

    // 奥(遠景)の雲
    @property({ tooltip: "[奥雲] 不透明度下限" }) public farAlphaMin: number = 30;
    @property({ tooltip: "[奥雲] 不透明度上限" }) public farAlphaMax: number = 60;
    @property({ tooltip: "[奥雲] 幅(px)下限" }) public farSizeMin: number = 260;
    @property({ tooltip: "[奥雲] 幅(px)上限" }) public farSizeMax: number = 560;
    @property({ tooltip: "[奥雲] 速度倍率下限" }) public farSpeedScaleMin: number = 0.22;
    @property({ tooltip: "[奥雲] 速度倍率上限" }) public farSpeedScaleMax: number = 1.4;
    @property({ tooltip: "[奥雲] 回転角度下限" }) public farRotationMin: number = -45;
    @property({ tooltip: "[奥雲] 回転角度上限" }) public farRotationMax: number = 45;

    // 手前(前景)の雲
    @property({ tooltip: "[手前雲] 不透明度下限" }) public nearAlphaMin: number = 60;
    @property({ tooltip: "[手前雲] 不透明度上限" }) public nearAlphaMax: number = 150;
    @property({ tooltip: "[手前雲] 幅(px)下限" }) public nearSizeMin: number = 320;
    @property({ tooltip: "[手前雲] 幅(px)上限" }) public nearSizeMax: number = 720;
    @property({ tooltip: "[手前雲] 速度倍率下限" }) public nearSpeedScaleMin: number = 1.2;
    @property({ tooltip: "[手前雲] 速度倍率上限" }) public nearSpeedScaleMax: number = 3.0;
    @property({ tooltip: "[手前雲] 回転角度下限" }) public nearRotationMin: number = -60;
    @property({ tooltip: "[手前雲] 回転角度上限" }) public nearRotationMax: number = 60;

    // 内部管理
    private _parent: Node | null = null;
    private _farLayer: number = 0;
    private _nearLayer: number = 0;
    private _speedManager: GameSpeedManager | null = null;
    private _manualSpeed: number = -1;
    private _running: boolean = false;

    // スカイ内部
    private _skyGroup: Node | null = null;
    private _skyOpacityComp: UIOpacity | null = null;
    private _skyTiles: TileEntry[] = [];
    private _skyTileHeight: number = 0;
    private _currentSkyPath: string = "";
    private _skyScrollAccumulator: number = 0;
    private _targetSkyColor: Color | null = null;

    // 動画内部
    private _videoGroup: Node | null = null;
    private _videoOpacityComp: UIOpacity | null = null;
    private _videoNode: Node | null = null;
    private _currentVideoPath: string = "";
    private _isVideo: boolean = false;
    private _videoElement: HTMLVideoElement | null = null;
    private _videoFrameCanvas: HTMLCanvasElement | null = null;
    private _videoFrameCtx: CanvasRenderingContext2D | null = null;
    private _videoTexture: Texture2D | null = null;

    // 星内部
    private _starNode: Node | null = null;
    private _starPS: ParticleSystem2D | null = null;
    private _burstDuration: number = 0;
    private _burstTimeRemaining: number = 0;
    private _burstSpeedMult: number = 1;
    private _burstEmissionMult: number = 1;

    // 雲内部
    private _cloudFrames: SpriteFrame[] = [];
    private _cloudFramesReady: boolean = false;
    private _nextCloudSpawnTimer: number = 0;
    private _activeClouds: ActiveCloud[] = [];

    onLoad() {
        SkyManager.instance = this;
        this.loadSkyConfig();
        this.loadCloudSpriteFrames();
    }

    private loadCloudSpriteFrames() {
        resources.loadDir("Materials/Clouds", SpriteFrame, (err, assets) => {
            if (err || !assets || assets.length === 0) {
                console.warn("[SkyManager] Failed to load cloud SpriteFrames:", err);
                return;
            }
            this._cloudFrames = assets;
            this._cloudFramesReady = true;
            console.log(`[SkyManager] Loaded ${assets.length} cloud sprite frame(s).`);
        });
    }

    public loadSkyConfig() {
        resources.load("Data/SkyConfig", JsonAsset, (err, asset: JsonAsset) => {
            if (err || !asset) {
                // SkyConfigが無い場合は旧CloudConfigをフォールバックロード
                resources.load("Data/CloudConfig", JsonAsset, (err2, asset2: JsonAsset) => {
                    if (!err2 && asset2) this.applyConfigJson(asset2.json);
                });
                return;
            }
            this.applyConfigJson(asset.json);
            console.log("[SkyManager] SkyConfig loaded successfully.");
        });
    }

    private applyConfigJson(config: any) {
        if (!config) return;
        if (typeof config.skyResourcePath === 'string') this.skyResourcePath = config.skyResourcePath;
        if (typeof config.skyFolder === 'string') this.skyFolder = config.skyFolder;
        if (typeof config.randomSky === 'boolean') this.randomSky = config.randomSky;
        if (typeof config.skyColor === 'string') this.skyColor = config.skyColor;
        if (typeof config.skyScrollSpeed === 'number') this.skyScrollSpeed = config.skyScrollSpeed;
        if (typeof config.skyOpacity === 'number') this.skyOpacity = config.skyOpacity;
        if (typeof config.enableSky === 'boolean') this.enableSky = config.enableSky;
        if (Array.isArray(config.lvColors)) this.lvColors = config.lvColors;
        if (!this.lvColors || this.lvColors.length < 10) {
            this.lvColors = ["#85FF00", "#00FF8F", "#F7FF33", "#A911FF", "#A50000", "#00BBA5", "#0000BB", "#BB3400", "#86005B", "#002686"];
        }
        for (let i = 1; i <= 10; i++) {
            const key = `lvColor${i}`;
            if (typeof config[key] === 'string' && config[key].trim() !== '') {
                this.lvColors[i - 1] = config[key];
            }
        }
        if (Array.isArray(config.skyPatterns)) this.skyPatterns = config.skyPatterns;
        if (Array.isArray(config.videoPatterns)) this.videoPatterns = config.videoPatterns;

        if (typeof config.videoPosY === 'number') this.videoPosY = config.videoPosY;
        if (typeof config.videoCycleDurationSec === 'number') this.videoCycleDurationSec = config.videoCycleDurationSec;
        if (typeof config.videoFadeDurationSec === 'number') this.videoFadeDurationSec = config.videoFadeDurationSec;
        if (typeof config.videoWaitDurationSec === 'number') this.videoWaitDurationSec = config.videoWaitDurationSec;
        if (typeof config.videoOpacity === 'number') this.videoOpacity = config.videoOpacity;
        if (typeof config.videoRotationDeg === 'number') this.videoRotationDeg = config.videoRotationDeg;
        if (typeof config.enableVideo === 'boolean') this.enableVideo = config.enableVideo;

        if (typeof config.enableStarField === 'boolean') this.enableStarField = config.enableStarField;
        if (typeof config.starSpeedScale === 'number') this.starSpeedScale = config.starSpeedScale;
        if (typeof config.starEmissionScale === 'number') this.starEmissionScale = config.starEmissionScale;
        if (typeof config.starBaseEmission === 'number') this.starBaseEmission = config.starBaseEmission;

        if (typeof config.enableClouds === 'boolean') this.enableClouds = config.enableClouds;
        if (typeof config.spawnIntervalMin === 'number') this.spawnIntervalMin = config.spawnIntervalMin;
        if (typeof config.spawnIntervalMax === 'number') this.spawnIntervalMax = config.spawnIntervalMax;
        if (typeof config.farLayerChance === 'number') this.farLayerChance = config.farLayerChance;
        if (typeof config.spawnXRangeRatio === 'number') this.spawnXRangeRatio = config.spawnXRangeRatio;
        if (typeof config.farAlphaMin === 'number') this.farAlphaMin = config.farAlphaMin;
        if (typeof config.farAlphaMax === 'number') this.farAlphaMax = config.farAlphaMax;
        if (typeof config.farSizeMin === 'number') this.farSizeMin = config.farSizeMin;
        if (typeof config.farSizeMax === 'number') this.farSizeMax = config.farSizeMax;
        if (typeof config.farSpeedScaleMin === 'number') this.farSpeedScaleMin = config.farSpeedScaleMin;
        if (typeof config.farSpeedScaleMax === 'number') this.farSpeedScaleMax = config.farSpeedScaleMax;
        if (typeof config.farRotationMin === 'number') this.farRotationMin = config.farRotationMin;
        if (typeof config.farRotationMax === 'number') this.farRotationMax = config.farRotationMax;
        if (typeof config.nearAlphaMin === 'number') this.nearAlphaMin = config.nearAlphaMin;
        if (typeof config.nearAlphaMax === 'number') this.nearAlphaMax = config.nearAlphaMax;
        if (typeof config.nearSizeMin === 'number') this.nearSizeMin = config.nearSizeMin;
        if (typeof config.nearSizeMax === 'number') this.nearSizeMax = config.nearSizeMax;
        if (typeof config.nearSpeedScaleMin === 'number') this.nearSpeedScaleMin = config.nearSpeedScaleMin;
        if (typeof config.nearSpeedScaleMax === 'number') this.nearSpeedScaleMax = config.nearSpeedScaleMax;
        if (typeof config.nearRotationMin === 'number') this.nearRotationMin = config.nearRotationMin;
        if (typeof config.nearRotationMax === 'number') this.nearRotationMax = config.nearRotationMax;

        this.applyTunables();
    }

    /**
     * ミッション開始時に呼ぶ一括セットアップ。
     * 重ね順: Sky(最背面: siblingIndex 0) -> Video(siblingIndex 1) -> StarField -> Cloud(遠景/近景)
     */
    public setup(parent: Node, farLayer: number, nearLayer: number, speedManager?: GameSpeedManager) {
        this.clearAll();
        this._parent = parent;
        this._farLayer = farLayer;
        this._nearLayer = nearLayer;
        this._speedManager = speedManager || null;
        this._running = true;

        // 1. 最背面スカイ背景
        if (this.enableSky) {
            this.setupSkyLayer();
        }

        // 2. 動画/テクスチャタイル背景
        if (this.enableVideo) {
            this.setupVideoLayer();
        }

        // 3. 星フィールド
        if (this.enableStarField) {
            this.setupStarField();
        }

        // 4. 雲初期撒き
        if (this.enableClouds) {
            this._nextCloudSpawnTimer = 0;
            const prefillCount = 6;
            for (let i = 0; i < prefillCount; i++) {
                const y = (Math.random() - 0.5) * GAME_SETTINGS.CANVAS_HEIGHT;
                this.spawnOneCloud(y);
            }
        }

        console.log("[SkyManager] Unified background setup complete.");
    }

    /**
     * "resources\\Materials\\sky01.png" や "assets/resources/Materials/sky01" などの
     * さまざまなパス形式を、resources.load が受け付ける "Materials/sky01" 形式へ正規化する。
     */
    private normalizeResourcePath(rawPath: string): string {
        if (!rawPath) return "Materials/sky01";
        let p = rawPath.replace(/\\/g, '/').trim();
        if (p.startsWith('/')) p = p.substring(1);
        if (p.startsWith('assets/resources/')) p = p.substring('assets/resources/'.length);
        else if (p.startsWith('resources/')) p = p.substring('resources/'.length);
        else if (p.startsWith('assets/')) p = p.substring('assets/'.length);
        // 拡張子(.png, .jpg, .webp等)を除去
        p = p.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        return p;
    }

    // --- 1. スカイ層セットアップ ---
    private setupSkyLayer() {
        this._skyGroup = new Node("SkyLayerGroup");
        this._parent.addChild(this._skyGroup);
        this._skyGroup.setSiblingIndex(0);
        this._skyGroup.layer = this._farLayer;
        this._skyGroup.setPosition(0, 0, 0);

        this._skyOpacityComp = this._skyGroup.addComponent(UIOpacity);
        this._skyOpacityComp.opacity = this.skyOpacity;

        const buildTiles = (frame: SpriteFrame) => {
            if (!this._skyGroup || !this._skyGroup.isValid || !frame) return;
            const srcW = frame.originalSize?.width || frame.rect?.width || 800;
            const srcH = frame.originalSize?.height || frame.rect?.height || 4320;
            if (srcW <= 0 || srcH <= 0) return;

            const canvasW = GAME_SETTINGS.CANVAS_WIDTH;
            const canvasH = GAME_SETTINGS.CANVAS_HEIGHT;
            const scale = canvasW / srcW;
            const tileH = srcH * scale;
            this._skyTileHeight = tileH;

            const tileCount = Math.max(2, Math.ceil(canvasH / tileH) + 1);
            const startY = (tileCount - 1) / 2 * tileH;

            const tintColor = new Color();
            if (this._targetSkyColor) {
                tintColor.set(this._targetSkyColor);
            } else if (this.skyColor) {
                Color.fromHEX(tintColor, this.skyColor);
            } else {
                tintColor.set(255, 255, 255, 255);
            }

            for (let i = 0; i < tileCount; i++) {
                const node = new Node(`SkyTile_${i}`);
                this._skyGroup.addChild(node);
                node.layer = this._farLayer;

                const trans = node.addComponent(UITransform);
                // タイル同士の境界の1pxギャップ(透過チラつき)を物理的に遮断するため +1px 重ねる
                trans.setContentSize(canvasW, Math.ceil(tileH) + 1.0);

                const sprite = node.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.type = Sprite.Type.SIMPLE;
                sprite.spriteFrame = frame;
                sprite.color = tintColor;

                node.setPosition(0, startY - i * tileH, 0);
                this._skyTiles.push({ node });
            }

            console.log(`[SkyManager] Sky tiles initialized successfully with path: "${normPath}" (${tileCount} tiles, height=${tileH.toFixed(1)}px).`);
        };

        let targetPath = this.skyResourcePath;
        if (this.randomSky && BackgroundThemeManager.instance) {
            targetPath = BackgroundThemeManager.instance.getRandomSkyPattern(this._currentSkyPath);
            this._currentSkyPath = targetPath;
        }

        // 1. BackgroundThemeManager のオンメモリキャッシュを最優先チェック
        if (BackgroundThemeManager.instance) {
            const cachedFrame = BackgroundThemeManager.instance.getSkySpriteFrame(targetPath);
            if (cachedFrame) {
                buildTiles(cachedFrame);
                return;
            }
        }

        const normPath = this.normalizeResourcePath(targetPath);
        const sfPath = normPath.endsWith("/spriteFrame") ? normPath : `${normPath}/spriteFrame`;

        // 2. 直指定 (SpriteFrame) でロード試行 -> 失敗時サブアセット /spriteFrame 試行 -> ImageAsset
        resources.load(normPath, SpriteFrame, (err, frame) => {
            if (!err && frame) { buildTiles(frame); return; }
            resources.load(sfPath, SpriteFrame, (err2, frame2) => {
                if (!err2 && frame2) { buildTiles(frame2); return; }
                resources.load(normPath, (err3, imgAsset: any) => {
                    if (!err3 && imgAsset) {
                        const sf = SpriteFrame.createWithImage(imgAsset);
                        if (sf) { buildTiles(sf); return; }
                    }
                    console.error(`[SkyManager] Failed to load sky asset from "${this.skyResourcePath}" (normalized: "${normPath}"):`, err, err2, err3);
                });
            });
        });
    }

    // --- 2. 動画層セットアップ(スクロールタイルではなく、フェードイン→ホールド→フェードアウト→
    // 待機→再抽選のサイクルで1枚を切り替え続ける旧VideoBackground.ts方式に戻したもの) ---
    private setupVideoLayer() {
        this._videoGroup = new Node("VideoLayerGroup");
        this._parent.addChild(this._videoGroup);
        this._videoGroup.setSiblingIndex(1);
        this._videoGroup.layer = this._farLayer;
        this._videoGroup.setPosition(0, this.videoPosY, 0);

        this._videoOpacityComp = this._videoGroup.addComponent(UIOpacity);
        this._videoOpacityComp.opacity = 0; // フェードイン前は非表示

        this.pickAndLoadVideoSource();
    }

    // 現在の再生パスを除外して次のクリップをランダムに選び、ロード+再生を開始する
    // (setupVideoLayer()の初回、およびフェードサイクル完了後の再抽選の両方から呼ぶ)。
    private pickAndLoadVideoSource() {
        if (!this._videoGroup || !this._videoGroup.isValid) return;
        const btm = BackgroundThemeManager.instance;
        const pick = btm
            ? btm.getRandomBackgroundPattern(this._currentVideoPath)
            : { path: "Movies/BGV_Ingame001_Galaxy_Base", isVideo: true };

        this._currentVideoPath = pick.path;
        this._isVideo = pick.isVideo;
        if (pick.isVideo) {
            this.setupVideoSource(pick.path);
        } else {
            this.setupImageSource(pick.path);
        }
    }

    private setupImageSource(path: string) {
        resources.load(path, SpriteFrame, (err, frame: SpriteFrame) => {
            if (err || !frame || !this._videoGroup || !this._videoGroup.isValid) return;
            this.buildVideoSprite(frame);
            this.beginVideoFadeCycle();
        });
    }

    private setupVideoSource(path: string) {
        if (typeof document === 'undefined') return;
        if (!this._videoElement) {
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
            this._videoElement = video;
        }
        const video = this._videoElement;

        resources.load(path, VideoClip, (err, clip: VideoClip) => {
            if (err || !clip || !this._videoGroup || !this._videoGroup.isValid) return;
            const videoUrl = clip.nativeUrl || (clip as any)._nativeAsset;
            if (!videoUrl) return;

            const onReady = () => {
                if (!this._videoGroup || !this._videoGroup.isValid) return;
                const srcW = video.videoWidth;
                const srcH = video.videoHeight;
                if (srcW === 0 || srcH === 0) return;

                if (!this._videoFrameCanvas || this._videoFrameCanvas.width !== srcW || this._videoFrameCanvas.height !== srcH) {
                    this._videoFrameCanvas = document.createElement('canvas');
                    this._videoFrameCanvas.width = srcW;
                    this._videoFrameCanvas.height = srcH;
                    this._videoFrameCtx = this._videoFrameCanvas.getContext('2d');
                    this._videoTexture = new Texture2D();
                    this._videoTexture.image = new ImageAsset(this._videoFrameCanvas);
                }
                const sharedFrame = new SpriteFrame();
                sharedFrame.texture = this._videoTexture;

                this.buildVideoSprite(sharedFrame);
                video.play().catch(() => {});
                this.beginVideoFadeCycle();
            };

            video.src = videoUrl;
            video.currentTime = 0;
            if (video.readyState >= 1) onReady();
            else video.addEventListener('loadedmetadata', onReady, { once: true });
        });
    }

    // 画面いっぱいの単一スプライトとして構築する(スクロールタイルではない)。
    private buildVideoSprite(frame: SpriteFrame) {
        if (!this._videoGroup || !this._videoGroup.isValid) return;
        if (this._videoNode && this._videoNode.isValid) {
            this._videoNode.destroy();
        }

        const node = new Node("VideoSprite");
        this._videoGroup.addChild(node);
        node.layer = this._farLayer;
        node.angle = ((this.videoRotationDeg % 360) + 360) % 360;

        const trans = node.addComponent(UITransform);
        trans.setContentSize(GAME_SETTINGS.CANVAS_WIDTH, GAME_SETTINGS.CANVAS_HEIGHT);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;

        node.setPosition(0, 0, 0);
        this._videoNode = node;
    }

    // 現在のクリップに対して、フェードイン→ホールド→フェードアウトの1サイクル分をtweenで組む。
    // videoCycleDurationSec(設定値)から算出するため、実ファイルの尺には依存しない
    // (video.loop=trueで内部ループさせて埋める)。
    private beginVideoFadeCycle() {
        const opacity = this._videoOpacityComp;
        if (!opacity) return;
        Tween.stopAllByTarget(opacity);

        const fade = Math.min(this.videoFadeDurationSec, this.videoCycleDurationSec / 2);
        const hold = Math.max(0, this.videoCycleDurationSec - fade * 2);

        tween(opacity)
            .set({ opacity: 0 })
            .to(fade, { opacity: this.videoOpacity })
            .delay(hold)
            .to(fade, { opacity: 0 })
            .call(() => this.onVideoFadeCycleEnd())
            .start();
    }

    // フェードアウト完了(=不透明度0で見えない状態)直後に呼ばれる。videoWaitDurationSec待ってから
    // 次のクリップを再抽選し、ロード+再生開始する(pickAndLoadVideoSource()がbeginVideoFadeCycle()
    // まで繋げる)。
    private onVideoFadeCycleEnd() {
        if (!this.enableVideo || !this._videoOpacityComp) return;
        tween(this._videoOpacityComp)
            .delay(this.videoWaitDurationSec)
            .call(() => this.pickAndLoadVideoSource())
            .start();
    }

    // --- 3. 星フィールドセットアップ ---
    private setupStarField() {
        this._starNode = this._parent.getChildByName("StarField") || this._parent.getChildByName("StarFieldLayer");
        if (!this._starNode) {
            this._starNode = new Node("StarFieldLayer");
            this._parent.addChild(this._starNode);
        } else {
            // prefab側の"StarField"ノードを再利用する場合、旧StarFieldコンポーネントが付いたままだと
            // 同じParticleSystem2Dに対して毎フレーム別の速度/発生量計算を書き込み合ってしまう
            // (ちらつきの原因)。SkyManagerがこの層を一元管理するため、旧コンポーネントは無効化する。
            const legacy = this._starNode.getComponent("StarField") as any;
            if (legacy && legacy.enabled !== false) {
                legacy.enabled = false;
                console.log("[SkyManager] Disabled legacy StarField component to avoid double-control.");
            }
        }
        this._starNode.layer = this._farLayer;
        this._starPS = this._starNode.getComponent(ParticleSystem2D) || this._starNode.addComponent(ParticleSystem2D);
        if (this._starPS) {
            this._starPS.duration = -1;
            this._starPS.playOnAwake = true;
            this._starPS.startColor = new Color(255, 255, 200, 255);
            this._starPS.startColorVar = new Color(50, 50, 55, 0);
            this._starPS.endColor = new Color(200, 255, 255, 0);
            this._starPS.life = 2.0;
            this._starPS.lifeVar = 1.5;
            this._starPS.resetSystem();
        }
    }

    // --- 4. 雲生成ロジック ---
    private getCloudRange(isFar: boolean): CloudSpawnRange {
        return isFar
            ? {
                layer: this._farLayer,
                alphaMin: this.farAlphaMin, alphaMax: this.farAlphaMax,
                sizeMin: this.farSizeMin, sizeMax: this.farSizeMax,
                speedScaleMin: this.farSpeedScaleMin, speedScaleMax: this.farSpeedScaleMax,
                rotationMin: this.farRotationMin, rotationMax: this.farRotationMax,
            }
            : {
                layer: this._nearLayer,
                alphaMin: this.nearAlphaMin, alphaMax: this.nearAlphaMax,
                sizeMin: this.nearSizeMin, sizeMax: this.nearSizeMax,
                speedScaleMin: this.nearSpeedScaleMin, speedScaleMax: this.nearSpeedScaleMax,
                rotationMin: this.nearRotationMin, rotationMax: this.nearRotationMax,
            };
    }

    private spawnOneCloud(startY: number) {
        if (!this._parent || !this._parent.isValid || !this._cloudFramesReady || this._cloudFrames.length === 0) return;

        const isFar = Math.random() < this.farLayerChance;
        const range = this.getCloudRange(isFar);

        const node = new Node('Cloud');
        this._parent.addChild(node);
        node.layer = range.layer;

        const width = this.randRange(range.sizeMin, range.sizeMax);
        const height = width * CLOUD_ASPECT;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(width, height);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.spriteFrame = this._cloudFrames[Math.floor(Math.random() * this._cloudFrames.length)];

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = this.randRange(range.alphaMin, range.alphaMax);

        const x = (Math.random() * 2 - 1) * this.spawnXRangeRatio * (GAME_SETTINGS.CANVAS_WIDTH / 2);
        node.setPosition(x, startY, 0);

        if (Math.random() < 0.5) node.setScale(-1, 1, 1);
        node.angle = this.randRange(range.rotationMin, range.rotationMax);

        const speedScale = this.randRange(range.speedScaleMin, range.speedScaleMax);
        this._activeClouds.push({ node, speedScale, halfHeight: height / 2 });
    }

    private randRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // ==========================================
    // フレーム更新
    // ==========================================
    update(dt: number) {
        if (!this._running) return;

        const currentSpeed = this.getCurrentGameSpeed();

        // 1. 最背面スカイ背景スクロール (Modulo Wrap 一元座標計算)
        if (this.enableSky && this._skyTiles.length > 0 && this._skyTileHeight > 0) {
            this._skyScrollAccumulator += this.skyScrollSpeed * dt;
            const N = this._skyTiles.length;
            const totalH = N * this._skyTileHeight;
            this._skyScrollAccumulator %= totalH;

            const halfTotal = totalH / 2;

            for (let i = 0; i < N; i++) {
                const t = this._skyTiles[i];
                if (!t || !t.node || !t.node.isValid) continue;

                // 初期基準Y座標: 中央を0として上から下へ配置
                const initialY = ((N - 1) / 2 - i) * this._skyTileHeight;
                let currentY = initialY - this._skyScrollAccumulator;

                // Modulo Wrap で全タイルが [-totalH/2, totalH/2] 内に収まるように循環
                while (currentY < -halfTotal) {
                    currentY += totalH;
                }
                while (currentY > halfTotal) {
                    currentY -= totalH;
                }

                t.node.setPosition(t.node.position.x, currentY, 0);
            }
        }

        // 2. 動画背景フレーム更新(MP4の場合のみ、フェード/切替はtweenで別途処理するのでここではスクロールしない)
        if (this.enableVideo && this._isVideo) {
            this.updateVideoFrame();
        }

        // 3. 星パーティクル更新
        if (this.enableStarField && this._starPS) {
            let speedMult = 1;
            let emissionMult = 1;
            if (this._burstTimeRemaining > 0) {
                const t = this._burstDuration > 0 ? this._burstTimeRemaining / this._burstDuration : 0;
                const ease = t > 0.3 ? 1 : (t / 0.3);
                speedMult = 1 + (this._burstSpeedMult - 1) * ease;
                emissionMult = 1 + (this._burstEmissionMult - 1) * ease;
                this._burstTimeRemaining -= dt;
            }
            this._starPS.speed = currentSpeed * this.starSpeedScale * speedMult;
            this._starPS.speedVar = this._starPS.speed * 0.2;
            this._starPS.emissionRate = (this.starBaseEmission + (currentSpeed * this.starEmissionScale)) * emissionMult;
        }

        // 4. 雲生成 & スクロール
        if (this.enableClouds) {
            const frameScale = dt * 60;
            const baseDelta = currentSpeed * frameScale;

            this._nextCloudSpawnTimer -= dt;
            if (this._nextCloudSpawnTimer <= 0 && this._cloudFramesReady) {
                this.spawnOneCloud(GAME_SETTINGS.CANVAS_HEIGHT / 2 + 80);
                this._nextCloudSpawnTimer = this.randRange(this.spawnIntervalMin, this.spawnIntervalMax);
            }

            const wrapMargin = GAME_SETTINGS.CANVAS_HEIGHT / 2;
            for (let i = this._activeClouds.length - 1; i >= 0; i--) {
                const c = this._activeClouds[i];
                if (!c.node.isValid) {
                    this._activeClouds.splice(i, 1);
                    continue;
                }
                const dy = baseDelta * c.speedScale;
                c.node.setPosition(c.node.position.x, c.node.position.y - dy, 0);
                if (c.node.position.y + c.halfHeight < -wrapMargin) {
                    c.node.destroy();
                    this._activeClouds.splice(i, 1);
                }
            }
        }
    }

    private updateVideoFrame() {
        const video = this._videoElement;
        if (!video || !this._videoFrameCtx || !this._videoTexture || video.readyState < 2) return;
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        try {
            this._videoFrameCtx.drawImage(video, 0, 0, this._videoFrameCanvas.width, this._videoFrameCanvas.height);
            this._videoTexture.uploadData(this._videoFrameCanvas);
        } catch (e) {
            console.error("[SkyManager] Video texture upload exception:", e);
        }
    }

    private getCurrentGameSpeed(): number {
        if (this._manualSpeed >= 0) return this._manualSpeed;
        if (this._speedManager) return this._speedManager.getCurrentSpeed();
        return 5.0; // フォールバック既定速度
    }

    // ==========================================
    // 外部API
    // ==========================================
    // videoOpacityはフェードサイクルの目標値(次回サイクルから反映)として保持するだけで、
    // ここでは_videoOpacityCompへ直接書き込まない - 現在フェード中のtweenを上書きすると
    // 不自然な瞬間ジャンプになるため。skySpeed/skyOpacity/skyColor/videoPosYは即時反映する
    // (スクロールが無くなった動画速度=videoSpeedの引数は廃止)。
    public applyTunables(
        skySpeed: number = this.skyScrollSpeed,
        skyOpacity: number = this.skyOpacity,
        videoOpacity: number = this.videoOpacity,
        skyColor: string = this.skyColor,
        videoPosY: number = this.videoPosY
    ) {
        this.skyScrollSpeed = skySpeed;
        this.skyOpacity = skyOpacity;
        this.videoOpacity = videoOpacity;
        this.skyColor = skyColor;
        this.videoPosY = videoPosY;

        if (this._skyOpacityComp && this._skyOpacityComp.isValid) {
            this._skyOpacityComp.opacity = skyOpacity;
        }
        if (this._videoGroup && this._videoGroup.isValid) {
            this._videoGroup.setPosition(0, videoPosY, 0);
        }

        if (skyColor && this._skyTiles.length > 0) {
            const tint = new Color();
            Color.fromHEX(tint, skyColor);
            for (const t of this._skyTiles) {
                if (t.node && t.node.isValid) {
                    const sp = t.node.getComponent(Sprite);
                    if (sp) sp.color = tint;
                }
            }
        }
    }

    public triggerBurst(durationSec: number = 3.0, speedMultiplier: number = 3.0, emissionMultiplier: number = 2.5) {
        this._burstDuration = durationSec;
        this._burstTimeRemaining = durationSec;
        this._burstSpeedMult = speedMultiplier;
        this._burstEmissionMult = emissionMultiplier;
    }

    public setManualSpeed(speed: number) {
        this._manualSpeed = speed;
    }

    /**
     * MissionLv(1始まり)から系統色(Color)を返す。
     */
    public getColorForLv(lv: number): Color {
        const idx = Math.max(1, Math.round(lv || 1)) - 1;
        const defaultHexes = [
            "#85FF00", "#00FF8F", "#F7FF33", "#A911FF", "#A50000",
            "#00BBA5", "#0000BB", "#BB3400", "#86005B", "#002686"
        ];
        const colors = (this.lvColors && Array.isArray(this.lvColors) && this.lvColors.length > 0) ? this.lvColors : defaultHexes;
        const hex = (idx >= 0 && idx < colors.length) ? colors[idx] : (colors[0] || "#FFFFFF");
        const c = new Color();
        try {
            Color.fromHEX(c, hex || "#FFFFFF");
        } catch (e) {
            c.set(255, 255, 255, 255);
        }
        return c;
    }

    /**
     * MissionLv (1〜10) に応じた最背面スカイ用の系統ティントカラーを取得
     */
    public getSkyColorForLv(lv: number): Color {
        const baseColor = this.getColorForLv(lv);
        if (!baseColor) return Color.WHITE;
        return baseColor.clone();
    }

    /**
     * 最背面スカイ背景パターンプールからランダムに1本選ぶ
     */
    public getRandomSkyPattern(excludePath?: string): string {
        if (!this.skyPatterns || !Array.isArray(this.skyPatterns) || this.skyPatterns.length === 0) return "Materials/Sky/sky01";
        if (excludePath) {
            const candidates = this.skyPatterns.filter(p => p !== excludePath);
            if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
        }
        return this.skyPatterns[Math.floor(Math.random() * this.skyPatterns.length)];
    }

    /**
     * 背景動画パターンプールからランダムに1本選ぶ
     */
    public getRandomVideoPattern(excludePath?: string): string {
        if (!this.videoPatterns || !Array.isArray(this.videoPatterns) || this.videoPatterns.length === 0) return "Movies/BGV_Ingame001_Galaxy_Base";
        if (excludePath) {
            const candidates = this.videoPatterns.filter(p => p !== excludePath);
            if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
        }
        return this.videoPatterns[Math.floor(Math.random() * this.videoPatterns.length)];
    }

    /**
     * MissionLv (1〜10) に応じた系統テーマカラーや設定をスカイ背景に即座/滑らかに適用
     * @param missionLv ミッションレベル (1〜10)
     * @param durationSec カラー変更のフェード移行時間(秒、0で即時)
     */
    public applyMissionTheme(missionLv: number, durationSec: number = 1.0) {
        const targetColor = this.getSkyColorForLv(missionLv);
        if (!targetColor) return;
        this._targetSkyColor = targetColor.clone();

        if (this._skyTiles.length === 0) {
            console.log(`[SkyManager] Pre-stored target sky color for Lv${missionLv}: RGB(${targetColor.r}, ${targetColor.g}, ${targetColor.b}) (Tiles loading...)`);
            return;
        }

        for (const t of this._skyTiles) {
            if (!t.node || !t.node.isValid) continue;
            const sp = t.node.getComponent(Sprite);
            if (!sp) continue;

            if (durationSec <= 0) {
                sp.color = targetColor;
            } else {
                Tween.stopAllByTarget(sp);
                const cur = sp.color.clone();
                const obj = { r: cur.r, g: cur.g, b: cur.b };
                tween(obj)
                    .to(durationSec, { r: targetColor.r, g: targetColor.g, b: targetColor.b }, {
                        onUpdate: () => {
                            if (sp && sp.isValid) {
                                sp.color = new Color(Math.floor(obj.r), Math.floor(obj.g), Math.floor(obj.b), 255);
                            }
                        }
                    })
                    .start();
            }
        }
        console.log(`[SkyManager] Applied mission theme for Lv${missionLv} (Color: RGB(${targetColor.r}, ${targetColor.g}, ${targetColor.b})).`);
    }

    /**
     * 今後の天候イベントシステム用: 動画/画像背景層の有効/無効を動的に切り替える
     */
    public setVideoEnabled(enabled: boolean) {
        this.enableVideo = enabled;
        if (enabled) {
            if (!this._videoGroup) {
                this.setupVideoLayer();
            } else {
                this._videoGroup.active = true;
            }
        } else {
            if (this._videoGroup && this._videoGroup.isValid) {
                this._videoGroup.active = false;
            }
        }
        console.log(`[SkyManager] Video layer enabled state changed to: ${enabled}`);
    }

    public clearAll() {
        if (this._videoOpacityComp) {
            Tween.stopAllByTarget(this._videoOpacityComp);
        }
        if (this._videoElement) {
            this._videoElement.pause();
            this._videoElement.remove();
            this._videoElement = null;
        }
        if (this._skyGroup && this._skyGroup.isValid) this._skyGroup.destroy();
        if (this._videoGroup && this._videoGroup.isValid) this._videoGroup.destroy();
        for (const c of this._activeClouds) {
            if (c.node && c.node.isValid) c.node.destroy();
        }
        this._skyGroup = null;
        this._skyOpacityComp = null;
        this._skyTiles = [];
        this._videoGroup = null;
        this._videoOpacityComp = null;
        this._videoNode = null;
        this._currentVideoPath = "";
        this._activeClouds = [];
        this._videoFrameCanvas = null;
        this._videoFrameCtx = null;
        this._videoTexture = null;
        this._running = false;
    }

    onDestroy() {
        this.clearAll();
        if (SkyManager.instance === this) SkyManager.instance = null;
    }
}
