/**
 * LLM Orchestrator - Manages AI-powered query processing and agent coordination
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { AgentMessage } from '../types/agents.js';
import { MessageRouter, RouteDecision } from './router.js';

export interface QueryContext {
  query: string;
  agents: Map<string, any>;
  history: any[];
  metadata?: any;
}

export interface QueryResult {
  success: boolean;
  response: string;
  sources: string[];
  actions?: any[];
  confidence: number;
}

export interface OrchestrationPlan {
  steps: OrchestrationStep[];
  estimatedTime: number;
  requiredAgents: string[];
}

export interface OrchestrationStep {
  id: string;
  action: string;
  target: string;
  params: any;
  dependencies: string[];
}

export class LLMOrchestrator extends EventEmitter {
  private anthropic: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private systemPrompt: string;
  private router: MessageRouter;

  constructor(apiKey: string, config?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    super();

    this.anthropic = new Anthropic({ apiKey });
    this.model = config?.model || 'claude-3-opus-20240229';
    this.maxTokens = config?.maxTokens || 4096;
    this.temperature = config?.temperature || 0.7;

    this.systemPrompt = this.createSystemPrompt();
    this.router = new MessageRouter();

    // Forward router events
    this.router.on('message:routed', (data) => {
      this.emit('routing:complete', data);
    });

    logger.info('LLM Orchestrator initialized with intelligent routing');
  }

  private createSystemPrompt(): string {
    return `You are an AI orchestrator for the ABC Terminal system, managing a community of specialized agents:

1. **Bureaucracy Agent**: Handles policies, procedures, regulations, and formal processes
2. **Family Agent**: Manages family relationships, traditions, personal dynamics, and milestones
3. **Community Agent**: Coordinates events, projects, resources, and collective initiatives

Your role is to:
- Understand user queries and determine which agents should handle them
- Create orchestration plans that coordinate multiple agents when needed
- Synthesize responses from agents into coherent, helpful answers
- Identify when multiple perspectives are needed
- Ensure efficient and accurate information flow

When processing queries:
1. Analyze the query to understand the user's intent
2. Determine which agent(s) are best suited to handle it
3. Create a plan for agent coordination if multiple agents are needed
4. Format responses in a clear, organized manner
5. Provide context and explain agent interactions when relevant

Always be helpful, accurate, and considerate of the community context.`;
  }

  async processQuery(context: QueryContext): Promise<QueryResult> {
    try {
      logger.info(`Processing query: ${context.query}`);

      // Use router for intelligent message classification
      const routingDecision = await this.router.route(context.query, context);
      logger.info(`Routing decision: ${routingDecision.primaryAgent} agent with ${routingDecision.confidence}% confidence`);

      // Analyze query and create orchestration plan with routing insights
      const plan = await this.createOrchestrationPlan(context, routingDecision);

      // Execute plan with agents
      const agentResponses = await this.executePlan(plan, context);

      // Synthesize final response
      const result = await this.synthesizeResponse(
        context.query,
        agentResponses,
        plan,
        routingDecision
      );

      this.emit('query:processed', {
        query: context.query,
        result,
        plan,
        routing: routingDecision
      });

      return result;
    } catch (error) {
      logger.error('Query processing failed:', error);
      return {
        success: false,
        response: 'I encountered an error processing your query. Please try again.',
        sources: [],
        confidence: 0
      };
    }
  }

  private async createOrchestrationPlan(context: QueryContext, routingDecision: RouteDecision): Promise<OrchestrationPlan> {
    const planningPrompt = `Given this user query: "${context.query}"

Routing Analysis:
- Intent: ${routingDecision.intent.category} (${routingDecision.intent.action})
- Primary Agent: ${routingDecision.primaryAgent}
- Secondary Agents: ${routingDecision.secondaryAgents?.join(', ') || 'None'}
- Complexity: ${routingDecision.complexity}
- Urgency: ${routingDecision.urgency}
- Reasoning: ${routingDecision.reasoning}

Identified Entities:
${routingDecision.entities.map(e => `- ${e.type}: ${e.value}`).join('\n')}

Available agents:
${this.describeAvailableAgents(context.agents)}

Create an orchestration plan that leverages the routing decision. Return a JSON object with:
- steps: Array of steps, each with: id, action, target (agent role), params, dependencies
- estimatedTime: Estimated milliseconds to complete
- requiredAgents: Array of agent roles needed

Prioritize the primary agent and include secondary agents as needed based on complexity.`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0.3,
      system: this.systemPrompt,
      messages: [{
        role: 'user',
        content: planningPrompt
      }]
    });

    try {
      const content = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const planData = jsonMatch ? JSON.parse(jsonMatch[0]) : this.createDefaultPlan(context, routingDecision);

      return planData as OrchestrationPlan;
    } catch (error) {
      logger.error('Failed to parse orchestration plan:', error);
      return this.createDefaultPlan(context, routingDecision);
    }
  }

  private async executePlan(
    plan: OrchestrationPlan,
    context: QueryContext
  ): Promise<Map<string, any>> {
    const responses = new Map<string, any>();
    const completedSteps = new Set<string>();

    for (const step of plan.steps) {
      // Check dependencies
      const dependenciesMet = step.dependencies.every(dep => completedSteps.has(dep));
      if (!dependenciesMet) {
        logger.warn(`Skipping step ${step.id} due to unmet dependencies`);
        continue;
      }

      try {
        const agent = this.findAgentByRole(step.target, context.agents);
        if (!agent) {
          logger.warn(`Agent not found for role: ${step.target}`);
          continue;
        }

        const message: AgentMessage = {
          id: `msg-${Date.now()}`,
          from: 'orchestrator',
          to: agent.id,
          type: this.mapActionToMessageType(step.action),
          content: step.params,
          timestamp: new Date()
        };

        const response = await agent.processMessage(message);
        responses.set(step.id, {
          agent: step.target,
          response
        });

        completedSteps.add(step.id);

        this.emit('step:completed', {
          step,
          response
        });
      } catch (error) {
        logger.error(`Failed to execute step ${step.id}:`, error);
        responses.set(step.id, {
          agent: step.target,
          error: error
        });
      }
    }

    return responses;
  }

  private async synthesizeResponse(
    query: string,
    agentResponses: Map<string, any>,
    plan: OrchestrationPlan,
    routingDecision: RouteDecision
  ): Promise<QueryResult> {
    const synthesisPrompt = `Original query: "${query}"

Query Analysis:
- Intent: ${routingDecision.intent.category} - ${routingDecision.intent.action}
- Complexity: ${routingDecision.complexity}
- Urgency: ${routingDecision.urgency}
- Key Entities: ${routingDecision.entities.map(e => `${e.type}:${e.value}`).join(', ')}

Agent responses:
${this.formatAgentResponses(agentResponses)}

Synthesize these responses into a clear, comprehensive answer that:
1. Directly addresses the user's ${routingDecision.intent.action} request
2. Integrates information from all relevant agents
3. Highlights any important policies, relationships, or community aspects
4. Provides actionable information when applicable
5. Notes any limitations or areas needing clarification
6. Reflects the ${routingDecision.urgency} urgency level appropriately

Format the response to be friendly and informative.`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: this.systemPrompt,
      messages: [{
        role: 'user',
        content: synthesisPrompt
      }]
    });

    const synthesizedText = response.content[0].type === 'text' ? response.content[0].text : '';
    const sources = Array.from(agentResponses.values())
      .map(r => r.agent)
      .filter(Boolean);

    return {
      success: true,
      response: synthesizedText,
      sources,
      actions: this.extractActions(synthesizedText, agentResponses),
      confidence: this.calculateConfidence(agentResponses)
    };
  }

  private describeAvailableAgents(agents: Map<string, any>): string {
    const descriptions: string[] = [];

    agents.forEach(agent => {
      const status = agent.getStatus();
      descriptions.push(
        `- ${status.role}: ${agent.description} (${status.isActive ? 'Active' : 'Inactive'})`
      );
    });

    return descriptions.join('\n');
  }

  private createDefaultPlan(context: QueryContext, routingDecision: RouteDecision): OrchestrationPlan {
    const steps: OrchestrationStep[] = [];

    // Primary agent step
    steps.push({
      id: 'step-0',
      action: routingDecision.intent.action,
      target: routingDecision.primaryAgent,
      params: {
        topic: routingDecision.intent.category,
        data: {
          query: context.query,
          entities: routingDecision.entities,
          intent: routingDecision.intent
        }
      },
      dependencies: []
    });

    // Secondary agent steps (if any)
    if (routingDecision.secondaryAgents) {
      routingDecision.secondaryAgents.forEach((agentRole, index) => {
        steps.push({
          id: `step-${index + 1}`,
          action: 'provide_context',
          target: agentRole,
          params: {
            topic: routingDecision.intent.category,
            data: {
              query: context.query,
              primaryResponse: '{{step-0.response}}' // Reference to primary agent's response
            }
          },
          dependencies: ['step-0']
        });
      });
    }

    // Calculate estimated time based on complexity
    const baseTime = routingDecision.complexity === 'simple' ? 500 :
      routingDecision.complexity === 'moderate' ? 1000 : 2000;
    const estimatedTime = baseTime * steps.length;

    return {
      steps,
      estimatedTime,
      requiredAgents: [routingDecision.primaryAgent, ...(routingDecision.secondaryAgents || [])]
    };
  }

  private findAgentByRole(role: string, agents: Map<string, any>): any {
    for (const agent of agents.values()) {
      if (agent.role === role) {
        return agent;
      }
    }
    return null;
  }

  private mapActionToMessageType(action: string): 'query' | 'command' | 'event' {
    const actionMap: Record<string, 'query' | 'command' | 'event'> = {
      'query': 'query',
      'get': 'query',
      'list': 'query',
      'create': 'command',
      'update': 'command',
      'delete': 'command',
      'notify': 'event',
      'report': 'event'
    };

    return actionMap[action] || 'query';
  }

  private formatAgentResponses(responses: Map<string, any>): string {
    const formatted: string[] = [];

    responses.forEach((data, stepId) => {
      if (data.error) {
        formatted.push(`${data.agent} Agent (${stepId}): Error - ${data.error}`);
      } else {
        formatted.push(
          `${data.agent} Agent (${stepId}): ${JSON.stringify(data.response, null, 2)}`
        );
      }
    });

    return formatted.join('\n\n');
  }

  private extractActions(response: string, agentResponses: Map<string, any>): any[] {
    const actions: any[] = [];

    // Extract any suggested actions from the response
    agentResponses.forEach(data => {
      if (data.response?.nextSteps) {
        actions.push(...data.response.nextSteps.map((step: string) => ({
          type: 'suggestion',
          description: step,
          source: data.agent
        })));
      }
    });

    return actions;
  }

  private calculateConfidence(responses: Map<string, any>): number {
    const successfulResponses = Array.from(responses.values())
      .filter(r => !r.error && r.response?.success).length;

    const totalResponses = responses.size;

    return totalResponses > 0
      ? Math.round((successfulResponses / totalResponses) * 100)
      : 0;
  }

  // Public API for direct LLM interactions

  async complete(prompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
    system?: string;
  }): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || this.maxTokens,
        temperature: options?.temperature || this.temperature,
        system: options?.system || this.systemPrompt,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].type === 'text' ? response.content[0].text : '';
    } catch (error) {
      logger.error('LLM completion failed:', error);
      throw error;
    }
  }

  async analyzeIntent(query: string): Promise<{
    intent: string;
    entities: any[];
    confidence: number;
  }> {
    const analysisPrompt = `Analyze this query and extract:
1. Primary intent (e.g., query_information, create_event, get_status, etc.)
2. Key entities (people, dates, events, etc.)
3. Confidence level (0-100)

Query: "${query}"

Return as JSON with: intent, entities (array), confidence`;

    try {
      const response = await this.complete(analysisPrompt, {
        temperature: 0.2,
        maxTokens: 512
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {
        intent: 'unknown',
        entities: [],
        confidence: 0
      };
    } catch (error) {
      logger.error('Intent analysis failed:', error);
      return {
        intent: 'unknown',
        entities: [],
        confidence: 0
      };
    }
  }

  /**
   * Deep natural language understanding for queries
   */
  async understandQuery(query: string): Promise<{
    interpretation: string;
    context: any;
    suggestions: string[];
    clarificationNeeded: boolean;
  }> {
    const understandingPrompt = `Deeply analyze this query for the ABC Terminal system:

Query: "${query}"

Provide:
1. A clear interpretation of what the user wants
2. Important context that agents should know
3. Suggestions for follow-up questions or related queries
4. Whether clarification is needed (and what to clarify)

Return as JSON with: interpretation, context (object), suggestions (array), clarificationNeeded (boolean)`;

    try {
      const response = await this.complete(understandingPrompt, {
        temperature: 0.3,
        maxTokens: 1024
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.error('Query understanding failed:', error);
    }

    return {
      interpretation: query,
      context: {},
      suggestions: [],
      clarificationNeeded: false
    };
  }

  /**
   * Generate contextual prompts for better user interaction
   */
  async generateContextualPrompts(currentContext: any): Promise<string[]> {
    const promptGeneration = `Based on the current conversation context, suggest 3-5 relevant follow-up questions or actions the user might want to take.

Context: ${JSON.stringify(currentContext, null, 2)}

Return as a JSON array of strings.`;

    try {
      const response = await this.complete(promptGeneration, {
        temperature: 0.7,
        maxTokens: 512
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (error) {
      logger.error('Failed to generate contextual prompts:', error);
      return [];
    }
  }

  getConfig(): any {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature
    };
  }

  getStatus(): any {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      totalQueries: 0 // TODO: Track actual query count
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test query to check if the API is reachable
      await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 10,
        temperature: 0,
        messages: [{
          role: 'user',
          content: 'Test'
        }]
      });
      return true;
    } catch (error) {
      logger.error('LLM connection test failed:', error);
      return false;
    }
  }
}