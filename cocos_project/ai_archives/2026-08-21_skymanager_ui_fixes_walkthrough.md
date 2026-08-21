# Master Manager UI改修 & スカイ画像パス入力・正規化 完了

## 実装・改修内容

### 1. Master Manager パネルの入力コンポーネント改修
- **チェックボックス（Boolean）対応**:
  - `enableSky`（スカイ背景 有効）、`enableVideo`（動画背景 有効）、`enableStarField`（星演出 有効）、`enableClouds`（雲演出 有効）の入力欄を、**直感的なチェックボックス（`<input type="checkbox">`）** で表示・操作できるように改修しました。
- **文字列（String）入力対応**:
  - `skyResourcePath`（スカイ 画像パス）の入力欄を、従来の数値型（number）から **文字列入力テキストボックス（`<input type="text">`）** に修正しました。

### 2. スカイ画像パスの柔軟な正規化（Path Normalization）
- [`SkyManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyManager.ts) に `normalizeResourcePath()` を追加。
- ユーザー様が以下のような **どの形式でパスを入力しても自動的に解釈・正規化** して読み込みます：
  - `resources\Materials\sky01.png` （Windows バックスラッシュ・拡張子付き）
  - `assets\resources\Materials\sky01.png`
  - `Materials/sky01.png`
  - `Materials/sky01`
  - `resources/Materials/sky01`
- バックスラッシュの置換、`assets/` / `resources/` プレフィックスの自動トリム、`.png` / `.jpg` / `.webp` 拡張子の除去を行い、Cocos の `resources.load` に最適なパスへ内部変換します。

---

## 変更されたファイル一覧

1. **[`extensions/master-manager/panels/default/index.js`](file:///z:/HTMLShooterCocos/cocos_project/extensions/master-manager/panels/default/index.js)**
   - `loadSettingsForm` / `renderSettingsForm` で `boolean`（チェックボックス）、`string`（テキスト入力）をネイティブ対応。
   - `SKY_CONFIG_SCHEMA` の `skyResourcePath` に `type: 'string'` を設定。
2. **[`SkyManager.ts`](file:///z:/HTMLShooterCocos/cocos_project/assets/scripts/SkyManager.ts)**
   - `normalizeResourcePath()` メソッドを追加し、自由なパス指定形式に対応。
3. **[`SkyConfig.json`](file:///z:/HTMLShooterCocos/cocos_project/assets/resources/Data/SkyConfig.json) / [`CloudConfig.json`](file:///z:/HTMLShooterCocos/cocos_project/assets/resources/Data/CloudConfig.json)**
   - 設定JSONの同期と型整合性の更新。
