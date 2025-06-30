#!/usr/bin/env node
/**
 * Test script for the AI-powered FamilyAgent
 */

import { FamilyAgent } from './src/agents/family.js';
import { AgentMessage } from './src/types/agents.js';

async function testFamilyAgent() {
  console.log('🧪 Testing AI-Powered Family Agent\n');

  // Create the AI-powered family agent
  const familyAgent = new FamilyAgent({
    name: 'AI Family Counselor',
    type: 'family'
  });

  // Start the agent
  await familyAgent.start();
  console.log('✅ Family Agent started\n');

  // Test 1: Relationship Advice
  console.log('📝 Test 1: Relationship Advice');
  const relationshipQuery: AgentMessage = {
    id: 'msg-001',
    from: 'test',
    to: familyAgent.id,
    type: 'query',
    content: {
      topic: 'relationship-advice',
      data: {
        situation: 'My teenage daughter and I have been arguing a lot lately. She feels I don\'t understand her, and I feel she doesn\'t respect my rules.',
        parties: ['parent', 'teenager'],
        duration: '3 months'
      }
    },
    timestamp: new Date()
  };

  const adviceResponse = await familyAgent.processMessage(relationshipQuery);
  console.log('Response:', JSON.stringify(adviceResponse, null, 2));
  console.log('\n---\n');

  // Test 2: Conflict Resolution
  console.log('📝 Test 2: Conflict Resolution');
  const conflictQuery: AgentMessage = {
    id: 'msg-002',
    from: 'test',
    to: familyAgent.id,
    type: 'query',
    content: {
      topic: 'conflict-resolution',
      data: {
        conflict: 'Siblings fighting over inheritance after parent\'s passing',
        parties: ['older sibling', 'younger sibling'],
        issues: ['fairness', 'emotional attachment', 'financial needs']
      }
    },
    timestamp: new Date()
  };

  const conflictResponse = await familyAgent.processMessage(conflictQuery);
  console.log('Response:', JSON.stringify(conflictResponse, null, 2));
  console.log('\n---\n');

  // Test 3: Emotional Support
  console.log('📝 Test 3: Emotional Support');
  const emotionalQuery: AgentMessage = {
    id: 'msg-003',
    from: 'test',
    to: familyAgent.id,
    type: 'query',
    content: {
      topic: 'emotional-support',
      data: {
        emotion: 'anxiety',
        situation: 'Worried about family gathering with relatives who have different political views',
        concerns: ['arguments', 'tension', 'ruining relationships']
      }
    },
    timestamp: new Date()
  };

  const emotionalResponse = await familyAgent.processMessage(emotionalQuery);
  console.log('Response:', JSON.stringify(emotionalResponse, null, 2));
  console.log('\n---\n');

  // Test 4: Intelligent Scheduling
  console.log('📝 Test 4: Intelligent Family Scheduling');
  const scheduleCommand: AgentMessage = {
    id: 'msg-004',
    from: 'test',
    to: familyAgent.id,
    type: 'command',
    content: {
      action: 'schedule-family-time',
      data: {
        familyMembers: ['Mom (works 9-5)', 'Dad (shift work)', 'Teen (school + sports)', 'Child (elementary school)'],
        goals: ['quality time', 'homework help', 'fun activities'],
        constraints: ['different schedules', 'teen wants independence', 'limited weekend time']
      }
    },
    timestamp: new Date()
  };

  const scheduleResponse = await familyAgent.processMessage(scheduleCommand);
  console.log('Response:', JSON.stringify(scheduleResponse, null, 2));
  console.log('\n---\n');

  // Test 5: Family Health Assessment
  console.log('📝 Test 5: Family Health Assessment');
  const healthQuery: AgentMessage = {
    id: 'msg-005',
    from: 'test',
    to: familyAgent.id,
    type: 'query',
    content: {
      topic: 'family-health',
      data: {
        familyId: 'family-1'
      }
    },
    timestamp: new Date()
  };

  const healthResponse = await familyAgent.processMessage(healthQuery);
  console.log('Response:', JSON.stringify(healthResponse, null, 2));
  console.log('\n---\n');

  // Get agent status
  const status = familyAgent.getStatus();
  console.log('📊 Agent Status:', JSON.stringify(status, null, 2));

  // Stop the agent
  await familyAgent.stop();
  console.log('\n✅ Family Agent stopped');
}

// Run the test
testFamilyAgent().catch(console.error);