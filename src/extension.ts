// Main extension entry point - Optimized and refactored

import * as vscode from 'vscode';
import * as path from 'path';
import { DotnetBridgeManager } from './services/dotnetBridgeManager';
import { LiteDbService } from './services/liteDbService';
import { LiteDbCompletionProvider } from './providers/completionProvider';
import { LiteDbCollectionsProvider } from './providers/LiteDbCollectionsProvider';
import { LiteDbResultViewProvider } from './providers/LiteDbResultViewProvider';
import { LiteDbState } from './models/LiteDbState';
import { CollectionItem } from './models/CollectionItem';
import { QueryResult } from './types';
import { COMMAND_IDS, VIEW_IDS, DEFAULT_QUERY_TEMPLATE } from './constants';
import { renderCollectionGrid } from './utils/gridRenderer';
import { getLiteDbIdExpression, escapeSqlString } from './utils/stringUtils';

let bridgeManager: DotnetBridgeManager | undefined;
let liteDbService: LiteDbService | undefined;

export function activate(context: vscode.ExtensionContext): void {
    // Initialize services
    bridgeManager = new DotnetBridgeManager(context.extensionPath);
    liteDbService = new LiteDbService(bridgeManager);

    // Initialize state and providers
    const state = new LiteDbState();
    const collectionsProvider = new LiteDbCollectionsProvider(state, liteDbService);
    const resultViewProvider = new LiteDbResultViewProvider(context.extensionPath);

    // Initialize completion provider
    const completionProvider = new LiteDbCompletionProvider(
        () => state.dbPath,
        async (dbPath: string) => {
            const response = await liteDbService!.getCollections(dbPath);
            return response.success && response.data ? response.data : [];
        },
        async (dbPath: string, collectionName: string) => {
            const response = await liteDbService!.getFields(dbPath, collectionName);
            return response.success && response.data ? response.data : [];
        }
    );

    // Register providers
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('litedb', completionProvider, ' '),
        vscode.window.registerTreeDataProvider(VIEW_IDS.EXPLORER, collectionsProvider),
        vscode.window.registerWebviewViewProvider(VIEW_IDS.RESULT_VIEW, resultViewProvider)
    );

    // Register commands
    registerCommands(context, state, collectionsProvider, resultViewProvider, completionProvider);
}

function registerCommands(
    context: vscode.ExtensionContext,
    state: LiteDbState,
    collectionsProvider: LiteDbCollectionsProvider,
    resultViewProvider: LiteDbResultViewProvider,
    completionProvider: LiteDbCompletionProvider
): void {
    // Open Database Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.OPEN_DATABASE, async () => {
            await openDatabase(context, state, collectionsProvider, completionProvider);
        })
    );

    // Close Database Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.CLOSE_DATABASE, () => {
            closeDatabase(state, collectionsProvider, completionProvider);
        })
    );

    // Refresh Collections Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.REFRESH_COLLECTIONS, () => {
            refreshCollections(state, collectionsProvider, completionProvider);
        })
    );

    // Run Query Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.RUN_QUERY, async () => {
            await runQuery(state, completionProvider);
        })
    );

    // Execute Script Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.EXECUTE_SCRIPT, async () => {
            await executeScript(context, state, collectionsProvider, resultViewProvider, completionProvider);
        })
    );

    // Open Collection Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.OPEN_COLLECTION, async (collection: CollectionItem) => {
            await openCollection(context, state, collection);
        })
    );

    // Help Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_IDS.HELP, async () => {
            await openHelp(context);
        })
    );
}

async function openDatabase(
    context: vscode.ExtensionContext,
    state: LiteDbState,
    collectionsProvider: LiteDbCollectionsProvider,
    completionProvider: LiteDbCompletionProvider
): Promise<void> {
    const pick = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        openLabel: 'Open LiteDB',
        filters: { 'LiteDB files': ['litedb', 'db'], 'All files': ['*'] }
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

        // Validate database by trying to get collections
        const validation = await liteDbService!.getCollections(dbPath, false);

        if (!validation.success) {
            vscode.window.showErrorMessage(
                `Failed to open LiteDB: ${validation.error ?? 'Unknown error'}`
            );
            return;
        }

        progress.report({ message: 'Loading collections...' });
        state.open(dbPath);
        collectionsProvider.refresh();
        await completionProvider.initialize();
        
        vscode.window.showInformationMessage(`Opened LiteDB: ${path.basename(dbPath)}`);
    });
}

import * as fs from 'fs';
function closeDatabase(
    state: LiteDbState,
    collectionsProvider: LiteDbCollectionsProvider,
    completionProvider: LiteDbCompletionProvider
): void {
    if (!state.isOpen()) {
        vscode.window.showInformationMessage('No LiteDB database is currently open.');
        return;
    }

    const dbPath = state.dbPath;
    state.close();

    // Invalidate cache for closed database
    if (dbPath) {
        liteDbService!.invalidateCache(dbPath);

        // Attempt to delete the log file (e.g., mydb-log.litedb or mydb-log.<ext>)
        try {
            const ext = dbPath.includes('.') ? dbPath.substring(dbPath.lastIndexOf('.')) : '';
            const logFile = dbPath.replace(/(\.[^\\/.]+)?$/, `-log${ext}`);
            if (fs.existsSync(logFile)) {
                fs.unlinkSync(logFile);
            }
        } catch (err) {
            // Optionally log error, but do not block close
            console.error('Failed to delete LiteDB log file:', err);
        }
    }

    collectionsProvider.refresh();
    completionProvider.refresh();
    vscode.window.showInformationMessage('LiteDB database closed.');
}

function refreshCollections(
    state: LiteDbState,
    collectionsProvider: LiteDbCollectionsProvider,
    completionProvider: LiteDbCompletionProvider
): void {
    if (state.dbPath) {
        liteDbService!.invalidateCache(state.dbPath);
    }
    collectionsProvider.refresh();
    completionProvider.refresh();
}

async function runQuery(
    state: LiteDbState,
    completionProvider: LiteDbCompletionProvider
): Promise<void> {
    if (!state.dbPath) {
        vscode.window.showWarningMessage('Open a LiteDB database first.');
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Opening query editor...'
    }, async () => {
        // Ensure completion provider is initialized
        await completionProvider.initialize();

        // Create new document with LiteDB language
        const doc = await vscode.workspace.openTextDocument({
            language: 'litedb',
            content: DEFAULT_QUERY_TEMPLATE
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    });
}

async function executeScript(
    context: vscode.ExtensionContext,
    state: LiteDbState,
    collectionsProvider: LiteDbCollectionsProvider,
    resultViewProvider: LiteDbResultViewProvider,
    completionProvider: LiteDbCompletionProvider
): Promise<void> {
    if (!state.dbPath) {
        vscode.window.showWarningMessage('Open a LiteDB database first.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
    }

    // Get script text (selection or full document)
    const script = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);

    if (!script.trim()) {
        vscode.window.showWarningMessage('Script is empty.');
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Running query...',
        cancellable: false
    }, async () => {
        resultViewProvider.showLoading('Query in progress...');

        const response = await liteDbService!.executeQuery(state.dbPath!, script);

        if (!response.success || !response.data) {
            resultViewProvider.clearView();
            vscode.window.showErrorMessage(
                `Query failed: ${response.error ?? 'Unknown error'}`
            );
            return;
        }

        resultViewProvider.showResult('Query Result', response.data);

        // Refresh collections if script modifies data
        if (isDataModifyingQuery(script)) {
            liteDbService!.invalidateCache(state.dbPath);
            collectionsProvider.refresh();
            await completionProvider.refresh();
        }
    });
}

async function openCollection(
    context: vscode.ExtensionContext,
    state: LiteDbState,
    collection: CollectionItem
): Promise<void> {
    if (!state.dbPath) {
        vscode.window.showWarningMessage('Open a LiteDB database first.');
        return;
    }

    if (!collection || !collection.name) {
        vscode.window.showWarningMessage('Unable to open the selected collection.');
        return;
    }

    const query = `SELECT * FROM ${collection.name}`;
    const response = await liteDbService!.executeQuery(state.dbPath, query);

    if (!response.success || !response.data) {
        vscode.window.showErrorMessage(
            `Unable to open collection "${collection.name}": ${response.error ?? 'Unknown error'}`
        );
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'litedbCollectionResult',
        `LiteDB: ${collection.name}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = renderCollectionGrid(collection.name, response.data);

    // Handle webview messages
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'refreshCollection' && msg.collection === collection.name) {
            await refreshCollectionView(state.dbPath!, collection.name, panel);
        } else if (msg.command === 'updateCell' && msg.collection === collection.name) {
            await updateCell(state.dbPath!, collection.name, msg, panel);
        }
    });
}

async function refreshCollectionView(
    dbPath: string,
    collectionName: string,
    panel: vscode.WebviewPanel
): Promise<void> {
    const response = await liteDbService!.executeQuery(
        dbPath,
        `SELECT * FROM ${collectionName}`
    );

    if (response.success && response.data) {
        panel.webview.html = renderCollectionGrid(collectionName, response.data);
    } else {
        vscode.window.showErrorMessage(
            `Unable to refresh collection "${collectionName}": ${response.error ?? 'Unknown error'}`
        );
    }
}

async function updateCell(
    dbPath: string,
    collectionName: string,
    msg: any,
    panel: vscode.WebviewPanel
): Promise<void> {
    const { column, value, _id } = msg;
    
    // Build UPDATE query with proper escaping
    const valueExpr = typeof value === 'string' 
        ? `'${escapeSqlString(value)}'` 
        : value;

    const idExpr = getLiteDbIdExpression(_id);
    const updateQuery = `UPDATE ${collectionName} SET ${column} = ${valueExpr} WHERE _id = ${idExpr}`;

    const updateResp = await liteDbService!.executeQuery(dbPath, updateQuery);

    if (!updateResp.success) {
        vscode.window.showErrorMessage(
            `Update failed: ${updateResp.error ?? 'Unknown error'}`
        );
        return;
    }

    // Refresh the view after successful update
    await refreshCollectionView(dbPath, collectionName, panel);
}

async function openHelp(context: vscode.ExtensionContext): Promise<void> {
    const helpFile = vscode.Uri.file(path.join(context.extensionPath, 'HELP.md'));
    try {
        const doc = await vscode.workspace.openTextDocument(helpFile);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (err) {
        vscode.window.showErrorMessage(
            `Could not open help file: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

function isDataModifyingQuery(script: string): boolean {
    return /\b(INSERT|UPDATE|DELETE|DROP|CREATE)\b/i.test(script);
}

export function deactivate(): void {
    if (liteDbService) {
        liteDbService.dispose();
        liteDbService = undefined;
    }

    if (bridgeManager) {
        bridgeManager.dispose();
        bridgeManager = undefined;
    }
}
