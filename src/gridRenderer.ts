// src/gridRenderer.ts
import * as fs from 'fs';
import * as path from 'path';

export type QueryResult = {
    columns: string[];
    rows: Array<Record<string, unknown>>;
};

// Load HTML template once
let htmlTemplate: string | null = null;
function getHtmlTemplate(): string {
    if (!htmlTemplate) {
        const templatePath = path.join(__dirname, '..', 'media', 'gridView.html');
        htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
    }
    return htmlTemplate;
}

export function renderCollectionGrid(collectionName: string, result: QueryResult): string {

    // Helper to escape HTML
    const escapeHtml = (value: unknown): string => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Helper to format _id as BSON ObjectId if it matches 24 hex chars
    function formatIdBson(id: unknown): string {
        if (typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)) {
            return escapeHtml(JSON.stringify({ $oid: id }));
        }
        return escapeHtml(id);
    }

    const header = result.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
    const rows = result.rows.map((r, i) => {
        const rowNumber = i + 1;
        // Add data-id attribute for the _id value
        const idValue = r['_id'] !== undefined ? String(r['_id']) : '';
        const cells = result.columns.map((c) => {
            // For _id column, show as BSON if it matches ObjectId
            let displayValue;
            if (c === '_id') {
                displayValue = formatIdBson(r[c]);
            } else {
                displayValue = escapeHtml(r[c]);
            }
            // Add data attributes for row, column, and id
            return `<td data-row="${i}" data-col="${escapeHtml(c)}" data-id="${escapeHtml(idValue)}" tabindex="0">${displayValue}</td>`;
        }).join('');
        return `<tr><td class="row-number">${rowNumber}</td>${cells}</tr>`;
    }).join('');

    const emptyMessage = `<tr><td class="empty" colspan="${Math.max(result.columns.length + 1, 2)}">No documents found.</td></tr>`;

    // Load template and replace placeholders
    return getHtmlTemplate()
        .replace(/\{\{COLLECTION_NAME\}\}/g, escapeHtml(collectionName))
        .replace(/\{\{COLLECTION_NAME_JSON\}\}/g, JSON.stringify(collectionName).slice(1, -1)) // Remove quotes
        .replace(/\{\{TABLE_HEADER\}\}/g, header)
        .replace(/\{\{TABLE_ROWS\}\}/g, rows || emptyMessage);
}
