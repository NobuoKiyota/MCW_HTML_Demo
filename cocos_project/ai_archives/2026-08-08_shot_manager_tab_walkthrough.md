# MasterManager ShotManager タブ追加・機能完了報告

MasterManager パネル内に **ShotManager** タブを追加し、`ShotPatterns` に登録された全 JSON ファイルの一括表示・編集・リロード・保存およびグラフエディタへのジャンプ機能を完備いたしました。

---

## 主な実装内容

### 1. [package.json](file:///z:/HTMLShooterCocos/cocos_project/extensions/behavior-editor/package.json) & [main.js](file:///z:/HTMLShooterCocos/cocos_project/extensions/behavior-editor/main.js)
- **`listShotManagerData`**:
  - `ShotPatterns.csv` に登録されている各パターンについて、対応する `assets/resources/Data/ShotPatterns/<ID>.json` を解析。
  - **Type**: 発射ノード (`Fire`, `MultiFire`, `Missile` 等) の `type`
  - **Count**: 発射数（`params.count`。未指定時は `1`。※`Loop` ノードの `count` は除外）
  - **SP**: 発射速度（`params.speed`）
  - **DMG**: ダメージ値（`params.damage`）
  - **WT**: ウェイト時間（Wait ノードの `params.seconds`）
  - **PrefabName**: 使用弾丸プレハブ名（`params.prefabName`）
- **`saveShotManagerData`**:
  - テーブル上で変更された要素を受け取り、対象の `<ID>.json` の該当ノード `params` を更新・上書き保存し、Cocos Asset DB を自動リフレッシュします。
- **`listBulletPrefabs`**:
  - `assets/resources/Prefabs/Bullets/` 配下のプレハブ名を一覧取得し、PrefabName の入力補完 (datalist) を提供。

### 2. [index.js](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager/panels/default/index.js)
- **`ShotManager` タブの追加**:
  - MasterManager ナビゲーションバーに **`🎯 ShotManager`** タブを追加。
- **一括テーブル表示＆直接編集**:
  - `ID | Type | Count | SP (Speed) | DMG (Damage) | WT (Wait Sec) | PrefabName | Action` をわかりやすくレイアウト。
  - セル上で各数値を直感的に変更可能。
- **🔄 Reload ボタン**:
  - ディスク上の最新 JSON データを再読み込み。
- **💾 Save ボタン**:
  - テーブルで変更した内容を JSON ファイルに上書き保存。
- **🔍 Jump ボタン**:
  - 各行の `Jump` ボタンをクリックすると、自動的に `Shot Pattern` グラフエディタ画面に切り替わり、該当パターンのノードグラフが開きます。

---

## 使い方

1. Cocos Creator で Master Manager パネルを開きます。
2. 上部タブの **`🎯 ShotManager`** をクリックします。
3. `ShotPatterns` 内の全パターンのパラメータが一覧表示されます。
4. テーブル上で `Type`, `Count`, `SP`, `DMG`, `WT`, `PrefabName` を自由に編集し、**💾 Save** を押すと JSON が上書き保存されます。
5. グラフでノード構造を確認・調整したい場合は **🔍 Jump** ボタンを押すと、`Shot Pattern` グラフエディタへ即座に移動できます。
