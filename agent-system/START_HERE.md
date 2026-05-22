# 🚀 START HERE - Agent System Launch Guide

Welcome! Your production-ready AI agent system is ready. Here's how to get it running **RIGHT NOW**.

## ⏱️ Quick Start - Choose Your Path

### Option A: Local AI (No API Keys) ⭐ RECOMMENDED

1. **Install Ollama** from https://ollama.ai

2. **Pull a model:**
   ```bash
   ollama pull mistral:7b
   ```

3. **Start Ollama** (in background terminal):
   ```bash
   ollama serve
   ```

4. **Configure and run:**
   ```bash
   cd agent-system
   cp .env.example .env
   # .env defaults to Ollama - no changes needed!
   npm install && npm run build && npm start
   ```

5. **Test:**
   ```bash
   curl http://localhost:3000/health
   ```

See [OLLAMA_SETUP.md](OLLAMA_SETUP.md) for details.

### Option B: Cloud AI (Anthropic Claude)

1. **Get API key** from https://console.anthropic.com

2. **Configure:**
   ```bash
   cd agent-system
   cp .env.example .env
   nano .env
   # Change: LLM_PROVIDER=anthropic
   # Add: ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
   ```

3. **Run:**
   ```bash
   npm install && npm run build && npm start
   ```

4. **Test:**
   ```bash
   curl http://localhost:3000/health
   ```

### You should see:
```
🤖 Agent System running on http://localhost:3000
✅ Database initialized successfully
LLM Provider: Ollama (mistral:7b)
```
(or "Anthropic (claude-sonnet)" if you chose Option B)

## 📚 Full Documentation

Read these in order:

1. **[SETUP.md](SETUP.md)** ← Step-by-step setup with PostgreSQL
2. **[QUICK_START.md](QUICK_START.md)** ← 5-minute guided tour
3. **[README.md](README.md)** ← Complete API reference
4. **[EXAMPLES.md](EXAMPLES.md)** ← API usage examples
5. **[PRODUCTION.md](PRODUCTION.md)** ← Deploy to production

## 🎯 What You Have

### 4 Specialized Agents
- **📄 Documents**: Create contracts, manage files
- **👥 Users**: Query active users, team activity
- **💰 Finance**: Budget management, approvals
- **📊 Analysis**: Reports, summaries, insights

### Core Features
✅ Natural language processing (Claude)
✅ Safe write operations (confirmations)
✅ Complete audit trail (PostgreSQL)
✅ Multi-tenant isolation
✅ Conversation memory
✅ Production-ready error handling

### 6 HTTP Endpoints
```
POST   /agent/chat              - Chat with agents
POST   /agent/confirm           - Confirm actions
POST   /agent/reject            - Reject confirmations
GET    /agent/session/:id/history
GET    /audit/logs              - See all actions
GET    /health                  - Status check
```

## 🧪 First Test: Ask Questions

```bash
# 1. Simple question (read operation)
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user1",
    "tenantId": "1",
    "message": "List all invoices"
  }'

# 2. Create something (write operation - needs confirmation)
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user1",
    "tenantId": "1",
    "message": "Create a contract with Acme Corp"
  }'

# Response will include confirmationId
# Then confirm:
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xxx",
    "userId": "user1"
  }'
```

## 🔧 If Something Breaks

### "Database connection failed"
```bash
# Make sure PostgreSQL is running
psql -U postgres
\q

# Check DB credentials in .env are correct
# Restart the server
```

### "FASTAPI_BASE_URL unreachable"
```bash
# Make sure your FastAPI backend is running
curl http://localhost:8000/health

# Update FASTAPI_BASE_URL in .env if different
```

### "ANTHROPIC_API_KEY invalid"
```bash
# Get a new key from https://console.anthropic.com
# It should start with: sk-ant-
```

### Still stuck?
```bash
# Run the validation script
bash validate-setup.sh

# Check logs
npm run dev

# Read SETUP.md for detailed help
```

## 📈 What's Next

### For Development
```bash
npm run dev      # Auto-reload on changes
npm test         # Run tests
npm run lint     # Check code quality
```

### For Production
1. Read [PRODUCTION.md](PRODUCTION.md)
2. Configure for your infrastructure
3. Deploy with Docker or Kubernetes
4. Set up monitoring (Datadog, Prometheus)
5. Configure backups

### Integration with Your API
The system calls your FastAPI backend via HTTP. All endpoints expect:
- `Authorization: Bearer {token}` header
- `X-Tenant-Id: {id}` header
- JSON responses

The real API client is in `src/services/realApiClient.ts`

## 🎓 Architecture Overview

```
User: "Create a contract"
           ↓
    [Express API]
           ↓
    [Agent Router]
    (What agent type?)
           ↓
    [Claude with Tools]
    (What to do?)
           ↓
    [Tool Execution]
    (Does it modify?)
           ↓
    YES → Propose + Ask Confirmation
    NO  → Execute Now + Return Result
           ↓
    [PostgreSQL Logs]
    (Audit trail)
           ↓
    Response to User
```

## 📊 Database

Tables created automatically:
- `agent_logs` - Every action logged
- `confirmation_requests` - Pending approvals
- `agent_sessions` - Conversation state
- `agent_tool_usage` - Analytics

Check with:
```bash
psql -U agent_user -d saas_agents
SELECT * FROM agent_logs ORDER BY created_at DESC;
```

## 🔐 Security

✅ **Multi-tenant isolation** - Each tenant's data is separate
✅ **Write confirmations** - No automatic dangerous actions
✅ **Complete audit trail** - Who did what, when
✅ **API key protection** - Never logged or exposed
✅ **JWT support** - Your FastAPI's auth works here

## 🆘 Need Help?

1. **Quick questions** → Check [QUICK_START.md](QUICK_START.md)
2. **Setup issues** → Check [SETUP.md](SETUP.md)
3. **API examples** → See [EXAMPLES.md](EXAMPLES.md)
4. **Technical details** → Read [ARCHITECTURE.md](ARCHITECTURE.md)
5. **Production** → Follow [PRODUCTION.md](PRODUCTION.md)

## 🎉 You're All Set!

Your agent system is:
- ✅ Fully functional
- ✅ Connected to real FastAPI backend
- ✅ Storing audit logs in PostgreSQL
- ✅ Ready for production
- ✅ Well documented

**Start the server and begin asking it to do things in natural language!**

```bash
npm start
```

Then in your browser or API client:
```
POST http://localhost:3000/agent/chat
{
  "userId": "user123",
  "tenantId": "1",
  "message": "What do you want me to help you with?"
}
```

---

**Questions? Check the docs. Issues? Check validate-setup.sh. Ready to deploy? Read PRODUCTION.md.** 🚀

