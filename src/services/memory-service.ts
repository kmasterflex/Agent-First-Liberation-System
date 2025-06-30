/**
 * Memory Service
 * Manages agent memory with short-term and long-term storage capabilities
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  type: 'short-term' | 'long-term';
  metadata: {
    created: Date;
    accessed: Date;
    accessCount: number;
    importance: number; // 0-1 scale
    tags: string[];
    source?: string;
    agentId?: string;
  };
  embedding?: number[]; // For semantic search
  expires?: Date; // For short-term memory expiration
}

export interface MemorySearchOptions {
  type?: 'short-term' | 'long-term' | 'all';
  tags?: string[];
  agentId?: string;
  minImportance?: number;
  limit?: number;
  sortBy?: 'created' | 'accessed' | 'importance' | 'relevance';
  query?: string; // For semantic search
}

export interface MemoryStats {
  shortTermCount: number;
  longTermCount: number;
  totalSize: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  mostAccessed: MemoryEntry | null;
}

/**
 * Memory Service for managing agent short-term and long-term memory
 */
export class MemoryService extends EventEmitter {
  private shortTermMemory: Map<string, MemoryEntry>;
  private longTermMemory: Map<string, MemoryEntry>;
  private persistencePath: string;
  private maxShortTermSize: number;
  private shortTermTTL: number; // Time to live in milliseconds
  private importanceThreshold: number; // Threshold for promoting to long-term

  constructor(options?: {
    persistencePath?: string;
    maxShortTermSize?: number;
    shortTermTTL?: number;
    importanceThreshold?: number;
  }) {
    super();

    this.shortTermMemory = new Map();
    this.longTermMemory = new Map();
    this.persistencePath = options?.persistencePath || './.claude/memory';
    this.maxShortTermSize = options?.maxShortTermSize || 1000;
    this.shortTermTTL = options?.shortTermTTL || 3600000; // 1 hour default
    this.importanceThreshold = options?.importanceThreshold || 0.7;

    this.startCleanupInterval();
  }

  /**
   * Initialize memory service and load persisted data
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.persistencePath, { recursive: true });
      await this.loadPersistedMemory();
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Store a memory entry
   */
  async store(
    key: string,
    value: any,
    options?: {
      type?: 'short-term' | 'long-term';
      importance?: number;
      tags?: string[];
      agentId?: string;
      source?: string;
      ttl?: number; // Custom TTL for short-term memory
    }
  ): Promise<MemoryEntry> {
    const id = this.generateId(key);
    const type = options?.type || 'short-term';
    const now = new Date();

    const entry: MemoryEntry = {
      id,
      key,
      value,
      type,
      metadata: {
        created: now,
        accessed: now,
        accessCount: 0,
        importance: options?.importance || 0.5,
        tags: options?.tags || [],
        source: options?.source,
        agentId: options?.agentId
      }
    };

    if (type === 'short-term') {
      const ttl = options?.ttl || this.shortTermTTL;
      entry.expires = new Date(now.getTime() + ttl);

      // Check if we need to evict old entries
      if (this.shortTermMemory.size >= this.maxShortTermSize) {
        await this.evictOldestShortTerm();
      }

      this.shortTermMemory.set(id, entry);

      // Check if should be promoted to long-term
      if (entry.metadata.importance >= this.importanceThreshold) {
        await this.promoteToLongTerm(id);
      }
    } else {
      this.longTermMemory.set(id, entry);
      await this.persistEntry(entry);
    }

    this.emit('stored', { key, type, entry });
    return entry;
  }

  /**
   * Retrieve a memory entry by key
   */
  async get(key: string): Promise<MemoryEntry | null> {
    const id = this.generateId(key);

    // Check short-term first
    let entry = this.shortTermMemory.get(id);
    if (entry) {
      this.updateAccessMetadata(entry);
      return entry;
    }

    // Check long-term
    entry = this.longTermMemory.get(id);
    if (entry) {
      this.updateAccessMetadata(entry);
      return entry;
    }

    return null;
  }

  /**
   * Search memories based on criteria
   */
  async search(options: MemorySearchOptions): Promise<MemoryEntry[]> {
    let entries: MemoryEntry[] = [];

    // Collect entries based on type
    if (options.type === 'short-term' || options.type === 'all') {
      entries.push(...Array.from(this.shortTermMemory.values()));
    }
    if (options.type === 'long-term' || options.type === 'all' || !options.type) {
      entries.push(...Array.from(this.longTermMemory.values()));
    }

    // Apply filters
    if (options.tags && options.tags.length > 0) {
      entries = entries.filter(entry =>
        options.tags!.some(tag => entry.metadata.tags.includes(tag))
      );
    }

    if (options.agentId) {
      entries = entries.filter(entry => entry.metadata.agentId === options.agentId);
    }

    if (options.minImportance !== undefined) {
      entries = entries.filter(entry => entry.metadata.importance >= options.minImportance!);
    }

    // Sort entries
    if (options.sortBy) {
      entries.sort((a, b) => {
        switch (options.sortBy) {
          case 'created':
            return b.metadata.created.getTime() - a.metadata.created.getTime();
          case 'accessed':
            return b.metadata.accessed.getTime() - a.metadata.accessed.getTime();
          case 'importance':
            return b.metadata.importance - a.metadata.importance;
          default:
            return 0;
        }
      });
    }

    // Apply limit
    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Update memory importance
   */
  async updateImportance(key: string, importance: number): Promise<void> {
    const entry = await this.get(key);
    if (entry) {
      entry.metadata.importance = Math.max(0, Math.min(1, importance));

      // Check if should be promoted
      if (entry.type === 'short-term' && importance >= this.importanceThreshold) {
        await this.promoteToLongTerm(entry.id);
      }

      this.emit('importance-updated', { key, importance });
    }
  }

  /**
   * Add tags to a memory entry
   */
  async addTags(key: string, tags: string[]): Promise<void> {
    const entry = await this.get(key);
    if (entry) {
      const newTags = new Set([...entry.metadata.tags, ...tags]);
      entry.metadata.tags = Array.from(newTags);

      if (entry.type === 'long-term') {
        await this.persistEntry(entry);
      }

      this.emit('tags-updated', { key, tags: entry.metadata.tags });
    }
  }

  /**
   * Delete a memory entry
   */
  async delete(key: string): Promise<boolean> {
    const id = this.generateId(key);

    if (this.shortTermMemory.delete(id)) {
      this.emit('deleted', { key, type: 'short-term' });
      return true;
    }

    if (this.longTermMemory.delete(id)) {
      await this.deletePersistedEntry(id);
      this.emit('deleted', { key, type: 'long-term' });
      return true;
    }

    return false;
  }

  /**
   * Clear all memories of a specific type
   */
  async clear(type: 'short-term' | 'long-term' | 'all'): Promise<void> {
    if (type === 'short-term' || type === 'all') {
      this.shortTermMemory.clear();
      this.emit('cleared', { type: 'short-term' });
    }

    if (type === 'long-term' || type === 'all') {
      this.longTermMemory.clear();
      await this.clearPersistedMemory();
      this.emit('cleared', { type: 'long-term' });
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    const allEntries = [
      ...Array.from(this.shortTermMemory.values()),
      ...Array.from(this.longTermMemory.values())
    ];

    const stats: MemoryStats = {
      shortTermCount: this.shortTermMemory.size,
      longTermCount: this.longTermMemory.size,
      totalSize: JSON.stringify(allEntries).length,
      oldestEntry: null,
      newestEntry: null,
      mostAccessed: null
    };

    if (allEntries.length > 0) {
      allEntries.sort((a, b) => a.metadata.created.getTime() - b.metadata.created.getTime());
      stats.oldestEntry = allEntries[0].metadata.created;
      stats.newestEntry = allEntries[allEntries.length - 1].metadata.created;

      stats.mostAccessed = allEntries.reduce((prev, current) =>
        prev.metadata.accessCount > current.metadata.accessCount ? prev : current
      );
    }

    return stats;
  }

  /**
   * Export memories to file
   */
  async export(filePath: string, type: 'short-term' | 'long-term' | 'all' = 'all'): Promise<void> {
    const memories: Record<string, MemoryEntry[]> = {
      shortTerm: [],
      longTerm: []
    };

    if (type === 'short-term' || type === 'all') {
      memories.shortTerm = Array.from(this.shortTermMemory.values());
    }

    if (type === 'long-term' || type === 'all') {
      memories.longTerm = Array.from(this.longTermMemory.values());
    }

    await fs.writeFile(filePath, JSON.stringify(memories, null, 2));
    this.emit('exported', { filePath, type });
  }

  /**
   * Import memories from file
   */
  async import(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const memories = JSON.parse(content);

    if (memories.shortTerm) {
      for (const entry of memories.shortTerm) {
        entry.metadata.created = new Date(entry.metadata.created);
        entry.metadata.accessed = new Date(entry.metadata.accessed);
        if (entry.expires) entry.expires = new Date(entry.expires);
        this.shortTermMemory.set(entry.id, entry);
      }
    }

    if (memories.longTerm) {
      for (const entry of memories.longTerm) {
        entry.metadata.created = new Date(entry.metadata.created);
        entry.metadata.accessed = new Date(entry.metadata.accessed);
        this.longTermMemory.set(entry.id, entry);
      }
    }

    this.emit('imported', { filePath, count: this.shortTermMemory.size + this.longTermMemory.size });
  }

  /**
   * Promote short-term memory to long-term
   */
  private async promoteToLongTerm(id: string): Promise<void> {
    const entry = this.shortTermMemory.get(id);
    if (entry) {
      entry.type = 'long-term';
      delete entry.expires;

      this.longTermMemory.set(id, entry);
      this.shortTermMemory.delete(id);

      await this.persistEntry(entry);
      this.emit('promoted', { key: entry.key, id });
    }
  }

  /**
   * Evict oldest short-term memory
   */
  private async evictOldestShortTerm(): Promise<void> {
    let oldest: MemoryEntry | null = null;

    for (const entry of this.shortTermMemory.values()) {
      if (!oldest || entry.metadata.accessed < oldest.metadata.accessed) {
        oldest = entry;
      }
    }

    if (oldest) {
      this.shortTermMemory.delete(oldest.id);
      this.emit('evicted', { key: oldest.key, id: oldest.id });
    }
  }

  /**
   * Update access metadata
   */
  private updateAccessMetadata(entry: MemoryEntry): void {
    entry.metadata.accessed = new Date();
    entry.metadata.accessCount++;
  }

  /**
   * Generate unique ID for a key
   */
  private generateId(key: string): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Persist entry to disk
   */
  private async persistEntry(entry: MemoryEntry): Promise<void> {
    const filePath = path.join(this.persistencePath, `${entry.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * Delete persisted entry
   */
  private async deletePersistedEntry(id: string): Promise<void> {
    const filePath = path.join(this.persistencePath, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Load persisted memory from disk
   */
  private async loadPersistedMemory(): Promise<void> {
    try {
      const files = await fs.readdir(this.persistencePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.persistencePath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const entry = JSON.parse(content);

          // Restore date objects
          entry.metadata.created = new Date(entry.metadata.created);
          entry.metadata.accessed = new Date(entry.metadata.accessed);

          this.longTermMemory.set(entry.id, entry);
        }
      }
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  }

  /**
   * Clear all persisted memory
   */
  private async clearPersistedMemory(): Promise<void> {
    try {
      const files = await fs.readdir(this.persistencePath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.persistencePath, file));
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Start cleanup interval for expired memories
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = new Date();
      const toDelete: string[] = [];

      for (const [id, entry] of this.shortTermMemory) {
        if (entry.expires && entry.expires < now) {
          toDelete.push(id);
        }
      }

      for (const id of toDelete) {
        const entry = this.shortTermMemory.get(id);
        this.shortTermMemory.delete(id);
        if (entry) {
          this.emit('expired', { key: entry.key, id });
        }
      }
    }, 60000); // Check every minute
  }
}

/**
 * Factory function to create memory service instance
 */
export function createMemoryService(options?: {
  persistencePath?: string;
  maxShortTermSize?: number;
  shortTermTTL?: number;
  importanceThreshold?: number;
}): MemoryService {
  return new MemoryService(options);
}