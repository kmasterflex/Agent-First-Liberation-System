/**
 * Enhanced Terminal Input Handler with readline support
 */

import readline from 'readline';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import { CommandHistory } from './command-history.js';
import { CommandRegistry } from './commands.js';
import { logger } from '../utils/logger.js';

export interface InputHandlerOptions {
  prompt?: string;
  historyFile?: string;
  enableAutocomplete?: boolean;
  enableHistory?: boolean;
}

export class TerminalInputHandler extends EventEmitter {
  private rl: readline.Interface | null = null;
  private commandHistory: CommandHistory;
  private isRunning: boolean = false;
  private currentPrompt: string;
  private options: InputHandlerOptions;

  constructor(
    private commandRegistry: CommandRegistry,
    options: InputHandlerOptions = {}
  ) {
    super();
    this.options = {
      prompt: chalk.cyan('ABC> '),
      enableAutocomplete: true,
      enableHistory: true,
      ...options
    };
    this.currentPrompt = this.options.prompt!;
    this.commandHistory = new CommandHistory(commandRegistry);
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.createInterface();
    this.setupHandlers();
    logger.info('Terminal input handler started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    logger.info('Terminal input handler stopped');
  }

  private createInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.currentPrompt,
      completer: this.options.enableAutocomplete ? this.completer.bind(this) : undefined,
      terminal: true
    });

    // Enable raw mode for better key handling
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  }

  private setupHandlers(): void {
    if (!this.rl) return;

    // Handle line input
    this.rl.on('line', (input) => {
      this.handleCommand(input);
    });

    // Handle close event
    this.rl.on('close', () => {
      this.emit('close');
    });

    // Setup key bindings for history navigation
    if (this.options.enableHistory) {
      this.setupHistoryBindings();
    }

    // Show initial prompt
    this.rl.prompt();
  }

  private setupHistoryBindings(): void {
    if (!this.rl || !process.stdin.isTTY) return;

    process.stdin.on('keypress', (str, key) => {
      if (!key || !this.rl) return;

      // Up arrow - navigate up in history
      if (key.name === 'up') {
        const currentLine = this.rl.line;
        const historicalCommand = this.commandHistory.navigateUp(currentLine);

        if (historicalCommand !== null) {
          this.rl.write(null, { ctrl: true, name: 'u' }); // Clear current line
          this.rl.write(historicalCommand);
        }
      }

      // Down arrow - navigate down in history
      else if (key.name === 'down') {
        const historicalCommand = this.commandHistory.navigateDown();

        if (historicalCommand !== null) {
          this.rl.write(null, { ctrl: true, name: 'u' }); // Clear current line
          this.rl.write(historicalCommand);
        }
      }

      // Ctrl+R - reverse search in history
      else if (key.ctrl && key.name === 'r') {
        this.startReverseSearch();
      }
    });
  }

  private startReverseSearch(): void {
    if (!this.rl) return;

    const originalPrompt = this.currentPrompt;
    let searchQuery = '';
    let searchResults: any[] = [];
    let currentIndex = 0;

    const updateSearchPrompt = () => {
      if (!this.rl) return;

      const result = searchResults[currentIndex];
      const displayText = result ? result.command : '';
      const searchPrompt = chalk.cyan(`(reverse-i-search)'${searchQuery}': `) + displayText;

      this.rl.setPrompt(searchPrompt);
      this.rl.prompt();
    };

    const searchHandler = (ch: string, key: any) => {
      if (!key || !this.rl) return;

      // ESC - cancel search
      if (key.name === 'escape') {
        process.stdin.removeListener('keypress', searchHandler);
        this.rl.setPrompt(originalPrompt);
        this.rl.write(null, { ctrl: true, name: 'u' });
        this.rl.prompt();
        return;
      }

      // Enter - accept current result
      if (key.name === 'return') {
        process.stdin.removeListener('keypress', searchHandler);
        this.rl.setPrompt(originalPrompt);
        if (searchResults[currentIndex]) {
          this.rl.write(null, { ctrl: true, name: 'u' });
          this.rl.write(searchResults[currentIndex].command);
        }
        return;
      }

      // Ctrl+R - cycle through results
      if (key.ctrl && key.name === 'r') {
        if (searchResults.length > 0) {
          currentIndex = (currentIndex + 1) % searchResults.length;
          updateSearchPrompt();
        }
        return;
      }

      // Backspace
      if (key.name === 'backspace') {
        searchQuery = searchQuery.slice(0, -1);
      }
      // Regular character
      else if (ch && ch.length === 1 && !key.ctrl) {
        searchQuery += ch;
      } else {
        return;
      }

      // Update search results
      searchResults = this.commandHistory.searchHistory(searchQuery);
      currentIndex = 0;
      updateSearchPrompt();
    };

    process.stdin.on('keypress', searchHandler);
    updateSearchPrompt();
  }

  private completer(line: string): [string[], string] {
    const result = this.commandHistory.autocomplete(line);

    // If we have suggestions, return them for readline
    if (result.suggestions.length > 0) {
      // For commands, we want to complete the whole line
      if (result.type === 'command') {
        return [result.suggestions, result.partial];
      }

      // For subcommands and arguments, complete just the last part
      const prefix = line.substring(0, line.lastIndexOf(' ') + 1);
      const completions = result.suggestions.map(s => prefix + s);
      return [completions, line];
    }

    return [[], line];
  }

  private async handleCommand(input: string): Promise<void> {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      this.rl?.prompt();
      return;
    }

    // Add to history
    if (this.options.enableHistory) {
      this.commandHistory.addEntry(trimmedInput);
    }

    // Emit command event
    this.emit('command', trimmedInput);

    // Show prompt again
    this.rl?.prompt();
  }

  setPrompt(prompt: string): void {
    this.currentPrompt = prompt;
    if (this.rl) {
      this.rl.setPrompt(prompt);
    }
  }

  showMessage(message: string): void {
    if (this.rl) {
      // Clear current line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      // Show message
      console.log(message);

      // Restore prompt and current input
      this.rl.prompt(true);
    } else {
      console.log(message);
    }
  }

  getHistory(): CommandHistory {
    return this.commandHistory;
  }

  // Method to display autocomplete suggestions
  showSuggestions(input: string): void {
    const result = this.commandHistory.autocomplete(input);

    if (result.suggestions.length > 0) {
      this.showMessage('');
      this.showMessage(chalk.gray('Suggestions:'));

      const columns = process.stdout.columns || 80;
      const suggestionWidth = Math.max(...result.suggestions.map(s => s.length)) + 4;
      const columnsPerRow = Math.floor(columns / suggestionWidth) || 1;

      for (let i = 0; i < result.suggestions.length; i += columnsPerRow) {
        const row = result.suggestions
          .slice(i, i + columnsPerRow)
          .map(s => s.padEnd(suggestionWidth))
          .join('');
        this.showMessage(chalk.cyan(row));
      }
      this.showMessage('');
    }
  }
}