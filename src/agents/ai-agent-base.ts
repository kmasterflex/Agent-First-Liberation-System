/**
 * AI Agent Base Class - Foundation for AI-powered agents
 */

import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { AgentInterface, AgentConfig, AgentMessage, AgentRole, AgentStatus, AgentResponse, AIAnalysisResult } from '../types/agents.js';
import { logger } from '../utils/logger.js';

export interface AIAgentConfig extends AgentConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}


export abstract class AIAgentBase extends EventEmitter implements AgentInterface {
  public readonly id: string;
  public readonly name: string;
  public abstract readonly role: AgentRole;
  public abstract readonly description: string;

  protected config: AIAgentConfig;
  protected isActive: boolean = false;
  protected anthropic: Anthropic;
  protected model: string;
  protected maxTokens: number;
  protected temperature: number;
  protected systemPrompt: string;
  protected conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  protected contextMemory: Map<string, unknown> = new Map();

  constructor(config: AIAgentConfig) {
    super();
    this.config = config;
    this.id = `${this.constructor.name.toLowerCase()}-${Date.now()}`;
    this.name = config.name ?? this.constructor.name;

    // Initialize AI components
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key is required for AI agents');
    }

    this.anthropic = new Anthropic({ apiKey });
    this.model = config.model ?? 'claude-3-opus-20240229';
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature ?? 0.7;
    this.systemPrompt = config.systemPrompt ?? this.createSystemPrompt();
  }

  /**
   * Create the system prompt for this agent
   * Must be implemented by derived classes
   */
  protected abstract createSystemPrompt(): string;

  /**
   * Process AI-specific analysis
   * Must be implemented by derived classes
   */
  protected abstract processAIAnalysis(message: AgentMessage): Promise<AgentResponse>;

  async start(): Promise<void> {
    this.isActive = true;
    this.emit('agent:started', { agentId: this.id, role: this.role });
    logger.info(`${this.name} (AI) started`);
  }

  async stop(): Promise<void> {
    this.isActive = false;
    this.emit('agent:stopped', { agentId: this.id, role: this.role });
    logger.info(`${this.name} (AI) stopped`);
  }

  async processMessage(message: AgentMessage): Promise<AgentResponse> {
    if (!this.isActive) {
      throw new Error(`${this.name} is not active`);
    }

    logger.debug(`${this.name} processing message:`, message);

    // Add message to conversation history
    this.addToHistory('user', JSON.stringify(message));

    try {
      let result: AgentResponse;

      switch (message.type) {
        case 'query':
          result = await this.handleQuery(message);
          break;
        case 'command':
          result = await this.handleCommand(message);
          break;
        case 'proposal':
          result = await this.handleProposal(message);
          break;
        case 'event':
          result = await this.handleEvent(message);
          break;
        case 'report':
          result = await this.handleReport(message);
          break;
        default:
          result = await this.processAIAnalysis(message);
      }

      // Add result to history
      this.addToHistory('assistant', JSON.stringify(result));

      return result;
    } catch (error) {
      logger.error(`${this.name} error processing message:`, error);
      throw error;
    }
  }

  /**
   * Make an AI-powered decision or analysis
   */
  protected async makeAIDecision(prompt: string, context?: unknown): Promise<AIAnalysisResult> {
    const fullPrompt = context
      ? `${prompt}\n\nContext:\n${JSON.stringify(context, null, 2)}`
      : prompt;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages: [
        ...this.getRecentHistory(5),
        {
          role: 'user',
          content: fullPrompt
        }
      ]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    // Try to parse structured response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
      } catch (e) {
        // Fall back to text response
      }
    }

    return {
      analysis: content,
      confidence: 0.7,
      recommendations: this.extractRecommendations(content)
    };
  }

  /**
   * Generate insights using AI
   */
  protected async generateInsights(data: unknown, topic: string): Promise<string[]> {
    const prompt = `Analyze this ${topic} data and provide key insights:
${JSON.stringify(data, null, 2)}

Provide 3-5 specific, actionable insights in a JSON array format.`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0.5,
      system: this.systemPrompt,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        return [content];
      }
    }

    return content.split('\n').filter(line => line.trim()).slice(0, 5);
  }

  /**
   * Handle different message types with AI assistance
   */
  protected async handleQuery(message: AgentMessage): Promise<AgentResponse> {
    return this.processAIAnalysis(message);
  }

  protected async handleCommand(message: AgentMessage): Promise<AgentResponse> {
    return this.processAIAnalysis(message);
  }

  protected async handleProposal(message: AgentMessage): Promise<AgentResponse> {
    const analysis = await this.makeAIDecision(
      'Evaluate this proposal and provide detailed analysis with pros, cons, and recommendations',
      message.content
    );

    return {
      success: true,
      data: {
        proposalId: `prop-${Date.now()}`,
        analysis: analysis.analysis,
        confidence: analysis.confidence,
        recommendations: analysis.recommendations,
        decision: analysis.confidence > 0.7 ? 'recommended' : 'needs-review'
      },
      timestamp: new Date(),
      agentId: this.id,
      role: this.role
    };
  }

  protected async handleEvent(message: AgentMessage): Promise<AgentResponse> {
    return this.processAIAnalysis(message);
  }

  protected async handleReport(message: AgentMessage): Promise<AgentResponse> {
    const insights = await this.generateInsights(message.content, 'report');

    return {
      success: true,
      data: {
        reportId: `report-${Date.now()}`,
        insights
      },
      timestamp: new Date(),
      agentId: this.id,
      role: this.role
    };
  }

  /**
   * Conversation history management
   */
  protected addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });

    // Keep history manageable
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }
  }

  protected getRecentHistory(count: number): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.conversationHistory.slice(-count) as Array<{ role: 'user' | 'assistant'; content: string }>;
  }

  /**
   * Context memory management
   */
  protected storeContext(key: string, value: unknown): void {
    this.contextMemory.set(key, value);
  }

  protected getContext(key: string): unknown {
    return this.contextMemory.get(key);
  }

  protected getAllContext(): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    this.contextMemory.forEach((value, key) => {
      context[key] = value;
    });
    return context;
  }

  /**
   * Extract recommendations from AI response
   */
  private extractRecommendations(content: string): string[] {
    const recommendations: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/)) {
        recommendations.push(line.replace(/^[-•*\d.]\s+/, '').trim());
      }
    }

    return recommendations.slice(0, 5);
  }

  getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      isActive: this.isActive,
      stats: {
        uptime: this.isActive ? Date.now() - parseInt(this.id.split('-')[1]) : 0,
        conversationLength: this.conversationHistory.length,
        contextItems: this.contextMemory.size,
        model: this.model
      },
      metadata: {
        aiEnabled: true,
        model: this.model,
        temperature: this.temperature
      }
    };
  }
}