import * as vscode from 'vscode';

export class LiteDbCompletionProvider implements vscode.CompletionItemProvider {
                    private allKeywords: vscode.CompletionItem[] = [];
                    private allFunctions: vscode.CompletionItem[] = [];
                    private allCollections: string[] = [];
                    private allCollectionItems: vscode.CompletionItem[] = [];
                    private allFields: Record<string, string[]> = {};
                    private allFieldItems: Record<string, vscode.CompletionItem[]> = {};
                    private preloadDone = false;

                    constructor(
                        private readonly getDbPath: () => string | undefined,
                        private readonly getCollections: (dbPath: string) => Promise<string[]>,
                        private readonly getFields: (dbPath: string, collectionName: string) => Promise<string[]>
                    ) {
                        this.preload();
                    }

                    private async preload() {
                        if (this.preloadDone) return;
                        const dbPath = this.getDbPath();
                        if (!dbPath) return;
                        // Preload all collections
                        this.allCollections = await this.getCollections(dbPath);
                        this.allCollectionItems = this.allCollections.map(name => {
                            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Struct);
                            item.detail = 'Collection';
                            return item;
                        });
                        // Preload all fields for every collection
                        for (const col of this.allCollections) {
                            const fields = await this.getFields(dbPath, col);
                            this.allFields[col] = fields;
                            this.allFieldItems[col] = fields.map(f => {
                                const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.Field);
                                item.detail = `Field of ${col}`;
                                return item;
                            });
                        }
                        // Preload all keywords (flattened)
                        const keywords = [
                            'EXPLAIN', 'SELECT', 'INTO', 'FROM', 'INCLUDE', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'FOR UPDATE',
                            'INSERT INTO', 'VALUES',
                            'UPDATE', 'SET',
                            'DELETE',
                            'DESC', 'ASC'
                        ];
                        this.allKeywords = keywords.map((kw, i) => {
                            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
                            item.sortText = String(i).padStart(2, '0');
                            return item;
                        });
                        // Preload all functions (flattened)
                        const functions = [
                            'COUNT', 'MIN', 'MAX', 'FIRST', 'LAST', 'AVG', 'SUM', 'ANY',
                            'MINVALUE', 'MAXVALUE', 'OBJECTID', 'GUID', 'NOW', 'NOW_UTC', 'TODAY', 'INT32', 'INT64', 'DOUBLE', 'DECIMAL', 'STRING', 'BINARY', 'BOOLEAN', 'DATETIME', 'DATETIME_UTC',
                            'IS_MINVALUE', 'IS_MAXVALUE', 'IS_NULL', 'IS_INT32', 'IS_INT64', 'IS_DOUBLE', 'IS_DECIMAL', 'IS_NUMBER', 'IS_STRING', 'IS_DOCUMENT', 'IS_ARRAY', 'IS_BINARY', 'IS_OBJECTID', 'IS_GUID', 'IS_BOOLEAN', 'IS_DATETIME',
                            'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'DATEADD', 'DATEDIFF', 'TO_LOCAL', 'TO_UTC',
                            'ABS', 'ROUND', 'POW',
                            'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'INDEXOF', 'SUBSTRING', 'LPAD', 'RPAD', 'SPLIT', 'FORMAT', 'JOIN',
                            'JSON', 'EXTEND', 'CONCAT', 'KEYS', 'OID_CREATIONTIME', 'IIF', 'COALESCE', 'LENGTH', 'TOP', 'UNION', 'EXCEPT', 'DISTINCT', 'RANDOM'
                        ];
                        this.allFunctions = functions.map(fn => {
                            const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
                            return item;
                        });
                        this.preloadDone = true;
                    }

                    public async refreshCollections(): Promise<void> {
                        this.preloadDone = false;
                        await this.preload();
                    }

                    async provideCompletionItems(
                        document: vscode.TextDocument,
                        position: vscode.Position
                    ): Promise<vscode.CompletionItem[]> {
                        await this.preload();
                        const text = document.getText();
                        // Find all collection names written in the text
                        const foundCollections = new Set<string>();
                        for (const col of this.allCollections) {
                            const regex = new RegExp(`\\b${col}\\b`, 'gi');
                            if (regex.test(text)) {
                                foundCollections.add(col);
                            }
                        }
                        // Gather all field items for all found collections
                        let fieldItems: vscode.CompletionItem[] = [];
                        for (const col of foundCollections) {
                            fieldItems = fieldItems.concat(this.allFieldItems[col] || []);
                        }
                        // Always show all keywords, all collections, all functions, and all fields for written collections
                        return [
                            ...this.allKeywords,
                            ...this.allCollectionItems,
                            ...this.allFunctions,
                            ...fieldItems
                        ];
                    }
                }
