/**
 * LLM Display Handler - Manages AI-generated display content and visualizations
 */

import { EventEmitter } from 'events';
import { TerminalDisplay } from '../terminal/display.js';
import { LLMOrchestrator } from './orchestrator.js';
import { RouteDecision } from './router.js';
import { logger } from '../utils/logger.js';
import chalk from 'chalk';

export interface DisplayContent {
  type: 'text' | 'list' | 'table' | 'chart' | 'timeline' | 'graph';
  data: any;
  metadata?: any;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export class LLMDisplay extends EventEmitter {
  private display: TerminalDisplay;
  private orchestrator: LLMOrchestrator;
  private conversationHistory: ConversationTurn[] = [];
  private maxHistoryLength: number = 50;
  private displayStyles: Map<string, any> = new Map();
  private terminalWidth: number = 80;
  private terminalHeight: number = 25;
  private maxContentHeight: number = 20; // Reserve lines for UI chrome

  constructor(display: TerminalDisplay, orchestrator: LLMOrchestrator) {
    super();
    this.display = display;
    this.orchestrator = orchestrator;
    this.initializeStyles();
    this.detectTerminalSize();
  }

  private detectTerminalSize(): void {
    // Update terminal dimensions
    this.terminalWidth = process.stdout.columns || 80;
    this.terminalHeight = process.stdout.rows || 25;
    this.maxContentHeight = this.terminalHeight - 5; // Reserve for headers/footers

    // Listen for terminal resize
    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80;
      this.terminalHeight = process.stdout.rows || 25;
      this.maxContentHeight = this.terminalHeight - 5;
    });
  }

  private initializeStyles(): void {
    // Define display styles for different content types
    this.displayStyles.set('query', {
      prefix: '❓ ',
      color: chalk.cyan
    });

    this.displayStyles.set('response', {
      prefix: '🤖 ',
      color: chalk.green
    });

    this.displayStyles.set('error', {
      prefix: '❌ ',
      color: chalk.red
    });

    this.displayStyles.set('thinking', {
      prefix: '🤔 ',
      color: chalk.yellow
    });

    this.displayStyles.set('agent', {
      prefix: '👥 ',
      color: chalk.blue
    });
  }

  async displayQueryResult(query: string, result: any): Promise<void> {
    // Add to conversation history
    this.addToHistory('user', query);
    this.addToHistory('assistant', result.response);

    // Display the query
    this.displayQuery(query);

    // Show thinking indicator if processing
    if (result.processing) {
      this.showThinking('Processing your query...');
    }

    // Display the main response
    this.displayResponse(result.response);

    // Display sources if available
    if (result.sources && result.sources.length > 0) {
      this.displaySources(result.sources);
    }

    // Display suggested actions if any
    if (result.actions && result.actions.length > 0) {
      this.displayActions(result.actions);
    }

    // Display confidence if available
    if (result.confidence !== undefined) {
      this.displayConfidence(result.confidence);
    }

    this.emit('query:displayed', { query, result });
  }

  private displayQuery(query: string): void {
    const style = this.displayStyles.get('query');
    console.log(`\n${  style.color(`${style.prefix  }Your Query:`)}`);
    console.log(this.formatText(query, 2));
  }

  private displayResponse(response: string): void {
    const style = this.displayStyles.get('response');
    console.log(`\n${  style.color(`${style.prefix  }Response:`)}`);

    // Parse and format the response
    const formatted = this.formatResponse(response);
    console.log(formatted);
  }

  private formatResponse(response: string): string {
    // Split response into paragraphs
    const paragraphs = response.split('\n\n');

    return paragraphs.map(paragraph => {
      // Check for special formatting
      if (paragraph.startsWith('###')) {
        // Header
        return chalk.bold.underline(paragraph.replace(/^###\s*/, ''));
      } else if (paragraph.startsWith('-') || paragraph.startsWith('•')) {
        // List
        return this.formatList(paragraph);
      } else if (paragraph.includes('|')) {
        // Potential table
        return this.formatTable(paragraph);
      } else {
        // Regular paragraph
        return this.formatText(paragraph, 2);
      }
    }).join('\n\n');
  }

  private formatList(text: string): string {
    const lines = text.split('\n');
    return lines.map(line => {
      if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        return `  ${  chalk.dim('•')  }${line.replace(/^[-•]\s*/, ' ')}`;
      }
      return `    ${  line}`;
    }).join('\n');
  }

  private formatTable(text: string): string {
    // Simple table detection and formatting
    const lines = text.split('\n');
    const hasTable = lines.some(line => line.includes('|'));

    if (!hasTable) return this.formatText(text, 2);

    return lines.map(line => {
      if (line.includes('|')) {
        return `  ${  line.split('|').map(cell => cell.trim()).join(' │ ')}`;
      }
      return `  ${  line}`;
    }).join('\n');
  }

  private formatText(text: string, indent: number = 0): string {
    const effectiveWidth = this.terminalWidth - indent - 2; // Leave margin
    return this.wrapText(text, effectiveWidth, indent);
  }

  /**
   * Intelligent text wrapping that preserves word boundaries and handles special cases
   */
  private wrapText(text: string, maxWidth: number, indent: number = 0): string {
    if (!text) return '';

    const lines: string[] = [];
    const paragraphs = text.split('\n');

    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') {
        lines.push('');
        return;
      }

      const words = paragraph.split(/\s+/);
      let currentLine = ' '.repeat(indent);

      words.forEach(word => {
        // Handle long words that exceed max width
        if (word.length > maxWidth - indent) {
          if (currentLine.trim()) {
            lines.push(currentLine.trimEnd());
            currentLine = ' '.repeat(indent);
          }
          // Break long word with hyphenation
          const chunks = this.breakLongWord(word, maxWidth - indent - 1);
          chunks.forEach((chunk, idx) => {
            if (idx < chunks.length - 1) {
              lines.push(`${' '.repeat(indent) + chunk  }-`);
            } else {
              currentLine = `${' '.repeat(indent) + chunk  } `;
            }
          });
        } else if ((currentLine + word).length > maxWidth) {
          lines.push(currentLine.trimEnd());
          currentLine = `${' '.repeat(indent) + word  } `;
        } else {
          currentLine += `${word  } `;
        }
      });

      if (currentLine.trim()) {
        lines.push(currentLine.trimEnd());
      }
    });

    return lines.join('\n');
  }

  /**
   * Break long words intelligently
   */
  private breakLongWord(word: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = word;

    while (remaining.length > maxLength) {
      // Try to break at syllable boundaries or punctuation
      let breakPoint = maxLength;

      // Look for natural break points
      for (let i = maxLength - 1; i > maxLength * 0.6; i--) {
        if (/[aeiou][^aeiou]/.test(remaining.substring(i - 1, i + 1))) {
          breakPoint = i;
          break;
        }
      }

      chunks.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint);
    }

    if (remaining) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * Format content to fit within terminal constraints
   */
  private formatForTerminal(content: string, reservedLines: number = 0): string {
    const availableHeight = this.maxContentHeight - reservedLines;
    const lines = content.split('\n');

    if (lines.length <= availableHeight) {
      return content;
    }

    // Truncate with ellipsis
    const truncated = lines.slice(0, availableHeight - 1);
    truncated.push(chalk.dim('... (content truncated for terminal)'));

    return truncated.join('\n');
  }

  private displaySources(sources: string[]): void {
    const style = this.displayStyles.get('agent');
    console.log(`\n${  style.color(`${style.prefix  }Information Sources:`)}`);

    sources.forEach(source => {
      console.log(`  ${chalk.dim('•')} ${this.formatAgentName(source)}`);
    });
  }

  private formatAgentName(role: string): string {
    const nameMap: Record<string, string> = {
      'bureaucracy': 'Bureaucracy Agent (Policies & Procedures)',
      'family': 'Family Agent (Relationships & Traditions)',
      'community': 'Community Agent (Events & Projects)'
    };

    return nameMap[role] || role;
  }

  private displayActions(actions: any[]): void {
    console.log(`\n${  chalk.magenta('💡 Suggested Actions:')}`);

    actions.forEach((action, index) => {
      console.log(`  ${chalk.dim(`${index + 1}.`)} ${action.description}`);
      if (action.source) {
        console.log(`     ${chalk.dim(`via ${this.formatAgentName(action.source)}`)}`);
      }
    });
  }

  private displayConfidence(confidence: number): void {
    const bar = this.createConfidenceBar(confidence);
    console.log(`\n${  chalk.dim(`Confidence: ${bar} ${confidence}%`)}`);
  }

  private createConfidenceBar(confidence: number): string {
    const width = 20;
    const filled = Math.round((confidence / 100) * width);
    const empty = width - filled;

    const color = confidence >= 80 ? chalk.green :
      confidence >= 60 ? chalk.yellow :
        chalk.red;

    return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  }

  showThinking(message: string): void {
    const style = this.displayStyles.get('thinking');
    this.display.startProgress('thinking', {
      text: style.color(style.prefix + message),
      spinner: 'dots'
    });
  }

  hideThinking(): void {
    this.display.stopProgress('thinking', true);
  }

  async displayConversation(): Promise<void> {
    this.display.clear();
    this.display.showBanner('Conversation History', `${this.conversationHistory.length} messages`);

    this.conversationHistory.forEach(turn => {
      const timestamp = turn.timestamp.toLocaleTimeString();
      const role = turn.role === 'user' ? chalk.cyan('[You]') : chalk.green('[Assistant]');

      console.log(`\n${chalk.dim(timestamp)} ${role}`);
      console.log(this.formatText(turn.content, 2));
    });

    this.display.showDivider();
  }

  async generateSummary(data: any, type: string): Promise<string> {
    const prompt = `Generate a concise, informative summary of the following ${type} data:

${JSON.stringify(data, null, 2)}

Format the summary to be clear and easy to read, highlighting key information.`;

    try {
      const summary = await this.orchestrator.complete(prompt, {
        maxTokens: 512,
        temperature: 0.5
      });

      return summary;
    } catch (error) {
      logger.error('Failed to generate summary:', error);
      return 'Unable to generate summary at this time.';
    }
  }

  async visualizeData(data: any, visualizationType: string): Promise<void> {
    // Generate appropriate visualization based on type
    switch (visualizationType) {
      case 'timeline':
        await this.displayTimeline(data);
        break;
      case 'chart':
        await this.displayChart(data);
        break;
      case 'graph':
        await this.displayGraph(data);
        break;
      default:
        this.display.showTable(
          Object.keys(data[0] || {}),
          data.map((item: any) => Object.values(item).map(String))
        );
    }
  }

  private async displayTimeline(events: any[]): Promise<void> {
    console.log(`\n${  chalk.bold('📅 Timeline:')}`);

    const sortedEvents = events.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    sortedEvents.forEach((event, index) => {
      const date = new Date(event.date).toLocaleDateString();
      const isLast = index === sortedEvents.length - 1;

      console.log(`  ${isLast ? '└' : '├'}─ ${chalk.cyan(date)}: ${event.name}`);
      if (event.description) {
        console.log(`  ${isLast ? ' ' : '│'}   ${chalk.dim(event.description)}`);
      }
    });
  }

  private async displayChart(data: any): Promise<void> {
    // Simple ASCII bar chart
    console.log(`\n${  chalk.bold('📊 Chart:')}`);

    const maxValue = Math.max(...data.map((d: any) => d.value));
    const scale = 40 / maxValue;

    data.forEach((item: any) => {
      const barLength = Math.round(item.value * scale);
      const bar = '█'.repeat(barLength);
      const label = item.label.padEnd(15);

      console.log(`  ${label} ${chalk.cyan(bar)} ${item.value}`);
    });
  }

  private async displayGraph(data: any): Promise<void> {
    // Simple relationship graph visualization
    console.log(`\n${  chalk.bold('🔗 Relationship Graph:')}`);

    data.nodes?.forEach((node: any) => {
      console.log(`\n  ${chalk.bold(node.name)} (${node.type})`);

      const connections = data.edges?.filter((e: any) => e.from === node.id);
      connections?.forEach((edge: any) => {
        const target = data.nodes.find((n: any) => n.id === edge.to);
        console.log(`    └─${edge.type}→ ${target?.name || edge.to}`);
      });
    });
  }

  private addToHistory(role: 'user' | 'assistant' | 'system', content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date()
    });

    // Trim history if too long
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.emit('history:cleared');
  }

  getHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  /**
   * Display content with pagination support for terminal constraints
   */
  async displayPaginated(content: string, title?: string): Promise<void> {
    const lines = content.split('\n');
    const pageSize = this.maxContentHeight - 3; // Reserve for header and navigation
    const currentPage = 0;
    const totalPages = Math.ceil(lines.length / pageSize);

    const displayPage = () => {
      this.display.clear();

      // Display header
      if (title) {
        this.display.showBanner(title, `Page ${currentPage + 1}/${totalPages}`);
      }

      // Display content
      const startIdx = currentPage * pageSize;
      const pageContent = lines.slice(startIdx, startIdx + pageSize).join('\n');
      console.log(pageContent);

      // Display navigation
      if (totalPages > 1) {
        console.log(chalk.dim(`\n${  '─'.repeat(this.terminalWidth - 2)}`));
        console.log(chalk.cyan('Navigation: [n]ext, [p]revious, [q]uit'));
      }
    };

    // Initial display
    displayPage();

    // Handle pagination if needed
    if (totalPages > 1) {
      // Note: In a real implementation, you'd handle keyboard input here
      // For now, we'll just show the first page
      this.emit('pagination:shown', { pages: totalPages, currentPage: 0 });
    }
  }

  /**
   * Create a compact summary visualization for terminal display
   */
  formatCompactSummary(data: any): string {
    const lines: string[] = [];
    const maxWidth = this.terminalWidth - 4;

    // Title section
    if (data.title) {
      lines.push(chalk.bold(this.centerText(data.title, maxWidth)));
      lines.push('─'.repeat(maxWidth));
    }

    // Key points
    if (data.keyPoints && Array.isArray(data.keyPoints)) {
      lines.push(chalk.cyan('Key Points:'));
      data.keyPoints.slice(0, 5).forEach((point: string, idx: number) => {
        const wrapped = this.wrapText(`${idx + 1}. ${point}`, maxWidth - 3, 3);
        lines.push(wrapped);
      });
    }

    // Statistics
    if (data.stats && typeof data.stats === 'object') {
      lines.push('');
      lines.push(chalk.cyan('Quick Stats:'));
      const statLines = this.formatCompactStats(data.stats, maxWidth - 2);
      lines.push(...statLines);
    }

    // Actions
    if (data.actions && Array.isArray(data.actions)) {
      lines.push('');
      lines.push(chalk.cyan('Available Actions:'));
      data.actions.slice(0, 3).forEach((action: any) => {
        lines.push(`  • ${action.label || action}`);
      });
    }

    return this.formatForTerminal(lines.join('\n'));
  }

  /**
   * Format statistics in a compact grid layout
   */
  private formatCompactStats(stats: Record<string, any>, maxWidth: number): string[] {
    const lines: string[] = [];
    const entries = Object.entries(stats).slice(0, 6); // Limit to 6 stats
    const columnWidth = Math.floor((maxWidth - 4) / 2);

    for (let i = 0; i < entries.length; i += 2) {
      const left = this.formatStatEntry(entries[i], columnWidth);
      const right = entries[i + 1] ? this.formatStatEntry(entries[i + 1], columnWidth) : '';
      lines.push(`  ${left}${right ? `  ${  right}` : ''}`);
    }

    return lines;
  }

  /**
   * Format a single stat entry
   */
  private formatStatEntry([key, value]: [string, any], width: number): string {
    const label = this.humanizeKey(key);
    const val = this.formatValue(value);
    const entry = `${label}: ${val}`;

    if (entry.length > width) {
      return `${entry.substring(0, width - 3)  }...`;
    }

    return entry.padEnd(width);
  }

  /**
   * Convert camelCase or snake_case to human readable
   */
  private humanizeKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }

  /**
   * Format various value types concisely
   */
  private formatValue(value: any): string {
    if (typeof value === 'number') {
      if (value > 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value > 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toFixed(Number.isInteger(value) ? 0 : 2);
    }
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    if (value instanceof Date) return value.toLocaleDateString();
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return '[Object]';
    return String(value).substring(0, 20);
  }

  /**
   * Center text within a given width
   */
  private centerText(text: string, width: number): string {
    if (text.length >= width) return text;
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(padding) + text;
  }

  /**
   * Create an ASCII progress bar
   */
  createProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return `[${bar}] ${progress}%`;
  }

  /**
   * Display a compact routing decision visualization
   */
  displayRoutingDecision(decision: RouteDecision): void {
    const lines: string[] = [];
    const width = this.terminalWidth - 4;

    // Header
    lines.push(chalk.bold('🔄 Routing Decision'));
    lines.push('─'.repeat(width));

    // Primary agent
    lines.push(`Primary: ${chalk.green(decision.primaryAgent)} (${decision.confidence}% confidence)`);

    // Intent
    lines.push(`Intent: ${decision.intent.category} → ${decision.intent.action}`);

    // Complexity and urgency indicators
    const indicators = [];
    if (decision.complexity === 'complex') indicators.push(chalk.red('Complex'));
    else if (decision.complexity === 'moderate') indicators.push(chalk.yellow('Moderate'));
    else indicators.push(chalk.green('Simple'));

    if (decision.urgency === 'high') indicators.push(chalk.red('Urgent'));
    else if (decision.urgency === 'medium') indicators.push(chalk.yellow('Medium Priority'));

    if (indicators.length > 0) {
      lines.push(`Status: ${indicators.join(' | ')}`);
    }

    // Entities summary
    if (decision.entities && decision.entities.length > 0) {
      const entitySummary = decision.entities
        .slice(0, 3)
        .map((e: any) => `${e.type}:${e.value}`)
        .join(', ');
      lines.push(`Entities: ${chalk.dim(entitySummary)}`);
    }

    console.log(`\n${  lines.join('\n')}`);
  }
}