import { _decorator, Component, Color, SpriteFrame } from 'cc';
import { SkyManager } from './SkyManager';
const { ccclass, property } = _decorator;

const DEFAULT_LV_COLORS: Color[] = [
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

/**
 * 【後方互換ブリッジ】
 * 背景関連の設定・色・抽選ロジックはすべて `SkyManager` および `SkyConfig.json` へ一元化されました。
 * このクラスは既存コードとの互換性を保つため、内部処理を SkyManager.instance へ安全に委譲します。
 */
@ccclass('BackgroundThemeManager')
export class BackgroundThemeManager extends Component {

    public static instance: BackgroundThemeManager = null;

    public get lvColors(): Color[] {
        if (SkyManager.instance && SkyManager.instance.lvColors && SkyManager.instance.lvColors.length > 0) {
            return [1,2,3,4,5,6,7,8,9,10].map(lv => SkyManager.instance.getColorForLv(lv));
        }
        return DEFAULT_LV_COLORS;
    }

    public get skyPatterns(): string[] {
        if (SkyManager.instance && SkyManager.instance.skyPatterns && SkyManager.instance.skyPatterns.length > 0) {
            return SkyManager.instance.skyPatterns;
        }
        return ["Materials/Sky/sky01"];
    }

    public get videoPatterns(): string[] {
        if (SkyManager.instance && SkyManager.instance.videoPatterns && SkyManager.instance.videoPatterns.length > 0) {
            return SkyManager.instance.videoPatterns;
        }
        return ["Movies/BGV_Ingame001_Galaxy_Base"];
    }

    public get imagePatterns(): string[] {
        return [];
    }

    onLoad() {
        BackgroundThemeManager.instance = this;
    }

    public scanSkyFolder() {
        if (SkyManager.instance) SkyManager.instance.loadSkyConfig();
    }

    public getSkySpriteFrame(path: string): SpriteFrame | null {
        return null;
    }

    public getColorForLv(lv: number): Color {
        if (SkyManager.instance) return SkyManager.instance.getColorForLv(lv);
        const idx = Math.max(1, Math.round(lv || 1)) - 1;
        return (idx >= 0 && idx < DEFAULT_LV_COLORS.length) ? DEFAULT_LV_COLORS[idx] : Color.WHITE;
    }

    public getSkyColorForLv(lv: number): Color {
        if (SkyManager.instance) return SkyManager.instance.getSkyColorForLv(lv);
        const baseColor = this.getColorForLv(lv);
        return new Color(
            Math.floor(baseColor.r * 0.85 + 35),
            Math.floor(baseColor.g * 0.85 + 35),
            Math.floor(baseColor.b * 0.85 + 35),
            255
        );
    }

    public getRandomSkyPattern(excludePath?: string): string {
        if (SkyManager.instance) return SkyManager.instance.getRandomSkyPattern(excludePath);
        return "Materials/Sky/sky01";
    }

    public getRandomVideoPattern(excludePath?: string): string {
        if (SkyManager.instance) return SkyManager.instance.getRandomVideoPattern(excludePath);
        return "Movies/BGV_Ingame001_Galaxy_Base";
    }

    public getRandomBackgroundPattern(excludePath?: string): { path: string; isVideo: boolean } {
        if (SkyManager.instance) return { path: SkyManager.instance.getRandomVideoPattern(excludePath), isVideo: true };
        return { path: "Movies/BGV_Ingame001_Galaxy_Base", isVideo: true };
    }
}
