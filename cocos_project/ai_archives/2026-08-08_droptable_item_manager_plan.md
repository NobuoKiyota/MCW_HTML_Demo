# DropTableIDManager および ItemManager の新設とドロップシステムのリファクタリング計画

敵のドロップシステムを「1敵につき1ドロップ定義」から「1敵につき1つのドロップテーブル（最大5個のアイテムID＋確率＋None対応）」に拡張し、さらにアイテム属性（Rare/Min/Max/Weight等）を管理する `ItemManager` を新設します。

---

## 概要・要約

1. **`Enemies` の `DropID` を `DropTableID` に変更**:
   - `Enemies.csv` のカラム名を `DropID` から `DropTableID` に変更し、`EnemyData` で `dropTableId` を参照するように改修します。

2. **`DropTableIDManager` (DropTables.csv) の追加・リファクタリング**:
   - タブ名を `DropTableIDManager` とし、1つの `DropTableID`（例: `DT_ZAKO`, `DT_BOSS`）に対して最大5つのアイテムID＋確率（`Rate_1`〜`Rate_5`）を登録可能な構造に変更します。
   - `None`（何も落とさない）という選択肢もアイテムIDとして選択可能にします。

3. **`ItemManager` (Items.csv) の新設**:
   - 既存のドロップデータにあったアイテム属性（`Min`, `Max`, `Weight`, `Rate`/Rarityなど）を新設する **`ItemManager`** （`Items.csv`）へ移植します。
   - MasterManager に `ItemManager` タブを追加し、アイテムのマスター情報を編集できるようにします。

4. **ゲーム内ランタイムの更新**:
   - 敵撃破時に `DropTableID` からドロップテーブルを取得し、最大5個の抽選枠（None以外かつ確率当選）から該当アイテムを特定。
   - `ItemManager` から該当アイテムの `Min`〜`Max` の個数を取得して生成・スポーンします。

---

## ユーザー確認・検討事項

> [!IMPORTANT]
> 1. **ドロップ抽選ロジックについて**:
>    最大5個のアイテム枠（`ItemID_1, Rate_1`, `ItemID_2, Rate_2`, ...）に対する抽選方式は「各枠ごとに独立して確率判定（判定が通れば複数ドロップも可能）」とする設計としています。`None` を選択した枠は判定スキップ（不変で0%）となります。
> 2. **CSVファイル構成**:
>    - 従来の `Drops.csv` を互換・分離し、新しく **`Items.csv`**（`ItemManager`用）と **`DropTables.csv`**（`DropTableIDManager`用）に切り替えます。
>    - 既存の `Drops.csv` 内のデータ（`DT_ZAKO`, `DT_BOSS` 等）は新しい `Items.csv` および `DropTables.csv` へ自動移行・整理されます。

---

## 変更内容詳細

### 1. Excels (CSV) データ構造
- **[NEW] `assets/Excels/Items.csv`** (ItemManager):
  - カラム: `ID,Name,PrefabName,Type,Rate,Min,Max,Weight,Note`
- **[NEW] `assets/Excels/DropTables.csv`** (DropTableIDManager):
  - カラム: `ID,ItemID_1,Rate_1,ItemID_2,Rate_2,ItemID_3,Rate_3,ItemID_4,Rate_4,ItemID_5,Rate_5,Note`
- **[MODIFY] `assets/Excels/Enemies.csv`**:
  - `DropID` カラムを `DropTableID` にリネーム。

### 2. MasterManager エディタ拡張 (`extensions/master-manager`)
- `CSV_FILES` に `Items.csv` (ラベル: `ItemManager`) と `DropTables.csv` (ラベル: `DropTableIDManager`) を追加。
- `SCHEMA` 設定:
  - `Enemies.csv`: `DropTableID` 🔗 `DropTables.csv` の `ID`
  - `DropTables.csv`: `ItemID_1`〜`ItemID_5` 🔗 `Items.csv` の `ID` （ドロップ候補に `None` を自動付与）

### 3. ゲームランタイム (`assets/scripts`)
- **[MODIFY] [GameDataTypes.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDataTypes.ts)**:
  - `ItemData` クラスを新設（`id`, `name`, `prefabName`, `type`, `rate`, `min`, `max`, `weight`, `note`）。
  - `DropTableData` クラスを改修（`id`, `items: { itemId: string, rate: number }[]`, `note`）。
  - `EnemyData`: `dropId` を `dropTableId` に更新。
- **[MODIFY] [GameDatabase.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDatabase.ts)**:
  - `itemsCsv` / `dropTableCsv` をパースする処理を追加。
  - `getItemData(id)` / `getDropTableData(id)` メソッドを提供。
- **[MODIFY] [Enemy.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/Enemy.ts)**:
  - `die()` 内のドロップ抽選処理を改修。敵の `dropTableId` からドロップテーブルを取得し、最大5枠のアイテムを独立抽選。`None` でないアイテムが当選した場合、`ItemData` の `Min`〜`Max` 範囲で個数をスポーン。

---

## 検証計画

### 自動 / 手動検証
1. **MasterManager パネルの表示確認**:
   - Cocos Creator エディタ上で MasterManager パネルを開く。
   - `Enemies` の `DropTableID` カラムが `DropTables.csv` の ID（`DT_ZAKO`, `DT_BOSS` など）にリンクしていることを確認。
   - `ItemManager` タブおよび `DropTableIDManager` タブが開け、`None` を含む補完リスト・編集・保存（`💾 Save`）が正常に行えるか確認。
2. **ゲーム実行時の動作検証**:
   - シーンを実行し、敵撃破時に設定された確率および個数（Min〜Max）でドロップアイテムが正常にスポーンするかログと挙動で確認。
