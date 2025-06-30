/**
 * Tests for AI Services
 * Unit and integration tests for Claude, Memory, and Context services
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClaudeService, createMemoryService, createContextService } from '../index.js';
import type { ClaudeService } from '../claude-service.js';
import type { MemoryService } from '../memory-service.js';
import type { ContextService } from '../context-service.js';
import * as fs from 'fs/promises';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mocked response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn'
      })
    }
  })),
  APIError: class APIError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
}));

describe('ClaudeService', () => {
  let claude: ClaudeService;

  beforeEach(() => {
    claude = createClaudeService({
      apiKey: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0.7
    });
  });

  it('should send a message and receive response', async () => {
    const response = await claude.sendMessage('Hello, Claude!');

    expect(response.content).toBe('Mocked response');
    expect(response.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30
    });
  });

  it('should handle conversation with multiple messages', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
      { role: 'user' as const, content: 'How are you?' }
    ];

    const response = await claude.createConversation(messages);
    expect(response.content).toBe('Mocked response');
  });

  it('should update configuration', () => {
    claude.updateConfig({
      model: 'claude-3-opus-20240229',
      maxTokens: 2048,
      temperature: 0.5
    });

    // Verify by checking available models (indirect verification)
    const models = claude.getAvailableModels();
    expect(models).toContain('claude-3-opus-20240229');
  });

  it('should emit error events on API errors', async () => {
    const errorHandler = jest.fn();
    claude.on('error', errorHandler);

    // Mock API error
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const mockClient = new Anthropic({ apiKey: 'test' });
    (mockClient.messages.create as jest.Mock).mockRejectedValueOnce(
      new Error('API Error')
    );

    await expect(claude.sendMessage('test')).rejects.toThrow();
    expect(errorHandler).toHaveBeenCalled();
  });
});

describe('MemoryService', () => {
  let memory: MemoryService;
  const testPath = './.test-memory';

  beforeEach(async () => {
    memory = createMemoryService({
      persistencePath: testPath,
      maxShortTermSize: 10,
      shortTermTTL: 1000, // 1 second for testing
      importanceThreshold: 0.7
    });
    await memory.initialize();
  });

  afterEach(async () => {
    await memory.clear('all');
    try {
      await fs.rm(testPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should store and retrieve short-term memory', async () => {
    const entry = await memory.store('test-key', { data: 'test value' }, {
      type: 'short-term',
      importance: 0.5,
      tags: ['test']
    });

    expect(entry.key).toBe('test-key');
    expect(entry.value).toEqual({ data: 'test value' });
    expect(entry.type).toBe('short-term');

    const retrieved = await memory.get('test-key');
    expect(retrieved).toBeTruthy();
    expect(retrieved?.value).toEqual({ data: 'test value' });
  });

  it('should store and retrieve long-term memory', async () => {
    const entry = await memory.store('persistent-key', { data: 'persistent value' }, {
      type: 'long-term',
      importance: 0.8,
      tags: ['persistent', 'important']
    });

    expect(entry.type).toBe('long-term');

    const retrieved = await memory.get('persistent-key');
    expect(retrieved).toBeTruthy();
    expect(retrieved?.metadata.importance).toBe(0.8);
  });

  it('should promote short-term to long-term based on importance', async () => {
    let promotedEmitted = false;
    memory.on('promoted', () => { promotedEmitted = true; });

    await memory.store('important-key', { data: 'important' }, {
      type: 'short-term',
      importance: 0.8 // Above threshold
    });

    expect(promotedEmitted).toBe(true);

    const retrieved = await memory.get('important-key');
    expect(retrieved?.type).toBe('long-term');
  });

  it('should search memories by criteria', async () => {
    await memory.store('task1', { task: 'coding' }, {
      tags: ['task', 'coding'],
      agentId: 'coder',
      importance: 0.6
    });

    await memory.store('task2', { task: 'testing' }, {
      tags: ['task', 'testing'],
      agentId: 'tester',
      importance: 0.8
    });

    await memory.store('note1', { note: 'remember this' }, {
      tags: ['note'],
      agentId: 'coder',
      importance: 0.3
    });

    // Search by tags
    const taskMemories = await memory.search({ tags: ['task'] });
    expect(taskMemories.length).toBe(2);

    // Search by agent
    const coderMemories = await memory.search({ agentId: 'coder' });
    expect(coderMemories.length).toBe(2);

    // Search by importance
    const importantMemories = await memory.search({ minImportance: 0.7 });
    expect(importantMemories.length).toBe(1);
    expect(importantMemories[0].key).toBe('task2');
  });

  it('should handle memory expiration', async () => {
    await memory.store('temp-key', { data: 'temporary' }, {
      type: 'short-term',
      ttl: 100 // 100ms
    });

    let retrieved = await memory.get('temp-key');
    expect(retrieved).toBeTruthy();

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 200));

    retrieved = await memory.get('temp-key');
    expect(retrieved).toBeFalsy();
  });

  it('should evict oldest when reaching max size', async () => {
    // Fill up short-term memory
    for (let i = 0; i < 10; i++) {
      await memory.store(`key-${i}`, { index: i }, {
        type: 'short-term',
        importance: 0.5
      });
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
    }

    // Add one more to trigger eviction
    await memory.store('key-10', { index: 10 }, {
      type: 'short-term',
      importance: 0.5
    });

    // First entry should be evicted
    const first = await memory.get('key-0');
    expect(first).toBeFalsy();

    // Last entry should exist
    const last = await memory.get('key-10');
    expect(last).toBeTruthy();
  });

  it('should export and import memories', async () => {
    await memory.store('export-test', { data: 'to export' }, {
      type: 'long-term',
      tags: ['export']
    });

    const exportPath = './test-export.json';
    await memory.export(exportPath);

    // Clear and reimport
    await memory.clear('all');
    await memory.import(exportPath);

    const imported = await memory.get('export-test');
    expect(imported).toBeTruthy();
    expect(imported?.value).toEqual({ data: 'to export' });

    // Cleanup
    await fs.unlink(exportPath);
  });
});

describe('ContextService', () => {
  let context: ContextService;

  beforeEach(() => {
    context = createContextService({
      maxWindowSize: 10,
      maxTokens: 1000,
      slidingStrategy: 'fifo',
      summarizationThreshold: 0.8
    });
  });

  it('should add messages to context', async () => {
    const message = await context.addMessage({
      role: 'user',
      content: 'Hello, AI!'
    }, {
      agentId: 'test-agent',
      importance: 0.7
    });

    expect(message.id).toBeTruthy();
    expect(message.timestamp).toBeInstanceOf(Date);
    expect(message.metadata?.agentId).toBe('test-agent');

    const window = context.getCurrentWindow();
    expect(window.messages.length).toBe(1);
    expect(window.totalTokens).toBeGreaterThan(0);
  });

  it('should manage sliding window', async () => {
    // Fill window
    for (let i = 0; i < 12; i++) {
      await context.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      });
    }

    const window = context.getCurrentWindow();
    expect(window.messages.length).toBeLessThanOrEqual(10);

    // Check that older messages were removed
    const contents = window.messages.map(m => m.content);
    expect(contents).not.toContain('Message 0');
    expect(contents).toContain('Message 11');
  });

  it('should get messages for API with token limit', async () => {
    // Add messages with estimated tokens
    for (let i = 0; i < 5; i++) {
      await context.addMessage({
        role: 'user',
        content: 'This is a test message with some content to estimate tokens.'
      }, { tokens: 20 });
    }

    const messages = context.getMessagesForAPI(50);
    expect(messages.length).toBeLessThanOrEqual(3); // Should fit ~2-3 messages in 50 tokens
  });

  it('should search messages', async () => {
    await context.addMessage({ role: 'user', content: 'Tell me about React' });
    await context.addMessage({ role: 'assistant', content: 'React is a JavaScript library' });
    await context.addMessage({ role: 'user', content: 'What about Vue?' });
    await context.addMessage({ role: 'assistant', content: 'Vue is another framework' });

    const reactMessages = context.searchMessages('React');
    expect(reactMessages.length).toBe(2);

    const userMessages = context.searchMessages('', { role: 'user' });
    expect(userMessages.length).toBe(2);
  });

  it('should create summaries', async () => {
    const messages = [
      { role: 'user' as const, content: 'I want to learn programming' },
      { role: 'assistant' as const, content: 'Great! What language interests you?' },
      { role: 'user' as const, content: 'Python for data science' },
      { role: 'assistant' as const, content: 'Python is excellent for data science' }
    ];

    for (const msg of messages) {
      await context.addMessage(msg);
    }

    const summary = await context.createSummary();
    expect(summary.messageCount).toBe(4);
    expect(summary.content).toContain('Conversation summary');
    expect(summary.keyTopics).toBeInstanceOf(Array);
  });

  it('should handle importance-based sliding', async () => {
    const importanceContext = createContextService({
      maxWindowSize: 5,
      slidingStrategy: 'importance'
    });

    // Add messages with varying importance
    await importanceContext.addMessage({ role: 'user', content: 'Important task' },
      { importance: 0.9 });
    await importanceContext.addMessage({ role: 'assistant', content: 'Acknowledged' },
      { importance: 0.3 });
    await importanceContext.addMessage({ role: 'user', content: 'Critical issue' },
      { importance: 1.0 });
    await importanceContext.addMessage({ role: 'assistant', content: 'Minor note' },
      { importance: 0.2 });
    await importanceContext.addMessage({ role: 'user', content: 'Regular message' },
      { importance: 0.5 });
    await importanceContext.addMessage({ role: 'user', content: 'Another message' },
      { importance: 0.6 });

    const window = importanceContext.getCurrentWindow();
    const contents = window.messages.map(m => m.content);

    // High importance messages should be retained
    expect(contents).toContain('Important task');
    expect(contents).toContain('Critical issue');

    // Low importance messages may be removed
    const hasLowImportance = contents.includes('Minor note') || contents.includes('Acknowledged');
    expect(hasLowImportance).toBe(false);
  });

  it('should export and import context', async () => {
    await context.addMessage({ role: 'user', content: 'Test message' });
    await context.addMessage({ role: 'assistant', content: 'Test response' });

    const exported = context.exportContext();
    expect(exported.messages.length).toBe(2);
    expect(exported.stats.currentWindowSize).toBe(2);

    // Clear and import
    context.clearContext();
    context.importContext(exported);

    const window = context.getCurrentWindow();
    expect(window.messages.length).toBe(2);
    expect(window.messages[0].content).toBe('Test message');
  });
});

describe('Integration Tests', () => {
  it('should work together: Claude + Memory + Context', async () => {
    // Initialize services
    const claude = createClaudeService({ apiKey: 'test-key' });
    const memory = createMemoryService({ persistencePath: './.test-integration' });
    const context = createContextService({ maxWindowSize: 20 });

    await memory.initialize();

    // Store user preference
    await memory.store('user_name', 'TestUser', {
      type: 'long-term',
      importance: 0.9
    });

    // Add to context
    await context.addMessage({ role: 'user', content: 'My name is TestUser' });

    // Get context for Claude
    const userName = await memory.get('user_name');
    const messages = context.getMessagesForAPI();

    // Would send to Claude with context
    expect(userName?.value).toBe('TestUser');
    expect(messages.length).toBe(1);
    expect(messages[0].content).toContain('TestUser');

    // Cleanup
    await memory.clear('all');
    try {
      await fs.rm('./.test-integration', { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});