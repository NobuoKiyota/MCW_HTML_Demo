# 背景システム一元化（SkyManager への統合 & Master Manager タブ改修）実装計画

## 概要
現在分散している `CloudManager`、`SkyBackgroundManager`、`ScrollingBackgroundManager`、`IngameBackgroundController` などの背景管理機能を、**単一の総合マネージャ `SkyManager` に一元化** します。
あわせて、Master Manager パネルの「☁️ CloudManager」タブを「🌌 **SkyManager**」タブへと進化させ、スカイ背景・動画背景・雲・星の全設定を1箇所でプレビュー・編集・保存できるようにします。

---

## 1. 新規統合マネージャ: `SkyManager.ts`
[NEW] [`SkyManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyManager.ts)

### 担当する背景レイヤー（下から上への重ね順を一括制御）
1. **最背面スカイ層 (`SkyLayer`)**:
   - `sky01.png`（800×4320）のシームレス縦リールループスクロール。
2. **動画/宇宙タイル層 (`VideoLayer`)**:
   - `BackgroundThemeManager` から選ばれた動画・タイルのスクロール＆半透明ブレンド。
3. **スターフィールド層 (`StarFieldLayer`)**:
   - 自機速度連動の星移動パーティクル ＆ 集中線バースト演出。
4. **遠景雲層 (`FarCloudLayer` / `BG_ONLY_LAYER`)**:
   - 敵・自機より奥を流れる半透明の雲（ランダムスポーン）。
5. **前景雲層 (`NearCloudLayer` / `FG_CLOUD_LAYER`)**:
   - 敵の手前・自機の奥を流れる臨場感のある雲。

### 主なAPI
- `setup(parent, farLayer, nearLayer, speedManager)`: 1回の呼び出しで全レイヤーを正しい重ね順・カメラレイヤーで構築。
- `applyTunables(...)`: スカイ速度/透明度、動画速度/透明度、自機速度連動を一括更新。
- `triggerBurst(...)`: ゴール到達・演出時の集中線バーストを一元トリガー。

---

## 2. `GameManager.ts` のリファクタリング
[MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- 個別のマネージャ生成コード（CloudManager, ScrollingBackgroundManager, SkyBackgroundManager等）をすべて撤去し、**`SkyManager` 1本のみを生成・管理** するように大幅にスリム化。
- ミッション開始時: `this.skyManager.setup(wrapper2, BG_ONLY_LAYER, FG_CLOUD_LAYER, this.speedManager);`

---

## 3. Master Manager パネルの「SkyManager」タブ化
[MODIFY] [`extensions/master-manager/panels/default/index.js`](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager/panels/default/index.js)
- タブ名称を「☁️ CloudManager」から「🌌 **SkyManager**」に変更。
- 設定カテゴリを整理：
  - **最背面スカイ設定**: 画像パス、スクロール速度、不透明度
  - **動画背景設定**: スクロール速度、不透明度、回転角度
  - **雲（Clouds）設定**: 発生間隔、遠景雲（透明度・サイズ・速度）、近景雲（透明度・サイズ・速度）
  - **星（StarField）設定**: 速度倍率、発生量
- これらを `assets/resources/Data/SkyConfig.json`（旧 `CloudConfig.json` から安全に移行）に一元保存・リアルタイム反映。

---

## 検証手順

### 1. ゲーム内動作確認
1. ゲーム（Ingame）を起動し、ミッションを開始。
2. 最背面スカイ（sky01）、動画（半透明ブレンド）、星パーティクル、遠景雲、近景雲が正しい重ね順で同時に美しく動作することを確認。
3. 自機加減速時に星・雲が自然に連動し、ゴール到達時に星の集中線バーストが発生することを確認。

### 2. Master Manager での一元編集確認
1. Master Manager の「🌌 SkyManager」タブを開く。
2. スカイ速度・透明度、動画透明度、雲の発生パラメータを変更して「Save」を押す。
3. ゲーム実行中に設定変更が即座に反映されることを確認。
