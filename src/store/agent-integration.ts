/**
 * Agent Integration - Helper class for integrating agents with the event store
 */

import { EventEmitter } from 'events';
import {
  eventStore,
  eventBus,
  AgentEventType,
  createAgentEvent,
  type AgentEvent,
  type BaseAgentEvent,
  type TaskAssignedEvent,
  type TaskProgressEvent,
  type TaskCompletedEvent,
  type MessageEvent,
  type RequestEvent,
  type CoordinationRequestEvent
} from './index.js';
import { logger } from '../utils/logger.js';

export interface AgentEventHandlers {
  onTaskAssigned?: (event: TaskAssignedEvent) => Promise<void>;
  onMessage?: (event: MessageEvent) => Promise<void>;
  onRequest?: (event: RequestEvent) => Promise<void>;
  onCoordinationRequest?: (event: CoordinationRequestEvent) => Promise<void>;
  onBroadcast?: (event: BaseAgentEvent) => Promise<void>;
  onSwarmEvent?: (event: BaseAgentEvent) => Promise<void>;
  onCustomEvent?: (event: AgentEvent) => Promise<void>;
}

export interface AgentIntegrationConfig {
  agentId: string;
  agentType: string;
  agentName?: string;
  capabilities?: string[];
  eventHandlers?: AgentEventHandlers;
  subscribeToTypes?: AgentEventType[];
  persistEvents?: boolean;
}

export class AgentEventIntegration extends EventEmitter {
  private config: AgentIntegrationConfig;
  private subscriptions: string[] = [];
  private isInitialized: boolean = false;

  constructor(config: AgentIntegrationConfig) {
    super();
    this.config = {
      ...config,
      agentName: config.agentName || `${config.agentType}-${config.agentId}`,
      capabilities: config.capabilities || [],
      persistEvents: config.persistEvents ?? true
    };
  }

  /**
   * Initialize the agent integration
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize event store if needed
    await eventStore.initialize();

    // Set up subscriptions
    this.setupSubscriptions();

    // Announce agent spawned
    await this.announceSpawned();

    this.isInitialized = true;
    logger.info(`Agent ${this.config.agentId} event integration initialized`);
  }

  /**
   * Set up event subscriptions
   */
  private setupSubscriptions(): void {
    const handlers = this.config.eventHandlers || {};
    const additionalTypes = this.config.subscribeToTypes || [];

    // Task events
    if (handlers.onTaskAssigned) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        [AgentEventType.TASK_ASSIGNED],
        async (event) => {
          try {
            await handlers.onTaskAssigned!(event as TaskAssignedEvent);
          } catch (error) {
            logger.error('Error handling task assignment:', error);
            await this.publishTaskFailed(event as TaskAssignedEvent, error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Message events
    if (handlers.onMessage) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        [AgentEventType.MESSAGE_SENT],
        async (event) => {
          try {
            await handlers.onMessage!(event as MessageEvent);
          } catch (error) {
            logger.error('Error handling message:', error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Request events
    if (handlers.onRequest) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        [AgentEventType.REQUEST],
        async (event) => {
          try {
            await handlers.onRequest!(event as RequestEvent);
          } catch (error) {
            logger.error('Error handling request:', error);
            await this.respondWithError(event as RequestEvent, error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Coordination events
    if (handlers.onCoordinationRequest) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        [AgentEventType.COORDINATION_REQUEST],
        async (event) => {
          try {
            await handlers.onCoordinationRequest!(event as CoordinationRequestEvent);
          } catch (error) {
            logger.error('Error handling coordination request:', error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Broadcast events
    if (handlers.onBroadcast) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        [AgentEventType.BROADCAST],
        async (event) => {
          try {
            await handlers.onBroadcast!(event);
          } catch (error) {
            logger.error('Error handling broadcast:', error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Swarm events
    if (handlers.onSwarmEvent) {
      const swarmTypes = [
        AgentEventType.SWARM_FORMED,
        AgentEventType.SWARM_JOINED,
        AgentEventType.SWARM_LEFT,
        AgentEventType.SWARM_DISBANDED,
        AgentEventType.SWARM_TASK_ASSIGNED,
        AgentEventType.SWARM_CONSENSUS_REQUEST,
        AgentEventType.SWARM_CONSENSUS_REACHED
      ];

      const sub = eventBus.subscribe(
        this.config.agentId,
        swarmTypes,
        async (event) => {
          try {
            await handlers.onSwarmEvent!(event);
          } catch (error) {
            logger.error('Error handling swarm event:', error);
          }
        }
      );
      this.subscriptions.push(sub);
    }

    // Additional custom event types
    if (additionalTypes.length > 0) {
      const sub = eventBus.subscribe(
        this.config.agentId,
        additionalTypes,
        async (event) => {
          try {
            if (handlers.onCustomEvent) {
              await handlers.onCustomEvent(event);
            }
            this.emit('event:custom', event);
          } catch (error) {
            logger.error('Error handling custom event:', error);
          }
        }
      );
      this.subscriptions.push(sub);
    }
  }

  /**
   * Announce agent spawned
   */
  async announceSpawned(): Promise<void> {
    await this.publish(
      AgentEventType.AGENT_SPAWNED,
      {
        agentId: this.config.agentId,
        agentType: this.config.agentType,
        agentName: this.config.agentName!,
        capabilities: this.config.capabilities!
      }
    );
  }

  /**
   * Announce agent ready
   */
  async announceReady(availableCapacity: number = 100, currentTasks: number = 0): Promise<void> {
    await this.publish(
      AgentEventType.AGENT_READY,
      {
        agentId: this.config.agentId,
        availableCapacity,
        currentTasks
      }
    );
  }

  /**
   * Announce agent busy
   */
  async announceBusy(): Promise<void> {
    await this.publish(
      AgentEventType.AGENT_BUSY,
      {
        agentId: this.config.agentId
      }
    );
  }

  /**
   * Announce agent idle
   */
  async announceIdle(): Promise<void> {
    await this.publish(
      AgentEventType.AGENT_IDLE,
      {
        agentId: this.config.agentId
      }
    );
  }

  /**
   * Accept a task
   */
  async acceptTask(taskEvent: TaskAssignedEvent): Promise<void> {
    await this.publish(
      AgentEventType.TASK_ACCEPTED,
      { taskId: taskEvent.data.taskId },
      { correlationId: taskEvent.correlationId }
    );
  }

  /**
   * Reject a task
   */
  async rejectTask(taskEvent: TaskAssignedEvent, reason: string): Promise<void> {
    await this.publish(
      AgentEventType.TASK_REJECTED,
      {
        taskId: taskEvent.data.taskId,
        reason
      },
      { correlationId: taskEvent.correlationId }
    );
  }

  /**
   * Start a task
   */
  async startTask(taskId: string, correlationId?: string): Promise<void> {
    await this.publish(
      AgentEventType.TASK_STARTED,
      { taskId },
      { correlationId }
    );
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    progress: number,
    status: string,
    details?: any,
    correlationId?: string
  ): Promise<void> {
    await this.publish<TaskProgressEvent>(
      AgentEventType.TASK_PROGRESS,
      {
        taskId,
        progress,
        status,
        details
      },
      { correlationId }
    );
  }

  /**
   * Complete a task
   */
  async completeTask(
    taskId: string,
    result: any,
    duration: number,
    resourcesUsed?: {
      memory?: number;
      cpu?: number;
      apiCalls?: number;
    },
    correlationId?: string
  ): Promise<void> {
    await this.publish<TaskCompletedEvent>(
      AgentEventType.TASK_COMPLETED,
      {
        taskId,
        result,
        duration,
        resourcesUsed
      },
      { correlationId }
    );
  }

  /**
   * Fail a task
   */
  async failTask(
    taskId: string,
    error: string,
    errorCode?: string,
    retryable: boolean = false,
    attempts: number = 1,
    correlationId?: string
  ): Promise<void> {
    await this.publish(
      AgentEventType.TASK_FAILED,
      {
        taskId,
        error,
        errorCode,
        retryable,
        attempts
      },
      { correlationId }
    );
  }

  /**
   * Send a message
   */
  async sendMessage(
    target: string | string[],
    content: any,
    contentType: 'text' | 'json' | 'binary' | 'command' = 'json',
    replyTo?: string,
    correlationId?: string
  ): Promise<void> {
    await this.publish<MessageEvent>(
      AgentEventType.MESSAGE_SENT,
      {
        messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content,
        contentType,
        replyTo
      },
      { target, correlationId }
    );
  }

  /**
   * Make a request to another agent
   */
  async request(
    target: string,
    method: string,
    params?: any,
    timeout?: number
  ): Promise<any> {
    const response = await eventBus.request(
      this.config.agentId,
      target,
      method,
      params,
      timeout
    );

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Request failed');
    }

    return response.data.result;
  }

  /**
   * Respond to a request
   */
  async respond(
    requestEvent: RequestEvent,
    success: boolean,
    result?: any,
    error?: { code: string; message: string; details?: any }
  ): Promise<void> {
    await eventBus.respond(
      this.config.agentId,
      requestEvent,
      success,
      result,
      error
    );
  }

  /**
   * Broadcast a message
   */
  async broadcast(
    topic: string,
    content: any,
    scope: 'global' | 'swarm' | 'type' | 'custom' = 'global',
    filter?: {
      agentTypes?: string[];
      capabilities?: string[];
      tags?: string[];
    }
  ): Promise<void> {
    await eventBus.broadcast(
      this.config.agentId,
      topic,
      content,
      scope,
      filter
    );
  }

  /**
   * Share memory with other agents
   */
  async shareMemory(
    memoryKey: string,
    value: any,
    accessLevel: 'read' | 'write' | 'admin' = 'read',
    expiresAt?: Date,
    tags?: string[]
  ): Promise<void> {
    await this.publish(
      AgentEventType.MEMORY_SHARED,
      {
        memoryKey,
        value,
        accessLevel,
        expiresAt,
        tags
      }
    );
  }

  /**
   * Generic publish method
   */
  async publish<T extends BaseAgentEvent = BaseAgentEvent>(
    type: AgentEventType,
    data: any,
    options?: {
      target?: string | string[];
      correlationId?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      ttl?: number;
    }
  ): Promise<void> {
    const event = createAgentEvent<T>(
      type as T['type'],
      this.config.agentId,
      data,
      options
    );

    await eventStore.publish(event);
  }

  /**
   * Query historical events
   */
  async queryEvents(query: {
    types?: AgentEventType[];
    sources?: string[];
    targets?: string[];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<AgentEvent[]> {
    return eventStore.query(query);
  }

  /**
   * Get event statistics
   */
  async getEventStats(): Promise<any> {
    return eventStore.getStats();
  }

  /**
   * Private helper to publish task failed event
   */
  private async publishTaskFailed(taskEvent: TaskAssignedEvent, error: any): Promise<void> {
    await this.failTask(
      taskEvent.data.taskId,
      error.message || 'Unknown error',
      error.code,
      true,
      1,
      taskEvent.correlationId
    );
  }

  /**
   * Private helper to respond with error
   */
  private async respondWithError(requestEvent: RequestEvent, error: any): Promise<void> {
    await this.respond(
      requestEvent,
      false,
      null,
      {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Unknown error',
        details: error.stack
      }
    );
  }

  /**
   * Shutdown the agent integration
   */
  async shutdown(reason: string = 'Shutdown requested', graceful: boolean = true): Promise<void> {
    // Unsubscribe from all events
    this.subscriptions.forEach(sub => eventBus.unsubscribe(sub));
    this.subscriptions = [];

    // Announce termination
    await this.publish(
      AgentEventType.AGENT_TERMINATED,
      {
        agentId: this.config.agentId,
        reason,
        graceful
      }
    );

    this.isInitialized = false;
    logger.info(`Agent ${this.config.agentId} event integration shut down`);
  }
}

// Export factory function for easier creation
export function createAgentIntegration(config: AgentIntegrationConfig): AgentEventIntegration {
  return new AgentEventIntegration(config);
}