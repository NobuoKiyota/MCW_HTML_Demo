# MasterManager Enemies への Scale カラム追加報告

MasterManager パネル（Master Manager Extension）の **Enemies** テーブルに、新しく **Scale** カラムを追加いたしました。

---

## 変更点

1. **[Enemies.csv](file:///z:/HTMLShooterCocos/cocos_project/assets/Excels/Enemies.csv)**
   - ヘッダーに `Scale` カラムを追加しました（`SpeedMult` の隣）。
   - 各敵データ行の `Scale` の初期値として `1` を設定しました。

2. **Master Manager パネル（Cocos Extension）**
   - パネルは CSV の列構造を自動検出してテーブルを描画する仕様になっているため、CSV への `Scale` 追加により **Enemies** タブ上でそのまま `Scale` の数値を表示・編集・保存可能です。
   - `GameDatabase.ts` および `Enemy.ts` は既に先ほどの修正で CSV の `Scale` 値を自動読み込みし、ゲーム内の敵Prefabに x, y, z 等倍率で反映する準備が整っています。
