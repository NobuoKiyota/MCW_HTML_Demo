# 【実装計画】Canopy/Tail の胴体相対スケーリング & 翼の左右対称回転構造（Origin中心軸化）の根本修正

## 背景と問題の分析

ユーザー様からのフィードバックとスクリーンショット画像の解析により、以下の2大問題を確認しました：

1. **Canopy / Tail のサイズが巨大化し胴体を無視している問題**:
   - Canopy（コクピットガラス）が胴体全体を飲み込むほど大きく生成され、Tail（尾翼）も巨大で位置が前にめり込んでいる。
   - **原因**: 単体パーツ用の固定パラメータ（Length 2.5m, Width 2.0m 等）をそのまま使用しており、胴体の実際の長さ `fuselage_length` や胴体ハル幅 `hull_radius` に連動した相対比率（Relative Scaling）で計算されていなかった。

2. **ウィング・サブウィング・尾翼の回転（Rotation Y）やミラーが平行に傾く問題**:
   - Rotation Y（スウィープ角/たたみ角）を変更した際、左右の翼が対称に開閉（ハサミ/可変翼のように折りたたみ）せず、同じ向きに平行に傾いてしまう。
   - **原因**: 翼オブジェクトに `scale.x = -1.0` を適用した状態で `MIRROR` モディファイアをかけていたため、回転軸のハンドリング（右手系/左手系）が歪み、非対称な傾きが発生していた。

---

## 修正提案

### 1. Canopy と Tail の胴体比率（Fuselage-Relative Scaling）への完全刷新

#### Canopy (コクピットガラス)
- 胴体長 `fuselage_length` および配置位置 `attach_y` での胴体半径 `hull_radius` を測定し、以下の適切な比例関係で生成：
  - **Length**: `fuselage_length * 0.18 〜 0.28` (胴体長の約 1/5)
  - **Width**: `hull_radius * 0.8 〜 1.2` (胴体幅にジャストフィット)
  - **Height**: `Width * 0.45 〜 0.70` (自然な流線型ドーム)

#### Tail (尾翼)
- 胴体長および後部ハル幅に合わせた比率：
  - **Span (全幅)**: `fuselage_length * 0.20 〜 0.35`
  - **RootChord**: `fuselage_length * 0.12 〜 0.20`
  - **TipChord**: `RootChord * 0.35 〜 0.60`

---

### 2. 翼オブジェクトの Origin 中心軸化 (X=0) & `scale.x = -1.0` 廃止による完全対称構造

- **中心軸配置 (Origin at X=0)**:
  - 翼・サブウィング・尾翼のオブジェクト座標 `location` を、胴体中心線上の **`(0.0, attach_y, attach_z)`** に統一設定します。
- **`scale.x = -1.0` の完全撤廃**:
  - オブジェクトのスケールを標準の `(1.0, 1.0, 1.0)` に固定し、左右反転による回転軸のねじれを解消します。
- **ローカルルートオフセットの統合**:
  - 胴体ハルまでの距離 `attach_x` はメッシュローカル位置としてオフセットし、Mirror モディファイアを中心軸 `X=0` 基準で適用します。
- **効果**:
  - Blender 上で Rotation Y（また Rotation X, Z）を回した際、**左右の翼が可変翼（F-14やトーネード）のように完全に左右対称に折りたたみ・動く**ようになります。

---

## 変更対象ファイル

### [MODIFY] [fighter_gen_addon.py](file:///Z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py)
- `_generate_canopy_assembly`: 胴体長・ハル幅に基づく比率計算と密着配置の修正。
- `_generate_tail_assembly`: 胴体比率スケーリングの修正。
- `_generate_wing_pair`: 翼の Origin を `X=0` に配置し `scale.x = -1.0` を廃止、中心軸基準の正方向 Mirror 構造へ変更。

---

## 検証計画

### 1. Headless Blender 自動テスト (`test_assembly_scaling_and_symmetry.py`)
- 様々な形状・サイズの胴体（有機型、ウェッジ型、シリンダー型など）に対し、Canopy と Tail のサイズが胴体に対して適切な比率（比例関係）で収まっていることをバウンディングボックス計算で自動アサート。

2. **手動・描画確認**:
   - レンダリング画像を生成し、Canopy が自然なコクピットサイズで胴体上面にアタッチされているか、Tail が適切なサイズで尾部に設置されているか、Rotation Y 変更時に翼が左右対称に閉じられるかを確認。
