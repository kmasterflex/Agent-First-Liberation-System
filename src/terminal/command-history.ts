/**
 * Command History and Autocomplete Manager
 */

import { EventEmitter } from 'events';
import { CommandRegistry } from './commands.js';
import { logger } from '../utils/logger.js';

export interface HistoryEntry {
  command: string;
  timestamp: Date;
  success: boolean;
}

export interface AutocompleteResult {
  suggestions: string[];
  partial: string;
  type: 'command' | 'argument' | 'subcommand';
}

export class CommandHistory extends EventEmitter {
  private history: HistoryEntry[] = [];
  private maxHistorySize: number = 1000;
  private historyIndex: number = -1;
  private currentInput: string = '';

  constructor(private commandRegistry: CommandRegistry) {
    super();
  }

  addEntry(command: string, success: boolean = true): void {
    const entry: HistoryEntry = {
      command: command.trim(),
      timestamp: new Date(),
      success
    };

    this.history.push(entry);

    // Trim history if it exceeds max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    // Reset history navigation
    this.historyIndex = this.history.length;
    this.currentInput = '';

    this.emit('history:added', entry);
    logger.debug(`Added command to history: ${command}`);
  }

  navigateUp(currentInput: string): string | null {
    // Store current input if we're at the end of history
    if (this.historyIndex === this.history.length) {
      this.currentInput = currentInput;
    }

    // Navigate up in history
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.history[this.historyIndex].command;
    }

    return null;
  }

  navigateDown(): string | null {
    // Navigate down in history
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      return this.history[this.historyIndex].command;
    } else if (this.historyIndex === this.history.length - 1) {
      this.historyIndex = this.history.length;
      return this.currentInput;
    }

    return null;
  }

  getHistory(limit?: number): HistoryEntry[] {
    const entries = [...this.history].reverse();
    return limit ? entries.slice(0, limit) : entries;
  }

  searchHistory(query: string): HistoryEntry[] {
    return this.history.filter(entry =>
      entry.command.toLowerCase().includes(query.toLowerCase())
    ).reverse();
  }

  clearHistory(): void {
    this.history = [];
    this.historyIndex = -1;
    this.currentInput = '';
    this.emit('history:cleared');
  }

  autocomplete(input: string): AutocompleteResult {
    const parts = input.trim().split(/\s+/);

    if (parts.length === 0) {
      return { suggestions: [], partial: '', type: 'command' };
    }

    const commands = this.commandRegistry.getCommands();

    // If only one part, autocomplete commands
    if (parts.length === 1) {
      const partial = parts[0].toLowerCase();
      const suggestions: string[] = [];

      // Add matching command names
      commands.forEach((cmd, name) => {
        if (name.toLowerCase().startsWith(partial)) {
          suggestions.push(name);
        }
      });

      // Add matching aliases
      commands.forEach(cmd => {
        cmd.aliases.forEach(alias => {
          if (alias.toLowerCase().startsWith(partial)) {
            suggestions.push(alias);
          }
        });
      });

      // Remove duplicates and sort
      const uniqueSuggestions = [...new Set(suggestions)].sort();

      return {
        suggestions: uniqueSuggestions,
        partial: parts[0],
        type: 'command'
      };
    }

    // If multiple parts, check for subcommands or arguments
    const commandName = parts[0];
    const command = this.commandRegistry.getCommand(commandName);

    if (command?.subcommands && parts.length === 2) {
      const partial = parts[1].toLowerCase();
      const suggestions: string[] = [];

      command.subcommands.forEach((subcmd, name) => {
        if (name.toLowerCase().startsWith(partial)) {
          suggestions.push(name);
        }
      });

      return {
        suggestions: suggestions.sort(),
        partial: parts[1],
        type: 'subcommand'
      };
    }

    // For arguments, provide context-specific suggestions
    const argSuggestions = this.getArgumentSuggestions(commandName, parts);

    return {
      suggestions: argSuggestions,
      partial: parts[parts.length - 1],
      type: 'argument'
    };
  }

  private getArgumentSuggestions(commandName: string, parts: string[]): string[] {
    const suggestions: string[] = [];

    // Command-specific argument suggestions
    switch (commandName) {
      case 'agent':
      case 'spawn':
        if (parts.length === 2 && parts[1] === '') {
          suggestions.push('bureaucracy', 'family', 'community');
        }
        break;

      case 'status':
        if (parts.length === 2) {
          suggestions.push('agents', 'database', 'llm');
        }
        break;

      case 'check':
        if (parts.length === 2) {
          suggestions.push('database', 'llm', 'agents', 'all');
        }
        break;

      case 'community':
        if (parts.length === 3 && parts[1] === 'events') {
          suggestions.push('all', 'planned', 'active', 'completed');
        }
        break;
    }

    // Filter suggestions based on partial input
    const partial = parts[parts.length - 1].toLowerCase();
    return suggestions.filter(s => s.toLowerCase().startsWith(partial));
  }

  // Get recent unique commands for quick access
  getRecentCommands(limit: number = 10): string[] {
    const recentCommands: string[] = [];
    const seen = new Set<string>();

    // Iterate from most recent
    for (let i = this.history.length - 1; i >= 0 && recentCommands.length < limit; i--) {
      const command = this.history[i].command;
      if (!seen.has(command)) {
        seen.add(command);
        recentCommands.push(command);
      }
    }

    return recentCommands;
  }

  // Get command frequency for intelligent suggestions
  getCommandFrequency(): Map<string, number> {
    const frequency = new Map<string, number>();

    this.history.forEach(entry => {
      const count = frequency.get(entry.command) || 0;
      frequency.set(entry.command, count + 1);
    });

    return frequency;
  }

  // Export history to JSON
  exportHistory(): string {
    return JSON.stringify({
      version: '1.0',
      exportDate: new Date().toISOString(),
      entries: this.history
    }, null, 2);
  }

  // Import history from JSON
  importHistory(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      if (data.entries && Array.isArray(data.entries)) {
        this.history = data.entries.map(entry => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
        this.historyIndex = this.history.length;
        this.emit('history:imported', { count: this.history.length });
      }
    } catch (error) {
      logger.error('Failed to import history:', error);
      throw new Error('Invalid history format');
    }
  }
}