# Ingame最背面スカイ背景（sky01.png 縦リールループスクロール）実装計画 (プランA)

## 概要
`assets/resources/Materials/sky01.png`（800×4320）をゲーム内（Ingame）の最背面背景として常駐させ、リールのようにシームレスに縦ループスクロールさせる専用マネージャ `SkyBackgroundManager` を実装します。
既存の動画背景（`ScrollingBackgroundManager`）および雲レイヤー（`CloudManager`）の背後に配置することで、動画の半透明ブレンドやフェード時にも常に美しい空が広がるリッチな多層背景を実現します。

---

## レイヤー構成

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

## 提案する変更内容

### 1. 新規コンポーネント: `SkyBackgroundManager.ts`
[NEW] [`SkyBackgroundManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyBackgroundManager.ts)
- **役割**: `sky01.png` をロードし、2枚のタイルを縦に隙間なく並べて下方向にスクロールさせる。
- **リールループ機構**:
  - タイルが画面下端（`-wrapMargin`）を抜けたら、もう1枚のタイルの上端（`other.y + tileHeight`）へ即座に再配置し、継ぎ目のない完全な無限ループを実現。
  - 画面幅（`GAME_SETTINGS.CANVAS_WIDTH`）に合わせてアスペクト比を保ったサイズにスケーリング。
- **調整可能パラメータ**:
  - `scrollSpeedPxPerSec`: スクロール速度（デフォルト: 40px/sec などのゆっくりしたスクロール）。
  - `speedScaleWithGame`: 自機の飛行速度（`GameSpeedManager`）に連動させるか、独立した一定速度か。
  - `opacity`: 不透明度（0〜255、デフォルト: 255）。

### 2. `GameManager.ts` への組み込み
[MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- `resolveInGameReferences()` 内で `SkyBackgroundManager` を生成し、`wrapper2`（Canvasラッパー）の直下・最背面（`siblingIndex: 0`）に配置してセットアップ。
- `update()` で速度や不透明度のパラメータを同期。
- `GameManagerConfig.json` から設定値（`skyScrollSpeedPxPerSec`, `skyOpacity`）を読み込めるように対応。

### 3. 設定ファイル & Master Manager 更新
[MODIFY] [`GameManagerConfig.json`](file:///z:/HTMLShooterCocos/cocos_project/assets/resources/Data/GameManagerConfig.json)
- `skyScrollSpeedPxPerSec`（例: 40）
- `skyOpacity`（例: 255）
のデフォルト値を追加。

---

## 検証手順

### 手動確認
1. ゲームを起動し、ミッションを開始（Ingame画面へ遷移）。
2. 最背面に `sky01.png` が表示され、継ぎ目なくゆっくり縦スクロール（リールループ）していることを確認。
3. その上に動画背景（半透明）や雲（近・中・遠）が正しく重なって描画されていることを確認。
4. ミッションリトライや画面切り替え時にもノードやテクスチャが正常に再生成・クリーンアップされることを確認。
