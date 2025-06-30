/**
 * LLM Router - Intelligent message classification and agent selection
 */

import { EventEmitter } from 'events';
import { AgentRole } from '../types/agents.js';
import { logger } from '../utils/logger.js';

export interface RouteDecision {
  primaryAgent: AgentRole;
  secondaryAgents?: AgentRole[];
  confidence: number;
  reasoning: string;
  intent: MessageIntent;
  entities: ExtractedEntity[];
  urgency: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface MessageIntent {
  category: IntentCategory;
  action: string;
  subIntents?: string[];
}

export type IntentCategory =
  | 'policy_inquiry'        // Questions about rules, procedures, guidelines
  | 'family_matter'         // Personal relationships, family events, traditions
  | 'community_activity'    // Events, projects, social initiatives
  | 'resource_management'   // Allocation, sharing, community resources
  | 'conflict_resolution'   // Disputes, complaints, mediation
  | 'information_request'   // General queries, status updates
  | 'action_request'        // Create, update, delete operations
  | 'cross_domain'          // Requires multiple agent coordination
  | 'unknown';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  context?: string;
}

export type EntityType =
  | 'person'
  | 'date'
  | 'location'
  | 'event'
  | 'policy'
  | 'family_role'
  | 'community_role'
  | 'resource'
  | 'time_period'
  | 'quantity'
  | 'emotion'
  | 'action';

export interface RoutingRule {
  patterns: RegExp[];
  keywords: string[];
  intent: IntentCategory;
  primaryAgent: AgentRole;
  confidence: number;
}

export class MessageRouter extends EventEmitter {
  private routingRules: RoutingRule[];
  private intentKeywords: Map<IntentCategory, string[]>;
  private agentCapabilities: Map<AgentRole, string[]>;

  constructor() {
    super();
    this.routingRules = this.initializeRoutingRules();
    this.intentKeywords = this.initializeIntentKeywords();
    this.agentCapabilities = this.initializeAgentCapabilities();
  }

  /**
   * Route a message to the appropriate agent(s) using AI-powered analysis
   */
  async route(message: string, context?: any): Promise<RouteDecision> {
    logger.info(`Routing message: ${message.substring(0, 50)}...`);

    // Extract entities from the message
    const entities = this.extractEntities(message);

    // Classify intent using pattern matching and keywords
    const intent = this.classifyIntent(message, entities);

    // Determine complexity and urgency
    const complexity = this.assessComplexity(message, entities, intent);
    const urgency = this.assessUrgency(message, entities, intent);

    // Select appropriate agents
    const agentSelection = this.selectAgents(intent, entities, complexity);

    // Build routing decision
    const decision: RouteDecision = {
      primaryAgent: agentSelection.primary,
      secondaryAgents: agentSelection.secondary.length > 0 ? agentSelection.secondary : undefined,
      confidence: agentSelection.confidence,
      reasoning: this.generateReasoning(intent, entities, agentSelection),
      intent,
      entities,
      urgency,
      complexity
    };

    this.emit('message:routed', {
      message,
      decision,
      timestamp: new Date()
    });

    return decision;
  }

  /**
   * Extract entities from the message using pattern recognition
   */
  private extractEntities(message: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const lowerMessage = message.toLowerCase();

    // Extract dates and times
    const datePatterns = [
      /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
      /\b(today|tomorrow|yesterday|next\s+\w+|last\s+\w+)\b/gi,
      /\b(\d{1,2}:\d{2}\s*[ap]m?)\b/gi,
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi
    ];

    datePatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        matches.forEach(match => {
          entities.push({
            type: 'date',
            value: match,
            confidence: 0.9
          });
        });
      }
    });

    // Extract person names (simple heuristic - capitalized words)
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const names = message.match(namePattern);
    if (names) {
      names.forEach(name => {
        // Filter out common non-names
        const nonNames = ['The', 'This', 'That', 'What', 'When', 'Where', 'Why', 'How'];
        if (!nonNames.includes(name)) {
          entities.push({
            type: 'person',
            value: name,
            confidence: 0.7
          });
        }
      });
    }

    // Extract family roles
    const familyRoles = ['mother', 'father', 'sister', 'brother', 'parent', 'child', 'son', 'daughter',
      'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'spouse', 'husband', 'wife'];
    familyRoles.forEach(role => {
      if (lowerMessage.includes(role)) {
        entities.push({
          type: 'family_role',
          value: role,
          confidence: 0.95
        });
      }
    });

    // Extract emotions
    const emotions = ['happy', 'sad', 'angry', 'frustrated', 'excited', 'worried', 'anxious',
      'concerned', 'pleased', 'disappointed', 'grateful', 'confused'];
    emotions.forEach(emotion => {
      if (lowerMessage.includes(emotion)) {
        entities.push({
          type: 'emotion',
          value: emotion,
          confidence: 0.85
        });
      }
    });

    // Extract quantities
    const quantityPattern = /\b(\d+)\s*(people|persons|members|participants|attendees|dollars?|\$)/gi;
    const quantities = message.match(quantityPattern);
    if (quantities) {
      quantities.forEach(qty => {
        entities.push({
          type: 'quantity',
          value: qty,
          confidence: 0.9
        });
      });
    }

    return entities;
  }

  /**
   * Classify the intent of the message
   */
  private classifyIntent(message: string, entities: ExtractedEntity[]): MessageIntent {
    const lowerMessage = message.toLowerCase();
    let bestMatch: { category: IntentCategory; score: number; action: string } = {
      category: 'unknown',
      score: 0,
      action: 'unknown'
    };

    // Check routing rules first
    for (const rule of this.routingRules) {
      let score = 0;

      // Check patterns
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          score += 3;
        }
      }

      // Check keywords
      for (const keyword of rule.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      if (score > bestMatch.score) {
        bestMatch = {
          category: rule.intent,
          score,
          action: this.inferAction(message, rule.intent)
        };
      }
    }

    // Determine sub-intents based on entities and keywords
    const subIntents = this.identifySubIntents(message, bestMatch.category, entities);

    return {
      category: bestMatch.category,
      action: bestMatch.action,
      subIntents: subIntents.length > 0 ? subIntents : undefined
    };
  }

  /**
   * Infer the action from the message and intent category
   */
  private inferAction(message: string, category: IntentCategory): string {
    const lowerMessage = message.toLowerCase();

    // Query actions
    if (lowerMessage.includes('what') || lowerMessage.includes('how') ||
        lowerMessage.includes('when') || lowerMessage.includes('who') ||
        lowerMessage.includes('tell me') || lowerMessage.includes('show me')) {
      return 'query';
    }

    // Creation actions
    if (lowerMessage.includes('create') || lowerMessage.includes('add') ||
        lowerMessage.includes('new') || lowerMessage.includes('register')) {
      return 'create';
    }

    // Update actions
    if (lowerMessage.includes('update') || lowerMessage.includes('change') ||
        lowerMessage.includes('modify') || lowerMessage.includes('edit')) {
      return 'update';
    }

    // Delete actions
    if (lowerMessage.includes('delete') || lowerMessage.includes('remove') ||
        lowerMessage.includes('cancel')) {
      return 'delete';
    }

    // List actions
    if (lowerMessage.includes('list') || lowerMessage.includes('show all') ||
        lowerMessage.includes('get all')) {
      return 'list';
    }

    // Default based on category
    switch (category) {
      case 'policy_inquiry':
      case 'information_request':
        return 'query';
      case 'community_activity':
      case 'family_matter':
        return 'manage';
      case 'conflict_resolution':
        return 'resolve';
      case 'resource_management':
        return 'allocate';
      default:
        return 'process';
    }
  }

  /**
   * Identify sub-intents based on the main intent and context
   */
  private identifySubIntents(message: string, category: IntentCategory, entities: ExtractedEntity[]): string[] {
    const subIntents: string[] = [];
    const lowerMessage = message.toLowerCase();

    switch (category) {
      case 'family_matter':
        if (entities.some(e => e.type === 'emotion')) {
          subIntents.push('emotional_support');
        }
        if (lowerMessage.includes('tradition') || lowerMessage.includes('custom')) {
          subIntents.push('cultural_guidance');
        }
        if (lowerMessage.includes('conflict') || lowerMessage.includes('disagree')) {
          subIntents.push('mediation');
        }
        break;

      case 'community_activity':
        if (lowerMessage.includes('volunteer') || lowerMessage.includes('help')) {
          subIntents.push('volunteer_coordination');
        }
        if (lowerMessage.includes('fund') || lowerMessage.includes('money')) {
          subIntents.push('fundraising');
        }
        if (entities.some(e => e.type === 'date')) {
          subIntents.push('scheduling');
        }
        break;

      case 'policy_inquiry':
        if (lowerMessage.includes('violat') || lowerMessage.includes('break')) {
          subIntents.push('compliance_check');
        }
        if (lowerMessage.includes('appeal') || lowerMessage.includes('exception')) {
          subIntents.push('exception_request');
        }
        break;
    }

    return subIntents;
  }

  /**
   * Assess the complexity of the request
   */
  private assessComplexity(message: string, entities: ExtractedEntity[], intent: MessageIntent): 'simple' | 'moderate' | 'complex' {
    let complexityScore = 0;

    // Length of message
    if (message.length > 200) complexityScore += 2;
    else if (message.length > 100) complexityScore += 1;

    // Number of entities
    if (entities.length > 5) complexityScore += 2;
    else if (entities.length > 2) complexityScore += 1;

    // Multiple domains
    const entityTypes = new Set(entities.map(e => e.type));
    if (entityTypes.size > 3) complexityScore += 2;

    // Cross-domain intent
    if (intent.category === 'cross_domain') complexityScore += 3;

    // Sub-intents
    if (intent.subIntents && intent.subIntents.length > 1) complexityScore += 1;

    // Determine complexity level
    if (complexityScore >= 5) return 'complex';
    if (complexityScore >= 2) return 'moderate';
    return 'simple';
  }

  /**
   * Assess the urgency of the request
   */
  private assessUrgency(message: string, entities: ExtractedEntity[], intent: MessageIntent): 'low' | 'medium' | 'high' {
    const lowerMessage = message.toLowerCase();
    let urgencyScore = 0;

    // Urgent keywords
    const urgentKeywords = ['urgent', 'emergency', 'immediate', 'asap', 'quickly', 'now', 'today', 'critical'];
    urgentKeywords.forEach(keyword => {
      if (lowerMessage.includes(keyword)) urgencyScore += 3;
    });

    // Emotion-based urgency
    const urgentEmotions = ['angry', 'frustrated', 'worried', 'anxious'];
    entities.filter(e => e.type === 'emotion' && urgentEmotions.includes(e.value))
      .forEach(() => urgencyScore += 2);

    // Intent-based urgency
    if (intent.category === 'conflict_resolution') urgencyScore += 2;
    if (intent.action === 'delete' || intent.action === 'cancel') urgencyScore += 1;

    // Time-based urgency
    const todayMentioned = lowerMessage.includes('today') || lowerMessage.includes('tonight');
    if (todayMentioned) urgencyScore += 2;

    // Determine urgency level
    if (urgencyScore >= 5) return 'high';
    if (urgencyScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Select appropriate agents based on intent and context
   */
  private selectAgents(
    intent: MessageIntent,
    entities: ExtractedEntity[],
    complexity: 'simple' | 'moderate' | 'complex'
  ): { primary: AgentRole; secondary: AgentRole[]; confidence: number } {
    let primary: AgentRole;
    const secondary: AgentRole[] = [];
    let confidence = 0;

    // Primary agent selection based on intent
    switch (intent.category) {
      case 'policy_inquiry':
      case 'conflict_resolution':
        primary = 'bureaucracy';
        confidence = 0.9;
        break;

      case 'family_matter':
        primary = 'family';
        confidence = 0.95;
        break;

      case 'community_activity':
      case 'resource_management':
        primary = 'community';
        confidence = 0.9;
        break;

      case 'cross_domain':
        // Determine primary based on entities
        const hasFamilyEntity = entities.some(e => e.type === 'family_role');
        const hasPolicyKeyword = entities.some(e => e.value.toLowerCase().includes('policy') || e.value.toLowerCase().includes('rule'));

        if (hasFamilyEntity) {
          primary = 'family';
          secondary.push('community', 'bureaucracy');
        } else if (hasPolicyKeyword) {
          primary = 'bureaucracy';
          secondary.push('community');
        } else {
          primary = 'community';
          secondary.push('family', 'bureaucracy');
        }
        confidence = 0.7;
        break;

      default:
        // Default to community for general requests
        primary = 'community';
        confidence = 0.6;
    }

    // Add secondary agents for complex queries
    if (complexity === 'complex' && secondary.length === 0) {
      // Add other agents that might provide context
      const allAgents: AgentRole[] = ['bureaucracy', 'family', 'community'];
      allAgents.forEach(agent => {
        if (agent !== primary && !secondary.includes(agent)) {
          secondary.push(agent);
        }
      });
      confidence *= 0.9; // Slightly lower confidence for complex queries
    }

    // Adjust based on specific entity combinations
    if (entities.some(e => e.type === 'policy') && !secondary.includes('bureaucracy') && primary !== 'bureaucracy') {
      secondary.unshift('bureaucracy');
    }

    return { primary, secondary, confidence };
  }

  /**
   * Generate human-readable reasoning for the routing decision
   */
  private generateReasoning(
    intent: MessageIntent,
    entities: ExtractedEntity[],
    agentSelection: { primary: AgentRole; secondary: AgentRole[]; confidence: number }
  ): string {
    const reasons: string[] = [];

    // Intent-based reasoning
    const intentDescriptions: Record<IntentCategory, string> = {
      policy_inquiry: 'This appears to be a question about policies or procedures',
      family_matter: 'This involves family relationships or personal matters',
      community_activity: 'This relates to community events or collective activities',
      resource_management: 'This concerns the allocation or management of community resources',
      conflict_resolution: 'This appears to involve a dispute or conflict that needs resolution',
      information_request: 'This is a general request for information',
      action_request: 'This requires performing a specific action or operation',
      cross_domain: 'This query spans multiple domains and requires coordination',
      unknown: 'The intent of this message is unclear'
    };

    reasons.push(intentDescriptions[intent.category]);

    // Entity-based reasoning
    const entityTypes = [...new Set(entities.map(e => e.type))];
    if (entityTypes.length > 0) {
      reasons.push(`I identified ${entityTypes.join(', ')} in the message`);
    }

    // Agent selection reasoning
    reasons.push(`The ${agentSelection.primary} agent is best suited as the primary handler`);

    if (agentSelection.secondary.length > 0) {
      reasons.push(`The ${agentSelection.secondary.join(' and ')} agent(s) may provide additional context`);
    }

    return `${reasons.join('. ')  }.`;
  }

  /**
   * Initialize routing rules
   */
  private initializeRoutingRules(): RoutingRule[] {
    return [
      // Bureaucracy rules
      {
        patterns: [/\b(policy|rule|regulation|procedure|guideline|compliance)\b/i],
        keywords: ['policy', 'rule', 'regulation', 'procedure', 'guideline', 'process', 'protocol'],
        intent: 'policy_inquiry',
        primaryAgent: 'bureaucracy',
        confidence: 0.9
      },
      {
        patterns: [/\b(complaint|violation|report|appeal|dispute)\b/i],
        keywords: ['complaint', 'violation', 'report', 'appeal', 'dispute', 'grievance'],
        intent: 'conflict_resolution',
        primaryAgent: 'bureaucracy',
        confidence: 0.85
      },

      // Family rules
      {
        patterns: [/\b(family|parent|child|sibling|relative|marriage|divorce)\b/i],
        keywords: ['family', 'mother', 'father', 'parent', 'child', 'sibling', 'marriage', 'relationship'],
        intent: 'family_matter',
        primaryAgent: 'family',
        confidence: 0.95
      },

      // Community rules
      {
        patterns: [/\b(event|meeting|gathering|festival|celebration|volunteer)\b/i],
        keywords: ['event', 'meeting', 'gathering', 'festival', 'party', 'volunteer', 'organize'],
        intent: 'community_activity',
        primaryAgent: 'community',
        confidence: 0.9
      },
      {
        patterns: [/\b(resource|fund|budget|allocation|share|distribute)\b/i],
        keywords: ['resource', 'fund', 'budget', 'money', 'allocate', 'distribute', 'share'],
        intent: 'resource_management',
        primaryAgent: 'community',
        confidence: 0.85
      }
    ];
  }

  /**
   * Initialize intent keywords
   */
  private initializeIntentKeywords(): Map<IntentCategory, string[]> {
    const keywords = new Map<IntentCategory, string[]>();

    keywords.set('policy_inquiry', ['policy', 'rule', 'regulation', 'allowed', 'permitted', 'forbidden', 'guidelines']);
    keywords.set('family_matter', ['family', 'parent', 'child', 'relative', 'personal', 'tradition', 'heritage']);
    keywords.set('community_activity', ['event', 'activity', 'volunteer', 'participate', 'organize', 'community']);
    keywords.set('resource_management', ['resource', 'budget', 'fund', 'allocate', 'distribute', 'share']);
    keywords.set('conflict_resolution', ['conflict', 'dispute', 'complaint', 'problem', 'issue', 'resolve']);
    keywords.set('information_request', ['what', 'how', 'when', 'where', 'who', 'tell', 'show', 'explain']);
    keywords.set('action_request', ['create', 'update', 'delete', 'add', 'remove', 'change', 'modify']);
    keywords.set('cross_domain', ['and', 'also', 'both', 'multiple', 'various', 'coordination']);

    return keywords;
  }

  /**
   * Initialize agent capabilities
   */
  private initializeAgentCapabilities(): Map<AgentRole, string[]> {
    const capabilities = new Map<AgentRole, string[]>();

    capabilities.set('bureaucracy', [
      'policy_management',
      'procedure_enforcement',
      'compliance_checking',
      'dispute_resolution',
      'documentation',
      'formal_processes'
    ]);

    capabilities.set('family', [
      'relationship_management',
      'tradition_preservation',
      'personal_support',
      'family_dynamics',
      'milestone_tracking',
      'heritage_documentation'
    ]);

    capabilities.set('community', [
      'event_organization',
      'resource_coordination',
      'volunteer_management',
      'project_leadership',
      'community_building',
      'collective_initiatives'
    ]);

    return capabilities;
  }

  /**
   * Get routing statistics
   */
  getRoutingStats(): { totalRules: number; intents: IntentCategory[]; agents: AgentRole[] } {
    return {
      totalRules: this.routingRules.length,
      intents: Array.from(this.intentKeywords.keys()),
      agents: Array.from(this.agentCapabilities.keys())
    };
  }
}