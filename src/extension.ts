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

function renderTable(query: string, result: QueryResult): string {
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
body { font-family: sans-serif; padding: 12px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
code { background: #f4f4f4; padding: 2px 4px; }
</style>
</head>
<body>
<h2>LiteDB Query Result</h2>
<p><strong>Query:</strong> <code>${escapeHtml(query)}</code></p>
<p><strong>Rows:</strong> ${result.rows.length}</p>
<table>
<thead><tr>${header}</tr></thead>
<tbody>${rows}</tbody>
</table>
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

        const query = await vscode.window.showInputBox({
            prompt: 'Enter a LiteDB SQL query (e.g. SELECT * FROM customers LIMIT 20)'
        });

        if (!query) {
            return;
        }

        const response = await runBridge<QueryResult>(context.extensionPath, {
            command: 'query',
            dbPath: state.dbPath,
            query
        });

        if (!response.success || !response.data) {
            vscode.window.showErrorMessage(`Query failed: ${response.error ?? 'Unknown error'}`);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'litedbQueryResult',
            'LiteDB Query Result',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = renderTable(query, response.data);
    }));
}

export function deactivate(): void {}
