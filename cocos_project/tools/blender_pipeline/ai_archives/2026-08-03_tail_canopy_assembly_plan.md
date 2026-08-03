# 【実装計画】テール / キャノピー / ノーズの Raycast ベース Assembly 統合

## 背景と目標
現在 Blender 3.6 向け機体自動生成ツール（`fighter_gen_addon.py`）の Assembly 機能（`fightergen.assemble_fighter`）は「胴体 (Fuselage) + 主翼 (Main Wing) + サブウィング (Sub-Wing) + エルロン (Aileron)」の Raycast 接続までが統合されています。

本計画では、尾翼（Tails）、キャノピー（Canopy）、ノーズ（Nose）を胴体 `fuselage` の実評価メッシュ表面に対する Raycast 接続処理によって自動配置・アタッチし、単一オペレーターで完全に統合された戦闘機を一括自動生成できるように拡張します。

## Proposed Changes

### Blender Addon Assembly Pipeline

#### [MODIFY] [fighter_gen_addon.py](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py)

1. **尾翼の Raycast 接続生成 (`_generate_tail_pair`)**:
   - 胴体後部（`attach_y = fuselage_length * 0.70〜0.88`）の上面・側面ハル表面に対して Raycast スキャンを適用。
   - シングル垂直尾翼 (Single Vertical Tail) および ツイン / V字尾翼 (Twin / V-Tail with Mirror Modifier) の自動接続をサポート。
   - 仕上げモディファイア（Twist/Taper等）を Mirror モディファイアの前に適用する順序ルールを厳守。

2. **キャノピーの Raycast 接続生成 (`_generate_canopy_assembly`)**:
   - 胴体前上部（`attach_y = fuselage_length * 0.25〜0.42`）の上面ハル表面（+Z方向）にレイキャスト。
   - 胴体天面の高さ・傾き（Normal）に合わせてキャノピーの設置位置・角度を調整。
   - 専用のキャノピーマテリアル（半透明/ガラス調 `FighterGen_Canopy`）を適用。

3. **ノーズの Raycast / Tip 接続生成 (`_generate_nose_assembly`)**:
   - 胴体先端（`Y` 位置付近）の先端メッシュおよび表面法線をサンプリングし、先端にノーズディテールを隙間なく合致配置。

4. **UI と組み立てオペレーターの拡張**:
   - `assemble_tail_enable` (default True)
   - `assemble_canopy_enable` (default True)
   - `assemble_nose_enable` (default True)
   - 単体パーツの再リロールオペレーター (`FIGHTERGEN_OT_reroll_tail`, `FIGHTERGEN_OT_reroll_canopy`) を追加。

#### [NEW] [HANDOFF_ASSEMBLY_2026-08-03.md (更新追記)](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/HANDOFF_ASSEMBLY_2026-08-03.md)
- テール / キャノピー / ノーズの接続仕様・レイキャスト計算・パラメータ設定を引継ぎ資料に追記。

## Verification Plan

### 自動検証 (Headless Blender Execution)
- リポジトリ内に `test_full_assembly.py` を作成。
- `blender --background --python test_full_assembly.py` を実行。
- 10 パターンのランダムシードで全パーツ（Fuselage, MainWing, SubWing, Aileron, Tail, Canopy, Nose）を含む完全機体を自動組み立て。
- 各パーツが意図通りに生成され、位置が正常に親ハル表面にフィットしていることを自動テスト。
