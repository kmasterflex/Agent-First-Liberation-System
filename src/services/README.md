# AI Services Layer

This directory contains the core AI services for the Claude-Flow system, providing comprehensive integration with Claude API, memory management, and conversation context handling.

## Services Overview

### 1. Claude Service (`claude-service.ts`)
Comprehensive wrapper for Anthropic's Claude API with streaming support and error handling.

**Features:**
- Message sending with customizable parameters
- Streaming responses with event callbacks
- Conversation management
- API key validation
- Model selection and configuration
- Token usage tracking

**Example:**
```typescript
import { createClaudeService } from './services';

const claude = createClaudeService({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.7,
});

// Simple message
const response = await claude.sendMessage('Hello, Claude!');

// Streaming
await claude.streamMessage('Explain quantum computing', {
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (response) => console.log('Done!', response.usage),
});
```

### 2. Memory Service (`memory-service.ts`)
Agent memory management with short-term and long-term storage capabilities.

**Features:**
- Dual memory system (short-term with TTL, long-term persistent)
- Importance-based promotion to long-term memory
- Tag-based organization and search
- Memory persistence to disk
- Automatic cleanup of expired memories
- Export/import functionality

**Example:**
```typescript
import { createMemoryService } from './services';

const memory = createMemoryService({
  persistencePath: './.claude/memory',
  maxShortTermSize: 1000,
  shortTermTTL: 3600000, // 1 hour
  importanceThreshold: 0.7,
});

await memory.initialize();

// Store memory
await memory.store('user_preferences', {
  name: 'John',
  language: 'TypeScript',
}, {
  type: 'long-term',
  importance: 0.9,
  tags: ['user', 'preferences'],
});

// Search memories
const userMemories = await memory.search({
  tags: ['user'],
  minImportance: 0.5,
  sortBy: 'importance',
});
```

### 3. Context Service (`context-service.ts`)
Conversation context management with intelligent sliding window.

**Features:**
- Sliding window with multiple strategies (FIFO, importance, hybrid)
- Automatic summarization when window slides
- Token-aware message management
- Search and filtering capabilities
- Time-based message retrieval
- Context export/import

**Example:**
```typescript
import { createContextService } from './services';

const context = createContextService({
  maxWindowSize: 50,
  maxTokens: 3000,
  slidingStrategy: 'hybrid',
  summarizationThreshold: 0.8,
});

// Add messages
await context.addMessage({
  role: 'user',
  content: 'What is machine learning?',
}, {
  importance: 0.8,
  agentId: 'main',
});

// Get messages for API
const messages = context.getMessagesForAPI(2000); // Max 2000 tokens
```

## Integrated Usage

The services are designed to work together seamlessly. See `usage-example.ts` for comprehensive examples including:

1. **Basic Claude interaction** - Simple message sending and streaming
2. **Memory-enhanced conversation** - Using memory to provide context
3. **Context-managed conversation** - Managing conversation flow with sliding windows
4. **Integrated AI Agent** - Complete agent implementation using all services

### Creating an AI Agent

```typescript
import { AIAgent } from './services/usage-example';

// Create specialized agent
const agent = new AIAgent('research-agent', 
  'You are a research specialist focused on technical topics.'
);

await agent.initialize();

// Process messages with full context and memory
const response = await agent.processMessage(
  'Tell me about the latest developments in quantum computing'
);
```

## Configuration

### Environment Variables
```bash
# Required
ANTHROPIC_API_KEY=your_api_key_here

# Optional
CLAUDE_MODEL=claude-3-5-sonnet-20241022
CLAUDE_MAX_TOKENS=4096
CLAUDE_TEMPERATURE=0.7
```

### Service Options

**Claude Service:**
- `apiKey` (required): Anthropic API key
- `model`: Claude model to use (default: claude-3-5-sonnet-20241022)
- `maxTokens`: Maximum tokens for responses (default: 4096)
- `temperature`: Response randomness 0-1 (default: 0.7)
- `systemPrompt`: Default system prompt

**Memory Service:**
- `persistencePath`: Directory for long-term storage (default: ./.claude/memory)
- `maxShortTermSize`: Max short-term memories (default: 1000)
- `shortTermTTL`: Short-term memory lifetime in ms (default: 3600000)
- `importanceThreshold`: Auto-promotion threshold (default: 0.7)

**Context Service:**
- `maxWindowSize`: Max messages in window (default: 50)
- `maxTokens`: Max tokens in window (default: 4000)
- `slidingStrategy`: Window management strategy (default: 'hybrid')
- `summarizationThreshold`: When to trigger summary (default: 0.8)

## Events

All services extend EventEmitter and provide events for monitoring:

### Claude Service Events
- `chunk`: Streaming response chunk received
- `complete`: Response completed
- `error`: API error occurred

### Memory Service Events
- `initialized`: Service initialized
- `stored`: Memory stored
- `promoted`: Memory promoted to long-term
- `evicted`: Memory evicted (short-term)
- `expired`: Memory expired
- `deleted`: Memory deleted
- `cleared`: Memory cleared

### Context Service Events
- `message-added`: Message added to context
- `window-slid`: Context window adjusted
- `summary-created`: Summary generated
- `context-cleared`: Context cleared
- `importance-updated`: Message importance changed

## Testing

Run the comprehensive test suite:

```bash
npm test src/services/__tests__/services.test.ts
```

Tests include:
- Unit tests for each service
- Integration tests for service interaction
- Mock Claude API responses
- Memory persistence testing
- Context window management
- Event emission verification

## Best Practices

1. **Initialize services early**: Always call `initialize()` on memory service before use
2. **Handle errors gracefully**: Use try-catch blocks and listen to error events
3. **Monitor token usage**: Track token consumption to stay within limits
4. **Clean up resources**: Clear memory/context when switching contexts
5. **Use appropriate memory types**: Short-term for temporary data, long-term for persistent
6. **Set importance accurately**: Helps with memory promotion and context sliding
7. **Tag memories consistently**: Enables effective searching and organization
8. **Export state periodically**: Backup agent state for recovery

## Performance Considerations

- **Memory**: Long-term memories are persisted to disk; consider SSD for better performance
- **Context**: Sliding window prevents unbounded growth; tune window size for your use case
- **Streaming**: Use streaming for long responses to improve perceived performance
- **Batch operations**: Use `addMessages()` for bulk context updates

## Security Notes

- Store API keys in environment variables, never in code
- Sanitize user input before storing in memory
- Consider encrypting persisted memory for sensitive data
- Implement rate limiting for API calls
- Monitor token usage to prevent abuse