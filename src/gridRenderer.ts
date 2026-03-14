// src/gridRenderer.ts

export type QueryResult = {
    columns: string[];
    rows: Array<Record<string, unknown>>;
};

export function renderCollectionGrid(collectionName: string, result: QueryResult): string {
    const escapeHtml = (value: unknown): string => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const header = result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
    const rows = result.rows.map((r, i) => {
        const rowNumber = i + 1;
        const cells = result.columns.map((c) => `<td>${escapeHtml(r[c])}</td>`).join('');
        return `<tr><td class="row-number">${rowNumber}</td>${cells}</tr>`;
    }).join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
<style>
body {
    margin: 0;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
}
.collection-name {
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
    padding: 12px 12px 0 12px;
    font-size: 1.1em;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
    display: flex;
    align-items: center;
    opacity: 0.7;
    transition: opacity 0.2s;
}
.refresh-btn:hover {
    opacity: 1;
}
    .codicon {
        font-size: 18px;
        color: var(--vscode-icon-foreground, var(--vscode-descriptionForeground));
        display: block;
    }
.grid {
    border: 1px solid var(--vscode-panel-border);
    overflow: auto;
    margin: 0 12px 12px 12px;
}
table {
    width: 100%;
    border-collapse: collapse;
}
th, td {
    border-right: 1px solid var(--vscode-panel-border);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 4px 8px;
    text-align: left;
    white-space: nowrap;
}
th {
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--vscode-editorGroupHeader-tabsBackground);
}
.row-number {
    width: 38px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
}
th.row-number {
    background: var(--vscode-sideBar-background);
}
.empty {
    color: var(--vscode-descriptionForeground);
    padding: 12px;
}
    </style>
</head>
<body>
    <div class="collection-name">
        <span>Collection: <strong>${escapeHtml(collectionName)}</strong></span>
        <button class="refresh-btn" id="refresh-collection-btn" title="Refresh">
            <span class="codicon codicon-refresh"></span>
        </button>
    </div>
    <div class="grid">
        <table>
            <thead>
                <tr><th class="row-number"></th>${header}</tr>
            </thead>
            <tbody>
                ${rows || `<tr><td class="empty" colspan="${Math.max(result.columns.length + 1, 2)}">No documents found.</td></tr>`}
            </tbody>
        </table>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('refresh-collection-btn')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshCollection', collection: ${JSON.stringify(collectionName)} });
        });
    </script>
</body>
</html>`;
}
