# Interactive Portfolio Project

## 現在の仕様 (Current Status)

### 1. アプリケーション構造
*   **Single Page Application (SPA) 風構成**:
    *   `index.html` がエントリポイント。
    *   `InteractiveField` クラスがメインの体験エリアを管理。
    *   `AudioManager` が全音声を統括。
    *   `VisualFX` がCanvasアニメーションを管理。

### 2. テーマ: 和 (Japanese Theme)
現在実装されているメインコンテンツ。
*   **Ambience (環境音)**:
    *   Rain, Star, Snow, Leaves の4要素をXYパッドでミックス可能。
    *   Snow: 手順的な雪のアニメーション + 音声 (`Ambience_Snow.mp3`)。
    *   Star: パララックス・明滅する星 + 独自シェーダー風描画。
*   **Interactive Icons (アイコンギミック)**:
    1.  **Pond (池)**: クリックで水音 + 波紋。
    2.  **Shishi-odoshi (鹿威し)**: クリックで画像切り替え + 鹿威し音。
    3.  **Fusuma (襖)**: クリックで襖が開く動画オーバーレイ + 開閉音。
    4.  **Ripple (波紋)**:
        *   クリックでのみ反応（マウスオーバー無効）。
        *   `jQuery Ripples` による水面エフェクト。
        *   ランダムな水滴音 (`Icon_Ripples01`~`06.mp3`)。
        *   クリック音の重複防止実装済み。
    5.  **Candle (行灯/蝋燭)**:
        *   **MouseOver**: `TorchLoop.wav` 再生 + オレンジ色の発光 (`.candle-glow`)。
        *   **Click**: `TorchOff.mp3` 再生 + 即座に消灯・暗転 (`.icon-dark`) + ループ停止。
        *   **Cooldown**: 消灯後2秒間はクリック・再点灯不可（誤操作防止）。
    6.  **Slash (一閃)**: 動画エフェクト (`japanese_slash.mp4`)。

### 3. 技術スタック
*   Vanilla JavaScript (ES6+)
*   Web Audio API (Procedural sound generation & Sample playback)
*   Canvas 2D API (Particle effects)
*   jQuery & jQuery Ripples (Water effect)
*   CSS3 Variables & Animations

---

## 今後の展望とロードマップ (Roadmap)

### Phase 1: アーキテクチャの刷新 (Architecture Refactoring)
コンテンツ増加によるパフォーマンス低下を防ぐための基盤作り。

1.  **シーン遷移システムの導入 (Scene Management System)**
    *   現状の単純なテーマ切り替えではなく、「シーン（Scene）」として管理。
    *   **ローディング画面の実装**: テーマ切り替え時に画面全体を覆うトランジション演出（フェード、サイバーなワイプ等）を挟む。
    *   **動的リソース管理**: 
        *   「和」から「サイバー」へ行く時、「和」の画像・音声をメモリから解放 (Dispose)。
        *   「サイバー」のリソースをロードし、完了してから画面を開く。
        *   これにより、Webページが重くなり続けるのを防ぐ。

2.  **SPAルーター機能の強化**
    *   `#profile`, `#gallery` などのハッシュ、またはState管理で表示領域を切り替える。
    *   現在のインタラクティブフィールドは `#main` に配置。
    *   メニューからオーバーレイ、または別ビューとしてプロフィール画面等を呼び出す。
    *   **利点**: BGMを途切れさせずに画面遷移が可能。体験の一貫性を保てる。

### Phase 2: コンテンツページの拡張 (Content Expansion)
1.  **Global Navigation (Menu)**
    *   画面端にハンバーガーメニュー等を常設。
    *   Main, Profile, Works, Contact へのアクセスを提供。
2.  **Profile / Contact Page**
    *   インタラクティブフィールドの上に重なる「ガラスモーダル」のようなデザイン、あるいはフィールド自体が背景としてボケて奥に下がるような演出を想定。
3.  **Works (Gallery)**
    *   カード UI などを実装し、実績を一覧表示。

### Phase 3: 新テーマ開発 (New Themes)
1.  **Cyber Theme (サイバー)**
    *   グリッチエフェクト、ネオン、シンセウェーブBGM。
2.  **Nature / Minimalist Theme**
    *   より静かでモダンなデザイン。

---

## 提案: 次のステップ (Recommendation)

**「他ページのフレームワーク作り」を優先すべきです。**

理由:
1.  **拡張性の確保**: 「和」テーマの機能は十分リッチになりました。これ以上コンテンツ（音や画像）を既存の仕組みのまま詰め込むと、初期ロード時間が肥大化し、ブラウザのメモリ圧迫を招きます。
2.  **構造の決定**: ProfileやGalleryをどう見せるか（別HTMLか、オーバーレイか）を今のうちに決めて基盤を作っておかないと、後で「音楽を流しっぱなしにしたいのにページ遷移で止まってしまう」といった手戻りが発生します。

**次のタスク案**:
1.  画面右上に「MENU」ボタンと、それを展開するナビゲーションオーバーレイの実装。
2.  「Profile」画面のモックアップ作成（オーバーレイ表示）。
3.  テーマ切り替え時の透過的なローディング演出の実装実験。
