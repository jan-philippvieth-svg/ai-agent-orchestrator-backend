import { createHash } from 'node:crypto';
import { config } from '../config.js';
export class CacheService {
    static instance;
    store = new Map();
    static getInstance() {
        CacheService.instance ??= new CacheService();
        return CacheService.instance;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlSeconds = config.cache.ttlSeconds) {
        if (this.store.size >= config.cache.maxEntries)
            this.evictOldest();
        this.store.set(key, {
            value,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }
    delete(key) {
        return this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    size() {
        this.removeExpired();
        return this.store.size;
    }
    buildChatKey(input) {
        const messageHash = createHash('sha256').update(input.message.toLowerCase().trim()).digest('hex');
        return ['chat', input.tenantId, input.userId, input.selectedModel, input.preferredModel, messageHash].join(':');
    }
    toChatCacheValue(response) {
        return {
            answer: response.answer,
            metadata: response.metadata,
        };
    }
    evictOldest() {
        let oldestKey;
        let oldestCreatedAt = Number.POSITIVE_INFINITY;
        for (const [key, entry] of this.store.entries()) {
            if (entry.createdAt < oldestCreatedAt) {
                oldestKey = key;
                oldestCreatedAt = entry.createdAt;
            }
        }
        if (oldestKey)
            this.store.delete(oldestKey);
    }
    removeExpired() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt <= now)
                this.store.delete(key);
        }
    }
}
