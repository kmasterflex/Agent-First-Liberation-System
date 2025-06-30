/**
 * Event Store Module - Exports for agent communication system
 */

export * from './agent-events.js';
export * from './event-bus.js';
export * from './event-store.js';
export * from './agent-integration.js';

// Re-export singleton instances for convenience
export { eventBus } from './event-bus.js';
export { eventStore } from './event-store.js';

// Re-export factory functions
export { createAgentIntegration } from './agent-integration.js';

// Re-export commonly used types
export type {
  // Event types
  AgentEvent,
  BaseAgentEvent,
  AgentSpawnedEvent,
  AgentReadyEvent,
  AgentTerminatedEvent,
  TaskAssignedEvent,
  TaskProgressEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  MessageEvent,
  BroadcastEvent,
  RequestEvent,
  ResponseEvent,
  CoordinationRequestEvent,
  CoordinationUpdateEvent,
  MemorySharedEvent,
  SwarmFormedEvent,
  SwarmConsensusRequestEvent,
  SwarmConsensusReachedEvent
} from './agent-events.js';

export type {
  // Event bus types
  EventSubscription,
  EventFilter,
  EventHandler,
  EventBusStats
} from './event-bus.js';

export type {
  // Event store types
  EventStoreConfig,
  EventQuery,
  EventAggregate
} from './event-store.js';

export type {
  // Agent integration types
  AgentEventHandlers,
  AgentIntegrationConfig
} from './agent-integration.js';