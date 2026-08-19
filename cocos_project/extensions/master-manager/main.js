'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

function getCsvPath(file) {
    // Guard against path traversal since `file` ultimately comes from panel-side UI state.
    // Moved from assets/Excels to assets/resources/Excels so GameDatabase.ts's
    // resources.load("Excels/X", ...) fallback (used whenever a CSV's Inspector TextAsset
    // property isn't assigned) can actually resolve it - Cocos's resources.load() only
    // finds assets that live under a folder literally named "resources".
    const base = path.basename(file);
    return path.join(Editor.Project.path, 'assets', 'resources', 'Excels', base);
}

// Intentionally simple: only round-trips the plain, comma-delimited, no-quoted-commas CSVs
// actually used in assets/resources/Excels (verified against their current content).
// CSVHelper.ts on the runtime side is more permissive (multi-delimiter, quoted fields,
// comments) to tolerate hand-edited files, but we control both the read and the write here
// so we don't need that.
function parseCSV(text) {
    // Sounds.csv uses "# ..." section-marker comment lines (see CSVHelper.ts's matching
    // skip logic on the runtime side) - without this filter they'd get parsed as a bogus
    // 1-cell data row and mangled/dropped on the next save.
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

// GameManagerEditor tab (GameManager.ts's loadGameManagerConfig() reads this same file via
// resources.load("Data/GameManagerConfig", JsonAsset, ...) at runtime).
function getGameManagerConfigPath() {
    return path.join(Editor.Project.path, 'assets', 'resources', 'Data', 'GameManagerConfig.json');
}

// CloudManager tab (assets/resources/Data/CloudConfig.json). CloudManager.tsとは無関係な
// GameManager本体の値と混ぜたくないため、BulletConfig.json(behavior-editor拡張側)と同じ理由で
// GameManagerConfig.jsonとは別ファイルに分離している。ただしCloud設定はBehavior/Shotグラフとは
// 無関係なドメインなので、behavior-editorではなくこちら(master-manager)で扱う。
// CloudManager.ts自身がresources.load("Data/CloudConfig", JsonAsset, ...)でこのファイルを読む。
function getCloudConfigPath() {
    return path.join(Editor.Project.path, 'assets', 'resources', 'Data', 'CloudConfig.json');
}

// Enemies.csvのPrefabName列が参照する実プレハブ一覧。GameDatabase.ts/loadAllCSV()が
// resources.loadDir("Prefabs/Enemy", Prefab, ...)で読み込んだ全Prefabをrow.PrefabName(無ければ
// row.ID)と`p.data.name`で突き合わせているのが実際のマッチング処理 - 手打ちのPrefabNameが
// このフォルダの実ファイル名と1文字でもズレると静かにマッチせず終わる。ここで実ファイル名を
// 直接列挙して返し、パネル側でプルダウン化することでそのズレを防ぐ。
function getEnemyPrefabsDir() {
    return path.join(Editor.Project.path, 'assets', 'resources', 'Prefabs', 'Enemy');
}

module.exports = {
    load() {
        console.log('[MasterManager Extension] Extension loaded.');
    },

    unload() {
        console.log('[MasterManager Extension] Extension unloaded.');
    },

    methods: {
        openPanel() {
            console.log('[MasterManager Extension] Opening panel master-manager.default...');
            try {
                Editor.Panel.open('master-manager.default');
            } catch (err) {
                console.error('[MasterManager Extension] Error opening panel:', err);
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'load-csv', file).
        // Runs in the extension's Node-integrated process, unlike panel code, so fs/path are
        // reliably available here.
        loadCsv(file) {
            try {
                const text = fs.readFileSync(getCsvPath(file), 'utf-8');
                const parsed = parseCSV(text);
                return { ok: true, headers: parsed.headers, rows: parsed.rows };
            } catch (err) {
                console.error('[MasterManager Extension] loadCsv failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'save-csv', file, headers, rows).
        saveCsv(file, headers, rows) {
            try {
                const text = serializeCSV(headers, rows);
                fs.writeFileSync(getCsvPath(file), text, 'utf-8');

                // Nudge the Asset DB so GameDatabase's TextAsset picks up the on-disk change
                // without requiring a manual Assets-panel refresh or editor restart.
                const url = `db://assets/resources/Excels/${path.basename(file)}`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
                    console.warn('[MasterManager Extension] asset-db refresh-asset failed:', err);
                });

                return { ok: true };
            } catch (err) {
                console.error('[MasterManager Extension] saveCsv failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'reveal-csv', file).
        // Opens the OS file explorer with the CSV file selected/highlighted (Explorer on Windows).
        revealCsv(file) {
            const csvPath = getCsvPath(file);
            console.log(`[MasterManager Extension] revealCsv: resolved path = ${csvPath}`);
            if (!fs.existsSync(csvPath)) {
                // shell.showItemInFolder()はElectron/Windows環境によっては存在しないパスを渡しても
                // 例外を投げず単に無反応になることがある(catchで捕まらない)。ボタンを押しても
                // 何も起きないように見える不具合の主因はほぼこれなので、先に明示的にチェックして
                // 分かりやすいエラーを返す。
                const msg = `File not found: ${csvPath}`;
                console.error(`[MasterManager Extension] revealCsv: ${msg}`);
                return { ok: false, error: msg };
            }
            try {
                shell.showItemInFolder(csvPath);
                return { ok: true };
            } catch (err) {
                console.error('[MasterManager Extension] revealCsv: showItemInFolder threw, falling back to opening the containing folder.', err);
                // showItemInFolder()自体が使えない/失敗する環境向けのフォールバック。ファイルを選択
                // 状態にはできないが、フォルダを開くだけならopenPath()の方が信頼性が高い。
                shell.openPath(path.dirname(csvPath)).then((openErr) => {
                    if (openErr) console.error('[MasterManager Extension] revealCsv: openPath fallback also failed:', openErr);
                });
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'load-game-manager-config').
        loadGameManagerConfig() {
            try {
                const text = fs.readFileSync(getGameManagerConfigPath(), 'utf-8');
                return { ok: true, data: JSON.parse(text) };
            } catch (err) {
                console.error('[MasterManager Extension] loadGameManagerConfig failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'list-enemy-prefab-names').
        listEnemyPrefabNames() {
            try {
                const dir = getEnemyPrefabsDir();
                if (!fs.existsSync(dir)) return { ok: true, list: [] };
                const list = fs.readdirSync(dir)
                    .filter((f) => f.endsWith('.prefab'))
                    .map((f) => f.slice(0, -'.prefab'.length));
                return { ok: true, list };
            } catch (err) {
                console.error('[MasterManager Extension] listEnemyPrefabNames failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'load-cloud-config').
        loadCloudConfig() {
            try {
                const text = fs.readFileSync(getCloudConfigPath(), 'utf-8');
                return { ok: true, data: JSON.parse(text) };
            } catch (err) {
                console.error('[MasterManager Extension] loadCloudConfig failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'save-cloud-config', data).
        saveCloudConfig(data) {
            try {
                const text = JSON.stringify(data, null, 2) + '\n';
                fs.writeFileSync(getCloudConfigPath(), text, 'utf-8');

                const url = 'db://assets/resources/Data/CloudConfig.json';
                Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
                    console.warn('[MasterManager Extension] asset-db refresh-asset (CloudConfig) failed:', err);
                });

                return { ok: true };
            } catch (err) {
                console.error('[MasterManager Extension] saveCloudConfig failed:', err);
                return { ok: false, error: err.message };
            }
        },

        // Called by the panel via Editor.Message.request('master-manager', 'save-game-manager-config', data).
        saveGameManagerConfig(data) {
            try {
                const text = JSON.stringify(data, null, 2) + '\n';
                fs.writeFileSync(getGameManagerConfigPath(), text, 'utf-8');

                const url = 'db://assets/resources/Data/GameManagerConfig.json';
                Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
                    console.warn('[MasterManager Extension] asset-db refresh-asset failed:', err);
                });

                return { ok: true };
            } catch (err) {
                console.error('[MasterManager Extension] saveGameManagerConfig failed:', err);
                return { ok: false, error: err.message };
            }
        },
    },
};
