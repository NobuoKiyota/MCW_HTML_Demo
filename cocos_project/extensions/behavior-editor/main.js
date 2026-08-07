'use strict';

const fs = require('fs');
const path = require('path');

// このextensionはBehaviorGraph(移動)とShotGraph(発射)の2種類のグラフデータをまとめて扱う
// バックエンド(IPCハンドラ+LiteGraph.jsのlibファイル提供)専業になっている。UIは
// extensions/master-manager/panels/default/index.js の「Behavior Graph」「Shot Pattern」
// タブから、それぞれこのextensionのメッセージを呼び出す形。

function getBehaviorsCsvPath() {
    return path.join(Editor.Project.path, 'assets', 'Excels', 'Behaviors.csv');
}

function getShotsCsvPath() {
    return path.join(Editor.Project.path, 'assets', 'Excels', 'ShotPatterns.csv');
}

function getGraphJsonPath(id) {
    // Graphs always live under assets/resources/Data/Behaviors/<id>.json.
    // We derive the path from `id` only (never from a caller-supplied path string) so this
    // can't be used to write outside that folder.
    const safeId = path.basename(String(id));
    return path.join(Editor.Project.path, 'assets', 'resources', 'Data', 'Behaviors', `${safeId}.json`);
}

function getShotGraphJsonPath(id) {
    const safeId = path.basename(String(id));
    return path.join(Editor.Project.path, 'assets', 'resources', 'Data', 'ShotPatterns', `${safeId}.json`);
}

function graphResourcePath(id) {
    return `Data/Behaviors/${path.basename(String(id))}`;
}

function shotGraphResourcePath(id) {
    return `Data/ShotPatterns/${path.basename(String(id))}`;
}

// Same simple, uncommented, no-quoted-commas CSV format as master-manager/main.js -
// Behaviors.csv/ShotPatterns.csv are written by that same convention.
function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        const cells = line.split(',').map(c => c.trim());
        while (cells.length < headers.length) cells.push('');
        return cells.slice(0, headers.length);
    });
    return { headers, rows };
}

function serializeCSV(headers, rows) {
    const lines = [headers.join(',')];
    rows.forEach(r => lines.push(r.join(',')));
    return lines.join('\n') + '\n';
}

function readCsv(csvPath) {
    const text = fs.readFileSync(csvPath, 'utf-8');
    return parseCSV(text);
}

function writeCsv(csvPath, assetDbUrl, headers, rows) {
    fs.writeFileSync(csvPath, serializeCSV(headers, rows), 'utf-8');
    Editor.Message.request('asset-db', 'refresh-asset', assetDbUrl).catch((err) => {
        console.warn(`[BehaviorEditor Extension] asset-db refresh-asset (${assetDbUrl}) failed:`, err);
    });
}

function getBulletPrefabsDir() {
    return path.join(Editor.Project.path, 'assets', 'resources', 'Prefabs', 'Bullets');
}

function getLibFilePath(name) {
    // panels/default/lib/ 配下のみ許可 (パストラバーサル対策で basename のみ使う)
    const safeName = path.basename(String(name));
    return path.join(__dirname, 'panels', 'default', 'lib', safeName);
}

function defaultGraph(id) {
    return {
        id,
        nodes: [
            { id: 1, type: 'Start', next: 6 },
            { id: 6, type: 'Spin', params: { axis: 'y', degrees: 360, duration: 0.6 }, next: 2 },
            { id: 2, type: 'Move', params: { pattern: 'straight', angle: 270, speed: 2.0, turn: 2.0 }, next: null },
        ],
        _editor: {
            nodePositions: { '1': [40, 80], '6': [200, 80], '2': [360, 80] },
        },
    };
}

function defaultShotGraph(id) {
    return {
        id,
        nodes: [
            { id: 1, type: 'Start', next: 2 },
            { id: 2, type: 'Fire', params: { aim: 'fixed', angle: 270, speed: 5.0, damage: 10, pierceCount: 0 }, next: 3 },
            { id: 3, type: 'Wait', params: { seconds: 1.0 }, next: 4 },
            { id: 4, type: 'Loop', params: { target: 1, count: -1 } }, // Startへ戻す(Fireへ直接戻すとStartの配線と入力ソケットを取り合って壊れるため)
        ],
        _editor: {
            nodePositions: { '1': [40, 80], '2': [220, 80], '3': [400, 80], '4': [580, 80] },
        },
    };
}

// --- Behavior/Shot共通のCRUDロジック。csvPath/graphJsonPath/graphResourcePath/defaultGraphFnを
// 束ねた設定(config)を渡すだけで、New/Load/Save/Duplicate/Rename/Deleteの5操作を共通化する。

function listEntries(config) {
    try {
        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        const pathIdx = headers.indexOf('GraphPath');
        const noteIdx = headers.indexOf('Note');
        const list = rows.map(r => ({
            id: idIdx >= 0 ? r[idIdx] : '',
            graphPath: pathIdx >= 0 ? r[pathIdx] : '',
            note: noteIdx >= 0 ? r[noteIdx] : '',
        })).filter(e => e.id);
        return { ok: true, list };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] list (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function loadEntry(config, id) {
    try {
        const filePath = config.graphJsonPath(id);
        if (!fs.existsSync(filePath)) {
            return { ok: true, isNew: true, graph: config.defaultGraphFn(id) };
        }
        const text = fs.readFileSync(filePath, 'utf-8');
        return { ok: true, isNew: false, graph: JSON.parse(text) };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] load (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function saveEntry(config, id, graph, note) {
    try {
        const filePath = config.graphJsonPath(id);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(graph, null, 4), 'utf-8');

        const url = `db://assets/resources/${config.graphResourcePath(id)}.json`;
        Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
            console.warn(`[BehaviorEditor Extension] asset-db refresh-asset (${config.label} json) failed:`, err);
        });

        // 対応するCSV行が無ければ追加し、あればNoteを更新する
        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        const pathIdx = headers.indexOf('GraphPath');
        const noteIdx = headers.indexOf('Note');
        const rowIdx = rows.findIndex(r => r[idIdx] === id);
        if (rowIdx === -1) {
            const row = headers.map(() => '');
            row[idIdx] = id;
            if (pathIdx >= 0) row[pathIdx] = config.graphResourcePath(id);
            if (noteIdx >= 0) row[noteIdx] = note || '';
            rows.push(row);
            writeCsv(config.csvPath(), config.csvAssetUrl, headers, rows);
        } else if (noteIdx >= 0 && note != null && rows[rowIdx][noteIdx] !== note) {
            rows[rowIdx][noteIdx] = note;
            writeCsv(config.csvPath(), config.csvAssetUrl, headers, rows);
        }

        return { ok: true };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] save (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function createEntry(config, id, note) {
    try {
        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        if (rows.some(r => r[idIdx] === id)) {
            return { ok: false, error: `ID '${id}' already exists.` };
        }

        const pathIdx = headers.indexOf('GraphPath');
        const noteIdx = headers.indexOf('Note');
        const row = headers.map(() => '');
        row[idIdx] = id;
        if (pathIdx >= 0) row[pathIdx] = config.graphResourcePath(id);
        if (noteIdx >= 0) row[noteIdx] = note || '';
        rows.push(row);
        writeCsv(config.csvPath(), config.csvAssetUrl, headers, rows);

        const filePath = config.graphJsonPath(id);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(config.defaultGraphFn(id), null, 4), 'utf-8');

        const url = `db://assets/resources/${config.graphResourcePath(id)}.json`;
        Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

        return { ok: true };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] create (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function duplicateEntry(config, sourceId, newId, note) {
    try {
        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        if (rows.some(r => r[idIdx] === newId)) {
            return { ok: false, error: `ID '${newId}' already exists.` };
        }

        const sourcePath = config.graphJsonPath(sourceId);
        const sourceGraph = fs.existsSync(sourcePath)
            ? JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
            : config.defaultGraphFn(sourceId);

        // idフィールドとノード座標(_editor)以外はそのまま複製する
        const newGraph = Object.assign({}, sourceGraph, { id: newId });

        const pathIdx = headers.indexOf('GraphPath');
        const noteIdx = headers.indexOf('Note');
        const row = headers.map(() => '');
        row[idIdx] = newId;
        if (pathIdx >= 0) row[pathIdx] = config.graphResourcePath(newId);
        if (noteIdx >= 0) row[noteIdx] = note || `Copied from ${sourceId}`;
        rows.push(row);
        writeCsv(config.csvPath(), config.csvAssetUrl, headers, rows);

        const newFilePath = config.graphJsonPath(newId);
        fs.mkdirSync(path.dirname(newFilePath), { recursive: true });
        fs.writeFileSync(newFilePath, JSON.stringify(newGraph, null, 4), 'utf-8');

        const url = `db://assets/resources/${config.graphResourcePath(newId)}.json`;
        Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

        return { ok: true };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] duplicate (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function renameEntry(config, oldId, newId) {
    try {
        if (!newId || newId === oldId) {
            return { ok: false, error: 'New ID is empty or unchanged.' };
        }

        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        const rowIdx = rows.findIndex(r => r[idIdx] === oldId);
        if (rowIdx === -1) {
            return { ok: false, error: `ID '${oldId}' not found.` };
        }
        if (rows.some(r => r[idIdx] === newId)) {
            return { ok: false, error: `ID '${newId}' already exists.` };
        }

        const oldPath = config.graphJsonPath(oldId);
        const graph = fs.existsSync(oldPath)
            ? JSON.parse(fs.readFileSync(oldPath, 'utf-8'))
            : config.defaultGraphFn(oldId);
        graph.id = newId;

        const newPath = config.graphJsonPath(newId);
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        fs.writeFileSync(newPath, JSON.stringify(graph, null, 4), 'utf-8');

        const pathIdx = headers.indexOf('GraphPath');
        rows[rowIdx][idIdx] = newId;
        if (pathIdx >= 0) rows[rowIdx][pathIdx] = config.graphResourcePath(newId);
        writeCsv(config.csvPath(), config.csvAssetUrl, headers, rows);

        const url = `db://assets/resources/${config.graphResourcePath(newId)}.json`;
        Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

        return { ok: true };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] rename (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

function deleteEntry(config, id) {
    try {
        const { headers, rows } = readCsv(config.csvPath());
        const idIdx = headers.indexOf('ID');
        const filtered = rows.filter(r => r[idIdx] !== id);
        if (filtered.length === rows.length) {
            return { ok: false, error: `ID '${id}' not found.` };
        }
        writeCsv(config.csvPath(), config.csvAssetUrl, headers, filtered);
        return { ok: true };
    } catch (err) {
        console.error(`[BehaviorEditor Extension] delete (${config.label}) failed:`, err);
        return { ok: false, error: err.message };
    }
}

const BEHAVIOR_CONFIG = {
    label: 'Behavior',
    csvPath: getBehaviorsCsvPath,
    csvAssetUrl: 'db://assets/Excels/Behaviors.csv',
    graphJsonPath: getGraphJsonPath,
    graphResourcePath: graphResourcePath,
    defaultGraphFn: defaultGraph,
};

const SHOT_CONFIG = {
    label: 'ShotPattern',
    csvPath: getShotsCsvPath,
    csvAssetUrl: 'db://assets/Excels/ShotPatterns.csv',
    graphJsonPath: getShotGraphJsonPath,
    graphResourcePath: shotGraphResourcePath,
    defaultGraphFn: defaultShotGraph,
};

module.exports = {
    load() {
        console.log('[BehaviorEditor Extension] Extension loaded.');
    },

    unload() {
        console.log('[BehaviorEditor Extension] Extension unloaded.');
    },

    methods: {
        // --- Behavior Graph (移動) ---
        listBehaviors() { return listEntries(BEHAVIOR_CONFIG); },
        loadGraph(id) { return loadEntry(BEHAVIOR_CONFIG, id); },
        saveGraph(id, graph, note) { return saveEntry(BEHAVIOR_CONFIG, id, graph, note); },
        createBehavior(id, note) { return createEntry(BEHAVIOR_CONFIG, id, note); },
        duplicateBehavior(sourceId, newId, note) { return duplicateEntry(BEHAVIOR_CONFIG, sourceId, newId, note); },
        renameBehavior(oldId, newId) { return renameEntry(BEHAVIOR_CONFIG, oldId, newId); },
        deleteBehavior(id) { return deleteEntry(BEHAVIOR_CONFIG, id); },

        // --- Shot Pattern (発射) ---
        listShots() { return listEntries(SHOT_CONFIG); },
        loadShotGraph(id) { return loadEntry(SHOT_CONFIG, id); },
        saveShotGraph(id, graph, note) { return saveEntry(SHOT_CONFIG, id, graph, note); },
        createShot(id, note) { return createEntry(SHOT_CONFIG, id, note); },
        duplicateShot(sourceId, newId, note) { return duplicateEntry(SHOT_CONFIG, sourceId, newId, note); },
        renameShot(oldId, newId) { return renameEntry(SHOT_CONFIG, oldId, newId); },
        deleteShot(id) { return deleteEntry(SHOT_CONFIG, id); },

        // Editor.Message.request('behavior-editor', 'load-lib-file', name)
        // panel側は<script src="...">での相対URL読み込みが環境によって解決できないことがあるため、
        // main.js(Node統合プロセス)でテキストとして読み、panel側でインライン実行する。
        loadLibFile(name) {
            try {
                const filePath = getLibFilePath(name);
                const text = fs.readFileSync(filePath, 'utf-8');
                return { ok: true, text };
            } catch (err) {
                console.error(`[BehaviorEditor Extension] loadLibFile('${name}') failed:`, err);
                return { ok: false, error: err.message };
            }
        },
        // Editor.Message.request('behavior-editor', 'list-bullet-prefabs')
        // assets/resources/Prefabs/Bullets/ 配下の.prefabファイル名一覧を返す(拡張子なし)。
        // Shot Pattern エディタのFire/MultiFire/Missileノードの prefabName ドロップダウン用。
        // フォルダが無ければ空リスト(まだ1つもBullet Prefabを作っていない状態として許容)。
        listBulletPrefabs() {
            try {
                const dir = getBulletPrefabsDir();
                if (!fs.existsSync(dir)) return { ok: true, list: [] };
                const list = fs.readdirSync(dir)
                    .filter((f) => f.endsWith('.prefab'))
                    .map((f) => f.slice(0, -'.prefab'.length));
                return { ok: true, list };
            } catch (err) {
                console.error('[BehaviorEditor Extension] listBulletPrefabs failed:', err);
                return { ok: false, error: err.message };
            }
        },
    },
};
