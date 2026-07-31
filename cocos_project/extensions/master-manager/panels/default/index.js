'use strict';

// GameDatabase.ts loads these via CSVHelper.parse() - see assets/scripts/GameDatabase.ts /
// assets/scripts/CSVHelper.ts. Keep this list in sync if new CSV tables are added there.
const CSV_FILES = [
    { label: 'Enemies', file: 'Enemies.csv' },
    { label: 'Drops', file: 'Drops.csv' },
    { label: 'Behaviors', file: 'Behaviors.csv' },
    { label: 'EnemyBullets', file: 'EnemyBullets.csv' },
    { label: 'Sounds', file: 'Sounds.csv' },
];

// ID-reference schema: for a given CSV file, which columns are "foreign keys" into another
// (or the same) file's ID-like column. Rendered as a datalist-backed input (suggests known
// values, but still lets you type a genuinely new ID) instead of a bare text input, so
// existing IDs can be picked without risking a typo that silently breaks GameDatabase's
// cross-linking (behaviorId/ebId/dropId - see assets/scripts/GameDatabase.ts).
const SCHEMA = {
    'Enemies.csv': {
        BehaviorID: { file: 'Behaviors.csv', column: 'ID' },
        EbID: { file: 'EnemyBullets.csv', column: 'ID' },
        DropID: { file: 'Drops.csv', column: 'ID' },
    },
    'Drops.csv': {
        // Drops.csv has no separate item-master table, so this suggests from whatever
        // ItemID values already exist elsewhere in this same column.
        ItemID: { file: 'Drops.csv', column: 'ItemID' },
    },
};

// Panel-session state (persists while this panel instance stays open).
let currentFile = CSV_FILES[0].file;
let headers = [];
let rows = [];
let dirty = false;
let refOptions = {}; // { [columnName]: string[] } - suggestion lists for the current file

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
        setStatus(panel, `Loaded ${rows.length} rows from ${file}.`, false);
    } else {
        headers = [];
        rows = [];
        setStatus(panel, `Failed to load ${file}: ${result ? result.error : 'unknown error'}`, true);
    }
    await loadRefOptions(file);
    render(panel);
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
    render(panel);
}

function setStatus(panel, text, isError) {
    if (!panel.$.status) return;
    panel.$.status.textContent = text;
    panel.$.status.style.color = isError ? '#ff6b6b' : '#8fd68f';
}

function render(panel) {
    // Tab bar (one tab per CSV file)
    const tabBar = panel.$.tabBar;
    tabBar.innerHTML = '';
    CSV_FILES.forEach(({ label, file }) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (file === currentFile ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            if (dirty && !confirm(`${currentFile} has unsaved changes. Discard them?`)) return;
            loadFile(panel, file);
        });
        tabBar.appendChild(btn);
    });

    // Table
    const tableWrap = panel.$.tableWrap;
    tableWrap.innerHTML = '';

    if (headers.length === 0) {
        tableWrap.textContent = '(no data)';
        return;
    }

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h + (refOptions[h] ? ' 🔗' : '');
        if (refOptions[h]) th.title = `Suggests known values (${refOptions[h].length}) - you can still type a new one.`;
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
            render(panel);
        });
        delTd.appendChild(delBtn);
        tr.appendChild(delTd);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
}

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[MasterManager Panel] Show');
        },
        hide() {
            console.log('[MasterManager Panel] Hide');
        },
    },

    template: `
        <div class="panel-root">
            <div class="header">⚙️ Master Manager (GameDatabase CSV Editor)</div>
            <div class="tab-bar"></div>
            <div class="table-scroll">
                <div class="table-wrap"></div>
            </div>
            <div class="footer">
                <span class="status"></span>
                <div class="footer-buttons">
                    <button class="btn-add-row">➕ Add Row</button>
                    <button class="btn-save">💾 Save</button>
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
        }
        th, td {
            border: 1px solid #3d3d3d;
            padding: 2px 4px;
            text-align: left;
            white-space: nowrap;
        }
        th {
            background: #2a2a2a;
            position: sticky;
            top: 0;
        }
        td input {
            background: #2a2a2a;
            border: 1px solid #444;
            color: #fff;
            padding: 3px 5px;
            border-radius: 3px;
            width: 90px;
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
        .footer {
            flex-shrink: 0;
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .status {
            font-size: 12px;
            color: #8fd68f;
        }
        .footer-buttons {
            display: flex;
            gap: 8px;
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
    `,

    $: {
        tabBar: '.tab-bar',
        tableWrap: '.table-wrap',
        status: '.status',
        addRowBtn: '.btn-add-row',
        saveBtn: '.btn-save',
    },

    methods: {},

    ready() {
        console.log('[MasterManager Panel] Panel Ready!');

        this.$.addRowBtn.addEventListener('click', () => {
            if (headers.length === 0) return;
            rows.push(headers.map(() => ''));
            dirty = true;
            setStatus(this, 'Unsaved changes.', false);
            render(this);
        });

        this.$.saveBtn.addEventListener('click', () => {
            saveFile(this);
        });

        loadFile(this, currentFile);
    },

    beforeClose() {},
    close() {},
});
