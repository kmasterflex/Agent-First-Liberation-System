/**
 * Claude API Service
 * Provides comprehensive wrapper for Claude API interactions including message creation,
 * streaming responses, and error handling
 */

import Anthropic from '@anthropic-ai/sdk';
import { Message, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { EventEmitter } from 'events';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  stopReason?: string;
  model?: string;
}

export interface StreamOptions {
  onChunk?: (chunk: string) => void;
  onStart?: () => void;
  onComplete?: (response: ClaudeResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Claude API Service for managing interactions with Anthropic's Claude
 */
export class ClaudeService extends EventEmitter {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private systemPrompt?: string;

  constructor(config: ClaudeConfig) {
    super();

    if (!config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey
    });

    this.defaultModel = config.model || 'claude-3-5-sonnet-20241022';
    this.defaultMaxTokens = config.maxTokens || 4096;
    this.defaultTemperature = config.temperature || 0.7;
    this.systemPrompt = config.systemPrompt;
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(
    message: string | ClaudeMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    }
  ): Promise<ClaudeResponse> {
    try {
      const messages = this.formatMessages(message);
      const systemPrompt = options?.systemPrompt || this.systemPrompt;

      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature || this.defaultTemperature,
        messages: messages as MessageParam[],
        ...(systemPrompt && { system: systemPrompt })
      });

      return this.parseResponse(response);
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Stream a message response from Claude
   */
  async streamMessage(
    message: string | ClaudeMessage[],
    streamOptions: StreamOptions,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    }
  ): Promise<void> {
    try {
      const messages = this.formatMessages(message);
      const systemPrompt = options?.systemPrompt || this.systemPrompt;

      streamOptions.onStart?.();

      const stream = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || this.defaultMaxTokens,
        temperature: options?.temperature || this.defaultTemperature,
        messages: messages as MessageParam[],
        ...(systemPrompt && { system: systemPrompt }),
        stream: true
      });

      let fullContent = '';
      const usage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          fullContent += chunk;
          streamOptions.onChunk?.(chunk);
          this.emit('chunk', chunk);
        } else if (event.type === 'message_start' && event.message.usage) {
          usage.inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'message_delta' && event.usage) {
          usage.outputTokens = event.usage.output_tokens;
          usage.totalTokens = usage.inputTokens + usage.outputTokens;
        }
      }

      const response: ClaudeResponse = {
        content: fullContent,
        usage,
        model: options?.model || this.defaultModel
      };

      streamOptions.onComplete?.(response);
      this.emit('complete', response);

    } catch (error) {
      streamOptions.onError?.(error as Error);
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Create a conversation with multiple turns
   */
  async createConversation(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    }
  ): Promise<ClaudeResponse> {
    return this.sendMessage(messages, options);
  }

  /**
   * Continue an existing conversation
   */
  async continueConversation(
    conversation: ClaudeMessage[],
    newMessage: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      systemPrompt?: string;
    }
  ): Promise<ClaudeResponse> {
    const updatedConversation: ClaudeMessage[] = [
      ...conversation,
      { role: 'user', content: newMessage }
    ];

    const response = await this.sendMessage(updatedConversation, options);

    // Return the response and emit an event for conversation update
    this.emit('conversation-update', {
      conversation: [
        ...updatedConversation,
        { role: 'assistant', content: response.content }
      ],
      response
    });

    return response;
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.sendMessage('Hello', {
        maxTokens: 10,
        temperature: 0
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.APIError && error.status === 401) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  /**
   * Update default configuration
   */
  updateConfig(config: Partial<ClaudeConfig>): void {
    if (config.model) this.defaultModel = config.model;
    if (config.maxTokens) this.defaultMaxTokens = config.maxTokens;
    if (config.temperature) this.defaultTemperature = config.temperature;
    if (config.systemPrompt !== undefined) this.systemPrompt = config.systemPrompt;
  }

  /**
   * Format messages for the API
   */
  private formatMessages(input: string | ClaudeMessage[]): ClaudeMessage[] {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }
    return input;
  }

  /**
   * Parse API response into our format
   */
  private parseResponse(response: Message): ClaudeResponse {
    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('');

    return {
      content,
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      } : undefined,
      stopReason: response.stop_reason || undefined,
      model: response.model
    };
  }

  /**
   * Handle and format errors
   */
  private handleError(error: unknown): void {
    if (error instanceof Anthropic.APIError) {
      const errorMessage = `Claude API Error: ${error.status} - ${error.message}`;
      this.emit('error', new Error(errorMessage));
    } else if (error instanceof Error) {
      this.emit('error', error);
    } else {
      this.emit('error', new Error('Unknown error occurred'));
    }
  }
}

/**
 * Factory function to create Claude service instance
 */
export function createClaudeService(config: ClaudeConfig): ClaudeService {
  return new ClaudeService(config);
}

// Export types for external use
export type { Message, MessageParam } from '@anthropic-ai/sdk/resources/messages';