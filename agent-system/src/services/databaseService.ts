// Database Service - PostgreSQL integration with connection pooling
// Manages agent_logs, confirmation_requests, agent_sessions, and agent_tool_usage tables

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { AgentLog, AgentType, ConfirmationRequest, AgentAction } from '../types/index';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'saas_agents',
  user: process.env.DB_USER || 'agent_user',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // Connection pool settings
  max: Number(process.env.DB_POOL_MAX) || 20,
  min: Number(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: false,
};

// ---------------------------------------------------------------------------
// Pool management
// ---------------------------------------------------------------------------

let pool: Pool | null = null;
let initialized = false;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);

    pool.on('error', (err: Error) => {
      logger.error('[DatabaseService] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      logger.debug('[DatabaseService] New client connected to pool');
    });
  }
  return pool;
}

/** Execute a parameterized query with error handling. */
async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const p = getPool();
  const start = Date.now();
  try {
    const result = await p.query<T>(text, params);
    const elapsed = Date.now() - start;
    logger.debug(`[DatabaseService] Query (${elapsed}ms): ${text.slice(0, 80)}...`);
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    logger.error(
      `[DatabaseService] Query failed (${elapsed}ms): ${text.slice(0, 80)}...`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/** Get a client from the pool for transactions. */
async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

// ---------------------------------------------------------------------------
// Schema initialisation - auto-creates tables if missing
// ---------------------------------------------------------------------------

const CREATE_AGENT_LOGS = `
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  input_params JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmed_by VARCHAR(255),
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`;

const CREATE_CONFIRMATION_REQUESTS = `
CREATE TABLE IF NOT EXISTS confirmation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  action_agent_type VARCHAR(50) NOT NULL,
  action_tool_name VARCHAR(255) NOT NULL,
  action_input_params JSONB NOT NULL DEFAULT '{}',
  action_description TEXT NOT NULL DEFAULT '',
  requires_confirmation BOOLEAN DEFAULT TRUE,
  confirmed BOOLEAN DEFAULT FALSE,
  confirmed_by VARCHAR(255),
  confirmed_at TIMESTAMP,
  proposed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);`;

const CREATE_AGENT_SESSIONS = `
CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  conversation_history JSONB,
  pending_confirmation_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);`;

const CREATE_AGENT_TOOL_USAGE = `
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
);`;

const CREATE_INDEXES = `
DO $$ BEGIN
  -- agent_logs indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_logs_tenant') THEN
    CREATE INDEX idx_agent_logs_tenant ON agent_logs(tenant_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_logs_user') THEN
    CREATE INDEX idx_agent_logs_user ON agent_logs(user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_logs_session') THEN
    CREATE INDEX idx_agent_logs_session ON agent_logs(session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_agent_logs_created_at') THEN
    CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
  END IF;

  -- confirmation_requests indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_confirmations_session') THEN
    CREATE INDEX idx_confirmations_session ON confirmation_requests(session_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_confirmations_expires') THEN
    CREATE INDEX idx_confirmations_expires ON confirmation_requests(expires_at) WHERE NOT confirmed;
  END IF;

  -- agent_sessions indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_tenant') THEN
    CREATE INDEX idx_sessions_tenant ON agent_sessions(tenant_id);
  END IF;

  -- agent_tool_usage indexes
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tool_usage_tenant') THEN
    CREATE INDEX idx_tool_usage_tenant ON agent_tool_usage(tenant_id);
  END IF;
END $$;`;

// ---------------------------------------------------------------------------
// DatabaseService
// ---------------------------------------------------------------------------

class DatabaseService {
  // ---- Initialisation ----

  /**
   * Initialise the database: create tables and indexes if they do not exist.
   * Safe to call multiple times (idempotent).
   */
  async initialize(): Promise<void> {
    if (initialized) return;

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query(CREATE_AGENT_LOGS);
      await client.query(CREATE_CONFIRMATION_REQUESTS);
      await client.query(CREATE_AGENT_SESSIONS);
      await client.query(CREATE_AGENT_TOOL_USAGE);
      await client.query(CREATE_INDEXES);
      await client.query('COMMIT');
      initialized = true;
      logger.info('[DatabaseService] Schema initialised successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(
        '[DatabaseService] Schema initialisation failed:',
        err instanceof Error ? err.message : err
      );
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List all four expected tables, creating missing ones along the way.
   * Returns an array of table names that exist after the check.
   */
  async getAllTables(): Promise<string[]> {
    await this.initialize();

    const result = await query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('agent_logs', 'confirmation_requests', 'agent_sessions', 'agent_tool_usage')
       ORDER BY tablename`
    );
    return result.rows.map((r) => r.tablename);
  }

  // ---- Agent Logs ----

  async logAgentAction(params: {
    userId: string;
    tenantId: string;
    sessionId: string;
    agentType: AgentType;
    toolName: string;
    inputParams: Record<string, unknown>;
    result: unknown;
    requiresConfirmation: boolean;
    confirmedBy?: string;
    confirmedAt?: Date;
  }): Promise<AgentLog> {
    const id = uuidv4();
    const now = new Date();

    await query(
      `INSERT INTO agent_logs
         (id, user_id, tenant_id, session_id, agent_type, tool_name,
          input_params, result, requires_confirmation, confirmed_by, confirmed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        params.userId,
        params.tenantId,
        params.sessionId,
        params.agentType,
        params.toolName,
        JSON.stringify(params.inputParams),
        JSON.stringify(params.result),
        params.requiresConfirmation,
        params.confirmedBy || null,
        params.confirmedAt || null,
        now,
      ]
    );

    return {
      id,
      userId: params.userId,
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      agentType: params.agentType,
      toolName: params.toolName,
      inputParams: params.inputParams,
      result: params.result,
      requiresConfirmation: params.requiresConfirmation,
      confirmedBy: params.confirmedBy,
      confirmedAt: params.confirmedAt,
      createdAt: now,
    };
  }

  async getAgentLogs(filters: {
    tenantId: string;
    userId?: string;
    sessionId?: string;
    agentType?: AgentType;
    limit?: number;
  }): Promise<AgentLog[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [filters.tenantId];
    let paramIdx = 2;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      values.push(filters.userId);
    }
    if (filters.sessionId) {
      conditions.push(`session_id = $${paramIdx++}`);
      values.push(filters.sessionId);
    }
    if (filters.agentType) {
      conditions.push(`agent_type = $${paramIdx++}`);
      values.push(filters.agentType);
    }

    const limit = filters.limit || 100;
    conditions.push(`1=1`); // ensure valid SQL even with no filters
    values.push(limit);

    const sql = `
      SELECT * FROM agent_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIdx}`;

    const result = await query(sql, values);
    return result.rows.map(mapRowToAgentLog);
  }

  // ---- Confirmation Requests ----

  async createConfirmation(params: {
    userId: string;
    tenantId: string;
    sessionId: string;
    action: AgentAction;
    expirationMinutes?: number;
  }): Promise<ConfirmationRequest> {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (params.expirationMinutes || 5) * 60_000
    );

    await query(
      `INSERT INTO confirmation_requests
         (id, user_id, tenant_id, session_id,
          action_agent_type, action_tool_name, action_input_params,
          action_description, requires_confirmation,
          confirmed, proposed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        params.userId,
        params.tenantId,
        params.sessionId,
        params.action.agentType,
        params.action.toolName,
        JSON.stringify(params.action.inputParams),
        params.action.description,
        params.action.requiresConfirmation,
        false,
        now,
        expiresAt,
      ]
    );

    return {
      id,
      userId: params.userId,
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      action: params.action,
      proposedAt: now,
      expiresAt,
      confirmed: false,
    };
  }

  async getConfirmation(confirmationId: string): Promise<ConfirmationRequest | null> {
    const result = await query(
      `SELECT * FROM confirmation_requests WHERE id = $1 AND expires_at > NOW()`,
      [confirmationId]
    );

    if (result.rows.length === 0) return null;
    return mapRowToConfirmation(result.rows[0]);
  }

  async updateConfirmation(
    confirmationId: string,
    updates: {
      confirmed?: boolean;
      confirmedBy?: string;
      confirmedAt?: Date;
    }
  ): Promise<ConfirmationRequest | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.confirmed !== undefined) {
      setClauses.push(`confirmed = $${paramIdx++}`);
      values.push(updates.confirmed);
    }
    if (updates.confirmedBy !== undefined) {
      setClauses.push(`confirmed_by = $${paramIdx++}`);
      values.push(updates.confirmedBy);
    }
    if (updates.confirmedAt !== undefined) {
      setClauses.push(`confirmed_at = $${paramIdx++}`);
      values.push(updates.confirmedAt);
    }

    if (setClauses.length === 0) {
      return this.getConfirmation(confirmationId);
    }

    values.push(confirmationId);
    const sql = `
      UPDATE confirmation_requests
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING *`;

    const result = await query(sql, values);
    if (result.rows.length === 0) return null;
    return mapRowToConfirmation(result.rows[0]);
  }

  async getPendingConfirmationsBySession(
    sessionId: string
  ): Promise<ConfirmationRequest[]> {
    const result = await query(
      `SELECT * FROM confirmation_requests
       WHERE session_id = $1 AND NOT confirmed AND expires_at > NOW()
       ORDER BY proposed_at DESC`,
      [sessionId]
    );
    return result.rows.map(mapRowToConfirmation);
  }

  async deleteConfirmation(confirmationId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM confirmation_requests WHERE id = $1`,
      [confirmationId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async cleanupExpiredConfirmations(): Promise<number> {
    const result = await query(
      `DELETE FROM confirmation_requests WHERE expires_at <= NOW() AND NOT confirmed`
    );
    return result.rowCount ?? 0;
  }

  // ---- Agent Sessions ----

  /**
   * Upsert a session into the DB. authContext is intentionally excluded
   * (contains tokens — kept in-memory only).
   */
  async upsertSession(params: {
    sessionId: string;
    userId: string;
    tenantId: string;
    agentType: string;
    history: unknown[];
    pendingConfirmationId?: string;
    ttlMs: number;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + params.ttlMs);
    await query(
      `INSERT INTO agent_sessions
         (id, user_id, tenant_id, agent_type, conversation_history,
          pending_confirmation_id, last_activity_at, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), $7)
       ON CONFLICT (id) DO UPDATE SET
         conversation_history     = EXCLUDED.conversation_history,
         pending_confirmation_id  = EXCLUDED.pending_confirmation_id,
         last_activity_at         = NOW(),
         expires_at               = EXCLUDED.expires_at`,
      [
        params.sessionId,
        params.userId,
        params.tenantId,
        params.agentType,
        JSON.stringify(params.history),
        params.pendingConfirmationId ?? null,
        expiresAt,
      ]
    );
  }

  /** Load all non-expired sessions (for warm restart). */
  async loadActiveSessions(): Promise<Array<{
    sessionId: string;
    userId: string;
    tenantId: string;
    agentType: string;
    history: unknown[];
    pendingConfirmationId?: string;
    lastActivity: Date;
  }>> {
    const result = await query<Record<string, unknown>>(
      `SELECT id, user_id, tenant_id, agent_type, conversation_history,
              pending_confirmation_id, last_activity_at
       FROM agent_sessions
       WHERE expires_at > NOW()`
    );
    return result.rows.map((row) => ({
      sessionId: row.id as string,
      userId: row.user_id as string,
      tenantId: row.tenant_id as string,
      agentType: row.agent_type as string,
      history: Array.isArray(row.conversation_history)
        ? (row.conversation_history as unknown[])
        : [],
      pendingConfirmationId: (row.pending_confirmation_id as string) || undefined,
      lastActivity: new Date(row.last_activity_at as string),
    }));
  }

  /** Delete a single session. */
  async deleteSession(sessionId: string): Promise<void> {
    await query(`DELETE FROM agent_sessions WHERE id = $1`, [sessionId]);
  }

  /** Remove sessions whose expires_at has passed. Returns count deleted. */
  async pruneExpiredSessions(): Promise<number> {
    const result = await query(
      `DELETE FROM agent_sessions WHERE expires_at <= NOW()`
    );
    return result.rowCount ?? 0;
  }

  // ---- Tool Usage Analytics ----

  async recordToolUsage(params: {
    tenantId: string;
    toolName: string;
    agentType: AgentType;
    success: boolean;
    executionTimeMs: number;
  }): Promise<void> {
    await query(
      `INSERT INTO agent_tool_usage
         (tenant_id, tool_name, agent_type, execution_count, success_count,
          avg_execution_time_ms, last_used_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, $5, NOW(), NOW())
       ON CONFLICT (tenant_id, tool_name, agent_type)
       DO UPDATE SET
         execution_count = agent_tool_usage.execution_count + 1,
         success_count = agent_tool_usage.success_count + $4,
         avg_execution_time_ms = (
           agent_tool_usage.avg_execution_time_ms * agent_tool_usage.execution_count + $5
         ) / (agent_tool_usage.execution_count + 1),
         last_used_at = NOW(),
         updated_at = NOW()`,
      [
        params.tenantId,
        params.toolName,
        params.agentType,
        params.success ? 1 : 0,
        params.executionTimeMs,
      ]
    );
  }

  // ---- Lifecycle ----

  /** Gracefully close the pool. Call on shutdown. */
  async close(): Promise<void> {
    if (pool) {
      await pool.end();
      pool = null;
      initialized = false;
      logger.info('[DatabaseService] Pool closed');
    }
  }

  /** Health check - verifies the connection is alive. */
  async healthCheck(): Promise<boolean> {
    try {
      await query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapRowToAgentLog(row: Record<string, unknown>): AgentLog {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    sessionId: row.session_id as string,
    agentType: row.agent_type as AgentType,
    toolName: row.tool_name as string,
    inputParams:
      typeof row.input_params === 'string'
        ? JSON.parse(row.input_params)
        : (row.input_params as Record<string, unknown>),
    result:
      typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
    requiresConfirmation: row.requires_confirmation as boolean,
    confirmedBy: (row.confirmed_by as string) || undefined,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function mapRowToConfirmation(
  row: Record<string, unknown>
): ConfirmationRequest {
  const action: AgentAction = {
    agentType: row.action_agent_type as AgentType,
    toolName: row.action_tool_name as string,
    inputParams:
      typeof row.action_input_params === 'string'
        ? JSON.parse(row.action_input_params)
        : (row.action_input_params as Record<string, unknown>),
    requiresConfirmation: row.requires_confirmation as boolean,
    description: (row.action_description as string) || '',
  };

  return {
    id: row.id as string,
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    sessionId: row.session_id as string,
    action,
    proposedAt: new Date(row.proposed_at as string),
    expiresAt: new Date(row.expires_at as string),
    confirmed: row.confirmed as boolean,
    confirmedBy: (row.confirmed_by as string) || undefined,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Export singleton
// ---------------------------------------------------------------------------

export const databaseService = new DatabaseService();
