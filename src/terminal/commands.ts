/**
 * Terminal Commands - Defines and handles all terminal commands
 * Enhanced with advanced parsing and ABC Terminal support
 */

import { EventEmitter } from 'events';
import { TerminalDisplay } from './display.js';
import { logger } from '../utils/logger.js';

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  category: string;
  handler: CommandHandler;
  subcommands?: Map<string, Command>;
  options?: CommandOption[];
  examples?: string[];
}

export interface CommandOption {
  name: string;
  short?: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  default?: unknown;
}

export type CommandHandler = (args: ParsedArgs, context: CommandContext) => Promise<void>;

export interface ParsedArgs {
  _: string[]; // Positional arguments
  [key: string]: unknown; // Named arguments
}

export interface CommandContext {
  display: TerminalDisplay;
  agents: Map<string, unknown>;
  session: unknown;
  history: CommandHistory;
  [key: string]: unknown;
}

export interface CommandHistory {
  commands: string[];
  cursor: number;
  maxSize: number;
}

export class CommandRegistry extends EventEmitter {
  private commands: Map<string, Command> = new Map();
  private categories: Map<string, string[]> = new Map();
  private aliases: Map<string, string> = new Map();
  private history: CommandHistory;
  private tabCompletions: Map<string, string[]> = new Map();

  constructor() {
    super();
    this.history = {
      commands: [],
      cursor: 0,
      maxSize: 100
    };
    this.registerDefaultCommands();
    this.setupTabCompletion();
  }

  private registerDefaultCommands(): void {
    // Help command
    this.register({
      name: 'help',
      aliases: ['h', '?'],
      description: 'Show help information',
      usage: 'help [command]',
      category: 'System',
      handler: this.helpHandler.bind(this),
      examples: ['help', 'help agent', 'help spawn']
    });

    // Agent commands
    this.register({
      name: 'agent',
      aliases: ['a'],
      description: 'Manage agents',
      usage: 'agent <subcommand> [options]',
      category: 'Agents',
      handler: this.agentHandler.bind(this),
      examples: ['agent list', 'agent start researcher', 'agent stop abc123'],
      subcommands: new Map([
        ['list', {
          name: 'list',
          aliases: ['ls'],
          description: 'List all agents',
          usage: 'agent list [--format <format>]',
          category: 'Agents',
          handler: this.agentListHandler.bind(this),
          options: [
            {
              name: 'format',
              short: 'f',
              description: 'Output format (table, json, csv)',
              type: 'string',
              default: 'table'
            }
          ]
        }],
        ['start', {
          name: 'start',
          aliases: [],
          description: 'Start an agent',
          usage: 'agent start <role> [--name <name>]',
          category: 'Agents',
          handler: this.agentStartHandler.bind(this),
          options: [
            {
              name: 'name',
              short: 'n',
              description: 'Custom name for the agent',
              type: 'string'
            }
          ]
        }],
        ['stop', {
          name: 'stop',
          aliases: [],
          description: 'Stop an agent',
          usage: 'agent stop <id>',
          category: 'Agents',
          handler: this.agentStopHandler.bind(this)
        }],
        ['status', {
          name: 'status',
          aliases: [],
          description: 'Show agent status',
          usage: 'agent status <id>',
          category: 'Agents',
          handler: this.agentStatusHandler.bind(this)
        }]
      ])
    });

    // Community commands
    this.register({
      name: 'community',
      aliases: ['c'],
      description: 'Community management',
      usage: 'community <subcommand> [options]',
      category: 'Community',
      handler: this.communityHandler.bind(this),
      subcommands: new Map([
        ['stats', {
          name: 'stats',
          aliases: [],
          description: 'Show community statistics',
          usage: 'community stats [--verbose]',
          category: 'Community',
          handler: this.communityStatsHandler.bind(this),
          options: [
            {
              name: 'verbose',
              short: 'v',
              description: 'Show detailed statistics',
              type: 'boolean',
              default: false
            }
          ]
        }],
        ['events', {
          name: 'events',
          aliases: [],
          description: 'List community events',
          usage: 'community events [status]',
          category: 'Community',
          handler: this.communityEventsHandler.bind(this)
        }],
        ['members', {
          name: 'members',
          aliases: [],
          description: 'List community members',
          usage: 'community members [filter]',
          category: 'Community',
          handler: this.communityMembersHandler.bind(this)
        }]
      ])
    });

    // Query command
    this.register({
      name: 'query',
      aliases: ['q'],
      description: 'Query agents with natural language',
      usage: 'query <question>',
      category: 'Interaction',
      handler: this.queryHandler.bind(this),
      examples: ['query "What events are coming up?"', 'query "How many active agents?"']
    });

    // Event command
    this.register({
      name: 'event',
      aliases: ['e'],
      description: 'Create or manage events',
      usage: 'event <action> [options]',
      category: 'Events',
      handler: this.eventHandler.bind(this),
      examples: ['event create', 'event list', 'event join meeting-123']
    });

    // Clear command
    this.register({
      name: 'clear',
      aliases: ['cls'],
      description: 'Clear the terminal',
      usage: 'clear',
      category: 'System',
      handler: this.clearHandler.bind(this)
    });

    // Exit command
    this.register({
      name: 'exit',
      aliases: ['quit', 'q'],
      description: 'Exit the terminal',
      usage: 'exit',
      category: 'System',
      handler: this.exitHandler.bind(this)
    });

    // Status command
    this.register({
      name: 'status',
      aliases: ['st'],
      description: 'Show system status',
      usage: 'status [component]',
      category: 'System',
      handler: this.statusHandler.bind(this),
      examples: ['status', 'status agents', 'status db']
    });

    // View command
    this.register({
      name: 'view',
      aliases: ['v'],
      description: 'Switch terminal view',
      usage: 'view <view-name>',
      category: 'System',
      handler: this.viewHandler.bind(this),
      examples: ['view dashboard', 'view agents', 'view events']
    });

    // Check command
    this.register({
      name: 'check',
      aliases: ['verify'],
      description: 'Check system health and connectivity',
      usage: 'check [service]',
      category: 'System',
      handler: this.checkHandler.bind(this)
    });

    // Spawn command
    this.register({
      name: 'spawn',
      aliases: ['sp', 'create'],
      description: 'Spawn a new agent or resource',
      usage: 'spawn <type> [options]',
      category: 'Agents',
      handler: this.spawnHandler.bind(this)
    });

    logger.info(`Registered ${this.commands.size} default commands`);
  }

  register(command: Command): void {
    this.commands.set(command.name, command);

    // Register aliases
    command.aliases.forEach(alias => {
      this.aliases.set(alias, command.name);
    });

    // Update category
    if (!this.categories.has(command.category)) {
      this.categories.set(command.category, []);
    }
    this.categories.get(command.category)!.push(command.name);

    this.emit('command:registered', command);
  }

  async execute(input: string, context: CommandContext): Promise<void> {
    if (!input.trim()) return;

    // Add to history
    this.addToHistory(input);

    const parsedInput = this.parseCommand(input);
    const { command: commandName, args } = parsedInput;

    if (!commandName) {
      return;
    }

    // Resolve aliases
    const resolvedName = this.aliases.get(commandName) || commandName;
    const command = this.commands.get(resolvedName);

    if (!command) {
      context.display.showMessage(`Unknown command: ${commandName}`, 'error');
      const suggestion = this.suggestCommand(commandName);
      if (suggestion) {
        context.display.showMessage(`Did you mean: ${suggestion}?`, 'info');
      }
      context.display.showMessage('Type "help" for available commands', 'info');
      return;
    }

    try {
      // Parse arguments with options
      const parsedArgs = this.parseArguments(args, command.options || []);
      await command.handler(parsedArgs, { ...context, history: this.history });
      this.emit('command:executed', { command: resolvedName, args: parsedArgs });
    } catch (error) {
      logger.error(`Command execution failed: ${error}`);
      context.display.showMessage(`Error: ${error}`, 'error');
    }
  }

  private parseCommand(input: string): { command: string; args: string[] } {
    const tokens = this.tokenize(input);
    const command = tokens.shift() || '';
    return { command, args: tokens };
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'") && !inQuote) {
        inQuote = true;
        quoteChar = char;
        continue;
      }

      if (char === quoteChar && inQuote) {
        inQuote = false;
        quoteChar = '';
        continue;
      }

      if (char === ' ' && !inQuote) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private parseArguments(args: string[], options: CommandOption[]): ParsedArgs {
    const parsed: ParsedArgs = { _: [] };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        // Long option
        const optName = arg.substring(2);
        const option = options.find(o => o.name === optName);

        if (option) {
          if (option.type === 'boolean') {
            parsed[optName] = true;
          } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            parsed[optName] = this.castValue(args[++i], option.type);
          }
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Short option(s)
        for (let j = 1; j < arg.length; j++) {
          const shortOpt = arg[j];
          const option = options.find(o => o.short === shortOpt);

          if (option) {
            if (option.type === 'boolean') {
              parsed[option.name] = true;
            } else if (j === arg.length - 1 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
              parsed[option.name] = this.castValue(args[++i], option.type);
            }
          }
        }
      } else {
        // Positional argument
        parsed._.push(arg);
      }
    }

    // Apply defaults
    options.forEach(option => {
      if (!(option.name in parsed) && option.default !== undefined) {
        parsed[option.name] = option.default;
      }
    });

    return parsed;
  }

  private castValue(value: string, type: string): any {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      case 'array':
        return value.split(',');
      default:
        return value;
    }
  }

  // History Management
  private addToHistory(command: string): void {
    if (command && command !== this.history.commands[this.history.commands.length - 1]) {
      this.history.commands.push(command);
      if (this.history.commands.length > this.history.maxSize) {
        this.history.commands.shift();
      }
    }
    this.history.cursor = this.history.commands.length;
  }

  getHistory(): CommandHistory {
    return { ...this.history };
  }

  getPreviousCommand(): string | null {
    if (this.history.cursor > 0) {
      this.history.cursor--;
      return this.history.commands[this.history.cursor] || null;
    }
    return null;
  }

  getNextCommand(): string | null {
    if (this.history.cursor < this.history.commands.length - 1) {
      this.history.cursor++;
      return this.history.commands[this.history.cursor] || null;
    }
    this.history.cursor = this.history.commands.length;
    return null;
  }

  // Tab Completion
  private setupTabCompletion(): void {
    // Build completion map
    this.commands.forEach((cmd, name) => {
      this.tabCompletions.set(name, []);
      if (cmd.subcommands) {
        const subcommandNames = Array.from(cmd.subcommands.keys());
        this.tabCompletions.set(name, subcommandNames);
      }
    });
  }

  complete(partial: string, position: number): string[] {
    const tokens = this.tokenize(partial.substring(0, position));

    if (tokens.length <= 1) {
      // Complete command names
      const prefix = tokens[0] || '';
      return Array.from(this.commands.keys())
        .concat(Array.from(this.aliases.keys()))
        .filter(name => name.startsWith(prefix))
        .sort();
    } else {
      // Complete subcommands or options
      const commandName = this.aliases.get(tokens[0]) || tokens[0];
      const command = this.commands.get(commandName);

      if (command?.subcommands && tokens.length === 2) {
        const prefix = tokens[1];
        return Array.from(command.subcommands.keys())
          .filter(name => name.startsWith(prefix))
          .sort();
      }
    }

    return [];
  }

  // Command suggestion
  private suggestCommand(input: string): string | null {
    const commands = Array.from(this.commands.keys()).concat(Array.from(this.aliases.keys()));

    // Find commands with similar starting characters
    const similar = commands.filter(cmd =>
      cmd.startsWith(input.substring(0, Math.min(3, input.length)))
    );

    if (similar.length === 1) {
      return similar[0];
    }

    // Levenshtein distance for more advanced suggestions
    const distances = commands.map(cmd => ({
      cmd,
      distance: this.levenshteinDistance(input, cmd)
    }));

    distances.sort((a, b) => a.distance - b.distance);

    if (distances[0].distance <= 2) {
      return distances[0].cmd;
    }

    return null;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // Command Handlers

  private async helpHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length > 0) {
      // Show help for specific command
      const commandName = args._[0];
      const command = this.commands.get(commandName) ||
                      this.commands.get(this.aliases.get(commandName) || '');

      if (command) {
        this.showCommandHelp(command, context);
      } else {
        context.display.showMessage(`Unknown command: ${commandName}`, 'error');
      }
    } else {
      // Show general help
      this.showGeneralHelp(context);
    }
  }

  private showCommandHelp(command: Command, context: CommandContext): void {
    context.display.showHeader(command.name, 2);
    context.display.showMessage(command.description, 'info');
    context.display.showMessage(`Usage: ${command.usage}`, 'info');

    if (command.aliases.length > 0) {
      context.display.showMessage(`Aliases: ${command.aliases.join(', ')}`, 'info');
    }

    if (command.options && command.options.length > 0) {
      context.display.showHeader('Options:', 3);
      const optionList = command.options.map(opt => {
        const shortFlag = opt.short ? `-${opt.short}, ` : '    ';
        const longFlag = `--${opt.name}`;
        const required = opt.required ? ' (required)' : '';
        const defaultVal = opt.default !== undefined ? ` [default: ${opt.default}]` : '';
        return `  ${shortFlag}${longFlag.padEnd(20)} ${opt.description}${required}${defaultVal}`;
      });
      optionList.forEach(item => context.display.output(item));
    }

    if (command.subcommands && command.subcommands.size > 0) {
      context.display.showHeader('Subcommands:', 3);
      const subcommandList = Array.from(command.subcommands.values()).map(
        sub => `  ${sub.name.padEnd(15)} ${sub.description}`
      );
      subcommandList.forEach(item => context.display.output(item));
    }

    if (command.examples && command.examples.length > 0) {
      context.display.showHeader('Examples:', 3);
      command.examples.forEach(example => {
        context.display.output(`  $ ${example}`);
      });
    }
  }

  private showGeneralHelp(context: CommandContext): void {
    context.display.showHeader('Available Commands', 1);

    this.categories.forEach((commands, category) => {
      context.display.showHeader(category, 2);

      const commandList = commands.map(cmdName => {
        const cmd = this.commands.get(cmdName)!;
        return `  ${cmd.name.padEnd(15)} ${cmd.description}`;
      });

      commandList.forEach(item => context.display.output(item));
      context.display.output('');
    });

    context.display.showMessage('Type "help <command>" for detailed information', 'info');
  }

  // New Command Handlers
  private async statusHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const component = args._[0];

    context.display.showHeader('System Status', 1);

    if (!component || component === 'all') {
      // Show overall status
      const status = {
        agents: context.agents.size,
        activeAgents: Array.from(context.agents.values()).filter(a => a.isActive).length,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      };

      context.display.showList('System Information:', [
        `Platform: ${status.platform}`,
        `Node Version: ${status.nodeVersion}`,
        `Uptime: ${this.formatUptime(status.uptime * 1000)}`,
        `Memory: ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB / ${Math.round(status.memory.heapTotal / 1024 / 1024)}MB`,
        `Agents: ${status.activeAgents} active / ${status.agents} total`
      ]);
    } else {
      // Show specific component status
      this.emit('status:component', { component });
    }
  }

  private async viewHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const viewName = args._[0];

    if (!viewName) {
      context.display.showMessage('Please specify a view name', 'error');
      context.display.showMessage('Available views: dashboard, agents, events, messages, community', 'info');
      return;
    }

    this.emit('view:switch', { viewName });
    context.display.showMessage(`Switched to ${viewName} view`, 'success');
  }

  private async agentHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Usage: agent <subcommand> [options]', 'info');
      context.display.showMessage('Type "help agent" for available subcommands', 'info');
      return;
    }

    const subcommandName = args._[0];
    const subcommand = this.commands.get('agent')!.subcommands?.get(subcommandName);

    if (subcommand) {
      // Pass remaining args to subcommand
      const { _, ...otherArgs } = args;
      const subArgs: ParsedArgs = {
        _: _.slice(1),
        ...otherArgs
      };
      await subcommand.handler(subArgs, context);
    } else {
      context.display.showMessage(`Unknown subcommand: ${subcommandName}`, 'error');
    }
  }

  private async agentListHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const agents = Array.from(context.agents.values());
    const format = args.format || 'table';

    if (agents.length === 0) {
      context.display.showMessage('No active agents', 'info');
      return;
    }

    if (format === 'json') {
      const agentData = agents.map(agent => agent.getStatus());
      context.display.output(JSON.stringify(agentData, null, 2));
    } else if (format === 'csv') {
      const headers = ['ID', 'Name', 'Role', 'Status', 'Uptime'];
      context.display.output(headers.join(','));
      agents.forEach(agent => {
        const status = agent.getStatus();
        const row = [
          status.id,
          status.name,
          status.role,
          status.isActive ? 'Active' : 'Inactive',
          status.stats?.uptime || 0
        ];
        context.display.output(row.join(','));
      });
    } else {
      context.display.showAgentStatus(agents.map(agent => agent.getStatus()));
    }
  }

  private async agentStartHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Please specify an agent role', 'error');
      context.display.showMessage('Available roles: bureaucracy, family, community', 'info');
      return;
    }

    const role = args._[0];
    const name = args.name;
    this.emit('agent:start', { role, name });
    context.display.showMessage(`Starting ${role} agent...`, 'info');
  }

  private async agentStopHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Please specify an agent ID', 'error');
      return;
    }

    const agentId = args._[0];
    this.emit('agent:stop', { agentId });
    context.display.showMessage(`Stopping agent ${agentId}...`, 'info');
  }

  private async agentStatusHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      // Show all agents status
      await this.agentListHandler(args, context);
      return;
    }

    const agentId = args._[0];
    const agent = context.agents.get(agentId);

    if (!agent) {
      context.display.showMessage(`Agent not found: ${agentId}`, 'error');
      return;
    }

    const status = agent.getStatus();
    context.display.showHeader(`Agent: ${status.name}`, 2);
    context.display.showList('Status:', [
      `ID: ${status.id}`,
      `Role: ${status.role}`,
      `Active: ${status.isActive ? 'Yes' : 'No'}`,
      `Uptime: ${status.stats.uptime}ms`
    ]);
  }

  private async communityHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Usage: community <subcommand> [options]', 'info');
      return;
    }

    const subcommandName = args._[0];
    const subcommand = this.commands.get('community')!.subcommands?.get(subcommandName);

    if (subcommand) {
      // Create subArgs without duplicating the _ property
      const { _, ...otherArgs } = args;
      const subArgs: ParsedArgs = {
        _: _.slice(1),
        ...otherArgs
      };
      await subcommand.handler(subArgs, context);
    } else {
      context.display.showMessage(`Unknown subcommand: ${subcommandName}`, 'error');
    }
  }

  private async communityStatsHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    this.emit('community:stats', { verbose: args.verbose });
  }

  private async communityEventsHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const status = args._[0] || 'all';
    this.emit('community:events', { status, verbose: args.verbose });
  }

  private async communityMembersHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const filter = args._[0];
    this.emit('community:members', { filter, verbose: args.verbose });
  }

  private async queryHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Please provide a query', 'error');
      return;
    }

    const query = args._.join(' ');
    context.display.startProgress('query', { text: 'Processing query...' });

    this.emit('query', { query, context });
  }

  private async eventHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Usage: event <action> [options]', 'info');
      context.display.showMessage('Actions: create, list, join', 'info');
      return;
    }

    const action = args._[0];
    this.emit('event:command', { action, args: args._.slice(1), options: args });
  }

  private async clearHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    context.display.clear();
  }

  private async exitHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    context.display.showMessage('Goodbye!', 'success');
    this.emit('exit');
    process.exit(0);
  }

  private async checkHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const service = args._[0];

    context.display.startProgress('health-check', {
      text: service ? `Checking ${service}...` : 'Running system health check...'
    });

    // Emit check events and collect results
    this.emit('check:request', { service });

    // Show results after a brief delay
    setTimeout(() => {
      context.display.stopProgress('health-check', true, 'Health check complete');
      this.emit('check:display');
    }, 1000);
  }

  private async spawnHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Usage: spawn <type> [options]', 'error');
      context.display.showMessage('Available types: agent, worker, service', 'info');
      return;
    }

    const type = args._[0];
    const options = args._.slice(1);

    switch (type) {
      case 'agent':
        if (options.length === 0) {
          context.display.showMessage('Please specify agent role', 'error');
          context.display.showMessage('Available roles: bureaucracy, family, community', 'info');
          return;
        }
        // Delegate to existing agent start handler
        // Create args without duplicating the _ property
        const { _, ...otherArgs } = args;
        await this.agentStartHandler({ _: options, ...otherArgs }, context);
        break;

      case 'worker':
        context.display.showMessage('Spawning worker process...', 'info');
        this.emit('spawn:worker', { options });
        break;

      case 'service':
        context.display.showMessage('Spawning service...', 'info');
        this.emit('spawn:service', { options });
        break;

      default:
        context.display.showMessage(`Unknown spawn type: ${type}`, 'error');
        context.display.showMessage('Available types: agent, worker, service', 'info');
    }
  }

  // Utility method for formatting uptime
  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Utility Methods

  getCommand(name: string): Command | undefined {
    return this.commands.get(name) || this.commands.get(this.aliases.get(name) || '');
  }

  getCommands(): Map<string, Command> {
    return new Map(this.commands);
  }

  getCategories(): Map<string, string[]> {
    return new Map(this.categories);
  }
}