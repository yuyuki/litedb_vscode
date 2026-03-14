// src/queryHelpers.ts

/**
 * Returns the correct expression for a LiteDB _id value in a query.
 * Handles string, number, and BSON ObjectId (as {"$oid": ...}).
 */
export function getLiteDbIdExpr(id: unknown): string {
    try {
        const parsed = typeof id === 'string' ? JSON.parse(id) : id;
        if (parsed && typeof parsed === 'object' && '$oid' in parsed) {
            return `ObjectId('${parsed.$oid}')`;
        } else {
            return typeof id === 'string' && !isNaN(Number(id)) ? id : `'${String(id).replace(/'/g, "''")}'`;
        }
    } catch {
        return typeof id === 'string' && !isNaN(Number(id)) ? id : `'${String(id).replace(/'/g, "''")}'`;
    }
}
