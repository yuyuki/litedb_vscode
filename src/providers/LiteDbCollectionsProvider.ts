// Improved Collections Tree Provider

import * as vscode from 'vscode';
import { CollectionItem } from '../models/CollectionItem';
import { LiteDbState } from '../models/LiteDbState';
import { LiteDbService } from '../services/liteDbService';
import { EXTENSION_CONSTANTS } from '../constants';

export class LiteDbCollectionsProvider implements vscode.TreeDataProvider<CollectionItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CollectionItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private retryCount = new Map<string, number>();

    constructor(
        private readonly state: LiteDbState,
        private readonly liteDbService: LiteDbService
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: CollectionItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<CollectionItem[]> {
        if (!this.state.isOpen() || !this.state.dbPath) {
            return [new CollectionItem('No database opened')];
        }

        const dbPath = this.state.dbPath;
        const response = await this.liteDbService.getCollections(dbPath);

        if (!response.success || !response.data) {
            // Retry once with delay
            const currentRetries = this.retryCount.get(dbPath) ?? 0;
            if (currentRetries < EXTENSION_CONSTANTS.MAX_RETRY_COUNT) {
                this.retryCount.set(dbPath, currentRetries + 1);
                await this.delay(EXTENSION_CONSTANTS.RETRY_DELAY);
                
                const retryResponse = await this.liteDbService.getCollections(dbPath, false);
                if (retryResponse.success && retryResponse.data) {
                    this.retryCount.delete(dbPath);
                    return this.createCollectionItems(retryResponse.data);
                }
            }

            // Failed after retry
            this.retryCount.delete(dbPath);
            vscode.window.showErrorMessage(`Failed to load collections: ${response.error ?? 'Unknown error'}`);
            this.state.close();
            this.refresh();
            return [new CollectionItem('No database opened')];
        }

        this.retryCount.delete(dbPath);
        return this.createCollectionItems(response.data);
    }

    private createCollectionItems(collections: string[]): CollectionItem[] {
        return collections.map(name => new CollectionItem(name));
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
