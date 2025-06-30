# ABC Terminal

Agent-Based Community Terminal - A sophisticated terminal application that orchestrates multiple AI agents to manage community, family, and bureaucratic interactions.

## Overview

ABC Terminal provides an interactive command-line interface for managing a virtual community through specialized AI agents:

- **Bureaucracy Agent**: Manages policies, procedures, regulations, and formal processes
- **Family Agent**: Handles family relationships, traditions, personal dynamics, and milestones  
- **Community Agent**: Coordinates events, projects, resources, and collective initiatives

## Features

- Natural language query processing powered by Claude AI
- Multi-agent orchestration for complex queries
- Interactive terminal UI with multiple views
- Event tracking and persistence with SQLite
- Real-time agent status monitoring
- Community statistics and analytics
- Event management and planning
- Extensible command system

## Prerequisites

- Node.js 18+ 
- TypeScript 5+
- An Anthropic API key for Claude

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Agent-First.ABC.Claude.Flow
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example and configure:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=your_api_key_here
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Commands

### System Commands
- `help [command]` - Show help information
- `clear` - Clear the terminal
- `exit` / `quit` - Exit the terminal

### Agent Commands
- `agent list` - List all active agents
- `agent start <role>` - Start an agent (bureaucracy/family/community)
- `agent stop <id>` - Stop a specific agent
- `agent status <id>` - Show detailed agent status

### Community Commands
- `community stats` - Show community statistics
- `community events [status]` - List community events
- `community members [filter]` - List community members

### Query Commands
- `query <question>` - Ask a natural language question to the AI agents
- `event <action> [options]` - Manage events (create/list/join)

## Architecture

### Directory Structure
```
src/
├── agents/          # Agent implementations
├── terminal/        # Terminal UI components
├── llm/            # LLM orchestration
├── db/             # Database layer
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── index.ts        # Main entry point
```

### Key Components

1. **Agents**: Specialized autonomous agents that handle specific domains
2. **Terminal Display**: Manages visual output and formatting
3. **Command Registry**: Processes and routes user commands
4. **LLM Orchestrator**: Coordinates AI-powered query processing
5. **Event Database**: Persists events and activities

## Configuration

Environment variables can be set in `.env`:

- `ANTHROPIC_API_KEY`: Your Claude API key (required)
- `DATABASE_PATH`: Path to SQLite database
- `LLM_MODEL`: Claude model to use
- `LLM_MAX_TOKENS`: Maximum tokens for responses
- `LLM_TEMPERATURE`: Temperature for AI responses
- `LOG_LEVEL`: Logging level (info/debug/error)

## Development

### Run Tests
```bash
npm test
```

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

## License

MIT