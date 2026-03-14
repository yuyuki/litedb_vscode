// Improved Result View Provider

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { QueryResult } from '../types';
import { renderCollectionGrid } from '../utils/gridRenderer';

export class LiteDbResultViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentHtml: string = '';
    private _templateHtml: string;

    constructor(private readonly extensionPath: string) {
        this._templateHtml = this.loadTemplateHtml();
        this._currentHtml = this.getEmptyHtml();
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, 'media'))]
        };
        webviewView.webview.html = this._currentHtml;
    }

    showResult(title: string, result: QueryResult): void {
        this._currentHtml = renderCollectionGrid(title, result);
        this.updateView();
        this._view?.show?.(true);
    }

    showLoading(message = 'Query in progress...'): void {
        this._currentHtml = this.getLoadingHtml(message);
        this.updateView();
        this._view?.show?.(true);
    }

    clearView(): void {
        this._currentHtml = this.getEmptyHtml();
        this.updateView();
    }

    private updateView(): void {
        if (this._view) {
            this._view.webview.html = this._currentHtml;
        }
    }

    private getEmptyHtml(): string {
        return this.replaceContent(
            '<div class="empty-message">No query results yet. Execute a query to see results here.</div>'
        );
    }

    private getLoadingHtml(message: string): string {
        return this.replaceContent(
            `<div class="loading-message"><span class="spinner"></span> ${message}</div>`
        );
    }

    private replaceContent(content: string): string {
        return this._templateHtml.replace('<!--CONTENT_PLACEHOLDER-->', content);
    }

    private loadTemplateHtml(): string {
        const templatePath = path.join(this.extensionPath, 'media', 'resultView.html');
        try {
            return fs.readFileSync(templatePath, 'utf8');
        } catch (error) {
            // Fallback to minimal HTML
            return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; }
        .empty-message, .loading-message { text-align: center; padding: 40px; }
    </style>
</head>
<body>
    <!--CONTENT_PLACEHOLDER-->
</body>
</html>`;
        }
    }
}
