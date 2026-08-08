# MasterManager への ShotManager タブ追加実装プラン

MasterManager パネル内に **ShotManager** タブ（一覧表示・編集・ジャンプ機能）を追加し、`ShotPatterns.csv` に登録されている各 JSON のパラメータを一括管理・上書き保存できるように拡張いたします。

---

## 要件のまとめ

1. **対象データの抽出**:
   - `ShotPatterns.csv` に登録されている ID、かつ実体 JSON (`assets/resources/Data/ShotPatterns/<ID>.json`) が存在しているパターンが対象。
2. **テーブル項目**:
   - **ID**: パターンID（例: `1Shot01`, `SPREAD01`）
   - **Type**: 発射ノードの `type`（`Fire`, `MultiFire`, `Missile` など）
   - **Count**: 発射数（`Fire`/`MultiFire` 等の `count` パラメータ。指定がなければ `1`。※`Loop` ノードの `count` は除外）
   - **SP**: 発射ノードの `speed` 値
   - **DMG**: 発射ノードの `damage` 値
   - **WT**: Wait ノードの `seconds` 値
   - **PrefabName**: 発射ノードの `prefabName` 値
   - **Jump**: クリックで該当パターンを `Shot Pattern` グラフエディタ上で直接開くジャンプ機能
3. **リロード＆上書き保存**:
   - **Reload ボタン**: ディスク上の最新 JSON ファイル状態を再読み込みしてテーブル表示を更新。
   - **Save ボタン**: テーブル上で変更したパラメータを対象 JSON ファイルの各ノード内パラメータに反映して上書き保存し、Asset DB を更新。

---

## 提案する実装設計

### 1. `extensions/behavior-editor/main.js` (IPCハンドラの拡張)
- **`listShotManagerData()`**:
  `ShotPatterns.csv` に登録された全 ID について JSON を読み込み、発射系ノード（Fire/MultiFire/Missile等）および Wait ノードを解析してテーブル表示用データを集約して返します。
- **`saveShotManagerData(items)`**:
  テーブル上で変更された項目を受け取り、対象の JSON ファイルを読み込んで該当ノードの `params`（type, count, speed, damage, seconds, prefabName）のみを正確に更新・上書き保存します。

### 2. `extensions/master-manager/panels/default/index.js` (UI・パネルの拡張)
- **タブバーへの「ShotManager」タブの追加**:
  Master Manager のナビゲーションに `ShotManager` タブを追加。
- **ShotManager 専用ビュー描画**:
  - `ID`, `Type`, `Count`, `SP`, `DMG`, `WT`, `PrefabName`, `Jump` のテーブル表示。
  - テーブルセル上での直接編集UI（Type, Count, SP, DMG, WT, PrefabName）。
  - **Reload** ボタンと **Save** ボタンの配置。
- **Jump（ジャンプ機能）**:
  - 該当行の Jump ボタンを押すと、表示モードを `Shot Pattern` グラフエディタに切り替え、対象の `ID` をロードしてノードグラフ画面を開きます。

---

## 変更予定ファイル

### [MODIFY] [main.js](file:///z:/HTMLShooterCocos/cocos_project/extensions/behavior-editor/main.js)
- `listShotManagerData` と `saveShotManagerData` メソッドの追加。
- 発射ノードおよび Wait ノードのパラメータ自動抽出・書き換えロジックの実装。

### [MODIFY] [package.json](file:///z:/HTMLShooterCocos/cocos_project/extensions/behavior-editor/package.json)
- IPC メッセージ `list-shot-manager-data` および `save-shot-manager-data` の登録。

### [MODIFY] [index.js](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager/panels/default/index.js)
- `ShotManager` タブの HTML/CSS 追加。
- ShotManager テーブルのレンダリング、編集ハンドラ、Reload/Save ボタンイベント、Jump アクションの実装。

---

## 検証プラン

1. **データ読み込みの確認**:
   - `MasterManager` パネルを開き、`ShotManager` タブを選択して各 ShotPattern JSON の `Type`, `Count`, `SP`, `DMG`, `WT`, `PrefabName` が正しくテーブルに一覧表示されることを確認。
2. **編集と保存の確認**:
   - `SP` や `DMG` や `WT` などをテーブル上で編集し、「Save」ボタンをクリック。
   - `assets/resources/Data/ShotPatterns/*.json` が正しく更新されること、および「Reload」ボタンで最新状態が再読み込みされることを確認。
3. **Jump 機能の確認**:
   - `Jump` ボタンをクリックした際、`Shot Pattern` グラフエディタ画面に自動遷移し、該当パターンのノードグラフが開かれることを確認。
