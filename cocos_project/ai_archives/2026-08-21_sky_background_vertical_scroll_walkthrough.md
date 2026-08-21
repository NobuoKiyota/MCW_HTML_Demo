# Ingame最背面スカイ背景（sky01.png 縦リールループスクロール）実装完了

## 実装内容まとめ

Ingame中の背景レイヤー構造において、最背面に `assets/resources/Materials/sky01.png`（800×4320）をシームレスに縦ループスクロールさせる専用マネージャ `SkyBackgroundManager` を新規追加・統合しました。

### 1. レイヤー構造（下から上への重ね順）
```text
【最前面】 UI / HUD
    ↑
【前景】   プレイヤー (3D) / 透過雲(近: FG_CLOUD_LAYER / CloudManager)
    ↑
【メイン】 敵機 / 弾 / エフェクト
    ↑
【背景】   透過雲(中・遠: BG_ONLY_LAYER / CloudManager)
    ↑
【背景】   動画背景 (BG_ONLY_LAYER / ScrollingBackgroundManager / 半透明合成)
    ↑
【最背面】 ★ sky01.png 縦リールループ背景 (BG_ONLY_LAYER / SkyBackgroundManager / 新規)
```

---

## 変更・追加されたファイル

### 1. [NEW] [`SkyBackgroundManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyBackgroundManager.ts)
- `sky01.png` を動的ロードし、画面幅（`CANVAS_WIDTH`）にアスペクト比を維持してフィットさせたタイルを縦に並べて配置。
- 画面下端を抜けたタイルを上端に再配置するコンベアベルト（リール）方式により、完全なシームレス無限縦スクロールを実現。
- `scrollSpeedPxPerSec`（デフォルト: 30px/sec）および `opacity`（不透明度）をリアルタイム調整可能。

### 2. [MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- `resolveInGameReferences()` で `SkyBackgroundManager` をインスタンス化し、Canvasラッパー直下の最背面（`setSiblingIndex(0)`）に配置。
- `update()` ループで設定パラメータを毎フレーム同期。
- `GameManagerConfig.json` から `skyScrollSpeedPxPerSec` と `skyOpacity` を自動読み込み。

### 3. [MODIFY] [`GameManagerConfig.json`](file:///z:/HTMLShooterCocos/cocos_project/assets/resources/Data/GameManagerConfig.json)
- `skyScrollSpeedPxPerSec: 30`（スクロール速度: 30px/s）
- `skyOpacity: 255`（不透明度: 最大）
のデフォルト設定値を追加。

### 4. [MODIFY] [`extensions/master-manager/panels/default/index.js`](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager/panels/default/index.js)
- Master Manager パネル（GameManagerタブ）に「最背面スカイ背景」カテゴリ（スクロール速度・不透明度の調整スライダー）を追加。

---

## 動作確認・テスト
- `SkyBackgroundManager` が `BG_ONLY_LAYER` に登録され、`siblingIndex: 0` で動画背景や雲の背後に正しく配置されることを確認。
- `GameManagerConfig.json` による設定パラメータの読み込みおよび Master Manager エディタからの値変更に対応していることを確認。
