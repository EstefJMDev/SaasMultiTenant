-- Agent System Schema
-- Tables for audit logging and confirmation management

-- ============ AGENT_LOGS TABLE ============
-- Complete audit trail of all agent actions

CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  input_params JSONB NOT NULL,
  result JSONB,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmed_by VARCHAR(255),
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for performance
  CONSTRAINT agent_types CHECK (agent_type IN ('documents', 'users', 'finance', 'analysis'))
);

CREATE INDEX idx_agent_logs_tenant ON agent_logs(tenant_id);
CREATE INDEX idx_agent_logs_user ON agent_logs(user_id);
CREATE INDEX idx_agent_logs_session ON agent_logs(session_id);
CREATE INDEX idx_agent_logs_agent_type ON agent_logs(agent_type);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_confirmed ON agent_logs(confirmed_by) WHERE confirmed_by IS NOT NULL;

-- ============ CONFIRMATION_REQUESTS TABLE ============
-- Tracks write operation confirmations

CREATE TABLE IF NOT EXISTS confirmation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_params JSONB NOT NULL,
  confirmed BOOLEAN DEFAULT FALSE,
  confirmed_by VARCHAR(255),
  confirmed_at TIMESTAMP,
  proposed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  CONSTRAINT valid_expiry CHECK (expires_at > proposed_at)
);

CREATE INDEX idx_confirmations_user ON confirmation_requests(user_id);
CREATE INDEX idx_confirmations_tenant ON confirmation_requests(tenant_id);
CREATE INDEX idx_confirmations_session ON confirmation_requests(session_id);
CREATE INDEX idx_confirmations_status ON confirmation_requests(confirmed);
CREATE INDEX idx_confirmations_expires ON confirmation_requests(expires_at) WHERE NOT confirmed;

-- ============ AGENT_SESSIONS TABLE ============
-- Track active sessions and their metadata

CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  conversation_history JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,

  CONSTRAINT agent_types_sessions CHECK (agent_type IN ('documents', 'users', 'finance', 'analysis', 'unknown'))
);

CREATE INDEX idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX idx_sessions_tenant ON agent_sessions(tenant_id);
CREATE INDEX idx_sessions_expires ON agent_sessions(expires_at) WHERE expires_at > CURRENT_TIMESTAMP;

-- ============ AGENT_TOOL_USAGE TABLE ============
-- Analytics on tool usage patterns

CREATE TABLE IF NOT EXISTS agent_tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  execution_count INT DEFAULT 1,
  success_count INT DEFAULT 0,
  avg_execution_time_ms FLOAT,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(tenant_id, tool_name, agent_type)
);

CREATE INDEX idx_tool_usage_tenant ON agent_tool_usage(tenant_id);
CREATE INDEX idx_tool_usage_agent_type ON agent_tool_usage(agent_type);

-- ============ VIEW: Recent Agent Actions ============
-- Quick view of recent high-impact actions

CREATE OR REPLACE VIEW recent_agent_actions AS
SELECT
  id,
  user_id,
  tenant_id,
  session_id,
  agent_type,
  tool_name,
  requires_confirmation,
  confirmed_by,
  confirmed_at,
  created_at
FROM agent_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ============ VIEW: Pending Confirmations ============
-- Actions awaiting user approval

CREATE OR REPLACE VIEW pending_confirmations AS
SELECT
  id,
  user_id,
  tenant_id,
  session_id,
  action_type,
  action_params,
  proposed_at,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP))::INT as seconds_until_expiry
FROM confirmation_requests
WHERE NOT confirmed
  AND expires_at > CURRENT_TIMESTAMP
ORDER BY proposed_at DESC;

-- ============ MIGRATION NOTES ============
/*
To apply this schema:

1. Connect to your PostgreSQL database as a user with CREATE TABLE privileges
2. Run this entire script

Example:
  psql -U your_user -d your_database -f agent-system/sql/schema.sql

3. Verify tables were created:
  \dt agent_*
  \dt confirmation_*

For cleanup (WARNING: deletes all agent data):
  DROP TABLE IF EXISTS agent_tool_usage CASCADE;
  DROP TABLE IF EXISTS agent_sessions CASCADE;
  DROP TABLE IF EXISTS confirmation_requests CASCADE;
  DROP TABLE IF EXISTS agent_logs CASCADE;
  DROP VIEW IF EXISTS recent_agent_actions CASCADE;
  DROP VIEW IF EXISTS pending_confirmations CASCADE;
*/
