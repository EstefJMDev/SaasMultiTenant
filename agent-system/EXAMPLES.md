# Agent System - Usage Examples

## Quick Start

All examples assume the server is running on `http://localhost:3000`.

## 1. Basic Chat with Agent

### Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "What documents do we have?",
    "sessionId": "session-abc123"
  }'
```

### Response (Read Operation)
```json
{
  "success": true,
  "message": "I found 3 documents in your system: Service Contract - Acme Corp (created 1 day ago), Invoice - Q1 Services (2 days ago), and HR Policy Document (1 week ago).",
  "agentType": "documents",
  "sessionId": "session-abc123",
  "timestamp": "2025-03-26T10:30:00Z"
}
```

## 2. Create Contract (Write Operation - Requires Confirmation)

### Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Create a new contract from the standard template for Acme Corp, signed on March 26, 2025",
    "sessionId": "session-abc123"
  }'
```

### Response (Pending Confirmation)
```json
{
  "success": true,
  "message": "I'll create a new service agreement contract for Acme Corp dated March 26, 2025. Please confirm this action.",
  "agentType": "documents",
  "confirmationRequired": true,
  "confirmationId": "conf-xyz789",
  "action": {
    "agentType": "documents",
    "toolName": "create_contract_from_template",
    "description": "Create contract 'Service Agreement - Acme Corp, March 26, 2025'",
    "inputParams": {
      "templateId": "standard_contract",
      "variables": {
        "provider": "Acme Corp",
        "date": "March 26, 2025"
      }
    },
    "requiresConfirmation": true
  },
  "sessionId": "session-abc123",
  "timestamp": "2025-03-26T10:32:00Z"
}
```

## 3. Confirm a Pending Action

### Request
```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xyz789",
    "userId": "user123"
  }'
```

### Response
```json
{
  "success": true,
  "message": "Action confirmed and executed",
  "data": {
    "id": "doc_1711435920000",
    "tenantId": "tenant1",
    "type": "contract",
    "title": "Generated standard_contract",
    "createdAt": "2025-03-26T10:32:10Z",
    "createdBy": "user123"
  }
}
```

## 4. Reject a Pending Action

### Request
```bash
curl -X POST http://localhost:3000/agent/reject \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xyz789",
    "userId": "user123"
  }'
```

### Response
```json
{
  "success": true,
  "message": "Confirmation rejected"
}
```

## 5. Check Active Users (Read Operation)

### Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Who has been active today?",
    "sessionId": "session-abc123"
  }'
```

### Response
```json
{
  "success": true,
  "message": "I found 2 active users in the last 24 hours: John Doe (john@example.com, active just now) and Jane Smith (jane@example.com, active 1 hour ago).",
  "agentType": "users",
  "sessionId": "session-abc123"
}
```

## 6. Budget Management (Write Operation)

### Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "Update the Q1 Operations budget to $60,000 and mark it as approved",
    "sessionId": "session-abc123"
  }'
```

### Response
```json
{
  "success": true,
  "message": "I'll update the Q1 Operations budget from $50,000 to $60,000 and change status to approved. Please confirm.",
  "confirmationRequired": true,
  "confirmationId": "conf-abc456",
  "agentType": "finance",
  "action": {
    "agentType": "finance",
    "toolName": "patch_budget_line",
    "description": "Update Q1 Operations budget: $50,000 → $60,000, status: approved",
    "inputParams": {
      "budgetId": "budget1",
      "updates": {
        "amount": 60000,
        "status": "approved"
      }
    },
    "requiresConfirmation": true
  }
}
```

## 7. Analysis - Get Financial Report

### Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "tenantId": "tenant1",
    "message": "What is our financial summary for Q1?",
    "sessionId": "session-abc123"
  }'
```

### Response
```json
{
  "success": true,
  "message": "Based on Q1 2025 data: Total Revenue: $150,000 | Total Expenses: $95,000 | Net Income: $55,000. This represents a healthy 36.7% profit margin.",
  "agentType": "analysis",
  "sessionId": "session-abc123"
}
```

## 8. Get Session Conversation History

### Request
```bash
curl -X GET "http://localhost:3000/agent/session/session-abc123/history?userId=user123"
```

### Response
```json
{
  "success": true,
  "sessionId": "session-abc123",
  "history": [
    {
      "role": "user",
      "content": "What documents do we have?"
    },
    {
      "role": "assistant",
      "content": "I found 3 documents..."
    },
    {
      "role": "user",
      "content": "Create a new contract from the standard template..."
    },
    {
      "role": "assistant",
      "content": "I'll create a new service agreement contract..."
    }
  ]
}
```

## 9. View Audit Logs (Admin)

### Request
```bash
curl -X GET "http://localhost:3000/audit/logs?tenantId=tenant1&limit=20"
```

### Response
```json
{
  "success": true,
  "count": 5,
  "logs": [
    {
      "id": "log-12345",
      "userId": "user123",
      "tenantId": "tenant1",
      "sessionId": "session-abc123",
      "agentType": "documents",
      "toolName": "list_documents",
      "inputParams": {},
      "result": [
        {
          "id": "doc1",
          "type": "contract",
          "title": "Service Contract - Acme Corp"
        }
      ],
      "requiresConfirmation": false,
      "createdAt": "2025-03-26T10:30:00Z"
    },
    {
      "id": "log-12346",
      "userId": "user123",
      "tenantId": "tenant1",
      "sessionId": "session-abc123",
      "agentType": "documents",
      "toolName": "create_contract_from_template",
      "inputParams": {
        "templateId": "standard_contract",
        "variables": {
          "provider": "Acme Corp",
          "date": "March 26, 2025"
        }
      },
      "result": {
        "id": "doc_1711435920000",
        "type": "contract",
        "title": "Generated standard_contract"
      },
      "requiresConfirmation": true,
      "confirmedBy": "user123",
      "confirmedAt": "2025-03-26T10:32:10Z",
      "createdAt": "2025-03-26T10:32:00Z"
    }
  ]
}
```

## 10. View Only Confirmed Actions (Admin)

### Request
```bash
curl -X GET "http://localhost:3000/audit/logs/confirmed?tenantId=tenant1"
```

### Response
```json
{
  "success": true,
  "count": 2,
  "logs": [
    {
      "id": "log-12346",
      "userId": "user123",
      "tenantId": "tenant1",
      "agentType": "documents",
      "toolName": "create_contract_from_template",
      "confirmedBy": "user123",
      "confirmedAt": "2025-03-26T10:32:10Z",
      "createdAt": "2025-03-26T10:32:00Z"
    }
  ]
}
```

## 11. Health Check

### Request
```bash
curl http://localhost:3000/health
```

### Response
```json
{
  "status": "ok",
  "timestamp": "2025-03-26T10:35:00Z"
}
```

## JavaScript Client Example

```javascript
// Initialize session
const userId = 'user123';
const tenantId = 'tenant1';
const sessionId = generateUUID();

async function askAgent(message) {
  const response = await fetch('http://localhost:3000/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      tenantId,
      message,
      sessionId
    })
  });

  return await response.json();
}

async function confirmAction(confirmationId) {
  const response = await fetch('http://localhost:3000/agent/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirmationId,
      userId
    })
  });

  return await response.json();
}

// Usage
const result = await askAgent('Create a new contract for Acme Corp');
if (result.confirmationRequired) {
  console.log(result.action.description);
  // User reviews and approves
  const confirmed = await confirmAction(result.confirmationId);
  console.log('Action executed:', confirmed.data);
}
```

## Error Handling Examples

### Invalid Request
```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123"
    # Missing: tenantId, message
  }'
```

**Response (400)**
```json
{
  "success": false,
  "error": "Missing required fields: userId, message, tenantId"
}
```

### Expired Confirmation
```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "expired-id",
    "userId": "user123"
  }'
```

**Response (404)**
```json
{
  "success": false,
  "error": "Confirmation not found or expired"
}
```

### Unauthorized Access
```bash
curl -X POST http://localhost:3000/agent/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmationId": "conf-xyz789",
    "userId": "different-user"
  }'
```

**Response (403)**
```json
{
  "success": false,
  "error": "Unauthorized - user mismatch"
}
```
