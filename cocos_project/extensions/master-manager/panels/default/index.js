'use strict';

// GameDatabase.ts loads these via CSVHelper.parse() - see assets/scripts/GameDatabase.ts /
// assets/scripts/CSVHelper.ts. Keep this list in sync if new CSV tables are added there.
const CSV_FILES = [
    { label: 'Enemies', file: 'Enemies.csv' },
    { label: 'Drops', file: 'Drops.csv' },
    { label: 'Behaviors', file: 'Behaviors.csv' },
    { label: 'ShotPatterns', file: 'ShotPatterns.csv' },
    { label: 'Sounds', file: 'Sounds.csv' },
];

// ID-reference schema: for a given CSV file, which columns are "foreign keys" into another
// (or the same) file's ID-like column. Rendered as a datalist-backed input (suggests known
// values, but still lets you type a genuinely new ID) instead of a bare text input, so
// existing IDs can be picked without risking a typo that silently breaks GameDatabase's
// cross-linking (behaviorId/shotPatternId/dropId - see assets/scripts/GameDatabase.ts).
const SCHEMA = {
    'Enemies.csv': {
        BehaviorID: { file: 'Behaviors.csv', column: 'ID' },
        ShotPatternID: { file: 'ShotPatterns.csv', column: 'ID' },
        DropID: { file: 'Drops.csv', column: 'ID' },
    },
    'Drops.csv': {
        // Drops.csv has no separate item-master table, so this suggests from whatever
        // ItemID values already exist elsewhere in this same column.
        ItemID: { file: 'Drops.csv', column: 'ItemID' },
    },
};

// 表示だけを短縮する列名マップ。実データの列名(headers配列/CSVそのもの)は変更しない。
// GameDatabase.tsが行を読む際は実際のCSV列名(Defense/SpeedMult/...)をそのまま参照しているため。
const COLUMN_LABELS = {
    Defense: 'DF',
    SpeedMult: 'ESP',
};

// このパネルは元々 Master Manager(CSVテーブル編集)と Behavior Pattern Editor(ノードグラフ編集)の
// 2つの別々のパネルだったが、行き来が多いため1つのパネルにまとめてある。tab-barの選択によって
// viewMode('csv'|'graph')を切り替え、.mm-view/.be-viewの表示/非表示で中身を出し分ける。
// graphモード内はさらに graphDomain('behavior'|'shot') で「Behavior Graph」「Shot Pattern」の
// どちらを編集しているかを切り替える(LGraph/LGraphCanvasインスタンスは1つを使い回す)。
// main.js(IPCハンドラ)は元のまま2つの拡張機能(master-manager/behavior-editor)に分かれて残っている
// (Editor.Message.requestはパッケージ名で届くので、どちらのパネルから呼んでも問題ない)。
let viewMode = 'csv'; // 'csv' | 'graph'
let graphDomain = 'behavior'; // 'behavior' | 'shot' (viewMode==='graph'の時のみ意味を持つ)

// ==================================================================================
// --- Master Manager (CSVテーブル編集) 側の状態 -------------------------------------
// ==================================================================================

// Panel-session state (persists while this panel instance stays open).
let currentFile = CSV_FILES[0].file;
let headers = [];
let rows = [];
let dirty = false;
let refOptions = {}; // { [columnName]: string[] } - suggestion lists for the current file

// 列見出しクリックでのソート状態。ファイル切り替え時にリセットする。CSVの行順自体を書き換える
// (GameDatabase.tsは行順に依存せず全行を読むだけなので、実際に並べ替えて保存しても安全)。
let sortColumn = null;
let sortDir = 1; // 1: 昇順, -1: 降順

function sortRows(colIndex) {
    // 数値として両方解釈できる行は数値比較、それ以外は文字列比較(自然順に近づける)。
    rows.sort((a, b) => {
        const va = a[colIndex] || '';
        const vb = b[colIndex] || '';
        const na = parseFloat(va);
        const nb = parseFloat(vb);
        let cmp;
        if (va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb)) {
            cmp = na - nb;
        } else {
            cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
        }
        return cmp * sortDir;
    });
}

// 列幅(ファイル+列名ごと)。localStorageに永続化し、エディタを再起動しても記憶しておく。
const COL_WIDTHS_KEY = 'master-manager-col-widths';
const DEFAULT_COL_WIDTH = 90;
// BehaviorID/ShotPatternIDのような長めのID文字列が入る列は、記憶済み幅が無い初回表示でも
// 値が欠けて見えないよう、既定幅をやや広めにしておく(90pxだと"SP_NORMAL"等が入りきらない)。
const WIDE_DEFAULT_COLUMNS = { BehaviorID: 120, ShotPatternID: 120, DropID: 100 };
let colWidths = {}; // { "file::column": widthPx }

function loadColWidths() {
    try {
        const raw = localStorage.getItem(COL_WIDTHS_KEY);
        colWidths = raw ? JSON.parse(raw) : {};
    } catch (e) {
        colWidths = {};
    }
}

function saveColWidths() {
    try {
        localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch (e) {
        // localStorageが使えない環境でも致命的ではないので握りつぶす(セッション内の幅は保持される)
    }
}

function getColWidth(file, col) {
    return colWidths[`${file}::${col}`] || WIDE_DEFAULT_COLUMNS[col] || DEFAULT_COL_WIDTH;
}

function setColWidth(file, col, width) {
    colWidths[`${file}::${col}`] = width;
    saveColWidths();
}

async function fetchColumnValues(file, column) {
    if (file === currentFile) {
        const idx = headers.indexOf(column);
        if (idx === -1) return [];
        return rows.map(r => r[idx]).filter(v => v !== '');
    }
    const result = await Editor.Message.request('master-manager', 'load-csv', file);
    if (!result || !result.ok) return [];
    const idx = result.headers.indexOf(column);
    if (idx === -1) return [];
    return result.rows.map(r => r[idx]).filter(v => v !== '');
}

async function loadRefOptions(file) {
    refOptions = {};
    const schema = SCHEMA[file];
    if (!schema) return;
    for (const colName of Object.keys(schema)) {
        const { file: refFile, column: refColumn } = schema[colName];
        const values = await fetchColumnValues(refFile, refColumn);
        refOptions[colName] = Array.from(new Set(values));
    }
}

// All actual file I/O happens in main.js (the extension's Node-integrated process) - panel
// code is not guaranteed direct fs/path access, so everything here goes through
// Editor.Message.request('master-manager', ...) instead of require('fs').
async function loadFile(panel, file) {
    setStatus(panel, `Loading ${file}...`, false);
    const result = await Editor.Message.request('master-manager', 'load-csv', file);
    if (result && result.ok) {
        headers = result.headers;
        rows = result.rows;
        currentFile = file;
        dirty = false;
        sortColumn = null;
        sortDir = 1;
        setStatus(panel, `Loaded ${rows.length} rows from ${file}.`, false);
    } else {
        headers = [];
        rows = [];
        setStatus(panel, `Failed to load ${file}: ${result ? result.error : 'unknown error'}`, true);
    }
    await loadRefOptions(file);
    renderTable(panel);
}

async function saveFile(panel) {
    const result = await Editor.Message.request('master-manager', 'save-csv', currentFile, headers, rows);
    if (result && result.ok) {
        dirty = false;
        setStatus(panel, `Saved ${rows.length} rows to ${currentFile}.`, false);
    } else {
        setStatus(panel, `Save failed: ${result ? result.error : 'unknown error'}`, true);
    }
    // Refresh suggestion lists so self-referencing columns (e.g. Drops.ItemID) immediately
    // offer any new value that was just typed and saved.
    await loadRefOptions(currentFile);
    renderTable(panel);
}

function setStatus(panel, text, isError) {
    if (!panel.$.status) return;
    panel.$.status.textContent = text;
    panel.$.status.style.color = isError ? '#ff6b6b' : '#8fd68f';
}

// CSVテーブル部分のみを再描画する(タブバーはrenderTabBarが別途担当)。
function renderTable(panel) {
    const tableWrap = panel.$.tableWrap;
    tableWrap.innerHTML = '';

    if (headers.length === 0) {
        tableWrap.textContent = '(no data)';
        return;
    }

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach((h, colIndex) => {
        const th = document.createElement('th');
        th.style.width = `${getColWidth(currentFile, h)}px`;

        const label = document.createElement('span');
        label.className = 'th-label sortable';
        const displayName = COLUMN_LABELS[h] || h;
        const sortArrow = sortColumn === colIndex ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
        label.textContent = displayName + (refOptions[h] ? ' 🔗' : '') + sortArrow;
        label.addEventListener('click', () => {
            sortDir = (sortColumn === colIndex) ? -sortDir : 1;
            sortColumn = colIndex;
            sortRows(colIndex);
            dirty = true;
            setStatus(panel, `Sorted by '${h}' (${sortDir === 1 ? 'asc' : 'desc'}). Unsaved changes.`, false);
            renderTable(panel);
        });
        th.appendChild(label);
        // 短縮表示の場合は元の列名をhoverで分かるようにする(refOptionsの説明があれば併記)。
        const refTitle = refOptions[h] ? ` - Suggests known values (${refOptions[h].length}), you can still type a new one.` : '';
        th.title = `Click to sort. ${(displayName !== h ? `${h}${refTitle}` : refTitle.replace(/^ - /, '')) || h}`;

        // ドラッグで列幅を変更するハンドル。th右端の細い帯をつかんで左右にドラッグする。
        const handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startWidth = th.getBoundingClientRect().width;

            const onMove = (moveEvent) => {
                const newWidth = Math.max(40, Math.round(startWidth + (moveEvent.clientX - startX)));
                th.style.width = `${newWidth}px`;
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                setColWidth(currentFile, h, Math.round(th.getBoundingClientRect().width));
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        th.appendChild(handle);

        headRow.appendChild(th);
    });
    headRow.appendChild(document.createElement('th')); // delete-row column
    thead.appendChild(headRow);
    table.appendChild(thead);

    // One <datalist> per reference column, shared by every row's input in that column.
    Object.keys(refOptions).forEach(colName => {
        const datalist = document.createElement('datalist');
        datalist.id = `datalist-${colName}`;
        refOptions[colName].forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            datalist.appendChild(opt);
        });
        tableWrap.appendChild(datalist);
    });

    const tbody = document.createElement('tbody');
    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        headers.forEach((h, colIndex) => {
            const td = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = row[colIndex] || '';
            if (refOptions[h]) {
                input.setAttribute('list', `datalist-${h}`);
                // A pre-filled value makes the browser's native datalist popup filter
                // suggestions down to prefix-matches of that value, hiding every other
                // candidate. Clear on focus so the full suggestion list shows, and restore
                // the original value on blur if the user left without picking/typing
                // anything - otherwise focusing a cell would silently blank it out.
                input.addEventListener('focus', (e) => {
                    e.target.dataset.prevValue = e.target.value;
                    e.target.value = '';
                });
                input.addEventListener('blur', (e) => {
                    if (e.target.value === '' && e.target.dataset.prevValue) {
                        e.target.value = e.target.dataset.prevValue;
                    }
                });
            }
            input.addEventListener('change', (e) => {
                rows[rowIndex][colIndex] = e.target.value;
                dirty = true;
                setStatus(panel, 'Unsaved changes.', false);
            });
            td.appendChild(input);
            tr.appendChild(td);
        });
        const delTd = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-del-row';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
            rows.splice(rowIndex, 1);
            dirty = true;
            setStatus(panel, 'Unsaved changes.', false);
            renderTable(panel);
        });
        delTd.appendChild(delBtn);
        tr.appendChild(delTd);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
}

// ==================================================================================
// --- Behavior Graph / Shot Pattern (ノードグラフ編集) 側の状態 -----------------------
// ==================================================================================

let behaviorList = [];      // [{id, graphPath, note}] - graphDomain==='behavior'用
let shotList = [];          // [{id, graphPath, note}] - graphDomain==='shot'用
let bulletPrefabList = [];  // ['Bullet01', ...] - assets/resources/Prefabs/Bullets/ 配下のPrefab名一覧
let currentId = null;
let litegraph = null;       // LGraph instance
let litegraphCanvas = null; // LGraphCanvas instance
let libReady = false;

// パネルが表示中かどうか。キーボードショートカット・ポーリングをこれで絞る
// (viewMode==='graph'の条件と合わせて、CSVタブを見ている間はグラフ側のショートカット/ポーリングを止める)。
let panelActive = true;
let activePanel = null;
let undoPollTimer = null;
let descBarTimer = null;

// Undo/Redo: LiteGraphの serialize()/configure() をそのままスナップショットとして使う簡易実装。
// ノード単位の変更フックを全種類確実に拾うのは版依存でリスクが高いため、一定間隔での差分検知にしている。
let undoStack = [];
let redoStack = [];
let lastSnapshot = null;

// ノードtype文字列(LiteGraph用の"behavior/xxx"/"shot/xxx")とBehaviorGraph/ShotGraphの
// スキーマ上のtype名("Xxx")の相互変換。Start/Wait/Branch/Loop/Random/Reroute/Commentは
// 両ドメイン共通のノードクラスをそのまま使う。
const NODE_TYPE_MAP = { start: 'Start', move: 'Move', moveto: 'MoveTo', wait: 'Wait', branch: 'Branch', loop: 'Loop', spin: 'Spin', punch: 'Punch', attack: 'Attack', reroute: 'Reroute', comment: 'Comment', random: 'Random', fire: 'Fire', multifire: 'MultiFire', missile: 'Missile' };
const REVERSE_TYPE_MAP = { Start: 'behavior/start', Move: 'behavior/move', MoveTo: 'behavior/moveto', Wait: 'behavior/wait', Branch: 'behavior/branch', Loop: 'behavior/loop', Spin: 'behavior/spin', Punch: 'behavior/punch', Attack: 'behavior/attack', Reroute: 'behavior/reroute', Comment: 'behavior/comment', Random: 'behavior/random', Fire: 'shot/fire', MultiFire: 'shot/multifire', Missile: 'shot/missile' };

// ドメインごとのノードパレット(LiteGraphのAdd Node検索に出てくる候補)。共有ノードは常時両方で使える。
const SHARED_NODE_TYPES = ['behavior/start', 'behavior/wait', 'behavior/branch', 'behavior/loop', 'behavior/random', 'behavior/reroute', 'behavior/comment'];
const BEHAVIOR_ONLY_TYPES = ['behavior/move', 'behavior/moveto', 'behavior/spin', 'behavior/punch', 'behavior/attack'];
const SHOT_ONLY_TYPES = ['shot/fire', 'shot/multifire', 'shot/missile'];
const OUR_NODE_TYPES = SHARED_NODE_TYPES.concat(BEHAVIOR_ONLY_TYPES, SHOT_ONLY_TYPES);
let allNodeCtors = {}; // { [type]: ctor } - プルーニングで registered_node_types から一時的に外した時の退避先

// ドメインごとのIPCメッセージ名 + サイドバーリストの束ね。behavior-editor extension(main.js)側の
// listBehaviors/listShots等、対になるメソッド名と1:1で対応する。
const GRAPH_IPC = {
    behavior: { list: 'list-behaviors', load: 'load-graph', save: 'save-graph', create: 'create-behavior', duplicate: 'duplicate-behavior', rename: 'rename-behavior', delete: 'delete-behavior', label: '行動パターン' },
    shot: { list: 'list-shots', load: 'load-shot-graph', save: 'save-shot-graph', create: 'create-shot', duplicate: 'duplicate-shot', rename: 'rename-shot', delete: 'delete-shot', label: '発射パターン' },
};
function ipc() { return GRAPH_IPC[graphDomain]; }
function activeGraphList() { return graphDomain === 'shot' ? shotList : behaviorList; }
function setActiveGraphList(list) { if (graphDomain === 'shot') shotList = list; else behaviorList = list; }

// BehaviorGraphのAttackノードの"shotPatternId"コンボが呼ぶ。LiteGraphのcombo widgetは
// options.valuesに関数を渡すとクリックの都度呼び出してくれる(litegraph.min.jsで確認済み)ので、
// shotListを都度読み直せば常に最新のShot Pattern一覧が選択肢に出る(タブを一度も開いていなくても
// ready()時に一度shotListを読み込んでおくので空にはならない)。
function getShotIdOptions() {
    const ids = shotList.map((s) => s.id).sort();
    return ['(none)', ...ids];
}

// Fire/MultiFire/Missileノードの prefabName コンボが呼ぶ。assets/resources/Prefabs/Bullets/ 配下の
// Prefab名一覧(bulletPrefabList、ready()時に一度読み込む)を返す。空欄=既定のbulletPrefabを使う。
function getBulletPrefabOptions() {
    return ['(default)', ...bulletPrefabList];
}

// --- 簡易モーダル (window.prompt/confirmはこのパネル環境ではサポートされないため自前で用意する) ----
// 実機ログ: "[Window] prompt() is and will not be supported." のため、
// テンプレート内に常設したオーバーレイの表示/非表示とPromiseで置き換える。
function showModal(panel, opts) {
    return new Promise((resolve) => {
        const { title, showInput = false, inputDefault = '', showNote = false, noteDefault = '', okText = 'OK' } = opts;

        panel.$.modalTitle.textContent = title || '';
        panel.$.modalInput.style.display = showInput ? '' : 'none';
        panel.$.modalInput.value = inputDefault;
        panel.$.modalNote.style.display = showNote ? '' : 'none';
        panel.$.modalNote.value = noteDefault;
        panel.$.modalOk.textContent = okText;
        panel.$.modalOverlay.classList.remove('hidden');

        if (showInput) {
            panel.$.modalInput.focus();
            panel.$.modalInput.select();
        }

        const cleanup = () => {
            panel.$.modalOverlay.classList.add('hidden');
            panel.$.modalOk.removeEventListener('click', onOk);
            panel.$.modalCancel.removeEventListener('click', onCancel);
            panel.$.modalInput.removeEventListener('keydown', onKeydown);
        };
        const onOk = () => {
            const value = panel.$.modalInput.value.trim();
            const note = panel.$.modalNote.value.trim();
            cleanup();
            resolve({ ok: true, value, note });
        };
        const onCancel = () => {
            cleanup();
            resolve({ ok: false, value: '', note: '' });
        };
        const onKeydown = (e) => {
            if (e.key === 'Enter') onOk();
            else if (e.key === 'Escape') onCancel();
        };

        panel.$.modalOk.addEventListener('click', onOk);
        panel.$.modalCancel.addEventListener('click', onCancel);
        panel.$.modalInput.addEventListener('keydown', onKeydown);
    });
}

// --- LiteGraph <-> BehaviorGraph/ShotGraph(独自スキーマ) 変換 -------------------------------------
// ドメインに関わらず同じ変換ロジックが使える(NODE_TYPE_MAP/REVERSE_TYPE_MAPが違うだけ)。

function outputTargetNodeId(serializedNode, slotIndex, linkById) {
    if (!serializedNode.outputs || !serializedNode.outputs[slotIndex]) return null;
    const linkIds = serializedNode.outputs[slotIndex].links;
    if (!linkIds || linkIds.length === 0) return null;
    const link = linkById[linkIds[0]]; // 1本のみ接続する想定 (複数繋いだ場合は先頭のみ採用)
    return link ? link.targetId : null;
}

function exportGraph(graphId) {
    const data = litegraph.serialize();
    const linkById = {};
    (data.links || []).forEach(l => {
        // LiteGraph serialize()のlink形式: [id, origin_id, origin_slot, target_id, target_slot, type]
        linkById[l[0]] = { originId: l[1], originSlot: l[2], targetId: l[3], targetSlot: l[4] };
    });

    const nodePositions = {};
    const nodeStyles = {};
    const nodes = (data.nodes || []).map(n => {
        const shortType = (n.type || '').split('/')[1];
        const outType = NODE_TYPE_MAP[shortType] || shortType;

        const out = { id: n.id, type: outType };
        if (n.properties && Object.keys(n.properties).length > 0) {
            out.params = Object.assign({}, n.properties);
        }

        if (outType === 'Branch') {
            out.trueNext = outputTargetNodeId(n, 0, linkById);
            out.falseNext = outputTargetNodeId(n, 1, linkById);
        } else if (outType === 'Loop') {
            out.params = out.params || {};
            out.params.target = outputTargetNodeId(n, 0, linkById);
            out.next = outputTargetNodeId(n, 1, linkById);
        } else if (outType !== 'Random') {
            out.next = outputTargetNodeId(n, 0, linkById);
        }

        // Blueprint風の値配線: フロー入力("In", 常に0番)以外の名前付き入力に接続があれば、
        // その入力名+"Ref"というキーで接続元ノードID(通常はRandomノード)を記録する。
        // ノード種別ごとの特別扱いは不要 — BehaviorRuntime/ShotRuntime側がparams[`${key}Ref`]という
        // 命名規則で汎用的に解決する(resolveNum)。
        if (n.inputs) {
            n.inputs.forEach((inp, slotIdx) => {
                if (slotIdx === 0) return; // slot 0 = flow "In"
                if (!inp || !inp.name || inp.link == null) return;
                const link = linkById[inp.link];
                if (!link) return;
                out.params = out.params || {};
                out.params[`${inp.name}Ref`] = link.originId;
            });
        }

        nodePositions[n.id] = n.pos;
        // ノード個別の色(タイトルバー色/本体色)。n.color/n.bgcolorはn.propertiesとは別の
        // トップレベルフィールドなので、意識して拾わないと保存時に静かに消えてしまう。
        if (n.color || n.bgcolor) {
            nodeStyles[n.id] = { color: n.color, bgcolor: n.bgcolor };
        }
        return out;
    });

    // Group(ノードをまとめる見た目上の枠)はグラフの実行スキーマには関係ないが、
    // グラフが複雑になった時の整理用に位置・サイズ・色・タイトルをそのまま保存しておく。
    const groups = data.groups || [];

    return { id: graphId, nodes, _editor: { nodePositions, nodeStyles, groups } };
}

function importGraph(schemaGraph) {
    litegraph.clear();
    const created = {};

    (schemaGraph.nodes || []).forEach(n => {
        const ctorType = REVERSE_TYPE_MAP[n.type];
        if (!ctorType) {
            console.warn('[BehaviorEditor] Unknown node type in graph JSON:', n.type);
            return;
        }
        const node = LiteGraph.createNode(ctorType);
        if (!node) return;
        node.id = n.id;

        if (n.params) {
            Object.keys(n.params).forEach(k => {
                if (k === 'target') return; // Loopのtargetは接続で表現するのでwidget値には反映しない
                if (k.endsWith('Ref')) return; // 値配線(<name>Ref)は接続で表現するので下のパスで再接続する
                node.properties[k] = n.params[k];
                if (node.widgets) {
                    const w = node.widgets.find(w => w.name === k);
                    if (w) w.value = n.params[k];
                }
            });
        }

        const pos = schemaGraph._editor && schemaGraph._editor.nodePositions && schemaGraph._editor.nodePositions[String(n.id)];
        node.pos = pos || [40 + (n.id * 160), 80];

        const style = schemaGraph._editor && schemaGraph._editor.nodeStyles && schemaGraph._editor.nodeStyles[String(n.id)];
        if (style) {
            if (style.color) node.color = style.color;
            if (style.bgcolor) node.bgcolor = style.bgcolor;
        }

        litegraph.add(node);
        created[n.id] = node;
    });

    (schemaGraph.nodes || []).forEach(n => {
        const node = created[n.id];
        if (!node) return;

        if (n.type === 'Branch') {
            if (n.trueNext != null && created[n.trueNext]) node.connect(0, created[n.trueNext], 0);
            if (n.falseNext != null && created[n.falseNext]) node.connect(1, created[n.falseNext], 0);
        } else if (n.type === 'Loop') {
            const target = n.params && n.params.target;
            if (target != null && created[target]) node.connect(0, created[target], 0);
            if (n.next != null && created[n.next]) node.connect(1, created[n.next], 0);
        } else if (n.next != null && created[n.next]) {
            node.connect(0, created[n.next], 0);
        }

        // 値配線(<name>Ref)の再接続。対象ノードの入力の中から名前が一致するものを探し、
        // 参照元ノード(Random等)の出力0番から繋ぎ直す。
        if (n.params) {
            Object.keys(n.params).forEach((key) => {
                if (!key.endsWith('Ref')) return;
                const paramName = key.slice(0, -3);
                const sourceNode = created[n.params[key]];
                if (!sourceNode) return;
                const inputIndex = (node.inputs || []).findIndex((inp) => inp.name === paramName);
                if (inputIndex === -1) return;
                sourceNode.connect(0, node, inputIndex);
            });
        }
    });

    // Group復元。LGraph.configure()内部と同じ手順(new LGraphGroup → configure → graph.add)。
    const groups = schemaGraph._editor && schemaGraph._editor.groups;
    if (groups && window.LiteGraph && window.LiteGraph.LGraphGroup) {
        groups.forEach((g) => {
            const group = new window.LiteGraph.LGraphGroup();
            group.configure(g);
            litegraph.add(group);
        });
    }
}

// --- Undo/Redo/ノード削除/キーボードショートカット ------------------------------------------

function snapshotGraph() {
    if (!litegraph) return null;
    try {
        return JSON.stringify(litegraph.serialize());
    } catch (e) {
        return null;
    }
}

function resetUndoHistory() {
    undoStack = [];
    redoStack = [];
    lastSnapshot = snapshotGraph();
}

// 一定間隔で呼ばれ、前回スナップショットとの差分があればUndoスタックに積む。
function captureUndoPoint() {
    const snap = snapshotGraph();
    if (snap === null) return;
    if (lastSnapshot !== null && snap !== lastSnapshot) {
        undoStack.push(lastSnapshot);
        if (undoStack.length > 100) undoStack.shift();
        redoStack = []; // 新しい変更が入ったらRedoは破棄
    }
    lastSnapshot = snap;
}

function doUndo(panel) {
    if (!litegraph || undoStack.length === 0) return;
    const current = snapshotGraph();
    if (current !== null) redoStack.push(current);
    const prev = undoStack.pop();
    litegraph.configure(JSON.parse(prev));
    lastSnapshot = prev;
    setStatus(panel, 'Undo', false);
}

function doRedo(panel) {
    if (!litegraph || redoStack.length === 0) return;
    const current = snapshotGraph();
    if (current !== null) undoStack.push(current);
    const next = redoStack.pop();
    litegraph.configure(JSON.parse(next));
    lastSnapshot = next;
    setStatus(panel, 'Redo', false);
}

// 選択中のノードをグラフから削除する(サイドバーの🗑DeleteとはBehaviorパターン単位で別物、
// こちらはキャンバス上のノード単位)。
function deleteSelectedNodes(panel) {
    if (!litegraph || !litegraphCanvas || !litegraphCanvas.selected_nodes) return;
    const nodes = Object.values(litegraphCanvas.selected_nodes);
    if (nodes.length === 0) return;
    nodes.forEach((n) => litegraph.remove(n));
    captureUndoPoint();
    setStatus(panel, `${nodes.length} node(s) deleted.`, false);
}

// document.activeElement はフォーカスがShadow DOM内にある場合、その中身ではなく
// Shadow Hostそのものを返す。このパネルも(LiteGraphの値編集ダイアログ"graphdialog"の
// <input class="value">も)Shadow DOM内にあるため、shadowRootをたどって実際にフォーカス
// されている要素まで降りないと正しく判定できない(これがValue欄でBackspaceが効かなかった原因)。
function getDeepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

function isTypingInField() {
    const el = getDeepActiveElement();
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

// Graphタブが表示中(panelActive && viewMode==='graph')の時だけ効く、かつテキスト入力中は素通しする。
function onGlobalKeyDown(e) {
    if (!panelActive || !activePanel || !libReady || viewMode !== 'graph') return;
    if (isTypingInField()) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (ctrl && key === 's') {
        e.preventDefault();
        saveCurrent(activePanel);
    } else if (ctrl && key === 'z' && e.shiftKey) {
        e.preventDefault();
        doRedo(activePanel);
    } else if (ctrl && key === 'z') {
        e.preventDefault();
        doUndo(activePanel);
    } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        deleteSelectedNodes(activePanel);
    }
}

// ホバー中(無ければ選択中)のノードの説明を1行バーに表示する。
function updateNodeDescBar(panel) {
    if (!panel.$.nodeDescBar || !litegraphCanvas) return;
    let node = litegraphCanvas.node_over || null;
    if (!node && litegraphCanvas.selected_nodes) {
        const sel = Object.values(litegraphCanvas.selected_nodes);
        if (sel.length > 0) node = sel[0];
    }
    if (node && node.constructor && node.constructor.desc) {
        const title = node.title || node.constructor.title || '';
        panel.$.nodeDescBar.textContent = `${title}: ${node.constructor.desc}`;
    } else if (node) {
        panel.$.nodeDescBar.textContent = node.title || '';
    } else {
        panel.$.nodeDescBar.textContent = 'ノードにカーソルを合わせると、ここに説明が表示されます。';
    }
}

// --- データ読み込み/保存 (実際のfs I/OはExtensionのmain.js側で行う) -------------------------
// graphDomainに応じてipc()が返すメッセージ名を使うことで、Behavior/Shot両ドメインで
// 同じロジックを共有する。

async function refreshGraphList(panel) {
    const result = await Editor.Message.request('behavior-editor', ipc().list);
    setActiveGraphList((result && result.ok) ? result.list : []);
    renderSidebar(panel);
}

async function loadGraphItem(panel, id) {
    if (!libReady) {
        setStatus(panel, 'LiteGraph.js が読み込まれていないため編集できません。', true);
        return;
    }
    setStatus(panel, `Loading ${id}...`, false);
    const result = await Editor.Message.request('behavior-editor', ipc().load, id);
    if (!result || !result.ok) {
        setStatus(panel, `Load failed: ${result ? result.error : 'unknown error'}`, true);
        return;
    }
    currentId = id;
    importGraph(result.graph);
    resetUndoHistory(); // 別パターンをロードしたら前のパターンのUndo履歴には戻れないようにする
    panel.$.currentIdLabel.textContent = id;
    // Noteはグラフjsonではなくcsv側の値(既にリストに読み込み済み)から拾う
    const entry = activeGraphList().find(b => b.id === id);
    panel.$.currentNoteInput.value = entry ? (entry.note || '') : '';
    setStatus(panel, result.isNew ? `New graph (not yet saved on disk): ${id}` : `Loaded ${id}.`, false);
    renderSidebar(panel);
}

async function saveCurrent(panel) {
    if (!currentId) {
        setStatus(panel, `${ipc().label}が選択されていません。`, true);
        return;
    }
    const graph = exportGraph(currentId);

    // 保存直前の配線状態をコンソールへ出しておく。"更新すると配線が切れる"系の不具合が
    // 実際に保存の瞬間に起きているのかどうかを、プレイ側の挙動を待たずその場で確認できるようにする。
    const startNode = graph.nodes.find((n) => n.type === 'Start');
    if (!startNode) {
        console.warn(`[BehaviorEditor] Save '${currentId}': no Start node in this graph.`);
    } else if (startNode.next == null) {
        console.warn(`[BehaviorEditor] Save '${currentId}': Start node is NOT connected to anything (next=null). This pattern will do nothing at runtime.`);
    } else {
        const target = graph.nodes.find((n) => n.id === startNode.next);
        console.log(`[BehaviorEditor] Save '${currentId}': Start -> ${target ? `${target.type}(${target.id})` : `missing node ${startNode.next}`}`);
    }

    const note = panel.$.currentNoteInput.value.trim();
    const result = await Editor.Message.request('behavior-editor', ipc().save, currentId, graph, note);
    if (result && result.ok) {
        setStatus(panel, `Saved ${currentId}.`, false);
        await refreshGraphList(panel);
    } else {
        setStatus(panel, `Save failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function createNew(panel) {
    const res = await showModal(panel, {
        title: `新しい${ipc().label}のID (例: ${graphDomain === 'shot' ? 'SP_NEW_PATTERN' : 'BH_NEW_PATTERN'})`,
        showInput: true,
        inputDefault: '',
        showNote: true,
        okText: 'Create',
    });
    if (!res.ok || !res.value) return;
    const result = await Editor.Message.request('behavior-editor', ipc().create, res.value, res.note);
    if (result && result.ok) {
        await refreshGraphList(panel);
        await loadGraphItem(panel, res.value);
    } else {
        setStatus(panel, `Create failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function duplicateCurrent(panel) {
    if (!currentId) {
        setStatus(panel, `コピー元の${ipc().label}が選択されていません。`, true);
        return;
    }
    const res = await showModal(panel, {
        title: `'${currentId}' を複製する新しいID`,
        showInput: true,
        inputDefault: `${currentId}_COPY`,
        showNote: true,
        okText: 'Duplicate',
    });
    if (!res.ok || !res.value) return;
    const result = await Editor.Message.request('behavior-editor', ipc().duplicate, currentId, res.value, res.note);
    if (result && result.ok) {
        const sourceId = currentId;
        await refreshGraphList(panel);
        await loadGraphItem(panel, res.value);
        setStatus(panel, `'${sourceId}' を '${res.value}' として複製しました。`, false);
    } else {
        setStatus(panel, `Duplicate failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function renameCurrent(panel) {
    if (!currentId) {
        setStatus(panel, `Renameする${ipc().label}が選択されていません。`, true);
        return;
    }
    const res = await showModal(panel, {
        title: `'${currentId}' の新しいID`,
        showInput: true,
        inputDefault: currentId,
        okText: 'Rename',
    });
    if (!res.ok || !res.value || res.value === currentId) return;
    const result = await Editor.Message.request('behavior-editor', ipc().rename, currentId, res.value);
    if (result && result.ok) {
        const oldId = currentId;
        currentId = res.value;
        await refreshGraphList(panel);
        await loadGraphItem(panel, currentId);
        setStatus(panel, `'${oldId}' を '${currentId}' にリネームしました。`, false);
    } else {
        setStatus(panel, `Rename failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function deleteCurrent(panel) {
    if (!currentId) return;
    const res = await showModal(panel, {
        title: `一覧から '${currentId}' の行を削除します(JSON実体は残します)。よろしいですか?`,
        okText: 'Delete',
    });
    if (!res.ok) return;
    const result = await Editor.Message.request('behavior-editor', ipc().delete, currentId);
    if (result && result.ok) {
        currentId = null;
        panel.$.currentIdLabel.textContent = '(none)';
        panel.$.currentNoteInput.value = '';
        if (litegraph) litegraph.clear();
        await refreshGraphList(panel);
        setStatus(panel, 'Deleted.', false);
    } else {
        setStatus(panel, `Delete failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

function renderSidebar(panel) {
    const list = panel.$.behaviorList;
    list.innerHTML = '';
    // 作成順のままだと増えるほど探しにくいため、表示だけID順(A→Z)に並べ替える。
    // 実データ(CSV)の行順には触れない(保存・複製・削除は引き続きCSV上の元の行を操作する)。
    const sorted = [...activeGraphList()].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach(({ id }) => {
        const item = document.createElement('div');
        item.className = 'behavior-item' + (id === currentId ? ' active' : '');
        item.textContent = id; // Noteは右側の Editing: 欄で編集する。一覧はIDのみで見やすくする
        item.addEventListener('click', () => loadGraphItem(panel, id));
        list.appendChild(item);
    });
}

// --- LiteGraph本体のロード ---------------------------------------------------------------
// panel(webview)側からの <script src="./relative/path"> は、パネルの実際のベースURLが
// 拡張機能のディレクトリと一致しない環境があり読み込みに失敗することがある
// (実機で "Failed to load script: ./lib/litegraph.min.js" を確認済み)。
// そのため main.js(Node統合プロセス)でファイル内容をテキストとして読み込み、
// panel側では <script> にそのテキストを直接流し込んで実行する(相対URL解決に依存しない)。

async function loadLibFileText(name) {
    const result = await Editor.Message.request('behavior-editor', 'load-lib-file', name);
    if (!result || !result.ok) {
        throw new Error(`Failed to load lib file '${name}': ${result ? result.error : 'unknown error'}`);
    }
    return result.text;
}

function execInlineScript(code) {
    const el = document.createElement('script');
    el.textContent = code;
    document.head.appendChild(el);
}

function injectInlineStyle(css) {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
}

// LiteGraphのカスタムノード定義。接続は「実行順序(flow)」のみを表し、LiteGraphのデータフロー
// 実行(runStep)は使わない — 実際の解釈・実行はランタイム側のBehaviorRuntime.ts/ShotRuntime.tsが担当する。
// addWidgetのラッパー。ウィジェットの内部名(name、保存されるパラメータキーと一致させる必要がある)は
// そのままに、画面表示だけ短いラベルに差し替える(長い名前+長い値でノード上で文字が被るのを防ぐ)。
function addW(node, type, name, value, callback, opts, label) {
    // customWidgetPrompt(数値ウィジェットをクリックして直接入力するダイアログ)はcallbackに
    // <input type="text">の生の文字列をそのまま渡してくる。number系ウィジェットでこれを
    // そのままproperties[key]に書き込むと、以後の演算(BehaviorRuntime/ShotRuntimeのresolveNum等)で
    // 非数値文字列がMath.round/Math.max等を通ってNaNになり、MultiFireのwhile(remaining>0)のような
    // 比較が常にfalseになって "何も起きない(エラーも出ない)" 形で弾が一切出なくなる、といった
    // 静かなバグの原因になっていた。number型に限り、コミット時に数値へ変換し、変換できない
    // (NaNになる)場合は直前の値を維持してNaNを絶対に書き込まないようにする。
    let widget;
    const wrappedCallback = (type === 'number' && callback)
        ? (v) => {
            const n = typeof v === 'number' ? v : parseFloat(v);
            callback(Number.isFinite(n) ? n : (widget ? widget.value : value));
        }
        : callback;
    widget = node.addWidget(type, name, value, wrappedCallback, opts);
    if (widget && label) widget.label = label;
    return widget;
}

function registerBehaviorNodeTypes(LiteGraph) {
    function BehaviorStartNode() {
        // Loopノードが"最初のアクションノード"へ直接ループバックしようとすると、Startの配線と
        // 同じ入力ソケットを取り合って片方が追い出される(LiteGraphは1入力=1本まで)。
        // そのためStartにも入力を持たせ、Loopの戻り先は常にStart自身にする規約にする
        // (Startはnextへ即転送するだけなので、動作は最初の実行時と全く同じになる)。
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = {};
    }
    BehaviorStartNode.title = "Start";
    BehaviorStartNode.desc = "グラフの入口。1つだけ配置する。Loopで最初に戻りたい場合は、最初のアクションノードにではなく必ずこのStartノードの In に繋ぐこと(同じ入力ソケットを取り合うと片方の配線が保存時に消える)。";

    function BehaviorMoveNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { pattern: "straight", angle: 270, speed: 2.0, turn: 2.0 };
        addW(this, "combo", "pattern", this.properties.pattern, (v) => { this.properties.pattern = v; }, { values: ["straight", "curve", "zigzag", "homing"] }, "pat");
        this.addInput("angle", "number");
        addW(this, "number", "angle", this.properties.angle, (v) => { this.properties.angle = v; }, { step: 10 }, "ang");
        this.addInput("speed", "number");
        addW(this, "number", "speed", this.properties.speed, (v) => { this.properties.speed = v; }, { step: 1 }, "spd");
        this.addInput("turn", "number");
        addW(this, "number", "turn", this.properties.turn, (v) => { this.properties.turn = v; }, { step: 1 });
    }
    BehaviorMoveNode.title = "Move";
    BehaviorMoveNode.desc = "移動状態を更新して即座に次へ進む。angleは度数(0=右,90=上,180=左,270=下)。curveはturnを旋回速度(度/秒)として使い弧を描く。homingはY方向は常に一定速度speedで降下しturnを最大値としてX方向だけ自機に寄せる(急ブレーキ/張り付き防止)。zigzag/homingではangleは無視される。angle/speed/turnはRandomノードから配線して動的な値にできる(未接続時はウィジェットの値を使用)。";

    function BehaviorMoveToNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { from: "0", to: "1", interp: "straight", curveAmount: 60, duration: 1.0 };
        addW(this, "text", "from", this.properties.from, (v) => { this.properties.from = v; });
        addW(this, "text", "to", this.properties.to, (v) => { this.properties.to = v; });
        addW(this, "combo", "interp", this.properties.interp, (v) => { this.properties.interp = v; }, { values: ["straight", "curve"] });
        this.addInput("curveAmount", "number");
        addW(this, "number", "curveAmount", this.properties.curveAmount, (v) => { this.properties.curveAmount = v; }, { step: 10 }, "amt");
        this.addInput("duration", "number");
        addW(this, "number", "duration", this.properties.duration, (v) => { this.properties.duration = v; }, { step: 0.1, min: 0 }, "dur");
    }
    BehaviorMoveToNode.title = "MoveTo";
    BehaviorMoveToNode.desc = "EnemyMovePoint(シーンに配置したMovePointコンポーネント)のfromからtoへduration秒かけて移動し、完了までブロックする。fromは\"0\"(既定)なら現在地。interp=curveでcurveAmount分だけ弧を描く(符号で左右、大きさで膨らみ具合)。curveAmount/durationはRandomノードから配線可能。";

    function BehaviorWaitNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { seconds: 1.0 };
        this.addInput("seconds", "number");
        addW(this, "number", "seconds", this.properties.seconds, (v) => { this.properties.seconds = v; }, { step: 1, min: 0 }, "sec");
    }
    BehaviorWaitNode.title = "Wait";
    BehaviorWaitNode.desc = "指定秒数だけシーケンスを止める(Behavior Graphでは移動は継続する、Shot Patternでは単に待つ)。secondsはRandomノードから配線可能。";

    function BehaviorBranchNode() {
        this.addInput("In", "flow");
        this.addOutput("True", "flow");
        this.addOutput("False", "flow");
        this.properties = { condition: "timeElapsedGT", value: 0, logic: "none", condition2: "timeElapsedGT", value2: 0 };
        addW(this, "combo", "condition", this.properties.condition, (v) => { this.properties.condition = v; }, { values: ["timeElapsedGT", "hpPercentLT", "distToPlayerLT", "random"] }, "cond");
        addW(this, "number", "value", this.properties.value, (v) => { this.properties.value = v; }, { step: 1 }, "val");
        addW(this, "combo", "logic", this.properties.logic, (v) => { this.properties.logic = v; }, { values: ["none", "AND", "OR"] });
        addW(this, "combo", "condition2", this.properties.condition2, (v) => { this.properties.condition2 = v; }, { values: ["timeElapsedGT", "hpPercentLT", "distToPlayerLT", "random"] }, "cond2");
        addW(this, "number", "value2", this.properties.value2, (v) => { this.properties.value2 = v; }, { step: 1 }, "val2");
    }
    BehaviorBranchNode.title = "Branch";
    BehaviorBranchNode.desc = "条件で分岐する。timeElapsedGT=経過秒, hpPercentLT=HP%未満(撃ち手自身のHP), distToPlayerLT=自機との距離未満, random=True側に進む確率%(通過するたび抽選)。logicをAND/ORにするとcondition2/value2も評価して組み合わせる(noneなら1つ目のみ)。";

    function BehaviorLoopNode() {
        this.addInput("In", "flow");
        this.addOutput("Target", "flow");
        this.addOutput("Next", "flow");
        this.properties = { count: -1 };
        addW(this, "number", "count", this.properties.count, (v) => { this.properties.count = v; }, { step: 1, precision: 0 });
    }
    BehaviorLoopNode.title = "Loop";
    BehaviorLoopNode.desc = "Target出力を繋いだノードへジャンプする。countは残り回数(-1=無限)。使い切るとNext出力へ進む。";

    function BehaviorSpinNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { axis: "y", degrees: 360, duration: 0.6, loop: false };
        addW(this, "combo", "axis", this.properties.axis, (v) => { this.properties.axis = v; }, { values: ["x", "y", "z"] });
        this.addInput("degrees", "number");
        addW(this, "number", "degrees", this.properties.degrees, (v) => { this.properties.degrees = v; }, { step: 10 }, "deg");
        this.addInput("duration", "number");
        addW(this, "number", "duration", this.properties.duration, (v) => { this.properties.duration = v; }, { step: 0.1, min: 0 }, "dur");
        addW(this, "toggle", "loop", this.properties.loop, (v) => { this.properties.loop = v; });
    }
    BehaviorSpinNode.title = "Spin";
    BehaviorSpinNode.desc = "3Dモデルの指定軸をduration秒かけてdegrees度(相対)回転させる。ブロックしない(Punchと同じ)ので後続のMove/MoveToと並行実行できる。loop=ONならduration秒周期で無限に回転し続ける(回転し続ける演出台等に)。次のSpin/Punchが実行されるまで回り続ける。degrees/durationはRandomノードから配線可能(loop中に周期LFOのRandomを繋ぐと回転速度が揺らぐ)。";

    function BehaviorPunchNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { axis: "x", degrees: -30, outDuration: 0.05, inDuration: 0.12 };
        addW(this, "combo", "axis", this.properties.axis, (v) => { this.properties.axis = v; }, { values: ["x", "y", "z"] });
        this.addInput("degrees", "number");
        addW(this, "number", "degrees", this.properties.degrees, (v) => { this.properties.degrees = v; }, { step: 5 }, "deg");
        this.addInput("outDuration", "number");
        addW(this, "number", "outDuration", this.properties.outDuration, (v) => { this.properties.outDuration = v; }, { step: 0.01, min: 0 }, "outDur");
        this.addInput("inDuration", "number");
        addW(this, "number", "inDuration", this.properties.inDuration, (v) => { this.properties.inDuration = v; }, { step: 0.01, min: 0 }, "inDur");
    }
    BehaviorPunchNode.title = "Punch";
    BehaviorPunchNode.desc = "3Dモデルの指定軸を一瞬だけdegrees度(相対)傾けてすぐ戻す。ブロックしない。攻撃の反動演出として使うのが典型例。degrees/outDuration/inDurationはRandomノードから配線可能。";

    // Behavior Graph側から「今何のShot Patternで攻撃するか」を切り替えるための制御ノード。
    // 実際の発射ロジックは持たず、Enemyが持つShotRuntimeを差し替えるトリガーとして働く
    // (Enemy.setActiveShotPattern()参照)。shotPatternIdはShot Patternタブに登録済みのIDから
    // ドロップダウンで選ぶ(getShotIdOptions()、常に最新の一覧を反映)。
    function BehaviorAttackNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { shotPatternId: "(none)" };
        addW(this, "combo", "shotPatternId", this.properties.shotPatternId, (v) => { this.properties.shotPatternId = v; }, { values: () => getShotIdOptions() }, "attack");
        this.color = "#5a2a2a";
        this.bgcolor = "#3a1c1c";
    }
    BehaviorAttackNode.title = "Attack";
    BehaviorAttackNode.desc = "現在アクティブな発射パターン(Shot Pattern)を切り替える。指定したパターンはStartから再スタートし、次にAttackノードで切り替えるまでループし続ける(各パターン自身のLoopノードに従う)。\"(none)\"を選ぶと攻撃を停止する。ブロックしない、即座に次へ進む。EnemyDataのShotPatternID(初期の発射パターン)は引き続き有効で、このノードはそれを上書きする形になる。";

    // UE Blueprintの「Reroute」相当。何もせずNextへ即座に進むだけの中継ノード。
    // 線を整理してすっきりさせるためだけに使う(実行順序・パラメータには一切影響しない)。
    function BehaviorRerouteNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = {};
        this.size = [40, 26];
        this.title = "";
    }
    BehaviorRerouteNode.title = "Reroute";
    BehaviorRerouteNode.desc = "何もしない中継ポイント。配線を整理してすっきりさせるためだけに使う。実行順序には影響しない。";

    // 実行に一切関与しない、メモ書き専用の独立ノード。In/Outどちらも持たないので何にも
    // 接続する必要がない(グラフのどこにでも自由に置ける付箋のようなもの)。
    function BehaviorCommentNode() {
        this.properties = { text: "コメント" };
        addW(this, "text", "text", this.properties.text, (v) => { this.properties.text = v; }, { multiline: true });
        this.size = [200, 130];
        this.color = "#4a4a2a";
        this.bgcolor = "#3a3a1a";
    }
    BehaviorCommentNode.title = "Comment";
    BehaviorCommentNode.desc = "実行には一切関与しないメモ書き用ノード。何にも接続しなくてよい。グラフの説明・TODO等に。";
    // ウィジェット行自体は1行しか表示できない(LiteGraphの標準仕様)ため、複数行の内容は
    // ノード本体に自前で描画する。ウィジェット行はクリックしてtextareaを開くための入口として残す。
    BehaviorCommentNode.prototype.onDrawForeground = function (ctx) {
        if (this.flags && this.flags.collapsed) return;
        const text = this.properties.text || "";
        if (!text) return;
        const lines = text.split("\n");
        ctx.save();
        ctx.fillStyle = "#ddd";
        ctx.font = "11px Arial";
        ctx.textAlign = "left";
        const startY = 46; // ウィジェット行(1行分)の下から開始
        const lineHeight = 14;
        const maxLines = Math.max(0, Math.floor((this.size[1] - startY) / lineHeight));
        for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
            ctx.fillText(lines[i], 10, startY + i * lineHeight, this.size[0] - 20);
        }
        ctx.restore();
    };

    // UE Blueprintの「Random Float」+「Timeline」的な値ノード。フローには一切参加せず(In/Nextを
    // 持たない)、出力"Value"を他ノードの数値項目(角度・速度・秒数など)の入力ソケットに繋いで使う。
    // mode=onceは初回に1回だけ抽選して以後固定、mode=intervalはinterval秒ごとに再抽選し続ける
    // (周期的に値が変動する「ランダムLFO」相当)。Behavior/Shot両ドメイン共通で使える。
    function BehaviorRandomNode() {
        this.addOutput("Value", "number");
        this.properties = { min: 0, max: 1, mode: "once", interval: 1.0 };
        addW(this, "number", "min", this.properties.min, (v) => { this.properties.min = v; }, { step: 1 });
        addW(this, "number", "max", this.properties.max, (v) => { this.properties.max = v; }, { step: 1 });
        addW(this, "combo", "mode", this.properties.mode, (v) => { this.properties.mode = v; }, { values: ["once", "interval"] });
        addW(this, "number", "interval", this.properties.interval, (v) => { this.properties.interval = v; }, { step: 0.1, min: 0.05 }, "itv");
        this.color = "#2a3a4a";
        this.bgcolor = "#1c2833";
    }
    BehaviorRandomNode.title = "Random";
    BehaviorRandomNode.desc = "min〜maxの範囲で乱数値を出力する値ノード(フロー接続は不要、Value出力を他ノードの数値項目の入力ソケットに繋いで使う)。mode=onceは最初の1回だけ抽選して以後その値で固定。mode=intervalはinterval秒ごとに再抽選し続ける(周期的に揺らぐランダムLFO)。";

    // --- Shot Pattern専用ノード(発射系) ---------------------------------------------------

    function ShotFireNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { aim: "fixed", angle: 270, speed: 5.0, damage: 10, pierceCount: 0, prefabName: '(default)', color: '', glowIntensity: 1.0 };
        addW(this, "combo", "aim", this.properties.aim, (v) => { this.properties.aim = v; }, { values: ["fixed", "atPlayer"] });
        this.addInput("angle", "number");
        addW(this, "number", "angle", this.properties.angle, (v) => { this.properties.angle = v; }, { step: 10 }, "ang");
        this.addInput("speed", "number");
        addW(this, "number", "speed", this.properties.speed, (v) => { this.properties.speed = v; }, { step: 1 }, "spd");
        this.addInput("damage", "number");
        addW(this, "number", "damage", this.properties.damage, (v) => { this.properties.damage = v; }, { step: 1 }, "dmg");
        this.addInput("pierceCount", "number");
        addW(this, "number", "pierceCount", this.properties.pierceCount, (v) => { this.properties.pierceCount = v; }, { step: 1, precision: 0 }, "pierce");
        addW(this, 'combo', 'prefabName', this.properties.prefabName, (v) => { this.properties.prefabName = v; }, { values: () => getBulletPrefabOptions() }, 'prefab');
        addW(this, 'text', 'color', this.properties.color, (v) => { this.properties.color = v; }, {}, 'color');
        this.addInput('glowIntensity', 'number');
        addW(this, 'number', 'glowIntensity', this.properties.glowIntensity, (v) => { this.properties.glowIntensity = v; }, { step: 0.1, min: 0 }, 'glow');
    }
    ShotFireNode.title = "Fire";
    ShotFireNode.desc = "単発を1発撃って即座に次へ進む(ブロックしない)。aim=atPlayerでangleを無視し自機方向へ(敵発射のみ有効、自機発射では無視される)。pierceCount: 0=通常(1ヒットで消滅) / -1=無限貫通 / N=N回ヒットで消滅。prefabName='(default)'ならGameManagerの既定bulletPrefab、それ以外はassets/resources/Prefabs/Bullets/内の同名Prefabを使う。colorは\"#rrggbb\"形式(空欄なら既定の敵/自機色のまま)。glowIntensityは発光の明るさ倍率(既定1.0)。連射させたい場合は直後にWait→Loopで繋ぐ。数値パラメータはRandomノードから配線可能。";

    function ShotMultiFireNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { aim: "fixed", angle: 270, count: 3, angleSpread: 0, staggerDelay: 0, speed: 5.0, damage: 10, pierceCount: 0, prefabName: '(default)', color: '', glowIntensity: 1.0 };
        addW(this, "combo", "aim", this.properties.aim, (v) => { this.properties.aim = v; }, { values: ["fixed", "atPlayer"] });
        this.addInput("angle", "number");
        addW(this, "number", "angle", this.properties.angle, (v) => { this.properties.angle = v; }, { step: 10 }, "ang");
        this.addInput("count", "number");
        addW(this, "number", "count", this.properties.count, (v) => { this.properties.count = v; }, { step: 1, min: 1, precision: 0 });
        this.addInput("angleSpread", "number");
        addW(this, "number", "angleSpread", this.properties.angleSpread, (v) => { this.properties.angleSpread = v; }, { step: 5 }, "spread");
        this.addInput("staggerDelay", "number");
        addW(this, "number", "staggerDelay", this.properties.staggerDelay, (v) => { this.properties.staggerDelay = v; }, { step: 0.01, min: 0 }, "stagger");
        this.addInput("speed", "number");
        addW(this, "number", "speed", this.properties.speed, (v) => { this.properties.speed = v; }, { step: 1 }, "spd");
        this.addInput("damage", "number");
        addW(this, "number", "damage", this.properties.damage, (v) => { this.properties.damage = v; }, { step: 1 }, "dmg");
        this.addInput("pierceCount", "number");
        addW(this, "number", "pierceCount", this.properties.pierceCount, (v) => { this.properties.pierceCount = v; }, { step: 1, precision: 0 }, "pierce");
        addW(this, 'combo', 'prefabName', this.properties.prefabName, (v) => { this.properties.prefabName = v; }, { values: () => getBulletPrefabOptions() }, 'prefab');
        addW(this, 'text', 'color', this.properties.color, (v) => { this.properties.color = v; }, {}, 'color');
        this.addInput('glowIntensity', 'number');
        addW(this, 'number', 'glowIntensity', this.properties.glowIntensity, (v) => { this.properties.glowIntensity = v; }, { step: 0.1, min: 0 }, 'glow');
    }
    ShotMultiFireNode.title = "MultiFire";
    ShotMultiFireNode.desc = "count発を1回のトリガーで撃つ。angleSpread>0かつstaggerDelay=0なら「拡散弾」(中心角angleを軸にcount発を扇状に同時発射)。angleSpread=0かつstaggerDelay>0なら「複数発射」(同じ角度へstaggerDelay秒間隔で連続発射、撃ち切るまでブロックする)。両方組み合わせも可。prefabName/color/glowIntensityで見た目を上書きできる(Fireノードと同じ)。数値パラメータはRandomノードから配線可能。";

    function ShotMissileNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { angle: 270, speed: 3.0, damage: 15, homing: false, turnRate: 0.1, pierceCount: 0, prefabName: '(default)', color: '', glowIntensity: 1.0 };
        this.addInput("angle", "number");
        addW(this, "number", "angle", this.properties.angle, (v) => { this.properties.angle = v; }, { step: 10 }, "ang");
        this.addInput("speed", "number");
        addW(this, "number", "speed", this.properties.speed, (v) => { this.properties.speed = v; }, { step: 1 }, "spd");
        this.addInput("damage", "number");
        addW(this, "number", "damage", this.properties.damage, (v) => { this.properties.damage = v; }, { step: 1 }, "dmg");
        addW(this, "toggle", "homing", this.properties.homing, (v) => { this.properties.homing = v; });
        this.addInput("turnRate", "number");
        addW(this, "number", "turnRate", this.properties.turnRate, (v) => { this.properties.turnRate = v; }, { step: 0.01, min: 0 }, "turn");
        this.addInput("pierceCount", "number");
        addW(this, "number", "pierceCount", this.properties.pierceCount, (v) => { this.properties.pierceCount = v; }, { step: 1, precision: 0 }, "pierce");
        addW(this, 'combo', 'prefabName', this.properties.prefabName, (v) => { this.properties.prefabName = v; }, { values: () => getBulletPrefabOptions() }, 'prefab');
        addW(this, 'text', 'color', this.properties.color, (v) => { this.properties.color = v; }, {}, 'color');
        this.addInput('glowIntensity', 'number');
        addW(this, 'number', 'glowIntensity', this.properties.glowIntensity, (v) => { this.properties.glowIntensity = v; }, { step: 0.1, min: 0 }, 'glow');
    }
    ShotMissileNode.title = "Missile";
    ShotMissileNode.desc = "低速だが威力の高い弾を1発撃つ。ブロックしない。homing=ONで発射直後にターゲット(自機発射なら最寄りの敵、敵発射なら自機)を自動取得して追尾する(turnRateが旋回の強さ、Bullet.steerForceに対応)。prefabName/color/glowIntensityで見た目を上書きできる(Fireノードと同じ)。数値パラメータはRandomノードから配線可能。";

    LiteGraph.registerNodeType("behavior/start", BehaviorStartNode);
    LiteGraph.registerNodeType("behavior/move", BehaviorMoveNode);
    LiteGraph.registerNodeType("behavior/moveto", BehaviorMoveToNode);
    LiteGraph.registerNodeType("behavior/wait", BehaviorWaitNode);
    LiteGraph.registerNodeType("behavior/branch", BehaviorBranchNode);
    LiteGraph.registerNodeType("behavior/loop", BehaviorLoopNode);
    LiteGraph.registerNodeType("behavior/spin", BehaviorSpinNode);
    LiteGraph.registerNodeType("behavior/punch", BehaviorPunchNode);
    LiteGraph.registerNodeType("behavior/attack", BehaviorAttackNode);
    LiteGraph.registerNodeType("behavior/reroute", BehaviorRerouteNode);
    LiteGraph.registerNodeType("behavior/comment", BehaviorCommentNode);
    LiteGraph.registerNodeType("behavior/random", BehaviorRandomNode);
    LiteGraph.registerNodeType("shot/fire", ShotFireNode);
    LiteGraph.registerNodeType("shot/multifire", ShotMultiFireNode);
    LiteGraph.registerNodeType("shot/missile", ShotMissileNode);
}

// グラフドメイン("behavior"|"shot")に応じて、LiteGraphのAdd Node検索に出てくるノード種類を
// 絞り込む。共有ノード(Start/Wait/Branch/Loop/Random/Reroute/Comment)は常に両方で使える。
// allNodeCtorsに全コンストラクタを退避しておき、registered_node_typesへの出し入れだけを行う
// (initLiteGraph側で一度registerBehaviorNodeTypes()した後に呼ばれる想定)。
function setActiveNodePalette(domain) {
    if (!window.LiteGraph || !window.LiteGraph.registered_node_types) return;
    const allowed = new Set(SHARED_NODE_TYPES.concat(domain === 'shot' ? SHOT_ONLY_TYPES : BEHAVIOR_ONLY_TYPES));
    OUR_NODE_TYPES.forEach((type) => {
        if (allowed.has(type)) {
            if (allNodeCtors[type]) window.LiteGraph.registered_node_types[type] = allNodeCtors[type];
        } else {
            delete window.LiteGraph.registered_node_types[type];
        }
    });
}

// LGraphCanvas.prototype.promptの置き換え。数値/コンボウィジェットのクリックや、ノード名の
// リネームなど、値を1つだけ聞きたい場面全般でLiteGraph側から呼ばれる
// (title, value, callback, event, multiline)。クリック位置の近くに、単純なinputを1つ出すだけにする。
// multiline=trueの場合はtextarea(Commentノードなど複数行テキスト用)にし、Enterは改行として
// 素通しする(確定はEscape/フォーカス外れのみ)。それ以外は従来通りEnterで確定・Escapeでキャンセル。
function customWidgetPrompt(title, value, callback, event, multiline) {
    if (!litegraphCanvas || !litegraphCanvas.canvas) return;
    const container = litegraphCanvas.canvas.parentNode;
    if (!container) return;

    const box = document.createElement('div');
    box.className = 'be-value-prompt' + (multiline ? ' multiline' : '');

    const label = document.createElement('span');
    label.className = 'be-value-prompt-label';
    label.textContent = title || '';

    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value != null ? String(value) : '';

    box.appendChild(label);
    box.appendChild(input);
    container.appendChild(box);

    const rect = container.getBoundingClientRect();
    let left = 10;
    let top = 10;
    if (event && typeof event.clientX === 'number') {
        left = event.clientX - rect.left + 8;
        top = event.clientY - rect.top + 8;
    }
    const boxWidth = multiline ? 240 : 180;
    left = Math.max(4, Math.min(left, Math.max(4, rect.width - boxWidth)));
    top = Math.max(4, Math.min(top, Math.max(4, rect.height - (multiline ? 140 : 40))));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;

    let done = false;
    const finish = (shouldCommit) => {
        if (done) return;
        done = true;
        if (box.parentNode) box.parentNode.removeChild(box);
        if (shouldCommit) callback(input.value);
    };

    input.addEventListener('keydown', (e) => {
        // Ctrl+S/Delete等のグローバルショートカット(パネル全体用)に奪われないよう、
        // このinput内でのキー入力は外へ伝播させない。
        e.stopPropagation();
        if (e.key === 'Enter' && !multiline) {
            e.preventDefault();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
        // multilineの場合、Enterはtextareaの標準動作(改行)に任せる。
    });
    input.addEventListener('blur', () => finish(true));

    requestAnimationFrame(() => {
        input.focus();
        if (input.select) input.select();
    });
}

async function initLiteGraph(panel) {
    try {
        const [css, js] = await Promise.all([
            loadLibFileText('litegraph.css'),
            loadLibFileText('litegraph.min.js'),
        ]);
        injectInlineStyle(css);
        execInlineScript(js);

        if (typeof window.LiteGraph === 'undefined') {
            throw new Error('LiteGraph global not found after inline script execution.');
        }

        registerBehaviorNodeTypes(window.LiteGraph);

        // 自前で登録したノード(OUR_NODE_TYPES)の参照を退避してから、LiteGraph同梱の既定ノード
        // (MAX/MIN/SIN()等の数式ノード)を含め、それ以外は登録から完全に削除する
        // (ダブルクリック検索やAdd Nodeメニューに出てこないようにするため)。
        // Behavior/Shot間の出し分けはsetActiveNodePalette()が担当する。
        OUR_NODE_TYPES.forEach((type) => {
            if (window.LiteGraph.registered_node_types[type]) {
                allNodeCtors[type] = window.LiteGraph.registered_node_types[type];
            }
        });
        if (window.LiteGraph.registered_node_types) {
            Object.keys(window.LiteGraph.registered_node_types).forEach((type) => {
                if (!OUR_NODE_TYPES.includes(type)) {
                    delete window.LiteGraph.registered_node_types[type];
                }
            });
        }
        setActiveNodePalette(graphDomain);

        // ノードをダブルクリックした際に画面を覆うように出てくる既定の「ノードパネル」を無効化する。
        // (「クリックするとふいにプロパティが開く」「Valueをダブルクリックすると全プロパティ表示が
        // 出てくる」問題の原因。実際のトリガーは processNodeDblClicked() が呼ぶ
        // showShowNodePanel()という名前("Show"が二重、litegraph.js側のtypo)で、
        // 一般的な"showNodePanel"という名前のメソッドは存在しない。プロパティは各ノード上の
        // ウィジェットで直接編集できるため、このパネル自体が不要)。
        if (window.LGraphCanvas) {
            window.LGraphCanvas.prototype.showShowNodePanel = function () {};
        }

        // Value編集ダイアログ(数値ウィジェット等をクリックした時に出る入力欄)を独自実装に置き換える。
        // 標準実装は画面左上/毎回固定位置に出る・ダブルクリック時に不自然な折り返しが起きる・
        // という指摘があったため、クリック位置の近くに出る単純な1行inputにする。
        if (window.LGraphCanvas) {
            window.LGraphCanvas.prototype.prompt = customWidgetPrompt;
        }

        // グリッドのマス目自体は10pxとかなり細かく、スナップしても見た目でほぼ分からないため、
        // Snapを意味のある操作として感じられるよう広めに変更する。
        window.LiteGraph.CANVAS_GRID_SIZE = 40;

        litegraph = new window.LGraph();
        litegraphCanvas = new window.LGraphCanvas(panel.$.canvas, litegraph);
        // showShowNodePanelの無効化と二重の保険として、インスタンス側のフックでも上書きしておく
        // (processNodeDblClickedはonShowNodePanelが定義されていればそちらを優先して呼ぶ)。
        litegraphCanvas.onShowNodePanel = function () {};

        // パネル初期表示時、レイアウト確定前のサイズでcanvasの内部解像度が決まってしまい
        // 引き伸ばされて見えることがあるため、作成直後と次フレームの両方でresizeし直す
        // (このパネルではBehavior/Shotどちらのグラフタブも最初は非表示のため、実際に意味のある
        // サイズになるのはswitchToGraph()側のresize呼び出し。ここでの呼び出しはエラーにならない
        // よう安全に呼ぶだけ)。
        if (litegraphCanvas.resize) litegraphCanvas.resize();
        requestAnimationFrame(() => {
            if (litegraphCanvas && litegraphCanvas.resize) litegraphCanvas.resize();
        });

        libReady = true;
        setStatus(panel, 'LiteGraph.js loaded. Select a pattern on the left, or create a new one.', false);
    } catch (err) {
        console.error('[BehaviorEditor Panel] Failed to load LiteGraph.js:', err);
        setStatus(
            panel,
            'LiteGraph.js が見つかりません。extensions/behavior-editor/panels/default/lib/ に litegraph.min.js と litegraph.css を配置してください。',
            true
        );
    }
}

// ==================================================================================
// --- タブ切り替え(CSVテーブル ⇔ Behavior Graph ⇔ Shot Pattern) --------------------------
// ==================================================================================

// CSVテーブル側に未保存の変更がある時だけ確認を挟む(グラフ側はUndo履歴があるので確認なしで良い)。
function confirmDiscardIfDirty() {
    if (viewMode === 'csv' && dirty) {
        return confirm(`${currentFile} has unsaved changes. Discard them?`);
    }
    return true;
}

function renderTabBar(panel) {
    const tabBar = panel.$.tabBar;
    tabBar.innerHTML = '';
    CSV_FILES.forEach(({ label, file }) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (viewMode === 'csv' && file === currentFile ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => switchToCsv(panel, file));
        tabBar.appendChild(btn);
    });

    const behaviorBtn = document.createElement('button');
    behaviorBtn.className = 'tab-btn tab-btn-graph' + (viewMode === 'graph' && graphDomain === 'behavior' ? ' active' : '');
    behaviorBtn.textContent = '🧩 Behavior Graph';
    behaviorBtn.addEventListener('click', () => switchToGraph(panel, 'behavior'));
    tabBar.appendChild(behaviorBtn);

    const shotBtn = document.createElement('button');
    shotBtn.className = 'tab-btn tab-btn-graph' + (viewMode === 'graph' && graphDomain === 'shot' ? ' active' : '');
    shotBtn.textContent = '🔫 Shot Pattern';
    shotBtn.addEventListener('click', () => switchToGraph(panel, 'shot'));
    tabBar.appendChild(shotBtn);
}

function updateViewVisibility(panel) {
    const isGraph = viewMode === 'graph';
    panel.$.mmView.style.display = isGraph ? 'none' : 'flex';
    panel.$.beView.style.display = isGraph ? 'flex' : 'none';
    if (isGraph) {
        // display:noneの間はcanvasの実サイズが0になっているため、表示された直後にレイアウトが
        // 確定してからリサイズし直す(初期表示が引き伸びて見える問題と同じ原因)。
        requestAnimationFrame(() => {
            if (litegraphCanvas && litegraphCanvas.resize) litegraphCanvas.resize();
        });
    }
}

async function switchToCsv(panel, file) {
    if (!confirmDiscardIfDirty()) return;
    viewMode = 'csv';
    updateViewVisibility(panel);
    await loadFile(panel, file);
    renderTabBar(panel);
}

async function switchToGraph(panel, domain) {
    if (!confirmDiscardIfDirty()) return;
    const domainChanged = viewMode !== 'graph' ? true : graphDomain !== domain;
    viewMode = 'graph';
    graphDomain = domain;

    if (domainChanged) {
        // Behavior/Shotはノード語彙が異なるため、ドメイン切り替え時は選択中のグラフをクリアする
        // (前ドメインのグラフを出しっぱなしにすると、Add Nodeで再現できないノードが残って紛らわしい)。
        setActiveNodePalette(domain);
        currentId = null;
        panel.$.currentIdLabel.textContent = '(none)';
        panel.$.currentNoteInput.value = '';
        if (litegraph) litegraph.clear();
        resetUndoHistory();
    }

    renderTabBar(panel);
    updateViewVisibility(panel);
    await refreshGraphList(panel);
}

module.exports = Editor.Panel.define({
    listeners: {
        // panelActiveはGraph側のキーボードショートカット(Ctrl+S/Delete/Ctrl+Z/Ctrl+Shift+Z)と
        // Undo履歴ポーリング/説明バー更新を「このパネルが表示中の時だけ」に絞るためのフラグ。
        show() {
            console.log('[MasterManager Panel] Show');
            panelActive = true;
            if (litegraphCanvas && litegraphCanvas.resize) litegraphCanvas.resize();
        },
        hide() {
            console.log('[MasterManager Panel] Hide');
            panelActive = false;
        },
        resize() {
            if (litegraphCanvas && litegraphCanvas.resize) litegraphCanvas.resize();
        },
    },

    template: `
        <div class="panel-root">
            <div class="header">⚙️ Master Manager / 🧩 Behavior Graph / 🔫 Shot Pattern</div>
            <div class="tab-bar"></div>

            <div class="mm-view">
                <div class="table-scroll">
                    <div class="table-wrap"></div>
                </div>
                <div class="mm-footer">
                    <div class="footer-buttons">
                        <button class="btn-refresh">🔄 Refresh</button>
                        <button class="btn-add-row">➕ Add Row</button>
                        <button class="btn-save">💾 Save</button>
                    </div>
                </div>
            </div>

            <div class="be-view" style="display: none;">
                <div class="node-desc-bar">ノードにカーソルを合わせると、ここに説明が表示されます。</div>
                <div class="be-body">
                    <div class="sidebar">
                        <div class="sidebar-buttons">
                            <button class="be-btn-new">➕ New</button>
                            <button class="be-btn-duplicate">📋 Duplicate</button>
                            <button class="be-btn-rename">✏️ Rename</button>
                            <button class="be-btn-delete">🗑 Delete</button>
                            <button class="be-btn-refresh">🔄 Refresh</button>
                        </div>
                        <div class="behavior-list"></div>
                    </div>
                    <div class="canvas-area">
                        <div class="canvas-toolbar">
                            <span>Editing: <b class="current-id">(none)</b></span>
                            <input class="current-note-input" type="text" placeholder="Note (このパターンの説明、任意)" />
                            <label class="grid-snap-label"><input class="grid-snap-toggle" type="checkbox" /> Snap</label>
                            <button class="be-btn-save">💾 Save</button>
                        </div>
                        <canvas class="graph-canvas"></canvas>
                    </div>
                </div>
            </div>

            <div class="footer">
                <span class="status"></span>
            </div>

            <div class="modal-overlay hidden">
                <div class="modal-box">
                    <div class="modal-title"></div>
                    <input class="modal-input" type="text" />
                    <input class="modal-note" type="text" placeholder="Note (任意)" />
                    <div class="modal-buttons">
                        <button class="modal-cancel">Cancel</button>
                        <button class="modal-ok">OK</button>
                    </div>
                </div>
            </div>
        </div>
    `,

    style: `
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
            box-sizing: border-box;
            background-color: #242424;
            color: #ffffff;
            font-family: sans-serif;
            font-size: 12px;
        }
        .panel-root {
            position: relative;
            padding: 16px;
            display: flex;
            flex-direction: column;
            height: 100%;
            box-sizing: border-box;
        }
        .header {
            font-size: 16px;
            font-weight: bold;
            color: #4da6ff;
            margin-bottom: 12px;
            border-bottom: 1px solid #3d3d3d;
            padding-bottom: 6px;
            flex-shrink: 0;
        }
        .tab-bar {
            display: flex;
            gap: 6px;
            margin-bottom: 10px;
            flex-shrink: 0;
            flex-wrap: wrap;
        }
        .tab-btn {
            padding: 5px 12px;
            background: #333;
            color: #ccc;
            border: 1px solid #444;
            border-radius: 4px;
            cursor: pointer;
        }
        .tab-btn.active {
            background: #007acc;
            color: #fff;
            font-weight: bold;
        }
        .tab-btn-graph.active {
            background: #7a4fbd;
        }

        /* --- CSVテーブル (Master Manager) 側 --- */
        .mm-view { flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 8px; }
        .table-scroll {
            flex: 1;
            overflow: auto;
            background: #1a1a1a;
            border-radius: 6px;
            padding: 8px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
        }
        th, td {
            border: 1px solid #3d3d3d;
            padding: 2px 4px;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
        }
        th {
            background: #2a2a2a;
            position: sticky;
            top: 0;
            box-sizing: border-box;
        }
        .th-label { display: inline-block; overflow: hidden; text-overflow: ellipsis; max-width: 100%; vertical-align: middle; }
        .th-label.sortable { cursor: pointer; }
        .th-label.sortable:hover { color: #4da6ff; }
        .col-resize-handle {
            position: absolute;
            top: 0;
            right: -3px;
            width: 6px;
            height: 100%;
            cursor: col-resize;
            z-index: 5;
        }
        .col-resize-handle:hover { background: #4da6ff; opacity: 0.5; }
        td input {
            background: #2a2a2a;
            border: 1px solid #444;
            color: #fff;
            padding: 3px 5px;
            border-radius: 3px;
            width: 100%;
            box-sizing: border-box;
        }
        .btn-del-row {
            background: #5a2020;
            color: #fff;
            border: 1px solid #7a3030;
            border-radius: 3px;
            cursor: pointer;
            padding: 2px 6px;
        }
        .mm-footer {
            flex-shrink: 0;
            display: flex;
            justify-content: flex-end;
        }
        .footer-buttons {
            display: flex;
            gap: 8px;
        }
        .btn-refresh {
            padding: 6px 14px;
            background: #2d5f8a;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .btn-add-row {
            padding: 6px 14px;
            background: #444;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .btn-save {
            padding: 6px 14px;
            background: #28a745;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
        }

        /* --- Behavior Graph / Shot Pattern (ノードグラフ編集) 側 --- */
        .be-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
        .be-body { flex: 1; display: flex; min-height: 0; gap: 8px; }
        .sidebar { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; background: #1a1a1a; border-radius: 6px; padding: 8px; }
        .sidebar-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .sidebar-buttons button { flex: 1 1 auto; min-width: 60px; padding: 5px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer; }
        .behavior-list { flex: 1; overflow: auto; }
        .behavior-item { padding: 6px 8px; border-radius: 4px; cursor: pointer; margin-bottom: 2px; word-break: break-all; }
        .behavior-item:hover { background: #2a2a2a; }
        .behavior-item.active { background: #007acc; color: #fff; }
        .canvas-area { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .be-value-prompt {
            position: absolute;
            display: flex;
            align-items: center;
            gap: 6px;
            background: #222;
            border: 1px solid #555;
            border-radius: 4px;
            padding: 4px 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
            z-index: 50;
        }
        .be-value-prompt-label { font-size: 11px; color: #aaa; white-space: nowrap; }
        .be-value-prompt input {
            width: 100px;
            background: #111;
            border: 1px solid #444;
            color: #fff;
            padding: 3px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
        .be-value-prompt.multiline { align-items: flex-start; }
        .be-value-prompt textarea {
            width: 220px;
            height: 100px;
            resize: both;
            background: #111;
            border: 1px solid #444;
            color: #fff;
            padding: 4px 6px;
            border-radius: 3px;
            font-size: 12px;
            font-family: inherit;
        }
        .canvas-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
        .canvas-toolbar .be-btn-save { padding: 6px 14px; background: #28a745; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; flex-shrink: 0; }
        .current-id { color: #4da6ff; }
        .current-note-input {
            flex: 1 1 120px;
            min-width: 0;
            background: #1a1a1a;
            border: 1px solid #444;
            color: #fff;
            padding: 5px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .grid-snap-label { flex-shrink: 0; display: flex; align-items: center; gap: 4px; font-size: 12px; color: #ccc; cursor: pointer; white-space: nowrap; }
        .grid-snap-label input { cursor: pointer; }
        .node-desc-bar {
            flex-shrink: 0;
            font-size: 11px;
            color: #aaa;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 4px 8px;
            margin-bottom: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .graph-canvas { flex: 1; width: 100%; height: 100%; background: #1a1a1a; border-radius: 6px; }

        /* --- 共有フッター(ステータス行のみ) --- */
        .footer { flex-shrink: 0; margin-top: 10px; }
        .status { font-size: 12px; color: #8fd68f; }

        /* --- Graph用モーダル --- */
        .modal-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }
        .modal-overlay.hidden { display: none; }
        .modal-box {
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 16px;
            width: 320px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        }
        .modal-title { font-size: 13px; color: #ddd; margin-bottom: 4px; }
        .modal-input, .modal-note {
            background: #1a1a1a;
            border: 1px solid #444;
            color: #fff;
            padding: 6px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .modal-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
        .modal-buttons button { padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; }
        .modal-cancel { background: #444; color: #fff; }
        .modal-ok { background: #007acc; color: #fff; font-weight: bold; }
    `,

    $: {
        tabBar: '.tab-bar',

        mmView: '.mm-view',
        tableWrap: '.table-wrap',
        refreshBtn: '.btn-refresh',
        addRowBtn: '.btn-add-row',
        saveBtn: '.btn-save',

        beView: '.be-view',
        nodeDescBar: '.node-desc-bar',
        behaviorList: '.behavior-list',
        canvas: '.graph-canvas',
        currentIdLabel: '.current-id',
        currentNoteInput: '.current-note-input',
        gridSnapToggle: '.grid-snap-toggle',
        beNewBtn: '.be-btn-new',
        beDuplicateBtn: '.be-btn-duplicate',
        beRenameBtn: '.be-btn-rename',
        beDeleteBtn: '.be-btn-delete',
        beRefreshBtn: '.be-btn-refresh',
        beSaveBtn: '.be-btn-save',

        status: '.status',

        modalOverlay: '.modal-overlay',
        modalTitle: '.modal-title',
        modalInput: '.modal-input',
        modalNote: '.modal-note',
        modalOk: '.modal-ok',
        modalCancel: '.modal-cancel',
    },

    methods: {},

    async ready() {
        console.log('[MasterManager Panel] Panel Ready!');

        activePanel = this;
        panelActive = true;

        loadColWidths();

        // --- Master Manager (CSV) ボタン ---
        this.$.refreshBtn.addEventListener('click', () => {
            if (!confirmDiscardIfDirty()) return;
            loadFile(this, currentFile).then(() => renderTabBar(this));
        });
        this.$.addRowBtn.addEventListener('click', () => {
            if (headers.length === 0) return;
            rows.push(headers.map(() => ''));
            dirty = true;
            setStatus(this, 'Unsaved changes.', false);
            renderTable(this);
        });
        this.$.saveBtn.addEventListener('click', () => saveFile(this));

        // --- Graph(Behavior/Shot共通) ボタン ---
        this.$.beNewBtn.addEventListener('click', () => createNew(this));
        this.$.beDuplicateBtn.addEventListener('click', () => duplicateCurrent(this));
        this.$.beRenameBtn.addEventListener('click', () => renameCurrent(this));
        this.$.beDeleteBtn.addEventListener('click', () => deleteCurrent(this));
        this.$.beRefreshBtn.addEventListener('click', () => refreshGraphList(this));
        this.$.beSaveBtn.addEventListener('click', () => saveCurrent(this));
        this.$.gridSnapToggle.addEventListener('change', (e) => {
            if (litegraphCanvas) litegraphCanvas.align_to_grid = e.target.checked;
        });

        document.addEventListener('keydown', onGlobalKeyDown);
        undoPollTimer = setInterval(() => { if (panelActive && viewMode === 'graph') captureUndoPoint(); }, 500);
        descBarTimer = setInterval(() => { if (panelActive && viewMode === 'graph') updateNodeDescBar(this); }, 150);

        updateViewVisibility(this);

        await initLiteGraph(this);
        await refreshGraphList(this);

        // Behavior GraphのAttackノードのドロップダウンはShot Patternタブを開かなくても使える
        // 必要があるため、shotListは起動時に(現在のgraphDomainに関わらず)必ず一度読み込んでおく。
        if (graphDomain !== 'shot') {
            const shotListResult = await Editor.Message.request('behavior-editor', 'list-shots');
            shotList = (shotListResult && shotListResult.ok) ? shotListResult.list : [];
        }

        // Fire/MultiFire/MissileノードのprefabNameドロップダウン用に、Bullet Prefab一覧も起動時に読んでおく。
        const bulletPrefabResult = await Editor.Message.request('behavior-editor', 'list-bullet-prefabs');
        bulletPrefabList = (bulletPrefabResult && bulletPrefabResult.ok) ? bulletPrefabResult.list : [];

        await loadFile(this, currentFile);
        renderTabBar(this);
    },

    beforeClose() {
        document.removeEventListener('keydown', onGlobalKeyDown);
        if (undoPollTimer) { clearInterval(undoPollTimer); undoPollTimer = null; }
        if (descBarTimer) { clearInterval(descBarTimer); descBarTimer = null; }
        panelActive = false;
        activePanel = null;
    },
    close() {},
});
