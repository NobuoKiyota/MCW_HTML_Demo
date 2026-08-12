import { _decorator, Component, resources, JsonAsset, director, Color, Vec4 } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 見た目調整専用シーン(Material Lab)向け。GameManagerEditor(MasterManagerパネル)が編集する
 * assets/resources/Data/GameManagerConfig.jsonのAmbient設定(Sky Illum/Ground Lighting Color)
 * を、Playを押さなくてもエディタ編集中のシーンにそのまま反映する。GameManager本体には依存しない
 * (このスクリプト単体で完結、ゲームプレイ用ロジックは一切持たない)。
 *
 * 使い方: このコンポーネントをMaterial Lab用シーンの適当なノード(例: シーンルート)に1つ付けるだけ。
 * reloadIntervalSec秒おきにGameManagerConfig.jsonを読み直すので、GameManagerEditorで値を変更して
 * 保存すれば、このシーンを開いたまま数秒待つだけでAmbientが切り替わる。
 */
@ccclass('MaterialLabAmbientSync')
@executeInEditMode
export class MaterialLabAmbientSync extends Component {
    @property({ tooltip: '何秒おきにGameManagerConfig.jsonを読み直すか。0以下なら起動時の1回のみ適用。' })
    public reloadIntervalSec: number = 1.0;

    private _timer: number = 0;

    onLoad() {
        this.applyConfig();
    }

    update(dt: number) {
        if (this.reloadIntervalSec <= 0) return;
        this._timer += dt;
        if (this._timer >= this.reloadIntervalSec) {
            this._timer = 0;
            this.applyConfig();
        }
    }

    private hexToNormalizedVec4(hex: string): Vec4 {
        const c = new Color();
        Color.fromHEX(c, hex);
        return new Vec4(c.r / 255, c.g / 255, c.b / 255, 1);
    }

    private applyConfig() {
        resources.load("Data/GameManagerConfig", JsonAsset, (err, asset: JsonAsset) => {
            if (err || !asset) {
                console.warn("[MaterialLabAmbientSync] Failed to load Data/GameManagerConfig.json.", err);
                return;
            }
            const config = asset.json as { ambientSkyIllum?: number; groundLightingColor?: string };
            const scene = director.getScene();
            const ambient = scene && (scene as any).globals ? (scene as any).globals.ambient : null;
            if (!ambient) {
                console.warn("[MaterialLabAmbientSync] Scene has no globals.ambient.");
                return;
            }
            if (typeof config.ambientSkyIllum === 'number') {
                ambient.skyIllum = config.ambientSkyIllum;
            }
            if (typeof config.groundLightingColor === 'string') {
                ambient.groundAlbedo = this.hexToNormalizedVec4(config.groundLightingColor);
            }
        });
    }
}
