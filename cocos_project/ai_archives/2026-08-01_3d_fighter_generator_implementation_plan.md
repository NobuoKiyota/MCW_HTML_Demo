# 戦闘機パーツ生成パイプライン 修正・拡張実装計画

「引き継ぎ指示書」に基づき、以下の3つの主要な修正（接合オフセットのバグ修正、鏡像反転の検証と修正、マテリアルスロット上書きの修正）を行った後、Blenderアドオンに他パーツカテゴリの自動生成処理を追加します。

本計画は自動承認指示に基づき、直ちに実行に移ります。

---

## Proposed Changes

### [Component: Three.js UI & Loader Fixes]

#### [MODIFY] [vite.config.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/vite.config.ts)
- パーツスキャンカテゴリ（`categories`）に `nose` を追加します。

#### [MODIFY] [App.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/App.ts)
- スキャンおよびプリロード対象カテゴリに `nose` を追加。
- `bootstrapDummyParts()` で `nose` 用のダミーGLB（ConeGeometry）を生成・保存するロジックを実装。
- lil-gui のアセット選択リストに `nose` を追加。

---

### [Component: 3D Assembly & Sync Engine Fixes]

#### [MODIFY] [FighterGenerator.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/FighterGenerator.ts)
- **実バウンディングボックスによる動的接合オフセット算出**:
  - `generate()` の冒頭で、ロードされた胴体アセット（`MainFuselage`）の実バウンディングボックス（`THREE.Box3`）を計算し、実寸法の長さ（Z）、幅（X）、高さ（Y）を取得。
  - 機首（`nose`）、主翼（`wings`）、エンジン（`engines`）、垂直尾翼（`tails`）、キャノピー（`canopy`）等のアタッチ位置（`offset`）を、上記で得た実寸法に基づいて動的に計算し、ズレを解消します。
- **対称パーツの鏡像（ミラー）修正と法線裏返り対応**:
  - `createSymmetricPartPair()` でスレーブ（右側パーツ）を生成・配置する際、`scale.x *= -1` を適用して完全な鏡像とします。
  - 鏡像化によるポリゴン巻き順反転で面が裏返るのを防ぐため、スレーブ側の全メッシュに対して、マテリアル設定に `material.side = THREE.DoubleSide` を適用します。

#### [MODIFY] [FighterGenerator.ts (マテリアル適用処理)](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/FighterGenerator.ts)
- **マテリアル複数スロット（名前マッチング）のサポート**:
  - `applyMaterialToAllMeshes()` が全メッシュを単色で塗りつぶす動作を修正します。
  - アセット内の各Meshに割り当てられているマテリアルの名前（`material.name`）をチェック。
  - マテリアル名に `"glow"` や `"emissive"` 等が含まれる場合は、グローバルな発光色（`materials.engineCore`）を適用し、それ以外の場合に機体ベース色（`materials.fuselage` や `materials.wing`）を適用するようにして、パーツの細かいディテール配色を保護します。

---

### [Component: Blender Addon Extension]

#### [MODIFY] [fighter_gen_addon.py](file:///z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py)
- **他カテゴリパーツ（wings/tails/engines/canopy/weapons）のGeometry Nodesレシピの実装**:
  - `addon` 側に、各パーツに対応するGeometry Nodes生成関数（`build_wings_node_group`, `build_engines_node_group` 等）を順次追加。
  - **規約（ローカル+Yが前方・長さ）**をすべての生成処理で厳守。
  - UIパネルに各パーツの生成パラメータ入力欄、および「Generate wings」等の実行ボタンを追加。

---

## Verification Plan

### Automated Tests
- `npm run build` が通ることを確認。

### Manual Verification
1. ツールを起動し、初期起動時のダミーパーツに `default_nose.glb` が含まれ、ブートストラップが成功することを確認。
2. 胴体モデルを別のバリエーションに変更した際、機首や主翼の接合位置が自動追従し、浮いたり食い込んだりしないことを確認。
3. 非対称ダミー翼アセットを作成・読み込ませ、右翼が正しく鏡像（ミラー）反転して配置され、かつ両面が正しくレンダリングされるか確認。
4. Blenderアドオンから他パーツ（wings等）をGLB出力し、Three.js側で読み込ませて正しく組み立てられることを確認。
