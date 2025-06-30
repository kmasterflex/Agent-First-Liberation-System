# Terminal Command System

## Overview

The terminal command system provides a comprehensive CLI interface for managing agents, resources, and system operations in the ABC Terminal.

## Core Commands

### System Commands

#### `status [component]`
- **Aliases**: `st`
- **Description**: Show system status
- **Components**: 
  - `agents` - Show all agent statuses
  - `database` / `db` - Show database connection status
  - `llm` / `orchestrator` - Show LLM service status
- **Example**: `status agents`

#### `check [service]`
- **Aliases**: `verify`
- **Description**: Check system health and connectivity
- **Services**: `database`, `llm`, `agents`, or leave empty for all
- **Example**: `check database`

#### `help [command]`
- **Aliases**: `h`, `?`
- **Description**: Show help information
- **Example**: `help spawn`

#### `clear`
- **Aliases**: `cls`
- **Description**: Clear the terminal screen

#### `exit`
- **Aliases**: `quit`, `q`
- **Description**: Exit the terminal

### Agent Commands

#### `agent <subcommand>`
- **Aliases**: `a`
- **Subcommands**:
  - `list` / `ls` - List all agents
  - `start <role>` - Start an agent (bureaucracy, family, community)
  - `stop <id>` - Stop a specific agent
  - `status <id>` - Show detailed agent status

#### `spawn <type> [options]`
- **Aliases**: `sp`, `create`
- **Description**: Spawn a new agent or resource
- **Types**:
  - `agent <role>` - Spawn a new agent
  - `worker` - Spawn a worker process
  - `service` - Spawn a service
- **Example**: `spawn agent community`

### Community Commands

#### `community <subcommand>`
- **Aliases**: `c`
- **Subcommands**:
  - `stats` - Show community statistics
  - `events [status]` - List community events (all, planned, active, completed)
  - `members [filter]` - List community members

### Query Commands

#### `query <question>`
- **Aliases**: `q`
- **Description**: Query agents with natural language
- **Example**: `query What events are happening this week?`

### Event Commands

#### `event <action> [options]`
- **Aliases**: `e`
- **Actions**: `create`, `list`, `join`

### History Commands

#### `history [subcommand]`
- **Aliases**: `hist`, `h!`
- **Subcommands**:
  - `show [limit]` - Show command history (default: last 20)
  - `clear` / `reset` - Clear command history
  - `search <query>` - Search command history
  - `stats` / `frequency` - Show command usage statistics
  - `export [file]` - Export command history to file

## Enhanced Features

### Command History
- **Up/Down arrows**: Navigate through command history
- **Ctrl+R**: Reverse search through history
- Commands are automatically saved with timestamps and success status

### Autocomplete
- **Tab**: Autocomplete commands, subcommands, and arguments
- Context-aware suggestions based on current command
- Shows available options when multiple matches exist

### Command Aliases
Most commands have shorter aliases for faster typing:
- `h` → `help`
- `q` → `quit`
- `st` → `status`
- `sp` → `spawn`
- `a` → `agent`
- `c` → `community`

## Usage Examples

```bash
# Check system status
status

# Start a new community agent
spawn agent community

# Check database health
check database

# Query the community
query What are the current community statistics?

# View command history
history show 50

# Search history for agent commands
history search agent

# Clear the screen
clear

# Exit the terminal
exit
```

## Command Context

All commands receive a context object containing:
- `display`: Terminal display manager
- `agents`: Map of active agents
- `session`: Current session information

## Extending Commands

To add new commands:

1. Create a command class implementing the `Command` interface
2. Register it in the `CommandRegistry`
3. Add appropriate event handlers in the main application

Example:
```typescript
export class CustomCommand implements Command {
  name = 'custom';
  aliases = ['c'];
  description = 'Custom command';
  usage = 'custom [options]';
  category = 'Custom';
  
  handler: CommandHandler = async (args, context) => {
    // Command implementation
  };
}
```