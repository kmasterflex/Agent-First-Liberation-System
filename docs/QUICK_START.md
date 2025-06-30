# Claude-Flow Quick Start Guide

Welcome to Claude-Flow! This guide will help you get up and running with the Agent-Based Community Terminal in minutes.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Installation](#quick-installation)
- [First Run](#first-run)
- [Basic Commands](#basic-commands)
- [Common Workflows](#common-workflows)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed ([Download](https://nodejs.org))
- **Git** installed ([Download](https://git-scm.com))
- **Claude API Key** from Anthropic ([Get API Key](https://console.anthropic.com))
- **Supabase Account** (optional, for persistence) ([Sign up](https://supabase.com))

## Quick Installation

### Option 1: Using the Start Script (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/claude-flow.git
cd claude-flow

# Make the start script executable
chmod +x start.sh

# Run the quick start
./start.sh
```

The start script will:
- Check all dependencies
- Create a `.env` file from the example
- Install npm packages
- Build the project
- Start the system with Web UI

### Option 2: Manual Installation

```bash
# Clone the repository
git clone https://github.com/your-org/claude-flow.git
cd claude-flow

# Install dependencies
npm install

# Copy environment example
cp .env.example .env

# Edit .env with your API keys
nano .env  # or use your preferred editor

# Build the project
npm run build

# Start the system
./claude-flow start --ui
```

### Option 3: Using Docker

```bash
# Clone the repository
git clone https://github.com/your-org/claude-flow.git
cd claude-flow

# Copy and configure environment
cp .env.example .env
nano .env  # Add your API keys

# Start with Docker Compose
docker-compose up -d
```

## First Run

### 1. Configure Environment Variables

Edit your `.env` file with the required values:

```env
# Required: Claude API Configuration
ANTHROPIC_API_KEY=your_claude_api_key_here

# Required: Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

# Optional: Advanced Configuration
PORT=3000
LOG_LEVEL=info
CLAUDE_MODEL=claude-3-opus-20240229
```

### 2. Verify Installation

```bash
# Check Claude-Flow version
./claude-flow --version

# Run system health check
./claude-flow status

# Test Claude API connection
./claude-flow claude auth
```

### 3. Start the System

```bash
# Start with Web UI (recommended for beginners)
./start.sh ui

# Or start in CLI mode
./start.sh cli

# Or start in development mode
./start.sh dev
```

## Basic Commands

### Getting Help

```bash
# Show all available commands
./claude-flow --help

# Get help for specific command
./claude-flow sparc --help
./claude-flow swarm --help
```

### Agent Operations

```bash
# Spawn a research agent
./claude-flow agent spawn researcher --name "Market Analyst"

# List all active agents
./claude-flow agent list

# Quick spawn shortcut
./claude-flow spawn coder
```

### SPARC Development

```bash
# Run orchestrator (default mode)
./claude-flow sparc "Build a REST API for user management"

# Test-driven development
./claude-flow sparc tdd "User authentication with JWT"

# Run specific mode
./claude-flow sparc run architect "Design microservices architecture"

# List all SPARC modes
./claude-flow sparc modes
```

### Swarm Coordination

```bash
# Research swarm
./claude-flow swarm "Research best practices for React performance" \
  --strategy research \
  --mode distributed \
  --monitor

# Development swarm
./claude-flow swarm "Build e-commerce checkout system" \
  --strategy development \
  --max-agents 5 \
  --parallel
```

### Memory Management

```bash
# Store information
./claude-flow memory store "api_design" "RESTful API with versioning"

# Retrieve information
./claude-flow memory get "api_design"

# List all memory entries
./claude-flow memory list

# Export memory for backup
./claude-flow memory export backup.json
```

## Common Workflows

### 1. Research Workflow

```bash
# Start a research task
./start.sh sparc 3000 "Research modern authentication methods"

# Or use a research swarm for comprehensive analysis
./claude-flow swarm "Compare OAuth2, SAML, and OpenID Connect" \
  --strategy research \
  --mode mesh \
  --output html
```

### 2. Development Workflow

```bash
# Initialize with SPARC environment
./claude-flow init --sparc

# Start TDD development
./claude-flow sparc tdd "Shopping cart functionality"

# Monitor progress
./claude-flow monitor
```

### 3. Code Review Workflow

```bash
# Run code review
./claude-flow sparc run reviewer "Review authentication implementation"

# Security audit
./claude-flow sparc run analyzer "Security audit of user data handling"
```

### 4. Deployment Workflow

```bash
# Create deployment checklist
./claude-flow sparc "Create deployment checklist for production"

# Run maintenance swarm
./claude-flow swarm "Prepare for production deployment" \
  --strategy maintenance \
  --mode centralized
```

## Quick Examples

### Example 1: Build a Todo App

```bash
# One command to build a todo app
./start.sh sparc 3000 "Build a todo app with React and TypeScript"
```

### Example 2: API Development

```bash
# Create API with test coverage
./claude-flow sparc tdd "REST API for blog platform with CRUD operations"
```

### Example 3: Research and Implement

```bash
# Research phase
./claude-flow sparc run researcher "Best practices for API rate limiting"

# Store findings
./claude-flow memory store "rate_limiting_research" "Token bucket algorithm recommended"

# Implementation phase
./claude-flow sparc run coder "Implement rate limiting based on research"
```

## Troubleshooting

### Common Issues

#### 1. API Key Not Working
```bash
# Verify API key
./claude-flow claude auth

# Check environment
cat .env | grep ANTHROPIC_API_KEY
```

#### 2. Port Already in Use
```bash
# Use a different port
./start.sh ui 8080

# Or kill the process using the port
lsof -ti:3000 | xargs kill -9
```

#### 3. Build Errors
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

#### 4. Permission Denied
```bash
# Fix permissions
chmod +x claude-flow
chmod +x start.sh
```

### Getting Help

- Check logs: `tail -f logs/claude-flow.log`
- Run diagnostics: `./claude-flow status --verbose`
- View documentation: `./claude-flow docs`
- Community support: [Discord](https://discord.gg/claude-flow) | [GitHub Issues](https://github.com/your-org/claude-flow/issues)

## Next Steps

Now that you're up and running:

1. **Explore SPARC modes**: Try different development modes for various tasks
2. **Create workflows**: Build automated workflows for repetitive tasks
3. **Use memory**: Store important information for cross-session persistence
4. **Experiment with swarms**: Coordinate multiple agents for complex projects
5. **Read the full documentation**: Check `/docs` for detailed guides

## Quick Tips

- Use `Tab` for command completion
- Press `Ctrl+C` to stop any running operation
- Add `--monitor` to swarm commands for real-time progress
- Use `--parallel` for faster execution when possible
- Check `./claude-flow memory list` regularly to see stored knowledge

Happy coding with Claude-Flow!