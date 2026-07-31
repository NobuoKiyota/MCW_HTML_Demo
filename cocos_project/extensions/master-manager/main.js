'use strict';

const fs = require('fs');
const path = require('path');

function getCsvPath(file) {
    // Guard against path traversal since `file` ultimately comes from panel-side UI state.
    const base = path.basename(file);
    return path.join(Editor.Project.path, 'assets', 'Excels', base);
}

// Intentionally simple: only round-trips the plain, comma-delimited, no-quoted-commas CSVs
// actually used in assets/Excels (verified against their current content). CSVHelper.ts on
// the runtime side is more permissive (multi-delimiter, quoted fields, comments) to tolerate
// hand-edited files, but we control both the read and the write here so we don't need that.
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
                const url = `db://assets/Excels/${path.basename(file)}`;
                Editor.Message.request('asset-db', 'refresh-asset', url).catch((err) => {
                    console.warn('[MasterManager Extension] asset-db refresh-asset failed:', err);
                });

                return { ok: true };
            } catch (err) {
                console.error('[MasterManager Extension] saveCsv failed:', err);
                return { ok: false, error: err.message };
            }
        },
    },
};
