// Audit Log Service - logs all agent actions for traceability

import { v4 as uuidv4 } from 'uuid';
import { AgentLog, AgentType } from '../types/index';

// In-memory store - replace with PostgreSQL in production
class AuditLogService {
  private logs: AgentLog[] = [];

  /**
   * Log an agent action
   */
  logAction(
    userId: string,
    tenantId: string,
    sessionId: string,
    agentType: AgentType,
    toolName: string,
    inputParams: Record<string, unknown>,
    result: unknown,
    requiresConfirmation: boolean,
    confirmedBy?: string,
    confirmedAt?: Date
  ): AgentLog {
    const log: AgentLog = {
      id: uuidv4(),
      userId,
      tenantId,
      sessionId,
      agentType,
      toolName,
      inputParams,
      result,
      requiresConfirmation,
      confirmedBy,
      confirmedAt,
      createdAt: new Date(),
    };

    this.logs.push(log);
    return log;
  }

  /**
   * Get logs for a session
   */
  getBySession(sessionId: string): AgentLog[] {
    return this.logs.filter((l) => l.sessionId === sessionId);
  }

  /**
   * Get logs for a user
   */
  getByUser(userId: string): AgentLog[] {
    return this.logs.filter((l) => l.userId === userId);
  }

  /**
   * Get logs for a tenant
   */
  getByTenant(tenantId: string, limit = 100): AgentLog[] {
    return this.logs
      .filter((l) => l.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get logs by agent type
   */
  getByAgentType(tenantId: string, agentType: AgentType): AgentLog[] {
    return this.logs.filter(
      (l) => l.tenantId === tenantId && l.agentType === agentType
    );
  }

  /**
   * Get actions that required confirmation
   */
  getConfirmedActions(tenantId: string): AgentLog[] {
    return this.logs.filter(
      (l) =>
        l.tenantId === tenantId &&
        l.requiresConfirmation &&
        l.confirmedBy !== undefined
    );
  }

  /**
   * Get all logs (for admin/debugging)
   */
  getAll(): AgentLog[] {
    return [...this.logs];
  }

  /**
   * Clear all logs (for testing)
   */
  clearAll(): void {
    this.logs = [];
  }
}

export const auditLogService = new AuditLogService();
