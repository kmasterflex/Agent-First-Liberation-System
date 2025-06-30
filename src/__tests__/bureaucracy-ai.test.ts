/**
 * Tests for AI-powered BureaucracyAgent
 */

import { BureaucracyAgent } from '../agents/bureaucracy.js';
import { AgentMessage } from '../types/agents.js';

describe('AI BureaucracyAgent', () => {
  let agent: BureaucracyAgent;

  beforeEach(() => {
    // Mock environment for testing
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key';

    agent = new BureaucracyAgent({
      name: 'Test Bureaucracy Agent',
      temperature: 0.5
    });
  });

  afterEach(async () => {
    if (agent) {
      await agent.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with AI capabilities', () => {
      expect(agent.role).toBe('bureaucracy');
      expect(agent.description).toContain('AI-powered');
      expect(agent.getStatus().aiEnabled).toBe(true);
    });

    it('should have specialized capabilities', () => {
      const status = agent.getStatus();
      expect(status.capabilities.specialized).toContain('Homework deadline management');
      expect(status.capabilities.specialized).toContain('Professional email composition');
      expect(status.capabilities.specialized).toContain('Teacher negotiation strategies');
    });
  });

  describe('Homework Management', () => {
    it('should track homework assignments', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'msg-1',
        from: 'test',
        to: agent.id,
        type: 'command',
        content: {
          action: 'track-homework',
          data: {
            subject: 'Mathematics',
            title: 'Calculus Problem Set 5',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            requirements: ['Complete all problems', 'Show all work']
          }
        },
        timestamp: new Date()
      };

      const result = await agent.processMessage(message);

      expect(result.success).toBe(true);
      expect(result.homeworkId).toBeDefined();
      expect(result.reminders).toBeInstanceOf(Array);
      expect(result.reminders.length).toBeGreaterThan(0);
    });

    it('should get homework status with AI insights', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'msg-2',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'homework-status'
        },
        timestamp: new Date()
      };

      const result = await agent.processMessage(message);

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Email Generation', () => {
    it('should generate email from template', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'msg-3',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'email-draft',
          data: {
            type: 'extension-request',
            recipient: 'professor@university.edu',
            context: {
              assignment: 'Research Paper',
              currentDeadline: 'Friday',
              requestedDeadline: 'Monday'
            }
          }
        },
        timestamp: new Date()
      };

      const result = await agent.processMessage(message);

      expect(result.success).toBe(true);
      expect(result.email).toBeDefined();
      expect(result.email.subject).toContain('Extension Request');
      expect(result.tips).toBeInstanceOf(Array);
    });
  });

  describe('Policy Interpretation', () => {
    it('should interpret policies with AI analysis', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'msg-4',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'policy-interpretation',
          data: {
            policyId: 'late-submission',
            situation: 'Technical issues prevented submission'
          }
        },
        timestamp: new Date()
      };

      const result = await agent.processMessage(message);

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.compliance).toBeDefined();
      expect(result.analysis.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Status Reporting', () => {
    it('should provide comprehensive status with bureaucracy stats', async () => {
      await agent.start();

      const status = agent.getStatus();

      expect(status.bureaucracyStats).toBeDefined();
      expect(status.bureaucracyStats.homeworkAssignments).toBeDefined();
      expect(status.bureaucracyStats.emailTemplates).toBeGreaterThan(0);
      expect(status.bureaucracyStats.policies).toBeGreaterThan(0);
    });
  });
});