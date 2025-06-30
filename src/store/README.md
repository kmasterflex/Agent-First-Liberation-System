# Event Store System

The Event Store system provides a comprehensive solution for inter-agent communication with Supabase integration for persistence and real-time synchronization.

## Overview

The system consists of three main components:

1. **Event Store** (`event-store.ts`) - Central management with Supabase persistence
2. **Event Bus** (`event-bus.ts`) - Real-time event distribution
3. **Agent Events** (`agent-events.ts`) - Strongly-typed event definitions

## Features

- 🚀 Real-time event delivery
- 💾 Persistent event storage with Supabase
- 🔄 Automatic synchronization across instances
- 📊 Event aggregation and statistics
- 🔍 Historical event queries
- 🎯 Targeted and broadcast messaging
- 🤝 Request/response pattern support
- 👥 Swarm coordination events
- 🧠 Memory sharing capabilities

## Quick Start

### Basic Agent Integration

```typescript
import { createAgentIntegration } from './agent-integration.js';

// Create agent integration
const agent = createAgentIntegration({
  agentId: 'agent-123',
  agentType: 'worker',
  capabilities: ['task-processing', 'data-analysis'],
  eventHandlers: {
    onTaskAssigned: async (event) => {
      console.log('Received task:', event.data.description);
      
      // Accept the task
      await agent.acceptTask(event);
      
      // Start processing
      await agent.startTask(event.data.taskId);
      
      // Update progress
      for (let i = 0; i <= 100; i += 20) {
        await agent.updateTaskProgress(
          event.data.taskId,
          i,
          `Processing... ${i}%`
        );
      }
      
      // Complete task
      await agent.completeTask(
        event.data.taskId,
        { result: 'Task completed successfully' },
        5000
      );
    },
    
    onMessage: async (event) => {
      console.log('Received message:', event.data.content);
      
      // Reply to message
      await agent.sendMessage(
        event.source,
        'Message received and processed',
        'text'
      );
    }
  }
});

// Initialize agent
await agent.initialize();

// Announce ready
await agent.announceReady();
```

### Direct Event Store Usage

```typescript
import { eventStore, AgentEventType, createAgentEvent } from './index.js';

// Initialize event store
await eventStore.initialize();

// Publish an event
const event = createAgentEvent(
  AgentEventType.TASK_ASSIGNED,
  'coordinator',
  {
    taskId: 'task-001',
    taskType: 'analysis',
    description: 'Analyze system performance',
    priority: 'high'
  },
  { target: 'agent-123' }
);

await eventStore.publish(event);

// Query events
const recentTasks = await eventStore.query({
  types: [AgentEventType.TASK_COMPLETED],
  startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
  limit: 10
});

// Get statistics
const stats = await eventStore.getStats({
  groupBy: 'type',
  startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last week
});
```

## Event Types

### Lifecycle Events
- `AGENT_SPAWNED` - Agent created
- `AGENT_READY` - Agent ready for work
- `AGENT_BUSY` - Agent busy
- `AGENT_IDLE` - Agent idle
- `AGENT_TERMINATED` - Agent shutting down

### Task Events
- `TASK_ASSIGNED` - Task assigned to agent
- `TASK_ACCEPTED` - Agent accepted task
- `TASK_REJECTED` - Agent rejected task
- `TASK_STARTED` - Task processing started
- `TASK_PROGRESS` - Task progress update
- `TASK_COMPLETED` - Task completed successfully
- `TASK_FAILED` - Task failed

### Communication Events
- `MESSAGE_SENT` - Direct message sent
- `MESSAGE_RECEIVED` - Message received
- `BROADCAST` - Broadcast message
- `REQUEST` - Request sent
- `RESPONSE` - Response to request

### Coordination Events
- `COORDINATION_REQUEST` - Request for coordination
- `COORDINATION_ACCEPTED` - Coordination accepted
- `COORDINATION_REJECTED` - Coordination rejected
- `COORDINATION_UPDATE` - Coordination status update
- `COORDINATION_COMPLETE` - Coordination completed

### Memory Events
- `MEMORY_STORED` - Memory stored
- `MEMORY_RETRIEVED` - Memory retrieved
- `MEMORY_SHARED` - Memory shared with agents
- `MEMORY_DELETED` - Memory deleted

### Swarm Events
- `SWARM_FORMED` - Swarm created
- `SWARM_JOINED` - Agent joined swarm
- `SWARM_LEFT` - Agent left swarm
- `SWARM_DISBANDED` - Swarm disbanded
- `SWARM_TASK_ASSIGNED` - Task assigned to swarm
- `SWARM_CONSENSUS_REQUEST` - Consensus requested
- `SWARM_CONSENSUS_REACHED` - Consensus reached

## Advanced Usage

### Request/Response Pattern

```typescript
// Make a request
try {
  const status = await agent.request(
    'target-agent',
    'getStatus',
    { detailed: true },
    5000 // 5 second timeout
  );
  console.log('Agent status:', status);
} catch (error) {
  console.error('Request failed:', error);
}

// Handle requests
const agent = createAgentIntegration({
  agentId: 'target-agent',
  agentType: 'service',
  eventHandlers: {
    onRequest: async (event) => {
      if (event.data.method === 'getStatus') {
        await agent.respond(event, true, {
          status: 'active',
          uptime: 12345,
          load: 0.5
        });
      }
    }
  }
});
```

### Broadcasting

```typescript
// Broadcast to all agents
await agent.broadcast(
  'system-update',
  { version: '2.0', features: ['new-feature'] },
  'global'
);

// Broadcast to specific agent types
await agent.broadcast(
  'task-available',
  { taskId: 'task-123', requirements: ['gpu'] },
  'type',
  { agentTypes: ['worker', 'analyzer'] }
);
```

### Memory Sharing

```typescript
// Share memory with other agents
await agent.shareMemory(
  'shared-config',
  { apiUrl: 'https://api.example.com', timeout: 30000 },
  'read',
  new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
  ['config', 'api']
);
```

### Event Filtering and Subscriptions

```typescript
import { eventBus, AgentEventType } from './index.js';

// Subscribe with filters
const subscription = eventBus.subscribe(
  'my-agent',
  [AgentEventType.TASK_ASSIGNED],
  async (event) => {
    console.log('High priority task:', event);
  },
  {
    filter: {
      priority: ['high', 'critical']
    }
  }
);

// Unsubscribe later
eventBus.unsubscribe(subscription);
```

### Historical Event Queries

```typescript
// Query events with multiple criteria
const events = await eventStore.query({
  types: [
    AgentEventType.TASK_COMPLETED,
    AgentEventType.TASK_FAILED
  ],
  sources: ['worker-1', 'worker-2'],
  startTime: new Date('2023-01-01'),
  endTime: new Date(),
  limit: 100
});

// Get aggregated statistics
const aggregates = eventStore.getAggregates({
  types: [AgentEventType.TASK_COMPLETED],
  minCount: 10
});
```

## Configuration

### Event Store Configuration

```typescript
const eventStore = new EventStore({
  persistAll: true,                    // Persist all events
  persistTypes: [                      // Or only specific types
    AgentEventType.TASK_COMPLETED,
    AgentEventType.TASK_FAILED
  ],
  enableRealtime: true,                // Enable real-time sync
  retentionDays: 30,                   // Keep events for 30 days
  batchSize: 100,                      // Batch size for DB writes
  syncInterval: 5000                   // Sync every 5 seconds
});
```

### Environment Variables

```bash
# Required for Supabase integration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Best Practices

1. **Always initialize agents** before publishing events
2. **Use correlation IDs** to track related events
3. **Handle errors gracefully** in event handlers
4. **Set appropriate TTLs** for time-sensitive events
5. **Use batching** for high-volume event publishing
6. **Monitor event statistics** for performance insights
7. **Clean up subscriptions** when agents shut down
8. **Use typed events** for better type safety

## Performance Tips

- Use event filtering to reduce unnecessary processing
- Batch event queries when possible
- Set retention policies to manage database size
- Use appropriate indexes on Supabase tables
- Monitor event bus statistics for bottlenecks

## Troubleshooting

### Events not being delivered
- Check agent subscriptions are active
- Verify event types match subscriptions
- Check target agent IDs are correct
- Review event bus statistics

### Database connection issues
- Verify Supabase credentials
- Check network connectivity
- Review Supabase rate limits
- Monitor error logs

### Memory issues with high event volume
- Adjust batch sizes
- Reduce event history retention
- Use event filtering more aggressively
- Consider archiving old events