/**
 * Example usage of AI services
 * Demonstrates how to integrate Claude, Memory, and Context services
 */

import { createClaudeService, createMemoryService, createContextService } from './index.js';
import type { ClaudeMessage } from './claude-service.js';

/**
 * Example: Basic Claude interaction
 */
async function basicClaudeExample() {
  // Initialize Claude service
  const claude = createClaudeService({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: 'You are a helpful AI assistant for the Claude-Flow system.'
  });

  // Send a simple message
  const response = await claude.sendMessage('Hello! What can you help me with?');
  console.log('Claude response:', response.content);

  // Stream a response
  await claude.streamMessage(
    'Explain quantum computing in simple terms',
    {
      onChunk: (chunk: string) => process.stdout.write(chunk),
      onComplete: (response: any) => console.log('\n\nTotal tokens used:', response.usage?.totalTokens),
      onError: (error: Error) => console.error('Stream error:', error)
    }
  );
}

/**
 * Example: Memory-enhanced conversation
 */
async function memoryEnhancedExample() {
  // Initialize services
  const claude = createClaudeService({
    apiKey: process.env.ANTHROPIC_API_KEY!
  });

  const memory = createMemoryService({
    persistencePath: './.claude/memory',
    maxShortTermSize: 100,
    shortTermTTL: 3600000, // 1 hour
    importanceThreshold: 0.7
  });

  await memory.initialize();

  // Store important information
  await memory.store('user_preferences', {
    name: 'John Doe',
    preferredLanguage: 'TypeScript',
    expertise: 'web development'
  }, {
    type: 'long-term',
    importance: 0.9,
    tags: ['user', 'preferences'],
    agentId: 'main'
  });

  // Store task context
  await memory.store('current_task', {
    description: 'Building AI agent system',
    progress: 'Setting up services',
    nextSteps: ['Implement agent coordination', 'Add task queue']
  }, {
    type: 'short-term',
    importance: 0.8,
    tags: ['task', 'active'],
    ttl: 7200000 // 2 hours
  });

  // Retrieve and use memory in conversation
  const userPrefs = await memory.get('user_preferences');
  const currentTask = await memory.get('current_task');

  const contextualPrompt = `
User preferences: ${JSON.stringify(userPrefs?.value)}
Current task: ${JSON.stringify(currentTask?.value)}

Based on this context, provide assistance.
  `;

  const response = await claude.sendMessage(
    'What should I work on next?',
    { systemPrompt: contextualPrompt }
  );

  console.log('Contextual response:', response.content);

  // Search memories by tags
  const taskMemories = await memory.search({
    tags: ['task'],
    sortBy: 'importance',
    limit: 5
  });

  console.log('Found task memories:', taskMemories.length);
}

/**
 * Example: Context-managed conversation
 */
async function contextManagedExample() {
  // Initialize services
  const claude = createClaudeService({
    apiKey: process.env.ANTHROPIC_API_KEY!
  });

  const context = createContextService({
    maxWindowSize: 50,
    maxTokens: 3000,
    slidingStrategy: 'hybrid',
    summarizationThreshold: 0.8
  });

  // Simulate a conversation
  const conversation: ClaudeMessage[] = [
    { role: 'user', content: 'I want to build a web application' },
    { role: 'assistant', content: 'I can help you build a web application. What type of application are you planning?' },
    { role: 'user', content: 'An e-commerce platform with React and Node.js' },
    { role: 'assistant', content: 'Great choice! For an e-commerce platform, you\'ll need several key components...' }
  ];

  // Add messages to context
  for (const msg of conversation) {
    await context.addMessage(msg, {
      agentId: 'main',
      importance: msg.role === 'user' ? 0.8 : 0.6
    });
  }

  // Get messages for API with token limit
  const apiMessages = context.getMessagesForAPI(2000);
  console.log('Messages for API:', apiMessages.length);

  // Continue conversation with context
  await context.addMessage(
    { role: 'user', content: 'What database should I use?' },
    { importance: 0.9 }
  );

  const response = await claude.createConversation(
    context.getMessagesForAPI()
  );

  await context.addMessage(
    { role: 'assistant', content: response.content },
    { tokens: response.usage?.outputTokens }
  );

  // Get statistics
  const stats = context.getStats();
  console.log('Context stats:', stats);

  // Search for specific content
  const dbMessages = context.searchMessages('database', {
    role: 'assistant',
    limit: 3
  });
  console.log('Database-related messages:', dbMessages.length);
}

/**
 * Example: Integrated AI agent with all services
 */
class AIAgent {
  private claude: ReturnType<typeof createClaudeService>;
  private memory: ReturnType<typeof createMemoryService>;
  private context: ReturnType<typeof createContextService>;
  private agentId: string;

  constructor(agentId: string, systemPrompt?: string) {
    this.agentId = agentId;

    // Initialize all services
    this.claude = createClaudeService({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      systemPrompt: systemPrompt || `You are AI agent ${agentId}. You have access to memory and context management.`
    });

    this.memory = createMemoryService({
      persistencePath: `./.claude/agents/${agentId}/memory`
    });

    this.context = createContextService({
      maxWindowSize: 30,
      slidingStrategy: 'importance'
    });

    // Set up event listeners
    this.setupEventListeners();
  }

  async initialize(): Promise<void> {
    await this.memory.initialize();
    console.log(`Agent ${this.agentId} initialized`);
  }

  async processMessage(userMessage: string): Promise<string> {
    // Add to context
    await this.context.addMessage(
      { role: 'user', content: userMessage },
      { agentId: this.agentId, importance: 0.8 }
    );

    // Check for relevant memories
    const relevantMemories = await this.searchRelevantMemories(userMessage);

    // Build system context
    const systemContext = this.buildSystemContext(relevantMemories);

    // Get response from Claude
    const messages = this.context.getMessagesForAPI();
    const response = await this.claude.sendMessage(messages, {
      systemPrompt: systemContext
    });

    // Add response to context
    await this.context.addMessage(
      { role: 'assistant', content: response.content },
      {
        agentId: this.agentId,
        importance: 0.7,
        tokens: response.usage?.outputTokens
      }
    );

    // Store important information in memory
    await this.extractAndStoreMemories(userMessage, response.content);

    return response.content;
  }

  private async searchRelevantMemories(message: string): Promise<any[]> {
    // Simple keyword extraction (in production, use NLP)
    const keywords = message.toLowerCase().split(' ')
      .filter(word => word.length > 4);

    const memories = [];
    for (const keyword of keywords) {
      const results = await this.memory.search({
        tags: [keyword],
        agentId: this.agentId,
        limit: 3
      });
      memories.push(...results);
    }

    return memories;
  }

  private buildSystemContext(memories: any[]): string {
    const memoryContext = memories.length > 0
      ? `\nRelevant memories:\n${memories.map(m => `- ${m.key}: ${JSON.stringify(m.value)}`).join('\n')}`
      : '';

    const stats = this.context.getStats();
    const contextInfo = `\nConversation stats: ${stats.currentWindowSize} messages, ${stats.totalTokens} tokens`;

    return `You are AI agent ${this.agentId}.${memoryContext}${contextInfo}`;
  }

  private async extractAndStoreMemories(userMessage: string, response: string): Promise<void> {
    // Simple extraction logic (in production, use NLP)
    if (userMessage.includes('my name is')) {
      const nameMatch = userMessage.match(/my name is (\w+)/i);
      if (nameMatch) {
        await this.memory.store('user_name', nameMatch[1], {
          type: 'long-term',
          importance: 0.9,
          tags: ['user', 'identity'],
          agentId: this.agentId
        });
      }
    }

    // Store conversation summaries periodically
    const stats = this.context.getStats();
    if (stats.currentWindowSize > 20 && stats.currentWindowSize % 10 === 0) {
      const summary = await this.context.createSummary();
      await this.memory.store(`conversation_summary_${Date.now()}`, summary, {
        type: 'long-term',
        importance: 0.7,
        tags: ['conversation', 'summary'],
        agentId: this.agentId
      });
    }
  }

  private setupEventListeners(): void {
    // Memory events
    this.memory.on('stored', (data: any) => {
      console.log(`[${this.agentId}] Memory stored:`, data.key);
    });

    this.memory.on('promoted', (data: any) => {
      console.log(`[${this.agentId}] Memory promoted to long-term:`, data.key);
    });

    // Context events
    this.context.on('window-slid', (data: any) => {
      console.log(`[${this.agentId}] Context window slid:`, data);
    });

    this.context.on('summary-created', (summary: any) => {
      console.log(`[${this.agentId}] Context summary created:`, summary.messageCount, 'messages');
    });

    // Claude events
    this.claude.on('error', (error: Error) => {
      console.error(`[${this.agentId}] Claude error:`, error);
    });
  }

  async exportState(): Promise<any> {
    const memoryStats = await this.memory.getStats();
    const contextExport = this.context.exportContext();

    return {
      agentId: this.agentId,
      memory: {
        stats: memoryStats,
        entries: await this.memory.search({ agentId: this.agentId })
      },
      context: contextExport
    };
  }
}

/**
 * Example usage of integrated agent
 */
async function integratedAgentExample() {
  const agent = new AIAgent('research-agent', 'You are a research specialist focused on technical topics.');
  await agent.initialize();

  // Simulate conversation
  const responses = [];

  responses.push(await agent.processMessage('Hello! My name is Alice.'));
  responses.push(await agent.processMessage('I need help researching React performance optimization.'));
  responses.push(await agent.processMessage('What are the key areas to focus on?'));
  responses.push(await agent.processMessage('Can you explain virtual DOM in detail?'));

  // Export agent state
  const state = await agent.exportState();
  console.log('Agent state:', JSON.stringify(state, null, 2));
}

// Export example functions for testing
export {
  basicClaudeExample,
  memoryEnhancedExample,
  contextManagedExample,
  integratedAgentExample,
  AIAgent
};