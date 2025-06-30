/**
 * Context Service
 * Manages conversation context with sliding window and intelligent summarization
 */

import { EventEmitter } from 'events';
import { ClaudeMessage } from './claude-service.js';
import { createHash } from 'crypto';

export interface ContextMessage extends ClaudeMessage {
  id: string;
  timestamp: Date;
  tokens?: number;
  metadata?: {
    agentId?: string;
    importance?: number;
    tags?: string[];
    [key: string]: any;
  };
}

export interface ContextWindow {
  messages: ContextMessage[];
  summary?: string;
  totalTokens: number;
  startTime: Date;
  endTime: Date;
}

export interface ContextOptions {
  maxWindowSize?: number; // Max messages in window
  maxTokens?: number; // Max tokens in window
  slidingStrategy?: 'fifo' | 'importance' | 'hybrid';
  summarizationThreshold?: number; // When to trigger summarization
  preserveSystemMessages?: boolean;
}

export interface ContextSummary {
  content: string;
  messageCount: number;
  tokenCount: number;
  timeRange: {
    start: Date;
    end: Date;
  };
  keyTopics: string[];
}

/**
 * Context Service for managing conversation context with sliding window
 */
export class ContextService extends EventEmitter {
  private currentWindow: ContextMessage[];
  private summaries: ContextSummary[];
  private maxWindowSize: number;
  private maxTokens: number;
  private slidingStrategy: 'fifo' | 'importance' | 'hybrid';
  private summarizationThreshold: number;
  private preserveSystemMessages: boolean;
  private totalMessageCount: number;

  constructor(options?: ContextOptions) {
    super();

    this.currentWindow = [];
    this.summaries = [];
    this.maxWindowSize = options?.maxWindowSize || 50;
    this.maxTokens = options?.maxTokens || 4000;
    this.slidingStrategy = options?.slidingStrategy || 'hybrid';
    this.summarizationThreshold = options?.summarizationThreshold || 0.8;
    this.preserveSystemMessages = options?.preserveSystemMessages ?? true;
    this.totalMessageCount = 0;
  }

  /**
   * Add a message to the context
   */
  async addMessage(
    message: ClaudeMessage,
    metadata?: {
      agentId?: string;
      importance?: number;
      tags?: string[];
      tokens?: number;
      [key: string]: any;
    }
  ): Promise<ContextMessage> {
    const contextMessage: ContextMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date(),
      tokens: metadata?.tokens || this.estimateTokens(message.content),
      metadata
    };

    this.currentWindow.push(contextMessage);
    this.totalMessageCount++;

    // Check if we need to slide the window
    await this.checkAndSlideWindow();

    this.emit('message-added', contextMessage);
    return contextMessage;
  }

  /**
   * Add multiple messages at once
   */
  async addMessages(messages: ClaudeMessage[]): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = [];

    for (const message of messages) {
      const contextMessage = await this.addMessage(message);
      contextMessages.push(contextMessage);
    }

    return contextMessages;
  }

  /**
   * Get current context window
   */
  getCurrentWindow(): ContextWindow {
    const messages = [...this.currentWindow];
    const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);

    return {
      messages,
      totalTokens,
      startTime: messages[0]?.timestamp || new Date(),
      endTime: messages[messages.length - 1]?.timestamp || new Date()
    };
  }

  /**
   * Get messages for Claude API with token limit
   */
  getMessagesForAPI(maxTokens?: number): ClaudeMessage[] {
    const limit = maxTokens || this.maxTokens;
    const messages: ClaudeMessage[] = [];
    let tokenCount = 0;

    // Start from the most recent messages
    for (let i = this.currentWindow.length - 1; i >= 0; i--) {
      const msg = this.currentWindow[i];
      const msgTokens = msg.tokens || 0;

      if (tokenCount + msgTokens <= limit) {
        messages.unshift({
          role: msg.role,
          content: msg.content
        });
        tokenCount += msgTokens;
      } else {
        break;
      }
    }

    // Add summary if we have one and there's room
    if (this.summaries.length > 0 && tokenCount < limit) {
      const latestSummary = this.summaries[this.summaries.length - 1];
      const summaryTokens = this.estimateTokens(latestSummary.content);

      if (tokenCount + summaryTokens <= limit) {
        messages.unshift({
          role: 'assistant',
          content: `[Previous Context Summary]: ${latestSummary.content}`
        });
      }
    }

    return messages;
  }

  /**
   * Search messages in context
   */
  searchMessages(
    query: string | RegExp,
    options?: {
      limit?: number;
      includeMetadata?: boolean;
      role?: 'user' | 'assistant';
    }
  ): ContextMessage[] {
    let results = this.currentWindow.filter(msg => {
      if (options?.role && msg.role !== options.role) {
        return false;
      }

      if (typeof query === 'string') {
        return msg.content.toLowerCase().includes(query.toLowerCase());
      } else {
        return query.test(msg.content);
      }
    });

    if (options?.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Get messages by time range
   */
  getMessagesByTimeRange(startTime: Date, endTime: Date): ContextMessage[] {
    return this.currentWindow.filter(
      msg => msg.timestamp >= startTime && msg.timestamp <= endTime
    );
  }

  /**
   * Get messages by agent
   */
  getMessagesByAgent(agentId: string): ContextMessage[] {
    return this.currentWindow.filter(
      msg => msg.metadata?.agentId === agentId
    );
  }

  /**
   * Update message importance
   */
  updateMessageImportance(messageId: string, importance: number): void {
    const message = this.currentWindow.find(msg => msg.id === messageId);
    if (message) {
      if (!message.metadata) {
        message.metadata = {};
      }
      message.metadata.importance = Math.max(0, Math.min(1, importance));
      this.emit('importance-updated', { messageId, importance });
    }
  }

  /**
   * Clear context but preserve summaries
   */
  clearContext(preserveSummaries: boolean = true): void {
    const clearedCount = this.currentWindow.length;
    this.currentWindow = [];

    if (!preserveSummaries) {
      this.summaries = [];
    }

    this.emit('context-cleared', { clearedCount, preservedSummaries: preserveSummaries });
  }

  /**
   * Get context statistics
   */
  getStats(): {
    currentWindowSize: number;
    totalMessages: number;
    totalTokens: number;
    summaryCount: number;
    averageMessageLength: number;
    messageDistribution: { user: number; assistant: number };
    } {
    const totalTokens = this.currentWindow.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
    const messageDistribution = this.currentWindow.reduce(
      (dist, msg) => {
        dist[msg.role]++;
        return dist;
      },
      { user: 0, assistant: 0 }
    );

    const totalLength = this.currentWindow.reduce((sum, msg) => sum + msg.content.length, 0);
    const averageMessageLength = this.currentWindow.length > 0
      ? totalLength / this.currentWindow.length
      : 0;

    return {
      currentWindowSize: this.currentWindow.length,
      totalMessages: this.totalMessageCount,
      totalTokens,
      summaryCount: this.summaries.length,
      averageMessageLength,
      messageDistribution
    };
  }

  /**
   * Export context to JSON
   */
  exportContext(): {
    messages: ContextMessage[];
    summaries: ContextSummary[];
    stats: ReturnType<ContextService['getStats']>;
    } {
    return {
      messages: [...this.currentWindow],
      summaries: [...this.summaries],
      stats: this.getStats()
    };
  }

  /**
   * Import context from JSON
   */
  importContext(data: {
    messages: ContextMessage[];
    summaries?: ContextSummary[];
  }): void {
    this.currentWindow = data.messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));

    if (data.summaries) {
      this.summaries = data.summaries.map(summary => ({
        ...summary,
        timeRange: {
          start: new Date(summary.timeRange.start),
          end: new Date(summary.timeRange.end)
        }
      }));
    }

    this.totalMessageCount = this.currentWindow.length;
    this.emit('context-imported', { messageCount: this.currentWindow.length });
  }

  /**
   * Create a summary of recent messages
   */
  async createSummary(messages?: ContextMessage[]): Promise<ContextSummary> {
    const targetMessages = messages || this.currentWindow.slice(0, Math.floor(this.currentWindow.length / 2));

    if (targetMessages.length === 0) {
      throw new Error('No messages to summarize');
    }

    // Extract key topics (simplified - in production, use NLP)
    const allContent = targetMessages.map(msg => msg.content).join(' ');
    const words = allContent.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      if (word.length > 5) { // Simple filter for significant words
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    const keyTopics = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    // Create summary content
    const summaryParts = [
      `Conversation summary of ${targetMessages.length} messages:`,
      `- Time range: ${targetMessages[0].timestamp.toISOString()} to ${targetMessages[targetMessages.length - 1].timestamp.toISOString()}`,
      `- Message distribution: ${targetMessages.filter(m => m.role === 'user').length} user, ${targetMessages.filter(m => m.role === 'assistant').length} assistant`,
      `- Key topics: ${keyTopics.join(', ')}`
    ];

    const summary: ContextSummary = {
      content: summaryParts.join('\n'),
      messageCount: targetMessages.length,
      tokenCount: targetMessages.reduce((sum, msg) => sum + (msg.tokens || 0), 0),
      timeRange: {
        start: targetMessages[0].timestamp,
        end: targetMessages[targetMessages.length - 1].timestamp
      },
      keyTopics
    };

    this.summaries.push(summary);
    this.emit('summary-created', summary);

    return summary;
  }

  /**
   * Check and slide window if necessary
   */
  private async checkAndSlideWindow(): Promise<void> {
    const currentTokens = this.currentWindow.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
    const windowUtilization = Math.max(
      this.currentWindow.length / this.maxWindowSize,
      currentTokens / this.maxTokens
    );

    if (windowUtilization >= this.summarizationThreshold) {
      await this.slideWindow();
    }
  }

  /**
   * Slide the context window based on strategy
   */
  private async slideWindow(): Promise<void> {
    switch (this.slidingStrategy) {
      case 'fifo':
        await this.slideFIFO();
        break;
      case 'importance':
        await this.slideByImportance();
        break;
      case 'hybrid':
        await this.slideHybrid();
        break;
    }
  }

  /**
   * FIFO sliding strategy
   */
  private async slideFIFO(): Promise<void> {
    const removeCount = Math.floor(this.currentWindow.length * 0.3);
    const removed = this.currentWindow.splice(0, removeCount);

    if (removed.length > 10) {
      await this.createSummary(removed);
    }

    this.emit('window-slid', { strategy: 'fifo', removedCount: removed.length });
  }

  /**
   * Importance-based sliding strategy
   */
  private async slideByImportance(): Promise<void> {
    const targetSize = Math.floor(this.maxWindowSize * 0.7);

    // Sort by importance (ascending) and timestamp
    const sorted = [...this.currentWindow].sort((a, b) => {
      const aImportance = a.metadata?.importance || 0.5;
      const bImportance = b.metadata?.importance || 0.5;

      if (Math.abs(aImportance - bImportance) < 0.1) {
        return a.timestamp.getTime() - b.timestamp.getTime();
      }
      return aImportance - bImportance;
    });

    const toRemove = sorted.slice(0, this.currentWindow.length - targetSize);
    const toRemoveIds = new Set(toRemove.map(msg => msg.id));

    this.currentWindow = this.currentWindow.filter(msg => !toRemoveIds.has(msg.id));

    if (toRemove.length > 10) {
      await this.createSummary(toRemove);
    }

    this.emit('window-slid', { strategy: 'importance', removedCount: toRemove.length });
  }

  /**
   * Hybrid sliding strategy
   */
  private async slideHybrid(): Promise<void> {
    const targetSize = Math.floor(this.maxWindowSize * 0.7);
    const oldestToKeep = Math.floor(this.currentWindow.length * 0.2);

    // Keep some oldest messages for context continuity
    const oldest = this.currentWindow.slice(0, oldestToKeep);
    const rest = this.currentWindow.slice(oldestToKeep);

    // Sort rest by importance
    const sorted = rest.sort((a, b) => {
      const aImportance = a.metadata?.importance || 0.5;
      const bImportance = b.metadata?.importance || 0.5;
      return bImportance - aImportance;
    });

    // Keep most important from the rest
    const toKeepFromRest = sorted.slice(0, targetSize - oldestToKeep);
    const removed = sorted.slice(targetSize - oldestToKeep);

    // Reconstruct window maintaining chronological order
    this.currentWindow = [...oldest, ...toKeepFromRest].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    if (removed.length > 10) {
      await this.createSummary(removed);
    }

    this.emit('window-slid', { strategy: 'hybrid', removedCount: removed.length });
  }

  /**
   * Estimate token count for a message
   */
  private estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 9);
    return createHash('sha256')
      .update(`${timestamp}-${random}`)
      .digest('hex')
      .substring(0, 16);
  }
}

/**
 * Factory function to create context service instance
 */
export function createContextService(options?: ContextOptions): ContextService {
  return new ContextService(options);
}