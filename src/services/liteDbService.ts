// LiteDB Service - abstraction layer for database operations

import { BridgeResponse, QueryResult, BridgeCommand } from '../types';
import { DotnetBridgeManager } from './dotnetBridgeManager';
import { CacheManager } from '../utils/cacheManager';

export class LiteDbService {
    private collectionsCache: CacheManager<string[]>;
    private fieldsCache: CacheManager<string[]>;

    constructor(private readonly bridgeManager: DotnetBridgeManager) {
        this.collectionsCache = new CacheManager<string[]>();
        this.fieldsCache = new CacheManager<string[]>();
    }

    async getCollections(dbPath: string, useCache = true): Promise<BridgeResponse<string[]>> {
        if (useCache && this.collectionsCache.has(dbPath)) {
            return {
                success: true,
                data: this.collectionsCache.get(dbPath)
            };
        }

        const response = await this.bridgeManager.send<string[]>({
            command: BridgeCommand.Collections,
            dbPath
        });

        if (response.success && response.data) {
            this.collectionsCache.set(dbPath, response.data);
        }

        return response;
    }

    async getFields(dbPath: string, collectionName: string, useCache = true): Promise<BridgeResponse<string[]>> {
        const cacheKey = `${dbPath}:${collectionName}`;
        
        if (useCache && this.fieldsCache.has(cacheKey)) {
            return {
                success: true,
                data: this.fieldsCache.get(cacheKey)
            };
        }

        const response = await this.bridgeManager.send<string[]>({
            command: BridgeCommand.Fields,
            dbPath,
            query: collectionName
        });

        if (response.success && response.data) {
            this.fieldsCache.set(cacheKey, response.data);
        }

        return response;
    }

    async executeQuery(dbPath: string, query: string): Promise<BridgeResponse<QueryResult>> {
        return this.bridgeManager.send<QueryResult>({
            command: BridgeCommand.Query,
            dbPath,
            query
        });
    }

    invalidateCache(dbPath?: string): void {
        if (dbPath) {
            this.collectionsCache.invalidate(dbPath);
            this.fieldsCache.invalidateByPrefix(dbPath);
        } else {
            this.collectionsCache.invalidateAll();
            this.fieldsCache.invalidateAll();
        }
    }

    dispose(): void {
        this.collectionsCache.invalidateAll();
        this.fieldsCache.invalidateAll();
    }
}
