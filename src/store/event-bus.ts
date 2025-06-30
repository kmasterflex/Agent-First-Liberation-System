/**
 * Event Bus - Manages real-time inter-agent communication
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import {
  AgentEvent,
  AgentEventType,
  RequestEvent,
  ResponseEvent,
  createAgentEvent
} from './agent-events.js';

export interface EventSubscription {
  id: string;
  subscriberId: string;
  eventTypes: AgentEventType[];
  filter?: EventFilter;
  handler: EventHandler;
  priority?: number;
  active: boolean;
  createdAt: Date;
}

export interface EventFilter {
  sources?: string[]; // Only events from these sources
  targets?: string[]; // Only events targeting these agents
  correlationIds?: string[]; // Only events with these correlation IDs
  tags?: string[]; // Only events with these tags
  priority?: ('low' | 'normal' | 'high' | 'critical')[];
}

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

export interface EventBusStats {
  totalEvents: number;
  eventsPerSecond: number;
  activeSubscriptions: number;
  queueSize: number;
  processingTime: {
    avg: number;
    min: number;
    max: number;
  };
}

interface PendingRequest {
  resolve: (response: ResponseEvent) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class EventBus extends EventEmitter {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventQueue: AgentEvent[] = [];
  private processing: boolean = false;
  private stats: EventBusStats;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number = 1000;
  private processingTimes: number[] = [];
  private lastEventTime: number = Date.now();

  constructor() {
    super();
    this.stats = {
      totalEvents: 0,
      eventsPerSecond: 0,
      activeSubscriptions: 0,
      queueSize: 0,
      processingTime: { avg: 0, min: 0, max: 0 }
    };

    // Start stats calculation interval
    setInterval(() => this.calculateStats(), 1000);
  }

  /**
   * Publish an event to the bus
   */
  async publish(event: AgentEvent): Promise<void> {
    // Validate event
    if (!this.validateEvent(event)) {
      throw new Error('Invalid event format');
    }

    // Add to queue
    this.eventQueue.push(event);
    this.stats.queueSize = this.eventQueue.length;

    // Add to history
    this.addToHistory(event);

    // Process queue if not already processing
    if (!this.processing) {
      await this.processQueue();
    }
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(
    subscriberId: string,
    eventTypes: AgentEventType[],
    handler: EventHandler,
    options?: {
      filter?: EventFilter;
      priority?: number;
    }
  ): string {
    const subscription: EventSubscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      subscriberId,
      eventTypes,
      handler,
      filter: options?.filter,
      priority: options?.priority || 0,
      active: true,
      createdAt: new Date()
    };

    this.subscriptions.set(subscription.id, subscription);
    this.stats.activeSubscriptions = this.subscriptions.size;

    logger.info(`Agent ${subscriberId} subscribed to events:`, eventTypes);

    // Emit subscription event
    this.emit('subscription:created', subscription);

    return subscription.id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
      this.stats.activeSubscriptions = this.subscriptions.size;
      logger.info(`Subscription ${subscriptionId} removed`);
      this.emit('subscription:removed', subscription);
    }
  }

  /**
   * Unsubscribe all subscriptions for an agent
   */
  unsubscribeAll(subscriberId: string): void {
    const toRemove: string[] = [];

    for (const [id, subscription] of this.subscriptions) {
      if (subscription.subscriberId === subscriberId) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => this.unsubscribe(id));
  }

  /**
   * Send a request and wait for response
   */
  async request(
    source: string,
    target: string,
    method: string,
    params?: any,
    timeout: number = 30000
  ): Promise<ResponseEvent> {
    const requestEvent = createAgentEvent<RequestEvent>(
      AgentEventType.REQUEST,
      source,
      {
        requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        method,
        params,
        timeout
      },
      { target }
    );

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestEvent.data.requestId);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestEvent.data.requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // Publish request
      this.publish(requestEvent).catch(reject);
    });
  }

  /**
   * Send a response to a request
   */
  async respond(
    source: string,
    requestEvent: RequestEvent,
    success: boolean,
    result?: any,
    error?: { code: string; message: string; details?: any }
  ): Promise<void> {
    const responseEvent = createAgentEvent<ResponseEvent>(
      AgentEventType.RESPONSE,
      source,
      {
        requestId: requestEvent.data.requestId,
        success,
        result,
        error
      },
      {
        target: requestEvent.source,
        correlationId: requestEvent.correlationId
      }
    );

    await this.publish(responseEvent);
  }

  /**
   * Broadcast an event to all agents or filtered subset
   */
  async broadcast(
    source: string,
    topic: string,
    content: any,
    scope: 'global' | 'swarm' | 'type' | 'custom' = 'global',
    filter?: {
      agentTypes?: string[];
      capabilities?: string[];
      tags?: string[];
    }
  ): Promise<void> {
    const broadcastEvent = createAgentEvent(
      AgentEventType.BROADCAST,
      source,
      {
        topic,
        content,
        scope,
        filter
      }
    );

    await this.publish(broadcastEvent);
  }

  /**
   * Get event history
   */
  getHistory(filter?: {
    source?: string;
    target?: string;
    types?: AgentEventType[];
    since?: Date;
    limit?: number;
  }): AgentEvent[] {
    let history = [...this.eventHistory];

    if (filter) {
      if (filter.source) {
        history = history.filter(e => e.source === filter.source);
      }

      if (filter.target) {
        history = history.filter(e =>
          e.target === filter.target ||
          (Array.isArray(e.target) && e.target.includes(filter.target))
        );
      }

      if (filter.types) {
        history = history.filter(e => filter.types!.includes(e.type));
      }

      if (filter.since) {
        history = history.filter(e => e.timestamp >= filter.since!);
      }

      if (filter.limit) {
        history = history.slice(0, filter.limit);
      }
    }

    return history;
  }

  /**
   * Get statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    logger.info('Event history cleared');
  }

  /**
   * Process event queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      const startTime = Date.now();

      try {
        await this.deliverEvent(event);

        // Track processing time
        const processingTime = Date.now() - startTime;
        this.processingTimes.push(processingTime);
        if (this.processingTimes.length > 100) {
          this.processingTimes.shift();
        }

        this.stats.totalEvents++;
        this.lastEventTime = Date.now();

        // Emit event processed
        this.emit('event:processed', event);
      } catch (error) {
        logger.error(`Error processing event ${event.id}:`, error);
        this.emit('event:error', { event, error });
      }
    }

    this.processing = false;
    this.stats.queueSize = this.eventQueue.length;
  }

  /**
   * Deliver event to subscribers
   */
  private async deliverEvent(event: AgentEvent): Promise<void> {
    // Handle response events for pending requests
    if (event.type === AgentEventType.RESPONSE) {
      const responseEvent = event;
      const pending = this.pendingRequests.get(responseEvent.data.requestId);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(responseEvent.data.requestId);
        pending.resolve(responseEvent);
      }
    }

    // Get matching subscriptions
    const matchingSubscriptions = this.getMatchingSubscriptions(event);

    // Sort by priority
    matchingSubscriptions.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Deliver to each subscriber
    const deliveryPromises = matchingSubscriptions.map(async subscription => {
      try {
        await subscription.handler(event);
      } catch (error) {
        logger.error(`Error in subscription handler ${subscription.id}:`, error);
        this.emit('subscription:error', { subscription, event, error });
      }
    });

    await Promise.all(deliveryPromises);
  }

  /**
   * Get subscriptions that match an event
   */
  private getMatchingSubscriptions(event: AgentEvent): EventSubscription[] {
    const matching: EventSubscription[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;

      // Check if event type matches
      if (!subscription.eventTypes.includes(event.type)) continue;

      // Apply filters
      if (subscription.filter) {
        if (!this.matchesFilter(event, subscription.filter)) continue;
      }

      // Check if targeted to this subscriber
      if (event.target) {
        if (Array.isArray(event.target)) {
          if (!event.target.includes(subscription.subscriberId)) continue;
        } else {
          if (event.target !== subscription.subscriberId) continue;
        }
      }

      matching.push(subscription);
    }

    return matching;
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: AgentEvent, filter: EventFilter): boolean {
    if (filter.sources && !filter.sources.includes(event.source)) {
      return false;
    }

    if (filter.targets && event.target) {
      const targets = Array.isArray(event.target) ? event.target : [event.target];
      if (!targets.some(t => filter.targets!.includes(t))) {
        return false;
      }
    }

    if (filter.correlationIds && event.correlationId) {
      if (!filter.correlationIds.includes(event.correlationId)) {
        return false;
      }
    }

    if (filter.priority && event.priority) {
      if (!filter.priority.includes(event.priority)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate event format
   */
  private validateEvent(event: any): boolean {
    return !!(
      event?.id &&
      event.type &&
      event.source &&
      event.timestamp &&
      event.data
    );
  }

  /**
   * Add event to history
   */
  private addToHistory(event: AgentEvent): void {
    this.eventHistory.unshift(event);

    // Maintain max history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.pop();
    }
  }

  /**
   * Calculate statistics
   */
  private calculateStats(): void {
    // Events per second
    const now = Date.now();
    const timeDiff = (now - this.lastEventTime) / 1000;
    this.stats.eventsPerSecond = timeDiff > 0 ? 1 / timeDiff : 0;

    // Processing time stats
    if (this.processingTimes.length > 0) {
      const sum = this.processingTimes.reduce((a, b) => a + b, 0);
      this.stats.processingTime.avg = sum / this.processingTimes.length;
      this.stats.processingTime.min = Math.min(...this.processingTimes);
      this.stats.processingTime.max = Math.max(...this.processingTimes);
    }
  }

  /**
   * Pause event processing
   */
  pause(): void {
    this.processing = true;
    logger.info('Event bus paused');
    this.emit('paused');
  }

  /**
   * Resume event processing
   */
  async resume(): Promise<void> {
    this.processing = false;
    logger.info('Event bus resumed');
    this.emit('resumed');
    await this.processQueue();
  }

  /**
   * Shutdown the event bus
   */
  async shutdown(): Promise<void> {
    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Event bus shutting down'));
    }
    this.pendingRequests.clear();

    // Clear subscriptions
    this.subscriptions.clear();

    // Clear queue
    this.eventQueue = [];

    // Stop processing
    this.processing = true;

    logger.info('Event bus shut down');
    this.emit('shutdown');
  }
}

// Export singleton instance
export const eventBus = new EventBus();