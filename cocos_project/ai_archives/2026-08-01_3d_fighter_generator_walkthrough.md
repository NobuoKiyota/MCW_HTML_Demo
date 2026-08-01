# 戦闘機パーツ生成パイプライン 開発完了ウォークスルー

指示書に記載されていたすべての課題（胴体の実寸法基準の接合位置ズレ、左右対称パーツの鏡像化・法線裏返り、noseカテゴリの欠落、マテリアル単色上書きによるディテール消失）を修正し、さらにBlender 3.6アドオンに全カテゴリの自動生成レシピを追加・拡張しました。

---

## 🚀 動作検証デモ

ブラウザ自動テストエージェントによる検証デモです。
初回起動時に `default_nose.glb` を含む全7パーツ（fuselage, nose, wings, engines, canopy, tails, weapons）が自動ブートストラップ生成され、胴体の実寸法を基準にパーツ同士が隙間なく結合し、さらに左右対称パーツが完全な鏡像（ミラー）として描画されることを確認しています。

![Verified Nose and Mirror Alignment Demo](file:///C:/Users/kiyot/.gemini/antigravity-ide/brain/bc7bd96a-0436-43e2-868c-a4df3d80a442/nose_and_mirror_verification_1785557061258.webp)

---

## 🛠️ 実装および修正の詳細

### 1. 組み立てエンジンの実寸法基準への追従
* **[FighterGenerator.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/FighterGenerator.ts)**:
  - 胴体オブジェクトの `THREE.Box3` を用いて、実際の長さ（Z）、幅（X）、高さ（Y）を動的に計算。
  - 機首（`nose`）、主翼（`wings`）、垂直尾翼（`tails`）、キャノピー（`canopy`）、エンジン、武器の配置オフセットを、胴体の実寸法に基づく動的数式に書き換えました。これにより、どれだけ長大・巨大な胴体アセットをロードしてもパーツの接合がズレなくなりました。

### 2. 左右対称パーツの完全な鏡像化と法線裏返り対策
* **[FighterGenerator.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/FighterGenerator.ts)**:
  - `createSymmetricPartPair()` にてスレーブ（右側パーツ）生成時に `scale.x *= -1` を適用して完全なミラー配置に変更しました。
  - ポリゴン巻き順反転に伴う法線の裏返り（面が消えて見える現象）を防ぐため、スレーブ側の全メッシュに対して、マテリアルの `side` プロパティに `THREE.DoubleSide` を適用しました。
* **[SymmetricManager.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/SymmetricManager.ts)**:
  - トランスフォーム同期処理において、マスターのスケール変更を反映しつつ `scale.x *= -1`（X軸ミラー）を保護するよう修正しました。

### 3. `nose` カテゴリの追加
* **[vite.config.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/vite.config.ts)** & **[App.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/App.ts)**:
  - パーツスキャンカテゴリおよびUIパーツドロップダウンに `nose` を追加。
  - セルフブートストラップ処理にて、`default_nose.glb` を `ConeGeometry` から自動生成・保存するロジックを実装。

### 4. マテリアル複数スロット（名前マッチング）による配色保護
* **[FighterGenerator.ts](file:///z:/HTMLShooterCocos/cocos_project/tools/fighter-generator/src/FighterGenerator.ts)**:
  - `applyMaterialToAllMeshes()` において、ロードしたGLBマテリアル内に `"glow"` や `"emissive"` や `"light"` という単語が含まれているかチェック。
  - マッチした場合はグローバルな発光マテリアル（`materials.engineCore`）を適用し、それ以外の場合にのみベース色（機体色やウイング色）を適用するようにして、パーツの細かいディテール配色を潰さないようにしました。

### 5. Blenderアドオンの全パーツ生成拡張 ＆ 高性能ウイング設計
* **[fighter_gen_addon.py](file:///z:/HTMLShooterCocos/cocos_project/tools/blender_pipeline/fighter_gen_addon.py)**:
  - 胴体に加え、主翼（WINGS）、垂直尾翼（TAILS）、エンジン（ENGINES）、キャノピー（CANOPY）、兵装（WEAPONS）の自動生成レシピを追加。
  - **主翼・尾翼の「はんぺん化」を脱却する高度なモデリングレシピを搭載**:
    - **折れ曲がり（ダブルデルタ）と三日月カーブ**: 前縁AC、後縁BCにそれぞれランダムな制御点 D（`front_points`）と E（`rear_points`）を打ち、折れ曲がり（線形補間）や流れるような三日月型（ベジェ補間）を自動算出。
    - **翼型（エアフォイル）断面**: 断面形状に数式 `1.8 * sqrt(Y_01) * (1.0 - Y_01)` を適用し、前縁が丸く膨らんで後縁に向かって鋭くなる流線型の断面を実現。
    - **翼端の押し潰し（エッジ化）**: 翼端に近づくほど上面の厚みを下面側に押し潰す（オフセットする）ロジックを入れ、ステルス機のようなシャープで鋭い翼端エッジを実現。
    - **高分割メッシュ**: 初期メッシュ分割数を **Vertices X=24, Y=12** に大幅に拡大し、滑らかな有機的ディテールを表現できるようにしました。

---

## 📈 検証データ

1. **Vite プロダクションビルド**:
   - `npm run build` コマンドがエラーなく正常終了することを確認。
2. **Cocosアセットへの最終GLB出力**:
   - Web画面上の `💾 Save directly to Cocos` ボタンより、合成したGLBアセットが `cocos_project/assets/resources/Gltf/` フォルダへ書き出されることを検証。
