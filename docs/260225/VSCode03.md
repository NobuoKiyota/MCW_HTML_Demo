✅ 直近の修正内容（ホーム画面が見えない問題への対応）
scene-Main をプレビューしたとき、背景色だけ表示される症状は UI カメラが正しく認識されず、UI レイヤーがメインカメラから除外されていた ことが原因でした。
ホームプレハブ内のカメラが Canvas の孫にあり、元の判定ロジックでは 即時の親が Canvas ではないため UI 用カメラと見なされず、結果的に UI を描画できない状態になっていました。

以下の対応で根本から修正済みです：

UI カメラ判定を強化

UIManager.resolveReferences() に isAncestorCanvas() 関数を追加し、カメラ位置が Canvas 階層のどこかにあれば UI カメラと扱うように変更。
これでホーム／タイトル prefab 内のカメラを自動的に UI カメラとして扱うようになりました。
switchContent() の強化

Prefab インスタンス化後に含まれるカメラを有効化し、UI_2D マスクを付与、青背景色を設定。
空コンテンツやカメラ未存在のときに警告ログを出力。
UI/3D の配置判断をそのまま維持しつつ安全性をアップ。
起動処理の柔軟化

start() で titlePrefab が無い場合は自動的に homePrefab へフォールバック。
いずれも無い場合はエラーログを出すようにして、黒画面の原因を明示。
エンジンパッチ（前回対応）

enginePatches.ts による Sprite の _uiProps ガードで、プレビュー中のエラーを抑制。
📌 期待される挙動
scene‑Main を起動するとホーム／タイトル UI が表示されるようになります。
カメラが正しく認識されるので、ホーム画面に含まれる Canvas 内のボタンなども操作可能。
背景色だけが見える状況は解消され、GameManager のログにも起動処理が出力されるはずです。
🧪 動作確認の手順
Cocos Creator で scene‑Main.scene を開く。
プレビューを実行。
タイトルまたはホーム画面が見えるか確認。
コンソールに [GameManager] start triggered. や [UIManager] Updating UI camera mask といったログが出力されるか確認。
必要に応じて GameManager ノードの titlePrefab / homePrefab が正しいプレハブにアサインされているか Inspector でチェック。
💡 補足
Prefab 内のカメラは依然として active:false 設定のままですが、起動時にコードで active=true にしています。
将来的にはエディタ内でカメラの名前を UICamera に変更するか、Prefab 自体を整理しておくとより安定します。
これで背景色だけが表示される問題は解消され、Googleantigravity による他の修正とも共存できます。
引き続き不具合があれば、具体的なログや状況を教えてください 😊