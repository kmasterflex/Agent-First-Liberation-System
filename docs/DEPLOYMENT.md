# Claude-Flow Deployment Guide

This guide covers various deployment options for Claude-Flow, from local development to production cloud environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
  - [AWS Deployment](#aws-deployment)
  - [Google Cloud Platform](#google-cloud-platform)
  - [Azure Deployment](#azure-deployment)
  - [Heroku Deployment](#heroku-deployment)
- [Production Configuration](#production-configuration)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

1. **API Keys configured**:
   - Anthropic API key
   - Supabase credentials
   - Any additional service keys

2. **System requirements**:
   - Node.js 18+ (for non-Docker deployments)
   - 2GB+ RAM minimum
   - 10GB+ disk space
   - SSL certificate (for production)

3. **Network requirements**:
   - Outbound HTTPS access to Anthropic API
   - Outbound access to Supabase
   - Inbound access on your chosen port

## Local Development

### Standard Development Setup

```bash
# Clone and setup
git clone https://github.com/your-org/claude-flow.git
cd claude-flow

# Install and configure
npm install
cp .env.example .env
# Edit .env with your configuration

# Start in development mode
npm run dev
```

### Using PM2 for Local Production

```bash
# Install PM2 globally
npm install -g pm2

# Build the project
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Monitor logs
pm2 logs

# Setup auto-restart
pm2 startup
pm2 save
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'claude-flow',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
```

## Docker Deployment

### Quick Docker Start

```bash
# Build and start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Docker Deployment

1. **Build production image**:

```bash
# Build optimized image
docker build -t claude-flow:latest -f Dockerfile .

# Tag for registry
docker tag claude-flow:latest your-registry/claude-flow:latest

# Push to registry
docker push your-registry/claude-flow:latest
```

2. **Deploy with Docker Swarm**:

```bash
# Initialize swarm
docker swarm init

# Create secrets
echo "your_api_key" | docker secret create anthropic_api_key -
echo "your_supabase_url" | docker secret create supabase_url -

# Deploy stack
docker stack deploy -c docker-compose.prod.yml claude-flow
```

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  claude-flow:
    image: your-registry/claude-flow:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
    secrets:
      - anthropic_api_key
      - supabase_url
      - supabase_anon_key
    environment:
      NODE_ENV: production
      PORT: 3000
    ports:
      - "3000:3000"
    networks:
      - claude-flow-network
    volumes:
      - claude-flow-data:/app/data

secrets:
  anthropic_api_key:
    external: true
  supabase_url:
    external: true
  supabase_anon_key:
    external: true

networks:
  claude-flow-network:
    driver: overlay

volumes:
  claude-flow-data:
    driver: local
```

### Kubernetes Deployment

```yaml
# claude-flow-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow
  template:
    metadata:
      labels:
        app: claude-flow
    spec:
      containers:
      - name: claude-flow
        image: your-registry/claude-flow:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: anthropic-api-key
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-service
spec:
  selector:
    app: claude-flow
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

Deploy to Kubernetes:

```bash
# Create namespace
kubectl create namespace claude-flow

# Create secrets
kubectl create secret generic claude-flow-secrets \
  --from-literal=anthropic-api-key=your_key \
  -n claude-flow

# Deploy
kubectl apply -f claude-flow-deployment.yaml -n claude-flow

# Check status
kubectl get pods -n claude-flow
kubectl get svc -n claude-flow
```

## Cloud Deployment

### AWS Deployment

#### Option 1: EC2 with Auto Scaling

```bash
# Install AWS CLI and configure
aws configure

# Create launch template
aws ec2 create-launch-template \
  --launch-template-name claude-flow-template \
  --launch-template-data file://launch-template.json

# Create auto-scaling group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name claude-flow-asg \
  --launch-template LaunchTemplateName=claude-flow-template \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 3 \
  --vpc-zone-identifier subnet-xxxxx
```

#### Option 2: ECS Fargate

```bash
# Create task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json

# Create service
aws ecs create-service \
  --cluster claude-flow-cluster \
  --service-name claude-flow-service \
  --task-definition claude-flow:1 \
  --desired-count 3 \
  --launch-type FARGATE
```

#### Option 3: Elastic Beanstalk

```bash
# Initialize EB
eb init -p node.js claude-flow

# Create environment
eb create claude-flow-prod --instance-type t3.medium

# Deploy
eb deploy

# Set environment variables
eb setenv ANTHROPIC_API_KEY=your_key NODE_ENV=production
```

### Google Cloud Platform

#### Option 1: Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/YOUR_PROJECT/claude-flow

# Deploy to Cloud Run
gcloud run deploy claude-flow \
  --image gcr.io/YOUR_PROJECT/claude-flow \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest
```

#### Option 2: GKE (Google Kubernetes Engine)

```bash
# Create cluster
gcloud container clusters create claude-flow-cluster \
  --num-nodes=3 \
  --zone=us-central1-a

# Get credentials
gcloud container clusters get-credentials claude-flow-cluster

# Deploy using kubectl
kubectl apply -f k8s-deployment.yaml
```

### Azure Deployment

#### Option 1: Azure App Service

```bash
# Create resource group
az group create --name claude-flow-rg --location eastus

# Create app service plan
az appservice plan create \
  --name claude-flow-plan \
  --resource-group claude-flow-rg \
  --sku B2 \
  --is-linux

# Create web app
az webapp create \
  --resource-group claude-flow-rg \
  --plan claude-flow-plan \
  --name claude-flow-app \
  --runtime "NODE|18-lts"

# Deploy code
az webapp deployment source config-local-git \
  --name claude-flow-app \
  --resource-group claude-flow-rg

# Set environment variables
az webapp config appsettings set \
  --resource-group claude-flow-rg \
  --name claude-flow-app \
  --settings ANTHROPIC_API_KEY=your_key NODE_ENV=production
```

#### Option 2: Azure Container Instances

```bash
# Create container instance
az container create \
  --resource-group claude-flow-rg \
  --name claude-flow-container \
  --image your-registry/claude-flow:latest \
  --dns-name-label claude-flow \
  --ports 3000 \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables ANTHROPIC_API_KEY=your_key
```

### Heroku Deployment

```bash
# Create Heroku app
heroku create claude-flow-app

# Set buildpacks
heroku buildpacks:set heroku/nodejs

# Set environment variables
heroku config:set ANTHROPIC_API_KEY=your_key
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Scale dynos
heroku ps:scale web=3

# View logs
heroku logs --tail
```

## Production Configuration

### Environment Variables

```bash
# Essential production settings
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Security
JWT_SECRET=generate-strong-secret-here
API_KEY=your-secure-api-key

# Performance
WORKER_THREADS=4
MAX_CONCURRENT_AGENTS=20
CACHE_ENABLED=true

# Monitoring
PROMETHEUS_ENABLED=true
LOG_LEVEL=warn
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/claude-flow
upstream claude_flow {
    least_conn;
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
}

server {
    listen 80;
    server_name claude-flow.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name claude-flow.example.com;

    ssl_certificate /etc/letsencrypt/live/claude-flow.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/claude-flow.example.com/privkey.pem;

    location / {
        proxy_pass http://claude_flow;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        access_log off;
        proxy_pass http://claude_flow/health;
    }
}
```

### SSL/TLS Setup

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d claude-flow.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Monitoring & Maintenance

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed status
./claude-flow status --verbose

# System metrics
./claude-flow monitor
```

### Log Management

```bash
# Centralized logging with ELK stack
docker run -d \
  --name elasticsearch \
  -p 9200:9200 \
  -e "discovery.type=single-node" \
  elasticsearch:7.14.0

# Configure Filebeat
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/claude-flow/*.log
  json.keys_under_root: true
  json.add_error_key: true

output.elasticsearch:
  hosts: ["localhost:9200"]
```

### Backup Strategy

```bash
# Backup script (backup.sh)
#!/bin/bash
BACKUP_DIR="/backups/claude-flow/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup data
cp -r /app/data/* $BACKUP_DIR/
cp -r /app/memory/* $BACKUP_DIR/

# Backup database
pg_dump $DATABASE_URL > $BACKUP_DIR/database.sql

# Compress
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR

# Upload to S3
aws s3 cp $BACKUP_DIR.tar.gz s3://your-backup-bucket/
```

### Update Procedure

```bash
# 1. Backup current version
./scripts/backup.sh

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm install

# 4. Run migrations
npm run migrate

# 5. Build
npm run build

# 6. Restart with zero downtime
pm2 reload claude-flow
```

## Security Best Practices

### API Key Management

```bash
# Use environment variables
export ANTHROPIC_API_KEY=$(vault kv get -field=api_key secret/claude-flow)

# Or use secret management services
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id claude-flow-secrets

# Azure Key Vault
az keyvault secret show --vault-name ClaudeFlowVault --name anthropic-key

# Google Secret Manager
gcloud secrets versions access latest --secret="anthropic-api-key"
```

### Network Security

```bash
# Firewall rules
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Fail2ban configuration
sudo apt-get install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
```

### Application Security

```javascript
// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### Memory Issues
```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory usage
./claude-flow monitor --memory
```

#### Connection Issues
```bash
# Test API connectivity
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 10}'
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=claude-flow:*
export LOG_LEVEL=debug

# Run with verbose output
./claude-flow start --verbose --debug
```

### Performance Tuning

```bash
# CPU profiling
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --expose-gc --inspect dist/index.js
```

## Support

For deployment issues:
- Check logs: `docker-compose logs` or `pm2 logs`
- Review documentation: `/docs`
- Community support: [Discord](https://discord.gg/claude-flow)
- GitHub issues: [Issues](https://github.com/your-org/claude-flow/issues)