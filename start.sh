#!/bin/bash

# Claude-Flow Startup Script
# This script provides a simple way to start the Claude-Flow system

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to display header
display_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║         Claude-Flow System             ║"
    echo "║    Agent-Based Community Terminal      ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Function to check dependencies
check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        echo "Please install Node.js 18 or later from https://nodejs.org"
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Error: Node.js 18 or later is required${NC}"
        echo "Current version: $(node -v)"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Dependencies check passed${NC}"
}

# Function to check environment
check_environment() {
    echo -e "${BLUE}Checking environment configuration...${NC}"
    
    # Check if .env file exists
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            echo -e "${BLUE}Creating .env file from .env.example...${NC}"
            cp .env.example .env
            echo -e "${GREEN}✓ Created .env file${NC}"
            echo -e "${RED}Please configure your environment variables in .env${NC}"
            exit 1
        else
            echo -e "${RED}Error: No .env file found${NC}"
            echo "Please create a .env file with your configuration"
            exit 1
        fi
    fi
    
    # Check required environment variables
    if [ -f .env ]; then
        source .env
        
        MISSING_VARS=()
        
        # Check for Claude API key
        if [ -z "$ANTHROPIC_API_KEY" ]; then
            MISSING_VARS+=("ANTHROPIC_API_KEY")
        fi
        
        # Check for Supabase configuration
        if [ -z "$SUPABASE_URL" ]; then
            MISSING_VARS+=("SUPABASE_URL")
        fi
        
        if [ -z "$SUPABASE_ANON_KEY" ]; then
            MISSING_VARS+=("SUPABASE_ANON_KEY")
        fi
        
        if [ ${#MISSING_VARS[@]} -gt 0 ]; then
            echo -e "${RED}Error: Missing required environment variables:${NC}"
            for var in "${MISSING_VARS[@]}"; do
                echo "  - $var"
            done
            echo ""
            echo "Please configure these in your .env file"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ Environment configuration check passed${NC}"
}

# Function to install dependencies
install_dependencies() {
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}Installing dependencies...${NC}"
        npm install
        echo -e "${GREEN}✓ Dependencies installed${NC}"
    else
        echo -e "${GREEN}✓ Dependencies already installed${NC}"
    fi
}

# Function to build the project
build_project() {
    echo -e "${BLUE}Building project...${NC}"
    
    # Clean previous build
    npm run clean 2>/dev/null || true
    
    # Build TypeScript
    npm run build
    
    echo -e "${GREEN}✓ Project built successfully${NC}"
}

# Function to start the system
start_system() {
    MODE=${1:-"ui"}
    PORT=${2:-3000}
    
    echo -e "${BLUE}Starting Claude-Flow system...${NC}"
    
    case $MODE in
        "ui")
            echo -e "${GREEN}Starting with Web UI on port $PORT${NC}"
            exec ./claude-flow start --ui --port $PORT
            ;;
        "cli")
            echo -e "${GREEN}Starting in CLI mode${NC}"
            exec ./claude-flow start
            ;;
        "dev")
            echo -e "${GREEN}Starting in development mode${NC}"
            exec npm run dev
            ;;
        "sparc")
            echo -e "${GREEN}Starting SPARC orchestrator${NC}"
            TASK=${3:-""}
            if [ -z "$TASK" ]; then
                echo -e "${RED}Error: No task specified for SPARC mode${NC}"
                echo "Usage: ./start.sh sparc <port> \"<task>\""
                exit 1
            fi
            exec ./claude-flow sparc "$TASK"
            ;;
        "swarm")
            echo -e "${GREEN}Starting swarm coordinator${NC}"
            OBJECTIVE=${3:-""}
            if [ -z "$OBJECTIVE" ]; then
                echo -e "${RED}Error: No objective specified for swarm mode${NC}"
                echo "Usage: ./start.sh swarm <port> \"<objective>\""
                exit 1
            fi
            exec ./claude-flow swarm "$OBJECTIVE" --monitor
            ;;
        *)
            echo -e "${RED}Error: Unknown mode '$MODE'${NC}"
            echo "Available modes: ui, cli, dev, sparc, swarm"
            exit 1
            ;;
    esac
}

# Function to display usage
show_usage() {
    echo "Usage: ./start.sh [mode] [port] [task/objective]"
    echo ""
    echo "Modes:"
    echo "  ui     - Start with web UI (default)"
    echo "  cli    - Start in CLI mode"
    echo "  dev    - Start in development mode with hot reload"
    echo "  sparc  - Start SPARC orchestrator with a task"
    echo "  swarm  - Start swarm coordinator with an objective"
    echo ""
    echo "Examples:"
    echo "  ./start.sh                    # Start with UI on port 3000"
    echo "  ./start.sh ui 8080           # Start with UI on port 8080"
    echo "  ./start.sh cli               # Start in CLI mode"
    echo "  ./start.sh dev               # Start in development mode"
    echo "  ./start.sh sparc 3000 \"Build a todo app\""
    echo "  ./start.sh swarm 3000 \"Research AI frameworks\""
}

# Main execution
main() {
    # Handle help flag
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_usage
        exit 0
    fi
    
    # Display header
    display_header
    
    # Run checks
    check_dependencies
    check_environment
    install_dependencies
    
    # Build if not in dev mode
    if [ "$1" != "dev" ]; then
        build_project
    fi
    
    # Start the system
    start_system "$@"
}

# Run main function with all arguments
main "$@"