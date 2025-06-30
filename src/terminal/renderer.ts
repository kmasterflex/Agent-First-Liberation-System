/**
 * Terminal Renderer - Manages the rendering pipeline and UI updates
 * Enhanced for ABC Terminal (80x25) and e-ink compatibility
 */

import { EventEmitter } from 'events';
import { TerminalDisplay } from './display.js';
import { logger } from '../utils/logger.js';

export interface RenderContext {
  agents: any[];
  events: any[];
  messages: any[];
  stats: any;
  currentView: string;
  systemStatus?: SystemStatus;
  refreshRate?: number;
}

export interface SystemStatus {
  cpu: number;
  memory: number;
  disk: number;
  network: 'online' | 'offline';
  timestamp: Date;
}

export interface ViewRenderer {
  name: string;
  render: (context: RenderContext, display: TerminalDisplay) => void;
}

export class TerminalRenderer extends EventEmitter {
  private display: TerminalDisplay;
  private views: Map<string, ViewRenderer> = new Map();
  private currentView: string = 'dashboard';
  private renderInterval: NodeJS.Timeout | null = null;
  private context: RenderContext;
  private isAutoRefresh: boolean = false;
  private frameBuffer: string[] = [];
  private layoutMode: 'single' | 'split' | 'grid' = 'single';

  constructor(display: TerminalDisplay) {
    super();
    this.display = display;
    this.context = {
      agents: [],
      events: [],
      messages: [],
      stats: {},
      currentView: this.currentView,
      refreshRate: 1000
    };
    this.registerDefaultViews();
    this.setupKeyboardHandlers();
  }

  private registerDefaultViews(): void {
    // Dashboard view
    this.registerView({
      name: 'dashboard',
      render: this.renderDashboard.bind(this)
    });

    // Agents view
    this.registerView({
      name: 'agents',
      render: this.renderAgents.bind(this)
    });

    // Events view
    this.registerView({
      name: 'events',
      render: this.renderEvents.bind(this)
    });

    // Messages view
    this.registerView({
      name: 'messages',
      render: this.renderMessages.bind(this)
    });

    // Community view
    this.registerView({
      name: 'community',
      render: this.renderCommunity.bind(this)
    });

    // System view
    this.registerView({
      name: 'system',
      render: this.renderSystem.bind(this)
    });

    // Monitor view (for split screen)
    this.registerView({
      name: 'monitor',
      render: this.renderMonitor.bind(this)
    });

    logger.info(`Registered ${this.views.size} default views`);
  }

  private setupKeyboardHandlers(): void {
    // Handle view switching with function keys
    process.stdin.on('keypress', (str, key) => {
      if (key?.name) {
        switch (key.name) {
          case 'f1':
            this.switchView('dashboard');
            break;
          case 'f2':
            this.switchView('agents');
            break;
          case 'f3':
            this.switchView('events');
            break;
          case 'f4':
            this.switchView('messages');
            break;
          case 'f5':
            this.switchView('community');
            break;
          case 'f6':
            this.switchView('system');
            break;
          case 'f9':
            this.toggleLayout();
            break;
          case 'f10':
            this.toggleAutoRefresh();
            break;
        }
      }
    });
  }

  registerView(view: ViewRenderer): void {
    this.views.set(view.name, view);
    this.emit('view:registered', view);
  }

  switchView(viewName: string): void {
    if (!this.views.has(viewName)) {
      logger.error(`Unknown view: ${viewName}`);
      return;
    }

    this.currentView = viewName;
    this.context.currentView = viewName;
    this.render();
    this.emit('view:switched', viewName);
  }

  updateContext(updates: Partial<RenderContext>): void {
    this.context = { ...this.context, ...updates };

    if (this.isAutoRefresh) {
      this.render();
    }
  }

  render(): void {
    // Clear frame buffer for new render
    this.frameBuffer = [];

    // Update status line
    this.updateStatusLine();

    if (this.layoutMode === 'split') {
      this.renderSplitView();
    } else if (this.layoutMode === 'grid') {
      this.renderGridView();
    } else {
      this.renderSingleView();
    }

    this.emit('rendered', this.currentView);
  }

  private renderSingleView(): void {
    const view = this.views.get(this.currentView);
    if (!view) {
      logger.error(`View not found: ${this.currentView}`);
      return;
    }

    try {
      view.render(this.context, this.display);
    } catch (error) {
      logger.error(`Render error in view ${this.currentView}:`, error);
      this.display.showMessage(`Render error: ${error}`, 'error');
    }
  }

  private renderSplitView(): void {
    // Render main view on left, monitor on right
    this.display.clear();

    // Main view (50 chars wide)
    const mainView = this.views.get(this.currentView);
    if (mainView) {
      // Draw left panel
      this.display.drawBox(0, 0, 50, 23, this.currentView);
      // Temporarily reduce display width
      const originalWidth = this.display.getConfig().width;
      this.display.setConfig({ width: 48 });
      mainView.render(this.context, this.display);
      this.display.setConfig({ width: originalWidth });
    }

    // Monitor view (30 chars wide)
    const monitorView = this.views.get('monitor');
    if (monitorView) {
      // Draw right panel
      this.display.drawBox(50, 0, 30, 23, 'Monitor');
      // Temporarily adjust display for right panel
      const originalWidth = this.display.getConfig().width;
      this.display.setConfig({ width: 28 });
      monitorView.render(this.context, this.display);
      this.display.setConfig({ width: originalWidth });
    }
  }

  private renderGridView(): void {
    // 2x2 grid layout
    this.display.clear();

    const views = ['dashboard', 'agents', 'events', 'messages'];
    const positions = [
      { x: 0, y: 0, w: 40, h: 12 },
      { x: 40, y: 0, w: 40, h: 12 },
      { x: 0, y: 12, w: 40, h: 12 },
      { x: 40, y: 12, w: 40, h: 12 }
    ];

    views.forEach((viewName, i) => {
      const view = this.views.get(viewName);
      const pos = positions[i];
      if (view && pos) {
        this.display.drawBox(pos.x, pos.y, pos.w, pos.h, viewName);
        // Render content within box constraints
        const originalConfig = this.display.getConfig();
        this.display.setConfig({ width: pos.w - 2, height: pos.h - 2 });
        view.render(this.context, this.display);
        this.display.setConfig(originalConfig);
      }
    });
  }

  private updateStatusLine(): void {
    const parts = [];

    // Current view
    parts.push(`[${this.currentView.toUpperCase()}]`);

    // System status
    if (this.context.systemStatus) {
      const status = this.context.systemStatus;
      parts.push(`CPU:${Math.round(status.cpu)}%`);
      parts.push(`MEM:${Math.round(status.memory)}%`);
      parts.push(status.network === 'online' ? 'NET:✓' : 'NET:✗');
    }

    // Auto-refresh indicator
    if (this.isAutoRefresh) {
      parts.push('[AUTO]');
    }

    // Layout mode
    if (this.layoutMode !== 'single') {
      parts.push(`[${this.layoutMode.toUpperCase()}]`);
    }

    // Time
    parts.push(new Date().toLocaleTimeString());

    const statusLine = parts.join(' | ');
    this.display.showStatusLine(statusLine);
  }

  startAutoRefresh(intervalMs?: number): void {
    const refreshRate = intervalMs || this.context.refreshRate || 1000;

    if (this.renderInterval) {
      this.stopAutoRefresh();
    }

    this.isAutoRefresh = true;
    this.renderInterval = setInterval(() => {
      // Respect e-ink refresh constraints
      if (this.display.getConfig().eInkMode) {
        // Only refresh if sufficient time has passed
        this.display.forceRefresh();
      }
      this.render();
    }, refreshRate);

    logger.info(`Auto-refresh started with ${refreshRate}ms interval`);
  }

  toggleAutoRefresh(): void {
    if (this.isAutoRefresh) {
      this.stopAutoRefresh();
      this.display.showMessage('Auto-refresh disabled', 'info');
    } else {
      this.startAutoRefresh();
      this.display.showMessage('Auto-refresh enabled', 'success');
    }
  }

  stopAutoRefresh(): void {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
      this.isAutoRefresh = false;
      logger.info('Auto-refresh stopped');
    }
  }

  // Layout Management
  toggleLayout(): void {
    const layouts: Array<'single' | 'split' | 'grid'> = ['single', 'split', 'grid'];
    const currentIndex = layouts.indexOf(this.layoutMode);
    this.layoutMode = layouts[(currentIndex + 1) % layouts.length];
    this.display.showMessage(`Layout: ${this.layoutMode}`, 'info');
    this.render();
  }

  setLayout(mode: 'single' | 'split' | 'grid'): void {
    this.layoutMode = mode;
    this.render();
  }

  // Default View Renderers

  private renderDashboard(context: RenderContext, display: TerminalDisplay): void {
    const config = display.getConfig();
    const compact = config.width < 80 || config.height < 25;

    display.clear();

    if (!compact) {
      display.showBanner('ABC Terminal Dashboard', 'Agent-Based Community System');
    } else {
      display.showHeader('Dashboard', 1);
    }

    // System Status
    display.showHeader('System Status', 2);
    const statusItems = [
      `Active Agents: ${context.agents.filter(a => a.isActive).length}/${context.agents.length}`,
      `Pending Events: ${context.events.filter(e => e.status === 'planned').length}`,
      `Recent Messages: ${context.messages.length}`,
      `Community Members: ${context.stats.totalMembers || 0}`
    ];
    display.showList('', statusItems);

    // Active Agents Summary (limit based on available space)
    if (context.agents.length > 0 && (!compact || config.height > 15)) {
      display.showHeader('Active Agents', 2);
      const maxAgents = compact ? 3 : 5;
      const activeAgents = context.agents
        .filter(a => a.isActive)
        .slice(0, maxAgents)
        .map(a => `${a.name} (${a.role}) - ${this.formatUptime(a.stats?.uptime || 0)}`);
      display.showList('', activeAgents);
    }

    // Recent Events (only show if space available)
    if (context.events.length > 0 && !compact) {
      display.showHeader('Upcoming Events', 2);
      const upcomingEvents = context.events
        .filter(e => new Date(e.date) > new Date())
        .slice(0, 3)
        .map(e => `${e.name} - ${new Date(e.date).toLocaleDateString()}`);
      display.showList('', upcomingEvents);
    }

    // Quick Actions (show in compact form if needed)
    if (!compact) {
      display.showHeader('Quick Actions', 2);
      display.showMessage('• Type "help" for available commands', 'info');
      display.showMessage('• Type "agent list" to see all agents', 'info');
      display.showMessage('• Type "query <question>" to ask the community', 'info');
    } else {
      display.showMessage('F1-F6: Views | F9: Layout | F10: Auto', 'muted');
    }

    display.showDivider();
  }

  private renderAgents(context: RenderContext, display: TerminalDisplay): void {
    display.clear();
    display.showBanner('Agent Management', `${context.agents.length} Total Agents`);

    if (context.agents.length === 0) {
      display.showMessage('No agents currently active', 'info');
      display.showMessage('Use "agent start <role>" to start an agent', 'info');
      return;
    }

    // Group agents by role
    const agentsByRole = new Map<string, any[]>();
    context.agents.forEach(agent => {
      if (!agentsByRole.has(agent.role)) {
        agentsByRole.set(agent.role, []);
      }
      agentsByRole.get(agent.role)!.push(agent);
    });

    // Display each role group
    agentsByRole.forEach((agents, role) => {
      display.showHeader(`${role.charAt(0).toUpperCase() + role.slice(1)} Agents`, 2);

      const headers = ['ID', 'Name', 'Status', 'Uptime', 'Stats'];
      const rows = agents.map(agent => [
        agent.id.split('-').pop()!.slice(0, 8),
        agent.name,
        agent.isActive ? 'Active' : 'Inactive',
        this.formatUptime(agent.stats?.uptime || 0),
        this.getAgentStatsString(agent)
      ]);

      display.showTable(headers, rows);
    });

    display.showDivider();
  }

  private renderEvents(context: RenderContext, display: TerminalDisplay): void {
    display.clear();
    display.showBanner('Community Events', `${context.events.length} Total Events`);

    if (context.events.length === 0) {
      display.showMessage('No events scheduled', 'info');
      display.showMessage('Use "event create" to create a new event', 'info');
      return;
    }

    // Group events by status
    const eventsByStatus = new Map<string, any[]>();
    context.events.forEach(event => {
      if (!eventsByStatus.has(event.status)) {
        eventsByStatus.set(event.status, []);
      }
      eventsByStatus.get(event.status)!.push(event);
    });

    // Display each status group
    ['planned', 'active', 'completed'].forEach(status => {
      const events = eventsByStatus.get(status) || [];
      if (events.length > 0) {
        display.showHeader(`${status.charAt(0).toUpperCase() + status.slice(1)} Events`, 2);

        events.forEach(event => {
          display.showEvent(event);
        });
      }
    });

    display.showDivider();
  }

  private renderMessages(context: RenderContext, display: TerminalDisplay): void {
    display.clear();
    display.showBanner('Message History', `${context.messages.length} Messages`);

    if (context.messages.length === 0) {
      display.showMessage('No messages in history', 'info');
      return;
    }

    // Display recent messages
    const recentMessages = context.messages.slice(-20).reverse();

    recentMessages.forEach(message => {
      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      display.showMessage(`[${timestamp}] ${message.from}:`, 'muted');
      display.showMessage(`  ${message.content}`, 'info');
    });

    display.showDivider();
  }

  private renderCommunity(context: RenderContext, display: TerminalDisplay): void {
    display.clear();
    display.showBanner('Community Overview', context.stats.communityName || 'Default Community');

    // Community Statistics
    if (context.stats) {
      display.showCommunityStats(context.stats);
    }

    // Top Contributors
    if (context.stats.topContributors) {
      display.showHeader('Top Contributors', 2);
      const headers = ['Rank', 'Name', 'Contributions', 'Reputation'];
      const rows = context.stats.topContributors.map((contributor: any, index: number) => [
        (index + 1).toString(),
        contributor.name,
        contributor.contributions.toString(),
        contributor.reputation.toString()
      ]);
      display.showTable(headers, rows);
    }

    // Active Projects
    if (context.stats.activeProjects && context.stats.activeProjects.length > 0) {
      display.showHeader('Active Projects', 2);
      const projectList = context.stats.activeProjects.map((project: any) =>
        `${project.name} - ${project.participantCount} participants (${project.status})`
      );
      display.showList('', projectList);
    }

    display.showDivider();
  }

  // Utility Methods

  // New View Renderers
  private renderSystem(context: RenderContext, display: TerminalDisplay): void {
    display.clear();
    display.showBanner('System Information', 'Technical Details');

    // System Status
    if (context.systemStatus) {
      display.showHeader('Resource Usage', 2);
      const status = context.systemStatus;
      display.showList('', [
        `CPU Usage: ${Math.round(status.cpu)}%`,
        `Memory Usage: ${Math.round(status.memory)}%`,
        `Disk Usage: ${Math.round(status.disk)}%`,
        `Network: ${status.network}`,
        `Last Update: ${status.timestamp.toLocaleTimeString()}`
      ]);
    }

    // Process Information
    display.showHeader('Process Information', 2);
    const processInfo = {
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    display.showList('', [
      `Process ID: ${processInfo.pid}`,
      `Platform: ${processInfo.platform}`,
      `Node Version: ${processInfo.nodeVersion}`,
      `Process Uptime: ${this.formatUptime(processInfo.uptime * 1000)}`,
      `Heap Used: ${Math.round(processInfo.memory.heapUsed / 1024 / 1024)}MB`,
      `Heap Total: ${Math.round(processInfo.memory.heapTotal / 1024 / 1024)}MB`
    ]);

    // Environment
    display.showHeader('Environment', 2);
    display.showList('', [
      `Node ENV: ${process.env.NODE_ENV || 'development'}`,
      `Terminal: ${process.env.TERM || 'unknown'}`,
      `Shell: ${process.env.SHELL || 'unknown'}`,
      `User: ${process.env.USER || 'unknown'}`
    ]);
  }

  private renderMonitor(context: RenderContext, display: TerminalDisplay): void {
    // Compact monitoring view for split screen
    display.showHeader('Monitor', 2);

    // Agent Status
    const activeAgents = context.agents.filter(a => a.isActive).length;
    display.showMessage(`Agents: ${activeAgents}/${context.agents.length}`, 'info');

    // Event Status
    const upcomingEvents = context.events.filter(e => new Date(e.date) > new Date()).length;
    display.showMessage(`Events: ${upcomingEvents}`, 'info');

    // Recent Activity
    if (context.messages.length > 0) {
      display.showHeader('Recent', 3);
      const recentMessages = context.messages.slice(-5).reverse();
      recentMessages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString().split(':').slice(0, 2).join(':');
        display.showMessage(`[${time}] ${msg.from}`, 'muted');
      });
    }

    // System Health
    if (context.systemStatus) {
      display.showHeader('System', 3);
      const status = context.systemStatus;
      display.showMessage(`CPU: ${Math.round(status.cpu)}%`, status.cpu > 80 ? 'warning' : 'success');
      display.showMessage(`MEM: ${Math.round(status.memory)}%`, status.memory > 80 ? 'warning' : 'success');
      display.showMessage(`NET: ${status.network}`, status.network === 'online' ? 'success' : 'error');
    }
  }

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

  private getAgentStatsString(agent: any): string {
    const stats = agent.stats || {};
    const config = this.display.getConfig();

    // Shorter format for compact displays
    if (config.width < 80) {
      switch (agent.role) {
        case 'bureaucracy':
          return `${stats.policies || 0}p`;
        case 'family':
          return `${stats.families || 0}f`;
        case 'community':
          return `${stats.members || 0}m`;
        default:
          return '-';
      }
    }

    // Full format for standard displays
    switch (agent.role) {
      case 'bureaucracy':
        return `${stats.policies || 0} policies`;
      case 'family':
        return `${stats.families || 0} families`;
      case 'community':
        return `${stats.members || 0} members`;
      default:
        return '-';
    }
  }

  getCurrentView(): string {
    return this.currentView;
  }

  getAvailableViews(): string[] {
    return Array.from(this.views.keys());
  }

  getContext(): RenderContext {
    return { ...this.context };
  }

  getLayoutMode(): string {
    return this.layoutMode;
  }

  // E-ink specific optimizations
  enableEInkMode(): void {
    this.display.setConfig({ eInkMode: true, monochrome: true });
    // Reduce refresh rate for e-ink
    this.context.refreshRate = 5000; // 5 seconds
    if (this.isAutoRefresh) {
      this.startAutoRefresh(this.context.refreshRate);
    }
  }

  disableEInkMode(): void {
    this.display.setConfig({ eInkMode: false, monochrome: false });
    // Restore normal refresh rate
    this.context.refreshRate = 1000; // 1 second
    if (this.isAutoRefresh) {
      this.startAutoRefresh(this.context.refreshRate);
    }
  }
}