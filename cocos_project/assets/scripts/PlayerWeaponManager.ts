import { _decorator, Component, Enum, CCInteger } from 'cc';
import { GameDatabase } from './GameDatabase';
import { computeWeaponLevelStats } from './WeaponCalc';
const { ccclass, property } = _decorator;

/**
 * デバッグ用: scene-BehaviorTest等でPlayerの初期装備武器をInspectorのプルダウンから選べるように
 * するためのコンポーネント。Weapons.csvのGroup(1~6、装備排他グループ)ごとに1つずつ、
 * その武器か"None"かを選択し、あわせてテスト用のLv(0=未強化)も指定できる
 * (最大6武器を同時装備する想定のテスト用ツール)。
 *
 * このコンポーネント自体はデータの保持と、選択内容→ShotPatternID配列+Lv別Scale倍率への変換のみを
 * 行う(PlayerController.tsを直接書き換えたりはしない)。実際の反映はBehaviorTestController.beginTest()が
 * playerControllerを解決した直後にresolveLoadout()を呼び、その結果を
 * playerController.setOverrideShotPatternIds()/setScaleMultipliers()へ渡す形で行う
 * (既定武器shotPatternIdは無視され、ここで選んだロードアウトに完全に置き換わる - 基本武器の単発連射に
 * 紛れて追加武器の効果が見えなくなるのを避けるため)。
 * (CLAUDE.mdの方針通り、シーン上のコンポーネント配線はEditor上で手動、コードはコード側の責務のみ)。
 *
 * 各GroupのプルダウンはWeapons.csv(2026年時点の35種)の内容をそのままハードコードしたEnum。
 * Cocosの@property({type: Enum(...)})はモジュール読み込み時に確定した値しか使えず、実行時にCSVを
 * 読んでから動的にInspectorの選択肢を作ることはできないため。Weapons.csvにGroup/武器を追加・変更
 * した場合はこのファイルのGROUP*_WEAPON_IDSも合わせて更新する必要がある(自動同期はされない)。
 */

function buildGroupEnum(weaponIds: string[]) {
    const obj: { [key: string]: number } = { None: 0 };
    weaponIds.forEach((id, i) => { obj[id] = i + 1; });
    return Enum(obj);
}

// Weapons.csv Group1 (Fire/Wide, Category A/B/C/F/G)
const GROUP1_WEAPON_IDS = [
    'WPN_BeamGun', 'WPN_WBeamGun', 'WPN_3WayBGun', 'WPN_5thShot', 'WPN_7thShot',
    'WPN_RapidFire', 'WPN_OverStream', 'WPN_HeavyShot', 'WPN_CrushCores',
    'WPN_DiffusionBeam', 'WPN_ScrewBeam', 'WPN_DistortionBeam', 'WPN_HyperionFlux',
];
// Weapons.csv Group2 (Fire, Category D/E)
const GROUP2_WEAPON_IDS = ['WPN_SideGun', 'WPN_SideCannon', 'WPN_Sovereign'];
// Weapons.csv Group3 (Missile, Category H)
const GROUP3_WEAPON_IDS = [
    'WPN_Missile', 'WPN_RapidMissile', 'WPN_HeavyMissile', 'WPN_HormingMissile',
    'WPN_SwarmSalvo', 'WPN_FatalLockOn', 'WPN_BunkerBuster',
];
// Weapons.csv Group4 (Laser, Category I)
const GROUP4_WEAPON_IDS = ['WPN_LaserCannon', 'WPN_SolarLay', 'WPN_BusterLance', 'WPN_AetherSlicer', 'WPN_Ouroboros'];
// Weapons.csv Group5 (Wave, Category J)
const GROUP5_WEAPON_IDS = ['WPN_ShockWave', 'WPN_DistortionSurge', 'WPN_GravitonNova'];
// Weapons.csv Group6 (Circle, Category K)
const GROUP6_WEAPON_IDS = ['WPN_SweapBlade', 'WPN_OrbitCutter', 'WPN_ThermalCleaver', 'WPN_DeathScythe'];

const Group1WeaponEnum = buildGroupEnum(GROUP1_WEAPON_IDS);
const Group2WeaponEnum = buildGroupEnum(GROUP2_WEAPON_IDS);
const Group3WeaponEnum = buildGroupEnum(GROUP3_WEAPON_IDS);
const Group4WeaponEnum = buildGroupEnum(GROUP4_WEAPON_IDS);
const Group5WeaponEnum = buildGroupEnum(GROUP5_WEAPON_IDS);
const Group6WeaponEnum = buildGroupEnum(GROUP6_WEAPON_IDS);

@ccclass('PlayerWeaponManager')
export class PlayerWeaponManager extends Component {

    @property({ type: Group1WeaponEnum, tooltip: "Group1(Fire/Wide系)の装備武器。Noneなら未装備" })
    public group1Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group1武器のテスト用Lv(0=未強化)。Weapons.csvのMaxLvが上限の目安" })
    public group1Lv: number = 0;

    @property({ type: Group2WeaponEnum, tooltip: "Group2(Fire系)の装備武器。Noneなら未装備" })
    public group2Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group2武器のテスト用Lv(0=未強化)" })
    public group2Lv: number = 0;

    @property({ type: Group3WeaponEnum, tooltip: "Group3(Missile系)の装備武器。Noneなら未装備" })
    public group3Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group3武器のテスト用Lv(0=未強化)" })
    public group3Lv: number = 0;

    @property({ type: Group4WeaponEnum, tooltip: "Group4(Laser系)の装備武器。Noneなら未装備" })
    public group4Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group4武器のテスト用Lv(0=未強化)" })
    public group4Lv: number = 0;

    @property({ type: Group5WeaponEnum, tooltip: "Group5(Wave系)の装備武器。Noneなら未装備" })
    public group5Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group5武器のテスト用Lv(0=未強化)" })
    public group5Lv: number = 0;

    @property({ type: Group6WeaponEnum, tooltip: "Group6(Circle系)の装備武器。Noneなら未装備" })
    public group6Weapon: number = 0;
    @property({ type: CCInteger, tooltip: "Group6武器のテスト用Lv(0=未強化)" })
    public group6Lv: number = 0;

    // 選択中の武器(Noneは除外)をWeapons.csv経由でShotPatternIDへ変換し、あわせてWeaponCalc経由で
    // 各武器の現在Lvでの実Scale値・WT(発射間隔)比率を計算して返す
    // (PlayerController.setScaleMultipliers()/setIntervalMultipliers()が使う倍率)。
    // intervalMultByPatternIdはWTMin基準の比率(WT@現在Lv ÷ WTMin)。WTMin=0(未設定)の武器は
    // ゼロ除算を避けて1.0(無補正)のまま扱う。
    // 該当WeaponIDがWeapons.csvに無い/ShotPatternID未設定の場合はコンソール警告のみでスキップする
    // (PlayerController.waitForShotPattern()側の「1つ失敗しても他は続行する」設計と揃えてある)。
    public resolveLoadout(): { shotPatternIds: string[]; scaleMultByPatternId: { [shotPatternId: string]: number }; intervalMultByPatternId: { [shotPatternId: string]: number } } {
        const db = GameDatabase.instance;
        const selections: { weaponId: string; lv: number }[] = [
            { weaponId: GROUP1_WEAPON_IDS[this.group1Weapon - 1], lv: this.group1Lv },
            { weaponId: GROUP2_WEAPON_IDS[this.group2Weapon - 1], lv: this.group2Lv },
            { weaponId: GROUP3_WEAPON_IDS[this.group3Weapon - 1], lv: this.group3Lv },
            { weaponId: GROUP4_WEAPON_IDS[this.group4Weapon - 1], lv: this.group4Lv },
            { weaponId: GROUP5_WEAPON_IDS[this.group5Weapon - 1], lv: this.group5Lv },
            { weaponId: GROUP6_WEAPON_IDS[this.group6Weapon - 1], lv: this.group6Lv },
        ];

        const shotPatternIds: string[] = [];
        const scaleMultByPatternId: { [shotPatternId: string]: number } = {};
        const intervalMultByPatternId: { [shotPatternId: string]: number } = {};
        for (const { weaponId, lv } of selections) {
            if (!weaponId) continue; // index -1 => None
            const weapon = db ? db.getWeaponData(weaponId) : null;
            if (weapon && weapon.shotPatternId) {
                shotPatternIds.push(weapon.shotPatternId);
                const stats = computeWeaponLevelStats(weapon, lv);
                scaleMultByPatternId[weapon.shotPatternId] = stats.scale;
                intervalMultByPatternId[weapon.shotPatternId] = weapon.wtMin > 0 ? stats.wt / weapon.wtMin : 1.0;
            } else {
                console.warn(`[PlayerWeaponManager] Weapon '${weaponId}' がWeapons.csvに見つからない、またはShotPatternID未設定です。この武器はスキップされます。`);
            }
        }
        return { shotPatternIds, scaleMultByPatternId, intervalMultByPatternId };
    }
}
