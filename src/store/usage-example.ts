/**
 * Event Store Usage Example - Demonstrates inter-agent communication
 */

import {
  eventStore,
  eventBus,
  AgentEventType,
  createAgentEvent,
  type AgentSpawnedEvent,
  type TaskAssignedEvent,
  type TaskProgressEvent,
  type TaskCompletedEvent,
  type MessageEvent,
  type SwarmFormedEvent,
  type RequestEvent
} from './index.js';
import { logger } from '../utils/logger.js';

// Example agent class that uses the event store
class ExampleAgent {
  private agentId: string;
  private agentType: string;
  private subscriptions: string[] = [];

  constructor(agentId: string, agentType: string) {
    this.agentId = agentId;
    this.agentType = agentType;
  }

  async initialize(): Promise<void> {
    // Subscribe to relevant events
    this.subscribeToEvents();

    // Announce agent spawned
    await this.announceSpawned();

    // Mark as ready
    await this.announceReady();
  }

  private subscribeToEvents(): void {
    // Subscribe to task assignments
    const taskSub = eventBus.subscribe(
      this.agentId,
      [AgentEventType.TASK_ASSIGNED, AgentEventType.TASK_REJECTED],
      async (event) => {
        if (event.type === AgentEventType.TASK_ASSIGNED) {
          await this.handleTaskAssignment(event);
        }
      }
    );
    this.subscriptions.push(taskSub);

    // Subscribe to messages
    const messageSub = eventBus.subscribe(
      this.agentId,
      [AgentEventType.MESSAGE_SENT],
      async (event) => {
        await this.handleMessage(event as MessageEvent);
      }
    );
    this.subscriptions.push(messageSub);

    // Subscribe to requests
    const requestSub = eventBus.subscribe(
      this.agentId,
      [AgentEventType.REQUEST],
      async (event) => {
        await this.handleRequest(event as RequestEvent);
      }
    );
    this.subscriptions.push(requestSub);

    // Subscribe to swarm events
    const swarmSub = eventBus.subscribe(
      this.agentId,
      [AgentEventType.SWARM_FORMED, AgentEventType.SWARM_TASK_ASSIGNED],
      async (event) => {
        logger.info(`${this.agentId} received swarm event:`, event.type);
      }
    );
    this.subscriptions.push(swarmSub);
  }

  private async announceSpawned(): Promise<void> {
    const event = createAgentEvent<AgentSpawnedEvent>(
      AgentEventType.AGENT_SPAWNED,
      this.agentId,
      {
        agentId: this.agentId,
        agentType: this.agentType,
        agentName: `${this.agentType}-${this.agentId}`,
        capabilities: ['task-processing', 'message-handling', 'coordination']
      }
    );

    await eventStore.publish(event);
  }

  private async announceReady(): Promise<void> {
    const event = createAgentEvent(
      AgentEventType.AGENT_READY,
      this.agentId,
      {
        agentId: this.agentId,
        availableCapacity: 100,
        currentTasks: 0
      }
    );

    await eventStore.publish(event);
  }

  private async handleTaskAssignment(event: TaskAssignedEvent): Promise<void> {
    logger.info(`${this.agentId} received task:`, event.data.description);

    // Simulate task processing
    const taskId = event.data.taskId;

    // Send task accepted
    await eventStore.publish(
      createAgentEvent(
        AgentEventType.TASK_ACCEPTED,
        this.agentId,
        { taskId },
        { correlationId: event.correlationId }
      )
    );

    // Start task
    await eventStore.publish(
      createAgentEvent(
        AgentEventType.TASK_STARTED,
        this.agentId,
        { taskId },
        { correlationId: event.correlationId }
      )
    );

    // Simulate progress updates
    for (let progress = 20; progress <= 100; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      await eventStore.publish(
        createAgentEvent<TaskProgressEvent>(
          AgentEventType.TASK_PROGRESS,
          this.agentId,
          {
            taskId,
            progress,
            status: `Processing... ${progress}%`,
            details: { step: progress / 20 }
          },
          { correlationId: event.correlationId }
        )
      );
    }

    // Complete task
    await eventStore.publish(
      createAgentEvent<TaskCompletedEvent>(
        AgentEventType.TASK_COMPLETED,
        this.agentId,
        {
          taskId,
          result: { success: true, output: `Task ${taskId} completed by ${this.agentId}` },
          duration: 5000,
          resourcesUsed: { memory: 100, cpu: 50, apiCalls: 3 }
        },
        { correlationId: event.correlationId }
      )
    );
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    logger.info(`${this.agentId} received message:`, event.data.content);

    // Send a reply
    await eventStore.publish(
      createAgentEvent<MessageEvent>(
        AgentEventType.MESSAGE_SENT,
        this.agentId,
        {
          messageId: `msg-${Date.now()}`,
          content: `Reply from ${this.agentId}: Message received`,
          contentType: 'text',
          replyTo: event.data.messageId
        },
        {
          target: event.source,
          correlationId: event.correlationId
        }
      )
    );
  }

  private async handleRequest(event: RequestEvent): Promise<void> {
    logger.info(`${this.agentId} received request:`, event.data.method);

    // Process request and send response
    try {
      let result: any;

      switch (event.data.method) {
        case 'getStatus':
          result = {
            agentId: this.agentId,
            status: 'active',
            uptime: Date.now()
          };
          break;

        case 'getCapabilities':
          result = {
            capabilities: ['task-processing', 'message-handling', 'coordination']
          };
          break;

        default:
          throw new Error(`Unknown method: ${event.data.method}`);
      }

      await eventBus.respond(this.agentId, event, true, result);
    } catch (error: any) {
      await eventBus.respond(
        this.agentId,
        event,
        false,
        null,
        {
          code: 'METHOD_ERROR',
          message: error.message
        }
      );
    }
  }

  async shutdown(): Promise<void> {
    // Unsubscribe from all events
    this.subscriptions.forEach(sub => eventBus.unsubscribe(sub));

    // Announce termination
    await eventStore.publish(
      createAgentEvent(
        AgentEventType.AGENT_TERMINATED,
        this.agentId,
        {
          agentId: this.agentId,
          reason: 'Shutdown requested',
          graceful: true
        }
      )
    );
  }
}

// Example coordinator that manages agents
class ExampleCoordinator {
  private coordinatorId = 'coordinator-main';
  private agents: Map<string, ExampleAgent> = new Map();

  async initialize(): Promise<void> {
    // Initialize event store
    await eventStore.initialize();

    // Subscribe to agent lifecycle events
    eventStore.subscribe(
      this.coordinatorId,
      [
        AgentEventType.AGENT_SPAWNED,
        AgentEventType.AGENT_READY,
        AgentEventType.AGENT_TERMINATED
      ],
      async (event) => {
        logger.info('Coordinator received:', event.type, event.data);
      }
    );

    // Subscribe to task completion events
    eventStore.subscribe(
      this.coordinatorId,
      [AgentEventType.TASK_COMPLETED, AgentEventType.TASK_FAILED],
      async (event) => {
        logger.info('Task update:', event.type, event.data);
      }
    );
  }

  async spawnAgent(type: string): Promise<string> {
    const agentId = `agent-${type}-${Date.now()}`;
    const agent = new ExampleAgent(agentId, type);

    await agent.initialize();
    this.agents.set(agentId, agent);

    return agentId;
  }

  async assignTask(agentId: string, description: string): Promise<void> {
    const event = createAgentEvent<TaskAssignedEvent>(
      AgentEventType.TASK_ASSIGNED,
      this.coordinatorId,
      {
        taskId: `task-${Date.now()}`,
        taskType: 'general',
        description,
        priority: 'normal'
      },
      { target: agentId }
    );

    await eventStore.publish(event);
  }

  async broadcastMessage(content: string): Promise<void> {
    await eventBus.broadcast(
      this.coordinatorId,
      'announcement',
      content,
      'global'
    );
  }

  async requestAgentStatus(agentId: string): Promise<any> {
    try {
      const response = await eventBus.request(
        this.coordinatorId,
        agentId,
        'getStatus',
        null,
        5000
      );

      return response.data.result;
    } catch (error) {
      logger.error('Failed to get agent status:', error);
      return null;
    }
  }

  async formSwarm(objective: string, agentIds: string[]): Promise<void> {
    const event = createAgentEvent<SwarmFormedEvent>(
      AgentEventType.SWARM_FORMED,
      this.coordinatorId,
      {
        swarmId: `swarm-${Date.now()}`,
        objective,
        strategy: 'collaborative',
        leader: agentIds[0],
        initialMembers: agentIds
      }
    );

    await eventStore.publish(event);
  }

  async getEventStats(): Promise<void> {
    const stats = await eventStore.getStats({ groupBy: 'type' });
    logger.info('Event statistics:', stats);

    const aggregates = eventStore.getAggregates();
    logger.info('Event aggregates:', aggregates);
  }

  async shutdown(): Promise<void> {
    // Shutdown all agents
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }

    // Shutdown event store
    await eventStore.shutdown();
  }
}

// Example usage
async function demonstrateEventStore(): Promise<void> {
  const coordinator = new ExampleCoordinator();

  try {
    // Initialize coordinator
    await coordinator.initialize();
    logger.info('Event store system initialized');

    // Spawn some agents
    const agent1 = await coordinator.spawnAgent('worker');
    const agent2 = await coordinator.spawnAgent('analyzer');
    logger.info('Agents spawned:', { agent1, agent2 });

    // Wait for agents to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Assign tasks
    await coordinator.assignTask(agent1, 'Process data batch #1');
    await coordinator.assignTask(agent2, 'Analyze system metrics');

    // Broadcast a message
    await coordinator.broadcastMessage('System update: New version available');

    // Request agent status
    const status = await coordinator.requestAgentStatus(agent1);
    logger.info('Agent status:', status);

    // Form a swarm
    await coordinator.formSwarm('Complete complex analysis', [agent1, agent2]);

    // Wait for tasks to complete
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Get event statistics
    await coordinator.getEventStats();

    // Query recent events
    const recentEvents = await eventStore.query({
      types: [AgentEventType.TASK_COMPLETED],
      limit: 10
    });
    logger.info('Recent completed tasks:', recentEvents.length);

    // Get event bus stats
    const busStats = eventBus.getStats();
    logger.info('Event bus statistics:', busStats);

  } catch (error) {
    logger.error('Error in demonstration:', error);
  } finally {
    // Cleanup
    await coordinator.shutdown();
    logger.info('Event store system shut down');
  }
}

// Run the demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEventStore().catch(console.error);
}

export { ExampleAgent, ExampleCoordinator, demonstrateEventStore };