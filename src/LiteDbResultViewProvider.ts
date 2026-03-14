import * as vscode from 'vscode';
import { renderCollectionGrid, QueryResult } from './gridRenderer';

export class LiteDbResultViewProvider implements vscode.WebviewViewProvider {
    clearView(): void {
        this._currentHtml = this.getEmptyHtml();
        if (this._view) {
            this._view.webview.html = this._currentHtml;
        }
    }
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
