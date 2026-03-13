import * as vscode from 'vscode';

/**
 * LiteDB completion provider that follows the official LiteDB SQL syntax
 * from https://www.litedb.org/api/
 */
export class LiteDbCompletionProvider implements vscode.CompletionItemProvider {
    // Official LiteDB SELECT clause order
    private readonly clauseOrder = [
        { keyword: 'EXPLAIN', detail: 'Show query execution plan', optional: true, insertText: 'EXPLAIN\n' },
        { keyword: 'SELECT', detail: 'Define projections', insertText: 'SELECT ' },
        { keyword: 'INTO', detail: 'Insert results into collection', optional: true, insertText: 'INTO ' },
        { keyword: 'FROM', detail: 'Specify source collection', insertText: 'FROM ' },
        { keyword: 'INCLUDE', detail: 'Resolve references', optional: true, insertText: 'INCLUDE ' },
        { keyword: 'WHERE', detail: 'Filter documents', optional: true, insertText: 'WHERE ' },
        { keyword: 'GROUP BY', detail: 'Group results by expression', optional: true, insertText: 'GROUP BY ' },
        { keyword: 'HAVING', detail: 'Filter grouped results', optional: true, insertText: 'HAVING ' },
        { keyword: 'ORDER BY', detail: 'Sort results', optional: true, insertText: 'ORDER BY ' },
        { keyword: 'LIMIT', detail: 'Limit number of documents', optional: true, insertText: 'LIMIT ' },
        { keyword: 'OFFSET', detail: 'Skip documents (zero-based)', optional: true, insertText: 'OFFSET ' },
        { keyword: 'FOR UPDATE', detail: 'Open with write lock', optional: true, insertText: 'FOR UPDATE' },
    ];

    // INSERT clause order
    private readonly insertClauseOrder = [
        { keyword: 'INSERT INTO', detail: 'Insert documents into collection', insertText: 'INSERT INTO ' },
        { keyword: 'VALUES', detail: 'Document(s) to insert (JSON format)', insertText: 'VALUES ' },
    ];

    // UPDATE clause order
    private readonly updateClauseOrder = [
        { keyword: 'UPDATE', detail: 'Update documents in collection', insertText: 'UPDATE ' },
        { keyword: 'SET', detail: 'Set fields or replace document', insertText: 'SET ' },
        { keyword: 'WHERE', detail: 'Filter documents to update', optional: true, insertText: 'WHERE ' },
    ];

    // DELETE clause order
    private readonly deleteClauseOrder = [
        { keyword: 'DELETE', detail: 'Delete documents from collection', insertText: 'DELETE ' },
        { keyword: 'WHERE', detail: 'Filter documents to delete', insertText: 'WHERE ' },
    ];

    // LiteDB functions organized by category
    private readonly functions = {
        aggregate: [
            { name: 'COUNT', detail: 'Returns the number of elements in array', insertText: 'COUNT($0)' },
            { name: 'MIN', detail: 'Returns the lowest value in array', insertText: 'MIN($0)' },
            { name: 'MAX', detail: 'Returns the highest value in array', insertText: 'MAX($0)' },
            { name: 'FIRST', detail: 'Returns the first element in array', insertText: 'FIRST($0)' },
            { name: 'LAST', detail: 'Returns the last element in array', insertText: 'LAST($0)' },
            { name: 'AVG', detail: 'Returns the average value of numerical values in array', insertText: 'AVG($0)' },
            { name: 'SUM', detail: 'Returns the sum of numerical values in array', insertText: 'SUM($0)' },
            { name: 'ANY', detail: 'Returns true if array has any elements', insertText: 'ANY($0)' },
        ],
        datatype: [
            { name: 'MINVALUE', detail: 'Returns singleton instance of MinValue', insertText: 'MINVALUE()' },
            { name: 'MAXVALUE', detail: 'Returns singleton instance of MaxValue', insertText: 'MAXVALUE()' },
            { name: 'OBJECTID', detail: 'Returns new instance of ObjectId', insertText: 'OBJECTID()' },
            { name: 'GUID', detail: 'Returns new instance of Guid', insertText: 'GUID()' },
            { name: 'NOW', detail: 'Returns current timestamp in local time', insertText: 'NOW()' },
            { name: 'NOW_UTC', detail: 'Returns current timestamp in UTC', insertText: 'NOW_UTC()' },
            { name: 'TODAY', detail: 'Returns current date at 00h00min00s', insertText: 'TODAY()' },
            { name: 'INT32', detail: 'Converts value to Int32', insertText: 'INT32($0)' },
            { name: 'INT64', detail: 'Converts value to Int64', insertText: 'INT64($0)' },
            { name: 'DOUBLE', detail: 'Converts value to Double', insertText: 'DOUBLE($0)' },
            { name: 'DECIMAL', detail: 'Converts value to Decimal', insertText: 'DECIMAL($0)' },
            { name: 'STRING', detail: 'Returns string representation of value', insertText: 'STRING($0)' },
            { name: 'BINARY', detail: 'Converts value to BsonBinary', insertText: 'BINARY($0)' },
            { name: 'BOOLEAN', detail: 'Converts value to Boolean', insertText: 'BOOLEAN($0)' },
            { name: 'DATETIME', detail: 'Converts value to DateTime in local time', insertText: 'DATETIME($0)' },
            { name: 'DATETIME_UTC', detail: 'Converts value to DateTime in UTC', insertText: 'DATETIME_UTC($0)' },
            { name: 'IS_MINVALUE', detail: 'Returns true if value is MinValue', insertText: 'IS_MINVALUE($0)' },
            { name: 'IS_MAXVALUE', detail: 'Returns true if value is MaxValue', insertText: 'IS_MAXVALUE($0)' },
            { name: 'IS_NULL', detail: 'Returns true if value is null', insertText: 'IS_NULL($0)' },
            { name: 'IS_INT32', detail: 'Returns true if value is Int32', insertText: 'IS_INT32($0)' },
            { name: 'IS_INT64', detail: 'Returns true if value is Int64', insertText: 'IS_INT64($0)' },
            { name: 'IS_DOUBLE', detail: 'Returns true if value is Double', insertText: 'IS_DOUBLE($0)' },
            { name: 'IS_DECIMAL', detail: 'Returns true if value is Decimal', insertText: 'IS_DECIMAL($0)' },
            { name: 'IS_NUMBER', detail: 'Returns true if value is numerical type', insertText: 'IS_NUMBER($0)' },
            { name: 'IS_STRING', detail: 'Returns true if value is String', insertText: 'IS_STRING($0)' },
            { name: 'IS_DOCUMENT', detail: 'Returns true if value is BsonDocument', insertText: 'IS_DOCUMENT($0)' },
            { name: 'IS_ARRAY', detail: 'Returns true if value is BsonArray', insertText: 'IS_ARRAY($0)' },
            { name: 'IS_BINARY', detail: 'Returns true if value is BsonBinary', insertText: 'IS_BINARY($0)' },
            { name: 'IS_OBJECTID', detail: 'Returns true if value is ObjectId', insertText: 'IS_OBJECTID($0)' },
            { name: 'IS_GUID', detail: 'Returns true if value is Guid', insertText: 'IS_GUID($0)' },
            { name: 'IS_BOOLEAN', detail: 'Returns true if value is Boolean', insertText: 'IS_BOOLEAN($0)' },
            { name: 'IS_DATETIME', detail: 'Returns true if value is DateTime', insertText: 'IS_DATETIME($0)' },
        ],
        date: [
            { name: 'YEAR', detail: 'Returns the year of DateTime value', insertText: 'YEAR($0)' },
            { name: 'MONTH', detail: 'Returns the month of DateTime value', insertText: 'MONTH($0)' },
            { name: 'DAY', detail: 'Returns the day of DateTime value', insertText: 'DAY($0)' },
            { name: 'HOUR', detail: 'Returns the hour of DateTime value', insertText: 'HOUR($0)' },
            { name: 'MINUTE', detail: 'Returns the minutes of DateTime value', insertText: 'MINUTE($0)' },
            { name: 'SECOND', detail: 'Returns the seconds of DateTime value', insertText: 'SECOND($0)' },
            { name: 'DATEADD', detail: 'Adds amount to date (y|M|d|h|m|s, amount, date)', insertText: 'DATEADD(\'$1\', $2, $0)' },
            { name: 'DATEDIFF', detail: 'Returns difference between dates (y|M|d|h|m|s, start, end)', insertText: 'DATEDIFF(\'$1\', $2, $0)' },
            { name: 'TO_LOCAL', detail: 'Converts date to local time', insertText: 'TO_LOCAL($0)' },
            { name: 'TO_UTC', detail: 'Converts date to UTC', insertText: 'TO_UTC($0)' },
        ],
        math: [
            { name: 'ABS', detail: 'Returns absolute value', insertText: 'ABS($0)' },
            { name: 'ROUND', detail: 'Rounds value to digits precision', insertText: 'ROUND($1, $0)' },
            { name: 'POW', detail: 'Returns x to the power of y', insertText: 'POW($1, $0)' },
        ],
        string: [
            { name: 'LOWER', detail: 'Returns value in lower case', insertText: 'LOWER($0)' },
            { name: 'UPPER', detail: 'Returns value in upper case', insertText: 'UPPER($0)' },
            { name: 'LTRIM', detail: 'Removes leading whitespaces', insertText: 'LTRIM($0)' },
            { name: 'RTRIM', detail: 'Removes trailing whitespaces', insertText: 'RTRIM($0)' },
            { name: 'TRIM', detail: 'Removes leading and trailing whitespaces', insertText: 'TRIM($0)' },
            { name: 'INDEXOF', detail: 'Returns index of first occurrence of match', insertText: 'INDEXOF($1, $0)' },
            { name: 'SUBSTRING', detail: 'Returns substring (value, start, length?)', insertText: 'SUBSTRING($1, $0)' },
            { name: 'LPAD', detail: 'Left-pads string (value, width, char)', insertText: 'LPAD($1, $2, \'$0\')' },
            { name: 'RPAD', detail: 'Right-pads string (value, width, char)', insertText: 'RPAD($1, $2, \'$0\')' },
            { name: 'SPLIT', detail: 'Splits string by separator', insertText: 'SPLIT($1, \'$0\')' },
            { name: 'FORMAT', detail: 'Formats value with format string', insertText: 'FORMAT($1, \'$0\')' },
            { name: 'JOIN', detail: 'Joins array of strings (array, separator?)', insertText: 'JOIN($0)' },
        ],
        misc: [
            { name: 'JSON', detail: 'Parses JSON string to BsonValue', insertText: 'JSON(\'$0\')' },
            { name: 'EXTEND', detail: 'Merges two documents into one', insertText: 'EXTEND($1, $0)' },
            { name: 'CONCAT', detail: 'Concatenates two arrays', insertText: 'CONCAT($1, $0)' },
            { name: 'KEYS', detail: 'Returns array of document keys', insertText: 'KEYS($0)' },
            { name: 'OID_CREATIONTIME', detail: 'Returns creation time of ObjectId', insertText: 'OID_CREATIONTIME($0)' },
            { name: 'IIF', detail: 'Returns ifTrue or ifFalse based on predicate', insertText: 'IIF($1, $2, $0)' },
            { name: 'COALESCE', detail: 'Returns left if not null, otherwise right', insertText: 'COALESCE($1, $0)' },
            { name: 'LENGTH', detail: 'Returns length of value (String/Binary/Array/Document)', insertText: 'LENGTH($0)' },
            { name: 'TOP', detail: 'Returns first num elements from values', insertText: 'TOP($1, $0)' },
            { name: 'UNION', detail: 'Returns set union of two arrays', insertText: 'UNION($1, $0)' },
            { name: 'EXCEPT', detail: 'Returns set difference of two arrays', insertText: 'EXCEPT($1, $0)' },
            { name: 'DISTINCT', detail: 'Returns distinct elements from array', insertText: 'DISTINCT($0)' },
            { name: 'RANDOM', detail: 'Returns random Int32 (min?, max?)', insertText: 'RANDOM()' },
        ],
    };

    constructor(
        private readonly getDbPath: () => string | undefined,
        private readonly getCollections: (dbPath: string) => Promise<string[]>
    ) {}

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const text = document.getText(new vscode.Range(new vscode.Position(0, 0), position)).toUpperCase();
        const lineText = document.lineAt(position.line).text.substring(0, position.character);
        
        const completions: vscode.CompletionItem[] = [];
        const dbPath = this.getDbPath();

        // Detect statement type
        const hasInsert = text.includes('INSERT');
        const hasUpdate = text.includes('UPDATE') && !text.includes('FOR UPDATE');
        const hasDelete = text.includes('DELETE');
        const hasSelect = text.includes('SELECT') || text.includes('EXPLAIN');
        const hasMisc = text.match(/\b(DROP|CREATE|RENAME|BEGIN|COMMIT|ROLLBACK|REBUILD)\b/);

        // If no statement started, suggest all top-level commands
        if (!hasInsert && !hasUpdate && !hasDelete && !hasSelect && !hasMisc) {
            // Suggest SELECT commands
            completions.push(
                this.createKeywordItem('EXPLAIN', this.clauseOrder[0], '00'),
                this.createKeywordItem('SELECT', this.clauseOrder[1], '01')
            );
            
            // Suggest DML commands
            completions.push(
                this.createCommandItem('INSERT INTO', 'Insert documents into collection', '02'),
                this.createCommandItem('UPDATE', 'Update documents in collection', '03'),
                this.createCommandItem('DELETE', 'Delete documents from collection', '04')
            );

            // Suggest DDL/Misc commands
            completions.push(
                this.createCommandItem('DROP COLLECTION', 'Drop a collection', '05'),
                this.createCommandItem('DROP INDEX', 'Drop an index', '06'),
                this.createCommandItem('CREATE INDEX', 'Create an index', '07'),
                this.createCommandItem('CREATE UNIQUE INDEX', 'Create a unique index', '08'),
                this.createCommandItem('RENAME COLLECTION', 'Rename a collection', '09'),
                this.createCommandItem('BEGIN', 'Begin transaction', '10'),
                this.createCommandItem('COMMIT', 'Commit transaction', '11'),
                this.createCommandItem('ROLLBACK', 'Rollback transaction', '12'),
                this.createCommandItem('REBUILD', 'Rebuild database', '13')
            );
            
            // Also suggest collections for direct queries
            if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }

            // Add functions
            completions.push(...this.createFunctionItems());
            
            return completions;
        }

        // Handle INSERT statement
        if (hasInsert) {
            return this.handleInsertCompletion(text, dbPath, completions);
        }

        // Handle UPDATE statement
        if (hasUpdate) {
            return this.handleUpdateCompletion(text, dbPath, completions);
        }

        // Handle DELETE statement
        if (hasDelete) {
            return this.handleDeleteCompletion(text, dbPath, completions);
        }

        // Handle SELECT statement
        if (hasSelect) {
            return this.handleSelectCompletion(text, dbPath, completions);
        }

        // Handle MISC commands
        if (hasMisc) {
            return this.handleMiscCompletion(text, dbPath, completions);
        }

        return completions;
    }

    private async handleInsertCompletion(
        text: string,
        dbPath: string | undefined,
        completions: vscode.CompletionItem[]
    ): Promise<vscode.CompletionItem[]> {
        const hasInto = text.includes('INTO');
        const hasValues = text.includes('VALUES');

        if (!hasInto) {
            completions.push(this.createKeywordItem('INTO', this.insertClauseOrder[0], '00'));
        } else if (!hasValues) {
            // After INTO, suggest collection names and auto-id types
            if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }
            // Suggest auto-id type modifiers
            completions.push(
                this.createCommandItem(':GUID', 'Use GUID for auto ID', '00'),
                this.createCommandItem(':INT', 'Use INT for auto ID', '01'),
                this.createCommandItem(':LONG', 'Use LONG for auto ID', '02'),
                this.createCommandItem(':OBJECTID', 'Use OBJECTID for auto ID (default)', '03')
            );
            completions.push(this.createKeywordItem('VALUES', this.insertClauseOrder[1], '04'));
        } else {
            // After VALUES, suggest JSON document structure
            completions.push(...this.createFunctionItems());
        }

        return completions;
    }

    private async handleUpdateCompletion(
        text: string,
        dbPath: string | undefined,
        completions: vscode.CompletionItem[]
    ): Promise<vscode.CompletionItem[]> {
        const hasSet = text.includes('SET');
        const hasWhere = text.includes('WHERE');

        if (!hasSet) {
            // After UPDATE, suggest collection names
            if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }
            completions.push(this.createKeywordItem('SET', this.updateClauseOrder[1], '00'));
        } else if (!hasWhere) {
            // After SET, suggest WHERE
            completions.push(this.createKeywordItem('WHERE', this.updateClauseOrder[2], '00'));
            completions.push(...this.createFunctionItems());
        } else {
            // In WHERE clause
            completions.push(...this.createContextKeywords());
            completions.push(...this.createFunctionItems());
        }

        return completions;
    }

    private async handleDeleteCompletion(
        text: string,
        dbPath: string | undefined,
        completions: vscode.CompletionItem[]
    ): Promise<vscode.CompletionItem[]> {
        const hasWhere = text.includes('WHERE');

        if (!hasWhere) {
            // After DELETE, suggest collection names
            if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }
            completions.push(this.createKeywordItem('WHERE', this.deleteClauseOrder[1], '00'));
        } else {
            // In WHERE clause
            completions.push(...this.createContextKeywords());
            completions.push(...this.createFunctionItems());
        }

        return completions;
    }

    private async handleSelectCompletion(
        text: string,
        dbPath: string | undefined,
        completions: vscode.CompletionItem[]
    ): Promise<vscode.CompletionItem[]> {
        // Find which clauses are already present
        const presentClauses = new Set<string>();
        const lastClauseIndex = { index: -1, keyword: '' };
        
        for (let i = 0; i < this.clauseOrder.length; i++) {
            const clause = this.clauseOrder[i];
            if (text.includes(clause.keyword)) {
                presentClauses.add(clause.keyword);
                if (i > lastClauseIndex.index) {
                    lastClauseIndex.index = i;
                    lastClauseIndex.keyword = clause.keyword;
                }
            }
        }

        // Suggest next valid clauses based on the last clause
        for (let i = lastClauseIndex.index + 1; i < this.clauseOrder.length; i++) {
            const clause = this.clauseOrder[i];
            
            // Skip if already present
            if (presentClauses.has(clause.keyword)) {
                continue;
            }

            // Special rules
            // ORDER BY cannot be used with GROUP BY
            if (clause.keyword === 'ORDER BY' && presentClauses.has('GROUP BY')) {
                continue;
            }
            // HAVING requires GROUP BY
            if (clause.keyword === 'HAVING' && !presentClauses.has('GROUP BY')) {
                continue;
            }

            completions.push(this.createKeywordItem(clause.keyword, clause, String(i).padStart(2, '0')));
        }

        // Suggest collection names after FROM or INTO
        if (['FROM', 'INTO'].includes(lastClauseIndex.keyword) && dbPath) {
            const collections = await this.getCollections(dbPath);
            completions.push(...this.createCollectionItems(collections));
        }

        // Suggest collections after INCLUDE (for reference resolution)
        if (lastClauseIndex.keyword === 'INCLUDE' && dbPath) {
            const collections = await this.getCollections(dbPath);
            completions.push(...this.createCollectionItems(collections, 'Referenced collection'));
        }

        // Add common SQL keywords and functions for WHERE, HAVING, ORDER BY, SELECT contexts
        if (['WHERE', 'HAVING', 'ORDER BY', 'SELECT', 'GROUP BY'].includes(lastClauseIndex.keyword)) {
            completions.push(...this.createContextKeywords());
            completions.push(...this.createFunctionItems());
        }

        return completions;
    }

    private async handleMiscCompletion(
        text: string,
        dbPath: string | undefined,
        completions: vscode.CompletionItem[]
    ): Promise<vscode.CompletionItem[]> {
        // Handle specific misc commands
        if (text.includes('DROP COLLECTION') || text.includes('DROP INDEX')) {
            if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }
        } else if (text.includes('RENAME COLLECTION')) {
            if (!text.includes(' TO ')) {
                if (dbPath) {
                    const collections = await this.getCollections(dbPath);
                    completions.push(...this.createCollectionItems(collections));
                }
                completions.push(this.createCommandItem('TO', 'New name', '00'));
            }
        } else if (text.includes('CREATE') && text.includes('INDEX')) {
            if (!text.includes(' ON ')) {
                completions.push(this.createCommandItem('ON', 'Specify collection', '00'));
            } else if (dbPath) {
                const collections = await this.getCollections(dbPath);
                completions.push(...this.createCollectionItems(collections));
            }
        } else if (text.includes('BEGIN')) {
            completions.push(
                this.createCommandItem('TRANS', 'Begin transaction', '00'),
                this.createCommandItem('TRANSACTION', 'Begin transaction', '01')
            );
        }

        return completions;
    }

    private createCommandItem(keyword: string, detail: string, sortText: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Method);
        item.detail = detail;
        item.insertText = keyword + ' ';
        item.sortText = sortText;
        return item;
    }

    private createKeywordItem(
        keyword: string,
        clause: { detail: string; insertText: string; optional?: boolean },
        sortText: string
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
        item.detail = clause.optional ? `${clause.detail} (optional)` : clause.detail;
        item.insertText = clause.insertText;
        item.sortText = sortText;
        return item;
    }

    private createCollectionItems(collections: string[], detail?: string): vscode.CompletionItem[] {
        return collections.map(name => {
            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Class);
            item.detail = detail || 'Collection in current database';
            item.insertText = name;
            item.sortText = 'z' + name; // Sort collections after keywords
            return item;
        });
    }

    private createContextKeywords(): vscode.CompletionItem[] {
        const keywords = ['AND', 'OR', 'NOT', 'ASC', 'DESC', 'NULL', 'TRUE', 'FALSE', 'LIKE', 'IN', 'BETWEEN'];
        return keywords.map((kw, idx) => {
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.sortText = 'zz' + idx;
            return item;
        });
    }

    private createFunctionItems(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        
        // Aggregate functions
        for (const func of this.functions.aggregate) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `Aggregate: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz0' + func.name;
            items.push(item);
        }

        // DataType functions
        for (const func of this.functions.datatype) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `DataType: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz1' + func.name;
            items.push(item);
        }

        // Date functions
        for (const func of this.functions.date) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `Date: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz2' + func.name;
            items.push(item);
        }

        // Math functions
        for (const func of this.functions.math) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `Math: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz3' + func.name;
            items.push(item);
        }

        // String functions
        for (const func of this.functions.string) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `String: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz4' + func.name;
            items.push(item);
        }

        // Misc functions
        for (const func of this.functions.misc) {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = `Misc: ${func.detail}`;
            item.insertText = new vscode.SnippetString(func.insertText);
            item.sortText = 'zzz5' + func.name;
            items.push(item);
        }

        return items;
    }
}
