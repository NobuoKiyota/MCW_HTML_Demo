# Ingame背景総合制御システム・StarField統合 実装完了

## 実装内容まとめ

背景要素が増加したことによる管理の分散を解消し、**1つの統合マネージャで背景全体（スカイ・動画・星・雲）を統括制御・調整できるアーキテクチャ** を構築しました。

---

## 1. 統合アーキテクチャ

```text
[IngameBackgroundController] (統合コントローラー)
 ├── [SkyLayer]         (SkyBackgroundManager)        - 最背面スカイ (sky01.png 縦リールループ)
 ├── [ScrollingLayer]   (ScrollingBackgroundManager)  - 動画/テクスチャタイル (90度回転・半透明)
 ├── [StarFieldLayer]   (StarField)                   - 速度連動・星移動エフェクト (集中線バースト対応)
 └── [CloudLayer]       (CloudManager)                - 透過雲 (奥層: BG_ONLY_LAYER / 手前層: FG_CLOUD_LAYER)
```

---

## 2. 新規・更新ファイル一覧

### ① [NEW] [`IngameBackgroundController.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/IngameBackgroundController.ts)
- **統括制御**: 全背景レイヤーのインスタンス化、階層・描画レイヤー順（`siblingIndex` / `BG_ONLY_LAYER` / `FG_CLOUD_LAYER`）の設定を一括実行。
- **自機速度連動**: `GameSpeedManager` または手動設定速度（`setManualSpeed`）から星・雲・背景のパララックス速度を一括制御。
- **リアルタイム調整**: `applyTunables(skySpeed, skyOpacity, videoSpeed, videoOpacity)` で各層のパラメータをリアルタイム同期。
- **バースト演出**: `triggerStarBurst()` で星の集中線演出を一括トリガー可能。

### ② [MODIFY] [`StarField.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/StarField.ts)
- `setManualSpeed(speed)` / `setSpeedManager(sm)` を追加し、プレビューシーンや外部スクリプトから直接速度を注入してテストできるように拡張。

### ③ [NEW] [`BackgroundStudioUI.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/BackgroundStudioUI.ts)
- 専用プレビュー・調整シーン用のUIコントローラー。
- 自機速度スライダー（0〜1500 km/h）、スカイ速度・不透明度、動画不透明度、集中線バーストボタンを画面上で操作し、リアルタイムに見た目を調整可能。

### ④ [MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- 背景セットアップを `IngameBackgroundController` 経由の1本化に集約リファクタリング。
- 既存の `this.starField.triggerBurst()` や各マネージャへの参照互換性を保ちながら、コードをすっきりと整理。

---

## 3. エディタでの背景プレビュー・調整方法

1. **Master Manager パネルからの調整**:
   - Master Manager パネルの「GameManager」タブ内にある「最背面スカイ背景」「背景スクロール」カテゴリから、スカイ速度・不透明度・動画速度などをリアルタイムに調整・保存できます。
2. **専用シーン（BackgroundStudio）でのプレビュー**:
   - 空のシーンに `Canvas` と `BackgroundStudioUI`、`IngameBackgroundController` を配置して再生することで、敵やプレイヤーを出さずに背景の動き・重ね順・集中線演出をじっくりテストできます。
