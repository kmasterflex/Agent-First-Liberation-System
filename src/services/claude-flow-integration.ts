/**
 * Claude-Flow Integration
 * Integrates AI services with the Claude-Flow orchestration system
 */

import { createClaudeService, createMemoryService, createContextService } from './index.js';
import type { ClaudeService } from './claude-service.js';
import type { MemoryService } from './memory-service.js';
import type { ContextService } from './context-service.js';
import type { AgentInfo } from './types.js';
import { ServiceEventType } from './types.js';
import { EventEmitter } from 'events';

/**
 * Configuration for Claude-Flow AI integration
 */
export interface ClaudeFlowAIConfig {
  anthropicApiKey: string;
  memoryPath?: string;
  maxAgents?: number;
  defaultModel?: string;
  enableMetrics?: boolean;
}

/**
 * Agent instance with AI capabilities
 */
export class AIAgent extends EventEmitter {
  public readonly id: string;
  public readonly info: AgentInfo;
  private claude: ClaudeService;
  private memory: MemoryService;
  private context: ContextService;
  private isActive: boolean = false;

  constructor(
    info: AgentInfo,
    private config: ClaudeFlowAIConfig
  ) {
    super();
    this.id = info.id;
    this.info = info;

    // Initialize services for this agent
    this.claude = createClaudeService({
      apiKey: config.anthropicApiKey,
      model: config.defaultModel,
      systemPrompt: this.buildSystemPrompt()
    });

    this.memory = createMemoryService({
      persistencePath: `${config.memoryPath || './.claude'}/agents/${this.id}/memory`,
      maxShortTermSize: 500,
      importanceThreshold: 0.7
    });

    this.context = createContextService({
      maxWindowSize: 30,
      maxTokens: 3000,
      slidingStrategy: this.info.type === 'coordinator' ? 'importance' : 'hybrid'
    });

    this.setupEventForwarding();
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await this.memory.initialize();
    this.isActive = true;
    this.emit('initialized', { agentId: this.id });
  }

  /**
   * Process a task
   */
  async processTask(task: {
    id: string;
    type: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    context?: Record<string, any>;
  }): Promise<any> {
    if (!this.isActive) {
      throw new Error(`Agent ${this.id} is not active`);
    }

    try {
      // Store task in short-term memory
      await this.memory.store(`task_${task.id}`, task, {
        type: 'short-term',
        importance: task.priority === 'high' ? 0.9 : task.priority === 'medium' ? 0.7 : 0.5,
        tags: ['task', task.type],
        agentId: this.id
      });

      // Add task to context
      await this.context.addMessage({
        role: 'user',
        content: `Task: ${task.description}\nType: ${task.type}\nPriority: ${task.priority || 'medium'}`
      }, {
        agentId: this.id,
        importance: 0.8
      });

      // Get relevant memories
      const relevantMemories = await this.searchRelevantMemories(task.description);

      // Build enhanced prompt
      const enhancedPrompt = this.buildEnhancedPrompt(task, relevantMemories);

      // Get response from Claude
      const response = await this.claude.sendMessage(
        this.context.getMessagesForAPI(),
        { systemPrompt: enhancedPrompt }
      );

      // Add response to context
      await this.context.addMessage({
        role: 'assistant',
        content: response.content
      }, {
        agentId: this.id,
        tokens: response.usage?.outputTokens
      });

      // Extract and store any important information
      await this.extractAndStoreInsights(task, response.content);

      this.emit('task-completed', {
        agentId: this.id,
        taskId: task.id,
        response: response.content,
        usage: response.usage
      });

      return {
        success: true,
        result: response.content,
        usage: response.usage
      };

    } catch (error) {
      this.emit('task-failed', {
        agentId: this.id,
        taskId: task.id,
        error
      });
      throw error;
    }
  }

  /**
   * Collaborate with another agent
   */
  async collaborateWith(
    otherAgentId: string,
    message: string,
    sharedMemoryKeys?: string[]
  ): Promise<void> {
    // Store collaboration request
    await this.memory.store(`collab_${Date.now()}`, {
      withAgent: otherAgentId,
      message,
      timestamp: new Date()
    }, {
      type: 'short-term',
      tags: ['collaboration', otherAgentId],
      agentId: this.id
    });

    // Share specified memories if requested
    if (sharedMemoryKeys) {
      for (const key of sharedMemoryKeys) {
        const memory = await this.memory.get(key);
        if (memory) {
          this.emit('memory-shared', {
            fromAgent: this.id,
            toAgent: otherAgentId,
            key,
            value: memory.value
          });
        }
      }
    }

    this.emit('collaboration-initiated', {
      fromAgent: this.id,
      toAgent: otherAgentId,
      message
    });
  }

  /**
   * Get agent status
   */
  getStatus(): {
    id: string;
    type: string;
    active: boolean;
    memoryStats: any;
    contextStats: any;
    } {
    return {
      id: this.id,
      type: this.info.type || 'custom',
      active: this.isActive,
      memoryStats: this.memory.getStats(),
      contextStats: this.context.getStats()
    };
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    this.isActive = false;

    // Export current state
    const state = {
      context: this.context.exportContext(),
      timestamp: new Date()
    };

    await this.memory.store('shutdown_state', state, {
      type: 'long-term',
      importance: 0.8,
      tags: ['state', 'shutdown']
    });

    this.emit('shutdown', { agentId: this.id });
  }

  /**
   * Build system prompt based on agent type
   */
  private buildSystemPrompt(): string {
    const basePrompt = `You are AI agent ${this.id} with type: ${this.info.type}.`;

    const typePrompts: Record<string, string> = {
      researcher: 'You specialize in research, analysis, and information gathering. Provide thorough, well-sourced responses.',
      coder: 'You specialize in writing clean, efficient code. Follow best practices and include helpful comments.',
      analyst: 'You specialize in data analysis and insights. Provide clear, data-driven conclusions.',
      coordinator: 'You coordinate between multiple agents and manage workflows. Focus on clear communication and task delegation.'
    };

    const typeSpecific = typePrompts[this.info.type || ''] || 'You are a general-purpose AI assistant.';

    return `${basePrompt} ${typeSpecific}\n\nCapabilities: ${this.info.capabilities?.join(', ') || 'General assistance'}`;
  }

  /**
   * Search for relevant memories
   */
  private async searchRelevantMemories(query: string): Promise<any[]> {
    // Simple keyword extraction
    const keywords = query.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);

    const memories: any[] = [];

    for (const keyword of keywords) {
      const results = await this.memory.search({
        tags: [keyword],
        agentId: this.id,
        limit: 3,
        sortBy: 'importance'
      });
      memories.push(...results);
    }

    // Remove duplicates
    const uniqueMemories = Array.from(
      new Map(memories.map(m => [m.id, m])).values()
    );

    return uniqueMemories.slice(0, 5);
  }

  /**
   * Build enhanced prompt with context
   */
  private buildEnhancedPrompt(task: any, memories: any[]): string {
    let prompt = this.buildSystemPrompt();

    if (memories.length > 0) {
      prompt += '\n\nRelevant context from memory:';
      memories.forEach(memory => {
        prompt += `\n- ${memory.key}: ${JSON.stringify(memory.value)}`;
      });
    }

    if (task.context) {
      prompt += `\n\nTask context: ${JSON.stringify(task.context)}`;
    }

    return prompt;
  }

  /**
   * Extract and store insights from response
   */
  private async extractAndStoreInsights(task: any, response: string): Promise<void> {
    // Simple insight extraction (in production, use NLP)
    const insights: string[] = [];

    // Look for key patterns
    if (response.includes('Important:') || response.includes('Note:')) {
      const lines = response.split('\n');
      lines.forEach(line => {
        if (line.includes('Important:') || line.includes('Note:')) {
          insights.push(line);
        }
      });
    }

    if (insights.length > 0) {
      await this.memory.store(`insights_${task.id}`, {
        taskId: task.id,
        insights,
        timestamp: new Date()
      }, {
        type: 'long-term',
        importance: 0.8,
        tags: ['insights', task.type],
        agentId: this.id
      });
    }
  }

  /**
   * Setup event forwarding from services
   */
  private setupEventForwarding(): void {
    // Forward Claude events
    this.claude.on(ServiceEventType.CLAUDE_ERROR, (error) => {
      this.emit('service-error', { service: 'claude', agentId: this.id, error });
    });

    // Forward Memory events
    this.memory.on(ServiceEventType.MEMORY_PROMOTED, (data) => {
      this.emit('memory-promoted', { ...data, agentId: this.id });
    });

    // Forward Context events
    this.context.on(ServiceEventType.CONTEXT_WINDOW_SLID, (data) => {
      this.emit('context-adjusted', { ...data, agentId: this.id });
    });
  }
}

/**
 * Claude-Flow AI Orchestrator
 * Manages multiple AI agents and coordinates their activities
 */
export class ClaudeFlowAIOrchestrator extends EventEmitter {
  private agents: Map<string, AIAgent> = new Map();
  private sharedMemory: MemoryService;
  private config: ClaudeFlowAIConfig;

  constructor(config: ClaudeFlowAIConfig) {
    super();
    this.config = config;

    // Initialize shared memory for inter-agent communication
    this.sharedMemory = createMemoryService({
      persistencePath: `${config.memoryPath || './.claude'}/shared/memory`,
      maxShortTermSize: 2000
    });
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    await this.sharedMemory.initialize();
    this.emit('initialized');
  }

  /**
   * Spawn a new AI agent
   */
  async spawnAgent(info: AgentInfo): Promise<AIAgent> {
    if (this.agents.size >= (this.config.maxAgents || 10)) {
      throw new Error('Maximum number of agents reached');
    }

    const agent = new AIAgent(info, this.config);
    await agent.initialize();

    // Setup inter-agent communication
    agent.on('memory-shared', async (data) => {
      await this.handleMemorySharing(data);
    });

    agent.on('collaboration-initiated', async (data) => {
      await this.handleCollaboration(data);
    });

    this.agents.set(agent.id, agent);
    this.emit('agent-spawned', { agentId: agent.id, info });

    return agent;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AIAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all active agents
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map(agent => agent.info);
  }

  /**
   * Coordinate task execution across agents
   */
  async coordinateTask(task: {
    id: string;
    type: string;
    description: string;
    requiredAgentTypes?: string[];
    parallel?: boolean;
  }): Promise<any[]> {
    const eligibleAgents = this.selectAgentsForTask(task);

    if (eligibleAgents.length === 0) {
      throw new Error('No eligible agents found for task');
    }

    // Store task in shared memory
    await this.sharedMemory.store(`task_${task.id}`, {
      ...task,
      assignedAgents: eligibleAgents.map(a => a.id),
      status: 'in_progress'
    }, {
      type: 'short-term',
      importance: 0.8,
      tags: ['task', 'coordination']
    });

    if (task.parallel) {
      // Execute in parallel
      const results = await Promise.all(
        eligibleAgents.map(agent => agent.processTask(task))
      );
      return results;
    } else {
      // Execute sequentially
      const results = [];
      for (const agent of eligibleAgents) {
        const result = await agent.processTask(task);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Shutdown all agents
   */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.agents.values()).map(
      agent => agent.shutdown()
    );

    await Promise.all(shutdownPromises);
    this.agents.clear();
    this.emit('shutdown');
  }

  /**
   * Select agents for a task
   */
  private selectAgentsForTask(task: any): AIAgent[] {
    const agents = Array.from(this.agents.values());

    if (task.requiredAgentTypes) {
      return agents.filter(agent =>
        task.requiredAgentTypes.includes(agent.info.type || 'custom')
      );
    }

    // Simple selection based on agent type and task type
    const typeMatching: Record<string, string[]> = {
      research: ['researcher', 'analyst'],
      coding: ['coder'],
      analysis: ['analyst', 'researcher'],
      coordination: ['coordinator']
    };

    const preferredTypes = typeMatching[task.type] || [];

    return agents.filter(agent =>
      preferredTypes.includes(agent.info.type || '') ||
      agent.info.type === 'custom'
    );
  }

  /**
   * Handle memory sharing between agents
   */
  private async handleMemorySharing(data: any): Promise<void> {
    await this.sharedMemory.store(`shared_${Date.now()}`, {
      ...data,
      timestamp: new Date()
    }, {
      type: 'short-term',
      tags: ['shared', data.fromAgent, data.toAgent]
    });

    const targetAgent = this.agents.get(data.toAgent);
    if (targetAgent) {
      this.emit('memory-shared-with-agent', data);
    }
  }

  /**
   * Handle collaboration requests
   */
  private async handleCollaboration(data: any): Promise<void> {
    const targetAgent = this.agents.get(data.toAgent);
    if (targetAgent) {
      // Create a collaboration context
      await this.sharedMemory.store(`collab_${data.fromAgent}_${data.toAgent}`, {
        initiator: data.fromAgent,
        target: data.toAgent,
        message: data.message,
        status: 'active',
        timestamp: new Date()
      }, {
        type: 'short-term',
        importance: 0.7,
        tags: ['collaboration', data.fromAgent, data.toAgent]
      });

      this.emit('collaboration-established', data);
    }
  }
}

/**
 * Factory function to create AI orchestrator
 */
export function createClaudeFlowAI(config: ClaudeFlowAIConfig): ClaudeFlowAIOrchestrator {
  return new ClaudeFlowAIOrchestrator(config);
}