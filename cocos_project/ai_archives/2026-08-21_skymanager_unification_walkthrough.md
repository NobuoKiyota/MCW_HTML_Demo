# 背景システム一元化（SkyManager への完全統合）実装完了

## 実装内容まとめ

従来 `CloudManager`、`SkyBackgroundManager`、`ScrollingBackgroundManager`、`IngameBackgroundController` に分かれていた全背景機能を、**単一の総合マネージャ `SkyManager` に一元化** しました。
あわせて、Master Manager パネルのタブを「🌌 **SkyManager**」へと進化させ、すべての背景設定を1箇所で快適に調整・保存できるようにいたしました。

---

## 1. 一元化されたレイヤー構造 (下から上への重ね順)

```text
[SkyManager] (単一の総合マネージャ)
 ├── 1. [SkyLayerGroup]   (最背面スカイ / sky01.png 縦リールループスクロール) - siblingIndex: 0
 ├── 2. [VideoLayerGroup] (動画/テクスチャタイルスクロール & 半透明ブレンド)   - siblingIndex: 1
 ├── 3. [StarFieldLayer]  (自機速度連動の星パーティクル & 集中線バースト)      - BG_ONLY_LAYER
 └── 4. [CloudLayer]      (透過雲: 遠景=BG_ONLY_LAYER / 前景=FG_CLOUD_LAYER)
```

---

## 2. 新規・更新ファイル一覧

### ① [NEW] [`SkyManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyManager.ts)
- スカイ背景（画像リールループ）、動画背景（MP4/画像タイル）、星パーティクル（速度連動）、雲（遠景/近景ランダム生成）の **全背景ロジックを1つのクラスに集約**。
- `SkyManager.instance` シングルトン。
- `assets/resources/Data/SkyConfig.json`（旧 `CloudConfig.json` 互換）から全パラメータを自動ロード＆リアルタイム反映。
- `triggerBurst(duration, speedMult, emissionMult)` で集中線バーストを一元トリガー。

### ② [NEW] [`SkyConfig.json`](file:///z:/HTMLShooterCocos/cocos_project/assets/resources/Data/SkyConfig.json)
- スカイ背景設定（速度、不透明度、有効フラグ）
- 動画背景設定（速度、不透明度、回転角度、有効フラグ）
- 星フィールド設定（速度倍率、発生量、有効フラグ）
- 雲演出設定（生成頻度、遠景/近景のパラメータ）
を一括保持する統合設定JSON。

### ③ [MODIFY] [`GameManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/GameManager.ts)
- 複数のマネージャ生成コードを撤去し、**`SkyManager` 1本のみをセットアップ・管理** する形に大幅スリム化。
- `this.skyManager.setup(...)` および `this.skyManager.triggerBurst(...)` に接続。

### ④ [MODIFY] [`BackgroundStudioUI.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/BackgroundStudioUI.ts)
- `SkyManager` と直接連携するUIコントローラーへ更新。

### ⑤ [MODIFY] [`extensions/master-manager`](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager)
- タブ名を「🌌 **SkyManager**」に変更。
- 最背面スカイ、動画背景、星演出、雲演出の全パラメータを一括編集・保存できるようにスキーマとメインプロセスを改修。

---

## 3. 確認・調整方法
1. **ゲーム実行**:
   - 通常通りゲームを起動するだけで、`SkyManager` が自動的に全背景レイヤーを完璧な重ね順で展開・スクロールします。
2. **Master Manager での一元調整**:
   - 上部メニュー **[拡張機能] → [Master Manager]** を開き、「🌌 **SkyManager**」タブを選択。
   - スカイ、動画、星、雲のパラメータを1つの画面でまとめて調整・保存できます。
