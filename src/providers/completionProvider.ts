// Improved completion provider with better performance

import * as vscode from 'vscode';
import { LITEDB_KEYWORDS, LITEDB_FUNCTIONS } from '../constants';

export class LiteDbCompletionProvider implements vscode.CompletionItemProvider {
    private keywordItems: vscode.CompletionItem[] = [];
    private functionItems: vscode.CompletionItem[] = [];
    private collectionItems: vscode.CompletionItem[] = [];
    private fieldItemsMap = new Map<string, vscode.CompletionItem[]>();
    private collections: string[] = [];
    private fieldsMap = new Map<string, string[]>();
    private initialized = false;

    constructor(
        private readonly getDbPath: () => string | undefined,
        private readonly getCollections: (dbPath: string) => Promise<string[]>,
        private readonly getFields: (dbPath: string, collectionName: string) => Promise<string[]>
    ) {
        this.initializeStaticItems();
    }

    private initializeStaticItems(): void {
        // Initialize keywords
        this.keywordItems = LITEDB_KEYWORDS.map((kw, i) => {
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.sortText = String(i).padStart(3, '0');
            return item;
        });

        // Initialize functions
        this.functionItems = LITEDB_FUNCTIONS.map(fn => {
            const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
            item.insertText = new vscode.SnippetString(`${fn}($1)`);
            return item;
        });
    }

    public async initialize(): Promise<void> {
        const dbPath = this.getDbPath();
        if (!dbPath || this.initialized) {
            return;
        }

        try {
            // Load collections
            this.collections = await this.getCollections(dbPath);
            this.collectionItems = this.collections.map(name => {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Struct);
                item.detail = 'Collection';
                return item;
            });

            // Pre-load fields for all collections in parallel
            const fieldPromises = this.collections.map(async (col) => {
                try {
                    const fields = await this.getFields(dbPath, col);
                    this.fieldsMap.set(col, fields);
                    this.fieldItemsMap.set(col, fields.map(f => {
                        const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.Field);
                        item.detail = `Field of ${col}`;
                        return item;
                    }));
                } catch (error) {
                    // Silently ignore field loading errors for individual collections
                }
            });

            await Promise.allSettled(fieldPromises);
            this.initialized = true;
        } catch (error) {
            // Failed to initialize, but continue with what we have
        }
    }

    public async refresh(): Promise<void> {
        this.initialized = false;
        this.collections = [];
        this.collectionItems = [];
        this.fieldsMap.clear();
        this.fieldItemsMap.clear();
        await this.initialize();
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        // Ensure initialization
        if (!this.initialized) {
            await this.initialize();
        }

        const items: vscode.CompletionItem[] = [
            ...this.keywordItems,
            ...this.functionItems,
            ...this.collectionItems
        ];

        // Find which collections are referenced in the document
        const text = document.getText();
        const referencedCollections = new Set<string>();

        for (const col of this.collections) {
            const regex = new RegExp(`\\b${this.escapeRegex(col)}\\b`, 'gi');
            if (regex.test(text)) {
                referencedCollections.add(col);
            }
        }

        // Add fields from referenced collections
        for (const col of referencedCollections) {
            const fieldItems = this.fieldItemsMap.get(col);
            if (fieldItems) {
                items.push(...fieldItems);
            }
        }

        return items;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
