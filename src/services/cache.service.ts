import { createHash } from 'node:crypto';
import { config } from '../config.js';
import type { ChatResponse } from '../types/index.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface ChatCacheValue {
  answer: string;
  metadata: ChatResponse['metadata'];
}

export class CacheService {
  private static instance: CacheService | undefined;
  private readonly store = new Map<string, CacheEntry<unknown>>();

  static getInstance(): CacheService {
    CacheService.instance ??= new CacheService();
    return CacheService.instance;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds = config.cache.ttlSeconds): void {
    if (this.store.size >= config.cache.maxEntries) this.evictOldest();
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    this.removeExpired();
    return this.store.size;
  }

  buildChatKey(input: {
    tenantId: string;
    userId: string;
    message: string;
    selectedModel: string;
    preferredModel: string;
  }): string {
    const messageHash = createHash('sha256').update(input.message.toLowerCase().trim()).digest('hex');
    return ['chat', input.tenantId, input.userId, input.selectedModel, input.preferredModel, messageHash].join(':');
  }

  toChatCacheValue(response: ChatResponse): ChatCacheValue {
    return {
      answer: response.answer,
      metadata: response.metadata,
    };
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestCreatedAt) {
        oldestKey = key;
        oldestCreatedAt = entry.createdAt;
      }
    }

    if (oldestKey) this.store.delete(oldestKey);
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}
