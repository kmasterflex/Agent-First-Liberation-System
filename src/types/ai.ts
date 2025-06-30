/**
 * AI and Claude Integration Type Definitions
 */

/**
 * Supported AI models
 */
export type AIModel =
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | 'claude-2.1'
  | 'claude-2.0'
  | 'claude-instant-1.2';

/**
 * AI provider types
 */
export type AIProvider = 'anthropic' | 'openai' | 'custom';

/**
 * AI conversation message role
 */
export type AIMessageRole = 'system' | 'user' | 'assistant';

/**
 * AI conversation message
 */
export interface AIMessage {
  role: AIMessageRole;
  content: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * AI conversation context
 */
export interface AIContext {
  messages: AIMessage[];
  model: AIModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  metadata?: Record<string, unknown>;
}

/**
 * AI response structure
 */
export interface AIResponse {
  content: string;
  model: AIModel;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
  metadata?: Record<string, unknown>;
}

/**
 * AI agent capabilities
 */
export interface AICapabilities {
  canResearch: boolean;
  canCode: boolean;
  canAnalyze: boolean;
  canCoordinate: boolean;
  canTest: boolean;
  canDebug: boolean;
  canDocument: boolean;
  customCapabilities?: string[];
}

/**
 * AI agent configuration
 */
export interface AIAgentConfig {
  name: string;
  description: string;
  model: AIModel;
  systemPrompt: string;
  capabilities: AICapabilities;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json' | 'markdown';
  tools?: AITool[];
  metadata?: Record<string, unknown>;
}

/**
 * AI tool property definition
 */
export interface AIToolProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: AIToolProperty;
  properties?: Record<string, AIToolProperty>;
  required?: string[];
}

/**
 * AI tool definition for function calling
 */
export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AIToolProperty>;
    required?: string[];
  };
}

/**
 * AI tool call
 */
export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * AI tool response
 */
export interface AIToolResponse {
  toolCallId: string;
  content: string;
  error?: string;
}

/**
 * AI agent state
 */
export interface AIAgentState {
  isActive: boolean;
  currentTask?: string;
  conversationHistory: AIMessage[];
  totalTokensUsed: number;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

/**
 * AI request options
 */
export interface AIRequestOptions {
  stream?: boolean;
  stopSequences?: string[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  timeout?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * AI error types
 */
export type AIErrorType =
  | 'rate_limit'
  | 'token_limit'
  | 'content_filter'
  | 'network'
  | 'authentication'
  | 'invalid_request'
  | 'unknown';

/**
 * AI error structure
 */
export interface AIError {
  type: AIErrorType;
  message: string;
  code?: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}