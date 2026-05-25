# Agent System - Architecture Deep Dive

## System Overview

The Agent System is an enterprise-grade orchestration layer that converts natural language requests into safe, auditable platform operations. It leverages Claude's tool-use capabilities to intelligently route requests, propose actions, and execute with proper safeguards.

## Core Components

### 1. Orchestrator (`src/orchestrator.ts`)

**Purpose**: Central logic hub that manages the complete agentic loop.

**Key Methods**:

#### `processMessage(userId, message, sessionId, tenantId)`
- **Input**: User's natural language message with identity context
- **Output**: AgentResponse with action details or confirmation request
- **Flow**:
  1. Classify intent using `classifyIntent()` → pick agent type
  2. Retrieve session history (or create new session)
  3. Build system prompt specific to agent type
  4. Append user message to conversation history
  5. Call Claude API with tools for that agent
  6. Run agentic loop (up to 15 rounds):
     - Receive response from Claude
     - Check `stop_reason`:
       - `end_turn`: Return final answer to user
       - `tool_use`: Process tool calls
     - For each tool call:
       - Detect write vs read operation
       - **Write**: Create confirmation request, don't execute, return synthetic response
       - **Read**: Execute immediately via `executeTool()`
     - Append tool results to history
     - Continue loop
  7. Persist session history for future context
  8. Log action to audit service

#### `executeConfirmedAction(confirmationId, confirmedBy)`
- **Input**: Confirmation ID and approving user
- **Output**: Tool execution result
- **Flow**:
  1. Retrieve confirmation from service
  2. Validate it exists and hasn't expired
  3. Mark as confirmed with timestamp and user
  4. Execute the deferred tool
  5. Log with confirmation details
  6. Update session history
  7. Return result to user

### 2. Agent Router (`src/agents/agentRouter.ts`)

**Purpose**: Classify user intent and customize agent behavior.

#### `classifyIntent(userMessage)`
- Keyword matching across 4 domains
- Returns agent type with highest score
- Fallback to `analysis` agent if ambiguous

#### `getAgentSystemPrompt(agentType)`
- Returns specialized system prompt for agent
- Each agent has specific responsibilities and constraints
- Ensures appropriate tool access and behavior

**Agent Types**:
- `documents`: Contract/document management
- `users`: User activity and team management
- `finance`: Budget and financial operations
- `analysis`: Reporting and insights

### 3. Tool Definitions (`src/tools/toolDefinitions.ts`)

**Purpose**: Define tools available to Claude and implement execution.

**Structure**:
- Tool definitions matching Claude's schema
- Grouped by agent type in `toolsByAgent`
- Write operations identified in `writeOperations` Set

**Tool Execution** (`executeTool()`):
- Route to appropriate mock API client method
- Handle errors gracefully
- Return results in standard format

### 4. Confirmation Service (`src/services/confirmationService.ts`)

**Purpose**: Manage pending write operation confirmations.

**Key Operations**:
- `createConfirmation()`: Generate confirmation request with 5-minute expiry
- `confirm()`: Mark as approved, record user and timestamp
- `getConfirmation()`: Retrieve pending request
- `reject()`: Cancel pending confirmation
- `cleanupExpired()`: Auto-cleanup expired requests (runs every minute)

**Data Structure**:
```typescript
{
  id: UUID,
  userId: string,
  tenantId: string,
  sessionId: string,
  action: AgentAction,
  proposed_at: Date,
  expires_at: Date,
  confirmed: boolean,
  confirmed_by?: string,
  confirmed_at?: Date
}
```

### 5. Audit Log Service (`src/services/auditLogService.ts`)

**Purpose**: Comprehensive logging for compliance and debugging.

**Logged Information**:
- User identity and tenant
- Agent type and tool used
- Input parameters
- Execution result
- Confirmation status and approver
- Exact timestamp

**Query Methods**:
- By session, user, tenant, agent type
- Confirmed actions only
- Time-range filtering

### 6. Mock API Client (`src/services/mockApiClient.ts`)

**Purpose**: Simulate real API backend with stub data.

**Contains Stub Methods For**:
- Document operations (list, read, create from template)
- User queries (active, by ID, activity)
- Finance operations (budgets, invoices)
- Analysis (reports, summaries)

**Replacement Path**: For production, replace with real HTTP/gRPC calls to your backend.

### 7. Express Server (`src/index.ts`)

**Purpose**: HTTP API layer exposing agent functionality.

**Endpoints**:
- `POST /agent/chat`: Main agent interaction
- `POST /agent/confirm`: Approve pending actions
- `POST /agent/reject`: Cancel pending confirmations
- `GET /agent/session/:id/history`: Get conversation
- `GET /audit/logs`: View audit trail
- `GET /health`: Server status

## Data Flow: Complete Request Lifecycle

### Example: "Create a contract with Acme Corp"

```
1. CLIENT REQUEST
   POST /agent/chat
   {
     userId: "user123",
     tenantId: "tenant1",
     message: "Create a contract with Acme Corp",
     sessionId: "session-abc"
   }

2. REQUEST VALIDATION (Express middleware)
   → Verify required fields
   → Sanitize input

3. INTENT CLASSIFICATION
   classifyIntent("Create a contract...")
   → Matches "contract", "create" keywords
   → Returns: agentType = 'documents'

4. SESSION RETRIEVAL
   getOrCreateSession(sessionId)
   → Retrieve history for "session-abc"
   → Initialize if first message

5. AGENT SETUP
   toolsByAgent['documents']
   → Provides 3 tools: list, read, create

6. CLAUDE API CALL #1
   messages: [
     {role: "user", content: "Create a contract..."}
   ],
   tools: [
     {name: "create_contract_from_template", ...},
     ...
   ],
   system: "You are the Documents Agent..."

7. CLAUDE RESPONSE #1
   stop_reason: "tool_use"
   tool_use: {
     name: "create_contract_from_template",
     input: {
       templateId: "standard_contract",
       variables: {provider: "Acme Corp"}
     }
   }

8. WRITE OPERATION DETECTED
   "create_contract_from_template" ∈ writeOperations
   → NOT executed immediately
   → Create confirmation request

9. CONFIRMATION REQUEST CREATED
   confirmationService.createConfirmation({
     action: {
       toolName: "create_contract_from_template",
       inputParams: {...},
       description: "Create contract: Service Agreement - Acme Corp"
     },
     expiresAt: Date + 5 minutes
   })
   → Returns: confirmationId = "conf-xyz789"

10. SYNTHETIC TOOL RESPONSE
    Append to history as tool result:
    "This action requires user confirmation.
     Action ID: conf-xyz789.
     Please confirm via POST /agent/confirm"

11. CLAUDE API CALL #2
    messages: [
      {role: "user", content: "Create a contract..."},
      {role: "assistant", tool_use: {...}},
      {role: "user", tool_result: "Pending confirmation..."}
    ]

12. CLAUDE RESPONSE #2
    stop_reason: "end_turn"
    text: "I've prepared to create a contract with Acme Corp
           as a Service Agreement. Please confirm this action
           using confirmation ID: conf-xyz789"

13. AUDIT LOG CREATED
    {
      toolName: "create_contract_from_template",
      agentType: "documents",
      requiresConfirmation: true,
      result: {status: "pending_confirmation", id: "conf-xyz789"},
      createdAt: "2025-03-26T10:30:00Z"
    }

14. RESPONSE TO USER
    {
      success: true,
      message: "I've prepared to create a contract...",
      confirmationRequired: true,
      confirmationId: "conf-xyz789",
      action: {description: "Create contract: Service Agreement - Acme Corp"}
    }

15. USER REVIEWS & CONFIRMS
    POST /agent/confirm
    {
      confirmationId: "conf-xyz789",
      userId: "user123"
    }

16. CONFIRMATION EXECUTION
    executeConfirmedAction("conf-xyz789", "user123")
    → Retrieve confirmation request
    → Validate not expired
    → Mark as confirmed with timestamp
    → Execute the actual tool:
        mockApiClient.createContractFromTemplate(...)
    → Get result with document ID and metadata

17. AUDIT LOG UPDATED
    Update existing log:
    {
      confirmedBy: "user123",
      confirmedAt: "2025-03-26T10:32:10Z",
      result: {id: "doc_1711435920000", ...}
    }

18. RESPONSE TO USER
    {
      success: true,
      message: "Action confirmed and executed",
      data: {
        id: "doc_1711435920000",
        type: "contract",
        title: "Service Agreement - Acme Corp"
      }
    }
```

## Multi-Tenant Isolation

### Enforcement Points

1. **Request Level**: Every endpoint requires `tenantId`
2. **Session Level**: Sessions tagged with tenant
3. **Tool Execution**: All queries filtered by `tenantId`
4. **Confirmation Level**: Confirmations scoped to tenant
5. **Audit Level**: Logs filtered and isolated

### Example: User from Tenant A cannot access Tenant B data
```typescript
// If tenantId mismatch in confirmationService.confirm():
const confirmation = this.confirmations.get(id);
if (confirmation.tenantId !== requestTenantId) {
  return error; // Unauthorized
}
```

## Security Considerations

### 1. Write Operation Safety

**Detection**: Hardcoded list of tools that modify data
```typescript
writeOperations = new Set([
  'create_contract_from_template',
  'patch_budget_line'
]);
```

**Proposal**: User must review before execution
```typescript
if (writeOperations.has(toolName)) {
  // Create confirmation, don't execute
  const confirmation = confirmationService.createConfirmation(...);
  return { confirmationRequired: true, confirmationId: confirmation.id };
}
```

**Audit**: Every write logged with approver identity
```typescript
{
  toolName: "patch_budget_line",
  confirmedBy: "user123",
  confirmedAt: "2025-03-26T10:32:10Z"
}
```

### 2. API Key Security

- Never logged or exposed in responses
- Loaded from environment only
- Should be rotated regularly
- Use service account in production

### 3. Input Validation

Claude handles intent interpretation, but API layer validates:
- Required fields present
- Field types match schema
- tenant_id format valid
- user_id format valid

### 4. Rate Limiting (Recommended for Production)

```typescript
// Use express-rate-limit middleware
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30 // 30 requests per minute
});

app.post('/agent/chat', limiter, (req, res) => { ... });
```

## Performance Characteristics

### Response Times

| Operation | Time | Notes |
|-----------|------|-------|
| Chat (read op) | 2-3s | Single Claude API call + tool exec |
| Chat (write op) | 1-2s | No tool execution, just confirmation |
| Confirm | 500ms | Tool execution only |
| Audit query | <100ms | In-memory search (DB in production) |

### Scalability Limits

- **Current**: In-memory storage for sessions/confirmations
- **Production**: Use PostgreSQL with connection pooling
- **Concurrent Users**: Limited by Claude API rate limits (not the orchestrator)
- **Message History**: Grows with conversation; consider archiving old sessions

## Extension Points

### Adding a New Agent

1. **Create Agent**
   ```typescript
   // src/agents/myAgent.ts
   export const myAgentSystemPrompt = "..."
   ```

2. **Define Tools**
   ```typescript
   // src/tools/toolDefinitions.ts
   export const myAgentTools = [...]
   ```

3. **Register in Router**
   ```typescript
   // src/agents/agentRouter.ts
   const myAgentKeywords = ['keyword1', 'keyword2'];
   // Add to classifyIntent() scoring
   ```

4. **Implement Tool Execution**
   ```typescript
   // src/tools/toolDefinitions.ts
   case 'my_tool':
     return await myApiClient.myOperation(...);
   ```

### Integrating Real Backend

Replace `mockApiClient` calls:

```typescript
// Before (mock)
return await mockApiClient.listDocuments(tenantId);

// After (real)
const response = await fetch(`${API_BASE}/documents`, {
  headers: {
    'Authorization': `Bearer ${API_TOKEN}`,
    'X-Tenant-ID': tenantId
  }
});
return response.json();
```

### Custom Confirmation Logic

Extend `confirmationService` for:
- Approval workflows (manager approval before finance)
- Audit rules (alert on suspicious patterns)
- Rate limiting (max operations per period)

## Monitoring & Observability

### Key Metrics

1. **Agent Usage**
   ```sql
   SELECT agent_type, COUNT(*) FROM agent_logs
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY agent_type;
   ```

2. **Write Operations**
   ```sql
   SELECT tool_name, COUNT(*), COUNT(CASE WHEN confirmed_by IS NOT NULL THEN 1 END)
   FROM agent_logs
   WHERE requires_confirmation = true
   GROUP BY tool_name;
   ```

3. **Confirmation Approval Rate**
   ```sql
   SELECT
     COUNT(CASE WHEN confirmed_by IS NOT NULL THEN 1 END) * 100.0 / COUNT(*) as approval_rate
   FROM agent_logs
   WHERE requires_confirmation = true;
   ```

### Alerting

Suggested alerts:
- High rate of confirmation rejections (possible abuse)
- Tool execution failures (API issues)
- Expired confirmations (users not responding)
- Session cleanup failures (memory leak risk)

## Testing Strategy

### Unit Tests
- Mock API client responses
- Confirmation service state transitions
- Intent classification accuracy

### Integration Tests
- Full request flow with mock tools
- Session persistence and retrieval
- Confirmation lifecycle

### E2E Tests
- Real Claude API calls (with test keys)
- Multi-turn conversations
- Write operation safety

See `tests/` directory for examples.

## Deployment Checklist

- [ ] API key configured in production environment
- [ ] PostgreSQL database created and schema applied
- [ ] Connection pooling configured
- [ ] Rate limiting enabled
- [ ] CORS configured appropriately
- [ ] Logging/monitoring set up
- [ ] Backup strategy for audit logs
- [ ] Session cleanup jobs scheduled
- [ ] Error alerting configured
- [ ] Load testing completed

## Future Enhancements

1. **Streaming Responses**: Return Claude's thinking in real-time
2. **Tool Dependencies**: Mark tools that depend on other tool outputs
3. **Approval Workflows**: Multi-step approvals for critical operations
4. **Tool Versioning**: Support multiple versions of tools
5. **Analytics Dashboard**: Real-time visualization of agent activity
6. **Custom Rules Engine**: Domain-specific validation rules
7. **Integration Webhooks**: Notify external systems of confirmations
8. **A/B Testing**: Test different agent prompts and routing strategies

---

Built with precision and security in mind. 🔐
