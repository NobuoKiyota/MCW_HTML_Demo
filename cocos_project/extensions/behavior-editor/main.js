'use strict';

const fs = require('fs');
const path = require('path');

function getBehaviorsCsvPath() {
    return path.join(Editor.Project.path, 'assets', 'Excels', 'Behaviors.csv');
}

function getGraphJsonPath(id) {
    // Graphs always live under assets/resources/Data/Behaviors/<id>.json.
    // We derive the path from `id` only (never from a caller-supplied path string) so this
    // can't be used to write outside that folder.
    const safeId = path.basename(String(id));
    return path.join(Editor.Project.path, 'assets', 'resources', 'Data', 'Behaviors', `${safeId}.json`);
}

function graphResourcePath(id) {
    return `Data/Behaviors/${path.basename(String(id))}`;
}

// Same simple, uncommented, no-quoted-commas CSV format as master-manager/main.js -
// Behaviors.csv is written by that same convention.
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

function readBehaviorsCsv() {
    const text = fs.readFileSync(getBehaviorsCsvPath(), 'utf-8');
    return parseCSV(text);
}

function writeBehaviorsCsv(headers, rows) {
    fs.writeFileSync(getBehaviorsCsvPath(), serializeCSV(headers, rows), 'utf-8');
    const url = 'db://assets/Excels/Behaviors.csv';
    Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
        console.warn('[BehaviorEditor Extension] asset-db refresh-asset (Behaviors.csv) failed:', err);
    });
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
            { id: 2, type: 'Move', params: { pattern: 'straight', angle: 270, speed: 2.0, turn: 2.0 }, next: 3 },
            { id: 3, type: 'Fire', params: {}, next: 5 },
            { id: 5, type: 'Punch', params: { axis: 'x', degrees: -30, outDuration: 0.05, inDuration: 0.12 }, next: 4 },
            { id: 4, type: 'Loop', params: { target: 3, count: -1 } },
        ],
        _editor: {
            nodePositions: { '1': [40, 80], '6': [200, 80], '2': [360, 80], '3': [520, 80], '5': [680, 80], '4': [840, 80] },
        },
    };
}

module.exports = {
    load() {
        console.log('[BehaviorEditor Extension] Extension loaded.');
    },

    unload() {
        console.log('[BehaviorEditor Extension] Extension unloaded.');
    },

    methods: {
        openPanel() {
            console.log('[BehaviorEditor Extension] Opening panel behavior-editor.default...');
            try {
                Editor.Panel.open('behavior-editor.default');
            } catch (err) {
                console.error('[BehaviorEditor Extension] Error opening panel:', err);
            }
        },

        // Editor.Message.request('behavior-editor', 'list-behaviors')
        listBehaviors() {
            try {
                const { headers, rows } = readBehaviorsCsv();
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
                console.error('[BehaviorEditor Extension] listBehaviors failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Editor.Message.request('behavior-editor', 'load-graph', id)
        loadGraph(id) {
            try {
                const filePath = getGraphJsonPath(id);
                if (!fs.existsSync(filePath)) {
                    return { ok: true, isNew: true, graph: defaultGraph(id) };
                }
                const text = fs.readFileSync(filePath, 'utf-8');
                return { ok: true, isNew: false, graph: JSON.parse(text) };
            } catch (err) {
                console.error('[BehaviorEditor Extension] loadGraph failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Editor.Message.request('behavior-editor', 'save-graph', id, graph)
        saveGraph(id, graph) {
            try {
                const filePath = getGraphJsonPath(id);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, JSON.stringify(graph, null, 4), 'utf-8');

                const url = `db://assets/resources/${graphResourcePath(id)}.json`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
                    console.warn('[BehaviorEditor Extension] asset-db refresh-asset (graph json) failed:', err);
                });

                // 対応するBehaviors.csv行が無ければ追加しておく(孤立したJSONにしない)
                const { headers, rows } = readBehaviorsCsv();
                const idIdx = headers.indexOf('ID');
                const exists = rows.some(r => r[idIdx] === id);
                if (!exists) {
                    const pathIdx = headers.indexOf('GraphPath');
                    const noteIdx = headers.indexOf('Note');
                    const row = headers.map(() => '');
                    row[idIdx] = id;
                    if (pathIdx >= 0) row[pathIdx] = graphResourcePath(id);
                    if (noteIdx >= 0) row[noteIdx] = '';
                    rows.push(row);
                    writeBehaviorsCsv(headers, rows);
                }

                return { ok: true };
            } catch (err) {
                console.error('[BehaviorEditor Extension] saveGraph failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Editor.Message.request('behavior-editor', 'create-behavior', id, note)
        createBehavior(id, note) {
            try {
                const { headers, rows } = readBehaviorsCsv();
                const idIdx = headers.indexOf('ID');
                if (rows.some(r => r[idIdx] === id)) {
                    return { ok: false, error: `Behavior ID '${id}' already exists.` };
                }

                const pathIdx = headers.indexOf('GraphPath');
                const noteIdx = headers.indexOf('Note');
                const row = headers.map(() => '');
                row[idIdx] = id;
                if (pathIdx >= 0) row[pathIdx] = graphResourcePath(id);
                if (noteIdx >= 0) row[noteIdx] = note || '';
                rows.push(row);
                writeBehaviorsCsv(headers, rows);

                const filePath = getGraphJsonPath(id);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, JSON.stringify(defaultGraph(id), null, 4), 'utf-8');

                const url = `db://assets/resources/${graphResourcePath(id)}.json`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

                return { ok: true };
            } catch (err) {
                console.error('[BehaviorEditor Extension] createBehavior failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Editor.Message.request('behavior-editor', 'duplicate-behavior', sourceId, newId, note)
        // 既存パターンのグラフJSONをそのまま新IDでコピーし、Behaviors.csvにも行を追加する。
        duplicateBehavior(sourceId, newId, note) {
            try {
                const { headers, rows } = readBehaviorsCsv();
                const idIdx = headers.indexOf('ID');
                if (rows.some(r => r[idIdx] === newId)) {
                    return { ok: false, error: `Behavior ID '${newId}' already exists.` };
                }

                const sourcePath = getGraphJsonPath(sourceId);
                const sourceGraph = fs.existsSync(sourcePath)
                    ? JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
                    : defaultGraph(sourceId);

                // idフィールドとノード座標(_editor)以外はそのまま複製する
                const newGraph = Object.assign({}, sourceGraph, { id: newId });

                const pathIdx = headers.indexOf('GraphPath');
                const noteIdx = headers.indexOf('Note');
                const row = headers.map(() => '');
                row[idIdx] = newId;
                if (pathIdx >= 0) row[pathIdx] = graphResourcePath(newId);
                if (noteIdx >= 0) row[noteIdx] = note || `Copied from ${sourceId}`;
                rows.push(row);
                writeBehaviorsCsv(headers, rows);

                const newFilePath = getGraphJsonPath(newId);
                fs.mkdirSync(path.dirname(newFilePath), { recursive: true });
                fs.writeFileSync(newFilePath, JSON.stringify(newGraph, null, 4), 'utf-8');

                const url = `db://assets/resources/${graphResourcePath(newId)}.json`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

                return { ok: true };
            } catch (err) {
                console.error('[BehaviorEditor Extension] duplicateBehavior failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Editor.Message.request('behavior-editor', 'rename-behavior', oldId, newId)
        // CSV行のID/GraphPathを書き換え、グラフJSONは新しいパスにコピーする(旧JSONファイルは
        // 誤操作からの復旧余地を残すため削除しない。delete-behaviorと同じ方針)。
        renameBehavior(oldId, newId) {
            try {
                if (!newId || newId === oldId) {
                    return { ok: false, error: 'New ID is empty or unchanged.' };
                }

                const { headers, rows } = readBehaviorsCsv();
                const idIdx = headers.indexOf('ID');
                const rowIdx = rows.findIndex(r => r[idIdx] === oldId);
                if (rowIdx === -1) {
                    return { ok: false, error: `Behavior ID '${oldId}' not found.` };
                }
                if (rows.some(r => r[idIdx] === newId)) {
                    return { ok: false, error: `Behavior ID '${newId}' already exists.` };
                }

                const oldPath = getGraphJsonPath(oldId);
                const graph = fs.existsSync(oldPath)
                    ? JSON.parse(fs.readFileSync(oldPath, 'utf-8'))
                    : defaultGraph(oldId);
                graph.id = newId;

                const newPath = getGraphJsonPath(newId);
                fs.mkdirSync(path.dirname(newPath), { recursive: true });
                fs.writeFileSync(newPath, JSON.stringify(graph, null, 4), 'utf-8');

                const pathIdx = headers.indexOf('GraphPath');
                rows[rowIdx][idIdx] = newId;
                if (pathIdx >= 0) rows[rowIdx][pathIdx] = graphResourcePath(newId);
                writeBehaviorsCsv(headers, rows);

                const url = `db://assets/resources/${graphResourcePath(newId)}.json`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch(() => {});

                return { ok: true };
            } catch (err) {
                console.error('[BehaviorEditor Extension] renameBehavior failed:', err);
                return { ok: false, error: err.message };
            }
        },

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

        // Editor.Message.request('behavior-editor', 'delete-behavior', id)
        // Behaviors.csvの行のみ削除する(JSON実体は誤操作からの復旧余地を残すため残置)。
        deleteBehavior(id) {
            try {
                const { headers, rows } = readBehaviorsCsv();
                const idIdx = headers.indexOf('ID');
                const filtered = rows.filter(r => r[idIdx] !== id);
                if (filtered.length === rows.length) {
                    return { ok: false, error: `Behavior ID '${id}' not found.` };
                }
                writeBehaviorsCsv(headers, filtered);
                return { ok: true };
            } catch (err) {
                console.error('[BehaviorEditor Extension] deleteBehavior failed:', err);
                return { ok: false, error: err.message };
            }
        },
    },
};
