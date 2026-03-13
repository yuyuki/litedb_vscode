import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

type BridgeResponse<T> = {
    success: boolean;
    error?: string;
    data?: T;
};

type QueryResult = {
    columns: string[];
    rows: Array<Record<string, unknown>>;
};

class LiteDbState {
    private _dbPath: string | undefined;

    public get dbPath(): string | undefined {
        return this._dbPath;
    }

    public open(dbPath: string): void {
        this._dbPath = dbPath;
    }

    public close(): void {
        this._dbPath = undefined;
    }

    public isOpen(): boolean {
        return !!this._dbPath;
    }
}

class CollectionItem extends vscode.TreeItem {
    constructor(public readonly name: string) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'litedbCollection';
        this.iconPath = new vscode.ThemeIcon('table');
        this.description = 'collection';
        this.command = {
            command: 'litedb.openCollection',
            title: 'Open Collection',
            arguments: [this]
        };
    }
}

class LiteDbCollectionsProvider implements vscode.TreeDataProvider<CollectionItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CollectionItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly state: LiteDbState, private readonly extensionPath: string) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CollectionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<CollectionItem[]> {
        if (!this.state.dbPath) {
            return [
                new CollectionItem('No database opened')
            ];
        }

        const response = await runBridge<string[]>(this.extensionPath, {
            command: 'collections',
            dbPath: this.state.dbPath
        });

        if (!response.success || !response.data) {
            vscode.window.showErrorMessage(`LiteDB collections error: ${response.error ?? 'Unknown error'}`);
            return [];
        }

        return response.data.map((name) => new CollectionItem(name));
    }
}

async function runBridge<T>(extensionPath: string, payload: unknown): Promise<BridgeResponse<T>> {
    const projectPath = path.join(extensionPath, 'backend', 'LiteDbBridge', 'LiteDbBridge.csproj');

    return new Promise((resolve) => {
        const child = spawn('dotnet', ['run', '--project', projectPath, '--', JSON.stringify(payload)], {
            cwd: extensionPath
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
            stdout += d.toString();
        });

        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });

        child.on('close', () => {
            if (stderr.trim().length > 0 && stdout.trim().length === 0) {
                resolve({ success: false, error: stderr.trim() });
                return;
            }

            try {
                const parsed = JSON.parse(stdout) as BridgeResponse<T>;
                resolve(parsed);
            } catch {
                resolve({ success: false, error: `Unable to parse bridge response. stderr=${stderr}` });
            }
        });
    });
}

function renderTable(title: string, subtitleLabel: string, subtitleValue: string, result: QueryResult): string {
    const escapeHtml = (value: unknown): string => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const header = result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
    const rows = result.rows.map((r) => {
        const cells = result.columns.map((c) => `<td>${escapeHtml(r[c])}</td>`).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
body {
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin: 0;
    padding: 16px;
}
h2 {
    margin: 0 0 8px;
    font-size: 1.4em;
}
.meta {
    margin: 0 0 12px;
}
code {
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 2px 6px;
}
.table-wrap {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    overflow: hidden;
}
table {
    border-collapse: collapse;
    width: 100%;
}
th, td {
    border-bottom: 1px solid var(--vscode-panel-border);
    padding: 8px;
    text-align: left;
    vertical-align: top;
}
th {
    position: sticky;
    top: 0;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    color: var(--vscode-editor-foreground);
    font-weight: 600;
}
tbody tr:hover {
    background: var(--vscode-list-hoverBackground);
}
.empty {
    padding: 12px;
    color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>
<h2>${escapeHtml(title)}</h2>
<p class="meta"><strong>${escapeHtml(subtitleLabel)}:</strong> <code>${escapeHtml(subtitleValue)}</code></p>
<p class="meta"><strong>Rows:</strong> ${result.rows.length}</p>
<div class="table-wrap">
<table>
<thead><tr>${header}</tr></thead>
<tbody>${rows || `<tr><td class="empty" colspan="${Math.max(result.columns.length, 1)}">No rows returned.</td></tr>`}</tbody>
</table>
</div>
</body>
</html>`;
}

function renderCollectionGrid(collectionName: string, result: QueryResult): string {
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
<style>
body {
    margin: 0;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
}
.tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorGroupHeader-tabsBackground);
}
.tab {
    padding: 6px 12px;
    border-right: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
}
.tab.active {
    color: var(--vscode-editor-foreground);
    background: var(--vscode-tab-activeBackground);
}
.content {
    padding: 12px;
}
.collection-name {
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
}
.grid {
    border: 1px solid var(--vscode-panel-border);
    overflow: auto;
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
<div class="tabs">
    <div class="tab active">Grid</div>
    <div class="tab">Text</div>
    <div class="tab">Parameters</div>
</div>
<div class="content">
    <div class="collection-name">Collection: <strong>${escapeHtml(collectionName)}</strong></div>
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
</div>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
    const state = new LiteDbState();
    const provider = new LiteDbCollectionsProvider(state, context.extensionPath);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('litedbExplorer', provider)
    );

    context.subscriptions.push(vscode.commands.registerCommand('litedb.openDatabase', async () => {
        const pick = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Open LiteDB',
            filters: { 'LiteDB files': ['db'], 'All files': ['*'] }
        });

        if (!pick || pick.length === 0) {
            return;
        }

        const dbPath = pick[0].fsPath;
        const validation = await runBridge<string[]>(context.extensionPath, {
            command: 'collections',
            dbPath
        });

        if (!validation.success) {
            vscode.window.showErrorMessage(`Failed to open LiteDB: ${validation.error ?? 'Unknown error'}`);
            return;
        }

        state.open(dbPath);
        provider.refresh();
        vscode.window.showInformationMessage(`Opened LiteDB: ${dbPath}`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.closeDatabase', () => {
        if (!state.isOpen()) {
            vscode.window.showInformationMessage('No LiteDB database is currently open.');
            return;
        }

        state.close();
        provider.refresh();
        vscode.window.showInformationMessage('LiteDB database closed.');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.refreshCollections', () => {
        provider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.runQuery', async () => {
        if (!state.dbPath) {
            vscode.window.showWarningMessage('Open a LiteDB database first.');
            return;
        }

        // Create a new untitled document with LiteDB language
        const doc = await vscode.workspace.openTextDocument({
            language: 'litedb',
            content: '-- Enter your LiteDB SQL query here\n-- Example: SELECT * FROM customers LIMIT 20\n\n'
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.openCollection', async (collection: CollectionItem) => {
        if (!state.dbPath) {
            vscode.window.showWarningMessage('Open a LiteDB database first.');
            return;
        }

        if (!collection || !collection.name) {
            vscode.window.showWarningMessage('Unable to open the selected collection.');
            return;
        }

        const query = `SELECT * FROM ${collection.name}`;
        const response = await runBridge<QueryResult>(context.extensionPath, {
            command: 'query',
            dbPath: state.dbPath,
            query
        });

        if (!response.success || !response.data) {
            vscode.window.showErrorMessage(`Unable to open collection \"${collection.name}\": ${response.error ?? 'Unknown error'}`);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'litedbCollectionResult',
            `LiteDB: ${collection.name}`,
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = renderCollectionGrid(collection.name, response.data);
    }));
}

export function deactivate(): void {}
