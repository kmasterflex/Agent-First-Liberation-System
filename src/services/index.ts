/**
 * Services Index
 * Export all AI services for easy importing
 */

export * from './claude-service.js';
export * from './memory-service.js';
export * from './context-service.js';
export * from './types.js';

// Re-export factory functions for convenience
export { createClaudeService } from './claude-service.js';
export { createMemoryService } from './memory-service.js';
export { createContextService } from './context-service.js';

// Export types
export type { ClaudeConfig, ClaudeMessage, ClaudeResponse, StreamOptions } from './claude-service.js';
export type { MemoryEntry, MemorySearchOptions, MemoryStats } from './memory-service.js';
export type { ContextMessage, ContextWindow, ContextOptions, ContextSummary } from './context-service.js';

// Export shared types
export type {
  BaseMessage,
  AgentInfo,
  CommonMetadata,
  TokenUsage,
  ServiceStatus,
  BatchOperationResult,
  SearchQuery,
  TimeRange,
  ValidationResult,
  ServiceMetrics,
  ServiceInitOptions,
  RateLimitConfig,
  RetryConfig,
  HealthCheckResult,
  ErrorCallback,
  SuccessCallback,
  ProgressCallback
} from './types.js';

export {
  ServiceEventType,
  Priority,
  ExportFormat,
  TypeGuards
} from './types.js';