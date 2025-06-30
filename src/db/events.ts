/**
 * Event Database - Manages persistent storage of events using Supabase
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { supabase, type AbcEvent } from './supabase.js';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface EventRecord {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  processed: boolean;
  userId?: string;
}

export interface QueryOptions {
  type?: string;
  source?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  processed?: boolean;
  userId?: string;
}

export class EventDatabase extends EventEmitter {
  private isInitialized: boolean = false;
  private realtimeChannel: RealtimeChannel | null = null;
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize Supabase client and test connection
      const connectionOk = await supabase.testConnection();
      if (!connectionOk) {
        throw new Error('Failed to connect to Supabase');
      }

      // Set up real-time subscriptions for all events
      this.setupRealtimeSubscriptions();

      this.isInitialized = true;
      logger.info('Event database initialized with Supabase');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize event database:', error);
      throw error;
    }
  }

  private setupRealtimeSubscriptions(): void {
    const client = supabase.getClient();

    // Subscribe to all changes on abc_events table
    this.realtimeChannel = client
      .channel('abc_events_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'abc_events' },
        (payload: RealtimePostgresChangesPayload<AbcEvent>) => {
          if (payload.new && 'id' in payload.new) {
            const event = this.transformDbEventToRecord(payload.new);
            this.emit('event:recorded', event);
            this.emit(`event:${event.type}`, event);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'abc_events' },
        (payload: RealtimePostgresChangesPayload<AbcEvent>) => {
          if (payload.new && 'id' in payload.new) {
            const event = this.transformDbEventToRecord(payload.new);
            const oldProcessed = payload.old && 'processed' in payload.old ? payload.old.processed : false;
            if (event.processed && !oldProcessed) {
              this.emit('event:processed', event.id);
            }
            this.emit('event:updated', event);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'abc_events' },
        (payload: RealtimePostgresChangesPayload<AbcEvent>) => {
          if (payload.old && 'id' in payload.old) {
            this.emit('event:deleted', payload.old.id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('Real-time subscriptions active');
        }
      });
  }

  private transformDbEventToRecord(dbEvent: AbcEvent): EventRecord {
    return {
      id: dbEvent.id,
      type: dbEvent.type,
      source: dbEvent.source,
      data: dbEvent.data,
      timestamp: new Date(dbEvent.timestamp),
      processed: dbEvent.processed,
      userId: dbEvent.user_id
    };
  }

  private transformRecordToDbEvent(record: Omit<EventRecord, 'timestamp'> & { timestamp?: Date }): Omit<AbcEvent, 'created_at'> {
    const timestamp = record.timestamp || new Date();
    return {
      id: record.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: record.type,
      source: record.source,
      data: record.data,
      timestamp: timestamp.toISOString(),
      processed: record.processed || false,
      user_id: record.userId
    };
  }

  async recordEvent(event: Omit<EventRecord, 'timestamp'>): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();
    const dbEvent = this.transformRecordToDbEvent(event);

    try {
      const { data, error } = await client
        .from('abc_events')
        .insert(dbEvent)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from insert');
      }

      return data.id;
    } catch (error) {
      logger.error('Failed to record event:', error);
      throw error;
    }
  }

  async getEvents(options: QueryOptions = {}): Promise<EventRecord[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();
    let query = client.from('abc_events').select('*');

    // Apply filters
    if (options.type) {
      query = query.eq('type', options.type);
    }

    if (options.source) {
      query = query.eq('source', options.source);
    }

    if (options.userId) {
      query = query.eq('user_id', options.userId);
    }

    if (options.processed !== undefined) {
      query = query.eq('processed', options.processed);
    }

    if (options.startDate) {
      query = query.gte('timestamp', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('timestamp', options.endDate.toISOString());
    }

    // Apply ordering and pagination
    query = query.order('timestamp', { ascending: false });

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    try {
      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map(this.transformDbEventToRecord);
    } catch (error) {
      logger.error('Failed to get events:', error);
      throw error;
    }
  }

  async getEvent(id: string): Promise<EventRecord | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { data, error } = await client
        .from('abc_events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      return data ? this.transformDbEventToRecord(data) : null;
    } catch (error) {
      logger.error('Failed to get event:', error);
      throw error;
    }
  }

  async markProcessed(id: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { error } = await client
        .from('abc_events')
        .update({ processed: true })
        .eq('id', id);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Failed to mark event as processed:', error);
      throw error;
    }
  }

  async deleteEvent(id: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { error } = await client
        .from('abc_events')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Failed to delete event:', error);
      throw error;
    }
  }

  async getEventStats(options: {
    groupBy?: 'type' | 'source' | 'day' | 'hour';
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    // Build base query
    let query = client.from('abc_events').select('*');

    // Apply date filters
    if (options.startDate) {
      query = query.gte('timestamp', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('timestamp', options.endDate.toISOString());
    }

    try {
      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Process grouping in memory (Supabase doesn't support dynamic grouping easily)
      const results = new Map<string, number>();

      switch (options.groupBy) {
        case 'type':
          data.forEach(event => {
            const key = event.type;
            results.set(key, (results.get(key) || 0) + 1);
          });
          break;

        case 'source':
          data.forEach(event => {
            const key = event.source;
            results.set(key, (results.get(key) || 0) + 1);
          });
          break;

        case 'day':
          data.forEach(event => {
            const date = new Date(event.timestamp);
            const key = date.toISOString().split('T')[0];
            results.set(key, (results.get(key) || 0) + 1);
          });
          break;

        case 'hour':
          data.forEach(event => {
            const date = new Date(event.timestamp);
            const key = date.getHours().toString().padStart(2, '0');
            results.set(key, (results.get(key) || 0) + 1);
          });
          break;

        default:
          // Return overall stats
          const timestamps = data.map(e => new Date(e.timestamp).getTime());
          return [{
            total_count: data.length,
            first_event: Math.min(...timestamps),
            last_event: Math.max(...timestamps)
          }];
      }

      // Convert map to array and sort by count
      return Array.from(results.entries())
        .map(([group_key, count]) => ({ group_key, count }))
        .sort((a, b) => b.count - a.count);
    } catch (error) {
      logger.error('Failed to get event stats:', error);
      throw error;
    }
  }

  async subscribe(subscriberId: string, eventType: string, filter?: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();
    const channelName = `${subscriberId}_${eventType}`;

    // Remove existing subscription if any
    if (this.subscriptions.has(channelName)) {
      await this.unsubscribe(subscriberId, eventType);
    }

    // Create new subscription channel
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'abc_events',
          filter: `type=eq.${eventType}`
        },
        (payload: RealtimePostgresChangesPayload<AbcEvent>) => {
          if (payload.new && 'id' in payload.new) {
            const event = this.transformDbEventToRecord(payload.new);

            // Apply additional filter if provided
            if (filter) {
              const matchesFilter = Object.entries(filter).every(([key, value]) => {
                return event.data[key] === value;
              });

              if (!matchesFilter) {
                return;
              }
            }

            this.emit(`subscription:${subscriberId}:${eventType}`, event);
          }
        }
      )
      .subscribe();

    this.subscriptions.set(channelName, channel);
    this.emit('subscription:created', { subscriberId, eventType, filter });
  }

  async unsubscribe(subscriberId: string, eventType?: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (eventType) {
      // Unsubscribe from specific event type
      const channelName = `${subscriberId}_${eventType}`;
      const channel = this.subscriptions.get(channelName);

      if (channel) {
        await channel.unsubscribe();
        this.subscriptions.delete(channelName);
        this.emit('subscription:removed', { subscriberId, eventType });
      }
    } else {
      // Unsubscribe from all event types for this subscriber
      const channelsToRemove: string[] = [];

      for (const [channelName, channel] of this.subscriptions.entries()) {
        if (channelName.startsWith(`${subscriberId}_`)) {
          await channel.unsubscribe();
          channelsToRemove.push(channelName);
        }
      }

      channelsToRemove.forEach(name => this.subscriptions.delete(name));
      this.emit('subscription:removed', { subscriberId });
    }
  }

  async getSubscriptions(subscriberId?: string): Promise<any[]> {
    const subscriptions: any[] = [];

    for (const [channelName] of this.subscriptions.entries()) {
      const [subId, eventType] = channelName.split('_');

      if (!subscriberId || subscriberId === subId) {
        subscriptions.push({
          subscriberId: subId,
          eventType: eventType,
          filter: null, // Filters are not persisted in this implementation
          createdAt: new Date()
        });
      }
    }

    return subscriptions;
  }

  async cleanup(olderThan: Date): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      // First, get count of events to be deleted
      const { count } = await client
        .from('abc_events')
        .select('*', { count: 'exact', head: true })
        .lt('timestamp', olderThan.toISOString())
        .eq('processed', true);

      if (!count) {
        return 0;
      }

      // Delete the events
      const { error } = await client
        .from('abc_events')
        .delete()
        .lt('timestamp', olderThan.toISOString())
        .eq('processed', true);

      if (error) {
        throw error;
      }

      logger.info(`Cleaned up ${count} old events`);
      return count;
    } catch (error) {
      logger.error('Failed to cleanup events:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // Unsubscribe from all real-time channels
    if (this.realtimeChannel) {
      await this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    // Unsubscribe from all custom subscriptions
    for (const [, channel] of this.subscriptions.entries()) {
      await channel.unsubscribe();
    }
    this.subscriptions.clear();

    this.isInitialized = false;
    this.emit('closed');
    logger.info('Event database connection closed');
  }

  async getStats(): Promise<{
    totalEvents: number;
    processedEvents: number;
    pendingEvents: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const [total, processed, pending] = await Promise.all([
        this.getEvents({ limit: 999999 }).then(events => events.length),
        this.getEvents({ processed: true, limit: 999999 }).then(events => events.length),
        this.getEvents({ processed: false, limit: 999999 }).then(events => events.length)
      ]);

      return {
        totalEvents: total,
        processedEvents: processed,
        pendingEvents: pending
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return {
        totalEvents: 0,
        processedEvents: 0,
        pendingEvents: 0
      };
    }
  }

  async ping(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      // Simple query to test connection
      const { error } = await client
        .from('abc_events')
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Database ping failed:', error);
      throw error;
    }
  }

  // Additional methods for user management
  async createUser(email: string, userData?: {
    username?: string;
    full_name?: string;
    avatar_url?: string;
    metadata?: any;
  }): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { data, error } = await client
        .from('users')
        .insert({
          email,
          ...userData
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from user insert');
      }

      return data.id;
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  async getUser(id: string): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Failed to get user:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const client = supabase.getClient();

    try {
      const { error } = await client
        .from('users')
        .update(updates)
        .eq('id', id);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Failed to update user:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const eventDatabase = new EventDatabase();