// Cache management utility

import { CacheEntry } from '../types';
import { EXTENSION_CONSTANTS } from '../constants';

export class CacheManager<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private readonly ttl: number;

    constructor(ttl: number = EXTENSION_CONSTANTS.CACHE_TTL) {
        this.ttl = ttl;
    }

    set(key: string, data: T): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }

        // Check if cache entry is still valid
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data;
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidateAll(): void {
        this.cache.clear();
    }

    invalidateByPrefix(prefix: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    size(): number {
        return this.cache.size;
    }
}
