/**
 * Agent Tests
 */

import { BureaucracyAgent } from '../agents/bureaucracy.js';
import { FamilyAgent } from '../agents/family.js';
import { CommunityAgent } from '../agents/community.js';
import { AgentMessage } from '../types/agents.js';

describe('Agent Tests', () => {
  describe('BureaucracyAgent', () => {
    let agent: BureaucracyAgent;

    beforeEach(() => {
      agent = new BureaucracyAgent({ name: 'Test Bureaucracy Agent' });
    });

    afterEach(async () => {
      if (agent) {
        await agent.stop();
      }
    });

    test('should initialize with correct properties', () => {
      expect(agent.name).toBe('Test Bureaucracy Agent');
      expect(agent.role).toBe('bureaucracy');
      expect(agent.id).toMatch(/^bureaucracy-\d+$/);
    });

    test('should start and stop correctly', async () => {
      await agent.start();
      let status = agent.getStatus();
      expect(status.isActive).toBe(true);

      await agent.stop();
      status = agent.getStatus();
      expect(status.isActive).toBe(false);
    });

    test('should process query messages', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'test-msg-1',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'policies',
          data: {}
        },
        timestamp: new Date()
      };

      const response = await agent.processMessage(message);
      expect(response).toBeDefined();
      expect(Array.isArray(response)).toBe(true);
    });
  });

  describe('FamilyAgent', () => {
    let agent: FamilyAgent;

    beforeEach(() => {
      agent = new FamilyAgent({ name: 'Test Family Agent' });
    });

    afterEach(async () => {
      if (agent) {
        await agent.stop();
      }
    });

    test('should initialize with correct properties', () => {
      expect(agent.name).toBe('Test Family Agent');
      expect(agent.role).toBe('family');
      expect(agent.id).toMatch(/^family-\d+$/);
    });

    test('should handle family queries', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'test-msg-2',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'family-info',
          data: {}
        },
        timestamp: new Date()
      };

      const response = await agent.processMessage(message);
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
    });
  });

  describe('CommunityAgent', () => {
    let agent: CommunityAgent;

    beforeEach(() => {
      agent = new CommunityAgent({ name: 'Test Community Agent' });
    });

    afterEach(async () => {
      if (agent) {
        await agent.stop();
      }
    });

    test('should initialize with correct properties', () => {
      expect(agent.name).toBe('Test Community Agent');
      expect(agent.role).toBe('community');
      expect(agent.id).toMatch(/^community-\d+$/);
    });

    test('should return community statistics', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'test-msg-3',
        from: 'test',
        to: agent.id,
        type: 'query',
        content: {
          topic: 'statistics',
          data: {}
        },
        timestamp: new Date()
      };

      const response = await agent.processMessage(message);
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.statistics).toBeDefined();
    });

    test('should handle event creation', async () => {
      await agent.start();

      const message: AgentMessage = {
        id: 'test-msg-4',
        from: 'test',
        to: agent.id,
        type: 'command',
        content: {
          action: 'create-event',
          data: {
            name: 'Test Event',
            type: 'social',
            date: new Date().toISOString(),
            location: 'Test Location',
            organizer: 'test-organizer'
          }
        },
        timestamp: new Date()
      };

      const response = await agent.processMessage(message);
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.eventId).toBeDefined();
    });
  });
});