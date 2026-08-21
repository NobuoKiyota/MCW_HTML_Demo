# Ingame背景総合制御システム（Prefab化・StarField統合・専用調整Scene）実装計画

## 概要
現在個別で生成・動作している以下の背景要素を1つの統合コンポーネント **`IngameBackgroundController`** および **`StageBackground.prefab`** に統合し、さらにエディタ上でリアルタイムに見た目を調整・プレビューできる専用シーン **`Scene_BackgroundStudio`** を構築します。

### 統合する背景レイヤー一覧
1. **最背面スカイ** (`SkyBackgroundManager`): `sky01.png` 縦リールループ
2. **動画/宇宙タイル** (`ScrollingBackgroundManager`): 動画・テクスチャスクロール
3. **星フィールド** (`StarField`): 速度連動パーティクル星演出（バースト集中線対応）
4. **遠景雲** (`CloudManager` 奥層): `BG_ONLY_LAYER`
5. **前景雲** (`CloudManager` 手前層): `FG_CLOUD_LAYER`

---

## 全体アーキテクチャ

```text
[StageBackground.prefab] (IngameBackgroundController.ts)
 ├── [SkyLayer]         (SkyBackgroundManager)        - 最背面スカイ画像
 ├── [VideoLayer]       (ScrollingBackgroundManager)  - 動画/テクスチャタイル
 ├── [StarFieldLayer]   (StarField + ParticleSystem)  - 速度連動・星移動エフェクト
 ├── [FarCloudLayer]    (CloudManager - 奥)           - 透過雲(遠景)
 └── [NearCloudLayer]   (CloudManager - 手前)         - 透過雲(近景)
```

---

## 提案する実装内容

### 1. 統合マネージャ: `IngameBackgroundController.ts`
[NEW] [`IngameBackgroundController.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/IngameBackgroundController.ts)
- **機能**:
  - 各サブマネージャ（Sky, ScrollingVideo, StarField, Cloud）への参照を保持し、一括で `setup()`, `update()`, `clearAll()` を実行。
  - `GameSpeedManager` との連動を一括管理（自機速度に応じて星・雲・背景のパララックス速度を一括スケール）。
  - 各レイヤーの ON/OFF 切り替え（Inspectorのチェックボックス）。
  - 各レイヤーのスクロール速度比率、不透明度の一元管理。
  - スターフィールドの集中線バースト呼び出し（`triggerStarBurst(duration, speedMult, emissionMult)`）。

### 2. Prefab 作成: `StageBackground.prefab`
[NEW] `assets/resources/Prefabs/StageBackground.prefab`
- 統合コンポーネントおよび各サブレイヤーノード（UITransform, 各Manager, ParticleSystem2D等）を適切に階層配置したPrefab。
- コードから `resources.load("Prefabs/StageBackground", Prefab)` で即座にインスタンス化可能。

### 3. 専用プレビュー・調整シーン: `Scene_BackgroundStudio.scene`
[NEW] `assets/scenes/Scene_BackgroundStudio.scene`
[NEW] [`BackgroundStudioUI.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/BackgroundStudioUI.ts)
- **エディタ実行で即プレビュー**: プレイヤーや敵が出ない状態で背景全体が稼働。
- **リアルタイム調整UI**:
  - 自機速度シミュレータ（0〜2000km/h スライダー）
  - 各レイヤー（スカイ/動画/星/雲）の ON/OFF トグル
  - スカイ速度・不透明度スライダー
  - 動画速度・不透明度スライダー
  - 星のバースト（集中線）テストボタン

### 4. `GameManager.ts` の接続リファクタリング
[MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- 個別の背景生成コードを整理し、`StageBackground` Prefab（または `IngameBackgroundController`）を1つロード/生成して初期化する形に集約。

---

## 検証手順

### 1. 専用スタジオシーンでの検証
1. Cocos Creator で `Scene_BackgroundStudio` を開き、再生。
2. 最背面スカイ、動画、星、雲が重ね順通りに美しく表示・スクロールしていることを確認。
3. 速度スライダーを動かして、星の速さや雲のパララックス効果が連動することを確認。
4. バーストボタンを押して集中線演出を確認。

### 2. Ingame 本編での検証
1. 通常のゲームシーンでミッションを開始。
2. 背景全体（スカイ・動画・星・雲）が正常に機能し、ゲームプレイと連動することを確認。
