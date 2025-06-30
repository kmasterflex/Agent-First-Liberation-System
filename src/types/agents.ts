/**
 * Agent Type Definitions
 */

export type AgentRole = 'bureaucracy' | 'family' | 'community';

export interface AgentConfig {
  name?: string;
  description?: string;
  maxConcurrentTasks?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'query' | 'command' | 'event' | 'report' | 'proposal';
  content: unknown;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

export interface AgentInterface {
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly description: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  processMessage(message: AgentMessage): Promise<AgentResponse>;
  getStatus(): AgentStatus;
}

export interface AgentStatus {
  id: string;
  name: string;
  role: AgentRole;
  isActive: boolean;
  stats: AgentStats;
  metadata?: Record<string, unknown>;
  aiEnabled?: boolean;
  capabilities?: string[];
}

export interface AgentStats {
  uptime: number;
  messagesProcessed?: number;
  errorCount?: number;
  lastActivity?: Date;
  conversationLength?: number;
  insightsGenerated?: number;
  [key: string]: string | number | Date | boolean | undefined;
}

/**
 * Standard agent response structure
 */
export interface AgentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: Date;
  agentId: string;
  role: AgentRole;
}

/**
 * AI analysis result structure
 */
export interface AIAnalysisResult {
  analysis: string;
  confidence: number;
  recommendations: string[];
  metadata?: {
    reasoning?: string;
    sources?: string[];
    estimatedTime?: string;
    complexity?: 'simple' | 'moderate' | 'complex';
    [key: string]: unknown;
  };
}

/**
 * Task result structure
 */
export interface TaskResult {
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  progress?: number;
  error?: string;
  duration?: number;
  resources?: {
    memory?: number;
    cpu?: number;
    apiCalls?: number;
    [key: string]: number | undefined;
  };
}