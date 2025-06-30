/**
 * Example usage of the AI-powered CommunityAgent
 */

import { CommunityAgent } from '../src/agents/community.js';
import { AgentMessage } from '../src/types/agents.js';

async function demonstrateCommunityAgent() {
  console.log('🌟 AI-Powered Community Agent Demo\n');

  // Initialize the AI-powered Community Agent
  const communityAgent = new CommunityAgent({
    name: 'AI Community Coordinator',
    apiKey: process.env.ANTHROPIC_API_KEY, // Ensure you have this set
    model: 'claude-3-opus-20240229',
    temperature: 0.7
  });

  // Start the agent
  await communityAgent.start();
  console.log('✅ Community Agent started\n');

  // Example 1: AI-powered event planning
  console.log('📅 Example 1: AI Event Planning');
  const eventPlanningMessage: AgentMessage = {
    id: 'msg-001',
    from: 'user',
    to: communityAgent.id,
    type: 'query',
    content: {
      topic: 'event-planning',
      data: {
        name: 'Tech Skills Workshop for Seniors',
        type: 'educational',
        targetAudience: 'seniors',
        estimatedAttendees: 30,
        goals: ['Digital literacy', 'Social connection', 'Confidence building']
      }
    },
    timestamp: new Date()
  };

  const eventPlan = await communityAgent.processMessage(eventPlanningMessage);
  console.log('Event Planning Result:', JSON.stringify(eventPlan, null, 2));
  console.log('\n---\n');

  // Example 2: Social network analysis
  console.log('🔗 Example 2: Social Network Analysis');
  const networkAnalysisMessage: AgentMessage = {
    id: 'msg-002',
    from: 'user',
    to: communityAgent.id,
    type: 'query',
    content: {
      topic: 'network-analysis',
      data: {
        focus: 'identify isolated members and connection opportunities'
      }
    },
    timestamp: new Date()
  };

  const networkAnalysis = await communityAgent.processMessage(networkAnalysisMessage);
  console.log('Network Analysis:', JSON.stringify(networkAnalysis, null, 2));
  console.log('\n---\n');

  // Example 3: Group dynamics assessment
  console.log('👥 Example 3: Group Dynamics Assessment');
  const dynamicsMessage: AgentMessage = {
    id: 'msg-003',
    from: 'user',
    to: communityAgent.id,
    type: 'query',
    content: {
      topic: 'group-dynamics',
      data: {
        concern: 'community cohesion and engagement levels'
      }
    },
    timestamp: new Date()
  };

  const dynamicsAssessment = await communityAgent.processMessage(dynamicsMessage);
  console.log('Group Dynamics:', JSON.stringify(dynamicsAssessment, null, 2));
  console.log('\n---\n');

  // Example 4: Member matching for collaboration
  console.log('🤝 Example 4: AI Member Matching');
  const matchingMessage: AgentMessage = {
    id: 'msg-004',
    from: 'user',
    to: communityAgent.id,
    type: 'query',
    content: {
      topic: 'member-matching',
      data: {
        purpose: 'mentorship program',
        requirements: {
          skillGap: 'technology',
          timeCommitment: 'weekly',
          preferredFormat: 'one-on-one'
        }
      }
    },
    timestamp: new Date()
  };

  const matchingResult = await communityAgent.processMessage(matchingMessage);
  console.log('Member Matching:', JSON.stringify(matchingResult, null, 2));
  console.log('\n---\n');

  // Example 5: Conflict resolution assistance
  console.log('🕊️ Example 5: AI Conflict Resolution');
  const conflictMessage: AgentMessage = {
    id: 'msg-005',
    from: 'user',
    to: communityAgent.id,
    type: 'query',
    content: {
      topic: 'conflict-resolution',
      data: {
        parties: ['member-001', 'member-002'],
        issue: 'Disagreement over resource allocation for community garden',
        severity: 'medium',
        history: 'First time conflict between these members'
      }
    },
    timestamp: new Date()
  };

  const conflictResolution = await communityAgent.processMessage(conflictMessage);
  console.log('Conflict Resolution:', JSON.stringify(conflictResolution, null, 2));
  console.log('\n---\n');

  // Get agent status showing AI capabilities
  const status = communityAgent.getStatus();
  console.log('📊 Agent Status:', JSON.stringify(status, null, 2));

  // Stop the agent
  await communityAgent.stop();
  console.log('\n✅ Community Agent stopped');
}

// Run the demonstration
demonstrateCommunityAgent().catch(console.error);