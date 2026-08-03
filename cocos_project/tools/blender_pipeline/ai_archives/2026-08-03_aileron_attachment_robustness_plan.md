# 【実装計画】エルロン接続の精度向上・100%安定化 (Aileron Attachment Robustness Improvement)

## 背景と目標
Blender 3.6向け機体自動生成ツール（`fighter_gen_addon.py`）において、現在実験機能として実装されているエルロン接続は、親翼（主翼・サブウィング）の複雑な形状（強度のTwist、Taper、Dihedral、Sweep等）において、レイキャスト失敗や傾きのズレ（離脱・誤アライメント）が発生することがあります。

本計画では、親翼の後縁（Trailing Edge）に対する3Dレイキャストの多点サンプリングおよびフル3D姿勢（Pitch/Roll/Yaw）追従、ヒット失敗時のスマートフォールバック機構を導入し、エルロンの接続を100%安定化・高精度化します。実装完了後はClaudeCode向けの引継ぎ資料（`HANDOFF_ASSEMBLY_2026-08-03.md`）も更新・保存します。

## Proposed Changes

### Blender Addon Assembly Pipeline

#### [MODIFY] [fighter_gen_addon.py](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py)

1. **レイキャスト範囲と方向の動的最適化 (`sample_wing_trailing_edge_robust`)**:
   - 単一の固定位置からのレイキャストではなく、親翼のバウンディングボックスおよび局所厚みに応じた多層レイキャスト（上・下・前後からのスキャン）を実装。
   - レイキャスト成功時に交点座標（`hit_loc`）と表面法線（`hit_normal`）の両方を安定取得。

2. **フル3D姿勢アライメント (Pitch / Roll / Yaw の整合)**:
   - 従来の Z軸回転（`angle_z`）のみの平面アライメントから、後縁接線ベクトル（Span方向）および後縁法線ベクトル（Chord/Thickness方向）に基づいた 3D 回転行列 (Quaternion / Matrix) を構築。
   - Twist や Dihedral が強くかかった翼端付近であっても、エルロンが翼面から浮いたりめり込んだりせず、翼面にピッタリ追従するように配置。

3. **多点サンプリングとフィッティング**:
   - `x_local` 周囲の複数点（例: 3〜5点）をサンプリングして後縁の3D曲線・傾きを安定抽出。
   - 小さなサブウィングや複雑形状でレイキャストが一部外れた場合でも、有効なヒット点群から線形補間・フォールバックして正確に密着させる。

#### [NEW] [HANDOFF_ASSEMBLY_2026-08-03.md (更新追記)](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/HANDOFF_ASSEMBLY_2026-08-03.md)
- 今回の精度向上アルゴリズム（多点レイキャスト、3Dクォータニオンアライメント、レイキャストフォールバック）を追記し、ClaudeCodeへの引き継ぎを完了させます。

## Verification Plan

### 自動検証 (Headless Blender Execution)
- リポジトリ直下にテストスクリプト `test_aileron_robustness.py` を作成。
- `blender --background --python test_aileron_robustness.py` を実行。
- 極端なパラメータ（Twist 90°, Taper -0.9, スウィープ強, サブウィング最小など）を付与した機体 10〜20 パターンを自動生成し、エラーなく完了することを確認。
- `previews/aileron_test_*.png` として画像出力し、エルロン接続が完全に翼後縁にフィットしているか視覚的に確認。
