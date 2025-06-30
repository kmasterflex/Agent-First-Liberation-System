module.exports = {
  apps: [{
    // Application configuration
    name: 'claude-flow',
    script: './dist/index.js',
    
    // Cluster mode configuration
    instances: process.env.PM2_INSTANCES || 'max',
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      HOST: '0.0.0.0'
    },
    
    // Advanced PM2 configuration
    max_memory_restart: '2G',
    min_uptime: '10s',
    max_restarts: 10,
    
    // Logging configuration
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    
    // Watch configuration (for development)
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'dist', '.git', 'data', 'memory'],
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Auto-restart cron pattern (daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Node.js arguments
    node_args: '--max-old-space-size=4096',
    
    // Source map support for better error traces
    source_map_support: true,
    
    // Monitoring
    pmx: true,
    instance_var: 'INSTANCE_ID',
    
    // Auto-restart on file change (production)
    autorestart: true,
    
    // Startup configuration
    restart_delay: 4000,
    
    // Process naming
    namespace: 'claude-flow',
    
    // Load balancing method
    // Can be 'cluster', 'fork', or custom
    automation: true,
    
    // Error handling
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    combine_logs: true,
    
    // Performance monitoring
    max_memory_restart: '2G',
    
    // Health check
    health_check: {
      interval: 30000,
      timeout: 5000,
      max_failed_checks: 3,
      url: 'http://localhost:3000/health'
    }
  }],
  
  // Deploy configuration
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/claude-flow.git',
      path: '/var/www/claude-flow',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'post-setup': 'npm install && npm run build',
      env: {
        NODE_ENV: 'production'
      }
    },
    staging: {
      user: 'deploy',
      host: 'staging.your-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/claude-flow.git',
      path: '/var/www/claude-flow-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'staging'
      }
    }
  },
  
  // Monitoring configuration
  monitoring: {
    http: true,
    https: false,
    transactions: true,
    network: true,
    ports: true
  }
};