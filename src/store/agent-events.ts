/**
 * Agent Event Types - Defines all event types for inter-agent communication
 */

export enum AgentEventType {
  // Lifecycle Events
  AGENT_SPAWNED = 'agent:spawned',
  AGENT_READY = 'agent:ready',
  AGENT_BUSY = 'agent:busy',
  AGENT_IDLE = 'agent:idle',
  AGENT_TERMINATED = 'agent:terminated',

  // Task Events
  TASK_ASSIGNED = 'task:assigned',
  TASK_ACCEPTED = 'task:accepted',
  TASK_REJECTED = 'task:rejected',
  TASK_STARTED = 'task:started',
  TASK_PROGRESS = 'task:progress',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',

  // Communication Events
  MESSAGE_SENT = 'message:sent',
  MESSAGE_RECEIVED = 'message:received',
  BROADCAST = 'broadcast',
  REQUEST = 'request',
  RESPONSE = 'response',

  // Coordination Events
  COORDINATION_REQUEST = 'coordination:request',
  COORDINATION_ACCEPTED = 'coordination:accepted',
  COORDINATION_REJECTED = 'coordination:rejected',
  COORDINATION_UPDATE = 'coordination:update',
  COORDINATION_COMPLETE = 'coordination:complete',

  // Memory Events
  MEMORY_STORED = 'memory:stored',
  MEMORY_RETRIEVED = 'memory:retrieved',
  MEMORY_SHARED = 'memory:shared',
  MEMORY_DELETED = 'memory:deleted',

  // System Events
  SYSTEM_ALERT = 'system:alert',
  SYSTEM_ERROR = 'system:error',
  SYSTEM_WARNING = 'system:warning',
  SYSTEM_INFO = 'system:info',

  // Swarm Events
  SWARM_FORMED = 'swarm:formed',
  SWARM_JOINED = 'swarm:joined',
  SWARM_LEFT = 'swarm:left',
  SWARM_DISBANDED = 'swarm:disbanded',
  SWARM_TASK_ASSIGNED = 'swarm:task:assigned',
  SWARM_CONSENSUS_REQUEST = 'swarm:consensus:request',
  SWARM_CONSENSUS_REACHED = 'swarm:consensus:reached'
}

export interface BaseAgentEvent {
  id: string;
  type: AgentEventType;
  source: string; // Agent ID that generated the event
  target?: string | string[]; // Optional target agent(s)
  timestamp: Date;
  correlationId?: string; // For tracking related events
  sessionId?: string; // For grouping events by session
  priority?: 'low' | 'normal' | 'high' | 'critical';
  ttl?: number; // Time to live in milliseconds
}

// Lifecycle Events
export interface AgentSpawnedEvent extends BaseAgentEvent {
  type: AgentEventType.AGENT_SPAWNED;
  data: {
    agentId: string;
    agentType: string;
    agentName: string;
    capabilities: string[];
    parentId?: string; // If spawned by another agent
  };
}

export interface AgentReadyEvent extends BaseAgentEvent {
  type: AgentEventType.AGENT_READY;
  data: {
    agentId: string;
    availableCapacity: number;
    currentTasks: number;
  };
}

export interface AgentTerminatedEvent extends BaseAgentEvent {
  type: AgentEventType.AGENT_TERMINATED;
  data: {
    agentId: string;
    reason: string;
    graceful: boolean;
  };
}

// Task Events
export interface TaskAssignedEvent extends BaseAgentEvent {
  type: AgentEventType.TASK_ASSIGNED;
  data: {
    taskId: string;
    taskType: string;
    description: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    deadline?: Date;
    dependencies?: string[];
    estimatedDuration?: number;
  };
}

export interface TaskProgressEvent extends BaseAgentEvent {
  type: AgentEventType.TASK_PROGRESS;
  data: {
    taskId: string;
    progress: number; // 0-100
    status: string;
    details?: any;
  };
}

export interface TaskCompletedEvent extends BaseAgentEvent {
  type: AgentEventType.TASK_COMPLETED;
  data: {
    taskId: string;
    result: any;
    duration: number;
    resourcesUsed?: {
      memory?: number;
      cpu?: number;
      apiCalls?: number;
    };
  };
}

export interface TaskFailedEvent extends BaseAgentEvent {
  type: AgentEventType.TASK_FAILED;
  data: {
    taskId: string;
    error: string;
    errorCode?: string;
    retryable: boolean;
    attempts: number;
  };
}

// Communication Events
export interface MessageEvent extends BaseAgentEvent {
  type: AgentEventType.MESSAGE_SENT | AgentEventType.MESSAGE_RECEIVED;
  data: {
    messageId: string;
    content: any;
    contentType: 'text' | 'json' | 'binary' | 'command';
    replyTo?: string; // ID of message being replied to
  };
}

export interface BroadcastEvent extends BaseAgentEvent {
  type: AgentEventType.BROADCAST;
  data: {
    topic: string;
    content: any;
    scope: 'global' | 'swarm' | 'type' | 'custom';
    filter?: {
      agentTypes?: string[];
      capabilities?: string[];
      tags?: string[];
    };
  };
}

export interface RequestEvent extends BaseAgentEvent {
  type: AgentEventType.REQUEST;
  data: {
    requestId: string;
    method: string;
    params?: any;
    timeout?: number;
  };
}

export interface ResponseEvent extends BaseAgentEvent {
  type: AgentEventType.RESPONSE;
  data: {
    requestId: string;
    success: boolean;
    result?: any;
    error?: {
      code: string;
      message: string;
      details?: any;
    };
  };
}

// Coordination Events
export interface CoordinationRequestEvent extends BaseAgentEvent {
  type: AgentEventType.COORDINATION_REQUEST;
  data: {
    coordinationId: string;
    objective: string;
    requiredCapabilities: string[];
    minAgents: number;
    maxAgents: number;
    strategy: 'sequential' | 'parallel' | 'hierarchical' | 'consensus';
  };
}

export interface CoordinationUpdateEvent extends BaseAgentEvent {
  type: AgentEventType.COORDINATION_UPDATE;
  data: {
    coordinationId: string;
    status: 'forming' | 'active' | 'paused' | 'completing' | 'completed';
    participants: string[];
    progress?: number;
    metrics?: any;
  };
}

// Memory Events
export interface MemorySharedEvent extends BaseAgentEvent {
  type: AgentEventType.MEMORY_SHARED;
  data: {
    memoryKey: string;
    value: any;
    accessLevel: 'read' | 'write' | 'admin';
    expiresAt?: Date;
    tags?: string[];
  };
}

// Swarm Events
export interface SwarmFormedEvent extends BaseAgentEvent {
  type: AgentEventType.SWARM_FORMED;
  data: {
    swarmId: string;
    objective: string;
    strategy: string;
    leader?: string;
    initialMembers: string[];
  };
}

export interface SwarmConsensusRequestEvent extends BaseAgentEvent {
  type: AgentEventType.SWARM_CONSENSUS_REQUEST;
  data: {
    consensusId: string;
    swarmId: string;
    proposal: any;
    votingStrategy: 'majority' | 'unanimous' | 'weighted' | 'quorum';
    timeout: number;
    quorumSize?: number;
  };
}

export interface SwarmConsensusReachedEvent extends BaseAgentEvent {
  type: AgentEventType.SWARM_CONSENSUS_REACHED;
  data: {
    consensusId: string;
    swarmId: string;
    decision: any;
    votes: {
      agentId: string;
      vote: 'approve' | 'reject' | 'abstain';
      weight?: number;
      reason?: string;
    }[];
    consensus: boolean;
  };
}

// Type guards
export function isAgentEvent(event: any): event is BaseAgentEvent {
  return event && typeof event.id === 'string' &&
         event.type in AgentEventType &&
         typeof event.source === 'string' &&
         event.timestamp instanceof Date;
}

export function isTaskEvent(event: BaseAgentEvent): boolean {
  return event.type.startsWith('task:');
}

export function isSwarmEvent(event: BaseAgentEvent): boolean {
  return event.type.startsWith('swarm:');
}

export function isSystemEvent(event: BaseAgentEvent): boolean {
  return event.type.startsWith('system:');
}

// Event factory functions
export function createAgentEvent<T extends BaseAgentEvent>(
  type: T['type'],
  source: string,
  data: T['data'],
  options?: Partial<Omit<T, 'type' | 'source' | 'data' | 'timestamp' | 'id'>>
): T {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    source,
    data,
    timestamp: new Date(),
    ...options
  } as T;
}

// Union type for all specific event types
export type AgentEvent =
  | AgentSpawnedEvent
  | AgentReadyEvent
  | AgentTerminatedEvent
  | TaskAssignedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | MessageEvent
  | BroadcastEvent
  | RequestEvent
  | ResponseEvent
  | CoordinationRequestEvent
  | CoordinationUpdateEvent
  | MemorySharedEvent
  | SwarmFormedEvent
  | SwarmConsensusRequestEvent
  | SwarmConsensusReachedEvent;