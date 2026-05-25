# 🤖 SaaS Agent System - Enterprise AI Orchestration

A production-ready AI agent system for multi-tenant SaaS platforms. Users interact with natural language, the system understands intent, executes tools safely, and maintains complete audit trails.

## ✨ Features

- **🎯 Intent-Based Routing**: Automatically classifies user requests and routes to specialized agents
- **🔐 Safe Write Operations**: All write operations require explicit user confirmation before execution
- **📝 Complete Audit Trail**: Every action logged with user identity, timestamp, and parameters
- **🏢 Multi-Tenant Isolation**: Built-in tenant and user isolation for data security
- **🧠 Dual LLM Support**: Local models via Ollama (default) or Claude API via Anthropic -- same features with both
- **💬 Conversation Memory**: Maintains session history for contextual interactions
- **🛠️ 4 Specialized Agents**:
  - **Documents Agent**: Create contracts, read documents, manage files
  - **Users Agent**: Query active users, analyze activity, team engagement
  - **Finance Agent**: Budget management, spending tracking, approvals
  - **Analysis Agent**: Generate reports, summaries, business insights

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User (Natural Language)                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  Express API /agent/chat                    │
│              (HTTP request validation layer)                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  ORCHESTRATOR                               │
│   - Intent Classification (agentRouter)                    │
│   - Session Management                                      │
│   - Agentic Loop (Ollama/Claude + Tool Use)                │
└─────────────────────────────────────────────────────────────┘
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                   ↓
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │Documents│        │  Users  │        │ Finance │
   │ Agent   │        │ Agent   │        │ Agent   │
   └─────────┘        └─────────┘        └─────────┘
        ↓                  ↓                   ↓
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │Tools    │        │Tools    │        │Tools    │
   │(Docs)   │        │(Users)  │        │(Finance)│
   └─────────┘        └─────────┘        └─────────┘
        ↓                  ↓                   ↓
    ┌───────────────────────────────────────────────┐
    │  Tool Execution Layer                         │
    │  - Mock API Client (or real API calls)        │
    │  - Confirmation Service (write operations)    │
    │  - Audit Logging (all actions)                │
    └───────────────────────────────────────────────┘
```

## 🚀 Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- **Option A (Local):** Ollama installed with a model pulled (see [OLLAMA_SETUP.md](OLLAMA_SETUP.md))
- **Option B (Cloud):** Anthropic API key (get it from https://console.anthropic.com)
- PostgreSQL 12+ (for production audit logs)

### Step 1: Install Dependencies

```bash
cd agent-system
npm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

**Option A -- Local model with Ollama (default, no API key needed):**

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
PORT=3000
```

**Option B -- Cloud model with Anthropic:**

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
PORT=3000
```

### Step 3: Set Up Database (Production)

For production, create the PostgreSQL schema:

```bash
# Connect to your PostgreSQL database
psql -U postgres -d your_saas_db -f sql/schema.sql

# Or if you prefer:
# psql -h localhost -U postgres
# \c your_saas_db
# \i sql/schema.sql
```

The schema creates:
- `agent_logs` - Complete audit trail of all actions
- `confirmation_requests` - Pending confirmations
- `agent_sessions` - Active sessions metadata
- Views for analytics and monitoring

### Step 4: Build and Start

```bash
# Build TypeScript
npm run build

# Start server
npm start

# Or development mode with auto-reload
npm run dev
```

Server will start on `http://localhost:3000`

```
🤖 Agent System running on http://localhost:3000
📚 Documentation: http://localhost:3000/docs
💡 POST /agent/chat - Chat with agents
✅ POST /agent/confirm - Confirm actions
❌ POST /agent/reject - Reject confirmations
📊 GET /audit/logs - View audit logs
```

## 💡 Quick Start

### Example 1: Chat with Documents Agent

```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Show me all our contracts"
  }'
```

Response:
```json
{
  "success": true,
  "message": "I found 3 contracts in your system...",
  "agentType": "documents",
  "sessionId": "uuid-here"
}
```

### Example 2: Create Contract (Requires Confirmation)

```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Create a new service contract with Acme Corp"
  }'
```

Response (action pending approval):
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

### Example 3: Confirm the Action

```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xyz789",
    "userId": "user123"
  }'
```

Response (action executed):
```json
{
  "success": true,
  "message": "Action confirmed and executed",
  "data": {
    "id": "doc_12345",
    "title": "Service Agreement - Acme Corp",
    "createdAt": "2025-03-26T10:32:10Z"
  }
}
```

## 🔌 API Endpoints

### `POST /agent/chat`
Main endpoint for interacting with agents.

**Request:**
```json
{
  "userId": "string (required)",
  "tenantId": "string (required)",
  "message": "string (required)",
  "sessionId": "string (optional, auto-generated)"
}
```

**Response:**
```json
{
  "success": boolean,
  "message": "string",
  "agentType": "documents|users|finance|analysis",
  "sessionId": "string",
  "confirmationRequired": boolean,
  "confirmationId": "string (if confirmation pending)",
  "action": { /* AgentAction details */ },
  "timestamp": "ISO timestamp"
}
```

### `POST /agent/confirm`
Confirm a pending write operation.

**Request:**
```json
{
  "confirmationId": "string",
  "userId": "string"
}
```

**Response:**
```json
{
  "success": boolean,
  "message": "string",
  "data": { /* Tool execution result */ }
}
```

### `POST /agent/reject`
Reject/cancel a pending confirmation.

**Request:**
```json
{
  "confirmationId": "string",
  "userId": "string"
}
```

### `GET /agent/session/:sessionId/history`
Get conversation history for a session.

**Query Parameters:**
- `userId` (required)

**Response:**
```json
{
  "success": boolean,
  "sessionId": "string",
  "history": [
    { "role": "user|assistant", "content": "string" }
  ]
}
```

### `GET /audit/logs`
Get audit logs (admin endpoint).

**Query Parameters:**
- `tenantId` (required)
- `userId` (optional)
- `agentType` (optional)
- `limit` (optional, default: 100)

**Response:**
```json
{
  "success": boolean,
  "count": number,
  "logs": [
    {
      "id": "uuid",
      "userId": "string",
      "tenantId": "string",
      "agentType": "string",
      "toolName": "string",
      "inputParams": { /* tool input */ },
      "result": { /* tool output */ },
      "requiresConfirmation": boolean,
      "confirmedBy": "string (if executed)",
      "confirmedAt": "ISO timestamp (if executed)",
      "createdAt": "ISO timestamp"
    }
  ]
}
```

### `GET /audit/logs/confirmed`
Get only confirmed (executed) write operations.

**Query Parameters:**
- `tenantId` (required)

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "ISO timestamp"
}
```

## 🔐 Security Considerations

### Multi-Tenant Isolation
- Every request includes `tenantId` and `userId`
- All queries automatically filtered by tenant
- Users cannot access other tenants' data

### Write Operation Safety
1. **Detection**: System identifies write operations automatically
2. **Proposal**: Agent proposes action with human-readable summary
3. **Confirmation**: Requires explicit user approval before execution
4. **Audit**: All confirmations logged with user identity and timestamp

### API Key Management
- Never commit `.env` files with API keys
- Use environment variables or secrets manager in production
- Rotate keys regularly

### Audit Logging
- All actions logged in `agent_logs` table
- Includes input parameters and results
- Tracks who confirmed what and when
- Enables compliance audits and incident investigation

## 🛠️ Available Tools by Agent

### Documents Agent
- `list_documents` - List all documents
- `read_document` - Read document content
- `create_contract_from_template` - Create contract (requires confirmation)

### Users Agent
- `list_active_users` - Get active users in timeframe
- `get_user_activity` - Query user activity
- `get_user_by_id` - Get user details

### Finance Agent
- `get_budget` - Retrieve budget details
- `patch_budget_line` - Update budget (requires confirmation)
- `list_invoices` - List all invoices

### Analysis Agent
- `query_report` - Generate/query reports
- `summarize_document` - Summarize document content

## 🧪 Testing

See [EXAMPLES.md](EXAMPLES.md) for comprehensive examples of:
- Basic chat queries
- Write operations with confirmation
- Session history retrieval
- Audit log queries
- Error handling

### Test with cURL

```bash
# Health check
curl http://localhost:3000/health

# Chat with agent
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "tenantId": "test-tenant",
    "message": "Who is active right now?"
  }'
```

### Test with JavaScript

```javascript
const response = await fetch('http://localhost:3000/agent/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    tenantId: 'tenant1',
    message: 'What is our budget status?'
  })
});

const result = await response.json();
console.log(result);
```

## 🔄 Workflow: From Request to Audit Log

1. **User submits message** → `POST /agent/chat`
2. **Intent classification** → agentRouter determines agent type
3. **Session retrieved** → Get conversation history
4. **Agent setup** → Select appropriate tools for agent
5. **Claude API call** → With tools and context
6. **Agentic loop** → Claude uses tools, processes results
7. **Write detection** → If write operation detected:
   - Create `ConfirmationRequest`
   - Return action proposal to user
   - Return immediately
8. **User confirms** → `POST /agent/confirm`
9. **Execute deferred action** → Run the write operation
10. **Audit log created** → Record with confirmation details
11. **Response returned** → User sees result

## 📊 Monitoring

### Check audit logs
```sql
SELECT * FROM agent_logs
WHERE tenant_id = 'tenant1'
ORDER BY created_at DESC
LIMIT 50;
```

### Find pending confirmations
```sql
SELECT * FROM pending_confirmations
WHERE tenant_id = 'tenant1'
AND NOT confirmed;
```

### Action statistics
```sql
SELECT agent_type, tool_name, COUNT(*) as count
FROM agent_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY agent_type, tool_name
ORDER BY count DESC;
```

## 🚀 Production Deployment

### Environment Variables
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
# Or for Anthropic:
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-key-here
PORT=3000
NODE_ENV=production
DB_HOST=prod-db.example.com
DB_PORT=5432
DB_NAME=saas_production
DB_USER=agent_system
DB_PASSWORD=secure-password
LOG_LEVEL=warn
```

### Database Migration
```bash
# Run schema on production database
psql -h prod-db.example.com -U agent_system -d saas_production < sql/schema.sql
```

### Recommended Practices
1. Use connection pooling (pgBouncer, node-pg-pool)
2. Set up log rotation and archiving
3. Implement rate limiting on `/agent/chat`
4. Use CORS middleware for security
5. Set up monitoring/alerting on failed tool executions
6. Regularly audit `agent_logs` for suspicious patterns
7. Implement session cleanup jobs

## 🔧 Customization

### Adding New Tools
1. Add tool definition to `src/tools/toolDefinitions.ts`
2. Add execution logic to `executeTool()` function
3. Add to appropriate agent's `toolsByAgent` group
4. Mark as write operation in `writeOperations` Set if needed

### Adding New Agents
1. Create agent file in `src/agents/`
2. Add agent type to `AgentType` in `src/types/index.ts`
3. Add classification keywords to `agentRouter.ts`
4. Add system prompt in `getAgentSystemPrompt()`
5. Define tools in `toolDefinitions.ts`

### Using Real API Backend
Replace `mockApiClient` in tool execution with real API calls:

```typescript
// Before (mock)
const result = await mockApiClient.listDocuments(tenantId);

// After (real API)
const result = await realApi.get(`/documents?tenant_id=${tenantId}`);
```

## 📖 Architecture Details

### Session Management
- Sessions are auto-generated UUIDs
- Conversation history maintained in memory (or DB in production)
- Sessions expire after 30 minutes of inactivity
- Cleanup runs automatically

### Confirmation Lifecycle
1. Proposed → Agent detects write operation
2. Pending → User must confirm within 5 minutes
3. Confirmed → User approves, action executes
4. Expired → Auto-cleanup after timeout

### Audit Trail Contents
- **Who**: userId and confirmedBy
- **When**: timestamp and confirmedAt
- **What**: agentType, toolName, inputParams, result
- **Why**: Session context and conversation history
- **Confirmation**: Whether user approved, when, by whom

## 🐛 Troubleshooting

### "Tool not found" errors
- Verify tool name in agent's `toolsByAgent`
- Check spelling matches `executeTool()` switch statement

### "Confirmation not found or expired"
- Confirmations expire after 5 minutes
- User must confirm within window
- Check timestamp vs `expiresAt` in database

### "Unauthorized - user mismatch"
- Ensure confirmation `userId` matches request `userId`
- Different users cannot confirm each other's actions

### Ollama errors
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check model is pulled: `ollama pull mistral:7b`
- See [OLLAMA_SETUP.md](OLLAMA_SETUP.md) for detailed troubleshooting

### Claude API errors (if using LLM_PROVIDER=anthropic)
- Verify API key in `.env`
- Check model name is correct
- Monitor API quota/rate limits

## 📝 License

MIT

## 🤝 Support

For issues, questions, or feature requests, see the main project README.

---

**Built with local LLMs via Ollama and optional Anthropic Claude API**
