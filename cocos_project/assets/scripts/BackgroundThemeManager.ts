import { _decorator, Component, Color } from 'cc';
const { ccclass, property } = _decorator;

/**
 * MissionLv(1〜10)ごとの系統色と、Ingame背景動画のパターンプールを一元管理するシーン常駐Manager
 * (GameManager/UIManager/SoundManagerと同じ static instance シングルトンパターン)。
 *
 * - 系統色: MissionUIのLvボタン配色と同じ10色をデフォルトで持つ(index 0 = Lv1)。GameManagerが
 *   ミッション開始時にcurrentMission.lvから引き、VideoBackgroundの乗算ティントのベース色として使う
 *   (updateVideoBGColorEffect()参照)。
 * - 動画パターン: Movies/配下のIngame背景動画パスのプール。ミッションごとにランダムで1本選ぶ
 *   (SubLvとは連動しない、というユーザー指定の仕様)。要素はInspectorの配列+ボタンで自由に追加/削除できる。
 */
@ccclass('BackgroundThemeManager')
export class BackgroundThemeManager extends Component {

    public static instance: BackgroundThemeManager = null;

    @property({
        type: [Color],
        tooltip: "MissionLv 1〜10の系統色(index 0 = Lv1, index 9 = Lv10)。MissionUIのLvボタン配色と揃えることを推奨"
    })
    public lvColors: Color[] = [
        new Color(0x85, 0xFF, 0x00, 255), // Lv1
        new Color(0x00, 0xFF, 0x8F, 255), // Lv2
        new Color(0xF7, 0xFF, 0x33, 255), // Lv3
        new Color(0xA9, 0x11, 0xFF, 255), // Lv4
        new Color(0xA5, 0x00, 0x00, 255), // Lv5
        new Color(0x00, 0xBB, 0xA5, 255), // Lv6
        new Color(0x00, 0x00, 0xBB, 255), // Lv7
        new Color(0xBB, 0x34, 0x00, 255), // Lv8
        new Color(0x86, 0x00, 0x5B, 255), // Lv9
        new Color(0x00, 0x26, 0x86, 255), // Lv10
    ];

    @property({
        type: [String],
        tooltip: "Ingame背景動画パターンのプール(resources.load用パス、拡張子無し。例: Movies/BGV_Ingame001_Galaxy_Base)。ミッションごとにこの中からランダムで1本選ぶ"
    })
    public videoPatterns: string[] = ["Movies/BGV_Ingame001_Galaxy_Base"];

    // ScrollingBackgroundManager.ts(縦スクロール背景)専用の画像パターンプール。videoPatternsと
    // 同じ規約(resources.load用パス、拡張子無し)。getRandomBackgroundPattern()がこちらと
    // videoPatternsを合わせた1つのプールとしてランダムに1件選ぶ。
    @property({
        type: [String],
        tooltip: "縦スクロール背景(ScrollingBackgroundManager)用の画像パターンのプール(resources.load用パス、拡張子無し)。videoPatternsと合わせて1つのプールとしてランダムに選ばれる"
    })
    public imagePatterns: string[] = [];

    onLoad() {
        BackgroundThemeManager.instance = this;
    }

    // MissionLv(1始まり)から系統色を引く。範囲外/未設定なら白(=無補正、乗算しても元動画の色のまま)を返す。
    public getColorForLv(lv: number): Color {
        const idx = Math.max(1, Math.round(lv || 1)) - 1;
        if (idx >= 0 && idx < this.lvColors.length) return this.lvColors[idx];
        return Color.WHITE;
    }

    // 動画パターンプールからランダムに1本選ぶ。空なら安全な既定パスにフォールバックする。
    // excludePathを渡すと(VideoBackground.tsのシャッフル機能が、直前と同じ動画への連続当選を
    // 避けるために使う)、プールに他の候補がある限りそれを除外して選ぶ。
    public getRandomVideoPattern(excludePath?: string): string {
        if (!this.videoPatterns || this.videoPatterns.length === 0) return "Movies/BGV_Ingame001_Galaxy_Base";
        if (!excludePath) {
            return this.videoPatterns[Math.floor(Math.random() * this.videoPatterns.length)];
        }
        const candidates = this.videoPatterns.filter(p => p !== excludePath);
        const pool = candidates.length > 0 ? candidates : this.videoPatterns;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ScrollingBackgroundManager.ts用: videoPatterns/imagePatternsを合わせた1つのプールから
    // ランダムに1件選び、動画かどうか(isVideo)も一緒に返す。両方空ならvideoPatternsの
    // フォールバック既定パス(動画扱い)を返す。
    public getRandomBackgroundPattern(): { path: string; isVideo: boolean } {
        const videoEntries = (this.videoPatterns || []).map(path => ({ path, isVideo: true }));
        const imageEntries = (this.imagePatterns || []).map(path => ({ path, isVideo: false }));
        const pool = videoEntries.concat(imageEntries);
        if (pool.length === 0) return { path: "Movies/BGV_Ingame001_Galaxy_Base", isVideo: true };
        return pool[Math.floor(Math.random() * pool.length)];
    }
}
