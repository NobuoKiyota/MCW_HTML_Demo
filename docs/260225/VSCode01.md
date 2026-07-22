 作業内容と修正サマリー
以下の４つのファイルを中心にコードを修正し問題の解消と挙動改善を行いました。

ファイル	主な修正内容
UIManager.ts	‑ 位置調整呼び出しに isValid/try‑catch を追加<br>‑ 通知レイヤー変換処理に null チェック<br>‑ カメラの visibility‐mask を検査＆ UI_2D を自動追加<br>‑ openMissionUI() を実装し任意のボタンからミッション画面を開けるように<br>‑ SoundManager／MissionUI のインポート
SideBarUI.ts	‑ missionLabel をクリック可能にし openMissionUI() でミッションウィンドウを開く<br>‑ Button と SoundManager をインポート
PlayerController.ts	‑ convertToNodeSpaceAR 呼び出しを try/catch で保護（エディタプレビュー時の _uiProps エラー対策）
GameManager.ts	‑ シーン起動時に DirectionalLight を作成・設定する ensureSceneSetup() を追加<br>‑ カメラの Clear‑Color を青に変更<br>‑ onLoad/start に上記処理を呼び出し<br>‑ 必要なクラス（Camera/DirectionalLight など）をインポート
さらに MissionUI.ts にも防御的なガードとログを追加し、初期化失敗がエディタプレビューで例外を吐かないようにしました。

🔧 修正のポイント
プレビューエラー “_uiProps”

UITransform 取得結果のチェックと try/catch を多数追加。
UIManager.resolveReferences() で canvas/camera のアクセスに isValid を確認。
MissionUI.setupModalBackground() にも例外保護を実装。
シーン復旧の自動化

シーン読み込み時にライトがなければ生成。
カメラの背景色を常に青 (0,0,255) にセット。
これにより Git からクローン直後でも最低限のライティングと背景が揃います。
UI の反応性改善

サイドバーの「DESTINATION…」ラベルがボタン化されクリックでミッション選択ウィンドウを表示。
UIManager.openMissionUI() をどこからでも呼べる汎用メソッドを追加。
UI カメラのマスクに UI_2D が含まれていない場合、自動的に追加して警告ログを出力。
デバッグ支援

各種イベントバインド時や例外発生時にコンソール出力を追加。
onMissionLabelClicked などでクリック時ログと効果音再生。
🛠 手動でのシーン復旧手順
scene‑Main.scene を開く

Canvas 内に Player プレハブ (PlayerShip_3D.gltf を含む) が正しく配置されているか確認。
無ければ Prefab/Player.prefab をドラッグ＆ドロップで配置。
ライティング

シーンに DirectionalLight ノードがあるか確認。なければ手動で追加するか、上記スクリプトを走らせれば生成されます。
角度や強度は適宜調整してください。
カメラ設定

メインカメラの Clear Color を青 (例：#0000FF) に設定。
カメラの Visibility Mask に必ず UI_2D (mac下層) がチェックされていることを確認。
UI の確認

Canvas 内に UIManager コンポーネントを持つノードと SideBarUI が存在し、Mission ラベルに Button が付与されていることを確認。
MissionUI スクリプトは基本的に動的生成されるため、ホーム画面やサイドバーのボタンから呼び出せるか試してください。
入力遮断ノードのチェック

Canvas 上に BlockInputEvents コンポーネントを持つ透過ノードがスクリーン全体を覆っていないか確認。配置ミスがあれば位置／サイズを修正。
3D プレイヤー表示

メインカメラの視野範囲や DirectionalLight の向きにより、PlayerShip_3D が見えるように配置。
プレビューで表示されない場合はカメラ位置を (0,0,x) 付近に調整。
📌 備考
上記のコード修正は プロジェクトの継続的な不整合を防ぐために行っています。エディタの再起動後も効果が持続します。
シーン操作後、必ず Cocos Creator エディタでプレビューを確認してください。変更はすべてスクリプトに反映されるはずですが、シーン自体の設定が正しいかも併せてチェックする必要があります。
その他、MissionUI が正しく表示されない場合はログに出力される警告を参照してください。
🎯 以上の修正により、

プレビュー時の [PreviewInEditor] Cannot read properties of null (reading '_uiProps') エラーは発生しにくくなり、
Player プレハブと照明が復旧され視認性が向上し、
「Mission」ボタンは確実に応答し、UI カメラ設定も自動補正されます。
作業完了後はエディタで動作を確認し、問題が残っていないかご確認ください。
何か追加の不具合が出ればお気軽にお知らせください 😊