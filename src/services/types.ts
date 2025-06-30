/**
 * Shared types for AI Services
 * Common type definitions used across Claude, Memory, and Context services
 */

/**
 * Base message format for conversations
 */
export interface BaseMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Agent identification
 */
export interface AgentInfo {
  id: string;
  name?: string;
  type?: 'researcher' | 'coder' | 'analyst' | 'coordinator' | 'custom';
  capabilities?: string[];
}

/**
 * Common metadata structure
 */
export interface CommonMetadata {
  agentId?: string;
  agentInfo?: AgentInfo;
  importance?: number; // 0-1 scale
  tags?: string[];
  timestamp?: Date;
  source?: string;
  [key: string]: any; // Allow extension
}

/**
 * Token usage information
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Service event types
 */
export enum ServiceEventType {
  // Claude events
  CLAUDE_CHUNK = 'chunk',
  CLAUDE_COMPLETE = 'complete',
  CLAUDE_ERROR = 'error',
  CLAUDE_CONVERSATION_UPDATE = 'conversation-update',

  // Memory events
  MEMORY_INITIALIZED = 'initialized',
  MEMORY_STORED = 'stored',
  MEMORY_PROMOTED = 'promoted',
  MEMORY_EVICTED = 'evicted',
  MEMORY_EXPIRED = 'expired',
  MEMORY_DELETED = 'deleted',
  MEMORY_CLEARED = 'cleared',
  MEMORY_EXPORTED = 'exported',
  MEMORY_IMPORTED = 'imported',
  MEMORY_IMPORTANCE_UPDATED = 'importance-updated',
  MEMORY_TAGS_UPDATED = 'tags-updated',

  // Context events
  CONTEXT_MESSAGE_ADDED = 'message-added',
  CONTEXT_WINDOW_SLID = 'window-slid',
  CONTEXT_SUMMARY_CREATED = 'summary-created',
  CONTEXT_CLEARED = 'context-cleared',
  CONTEXT_IMPORTANCE_UPDATED = 'importance-updated',
  CONTEXT_IMPORTED = 'context-imported',
}

/**
 * Service status information
 */
export interface ServiceStatus {
  service: 'claude' | 'memory' | 'context';
  status: 'active' | 'inactive' | 'error';
  lastActivity?: Date;
  errorMessage?: string;
  stats?: Record<string, any>;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T> {
  successful: T[];
  failed: Array<{
    item: any;
    error: Error;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

/**
 * Search query interface
 */
export interface SearchQuery {
  query?: string;
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Time range specification
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Priority levels for operations
 */
export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Service configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Export format options
 */
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  MARKDOWN = 'markdown',
  YAML = 'yaml',
}

/**
 * Service metrics
 */
export interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  uptime: number;
  lastError?: {
    timestamp: Date;
    message: string;
  };
}

/**
 * Callback function types
 */
export type ErrorCallback = (error: Error) => void;
export type SuccessCallback<T = any> = (result: T) => void;
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Service initialization options
 */
export interface ServiceInitOptions {
  debug?: boolean;
  logger?: (level: string, message: string, data?: any) => void;
  errorHandler?: ErrorCallback;
  metricsEnabled?: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs?: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Service health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  services: {
    [serviceName: string]: {
      status: 'ok' | 'degraded' | 'down';
      latency?: number;
      error?: string;
    };
  };
  timestamp: Date;
}

/**
 * Type guards for runtime type checking
 */
export const TypeGuards = {
  isBaseMessage: (obj: any): obj is BaseMessage => {
    return obj &&
      typeof obj === 'object' &&
      ['user', 'assistant', 'system'].includes(obj.role) &&
      typeof obj.content === 'string';
  },

  isAgentInfo: (obj: any): obj is AgentInfo => {
    return obj &&
      typeof obj === 'object' &&
      typeof obj.id === 'string';
  },

  isTokenUsage: (obj: any): obj is TokenUsage => {
    return obj &&
      typeof obj === 'object' &&
      typeof obj.inputTokens === 'number' &&
      typeof obj.outputTokens === 'number' &&
      typeof obj.totalTokens === 'number';
  },

  isTimeRange: (obj: any): obj is TimeRange => {
    return obj &&
      typeof obj === 'object' &&
      obj.start instanceof Date &&
      obj.end instanceof Date;
  }
};