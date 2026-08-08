# ItemManager によるアイテム効果・部品・解放トリガーの一元管理化完了報告

コード内に散在していた「アイテム効果のハードコード分岐（`if (id === "ItemRepair")` 等）」を完全撤廃し、**`ItemManager` (`Items.csv`) 上で回復量・バフ数値・持続時間・素材/トリガー種別を一元管理できる汎用データ駆動システム**へとリファクタリングいたしました。

---

## 🛠️ 主な変更点

### 1. `Items.csv` に効果関連カラムを追加
- **追加カラム**: `EffectType`, `EffectValue`, `Duration`
- **属性分類 (`EffectType`)**:
  - `Heal`: HP回復（`EffectValue` = 回復量）
  - `PowerUp`: 攻撃力バフ（`EffectValue` = バフ倍率, `Duration` = 継続秒数）
  - `RapidFire`: 連射速度バフ（`EffectValue` = バフ倍率, `Duration` = 継続秒数）
  - `Credit`: 所持金・クレジット（`EffectValue` = 加算量）
  - `Exp`: 経験値・成長（`EffectValue` = 獲得量）
  - `Score`: スコア（`EffectValue` = 加算量）
  - `Material`: 武器解放・改造・新機体作成用の部品・素材アイテム（`EffectValue` = 獲得量）
  - `UnlockTrigger`: 解放フラグ・キーパーツアイテム
  - `None`: 効果なし（観賞用・収集用アイテム）

### 2. MasterManager エディタ（`extensions/master-manager`）の拡張
- `Items.csv` の `EffectType` カラムに対して、上記9種類のプリセット効果タイプ（`Heal`, `PowerUp`, `RapidFire`, `Credit`, `Exp`, `Score`, `Material`, `UnlockTrigger`, `None`）がドロップダウン形式で選べる補完機能を追加しました。

### 3. ゲームランタイム (`GameManager.ts` / `GameDataTypes.ts` / `GameDatabase.ts`)
- **[GameDataTypes.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDataTypes.ts)**:
  - `ItemData` に `effectType`, `effectValue`, `duration` を追加。
- **[GameDatabase.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDatabase.ts)**:
  - `Items.csv` から効果パラメータを自動パースするよう更新。
- **[GameManager.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)**:
  - `onItemCollected()` 内のハードコード分岐を徹底破棄し、`ItemData.effectType` に応じた汎用処理スルー構造へとリファクタリング。
  - 新しい部品・トリガーアイテム（`Material` / `UnlockTrigger`）を取得した際も、インベントリ/リソースとして自動管理・通知ログが表示されます。
