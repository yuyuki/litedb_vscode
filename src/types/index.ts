// Core type definitions for the LiteDB VS Code extension

export interface BridgeRequest {
    command: string;
    dbPath: string;
    query?: string;
}

export interface BridgeResponse<T = unknown> {
    success: boolean;
    error?: string;
    data?: T;
}

export interface QueryResult {
    columns: string[];
    rows: Array<Record<string, unknown>>;
}

export interface CollectionInfo {
    name: string;
    documentCount?: number;
}

export enum BridgeCommand {
    Collections = 'collections',
    Fields = 'fields',
    Query = 'query'
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export interface BridgeQueueItem {
    payload: unknown;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timestamp: number;
}
