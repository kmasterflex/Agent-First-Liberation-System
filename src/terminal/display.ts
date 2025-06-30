/**
 * Terminal Display Manager - Handles visual output and formatting
 * Optimized for ABC Terminal (80x25) and e-ink displays
 */

import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';

export interface DisplayTheme {
  primary: typeof chalk;
  secondary: typeof chalk;
  success: typeof chalk;
  error: typeof chalk;
  warning: typeof chalk;
  info: typeof chalk;
  muted: typeof chalk;
}

export interface DisplayConfig {
  width: number;
  height: number;
  eInkMode: boolean;
  refreshDelay: number;
  monochrome: boolean;
}

export interface ProgressOptions {
  text: string;
  color?: string;
  spinner?: string;
}

export class TerminalDisplay extends EventEmitter {
  private theme: DisplayTheme;
  private activeSpinners: Map<string, any> = new Map();
  private displayWidth: number = 80;
  private displayHeight: number = 25;
  private config: DisplayConfig;
  private buffer: string[] = [];
  private lastRefresh: number = Date.now();
  private promptPrefix: string = '> ';
  private statusLine: string = '';

  constructor(config?: Partial<DisplayConfig>) {
    super();
    this.config = {
      width: 80,
      height: 25,
      eInkMode: false,
      refreshDelay: 200, // milliseconds between e-ink refreshes
      monochrome: false,
      ...config
    };
    this.displayWidth = this.config.width;
    this.displayHeight = this.config.height;
    this.theme = this.createDefaultTheme();
    this.setupTerminal();
  }

  private createDefaultTheme(): DisplayTheme {
    return {
      primary: chalk.cyan,
      secondary: chalk.blue,
      success: chalk.green,
      error: chalk.red,
      warning: chalk.yellow,
      info: chalk.magenta,
      muted: chalk.gray
    };
  }

  private setupTerminal(): void {
    // ABC Terminal enforces 80x25 display
    if (!this.config.eInkMode) {
      this.displayWidth = Math.min(process.stdout.columns || 80, this.config.width);
      this.displayHeight = Math.min(process.stdout.rows || 25, this.config.height);
    }

    process.stdout.on('resize', () => {
      if (!this.config.eInkMode) {
        this.displayWidth = Math.min(process.stdout.columns || 80, this.config.width);
        this.displayHeight = Math.min(process.stdout.rows || 25, this.config.height);
        this.emit('resize', { width: this.displayWidth, height: this.displayHeight });
      }
    });

    // Set up e-ink specific handling
    if (this.config.eInkMode) {
      this.setupEInkMode();
    }
  }

  private setupEInkMode(): void {
    // Disable colors for e-ink
    if (this.config.monochrome) {
      chalk.level = 0;
    }
    // Use simple characters for better e-ink readability
    this.promptPrefix = '>> ';
  }

  // Headers and Titles
  showBanner(title: string, subtitle?: string): void {
    if (this.shouldRefresh()) {
      console.clear();
      const banner = this.createBanner(title, subtitle);
      this.output(banner);
    }
  }

  private shouldRefresh(): boolean {
    if (!this.config.eInkMode) return true;

    const now = Date.now();
    if (now - this.lastRefresh >= this.config.refreshDelay) {
      this.lastRefresh = now;
      return true;
    }
    return false;
  }

  output(text: string): void {
    if (this.config.eInkMode) {
      // Buffer output for e-ink displays
      this.buffer.push(text);
      if (this.shouldRefresh()) {
        this.flushBuffer();
      }
    } else {
      console.log(text);
    }
  }

  private flushBuffer(): void {
    if (this.buffer.length > 0) {
      console.log(this.buffer.join('\n'));
      this.buffer = [];
    }
  }

  private createBanner(title: string, subtitle?: string): string {
    // Use simpler border for e-ink displays
    const borderChar = this.config.eInkMode ? '-' : '═';
    const border = borderChar.repeat(this.displayWidth);
    const padding = ' '.repeat(Math.max(0, Math.floor((this.displayWidth - title.length) / 2)));

    let banner = `\n${  this.theme.primary(border)  }\n`;
    banner += `${padding + this.theme.primary.bold(title)  }\n`;

    if (subtitle) {
      const subPadding = ' '.repeat(Math.max(0, Math.floor((this.displayWidth - subtitle.length) / 2)));
      banner += `${subPadding + this.theme.secondary(subtitle)  }\n`;
    }

    banner += `${this.theme.primary(border)  }\n`;
    return banner;
  }

  showHeader(text: string, level: 1 | 2 | 3 = 1): void {
    const formatted = this.formatHeader(text, level);
    this.output(formatted);
  }

  private formatHeader(text: string, level: number): string {
    switch (level) {
      case 1:
        return `\n${  this.theme.primary.bold.underline(text)  }\n`;
      case 2:
        return `\n${  this.theme.secondary.bold(text)  }\n`;
      case 3:
        return this.theme.info(text);
      default:
        return text;
    }
  }

  // Messages
  showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const formatted = this.formatMessage(message, type);
    this.output(formatted);
  }

  private formatMessage(message: string, type: string): string {
    // Use ASCII characters for e-ink compatibility
    const icons = this.config.eInkMode ? {
      info: '[i]',
      success: '[+]',
      warning: '[!]',
      error: '[x]'
    } : {
      info: 'ℹ',
      success: '✓',
      warning: '⚠',
      error: '✗'
    };

    const icon = icons[type as keyof typeof icons] || '•';
    const colorFn = this.theme[type as keyof DisplayTheme] || this.theme.info;

    return colorFn(`${icon} ${message}`);
  }

  // Lists and Tables
  showList(title: string, items: string[]): void {
    if (title) {
      this.output(this.theme.secondary.bold(title));
    }
    const bullet = this.config.eInkMode ? '  * ' : '  • ';
    items.forEach(item => {
      this.output(this.theme.muted(bullet) + item);
    });
    this.output('');
  }

  showTable(headers: string[], rows: string[][]): void {
    const columnWidths = this.calculateColumnWidths(headers, rows);
    const separator = this.config.eInkMode ? ' | ' : ' │ ';

    // Ensure table fits within display width
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0) +
                      (separator.length * (headers.length - 1));

    if (totalWidth > this.displayWidth) {
      // Truncate columns to fit
      const availableWidth = this.displayWidth - (separator.length * (headers.length - 1));
      const avgWidth = Math.floor(availableWidth / headers.length);
      columnWidths.fill(avgWidth);
    }

    // Print headers
    const headerRow = headers.map((header, i) =>
      this.truncate(header, columnWidths[i]).padEnd(columnWidths[i])
    ).join(separator);

    this.output(this.theme.primary.bold(headerRow));
    this.output(this.theme.muted('-'.repeat(Math.min(headerRow.length, this.displayWidth))));

    // Print rows
    rows.forEach(row => {
      const formattedRow = row.map((cell, i) =>
        this.truncate(cell, columnWidths[i]).padEnd(columnWidths[i])
      ).join(separator);
      this.output(formattedRow);
    });

    this.output('');
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength - 3)  }...`;
  }

  private calculateColumnWidths(headers: string[], rows: string[][]): number[] {
    const widths = headers.map(h => h.length);

    rows.forEach(row => {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i], cell.length);
      });
    });

    return widths;
  }

  // Progress Indicators
  startProgress(id: string, options: ProgressOptions): void {
    if (this.config.eInkMode) {
      // Simple text-based progress for e-ink
      this.output(`[...] ${options.text}`);
    } else {
      const spinner = ora({
        text: options.text,
        color: options.color as any || 'cyan',
        spinner: options.spinner as any || 'dots'
      });

      spinner.start();
      this.activeSpinners.set(id, spinner);
    }
  }

  updateProgress(id: string, text: string): void {
    if (this.config.eInkMode) {
      this.output(`[...] ${text}`);
    } else {
      const spinner = this.activeSpinners.get(id);
      if (spinner) {
        spinner.text = text;
      }
    }
  }

  stopProgress(id: string, success: boolean = true, finalText?: string): void {
    if (this.config.eInkMode) {
      const icon = success ? '[OK]' : '[FAIL]';
      this.output(`${icon} ${finalText || 'Done'}`);
    } else {
      const spinner = this.activeSpinners.get(id);
      if (spinner) {
        if (success) {
          spinner.succeed(finalText || spinner.text);
        } else {
          spinner.fail(finalText || spinner.text);
        }
        this.activeSpinners.delete(id);
      }
    }
  }

  // Agent Display
  showAgentMessage(agentName: string, role: string, message: string): void {
    const header = `[${role.toUpperCase()}] ${agentName}`;
    this.output(this.theme.secondary.bold(header));
    this.output(this.wrapText(message, 2));
    this.output('');
  }

  showAgentStatus(agents: any[]): void {
    console.log(this.theme.primary.bold('Active Agents:'));

    const headers = ['Name', 'Role', 'Status', 'Uptime'];
    const rows = agents.map(agent => [
      agent.name,
      agent.role,
      agent.isActive ? this.theme.success('Active') : this.theme.error('Inactive'),
      this.formatUptime(agent.stats?.uptime || 0)
    ]);

    this.showTable(headers, rows);
  }

  // Community Display
  showCommunityStats(stats: any): void {
    console.log(this.theme.primary.bold('Community Statistics:'));

    const items = [
      `Total Members: ${this.theme.info(stats.totalMembers)}`,
      `Active Events: ${this.theme.info(stats.activeEvents)}`,
      `Active Projects: ${this.theme.info(stats.activeProjects)}`,
      `Average Reputation: ${this.theme.info(stats.averageReputation)}`,
      `Resource Utilization: ${this.theme.info(`${stats.resourceUtilization  }%`)}`
    ];

    this.showList('', items);
  }

  // Event Display
  showEvent(event: any): void {
    console.log(this.theme.secondary.bold(`Event: ${event.name}`));
    console.log(this.theme.muted(`Type: ${event.type}`));
    console.log(this.theme.muted(`Date: ${new Date(event.date).toLocaleString()}`));
    console.log(this.theme.muted(`Location: ${event.location}`));
    console.log(this.theme.muted(`Attendees: ${event.attendeeCount}`));
    console.log(this.theme.muted(`Status: ${event.status}`));
    console.log();
  }

  // ABC Terminal Prompt System
  showPrompt(text: string = '', showPrefix: boolean = true): void {
    const prompt = showPrefix ? this.promptPrefix + text : text;
    process.stdout.write(this.theme.primary(prompt));
  }

  setPromptPrefix(prefix: string): void {
    this.promptPrefix = prefix;
  }

  // Status Line Management (line 25 of terminal)
  showStatusLine(status: string): void {
    this.statusLine = status;
    if (!this.config.eInkMode) {
      // Save cursor position, move to line 25, clear line, print status, restore
      process.stdout.write('\x1b[s'); // Save cursor
      process.stdout.write(`\x1b[${this.displayHeight};1H`); // Move to bottom line
      process.stdout.write('\x1b[2K'); // Clear line
      process.stdout.write(this.theme.muted(this.truncate(status, this.displayWidth)));
      process.stdout.write('\x1b[u'); // Restore cursor
    }
  }

  clearStatusLine(): void {
    this.showStatusLine('');
  }

  // Utility Methods
  clear(): void {
    if (this.config.eInkMode && !this.shouldRefresh()) {
      return; // Skip clear on e-ink unless refresh is due
    }
    console.clear();
    if (this.statusLine) {
      this.showStatusLine(this.statusLine);
    }
  }

  showDivider(): void {
    const dividerChar = this.config.eInkMode ? '-' : '─';
    this.output(this.theme.muted(dividerChar.repeat(this.displayWidth)));
  }

  // Box Drawing for ABC Terminal
  drawBox(x: number, y: number, width: number, height: number, title?: string): void {
    // Ensure box fits within display
    width = Math.min(width, this.displayWidth - x);
    height = Math.min(height, this.displayHeight - y);

    const chars = this.config.eInkMode ? {
      topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
      horizontal: '-', vertical: '|'
    } : {
      topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
      horizontal: '─', vertical: '│'
    };

    // Draw top border
    let topBorder = chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight;
    if (title && title.length < width - 4) {
      const titleStart = Math.floor((width - title.length - 2) / 2);
      topBorder = `${chars.topLeft + chars.horizontal.repeat(titleStart - 1)
      } ${  title  } ${
        chars.horizontal.repeat(width - titleStart - title.length - 3)
      }${chars.topRight}`;
    }

    this.moveCursor(x, y);
    process.stdout.write(topBorder);

    // Draw sides
    for (let i = 1; i < height - 1; i++) {
      this.moveCursor(x, y + i);
      process.stdout.write(chars.vertical);
      this.moveCursor(x + width - 1, y + i);
      process.stdout.write(chars.vertical);
    }

    // Draw bottom border
    this.moveCursor(x, y + height - 1);
    process.stdout.write(chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight);
  }

  private moveCursor(x: number, y: number): void {
    process.stdout.write(`\x1b[${y};${x}H`);
  }

  private wrapText(text: string, indent: number = 0): string {
    const maxWidth = this.displayWidth - indent;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + word).length > maxWidth) {
        lines.push(currentLine.trim());
        currentLine = `${' '.repeat(indent) + word  } `;
      } else {
        currentLine += `${word  } `;
      }
    });

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }

  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
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

  // Theme Management
  setTheme(theme: Partial<DisplayTheme>): void {
    this.theme = { ...this.theme, ...theme };
    this.emit('theme:changed', this.theme);
  }

  getTheme(): DisplayTheme {
    return { ...this.theme };
  }

  // Configuration Management
  setConfig(config: Partial<DisplayConfig>): void {
    const oldEInkMode = this.config.eInkMode;
    this.config = { ...this.config, ...config };

    if (config.eInkMode !== oldEInkMode) {
      this.setupTerminal();
    }

    this.emit('config:changed', this.config);
  }

  getConfig(): DisplayConfig {
    return { ...this.config };
  }

  // Force refresh for e-ink displays
  forceRefresh(): void {
    if (this.config.eInkMode) {
      this.lastRefresh = 0;
      this.flushBuffer();
    }
  }
}