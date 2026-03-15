// Grid renderer utility

import * as fs from 'fs';
import * as path from 'path';
import { QueryResult } from '../types';
import { escapeHtml, formatIdAsBson } from './stringUtils';

// Cache the HTML template
let htmlTemplate: string | null = null;

function getHtmlTemplate(): string {
    if (!htmlTemplate) {
        const templatePath = path.join(__dirname, '..', '..', 'media', 'gridView.html');
        try {
            htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
        } catch (error) {
            // Fallback to inline template
            htmlTemplate = getDefaultTemplate();
        }
    }
    return htmlTemplate;
}

function getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid var(--vscode-panel-border); padding: 8px; text-align: left; }
        th { background-color: var(--vscode-editor-background); position: sticky; top: 0; }
        .row-number { background-color: var(--vscode-editor-background); font-weight: bold; }
        .empty { text-align: center; font-style: italic; }
    </style>
</head>
<body>
    <h2>{{COLLECTION_NAME}}</h2>
    <table>
        <thead><tr><th>#</th>{{TABLE_HEADER}}</tr></thead>
        <tbody>{{TABLE_ROWS}}</tbody>
    </table>
</body>
</html>`;
}

export function renderCollectionGrid(collectionName: string, result: QueryResult): string {
    const header = result.columns
        .map(c => `<th>${escapeHtml(c)}</th>`)
        .join('');

    const rows = result.rows.length > 0
        ? result.rows.map((row, i) => renderRow(row, result.columns, i)).join('')
        : `<tr><td class="empty" colspan="${result.columns.length + 1}">No documents found.</td></tr>`;

    return getHtmlTemplate()
        .replace(/\{\{COLLECTION_NAME\}\}/g, escapeHtml(collectionName))
        .replace(/\{\{COLLECTION_NAME_JSON\}\}/g, JSON.stringify(collectionName).slice(1, -1))
        .replace(/\{\{TABLE_HEADER\}\}/g, header)
        .replace(/\{\{TABLE_ROWS\}\}/g, rows);
}

function renderRow(row: Record<string, unknown>, columns: string[], index: number): string {
    // Store _id value for update operations
    // If _id is already a BSON object {$oid: "..."}, extract the $oid value
    // Otherwise, store the raw value
    let idValue = '';
    if (row['_id'] !== undefined) {
        const id = row['_id'];
        if (typeof id === 'object' && id !== null && '$oid' in id) {
            idValue = (id as any).$oid;
        } else {
            idValue = String(id);
        }
    }
    
    const cells = columns.map(col => {
        const value = row[col];
        const displayValue = col === '_id' ? formatIdAsBson(value) : escapeHtml(value);
        
        return `<td data-row="${index}" data-col="${escapeHtml(col)}" data-id="${escapeHtml(idValue)}" tabindex="0">${displayValue}</td>`;
    }).join('');

    return `<tr><td class="row-number">${index + 1}</td>${cells}</tr>`;
}
