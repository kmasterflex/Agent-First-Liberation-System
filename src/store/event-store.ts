/**
 * Event Store - Central event management system with Supabase integration
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { eventDatabase, type EventRecord } from '../db/events.js';
import { supabase } from '../db/supabase.js';
import { eventBus, type EventBus } from './event-bus.js';
import {
  AgentEvent,
  AgentEventType,
  isAgentEvent
} from './agent-events.js';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface EventStoreConfig {
  persistAll?: boolean; // Persist all events to database
  persistTypes?: AgentEventType[]; // Only persist specific event types
  enableRealtime?: boolean; // Enable real-time synchronization
  retentionDays?: number; // Days to retain events
  batchSize?: number; // Batch size for bulk operations
  syncInterval?: number; // Sync interval in milliseconds
}

export interface EventQuery {
  types?: AgentEventType[];
  sources?: string[];
  targets?: string[];
  correlationIds?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export interface EventAggregate {
  type: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  sources: Set<string>;
}

export class EventStore extends EventEmitter {
  private config: Required<EventStoreConfig>;
  private eventBus: EventBus;
  private pendingEvents: AgentEvent[] = [];
  private syncTimer: NodeJS.Timer | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private isInitialized: boolean = false;
  private aggregateCache: Map<string, EventAggregate> = new Map();

  constructor(config: EventStoreConfig = {}) {
    super();

    this.config = {
      persistAll: config.persistAll ?? true,
      persistTypes: config.persistTypes ?? [],
      enableRealtime: config.enableRealtime ?? true,
      retentionDays: config.retentionDays ?? 30,
      batchSize: config.batchSize ?? 100,
      syncInterval: config.syncInterval ?? 5000
    };

    this.eventBus = eventBus;
  }

  /**
   * Initialize the event store
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize event database
      await eventDatabase.initialize();

      // Set up event bus listeners
      this.setupEventBusListeners();

      // Set up real-time synchronization
      if (this.config.enableRealtime) {
        await this.setupRealtimeSync();
      }

      // Start sync timer
      this.startSyncTimer();

      // Clean up old events
      await this.cleanupOldEvents();

      this.isInitialized = true;
      logger.info('Event store initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize event store:', error);
      throw error;
    }
  }

  /**
   * Publish an event
   */
  async publish(event: AgentEvent): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Validate event
    if (!isAgentEvent(event)) {
      throw new Error('Invalid agent event format');
    }

    // Publish to event bus for real-time delivery
    await this.eventBus.publish(event);

    // Add to pending events for persistence
    if (this.shouldPersist(event)) {
      this.pendingEvents.push(event);

      // Sync if batch size reached
      if (this.pendingEvents.length >= this.config.batchSize) {
        await this.syncEvents();
      }
    }

    // Update aggregates
    this.updateAggregates(event);

    // Emit event
    this.emit('event:published', event);
  }

  /**
   * Query events from the store
   */
  async query(query: EventQuery): Promise<AgentEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const queryOptions: any = {};

    if (query.types && query.types.length > 0) {
      // For multiple types, we'll need to do client-side filtering
      queryOptions.type = query.types[0]; // Start with first type
    }

    if (query.sources && query.sources.length > 0) {
      queryOptions.source = query.sources[0]; // Start with first source
    }

    if (query.startTime) {
      queryOptions.startDate = query.startTime;
    }

    if (query.endTime) {
      queryOptions.endDate = query.endTime;
    }

    if (query.limit) {
      queryOptions.limit = query.limit;
    }

    if (query.offset) {
      queryOptions.offset = query.offset;
    }

    // Get events from database
    const events = await eventDatabase.getEvents(queryOptions);

    // Transform to agent events and apply additional filters
    return events
      .map(record => this.transformToAgentEvent(record))
      .filter(event => {
        // Apply additional type filtering
        if (query.types && query.types.length > 1) {
          if (!query.types.includes(event.type)) return false;
        }

        // Apply source filtering
        if (query.sources && query.sources.length > 1) {
          if (!query.sources.includes(event.source)) return false;
        }

        // Apply target filtering
        if (query.targets && query.targets.length > 0) {
          if (!event.target) return false;
          const targets = Array.isArray(event.target) ? event.target : [event.target];
          if (!targets.some(t => query.targets!.includes(t))) return false;
        }

        // Apply correlation ID filtering
        if (query.correlationIds && query.correlationIds.length > 0) {
          if (!event.correlationId) return false;
          if (!query.correlationIds.includes(event.correlationId)) return false;
        }

        return true;
      });
  }

  /**
   * Get event by ID
   */
  async getEvent(id: string): Promise<AgentEvent | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const record = await eventDatabase.getEvent(id);
    return record ? this.transformToAgentEvent(record) : null;
  }

  /**
   * Get event statistics
   */
  async getStats(options?: {
    groupBy?: 'type' | 'source' | 'hour' | 'day';
    startTime?: Date;
    endTime?: Date;
  }): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return eventDatabase.getEventStats({
      groupBy: options?.groupBy,
      startDate: options?.startTime,
      endDate: options?.endTime
    });
  }

  /**
   * Get event aggregates
   */
  getAggregates(filter?: {
    types?: AgentEventType[];
    minCount?: number;
  }): EventAggregate[] {
    let aggregates = Array.from(this.aggregateCache.values());

    if (filter) {
      if (filter.types) {
        aggregates = aggregates.filter(a =>
          filter.types!.includes(a.type as AgentEventType)
        );
      }

      if (filter.minCount) {
        aggregates = aggregates.filter(a => a.count >= filter.minCount!);
      }
    }

    return aggregates.sort((a, b) => b.count - a.count);
  }

  /**
   * Subscribe to real-time events
   */
  subscribe(
    subscriberId: string,
    types: AgentEventType[],
    handler: (event: AgentEvent) => void | Promise<void>,
    options?: {
      filter?: any;
      includeHistory?: boolean;
    }
  ): string {
    // Subscribe to event bus
    const subscriptionId = this.eventBus.subscribe(
      subscriberId,
      types,
      handler,
      { filter: options?.filter }
    );

    // Send historical events if requested
    if (options?.includeHistory) {
      this.sendHistoricalEvents(subscriberId, types, handler);
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    this.eventBus.unsubscribe(subscriptionId);
  }

  /**
   * Mark an event as processed
   */
  async markProcessed(eventId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await eventDatabase.markProcessed(eventId);
    this.emit('event:processed', eventId);
  }

  /**
   * Archive old events
   */
  async archiveEvents(olderThan: Date): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // In a real implementation, you might move events to an archive table
    // For now, we'll just delete old processed events
    const count = await eventDatabase.cleanup(olderThan);
    logger.info(`Archived ${count} events older than ${olderThan.toISOString()}`);

    return count;
  }

  /**
   * Set up event bus listeners
   */
  private setupEventBusListeners(): void {
    // Listen for all events published to the bus
    this.eventBus.on('event:processed', (event: AgentEvent) => {
      // Forward event to our listeners
      this.emit('event:delivered', event);
    });

    // Listen for errors
    this.eventBus.on('event:error', ({ event, error }) => {
      logger.error(`Event bus error for event ${event.id}:`, error);
      this.emit('event:error', { event, error });
    });
  }

  /**
   * Set up real-time synchronization with Supabase
   */
  private async setupRealtimeSync(): Promise<void> {
    const client = supabase.getClient();

    // Subscribe to changes in abc_events table
    this.realtimeChannel = client
      .channel('event_store_sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'abc_events'
        },
        async (payload) => {
          if (payload.new && 'id' in payload.new) {
            try {
              // Transform and emit the event if it's not from this instance
              const record = await eventDatabase.getEvent(payload.new.id);
              if (record) {
                const agentEvent = this.transformToAgentEvent(record);

                // Check if this event was published by another instance
                if (!this.pendingEvents.some(e => e.id === agentEvent.id)) {
                  // Publish to local event bus
                  await this.eventBus.publish(agentEvent);
                  this.emit('event:synced', agentEvent);
                }
              }
            } catch (error) {
              logger.error('Error syncing real-time event:', error);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('Real-time event sync active');
        }
      });
  }

  /**
   * Start the sync timer
   */
  private startSyncTimer(): void {
    this.syncTimer = setInterval(async () => {
      try {
        await this.syncEvents();
      } catch (error) {
        logger.error('Error in sync timer:', error);
      }
    }, this.config.syncInterval);
  }

  /**
   * Sync pending events to database
   */
  private async syncEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }

    const eventsToSync = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      // Save events in batches
      for (let i = 0; i < eventsToSync.length; i += this.config.batchSize) {
        const batch = eventsToSync.slice(i, i + this.config.batchSize);

        await Promise.all(
          batch.map(event => this.persistEvent(event))
        );
      }

      logger.debug(`Synced ${eventsToSync.length} events to database`);
      this.emit('events:synced', eventsToSync.length);
    } catch (error) {
      // Put failed events back in queue
      this.pendingEvents.unshift(...eventsToSync);
      logger.error('Failed to sync events:', error);
      throw error;
    }
  }

  /**
   * Persist a single event
   */
  private async persistEvent(event: AgentEvent): Promise<void> {
    const record: Omit<EventRecord, 'timestamp'> = {
      id: event.id,
      type: event.type,
      source: event.source,
      data: {
        ...event.data,
        target: event.target,
        correlationId: event.correlationId,
        priority: event.priority,
        sessionId: event.sessionId,
        ttl: event.ttl
      },
      processed: false
    };

    await eventDatabase.recordEvent(record);
  }

  /**
   * Transform database record to agent event
   */
  private transformToAgentEvent(record: EventRecord): AgentEvent {
    return {
      id: record.id,
      type: record.type as AgentEventType,
      source: record.source,
      timestamp: record.timestamp,
      data: record.data,
      target: record.data.target,
      correlationId: record.data.correlationId,
      priority: record.data.priority,
      sessionId: record.data.sessionId,
      ttl: record.data.ttl
    } as AgentEvent;
  }

  /**
   * Check if event should be persisted
   */
  private shouldPersist(event: AgentEvent): boolean {
    if (this.config.persistAll) {
      return true;
    }

    if (this.config.persistTypes.length > 0) {
      return this.config.persistTypes.includes(event.type);
    }

    return false;
  }

  /**
   * Update event aggregates
   */
  private updateAggregates(event: AgentEvent): void {
    const aggregate = this.aggregateCache.get(event.type) || {
      type: event.type,
      count: 0,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      sources: new Set<string>()
    };

    aggregate.count++;
    aggregate.lastSeen = event.timestamp;
    aggregate.sources.add(event.source);

    if (event.timestamp < aggregate.firstSeen) {
      aggregate.firstSeen = event.timestamp;
    }

    this.aggregateCache.set(event.type, aggregate);
  }

  /**
   * Send historical events to a new subscriber
   */
  private async sendHistoricalEvents(
    subscriberId: string,
    types: AgentEventType[],
    handler: (event: AgentEvent) => void | Promise<void>
  ): Promise<void> {
    try {
      const events = await this.query({
        types,
        limit: 100,
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      });

      for (const event of events.reverse()) {
        try {
          await handler(event);
        } catch (error) {
          logger.error(`Error sending historical event to ${subscriberId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error sending historical events:', error);
    }
  }

  /**
   * Clean up old events
   */
  private async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000
    );

    try {
      const count = await this.archiveEvents(cutoffDate);
      if (count > 0) {
        logger.info(`Cleaned up ${count} old events`);
      }
    } catch (error) {
      logger.error('Error cleaning up old events:', error);
    }
  }

  /**
   * Get event bus instance
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Shutdown the event store
   */
  async shutdown(): Promise<void> {
    // Stop sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Sync remaining events
    if (this.pendingEvents.length > 0) {
      await this.syncEvents();
    }

    // Unsubscribe from real-time
    if (this.realtimeChannel) {
      await this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    // Shutdown event bus
    await this.eventBus.shutdown();

    // Close event database
    await eventDatabase.close();

    this.isInitialized = false;
    logger.info('Event store shut down');
    this.emit('shutdown');
  }
}

// Export singleton instance
export const eventStore = new EventStore();