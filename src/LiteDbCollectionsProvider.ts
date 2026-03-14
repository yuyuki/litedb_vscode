import * as vscode from 'vscode';
import { CollectionItem } from './CollectionItem';
import { LiteDbState } from './LiteDbState';
import { runBridge } from './extension';

export class LiteDbCollectionsProvider implements vscode.TreeDataProvider<CollectionItem> {
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
            if (currentRetries === 0) {
                this.retryCount.set(dbPath, 1);
                await new Promise(resolve => setTimeout(resolve, 100));
                const retryResponse = await runBridge<string[]>(this.extensionPath, {
                    command: 'collections',
                    dbPath: dbPath
                });
                if (retryResponse.success && retryResponse.data) {
                    this.retryCount.delete(dbPath);
                    return retryResponse.data.map((name: string) => new CollectionItem(name));
                }
            }
            this.retryCount.delete(dbPath);
            vscode.window.showErrorMessage(`LiteDB collections error: ${response.error ?? 'Unknown error'}`);
            this.state.close();
            this.refresh();
            return [
                new CollectionItem('No database opened')
            ];
        }
        this.retryCount.delete(dbPath);
        return response.data.map((name: string) => new CollectionItem(name));
    }
}
