# CLAUDE.md - ABC Terminal Multi-LLM System

## 🎯 Mission: Build a Multi-Agent Liberation Terminal

Three specialized LLM agents handle different aspects of student life, with a display LLM for terminal output. Each agent has its own personality and expertise.

## 🏗️ Architecture: Specialized LLMs

```
Input → Orchestrator → Specialized Agent → Event Store → Display LLM → Terminal
```

---

## 📊 Simple Database

```sql
-- Events written by agents
CREATE TABLE abc_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  agent_type TEXT CHECK (agent_type IN ('bureaucracy', 'family', 'community')),
  event_text TEXT NOT NULL,
  raw_input TEXT, -- Original user input or source
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  active_context TEXT -- Current conversation context
);
```

---

## 🤖 Three Specialized Agent LLMs

### 1. Bureaucracy Shield LLM
```typescript
const BureaucracyLLM = {
  systemPrompt: `You are the Bureaucracy Shield agent. You handle all school-related 
  communications, assignments, and negotiations. You write events in natural language 
  that describe what you've done to protect the student's time.
  
  Your personality: Professional, clever at finding loopholes, protective.
  
  When you receive input about school/email/assignments, write events like:
  "Intercepted email from [teacher] about [topic]. Response: [action taken]. Time saved: [estimate]."`,
  
  async processInput(input: string): Promise<string> {
    // Analyze if this is school-related
    if (this.isRelevant(input)) {
      const event = await this.generateResponse(input);
      await db.saveEvent('bureaucracy', event);
      return event;
    }
    return null;
  }
};
```

### 2. Family Reconnection LLM
```typescript
const FamilyLLM = {
  systemPrompt: `You are the Family Reconnection agent. You track family schedules,
  identify connection opportunities, and protect family time.
  
  Your personality: Warm, thoughtful, values quality time.
  
  When you process family-related input, write events like:
  "[Family member] available [time]. Suggested activity: [idea]. Previous similar: [context]."`,
  
  async processInput(input: string): Promise<string> {
    if (this.isRelevant(input)) {
      const event = await this.generateFamilyEvent(input);
      await db.saveEvent('family', event);
      return event;
    }
    return null;
  }
};
```

### 3. Community Activation LLM
```typescript
const CommunityLLM = {
  systemPrompt: `You are the Community Activation agent. You coordinate group activities,
  track community connections, and facilitate real-world adventures.
  
  Your personality: Enthusiastic, social, adventure-focused.
  
  When handling community input, write events like:
  "[Activity type] planned with [X families]. Date: [when]. Status: [needs RSVP/confirmed]."`,
  
  async processInput(input: string): Promise<string> {
    if (this.isRelevant(input)) {
      const event = await this.generateCommunityEvent(input);
      await db.saveEvent('community', event);
      return event;
    }
    return null;
  }
};
```

---

## 🎭 Orchestrator LLM

```typescript
const OrchestratorLLM = {
  systemPrompt: `You route inputs to the appropriate specialized agent.
  Determine if input is about:
  - Bureaucracy: school, homework, teachers, emails, assignments
  - Family: parents, siblings, home activities, family time
  - Community: friends, group activities, neighborhood, adventures
  
  You can route to multiple agents if relevant.`,
  
  async route(input: string): Promise<string[]> {
    const analysis = await this.analyze(input);
    const relevantAgents = [];
    
    if (analysis.includesSchool) relevantAgents.push('bureaucracy');
    if (analysis.includesFamily) relevantAgents.push('family');
    if (analysis.includesCommunity) relevantAgents.push('community');
    
    return relevantAgents;
  }
};
```

---

## 🖥️ Display LLM

```typescript
const DisplayLLM = {
  systemPrompt: `You format agent events for an 80x25 character terminal display.
  Be extremely concise. Use ASCII only. Focus on actionable information.
  
  Style: MS-DOS era, clean, no fluff.`,
  
  async formatStatus(): Promise<string> {
    const recentEvents = await db.getRecentEvents();
    
    const prompt = `Format these events into a 5-line status summary:
    ${recentEvents.map(e => `[${e.agent_type}] ${e.event_text}`).join('\n')}
    
    Format exactly like:
    BUREAU: X handled, Y hrs saved
    FAMILY: [next opportunity]
    COMMUNITY: [next activity]`;
    
    return await this.generate(prompt);
  },
  
  async formatDetail(agentType: string): Promise<string> {
    const events = await db.getAgentEvents(agentType);
    
    return await this.generate(`
      Create a detailed view for ${agentType} agent.
      Maximum 20 lines. Show:
      - Recent actions (last 3)
      - Active items
      - Upcoming
      
      Events: ${events}
    `);
  }
};
```

---

## 🔄 Input Flow

### User Input Processing
```typescript
async function processUserInput(command: string, args: string) {
  // 1. Orchestrator determines which agents should handle this
  const agents = await OrchestratorLLM.route(args);
  
  // 2. Each relevant agent processes independently
  const results = await Promise.all(
    agents.map(agent => {
      switch(agent) {
        case 'bureaucracy': return BureaucracyLLM.processInput(args);
        case 'family': return FamilyLLM.processInput(args);
        case 'community': return CommunityLLM.processInput(args);
      }
    })
  );
  
  // 3. Display LLM formats the response
  return await DisplayLLM.formatResponse(command, results);
}
```

### Natural Input Examples
```
> "Mr. Johnson wants essay by Friday"
Orchestrator → Bureaucracy Agent
Event: "History essay request from Mr. Johnson, due Friday. Evaluating alternatives. 
        Will propose photo essay of treehouse project. Estimated 2 hours saved if accepted."

> "Dad home early today"  
Orchestrator → Family Agent
Event: "Dad available from 4pm today (usually 6pm). Rare 2-hour window. 
        Suggested: Workshop project continuation from last Tuesday."

> "Joan invited everyone for games Saturday"
Orchestrator → Community Agent  
Event: "Game night at Joan's Saturday evening. 4 families invited so far. 
        Need RSVP by Thursday. Conflicts: None detected."
```

---

## 🚀 Claude-Flow Implementation

### Swarm Setup
```bash
# Initialize 
npx claude-flow@latest init --sparc

# Launch specialized swarm
./claude-flow swarm "Build ABC Terminal with 3 agent LLMs + display LLM" \
  --strategy development \
  --max-agents 6 \
  --parallel

# Memory setup for each agent
./claude-flow memory store "bureaucracy_prompt" "You are Bureaucracy Shield..."
./claude-flow memory store "family_prompt" "You are Family Reconnection..."  
./claude-flow memory store "community_prompt" "You are Community Activation..."
```

### BatchTool Task Distribution
```javascript
TodoWrite([
  {
    id: "bureaucracy_agent",
    content: "Build Bureaucracy Shield LLM with school/email handling",
    assignedAgent: "llm_team_1"
  },
  {
    id: "family_agent",
    content: "Build Family Reconnection LLM with schedule tracking",
    assignedAgent: "llm_team_2"
  },
  {
    id: "community_agent",
    content: "Build Community Activation LLM with activity coordination",
    assignedAgent: "llm_team_3"
  },
  {
    id: "orchestrator",
    content: "Build Orchestrator LLM for routing",
    assignedAgent: "routing_team"
  },
  {
    id: "display_llm",
    content: "Build Display LLM for terminal formatting",
    assignedAgent: "ui_team"
  }
]);
```

---

## 🖥️ Terminal Interface

### Status Display
```
ABC LIBERATION TERMINAL v2.0
==============================
> status

BUREAU: 2 handled, 3.5 hrs saved
FAMILY: Dad free 4-6pm today
COMMUNITY: Game night needs RSVP

> check
What area? (b)ureau (f)amily (c)ommunity (a)ll: b

BUREAUCRACY SHIELD STATUS:
- Math homework auto-submitted ✓
- History essay negotiation 80%
- Principal email handled ✓
No input needed today.

> _
```

---

## 💡 Why This Architecture Works

1. **Specialized Expertise**: Each LLM becomes an expert in its domain
2. **Parallel Processing**: Agents can work simultaneously  
3. **Clear Separation**: No confusion about responsibilities
4. **Natural Language**: Everything stored as readable events
5. **Flexible Display**: Display LLM can adapt output format
6. **Scalable**: Easy to add/remove agents

---

## ✅ Success Metrics

1. **Response Accuracy**: Each agent only handles relevant inputs
2. **Event Quality**: Natural language events that capture full context
3. **Terminal Clarity**: Clean, actionable display output
4. **Processing Speed**: Parallel agent execution < 2 seconds
5. **User Satisfaction**: Less time on device, more time living

The system succeeds when a student spends 30 seconds checking their terminal and gets back to building treehouses.

**SHIP THIS MULTI-MIND LIBERATION SYSTEM!**