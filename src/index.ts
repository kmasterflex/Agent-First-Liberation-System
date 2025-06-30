/**
 * ABC Terminal - Main Entry Point
 * Agent-First ABC Claude Flow System
 */

import { config } from 'dotenv';
import { TerminalDisplay } from './terminal/display.js';
import { CommandRegistry } from './terminal/commands.js';
import { TerminalRenderer } from './terminal/renderer.js';
import { TerminalInputHandler } from './terminal/input-handler.js';
import { LLMOrchestrator } from './llm/orchestrator.js';
import { LLMDisplay } from './llm/display.js';
import { eventDatabase } from './db/events.js';
import { BureaucracyAgent } from './agents/bureaucracy.js';
import { FamilyAgent } from './agents/family.js';
import { CommunityAgent } from './agents/community.js';
import { logger } from './utils/logger.js';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import ora from 'ora';
import figlet from 'figlet';
import gradient from 'gradient-string';

// Load environment variables
config();

interface TerminalSession {
  id: string;
  startTime: Date;
  agents: Map<string, unknown>;
  eventDb: typeof eventDatabase;
  orchestrator: LLMOrchestrator;
  display: TerminalDisplay;
  renderer: TerminalRenderer;
  commands: CommandRegistry;
  llmDisplay: LLMDisplay;
  inputHandler: TerminalInputHandler;
}

class ABCTerminal extends EventEmitter {
  private session: TerminalSession | null = null;
  private isRunning: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private shutdownInProgress: boolean = false;
  private retryAttempts: Map<string, number> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;

  async start(): Promise<void> {
    try {
      // Show startup splash
      await this.showSplashScreen();

      logger.info('Starting ABC Terminal...');

      // Initialize session with progress indicators
      await this.initializeWithProgress();

      // Show welcome screen
      this.showWelcome();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start command loop
      await this.commandLoop();

    } catch (error) {
      logger.error('Failed to start terminal:', error);
      console.error(chalk.red('Fatal error:'), error);

      // Attempt recovery
      if (!this.shutdownInProgress) {
        await this.attemptRecovery(error);
      }
    }
  }

  private async showSplashScreen(): Promise<void> {
    console.clear();

    // Display gradient ASCII art
    const asciiArt = await new Promise<string>((resolve) => {
      figlet('ABC Terminal', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      }, (err, data) => {
        resolve(err ? 'ABC Terminal' : data || 'ABC Terminal');
      });
    });

    console.log(gradient.rainbow(asciiArt));
    console.log(chalk.dim('\n  Agent-First ABC Claude Flow System v1.0'));
    console.log(chalk.dim('  Powered by Claude AI\n'));

    // Show loading animation
    const spinner = ora({
      text: 'Initializing systems...',
      spinner: 'dots12',
      color: 'cyan'
    }).start();

    await new Promise(resolve => setTimeout(resolve, 1500));
    spinner.stop();
  }

  private async initializeWithProgress(): Promise<void> {
    const steps = [
      { name: 'Database', action: () => this.initializeDatabase() },
      { name: 'LLM Orchestrator', action: () => this.initializeLLM() },
      { name: 'Display System', action: () => this.initializeDisplay() },
      { name: 'Agent Framework', action: () => this.initializeAgents() },
      { name: 'Command Registry', action: () => this.initializeCommands() },
      { name: 'Event Handlers', action: () => this.setupEventHandlers() },
      { name: 'Default Agents', action: () => this.startDefaultAgents() }
    ];

    for (const step of steps) {
      const spinner = ora({
        text: `Initializing ${step.name}...`,
        spinner: 'dots12',
        color: 'cyan'
      }).start();

      try {
        await step.action();
        spinner.succeed(chalk.green(`${step.name} initialized`));
      } catch (error) {
        spinner.fail(chalk.red(`Failed to initialize ${step.name}`));
        throw error;
      }
    }

    logger.info('All systems initialized successfully');
  }

  private async initializeDatabase(): Promise<void> {
    await eventDatabase.initialize();
  }

  private async initializeLLM(): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    if (!this.session) {
      this.session = {} as TerminalSession;
    }

    this.session.orchestrator = new LLMOrchestrator(apiKey, {
      model: process.env.LLM_MODEL,
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7')
    });
  }

  private async initializeDisplay(): Promise<void> {
    if (!this.session) return;

    this.session.display = new TerminalDisplay();
    this.session.renderer = new TerminalRenderer(this.session.display);
    this.session.llmDisplay = new LLMDisplay(this.session.display, this.session.orchestrator);
  }

  private async initializeAgents(): Promise<void> {
    if (!this.session) return;

    this.session.agents = new Map<string, unknown>();
    this.session.eventDb = eventDatabase;
    this.session.id = `session-${Date.now()}`;
    this.session.startTime = new Date();
  }

  private async initializeCommands(): Promise<void> {
    if (!this.session) return;

    this.session.commands = new CommandRegistry();

    // Create input handler with enhanced features
    this.session.inputHandler = new TerminalInputHandler(this.session.commands, {
      prompt: chalk.cyan('ABC> '),
      enableAutocomplete: true,
      enableHistory: true
    });
  }

  private async attemptRecovery(error: unknown): Promise<void> {
    const errorType = error.code || error.name || 'UNKNOWN';
    const attempts = this.retryAttempts.get(errorType) || 0;

    if (attempts >= this.MAX_RETRY_ATTEMPTS) {
      logger.error(`Max retry attempts reached for ${errorType}`);
      await this.shutdown();
      return;
    }

    this.retryAttempts.set(errorType, attempts + 1);
    logger.info(`Attempting recovery from ${errorType} (attempt ${attempts + 1})`);

    const spinner = ora({
      text: 'Attempting system recovery...',
      spinner: 'dots12',
      color: 'yellow'
    }).start();

    try {
      // Reinitialize failed components
      await this.initializeWithProgress();
      spinner.succeed('Recovery successful');

      // Resume operations
      await this.commandLoop();
    } catch (recoveryError) {
      spinner.fail('Recovery failed');
      logger.error('Recovery failed:', recoveryError);
      await this.shutdown();
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.session || this.shutdownInProgress) return;

      try {
        // Check database connection
        await eventDatabase.getEvents({ limit: 1 });

        // Check agent health
        for (const [id, agent] of this.session.agents) {
          if (!agent.isActive) {
            logger.warn(`Agent ${id} is inactive, attempting restart...`);
            await this.restartAgent(id);
          }
        }

        // Update renderer with current state
        this.updateRenderer();

      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private async restartAgent(agentId: string): Promise<void> {
    if (!this.session) return;

    const agent = this.session.agents.get(agentId);
    if (!agent) return;

    try {
      await agent.stop();
      await agent.start();
      logger.info(`Successfully restarted agent ${agentId}`);
    } catch (error) {
      logger.error(`Failed to restart agent ${agentId}:`, error);
      this.session.agents.delete(agentId);
    }
  }


  private setupEventHandlers(): void {
    if (!this.session) return;

    const { commands, agents, display, renderer, orchestrator, llmDisplay, eventDb } = this.session;

    // Command handlers
    commands.on('agent:start', async ({ role }) => {
      await this.startAgent(role);
    });

    commands.on('agent:stop', async ({ agentId }) => {
      await this.stopAgent(agentId);
    });

    commands.on('query', async ({ query }) => {
      try {
        llmDisplay.showThinking('Processing your query...');

        const result = await orchestrator.processQuery({
          query,
          agents,
          history: []
        });

        llmDisplay.hideThinking();
        await llmDisplay.displayQueryResult(query, result);

        // Record event
        await eventDb.recordEvent({
          id: `query-${Date.now()}`,
          type: 'query',
          source: 'user',
          data: { query, result },
          processed: true
        });

      } catch (error) {
        llmDisplay.hideThinking();
        display.showMessage(`Query failed: ${error}`, 'error');
      }
    });

    commands.on('community:stats', async () => {
      const communityAgent = Array.from(agents.values()).find(a => a.role === 'community');
      if (communityAgent) {
        const response = await communityAgent.processMessage({
          id: `msg-${Date.now()}`,
          from: 'terminal',
          to: communityAgent.id,
          type: 'query',
          content: { topic: 'statistics' },
          timestamp: new Date()
        });

        display.showCommunityStats(response.statistics);
      }
    });

    commands.on('community:events', async ({ status }) => {
      const communityAgent = Array.from(agents.values()).find(a => a.role === 'community');
      if (communityAgent) {
        const response = await communityAgent.processMessage({
          id: `msg-${Date.now()}`,
          from: 'terminal',
          to: communityAgent.id,
          type: 'query',
          content: { topic: 'events', data: { status } },
          timestamp: new Date()
        });

        response.events.forEach((event: unknown) => display.showEvent(event));
      }
    });

    // View switching
    commands.on('view:switch', ({ view }) => {
      renderer.switchView(view);
    });

    // Exit handler
    commands.on('exit', async () => {
      await this.shutdown();
    });

    // Status handlers
    commands.on('status:all', async () => {
      // Additional system-wide status information
      const memoryUsage = process.memoryUsage();
      display.showList('System Resources:', [
        `Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        `CPU: ${process.cpuUsage().user / 1000}ms user, ${process.cpuUsage().system / 1000}ms system`
      ]);
    });

    commands.on('status:database', async () => {
      try {
        const stats = await eventDb.getStats();
        display.showList('Database Status:', [
          'Connected: Yes',
          `Total Events: ${stats.totalEvents || 0}`,
          `Processed Events: ${stats.processedEvents || 0}`,
          `Pending Events: ${stats.pendingEvents || 0}`
        ]);
      } catch (error) {
        display.showMessage('Database status unavailable', 'error');
      }
    });

    commands.on('status:llm', async () => {
      const status = orchestrator.getStatus();
      display.showList('LLM Orchestrator Status:', [
        `Model: ${status.model || 'claude-3'}`,
        `Max Tokens: ${status.maxTokens || 4096}`,
        `Temperature: ${status.temperature || 0.7}`,
        `Total Queries: ${status.totalQueries || 0}`
      ]);
    });

    // Check handlers
    commands.on('check:database', async ({ callback }) => {
      try {
        await eventDb.ping();
        callback({ connected: true, message: 'Database connection healthy' });
      } catch (error) {
        callback({ connected: false, message: `Database error: ${error}` });
      }
    });

    commands.on('check:llm', async ({ callback }) => {
      try {
        const isAvailable = await orchestrator.testConnection();
        callback({ available: isAvailable, message: isAvailable ? 'LLM service operational' : 'LLM service unavailable' });
      } catch (error) {
        callback({ available: false, message: `LLM error: ${error}` });
      }
    });

    // Spawn handlers
    commands.on('spawn:worker', async () => {
      display.showMessage('Worker spawning not yet implemented', 'warning');
    });

    commands.on('spawn:service', async () => {
      display.showMessage('Service spawning not yet implemented', 'warning');
    });
  }

  private async startDefaultAgents(): Promise<void> {
    if (!this.session) return;

    const defaultAgents = [
      { role: 'bureaucracy', name: 'Bureaucracy Agent' },
      { role: 'family', name: 'Family Agent' },
      { role: 'community', name: 'Community Agent' }
    ];

    for (const agentConfig of defaultAgents) {
      try {
        await this.startAgent(agentConfig.role);
      } catch (error) {
        logger.error(`Failed to start ${agentConfig.role} agent:`, error);
      }
    }
  }

  private async startAgent(role: string): Promise<void> {
    if (!this.session) return;

    const { agents, display, eventDb } = this.session;

    // Check if agent already exists
    const existingAgent = Array.from(agents.values()).find(a => a.role === role);
    if (existingAgent?.isActive) {
      display.showMessage(`${role} agent is already active`, 'warning');
      return;
    }

    let agent: unknown;

    switch (role) {
      case 'bureaucracy':
        agent = new BureaucracyAgent({ name: 'Bureaucracy Agent' });
        break;
      case 'family':
        agent = new FamilyAgent({ name: 'Family Agent' });
        break;
      case 'community':
        agent = new CommunityAgent({ name: 'Community Agent' });
        break;
      default:
        display.showMessage(`Unknown agent role: ${role}`, 'error');
        return;
    }

    // Set up agent event handlers
    (agent as EventEmitter).on('agent:started', async (data: unknown) => {
      await eventDb.recordEvent({
        id: `agent-start-${Date.now()}`,
        type: 'agent:started',
        source: data.agentId,
        data,
        processed: false
      });
    });

    // Start the agent
    await (agent as any).start();
    agents.set((agent as any).id, agent);

    display.showMessage(`${(agent as any).name} started successfully`, 'success');
    this.updateRenderer();
  }

  private async stopAgent(agentId: string): Promise<void> {
    if (!this.session) return;

    const { agents, display, eventDb } = this.session;
    const agent = agents.get(agentId);

    if (!agent) {
      display.showMessage(`Agent not found: ${agentId}`, 'error');
      return;
    }

    await agent.stop();
    agents.delete(agentId);

    await eventDb.recordEvent({
      id: `agent-stop-${Date.now()}`,
      type: 'agent:stopped',
      source: agentId,
      data: { agentId, role: agent.role },
      processed: false
    });

    display.showMessage(`${agent.name} stopped`, 'success');
    this.updateRenderer();
  }

  private updateRenderer(): void {
    if (!this.session) return;

    const { agents, renderer, eventDb } = this.session;

    // Get recent events
    eventDb.getEvents({ limit: 20 }).then(events => {
      renderer.updateContext({
        agents: Array.from(agents.values()).map(a => a.getStatus()),
        events: events.map(e => ({
          ...e.data,
          timestamp: e.timestamp,
          type: e.type
        }))
      });
    }).catch(logger.error);
  }

  private showWelcome(): void {
    if (!this.session) return;

    const { display } = this.session;

    console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────────────┐'));
    console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
    console.log(chalk.cyan('│') + gradient.rainbow('         Welcome to ABC Terminal v1.0         ') + chalk.cyan('│'));
    console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
    console.log(chalk.cyan('├─────────────────────────────────────────────────────────────┤'));
    console.log(`${chalk.cyan('│')  }  ${  chalk.green('✓')  } Database initialized                                    ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }  ${  chalk.green('✓')  } LLM Orchestrator ready                                  ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }  ${  chalk.green('✓')  } Agent framework active                                  ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }  ${  chalk.green('✓')  } Command system online                                   ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
    console.log(chalk.cyan('├─────────────────────────────────────────────────────────────┤'));
    console.log(`${chalk.cyan('│')  } ${  chalk.yellow('Quick Start:')  }                                              ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }   • Type ${  chalk.green('"help"')  } for available commands                    ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }   • Type ${  chalk.green('"status"')  } to view system status                  ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }   • Type ${  chalk.green('"query <question>"')  } to ask the AI               ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }   • Type ${  chalk.green('"exit"')  } to quit                                  ${  chalk.cyan('│')}`);
    console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
    console.log(chalk.cyan('└─────────────────────────────────────────────────────────────┘\n'));

    // Show active agents
    if (this.session.agents.size > 0) {
      display.showMessage(`${this.session.agents.size} agents are active and ready`, 'success');
    }
  }

  private async commandLoop(): Promise<void> {
    if (!this.session) return;

    const { commands, display, inputHandler } = this.session;
    this.isRunning = true;

    // Set up command handler
    inputHandler.on('command', async (command: string) => {
      if (!command.trim()) return;

      try {
        await commands.execute(command, {
          display,
          agents: this.session!.agents,
          session: this.session,
          history: commands.getHistory()
        });
      } catch (error) {
        logger.error('Command execution error:', error);
        display.showMessage(`Error: ${error}`, 'error');
      }
    });

    // Set up close handler
    inputHandler.on('close', async () => {
      await this.shutdown();
    });

    // Start the input handler
    inputHandler.start();

    // Show help hint for new features
    display.showMessage('Press Tab for autocomplete, ↑/↓ for history, Ctrl+R for reverse search', 'info');
  }

  private async shutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    logger.info('Initiating graceful shutdown...');
    this.isRunning = false;

    const spinner = ora({
      text: 'Shutting down systems...',
      spinner: 'dots12',
      color: 'yellow'
    }).start();

    try {
      // Clear health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      if (this.session) {
        const { agents, eventDb, orchestrator, commands, inputHandler } = this.session;

        // Shutdown steps with progress
        const shutdownSteps = [
          {
            name: 'Input handler',
            action: async () => {
              if (inputHandler) {
                inputHandler.stop();
              }
            }
          },
          {
            name: 'Command system',
            action: async () => {
              if (commands) {
                commands.removeAllListeners();
              }
            }
          },
          {
            name: 'Active agents',
            action: async () => {
              const agentPromises = Array.from(agents.values()).map(async (agent) => {
                try {
                  await agent.stop();
                  logger.info(`Agent ${agent.id} stopped successfully`);
                } catch (error) {
                  logger.error(`Failed to stop agent ${agent.id}:`, error);
                }
              });
              await Promise.all(agentPromises);
            }
          },
          {
            name: 'LLM Orchestrator',
            action: async () => {
              if (orchestrator) {
                // Clean up any pending requests
                orchestrator.removeAllListeners();
              }
            }
          },
          {
            name: 'Database connections',
            action: async () => {
              if (eventDb) {
                await eventDb.close();
              }
            }
          }
        ];

        // Execute shutdown steps
        for (const step of shutdownSteps) {
          spinner.text = `Shutting down ${step.name}...`;
          try {
            await step.action();
          } catch (error) {
            logger.error(`Error during ${step.name} shutdown:`, error);
          }
        }

        spinner.succeed('All systems shut down successfully');

        // Show farewell message
        console.log(`\n${  chalk.cyan('┌─────────────────────────────────────────────────────────────┐')}`);
        console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
        console.log(chalk.cyan('│') + gradient.rainbow('           Thank you for using ABC Terminal!        ') + chalk.cyan('│'));
        console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
        console.log(`${chalk.cyan('│') + chalk.dim('  Session Duration: ') + chalk.white(this.formatDuration(this.session.startTime))  }                       ${  chalk.cyan('│')}`);
        console.log(`${chalk.cyan('│') + chalk.dim('  Events Processed: ') + chalk.white(await this.getEventCount())  }                                   ${  chalk.cyan('│')}`);
        console.log(`${chalk.cyan('│')  }                                                             ${  chalk.cyan('│')}`);
        console.log(chalk.cyan('└─────────────────────────────────────────────────────────────┘\n'));
      } else {
        spinner.stop();
      }

    } catch (error) {
      spinner.fail('Shutdown encountered errors');
      logger.error('Error during shutdown:', error);
    }

    // Remove global event listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    // Exit with appropriate code
    const exitCode = this.isRunning ? 1 : 0;
    process.exit(exitCode);
  }

  private formatDuration(startTime: Date): string {
    const duration = Date.now() - startTime.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async getEventCount(): Promise<string> {
    try {
      const events = await eventDatabase.getEvents({ limit: 999999 });
      return events.length.toString();
    } catch {
      return '0';
    }
  }
}

// Global terminal instance for signal handlers
let terminalInstance: ABCTerminal | null = null;

// Handle process signals
process.on('SIGINT', async () => {
  console.log(`\n${  chalk.yellow('Received interrupt signal...')}`);
  if (terminalInstance) {
    await terminalInstance['shutdown']();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  console.log(`\n${  chalk.yellow('Received termination signal...')}`);
  if (terminalInstance) {
    await terminalInstance['shutdown']();
  } else {
    process.exit(0);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  console.error(chalk.red('\nFatal error - uncaught exception:'), error);

  if (terminalInstance) {
    terminalInstance['shutdown']().catch(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  console.error(chalk.red('\nUnhandled promise rejection:'), reason);
});

// Main entry point
async function main() {
  try {
    // Verify environment
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red('\nError: ANTHROPIC_API_KEY environment variable is not set'));
      console.log(chalk.yellow('\nPlease set your API key:'));
      console.log(chalk.cyan('  export ANTHROPIC_API_KEY="your-api-key-here"'));
      console.log(chalk.cyan('  # or add it to your .env file\n'));
      process.exit(1);
    }

    // Create and start terminal
    terminalInstance = new ABCTerminal();
    await terminalInstance.start();

  } catch (error) {
    logger.error('Failed to start ABC Terminal:', error);
    console.error(chalk.red('\nFailed to start ABC Terminal:'), error);

    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      console.log(chalk.yellow('\nPlease ensure your Anthropic API key is correctly set in the .env file'));
    }

    process.exit(1);
  }
}

// Export for testing and external access
export { ABCTerminal, terminalInstance };

// Start the application if not imported as a module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}