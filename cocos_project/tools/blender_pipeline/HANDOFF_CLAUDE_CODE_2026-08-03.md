# ClaudeCode 引継ぎ資料：Blender 3.6 機体自動生成ツール (2026-08-03)

## 1. 今回の修正・機能拡張サマリー

### ① Tail（尾翼）サイズ爆発バグの修正 (Sweep単位不一致)
- **原因**: `_generate_tail_assembly` 内で Sweep パラメータに角度 `20.0 ~ 45.0` を渡していたが、`build_tails_template`（Geometry Nodes）内では **メートル単位のY軸後退距離** として計算されていたため、Tail の Y寸法が 30m 超に爆発していた。
- **修正**: `tail_sweep = tail_root * _rr(rng, 0.4, 1.0)` のように胴体・RootChord 比例のメートル値に修正し、正常なサイズに収めた。

### ② 翼の左右対称性および Rotation Y (折りたたみ) 問題の根本解決
- **原因**: 従来は `Mirror` モディファイアを使用して片側(+X)のみ生成し、左側に反転コピーしていた。この構成では、オブジェクトの `Rotation Y` を操作した際に左右が同一方向に傾き（平行移動）、左右線対称な翼の折りたたみが不可能だった。
- **修正**:
  1. `build_wings_template` のスパン軸を `[0, 1]`（片側）から `[-Span/2, +Span/2]`（原点中心の両側一体生成）に変更。
  2. `n_x_offset = |sep.X| * 2.0` とし、正規化スパン位置 `[0, 1]` を中心(0)から両端(1)へ向けて定義。
  3. `Dihedral`（上反角）計算ノードに `ABS` を挟み、左右両翼が共に上向き（V字）に持ち上がるように修正。
  4. `_generate_wing_pair` から `Mirror` モディファイアを削除。単一オブジェクトの Origin `(0, attach_y, 0)` を中心に左右対称な翼を完全生成する仕様に変更。
  5. 単一オブジェクトで全生成されるため、Blender UI 上で `Rotation Y` を操作すると左右均等に翼をたたむ挙動が実現された。

### ③ パネルライン溝・ウェザリング・デカール化の拡張推進
- **パネルライン溝の拡張**: 現状胴体（Fuselage）のみに適用されている溝生成ノードを、翼（Wings）および尾翼（Tails）へ拡張中。
- **デカール/ロゴ的模様**: UV展開とテクスチャマッピングを伴うため規模が大きめの実装。設計・ノード構築段階。
- **エッジのウェザリング**: シェーダーで汚れやエッジのチッピング（塗装剥げ）を軽く表現するノード構築の途中で上限に到達。

---

## 2. 残課題・ClaudeCode への引継ぎ事項 (自宅環境での継続作業)

### ① Aileron（補助翼）のアタッチ位置調整
- **状況**: 翼が両側対称一体型メッシュ（X=[-Span/2, +Span/2]）に変更されたため、`_generate_aileron` 内の Raycast 探索座標 `x_center = -parent_span * span_frac` の計算軸を整合させる必要があります。
- **対策**: `sample_wing_trailing_edge` の探索軸を、両側生成された翼の実際の trailing edge (+X側および-X側) に合わせて左右ペアでアタッチ、または左右両側に制御面を生成するロジックへ調整してください。

### ② パネルライン溝・デカール・エッジウェザリングの完成
- 翼・尾翼へのパネルライン溝適用。
- シェーダーでのエッジ汚れ・チッピングノードの最終調整。

### ③ Canopy（キャノピー）および SubWing（副翼）の比例スケール最終微調整
- 胴体長に対する Canopy / SubWing / Tail のスケール係数は調整済みですが、シード値によって極端なアスペクト比が出ないよう、各パーツの `_rr(rng, min, max)` 範囲のフィードバック確認と微調整を継続してください。

---

## 3. 関連ファイル一覧
- [fighter_gen_addon.py](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py) - アドオン本体
- [install_addon.ps1](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/install_addon.ps1) - インストールスクリプト
- [diagnose_wing_symmetry.py](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/diagnose_wing_symmetry.py) - 検証・画像レンダリング用スクリプト
