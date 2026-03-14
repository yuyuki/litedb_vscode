import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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

    private _templateHtml: string;

    constructor() {
        this._templateHtml = this.loadTemplateHtml();
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
        return this._templateHtml.replace(
            '<!--CONTENT_PLACEHOLDER-->',
            '<div class="empty-message">No query results yet. Execute a query to see results here.</div>'
        );
    }

    private getLoadingHtml(message: string): string {
        return this._templateHtml.replace(
            '<!--CONTENT_PLACEHOLDER-->',
            `<div class="loading-message"><span class="spinner"></span> ${message}</div>`
        );
    }

    private loadTemplateHtml(): string {
        // __dirname is not available in ES modules, so use path relative to this file
        const templatePath = path.join(__dirname, '../media/resultView.html');
        try {
            return fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            // fallback to a minimal HTML if file not found
            return '<html><body><!--CONTENT_PLACEHOLDER--></body></html>';
        }
    }
}
