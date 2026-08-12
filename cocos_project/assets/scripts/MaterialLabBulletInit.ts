import { _decorator, Component, resources, JsonAsset } from 'cc';
import { Bullet } from './Bullet';
const { ccclass } = _decorator;

/**
 * Material Lab用。scene-MaterialLabにドラッグしただけのBullet Prefabインスタンスは、
 * 実際のGameManager.spawnBullet()/ShotRuntime経由で発射された時にしか呼ばれないinit()が
 * 一度も走らないため、発光パルス(グロー/3Dモデルemissive)が完全に無効なまま(Bullet.ts側の
 * _gm/_glowNode/_model3Dが全てnullで、update()内の判定がどれも素通りする)。
 *
 * このコンポーネントを、Bullet Prefabインスタンスの親ノード(例: scene-MaterialLabの"Bullet"
 * コンテナ)に1つ付けるだけで、配下の全Bulletに対してinit()を疑似的に呼び、
 * assets/resources/Data/BulletConfig.jsonの値を積んだダミーのGameManager相当オブジェクトを
 * 渡す。speed=0で初期化するので位置は動かず、寿命(life)も実質無限にしてMaterial Lab中に
 * 勝手に消えないようにする。
 */
@ccclass('MaterialLabBulletInit')
export class MaterialLabBulletInit extends Component {
    start() {
        resources.load("Data/BulletConfig", JsonAsset, (err, asset: JsonAsset) => {
            const config: any = (!err && asset) ? asset.json : {};
            // Bullet.update()が読むフィールドだけ持つ簡易オブジェクト(IGameManagerの全プロパティは
            // 不要 - 実際にBullet.tsが参照するのはisPaused/bulletXxxのみ)。
            const fakeGm: any = {
                isPaused: false,
                bulletPulseSpeed: config.bulletPulseSpeed,
                bulletGlowScale: config.bulletGlowScale,
                bulletGlowScalePulse: config.bulletGlowScalePulse,
                bulletGlowAlpha: config.bulletGlowAlpha,
                bulletEmissiveBase: config.bulletEmissiveBase,
                bulletEmissiveAmplitude: config.bulletEmissiveAmplitude,
            };

            const bullets = this.node.getComponentsInChildren(Bullet);
            for (const b of bullets) {
                const pos = b.node.position;
                b.init(pos.x, pos.y, Math.PI / 2, 0, 0, false, fakeGm);
                b.setLifeSeconds(1e9);
            }
            console.log(`[MaterialLabBulletInit] Initialized ${bullets.length} Bullet instance(s) with BulletConfig.json (pulseSpeed=${fakeGm.bulletPulseSpeed}).`);
        });
    }
}
