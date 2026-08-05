'use strict';

// Panel-session state
let behaviorList = [];      // [{id, graphPath, note}]
let currentId = null;
let litegraph = null;       // LGraph instance
let litegraphCanvas = null; // LGraphCanvas instance
let libReady = false;

const NODE_TYPE_MAP = { start: 'Start', move: 'Move', wait: 'Wait', fire: 'Fire', branch: 'Branch', loop: 'Loop', spin: 'Spin', punch: 'Punch' };
const REVERSE_TYPE_MAP = { Start: 'behavior/start', Move: 'behavior/move', Wait: 'behavior/wait', Fire: 'behavior/fire', Branch: 'behavior/branch', Loop: 'behavior/loop', Spin: 'behavior/spin', Punch: 'behavior/punch' };

function setStatus(panel, text, isError) {
    if (!panel.$.status) return;
    panel.$.status.textContent = text;
    panel.$.status.style.color = isError ? '#ff6b6b' : '#8fd68f';
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

// --- LiteGraph <-> BehaviorGraph(独自スキーマ) 変換 -------------------------------------

function outputTargetNodeId(serializedNode, slotIndex, linkById) {
    if (!serializedNode.outputs || !serializedNode.outputs[slotIndex]) return null;
    const linkIds = serializedNode.outputs[slotIndex].links;
    if (!linkIds || linkIds.length === 0) return null;
    const link = linkById[linkIds[0]]; // 1本のみ接続する想定 (複数繋いだ場合は先頭のみ採用)
    return link ? link.targetId : null;
}

function exportGraph(behaviorId) {
    const data = litegraph.serialize();
    const linkById = {};
    (data.links || []).forEach(l => {
        // LiteGraph serialize()のlink形式: [id, origin_id, origin_slot, target_id, target_slot, type]
        linkById[l[0]] = { originId: l[1], originSlot: l[2], targetId: l[3], targetSlot: l[4] };
    });

    const nodePositions = {};
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
        } else {
            out.next = outputTargetNodeId(n, 0, linkById);
        }

        nodePositions[n.id] = n.pos;
        return out;
    });

    return { id: behaviorId, nodes, _editor: { nodePositions } };
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
                node.properties[k] = n.params[k];
                if (node.widgets) {
                    const w = node.widgets.find(w => w.name === k);
                    if (w) w.value = n.params[k];
                }
            });
        }

        const pos = schemaGraph._editor && schemaGraph._editor.nodePositions && schemaGraph._editor.nodePositions[String(n.id)];
        node.pos = pos || [40 + (n.id * 160), 80];

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
    });
}

// --- データ読み込み/保存 (実際のfs I/OはExtensionのmain.js側で行う) -------------------------

async function refreshBehaviorList(panel) {
    const result = await Editor.Message.request('behavior-editor', 'list-behaviors');
    behaviorList = (result && result.ok) ? result.list : [];
    renderSidebar(panel);
}

async function loadBehavior(panel, id) {
    if (!libReady) {
        setStatus(panel, 'LiteGraph.js が読み込まれていないため編集できません。', true);
        return;
    }
    setStatus(panel, `Loading ${id}...`, false);
    const result = await Editor.Message.request('behavior-editor', 'load-graph', id);
    if (!result || !result.ok) {
        setStatus(panel, `Load failed: ${result ? result.error : 'unknown error'}`, true);
        return;
    }
    currentId = id;
    importGraph(result.graph);
    panel.$.currentIdLabel.textContent = id;
    setStatus(panel, result.isNew ? `New graph (not yet saved on disk): ${id}` : `Loaded ${id}.`, false);
    renderSidebar(panel);
}

async function saveCurrent(panel) {
    if (!currentId) {
        setStatus(panel, 'Behaviorが選択されていません。', true);
        return;
    }
    const graph = exportGraph(currentId);
    const result = await Editor.Message.request('behavior-editor', 'save-graph', currentId, graph);
    if (result && result.ok) {
        setStatus(panel, `Saved ${currentId}.`, false);
        await refreshBehaviorList(panel);
    } else {
        setStatus(panel, `Save failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function createNew(panel) {
    const res = await showModal(panel, {
        title: '新しい行動パターンのID (例: BH_NEW_PATTERN)',
        showInput: true,
        inputDefault: '',
        showNote: true,
        okText: 'Create',
    });
    if (!res.ok || !res.value) return;
    const result = await Editor.Message.request('behavior-editor', 'create-behavior', res.value, res.note);
    if (result && result.ok) {
        await refreshBehaviorList(panel);
        await loadBehavior(panel, res.value);
    } else {
        setStatus(panel, `Create failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function duplicateCurrent(panel) {
    if (!currentId) {
        setStatus(panel, 'コピー元のBehaviorが選択されていません。', true);
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
    const result = await Editor.Message.request('behavior-editor', 'duplicate-behavior', currentId, res.value, res.note);
    if (result && result.ok) {
        const sourceId = currentId;
        await refreshBehaviorList(panel);
        await loadBehavior(panel, res.value);
        setStatus(panel, `'${sourceId}' を '${res.value}' として複製しました。`, false);
    } else {
        setStatus(panel, `Duplicate failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function renameCurrent(panel) {
    if (!currentId) {
        setStatus(panel, 'Renameするパターンが選択されていません。', true);
        return;
    }
    const res = await showModal(panel, {
        title: `'${currentId}' の新しいID`,
        showInput: true,
        inputDefault: currentId,
        okText: 'Rename',
    });
    if (!res.ok || !res.value || res.value === currentId) return;
    const result = await Editor.Message.request('behavior-editor', 'rename-behavior', currentId, res.value);
    if (result && result.ok) {
        const oldId = currentId;
        currentId = res.value;
        await refreshBehaviorList(panel);
        await loadBehavior(panel, currentId);
        setStatus(panel, `'${oldId}' を '${currentId}' にリネームしました。`, false);
    } else {
        setStatus(panel, `Rename failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

async function deleteCurrent(panel) {
    if (!currentId) return;
    const res = await showModal(panel, {
        title: `Behaviors.csv から '${currentId}' の行を削除します(JSON実体は残します)。よろしいですか?`,
        okText: 'Delete',
    });
    if (!res.ok) return;
    const result = await Editor.Message.request('behavior-editor', 'delete-behavior', currentId);
    if (result && result.ok) {
        currentId = null;
        panel.$.currentIdLabel.textContent = '(none)';
        if (litegraph) litegraph.clear();
        await refreshBehaviorList(panel);
        setStatus(panel, 'Deleted.', false);
    } else {
        setStatus(panel, `Delete failed: ${result ? result.error : 'unknown error'}`, true);
    }
}

function renderSidebar(panel) {
    const list = panel.$.behaviorList;
    list.innerHTML = '';
    behaviorList.forEach(({ id, note }) => {
        const item = document.createElement('div');
        item.className = 'behavior-item' + (id === currentId ? ' active' : '');
        item.textContent = note ? `${id} — ${note}` : id;
        item.addEventListener('click', () => loadBehavior(panel, id));
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
// 実行(runStep)は使わない — 実際の解釈・実行はランタイム側のBehaviorRuntime.tsが担当する。
function registerBehaviorNodeTypes(LiteGraph) {
    function BehaviorStartNode() {
        this.addOutput("Next", "flow");
        this.properties = {};
    }
    BehaviorStartNode.title = "Start";
    BehaviorStartNode.desc = "行動グラフの入口。1つだけ配置する。";

    function BehaviorMoveNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { pattern: "straight", angle: 270, speed: 2.0, turn: 2.0 };
        this.addWidget("combo", "pattern", this.properties.pattern, (v) => { this.properties.pattern = v; }, { values: ["straight", "zigzag", "homing"] });
        this.addWidget("number", "angle", this.properties.angle, (v) => { this.properties.angle = v; }, { step: 10 });
        this.addWidget("number", "speed", this.properties.speed, (v) => { this.properties.speed = v; }, { step: 1 });
        this.addWidget("number", "turn", this.properties.turn, (v) => { this.properties.turn = v; }, { step: 1 });
    }
    BehaviorMoveNode.title = "Move";
    BehaviorMoveNode.desc = "移動状態を更新して即座に次へ進む。angleは度数(0=右,90=上,180=左,270=下)。zigzag/homingではangleは無視される。";

    function BehaviorWaitNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { seconds: 1.0 };
        this.addWidget("number", "seconds", this.properties.seconds, (v) => { this.properties.seconds = v; }, { step: 1, min: 0 });
    }
    BehaviorWaitNode.title = "Wait";
    BehaviorWaitNode.desc = "指定秒数だけシーケンスを止める(移動は継続する)。";

    function BehaviorFireNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = {};
    }
    BehaviorFireNode.title = "Fire";
    BehaviorFireNode.desc = "このEnemyDataに設定された弾(EnemyBulletData)を1発発射する。待機時間は弾のInterval値を自動使用する。";

    function BehaviorBranchNode() {
        this.addInput("In", "flow");
        this.addOutput("True", "flow");
        this.addOutput("False", "flow");
        this.properties = { condition: "timeElapsedGT", value: 0 };
        this.addWidget("combo", "condition", this.properties.condition, (v) => { this.properties.condition = v; }, { values: ["timeElapsedGT", "hpPercentLT", "distToPlayerLT"] });
        this.addWidget("number", "value", this.properties.value, (v) => { this.properties.value = v; }, { step: 1 });
    }
    BehaviorBranchNode.title = "Branch";
    BehaviorBranchNode.desc = "条件で分岐する。timeElapsedGT=経過秒, hpPercentLT=HP%未満, distToPlayerLT=自機との距離未満。";

    function BehaviorLoopNode() {
        this.addInput("In", "flow");
        this.addOutput("Target", "flow");
        this.addOutput("Next", "flow");
        this.properties = { count: -1 };
        this.addWidget("number", "count", this.properties.count, (v) => { this.properties.count = v; }, { step: 1, precision: 0 });
    }
    BehaviorLoopNode.title = "Loop";
    BehaviorLoopNode.desc = "Target出力を繋いだノードへジャンプする。countは残り回数(-1=無限)。使い切るとNext出力へ進む。";

    function BehaviorSpinNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { axis: "y", degrees: 360, duration: 0.6 };
        this.addWidget("combo", "axis", this.properties.axis, (v) => { this.properties.axis = v; }, { values: ["x", "y", "z"] });
        this.addWidget("number", "degrees", this.properties.degrees, (v) => { this.properties.degrees = v; }, { step: 10 });
        this.addWidget("number", "duration", this.properties.duration, (v) => { this.properties.duration = v; }, { step: 0.1, min: 0 });
    }
    BehaviorSpinNode.title = "Spin";
    BehaviorSpinNode.desc = "3Dモデルの指定軸をduration秒かけてdegrees度(相対)回転させる。完了までシーケンスをブロックする(Waitと同じ扱い)。登場演出などに。";

    function BehaviorPunchNode() {
        this.addInput("In", "flow");
        this.addOutput("Next", "flow");
        this.properties = { axis: "x", degrees: -30, outDuration: 0.05, inDuration: 0.12 };
        this.addWidget("combo", "axis", this.properties.axis, (v) => { this.properties.axis = v; }, { values: ["x", "y", "z"] });
        this.addWidget("number", "degrees", this.properties.degrees, (v) => { this.properties.degrees = v; }, { step: 5 });
        this.addWidget("number", "outDuration", this.properties.outDuration, (v) => { this.properties.outDuration = v; }, { step: 0.01, min: 0 });
        this.addWidget("number", "inDuration", this.properties.inDuration, (v) => { this.properties.inDuration = v; }, { step: 0.01, min: 0 });
    }
    BehaviorPunchNode.title = "Punch";
    BehaviorPunchNode.desc = "3Dモデルの指定軸を一瞬だけdegrees度(相対)傾けてすぐ戻す。ブロックしない。Fireの直後に繋いで攻撃の反動演出として使うのが典型例。";

    LiteGraph.registerNodeType("behavior/start", BehaviorStartNode);
    LiteGraph.registerNodeType("behavior/move", BehaviorMoveNode);
    LiteGraph.registerNodeType("behavior/wait", BehaviorWaitNode);
    LiteGraph.registerNodeType("behavior/fire", BehaviorFireNode);
    LiteGraph.registerNodeType("behavior/branch", BehaviorBranchNode);
    LiteGraph.registerNodeType("behavior/loop", BehaviorLoopNode);
    LiteGraph.registerNodeType("behavior/spin", BehaviorSpinNode);
    LiteGraph.registerNodeType("behavior/punch", BehaviorPunchNode);
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

        litegraph = new window.LGraph();
        litegraphCanvas = new window.LGraphCanvas(panel.$.canvas, litegraph);
        libReady = true;
        setStatus(panel, 'LiteGraph.js loaded. Select a behavior on the left, or create a new one.', false);
    } catch (err) {
        console.error('[BehaviorEditor Panel] Failed to load LiteGraph.js:', err);
        setStatus(
            panel,
            'LiteGraph.js が見つかりません。extensions/behavior-editor/panels/default/lib/ に litegraph.min.js と litegraph.css を配置してください。',
            true
        );
    }
}

module.exports = Editor.Panel.define({
    listeners: {
        show() { console.log('[BehaviorEditor Panel] Show'); },
        hide() { console.log('[BehaviorEditor Panel] Hide'); },
        resize() {
            if (litegraphCanvas && litegraphCanvas.resize) litegraphCanvas.resize();
        },
    },

    template: `
        <div class="panel-root">
            <div class="header">🧩 Behavior Pattern Editor</div>
            <div class="body">
                <div class="sidebar">
                    <div class="sidebar-buttons">
                        <button class="btn-new">➕ New</button>
                        <button class="btn-duplicate">📋 Duplicate</button>
                        <button class="btn-rename">✏️ Rename</button>
                        <button class="btn-delete">🗑 Delete</button>
                    </div>
                    <div class="behavior-list"></div>
                </div>
                <div class="canvas-area">
                    <div class="canvas-toolbar">
                        <span>Editing: <b class="current-id">(none)</b></span>
                        <button class="btn-save">💾 Save</button>
                    </div>
                    <canvas class="graph-canvas"></canvas>
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
        .panel-root { position: relative; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding: 10px; }
        .header { font-size: 16px; font-weight: bold; color: #4da6ff; margin-bottom: 8px; border-bottom: 1px solid #3d3d3d; padding-bottom: 6px; flex-shrink: 0; }
        .body { flex: 1; display: flex; min-height: 0; gap: 8px; }
        .sidebar { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; background: #1a1a1a; border-radius: 6px; padding: 8px; }
        .sidebar-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .sidebar-buttons button { flex: 1 1 auto; min-width: 60px; padding: 5px; background: #333; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer; }
        .behavior-list { flex: 1; overflow: auto; }
        .behavior-item { padding: 6px 8px; border-radius: 4px; cursor: pointer; margin-bottom: 2px; word-break: break-all; }
        .behavior-item:hover { background: #2a2a2a; }
        .behavior-item.active { background: #007acc; color: #fff; }
        .canvas-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .canvas-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .canvas-toolbar .btn-save { padding: 6px 14px; background: #28a745; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
        .current-id { color: #4da6ff; }
        .graph-canvas { flex: 1; width: 100%; height: 100%; background: #1a1a1a; border-radius: 6px; }
        .footer { flex-shrink: 0; margin-top: 8px; }
        .status { font-size: 12px; color: #8fd68f; }

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
        behaviorList: '.behavior-list',
        canvas: '.graph-canvas',
        currentIdLabel: '.current-id',
        status: '.status',
        newBtn: '.btn-new',
        duplicateBtn: '.btn-duplicate',
        renameBtn: '.btn-rename',
        deleteBtn: '.btn-delete',
        saveBtn: '.btn-save',
        modalOverlay: '.modal-overlay',
        modalTitle: '.modal-title',
        modalInput: '.modal-input',
        modalNote: '.modal-note',
        modalOk: '.modal-ok',
        modalCancel: '.modal-cancel',
    },

    methods: {},

    async ready() {
        console.log('[BehaviorEditor Panel] Panel Ready!');

        this.$.newBtn.addEventListener('click', () => createNew(this));
        this.$.duplicateBtn.addEventListener('click', () => duplicateCurrent(this));
        this.$.renameBtn.addEventListener('click', () => renameCurrent(this));
        this.$.deleteBtn.addEventListener('click', () => deleteCurrent(this));
        this.$.saveBtn.addEventListener('click', () => saveCurrent(this));

        await initLiteGraph(this);
        await refreshBehaviorList(this);
    },

    beforeClose() {},
    close() {},
});
