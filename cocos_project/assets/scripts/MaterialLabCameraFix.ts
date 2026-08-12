import { _decorator, Component, director } from 'cc';
const { ccclass } = _decorator;

/**
 * Material Lab用。GameManager.ensureSceneSetup()はPlay開始のたびに、シーンに"MainCamera"/
 * "BackgroundCamera"/"ForegroundCamera"という名前のノードが無ければ自動生成する(存在すれば
 * 中身には触らない)。scene-MaterialLabにはこの3つを置いていないため、Playするたびに毎回
 * 新規生成されてしまい、Canvas側の見た目確認用カメラより手前で描画してSOLID_COLORクリアする
 * ことで画面を覆い隠してしまう(本来はGameManager.applyCameraForState()がVisibility/ClearFlags
 * を正しく設定する役目だが、Material LabではTitle/Home Prefabを外しているためこれが一度も
 * 呼ばれず、生成直後の初期状態のまま放置される)。
 *
 * Cocosのコンポーネントライフサイクルはシーン内の全onLoad()が終わってから全start()が走るため、
 * ここでstart()時に無効化すれば、GameManager.onLoad()が生成した直後・実際に描画される前に
 * 確実に間に合う。
 */
@ccclass('MaterialLabCameraFix')
export class MaterialLabCameraFix extends Component {
    start() {
        const scene = director.getScene();
        if (!scene) return;
        ['MainCamera', 'BackgroundCamera', 'ForegroundCamera'].forEach((name) => {
            const node = scene.getChildByName(name);
            if (node && node.active) {
                node.active = false;
                console.log(`[MaterialLabCameraFix] Disabled auto-created '${name}' so it doesn't cover Canvas > Camera.`);
            }
        });
    }
}
