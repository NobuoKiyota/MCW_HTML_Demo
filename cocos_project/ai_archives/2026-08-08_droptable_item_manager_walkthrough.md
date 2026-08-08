# DropTableIDManager および ItemManager 新設・ドロップテーブルリファクタリング完了報告

敵のドロップシステムを拡張し、1つの `DropTableID` に対して最大5個のアイテムID＋確率（`None` 含む）を設定可能な **`DropTableIDManager`** と、アイテムの各種プロパティ（Rate, Min, Max, Weight等）を管理する **`ItemManager`** を新設・移行いたしました。

---

## 主な変更点

### 1. Excels (CSV) データ構造の改修・新設
- **`Items.csv`** (**ItemManager**):
  - 属性: `ID,Name,PrefabName,Type,Rate,Min,Max,Weight,Note`
  - 従来のドロップ定義にあった `Min`, `Max`, `Weight` やアイテム基本情報を本マスターへ移設・管理。
- **`DropTables.csv`** (**DropTableIDManager**):
  - 属性: `ID,ItemID_1,Rate_1,ItemID_2,Rate_2,ItemID_3,Rate_3,ItemID_4,Rate_4,ItemID_5,Rate_5,Note`
  - 1つの `DropTableID` （例: `DT_ZAKO`, `DT_BOSS`）に対して最大5枠のアイテム＋確率を設定可能。
  - アイテム候補として **`None`** （ドロップなし）が選択可能。
- **`Enemies.csv`**:
  - `DropID` カラムを **`DropTableID`** に改修。

### 2. MasterManager エディタ拡張 (`extensions/master-manager`)
- タブに **`DropTableIDManager`** (`DropTables.csv`) と **`ItemManager`** (`Items.csv`) を新設・登録。
- `SCHEMA` リンクを設定：
  - `Enemies.csv`: `DropTableID` 🔗 `DropTables.csv` の `ID`
  - `DropTables.csv`: `ItemID_1`〜`ItemID_5` 🔗 `Items.csv` の `ID` （ドロップ候補に `None` を自動含む補完リスト）

### 3. ゲームランタイム (`assets/scripts`)
- **[GameDataTypes.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDataTypes.ts)**:
  - `ItemData` クラスおよび `DropTableData` クラスを定義。
  - `EnemyData.dropTableId` プロパティの適用（`dropId` 互換ゲッター/セッター保持）。
- **[GameDatabase.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDatabase.ts)**:
  - `Items.csv` および `DropTables.csv` のパース・リソース自動フォールバック読み込みを実装。
  - `getItemData(id)` / `getDropTableData(id)` ゲッターを追加。
- **[Enemy.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/Enemy.ts)**:
  - 敵死亡時 (`die()`) に `DropTableID` から最大5枠のドロップスロットをループ抽選。
  - `None` 以外かつ確率クリアしたアイテムについて `ItemData` 側の `Min`〜`Max` 範囲で個数を放出してスポーン。
