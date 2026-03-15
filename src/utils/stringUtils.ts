// String utility functions

/**
 * Escapes HTML special characters
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes single quotes for SQL strings
 */
export function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Checks if a string is a valid ObjectId (24 hex characters)
 */
export function isValidObjectId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

/**
 * Checks if a string is a valid GUID
 */
export function isValidGuid(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(value);
}

/**
 * Formats an _id value for display as BSON ObjectId
 */
export function formatIdAsBson(id: unknown): string {
    if (isValidObjectId(id)) {
        return JSON.stringify({ $oid: id });
    }
    return String(id ?? '');
}

/**
 * Formats a GUID value for display as BSON GUID
 */
export function formatGuidAsBson(guid: unknown): string {
    if (typeof guid === 'object' && guid !== null && '$guid' in guid) {
        return JSON.stringify(guid);
    }
    if (isValidGuid(guid)) {
        return JSON.stringify({ $guid: guid });
    }
    return String(guid ?? '');
}

/**
 * Returns the correct expression for a LiteDB _id value in a query
 */
export function getLiteDbIdExpression(id: unknown): string {
    try {
        const parsed = typeof id === 'string' ? JSON.parse(id) : id;
        if (parsed && typeof parsed === 'object' && '$oid' in parsed) {
            return `ObjectId('${parsed.$oid}')`;
        }
    } catch {
        // Fall through to default handling
    }
    
    // If it's a plain ObjectId string (24 hex chars), wrap it in ObjectId()
    if (isValidObjectId(id)) {
        return `ObjectId('${id}')`;
    }
    
    if (typeof id === 'string') {
        return isNaN(Number(id)) ? `'${escapeSqlString(id)}'` : id;
    }
    
    return `'${escapeSqlString(String(id))}'`;
}
