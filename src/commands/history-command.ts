/**
 * History Command - Shows and manages command history
 */

import { Command, CommandHandler, CommandContext, ParsedArgs } from '../terminal/commands.js';
import { CommandHistory } from '../terminal/command-history.js';

export class HistoryCommand implements Command {
  name: string = 'history';
  aliases: string[] = ['hist', 'h!'];
  description: string = 'Show and manage command history';
  usage: string = 'history [subcommand] [options]';
  category: string = 'System';
  subcommands?: Map<string, Command>;

  constructor(private commandHistory: CommandHistory) {
    this.setupSubcommands();
  }

  private setupSubcommands(): void {
    this.subcommands = new Map([
      ['show', {
        name: 'show',
        aliases: ['list'],
        description: 'Show command history',
        usage: 'history show [limit]',
        category: 'System',
        handler: this.showHistoryHandler.bind(this)
      }],
      ['clear', {
        name: 'clear',
        aliases: ['reset'],
        description: 'Clear command history',
        usage: 'history clear',
        category: 'System',
        handler: this.clearHistoryHandler.bind(this)
      }],
      ['search', {
        name: 'search',
        aliases: ['find'],
        description: 'Search command history',
        usage: 'history search <query>',
        category: 'System',
        handler: this.searchHistoryHandler.bind(this)
      }],
      ['stats', {
        name: 'stats',
        aliases: ['frequency'],
        description: 'Show command usage statistics',
        usage: 'history stats',
        category: 'System',
        handler: this.statsHandler.bind(this)
      }],
      ['export', {
        name: 'export',
        aliases: ['save'],
        description: 'Export command history',
        usage: 'history export [file]',
        category: 'System',
        handler: this.exportHandler.bind(this)
      }]
    ]);
  }

  handler: CommandHandler = async (args: ParsedArgs, context: CommandContext) => {
    if (args._.length === 0) {
      // Default to showing recent history
      await this.showHistoryHandler({ _: ['10'] }, context);
      return;
    }

    const subcommandName = args._[0];
    const subcommand = this.subcommands?.get(subcommandName);

    if (subcommand) {
      // Create subArgs without duplicating the _ property
      const { _, ...otherArgs } = args;
      const subArgs: ParsedArgs = {
        _: _.slice(1),
        ...otherArgs
      };
      await subcommand.handler(subArgs, context);
    } else {
      context.display.showMessage(`Unknown history subcommand: ${subcommandName}`, 'error');
      context.display.showMessage('Available subcommands: show, clear, search, stats, export', 'info');
    }
  };

  private async showHistoryHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const limit = args._[0] ? parseInt(args._[0]) : 20;

    if (isNaN(limit) || limit <= 0) {
      context.display.showMessage('Invalid limit. Please provide a positive number.', 'error');
      return;
    }

    const history = this.commandHistory.getHistory(limit);

    if (history.length === 0) {
      context.display.showMessage('No command history available', 'info');
      return;
    }

    context.display.showHeader(`Command History (Last ${history.length} commands)`, 2);

    const headers = ['#', 'Time', 'Command', 'Status'];
    const rows = history.map((entry, index) => [
      (history.length - index).toString(),
      new Date(entry.timestamp).toLocaleTimeString(),
      entry.command.length > 50 ? `${entry.command.substring(0, 47)  }...` : entry.command,
      entry.success ? context.display.getTheme().success('✓') : context.display.getTheme().error('✗')
    ]);

    context.display.showTable(headers, rows);
  }

  private async clearHistoryHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    this.commandHistory.clearHistory();
    context.display.showMessage('Command history cleared', 'success');
  }

  private async searchHistoryHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    if (args._.length === 0) {
      context.display.showMessage('Please provide a search query', 'error');
      return;
    }

    const query = args._.join(' ');
    const results = this.commandHistory.searchHistory(query);

    if (results.length === 0) {
      context.display.showMessage(`No commands found matching: ${query}`, 'info');
      return;
    }

    context.display.showHeader(`Search Results for "${query}" (${results.length} matches)`, 2);

    const headers = ['Time', 'Command'];
    const rows = results.slice(0, 20).map(entry => [
      new Date(entry.timestamp).toLocaleString(),
      entry.command
    ]);

    context.display.showTable(headers, rows);

    if (results.length > 20) {
      context.display.showMessage(`Showing first 20 of ${results.length} results`, 'info');
    }
  }

  private async statsHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const frequency = this.commandHistory.getCommandFrequency();

    if (frequency.size === 0) {
      context.display.showMessage('No command statistics available', 'info');
      return;
    }

    // Sort by frequency
    const sorted = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    context.display.showHeader('Top 10 Most Used Commands', 2);

    const headers = ['Command', 'Count', 'Percentage'];
    const total = Array.from(frequency.values()).reduce((sum, count) => sum + count, 0);

    const rows = sorted.map(([command, count]) => [
      command.length > 40 ? `${command.substring(0, 37)  }...` : command,
      count.toString(),
      `${((count / total) * 100).toFixed(1)}%`
    ]);

    context.display.showTable(headers, rows);

    // Show recent commands
    const recent = this.commandHistory.getRecentCommands(5);
    if (recent.length > 0) {
      context.display.showHeader('Recent Unique Commands', 3);
      context.display.showList('', recent);
    }
  }

  private async exportHandler(args: ParsedArgs, context: CommandContext): Promise<void> {
    const filename = args._[0] || `command-history-${Date.now()}.json`;

    try {
      const historyData = this.commandHistory.exportHistory();

      // In a real implementation, you would write this to a file
      // For now, we'll just show a success message
      context.display.showMessage(`History would be exported to: ${filename}`, 'info');
      context.display.showMessage(`Export size: ${historyData.length} bytes`, 'info');

      // You could emit an event here for the main app to handle file writing
      context.display.showMessage('Note: File writing not implemented in this demo', 'warning');
    } catch (error) {
      context.display.showMessage(`Export failed: ${error}`, 'error');
    }
  }
}