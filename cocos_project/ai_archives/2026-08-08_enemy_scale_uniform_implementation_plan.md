# EnemyPrefab の x, y, z 等倍率スケール調整機能の追加

EnemyPrefab（および敵ノード／3Dモデル）に対して、x, y, z の3軸へ一括で等倍率（uniform scale）を掛けられるように改造することは**十分可能です**。

---

## 概要

現状のプロジェクト構成では、敵の初期化およびスケール調整は以下の箇所で制御されています：

- **`Enemy.ts`**: 敵コンポーネント。3Dモデルを取り付ける際に `model3DScale`（1.0倍率）を用いて `modelNode.setScale(s, s, s)` のように等倍率をかけています。
- **`GameManager.ts`**: 敵のスポーン・インスタンス化処理（`_instantiateEnemy`）を担当。

ユーザー様のご要望に合わせて、**「敵ノード（EnemyPrefab）全体」または「3Dモデル」に対してインスペクターやデータ設定から容易に x, y, z 等倍率スケールをかけられるよう拡張**いたします。

---

## 提案する実装パターン

ニーズに合わせて主に以下の2つのアプローチが考えられます。

### パターンA: `Enemy.ts` インスペクターでの等倍率スケール設定（推奨）
- `Enemy.ts` に `@property` として `enemyScale: number = 1.0`（敵本体の等倍率スケール）を追加します。
- `init()` や `start()` 実行時に `this.node.setScale(this.enemyScale, this.enemyScale, this.enemyScale)` を呼び出し、x, y, z に一律等倍率をかけます。
- Inspector 上で単一の数値（例: `1.5` や `0.8`）を入力するだけで、x, y, z が自動的に全方向等倍率になります。

### パターンB: CSV / GameDatabase (`EnemyData`) 経由での等倍率スケール設定
- `Enemies.csv` および `EnemyData` に `Scale` 列（単一数値）を追加します。
- 敵の種類ごとに「小型敵 = 0.8倍」「ボス敵 = 2.5倍」などをCSVデータ上で定義し、`GameManager` から生成される際に自動的に x, y, z 等倍率を適用します。

---

## 変更予定ファイル

### [MODIFY] [Enemy.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/Enemy.ts)
- インスペクター調整用プロパティ `enemyScale` (number, default: 1.0) の追加。
- 初期化時（`init()` 内）に `this.node.setScale(s, s, s)` で等倍率スケールをセットする処理を追加。

### [MODIFY] [GameDataTypes.ts](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameDataTypes.ts) (パターンB選択時)
- `EnemyData` インターフェースに `scale?: number` を追加。

---

## 検証プラン

### 手動確認
1. Cocos Creator エディタまたはコード上で `enemyScale` の値を変更（例: 0.5, 1.5, 2.0）。
2. ゲームを実行し、敵Prefab生成時に x, y, z 全方向に正確に等倍率スケールが掛かっていることを確認。
