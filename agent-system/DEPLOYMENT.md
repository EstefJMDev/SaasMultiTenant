# Agent System - Deployment Guide

## Pre-Deployment Checklist

- [ ] Node.js 18+ installed and tested
- [ ] Anthropic API key obtained and validated
- [ ] PostgreSQL database created
- [ ] Database backups configured
- [ ] Environment variables documented
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Monitoring/alerting system ready
- [ ] Incident response plan in place

## Local Development

### 1. Clone and Install

```bash
cd agent-system
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

### 3. Build and Run

```bash
# Build TypeScript
npm run build

# Start server
npm start

# Or development mode
npm run dev
```

### 4. Verify Installation

```bash
curl http://localhost:3000/health
# Should return:
# {"status":"ok","timestamp":"..."}
```

## Docker Deployment

### Build Docker Image

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```bash
docker build -t agent-system:latest .
```

### Run Container

```bash
docker run -d \
  --name agent-system \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=saas_agents \
  -e NODE_ENV=production \
  agent-system:latest
```

### Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: saas_agents
      POSTGRES_USER: agent_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  agent-system:
    build: .
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: saas_agents
      DB_USER: agent_user
      DB_PASSWORD: secure_password
      NODE_ENV: production
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
# Start stack
docker-compose up -d

# Check logs
docker-compose logs -f agent-system

# Stop stack
docker-compose down
```

## Cloud Deployment

### AWS ECS

1. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name agent-system
   ```

2. **Build and Push**
   ```bash
   docker build -t agent-system:latest .
   aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   docker tag agent-system:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/agent-system:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/agent-system:latest
   ```

3. **Create ECS Task Definition**
   ```json
   {
     "family": "agent-system",
     "containerDefinitions": [
       {
         "name": "agent-system",
         "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/agent-system:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "hostPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           }
         ],
         "secrets": [
           {
             "name": "ANTHROPIC_API_KEY",
             "valueFrom": "arn:aws:secretsmanager:region:account:secret:anthropic-api-key"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/agent-system",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

4. **Create ECS Service with Application Load Balancer**
   - Configure target group with health check: `GET /health`
   - Set up auto-scaling based on CPU/memory

### Heroku

```bash
# Create Heroku app
heroku create agent-system

# Set environment variables
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
heroku config:set NODE_ENV=production

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:standard-0

# Deploy
git push heroku main

# Run migrations
heroku run "node -e \"const sql = require('fs').readFileSync('./sql/schema.sql', 'utf8'); const pg = require('pg'); const client = new pg.Client(process.env.DATABASE_URL); client.connect(); client.query(sql, (err) => { client.end(); process.exit(err ? 1 : 0); })\""
```

### Google Cloud Run

```bash
# Build image
gcloud builds submit --tag gcr.io/PROJECT_ID/agent-system

# Deploy to Cloud Run
gcloud run deploy agent-system \
  --image gcr.io/PROJECT_ID/agent-system \
  --platform managed \
  --region us-central1 \
  --set-env-vars ANTHROPIC_API_KEY=sk-ant-... \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated
```

## Production Configuration

### Environment Variables

```env
# Core
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# API
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# Database
DB_HOST=prod-db.example.com
DB_PORT=5432
DB_NAME=saas_agents
DB_USER=agent_user
DB_PASSWORD=<secure-password>
DB_SSL=true
DB_POOL_MIN=5
DB_POOL_MAX=20

# Session Management
SESSION_TTL_MINUTES=30
CONFIRMATION_EXPIRY_MINUTES=5
MAX_AGENT_LOOP_ROUNDS=15

# Security
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_PER_MINUTE=60

# Monitoring
SENTRY_DSN=https://...
DATADOG_API_KEY=...
```

### Health Checks

**Health Check Endpoint:**
```bash
curl https://api.yourdomain.com/health
```

**Kubernetes Health Check:**
```yaml
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
```

### Logging & Monitoring

#### Structured Logging

```typescript
// Use structured format for cloud logging
logger.info('Agent action processed', {
  userId: 'user123',
  agentType: 'documents',
  toolName: 'list_documents',
  duration: 150
});
```

#### Key Metrics to Monitor

1. **API Metrics**
   - Request rate (per agent, per endpoint)
   - Response time (p50, p95, p99)
   - Error rate by type
   - Request size distribution

2. **Agent Metrics**
   - Agent usage by type
   - Tool execution success rate
   - Agentic loop rounds distribution
   - Average chat completion time

3. **Business Metrics**
   - Confirmation approval rate
   - Write operations per day
   - User engagement (sessions per user)
   - Agent accuracy (user satisfaction)

4. **System Metrics**
   - CPU utilization
   - Memory usage
   - Database connection pool
   - Session count
   - Confirmation queue depth

### Alerting

**Critical Alerts:**
```
- API error rate > 5% for 5 minutes
- Response time p95 > 5 seconds
- Database unavailable
- Claude API quota exceeded
- Unhandled exceptions rate > 0.1%
```

**Warning Alerts:**
```
- Session cleanup failures
- Expired confirmation backlog > 100
- Slow query execution > 1 second
- Memory usage > 80%
- Rate limit approached
```

### Database Optimization

#### Connection Pooling

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected connection pool error', err);
});
```

#### Query Performance

```sql
-- Regular maintenance
VACUUM ANALYZE agent_logs;
REINDEX TABLE agent_logs;

-- Monitor slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Backup & Recovery

#### Automated Backups

```bash
# Daily backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > backup_${TIMESTAMP}.sql.gz

# Upload to S3
aws s3 cp backup_${TIMESTAMP}.sql.gz s3://my-backups/agent-system/
```

#### Point-in-Time Recovery

```bash
# List available backups
aws s3 ls s3://my-backups/agent-system/

# Restore from backup
gunzip < backup_20250326_120000.sql.gz | psql -h $DB_HOST -U $DB_USER $DB_NAME
```

### Security Hardening

1. **Network Security**
   - Restrict database access to application subnet
   - Use VPN/bastion host for admin access
   - Enable AWS Security Groups/Network ACLs

2. **API Security**
   ```typescript
   // CORS
   const cors = require('cors');
   app.use(cors({
     origin: process.env.CORS_ORIGIN,
     credentials: true
   }));

   // Rate limiting
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 60 * 1000,
     max: 60
   });
   app.use(limiter);

   // Helmet for security headers
   const helmet = require('helmet');
   app.use(helmet());
   ```

3. **API Key Management**
   - Never log API keys
   - Rotate regularly
   - Use service accounts
   - Monitor usage patterns

4. **Audit Logging**
   - Log all write operations
   - Include user identity
   - Maintain audit trail for compliance
   - Regular audit log reviews

## Rolling Updates

### Zero-Downtime Deployment

```bash
# Using blue-green deployment
# 1. Deploy new version to "green" environment
# 2. Run smoke tests
# 3. Switch load balancer to green
# 4. Keep blue as rollback

# Or using canary deployment
# 1. Route 10% traffic to new version
# 2. Monitor metrics
# 3. Gradually increase to 100%
```

### Health Check Before Deploy

```bash
#!/bin/bash
# Pre-deployment validation
npm run build && \
npm run test && \
npm run lint && \
echo "Pre-deployment checks passed"
```

## Rollback Procedure

```bash
# If critical issues found
# 1. Revert to previous version
git revert <commit-hash>
git push production main

# 2. Monitor metrics
# 3. Database schema changes typically backward-compatible
# 4. If needed, run migration rollback script
```

## Post-Deployment

- [ ] Verify health checks passing
- [ ] Monitor logs for errors
- [ ] Validate audit logging working
- [ ] Test critical user flows
- [ ] Check database performance
- [ ] Verify backups completing
- [ ] Confirm monitoring/alerting active
- [ ] Document any configuration changes
- [ ] Update runbooks if needed

## Support & Troubleshooting

### Common Issues

**Issue: High memory usage**
- Check for memory leaks in agent loop
- Verify session cleanup running
- Monitor confirmation queue size

**Issue: API timeout**
- Increase request timeout
- Check Claude API availability
- Review database query performance

**Issue: Database connection errors**
- Verify connection string
- Check database availability
- Monitor connection pool usage

**Issue: Authentication failures**
- Verify API key is valid
- Check API key hasn't expired
- Confirm environment variable set

### Support Contact

For urgent issues:
1. Check status page
2. Review monitoring alerts
3. Check CloudWatch/Datadog dashboards
4. Contact on-call engineer
5. Open incident in incident tracking system

---

**Last Updated**: March 2025
**Version**: 1.0.0
