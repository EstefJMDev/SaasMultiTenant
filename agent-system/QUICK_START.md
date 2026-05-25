# 🚀 Agent System - Quick Start (5 Minutes)

## Step 1: Install Dependencies (1 min)

```bash
cd agent-system
npm install
```

## Step 2: Configure API Key (1 min)

```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
# ANTHROPIC_API_KEY=sk-ant-...
```

Get your key from: https://console.anthropic.com

## Step 3: Build & Start (2 min)

```bash
npm run build
npm start
```

Server will start on `http://localhost:3000`

## Step 4: Test in Terminal (1 min)

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","timestamp":"2025-03-26T..."}
```

### Test 2: Chat with Agent
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "What documents do we have?"
  }'
```

Should return:
```json
{
  "success": true,
  "message": "I found 3 documents...",
  "agentType": "documents",
  "sessionId": "..."
}
```

### Test 3: Create Contract (Requires Confirmation)
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Create a new contract with Acme Corp"
  }'
```

Should return confirmation request:
```json
{
  "success": true,
  "confirmationRequired": true,
  "confirmationId": "conf-xyz789",
  "action": {
    "description": "Create contract: Service Agreement - Acme Corp"
  }
}
```

### Test 4: Confirm the Action
```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xyz789",
    "userId": "user123"
  }'
```

Should return execution result:
```json
{
  "success": true,
  "message": "Action confirmed and executed",
  "data": {
    "id": "doc_...",
    "type": "contract",
    "title": "Service Agreement - Acme Corp"
  }
}
```

## Common Commands

```bash
# Development mode (auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Check for errors/style
npm run lint

# View audit logs
curl "http://localhost:3000/audit/logs?tenantId=tenant1&limit=10"
```

## Key Concepts (30 seconds)

| Concept | Meaning |
|---------|---------|
| **Agent** | Specialized AI that handles specific domains (documents, users, finance, analysis) |
| **Intent** | What the user wants to do (automatically detected from their message) |
| **Tool** | An action the agent can perform (list, read, create, update) |
| **Confirmation** | Safety gate: write operations need user approval before executing |
| **Audit Log** | Complete record of all actions for compliance & debugging |
| **Session** | Conversation context that persists across multiple messages |

## Example Conversations

### 1. Query Documents
```
User: "Show me all contracts"
Agent: Lists all contracts
Status: ✅ No confirmation needed (read operation)
```

### 2. Create Contract
```
User: "Create a contract with Acme Corp"
Agent: Proposes action, asks for confirmation
User: Confirms via POST /agent/confirm
Agent: Executes, returns result
Status: ✅ Safe write operation
```

### 3. Check Active Users
```
User: "Who has been active today?"
Agent: Returns list of active users
Status: ✅ No confirmation needed (read operation)
```

### 4. Update Budget
```
User: "Change Q1 budget to $60,000"
Agent: Proposes change, asks for confirmation
User: Confirms via POST /agent/confirm
Agent: Updates budget, returns result
Status: ✅ Safe write operation
```

## Architecture (High Level)

```
You type in English
       ↓
POST /agent/chat
       ↓
Intent Classification (what agent to use?)
       ↓
Claude API (with specialized tools)
       ↓
Is it a write operation?
├─ YES → Propose & ask for confirmation
└─ NO → Execute immediately & return result
       ↓
User sees result
```

## What Happens Under the Hood

1. **Classify Intent** → Understand if user wants documents, users, finance, or analysis
2. **Load Agent** → Pick the right agent with appropriate tools
3. **Call Claude** → Let Claude understand and plan the action
4. **Execute Tools** → Run the actual operation (read or write)
5. **Confirm Writes** → For create/update operations, wait for user approval
6. **Log Everything** → Keep complete audit trail for compliance

## Next Steps

1. **Read Full README**: [README.md](README.md) - complete documentation
2. **See More Examples**: [EXAMPLES.md](EXAMPLES.md) - detailed API examples
3. **Understand Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md) - deep dive
4. **Deploy to Production**: [DEPLOYMENT.md](DEPLOYMENT.md) - deployment guide

## Available Agents & Their Tools

### 📄 Documents Agent
- List documents
- Read document
- Create contract from template *(requires confirmation)*

### 👥 Users Agent
- List active users
- Get user activity
- Get user details

### 💰 Finance Agent
- Get budget details
- Update budget line *(requires confirmation)*
- List invoices

### 📊 Analysis Agent
- Generate reports
- Summarize documents

## Troubleshooting

### "API key not found"
- Check `.env` file has `ANTHROPIC_API_KEY=sk-ant-...`
- Restart server after changing `.env`

### "Cannot POST /agent/chat"
- Is the server running? (check terminal for "running on http://localhost:3000")
- Is the URL correct? (should be localhost:3000, not 3001)

### "Tool execution failed"
- Check agent type supports that tool
- Verify input parameters are correct
- See [EXAMPLES.md](EXAMPLES.md) for correct format

### "Confirmation not found"
- Confirmation expires after 5 minutes
- Create a new request if expired
- Use the most recent confirmationId

## Useful URLs

| Endpoint | Purpose | Method |
|----------|---------|--------|
| `/health` | Check server status | GET |
| `/agent/chat` | Chat with agents | POST |
| `/agent/confirm` | Confirm pending action | POST |
| `/agent/session/:id/history` | Get conversation history | GET |
| `/audit/logs` | View audit trail | GET |

## Getting Help

1. Check [README.md](README.md) for complete documentation
2. See [EXAMPLES.md](EXAMPLES.md) for code samples
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
4. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues

## Tips for Success

✅ **DO:**
- Test read operations first
- Use descriptive natural language
- Always confirm write operations
- Monitor audit logs for debugging
- Keep API key secure

❌ **DON'T:**
- Commit `.env` files
- Expose API keys in logs
- Skip confirmation checks
- Use old confirmationIds
- Ignore audit logs

---

**Congratulations!** Your agent system is running. Start asking it to do things! 🎉
