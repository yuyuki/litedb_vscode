import * as vscode from 'vscode';
import * as path from 'path';
import { LiteDbCompletionProvider } from './completionProvider';
import { DotnetBridgeManager, BridgeResponse } from './dotnetBridgeManager';


type QueryResult = {
    columns: string[];
    rows: Array<Record<string, unknown>>;
};

class LiteDbState {
    private _dbPath: string | undefined;
    private _childProcesses: Set<import('child_process').ChildProcess> = new Set();

    public get dbPath(): string | undefined {
        return this._dbPath;
    }


    public open(dbPath: string): void {
        this._dbPath = dbPath;
    }

    public addChildProcess(child: import('child_process').ChildProcess) {
        this._childProcesses.add(child);
        child.on('exit', () => this._childProcesses.delete(child));
        child.on('close', () => this._childProcesses.delete(child));
    }

    public close(): void {
        this._dbPath = undefined;
        this.cleanupChildProcesses();
    }

    public cleanupChildProcesses(): void {
        for (const child of this._childProcesses) {
            if (!child.killed) {
                try { child.kill(); } catch {}
            }
        }
        this._childProcesses.clear();
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
    private retryCount: Map<string, number> = new Map();

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

        const dbPath = this.state.dbPath;
        const response = await runBridge<string[]>(this.extensionPath, {
            command: 'collections',
            dbPath: dbPath
        });

        if (!response.success || !response.data) {
            const currentRetries = this.retryCount.get(dbPath) ?? 0;
            
            // First error: retry silently
            if (currentRetries === 0) {
                this.retryCount.set(dbPath, 1);
                
                // Wait a brief moment before retrying
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Retry once
                const retryResponse = await runBridge<string[]>(this.extensionPath, {
                    command: 'collections',
                    dbPath: dbPath
                });
                
                if (retryResponse.success && retryResponse.data) {
                    // Retry succeeded, reset counter
                    this.retryCount.delete(dbPath);
                    return retryResponse.data.map((name) => new CollectionItem(name));
                }
            }
            
            // Second error or retry failed: show error and reinitialize
            this.retryCount.delete(dbPath);
            vscode.window.showErrorMessage(`LiteDB collections error: ${response.error ?? 'Unknown error'}`);
            
            // Close the database and refresh to show "No database opened"
            this.state.close();
            this.refresh();
            
            return [
                new CollectionItem('No database opened')
            ];
        }

        // Success: reset retry counter for this database
        this.retryCount.delete(dbPath);
        return response.data.map((name) => new CollectionItem(name));
    }
}

class LiteDbResultViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentHtml: string = '';

    constructor() {
        this._currentHtml = this.getEmptyHtml();
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this._currentHtml;
    }

    showResult(title: string, result: QueryResult): void {
        this._currentHtml = renderCollectionGrid(title, result);
        if (this._view) {
            this._view.webview.html = this._currentHtml;
            this._view.show?.(true);
        }
    }

    showLoading(message: string = 'Query in progress...'): void {
        this._currentHtml = this.getLoadingHtml(message);
        if (this._view) {
            this._view.webview.html = this._currentHtml;
            this._view.show?.(true);
        }
    }

    private getEmptyHtml(): string {
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
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
}
.empty-message {
    color: var(--vscode-descriptionForeground);
}
</style>
</head>
<body>
<div class="empty-message">No query results yet. Execute a query to see results here.</div>
</body>
</html>`;
    }

    private getLoadingHtml(message: string): string {
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
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
}
.loading-message {
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.1em;
}
.spinner {
    border: 4px solid var(--vscode-panel-border);
    border-top: 4px solid var(--vscode-editor-foreground);
    border-radius: 50%;
    width: 22px;
    height: 22px;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>
</head>
<body>
<div class="loading-message"><span class="spinner"></span> ${message}</div>
</body>
</html>`;
    }
}


let dotnetBridgeManager: DotnetBridgeManager | undefined;

async function runBridge<T>(extensionPath: string, payload: unknown): Promise<BridgeResponse<T>> {
    if (!dotnetBridgeManager) {
        dotnetBridgeManager = new DotnetBridgeManager(extensionPath);
    }
    try {
        return await dotnetBridgeManager.send<T>(payload);
    } catch (e) {
        return { success: false, error: String(e) };
    }
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
    dotnetBridgeManager = new DotnetBridgeManager(context.extensionPath);

    const state = new LiteDbState();
    const provider = new LiteDbCollectionsProvider(state, context.extensionPath);
    const resultViewProvider = new LiteDbResultViewProvider();

    // Register smart LiteDB IntelliSense
    const completionProvider = new LiteDbCompletionProvider(
        () => state.dbPath,
        async (dbPath: string) => {
            const response = await runBridge<string[]>(context.extensionPath, {
                command: 'collections',
                dbPath: dbPath
            });
            return response.success && response.data ? response.data : [];
        },
        async (dbPath: string, collectionName: string) => {
            const response = await runBridge<string[]>(context.extensionPath, {
                command: 'fields',
                dbPath: dbPath,
                query: collectionName
            });
            return response.success && response.data ? response.data : [];
        }
    );

    // Pre-load completion collections cache on extension activation
    completionProvider.refreshCollections();

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('litedb', completionProvider, ' ')
    );

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('litedbExplorer', provider)
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('litedbResultView', resultViewProvider)
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

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Opening LiteDB database...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Validating database...' });
            const validation = await runBridge<string[]>(context.extensionPath, {
                command: 'collections',
                dbPath
            });

            if (!validation.success) {
                vscode.window.showErrorMessage(`Failed to open LiteDB: ${validation.error ?? 'Unknown error'}`);
                return;
            }

            // Only open and show info if validation succeeded
            state.open(dbPath);
            provider.refresh();
            await completionProvider.refreshCollections();
            vscode.window.showInformationMessage(`Opened LiteDB: ${dbPath}`);
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.closeDatabase', () => {
        if (!state.isOpen()) {
            vscode.window.showInformationMessage('No LiteDB database is currently open.');
            return;
        }

        state.close();
        provider.refresh();
        completionProvider.refreshCollections();
        vscode.window.showInformationMessage('LiteDB database closed.');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.refreshCollections', () => {
        provider.refresh();
        completionProvider.refreshCollections();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('litedb.runQuery', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Opening query editor...',
        }, async () => {
            if (!state.dbPath) {
                vscode.window.showWarningMessage('Open a LiteDB database first.');
                return;
            }

            // Refresh collections cache before opening the query editor
            await completionProvider.refreshCollections();

            // Create a new untitled document with LiteDB language
            const doc = await vscode.workspace.openTextDocument({
                language: 'litedb',
                content: '-- Enter your LiteDB SQL query here\n\n'
            });

            await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        });
    }));

    // Command to execute the current script and show results in a Webview Panel
    context.subscriptions.push(vscode.commands.registerCommand('litedb.executeScript', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running query...',
            cancellable: false
        }, async (progress) => {
            if (!state.dbPath) {
                vscode.window.showWarningMessage('Open a LiteDB database first.');
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor.');
                return;
            }
            let script = '';
            if (editor.selection && !editor.selection.isEmpty) {
                script = editor.document.getText(editor.selection);
            } else {
                script = editor.document.getText();
            }
            if (!script.trim()) {
                vscode.window.showWarningMessage('Script is empty.');
                return;
            }
            // Show loading/progress in result view
            resultViewProvider.showLoading('Query in progress...');
            const response = await runBridge<QueryResult>(context.extensionPath, {
                command: 'query',
                dbPath: state.dbPath,
                query: script
            });
            if (!response.success || !response.data) {
                vscode.window.showErrorMessage(`Query failed: ${response.error ?? 'Unknown error'}`);
                // Optionally, keep the loading or show empty state
                return;
            }
            resultViewProvider.showResult('Query Result', response.data);
            // Only refresh collections if the script contains INSERT or DELETE
            if (/\b(INSERT|DELETE)\b/i.test(script)) {
                provider.refresh();
                await completionProvider.refreshCollections();
            }
        });
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

    // Register Help command to open HELP.md as markdown
    context.subscriptions.push(vscode.commands.registerCommand('litedb.help', async () => {
        const helpFile = vscode.Uri.file(path.join(context.extensionPath, 'HELP.md'));
        try {
            const doc = await vscode.workspace.openTextDocument(helpFile);
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (err) {
            vscode.window.showErrorMessage('Could not open help file: ' + (err instanceof Error ? err.message : String(err)));
        }
    }));
}


export function deactivate(): void {
    if (dotnetBridgeManager) {
        dotnetBridgeManager.dispose();
        dotnetBridgeManager = undefined;
    }
    if ((globalThis as any).litedbState && typeof (globalThis as any).litedbState.close === 'function') {
        (globalThis as any).litedbState.close();
    }
}
