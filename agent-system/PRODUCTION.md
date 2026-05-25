# Agent System - Production Deployment Guide

## 🎯 Pre-Deployment Checklist

- [ ] All tests passing: `npm test`
- [ ] TypeScript builds without errors: `npm run build`
- [ ] .env configured for production
- [ ] PostgreSQL database created and migrated
- [ ] FastAPI backend verified and accessible
- [ ] Anthropic API key valid and has quota
- [ ] Rate limiting configured
- [ ] Monitoring/alerting set up
- [ ] Backup strategy in place
- [ ] Load testing completed

## 🔧 Configuration

### Production .env Template

```env
# === API ===
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn
DEBUG_API_CALLS=false
LOG_API_REQUESTS=false

# === Anthropic ===
ANTHROPIC_API_KEY=sk-ant-YOUR_PRODUCTION_KEY
CLAUDE_MODEL=claude-sonnet-4-20250514

# === FastAPI Backend ===
FASTAPI_BASE_URL=https://api.yourdomain.com
FASTAPI_API_KEY=your-production-jwt-token

# === PostgreSQL ===
DB_HOST=prod-db.yourcompany.com
DB_PORT=5432
DB_NAME=saas_agents_prod
DB_USER=agent_system
DB_PASSWORD=strong-random-password-min-32-chars
DB_SSL=true
DB_POOL_MIN=10
DB_POOL_MAX=50

# === Agent Configuration ===
SESSION_TTL_MINUTES=30
CONFIRMATION_EXPIRY_MINUTES=5
MAX_AGENT_LOOP_ROUNDS=15
API_TIMEOUT_MS=20000
API_MAX_RETRIES=2
```

### Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API authentication | `sk-ant-...` |
| `FASTAPI_BASE_URL` | Your backend API URL | `https://api.yourdomain.com` |
| `FASTAPI_API_KEY` | JWT/auth token for backend | `eyJhbG...` |
| `DB_HOST` | PostgreSQL hostname | `db.example.com` |
| `DB_SSL` | Use SSL for DB connection | `true` (production) |
| `DB_POOL_MAX` | Max concurrent DB connections | `50` (adjust per load) |
| `API_TIMEOUT_MS` | HTTP request timeout | `20000` (20s) |
| `LOG_LEVEL` | Logging verbosity | `warn` (production) |

## 🚀 Deployment Options

### Option 1: Traditional VM/VPS

```bash
# 1. SSH into server
ssh user@your-server.com

# 2. Clone and setup
git clone <your-repo> agent-system
cd agent-system

# 3. Install dependencies
npm ci --only=production

# 4. Build
npm run build

# 5. Create systemd service
sudo tee /etc/systemd/system/agent-system.service > /dev/null <<EOF
[Unit]
Description=Agent System Service
After=network.target postgresql.service

[Service]
Type=simple
User=app-user
WorkingDirectory=/home/app-user/agent-system
EnvironmentFile=/home/app-user/agent-system/.env.production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 6. Start service
sudo systemctl daemon-reload
sudo systemctl enable agent-system
sudo systemctl start agent-system

# 7. Check status
sudo systemctl status agent-system
```

### Option 2: Docker (Recommended)

#### Build Image

```dockerfile
# Dockerfile.prod
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
# Build
docker build -f Dockerfile.prod -t agent-system:1.0.0 .

# Tag for registry
docker tag agent-system:1.0.0 your-registry.com/agent-system:1.0.0

# Push
docker push your-registry.com/agent-system:1.0.0
```

#### Docker Compose (Production)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: saas_agents_prod
      POSTGRES_USER: agent_system
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent_system"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  agent-system:
    image: your-registry.com/agent-system:1.0.0
    environment:
      NODE_ENV: production
      PORT: 3000
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      FASTAPI_BASE_URL: ${FASTAPI_BASE_URL}
      FASTAPI_API_KEY: ${FASTAPI_API_KEY}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: saas_agents_prod
      DB_USER: agent_system
      DB_PASSWORD: ${DB_PASSWORD}
      DB_SSL: false
      LOG_LEVEL: warn
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
```

```bash
# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Monitor
docker-compose -f docker-compose.prod.yml logs -f agent-system
```

### Option 3: Kubernetes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-system
  template:
    metadata:
      labels:
        app: agent-system
    spec:
      containers:
      - name: agent-system
        image: your-registry.com/agent-system:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: agent-secrets
              key: anthropic-key
        - name: DB_HOST
          value: "postgres-service"
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secrets
              key: password
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

---
apiVersion: v1
kind: Service
metadata:
  name: agent-system-service
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: agent-system
```

```bash
# Deploy
kubectl create secret generic agent-secrets --from-literal=anthropic-key=$ANTHROPIC_API_KEY
kubectl create secret generic db-secrets --from-literal=password=$DB_PASSWORD
kubectl apply -f deployment.yaml

# Monitor
kubectl logs -f deployment/agent-system
```

## 🔒 Security Hardening

### 1. API Key Protection

```bash
# Use AWS Secrets Manager / HashiCorp Vault
export ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value --secret-id agent-system/anthropic-key --query SecretString --output text)
```

### 2. Database Security

```sql
-- Create restricted user
CREATE USER agent_system WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE saas_agents_prod TO agent_system;
GRANT USAGE ON SCHEMA public TO agent_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agent_system;

-- Require SSL
ALTER SYSTEM SET ssl = on;
SELECT pg_reload_conf();

-- Enable audit logging
ALTER SYSTEM SET log_statement = 'mod';
ALTER SYSTEM SET log_duration = 'on';
```

### 3. Network Security

```bash
# Only allow from your app server
ufw allow from 10.0.1.5 to any port 5432

# Use VPC/Security Groups in AWS
# Only allow port 3000 from Load Balancer
# Only allow port 5432 from App subnet
```

### 4. SSL/TLS Configuration

```javascript
// With nginx reverse proxy (recommended)
// nginx config:
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📊 Monitoring & Observability

### Prometheus Metrics

```typescript
// Add to src/index.ts
import promClient from 'prom-client';

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

### Datadog Integration

```javascript
// Install: npm install dd-trace
const tracer = require('dd-trace').init();

// Tracks are automatic:
// - HTTP requests
// - Database queries
// - Errors
```

### Key Metrics to Monitor

```sql
-- Slow queries
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Connection pool
SELECT count(*) as connections
FROM pg_stat_activity
WHERE datname = 'saas_agents_prod';

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## 🔄 Updates & Rollbacks

### Zero-Downtime Deployment

```bash
# 1. Build new image
docker build -f Dockerfile.prod -t agent-system:1.1.0 .

# 2. Push to registry
docker push your-registry.com/agent-system:1.1.0

# 3. Update with rolling restart
kubectl set image deployment/agent-system \
  agent-system=your-registry.com/agent-system:1.1.0 \
  --record

# 4. Monitor rollout
kubectl rollout status deployment/agent-system

# 5. Rollback if needed
kubectl rollout undo deployment/agent-system
```

### Database Migrations

```bash
# Migrations are applied automatically by databaseService.initialize()
# No manual migration needed - schema is idempotent

# For safety, backup first:
pg_dump saas_agents_prod > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 📈 Performance Tuning

### Connection Pool Sizing

```typescript
// For 100 concurrent users
DB_POOL_MIN=10
DB_POOL_MAX=50

// For 1000+ concurrent users
DB_POOL_MIN=20
DB_POOL_MAX=100
```

### Query Optimization

```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Add missing indexes
CREATE INDEX idx_agent_logs_tenant_time
ON agent_logs(tenant_id, created_at DESC);
```

### Caching (Optional)

```typescript
// Add Redis caching for tool results
import Redis from 'redis';

const redis = Redis.createClient({
  url: process.env.REDIS_URL
});

async function getCachedResult(toolName, params) {
  const key = `tool:${toolName}:${JSON.stringify(params)}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  return null;
}
```

## 🚨 Incident Response

### Common Issues & Solutions

**High CPU Usage**
```bash
# Check slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY (mean_exec_time * calls) DESC LIMIT 5;

# Check what's running
SELECT pid, usename, query
FROM pg_stat_activity
WHERE state = 'active';
```

**High Memory Usage**
```bash
# Check connection count
SELECT count(*) FROM pg_stat_activity;

# Reduce pool size if needed
# Restart application
```

**Database Connection Errors**
```bash
# Check database status
pg_isready -h your-db-host

# Check connection limits
SHOW max_connections;

# Restart PostgreSQL if needed
sudo systemctl restart postgresql
```

## 📋 Backup & Recovery

### Automated Backups

```bash
#!/bin/bash
# backup.sh - Daily backup script
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="pg_backup_${TIMESTAMP}.sql.gz"

pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > "$BACKUP_FILE"

# Upload to S3
aws s3 cp "$BACKUP_FILE" "s3://your-backup-bucket/agent-system/"

# Keep only last 30 days
find . -name "pg_backup_*.sql.gz" -mtime +30 -delete
```

```bash
# Add to crontab
0 2 * * * /path/to/backup.sh
```

### Point-in-Time Recovery

```bash
# List backups
aws s3 ls s3://your-backup-bucket/agent-system/

# Restore from backup
gunzip < pg_backup_20250326_020000.sql.gz | \
  psql -h your-db-host -U agent_system saas_agents_prod
```

## ✅ Post-Deployment

- [ ] Smoke tests passed in production
- [ ] Health checks passing
- [ ] Logs are flowing correctly
- [ ] Metrics are being collected
- [ ] Backups are working
- [ ] Alerts are configured
- [ ] Runbooks documented
- [ ] Team trained on incident response

---

**Production deployment complete. Monitor closely for first 24 hours.** 🚀
