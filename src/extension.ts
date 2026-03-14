
import * as vscode from 'vscode';
import * as path from 'path';
import { LiteDbCompletionProvider } from './completionProvider';
import { DotnetBridgeManager, BridgeResponse } from './dotnetBridgeManager';
import { renderCollectionGrid, QueryResult } from './gridRenderer';
import { getLiteDbIdExpr } from './queryHelpers';

import { LiteDbState } from './LiteDbState';


// Import moved classes
import { CollectionItem } from './CollectionItem';
import { LiteDbCollectionsProvider } from './LiteDbCollectionsProvider';
import { LiteDbResultViewProvider } from './LiteDbResultViewProvider';


let dotnetBridgeManager: DotnetBridgeManager | undefined;

export async function runBridge<T>(extensionPath: string, payload: unknown): Promise<BridgeResponse<T>> {
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

// ...existing code...


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
                filters: { 'LiteDB files': ['litedb'], 'All files': ['*'] }
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
                // Hide the loading message
                resultViewProvider.clearView();
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
            { enableScripts: true }
        );

        // Initial render
        panel.webview.html = renderCollectionGrid(collection.name, response.data);

        // Listen for refreshCollection message from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg && msg.command === 'refreshCollection' && msg.collection === collection.name) {
                // Re-run the query and update the grid
                const refreshResponse = await runBridge<QueryResult>(context.extensionPath, {
                    command: 'query',
                    dbPath: state.dbPath,
                    query: `SELECT * FROM ${collection.name}`
                });
                if (refreshResponse.success && refreshResponse.data) {
                    panel.webview.html = renderCollectionGrid(collection.name, refreshResponse.data);
                } else {
                    vscode.window.showErrorMessage(`Unable to refresh collection "${collection.name}": ${refreshResponse.error ?? 'Unknown error'}`);
                }
            } else if (msg && msg.command === 'updateCell' && msg.collection === collection.name) {
                // Build the UPDATE query
                const col = msg.column;
                const val = msg.value;
                const id = msg._id;
                // Use parameterized/escaped value for string
                const valueExpr = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
                // Always use ObjectId for _id in WHERE clause
                const idExpr = `ObjectId('${id}')`;
                const updateQuery = `UPDATE ${collection.name} SET ${col} = ${valueExpr} WHERE _id = ${idExpr}`;
                const updateResp = await runBridge<QueryResult>(context.extensionPath, {
                    command: 'query',
                    dbPath: state.dbPath,
                    query: updateQuery
                });
                if (!updateResp.success) {
                    vscode.window.showErrorMessage(`Update failed: ${updateResp.error ?? 'Unknown error'}`);
                } else {
                    // Optionally, refresh the grid after update
                    const refreshResponse = await runBridge<QueryResult>(context.extensionPath, {
                        command: 'query',
                        dbPath: state.dbPath,
                        query: `SELECT * FROM ${collection.name}`
                    });
                    if (refreshResponse.success && refreshResponse.data) {
                        panel.webview.html = renderCollectionGrid(collection.name, refreshResponse.data);
                    }
                }
            }
        });
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
