# MasterManager ShotManager テーブル描画不具合の修正報告

`ShotManager` タブ選択時にステータスメッセージのみが表示され、テーブルが描画されなかった原因を特定し修正いたしました。

---

## 原因と修正内容

- **原因**:
  Cocos エディタの WebComponent パネルにおける Shadow DOM セレクタ参照（`panel.$.smTableWrap`）のバインドが一部生成のタイミングにより未取得となっており、内部の描画中断ガードにかかっていたことが原因でした。

- **修正**:
  1. `index.js` の `$` 記述子（DOMマップ）に `.sm-view`, `.sm-table-wrap`, `.sm-btn-refresh`, `.sm-btn-save` を確実に定義しました。
  2. `renderShotManagerTable` 内で `panel.$.smTableWrap` の直接参照に加え、Shadow DOM (`shadowRoot.querySelector`) を含むフォールバック取得処理を追加しました。

---

## 使い方・確認手順

- Cocos Creator エディタ上で Master Manager パネルを開くか、一度タブを切り替えて `🎯 ShotManager` タブを選択してください。
- 13件の ShotPattern JSON ファイル一覧（ID, Type, Count, SP, DMG, WT, PrefabName, Action）がテーブルとして正常に表示・編集可能になります。
