# 戦闘機パーツ生成パイプライン 引き継ぎ指示書

対象: 他のAI IDE(Antigravity IDE等)でこのパイプラインを引き継ぎ、胴体(fuselage)以外のパーツ(wings/engines/canopy/tails/weapons)を追加し、パーツ同士の接合をきれいにする作業。

このドキュメントは Claude Code とのセッションで胴体(fuselage)パーツの生成パイプラインを構築・検証した結果をまとめたもの。**「検証済み」と「未検証・要確認」を明確に分けて書いている**ので、未検証の項目を事実として扱わないこと。

---

## 1. 全体構成(3層)

```
tools/blender_pipeline/fighter_gen_addon.py   … Blender 3.6 アドオン(パーツ形状生成)
        ↓ GLB書き出し
tools/fighter-generator/public/parts/{category}/*.glb  … パーツ素材置き場
        ↓ 自動スキャン
tools/fighter-generator/  (three.js製ブラウザツール, `npm run dev` → localhost:3000)
        ↓ 組み立て・配色・「Save to Cocos」
assets/resources/Gltf/*.glb  … Cocos Creatorが読み込む最終出力
```

**このセッションで確認できたこと**: 上記の3層は一気通貫で動作する(Blenderでfuselageを量産 → three.jsツールが自動検出 → 実際に画面上で組み立てて確認、まで実施済み)。ただし**Cocosのシーン/Prefabへの最終組み込み(PlayerShip_3D prefab差し替え等)はこのセッションでは行っていない**。それは別タスクとして扱うこと。

---

## 2. Blenderパイプライン(検証済み)

### 2.1 使うファイル
- `tools/blender_pipeline/fighter_gen_addon.py` — **これが正**。Blender 3.6の `編集 > プリファレンス > アドオン > インストール` で有効化すると、3Dビューポート右サイドバー(Nキー)に **FighterGen** タブが出る。
- `tools/blender_pipeline/generate_fuselage.py` — 開発初期に使ったヘッドレスCLI版のプロトタイプ。アドオンと同じGNレシピを含むが、現在はアドオンの方が範囲指定・ランダム化・ライブプレビューに対応していて上位互換。参照用として残しているだけで、以後はアドオンを使うこと(不要なら削除して良い)。

### 2.2 座標軸規約(★最重要・検証済み)
Geometry Nodesでパーツの「長さ」方向を**Blenderのローカル+Y軸(前方)**に割り当てること。

理由: `export_scene.gltf(..., export_yup=True)` でBlenderのZ-up座標系がglTFのY-up座標系に変換される際、**Blender Y → glTF -Z** にマッピングされる。three.js側の `FighterGenerator.ts` は一貫して**前後方向=Z軸**を前提にしている(`nose`の配置が `position.z = fuselageLength/2 + noseLength/2` など)。

- 最初、長さをBlenderのZ軸(上方向)に割り当てて実験したところ、書き出し後に機体が真上を向く不具合が発生した。Y軸に変更して解決・実機確認済み。
- **新しいパーツカテゴリを作るときも同じ規約を守ること**: ローカル+Y=前後(長さ)、ローカルZ=上下(高さ)、ローカルX=左右(幅)。

### 2.3 fuselageアドオンのGNレシピ(検証済み・他カテゴリの土台にできる)
`fighter_gen_addon.py` の `get_or_build_node_group()` にある構成:
1. `Curve Line`(ローカルY方向、長さ=Length)→ `Resample Curve` でセグメント分割
2. `Spline Parameter` の Factor(0〜1)を使い、3区間の半径プロファイルを計算:
   - `[0, MidPosition)`: FrontRadius → MidRadius
   - `[MidPosition, MidPosition+ShoulderLength)`: MidRadius一定(平行区間。ShoulderLength=0なら区間なし)
   - `[MidPosition+ShoulderLength, 1]`: MidRadius → RearRadius
3. `Set Curve Radius` → `Curve to Mesh`(プロファイルは `Curve Circle`、辺数=CrossSectionSides)
4. Z軸方向に `HeightRatio` でスケールして扁平化
5. GN側はシェーディングを強制しない(`Shade Smooth = False`)。実メッシュ化後に `use_auto_smooth` + `auto_smooth_angle`(35°)を設定し、断面の角は残しつつ長さ方向の湾曲は滑らかに見せる。
6. 円柱ブーリアン(Difference)でパネルライン(溝)を複数本彫る。角度・本数・中心位置はバリエーションごとにランダム化している(`add_panel_grooves`)。溝の位置はMidRadius基準のオフセットなので、先端/後端の細い部分では自動的に彫れない(貫通しない)ようになっている。
7. 最後に `Bevel` モディファイア(角度制限35°)で稜線を軽く面取り。

**この「ロフト→ディテール(ブーリアン)→オートスムーズ→ベベル」という流れは他カテゴリにも転用できる**。ただしロフトの基本形状(プロファイルカーブの作り方)はカテゴリごとに変える必要がある(翼は掃引角・テーパー比のある平面形状、胴体は回転体ロフト、など)。

### 2.4 量産・出力
- `FighterGenSettings` で各パラメータをmin/maxの範囲指定 → `Generate Variants` ボタンでビューポート上にグリッド配置され、ライブでチェックできる。
- `Export GLB on Generate` をONにするか、個別選択して `Export Selected to GLB` で `export_dir`(既定は `tools/fighter-generator/public/parts/fuselage/`)に書き出す。
- `get_or_build_node_group()` は毎回ノードグループを作り直す実装にしてある(スクリプト更新時に古いグラフが`.blend`内にキャッシュされて反映されない事故を防ぐため)。他カテゴリのGN関数を追加するときも同じ設計にすること。

---

## 3. three.js側(`tools/fighter-generator`)で分かっている制約(コードを読んで確認済み)

### 3.1 パーツカテゴリは6種で固定
`tools/fighter-generator/vite.config.ts` の `/api/list-parts` と `src/App.ts` の `categories` 配列は両方とも
```
['fuselage', 'wings', 'engines', 'canopy', 'tails', 'weapons']
```
の6つだけをスキャン・表示する。**「nose」はここに含まれていない** — `FighterGenerator.ts` 内で `selectedParts['nose']` を参照している箇所はあるが、対応するUI/スキャンが存在しないため、**現状nose用GLBを置いても絶対に選択されず、常にプロシージャルなフォールバック(円錐)にフォールバックする**。これは要修正点(§4参照)。

新しいカテゴリ(例えば独立した「detail(グリーブル)」カテゴリを作る場合)は、この2ファイルの `categories` 配列に追記しないとツールに認識されない。

### 3.2 パーツ配置オフセットは「固定の想定値」ベース(★要修正・全カテゴリに影響)
`FighterGenerator.generate()` 内の各パーツの位置(nose, canopy, wings, canard, intake, engines, tails, weapons 全部)は、`generateParams()` が返す**固定の想定パラメータ**(`fuselageLength: 4.0`〜`5.0`, `fuselageWidth: 0.6`〜`1.2`, `fuselageHeight`等、機体タイプごとにハードコードされた値)から計算されている。**実際にロードしたBlender製fuselage GLBの本当の寸法は一切参照していない**。

このセッションで実際に確認した症状: Blender製fuselageをロードすると、NoseCone(独立した円錐フォールバック)がフルサイズ乖離した位置に浮いて表示された。原因は上記の通り。翼やキャノピーも同様の計算式なので、fuselageの寸法が想定値から離れるほど同じズレが起きるはず(このセッションでは見た目上大きくは目立たなかったが、根本原因は共通)。

**推奨する直し方**: `generate()` の冒頭でロード済みfuselageオブジェクトの実バウンディングボックス(Length/Width/Height)を計算し、`generateParams()` の代わりにそれを各パーツのオフセット計算に使う。もしくは、Blender側の出力寸法を `generateParams()` の想定レンジに揃える運用ルールにする(コード修正は小さいが、パーツ追加のたびに手動で揃える必要があり長期的に脆い)。**前者を推奨**。

### 3.3 マテリアルは「パーツ内の全メッシュを問答無用で単色上書き」(要注意)
`applyMaterialToAllMeshes()` は、パーツ内のメッシュがいくつあっても全部に対して同じ色(fuselage色/wing色/canopy色/emissive色)を強制的にコピーする。**もしBlender側で「機体色」「発光ライン」のようにマテリアルスロットを複数使い分けたパーツを作っても、three.js側で全部同じ色に潰される。**

対応が必要なら、メッシュのマテリアル名(スロット名)でマッチングして個別に色を割り当てるようにこの関数を書き換える必要がある。今回のfuselageは単一マテリアルなので実害はまだ出ていない。

### 3.4 左右対称パーツの実装(★未検証・重要な注意)
`SymmetricManager.sync()` は、`_R`(スレーブ)側の位置X座標を `_L`(マスター)側の符号反転、回転はY/Z軸を符号反転、**scaleはそのままコピー(反転なし)**という実装になっている。`FighterGenerator.createSymmetricPartPair()` も、マスターとスレーブに**同じジオメトリのクローンをそのまま**使っており、**ジオメトリ自体をミラーリング(X方向にマイナススケール)する処理はどこにも無い**。

これは「位置を反転させているだけで、非対称な形状(後退角のある翼など)を実際に鏡像化はしていない」ように読める。ダミーの箱型パーツでは見た目上気づきにくいが、**Blenderで後退角つきの翼などを作って読み込ませたときに正しく鏡像表示されるかは未検証**。

**次の作業に着手する前に、必ず以下を確認すること**:
1. わかりやすい非対称マーカー(例: 片方の翼端だけ色を変える、または"L"の文字を彫る)をつけたテスト用wing GLBを1つ作る
2. three.jsツールで読み込み、`_L`と`_R`が正しく鏡像表示されるか実際に画面で確認する
3. 鏡像化されていなければ、`FighterGenerator.ts`側の修正(スレーブに `scale.x *= -1` を追加する等、ただしその場合は法線反転によるレンダリング面の裏表問題にも対応が必要)が必要になる

この確認を飛ばして翼・尾翼・武装パーツを量産すると、後から全部作り直しになるリスクがある。

---

## 4. 推奨する作業順序

1. **§3.2のオフセット計算バグを先に直す**(バウンディングボックスベースに変更)。これをやらないまま他パーツを増やすと、パーツを追加するたびに同じズレ問題を踏むことになる。
2. **§3.4の左右対称の実際の見え方を検証**(テストGLB1個で確認するだけなので数分で終わる)。ミラーリングが必要なら先に直す。
3. 上記2つが片付いてから、`fighter_gen_addon.py` に他カテゴリのGN生成関数を追加していく。優先順位の目安: wings → tails → engines → weapons → canopy(canopyは単純な殻形状なので後回しでも良い)。
4. 各カテゴリ追加のたびに `tools/fighter-generator` で実際に組み立てて確認する(このセッションでやったのと同じ手順: `npm run dev` → ブラウザで選択・生成・目視確認)。
5. 一通り揃ったら、Cocos Creator側のPrefab(`PlayerShip_3D` 等)への実際の差し替え・統合を行う。これは今回のセッションでは未着手。

---

## 5. 残っている小さな後始末

- `tools/fighter-generator/src/App.ts` に検証用のデバッグフック(`window.__fighterApp`, `window.__forceRender`)が残っている。ブラウザpaneのcompositorが有効でない環境で `requestAnimationFrame` が回らず1フレームも描画されない問題を回避するために追加したもの。実害はないが、不要なら削除して良い(残しておいても実運用上は無害な開発用フック)。
- `tools/blender_pipeline/previews/` 以下に検証用のレンダリング画像が溜まっている。清掃対象としてOK。
