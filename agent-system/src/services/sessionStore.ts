import { AgentType } from '../types/index';
import { OllamaMessage } from './ollamaClient';
import type { ApiAuthContext } from './realApiClient';
import { logger } from '../utils/logger';

const SESSION_TTL_MS =
  (Number(process.env.SESSION_TTL_MINUTES) || 30) * 60 * 1000;

export interface Session {
  history: OllamaMessage[];
  agentType: AgentType;
  lastActivity: Date;
  userId: string;
  tenantId?: string;
  pendingConfirmationId?: string;
  /** authContext contiene tokens — solo memoria, nunca persiste en BD */
  authContext?: ApiAuthContext;
}

// ---------------------------------------------------------------------------
// In-memory cache (fuente de verdad en runtime)
// ---------------------------------------------------------------------------

export const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// DB persistence — lazy import para evitar conexión en tests
// ---------------------------------------------------------------------------

function isDbEnabled(): boolean {
  return !!(process.env.DB_HOST && process.env.DB_NAME);
}

async function dbUpsert(sessionId: string, session: Session): Promise<void> {
  if (!isDbEnabled()) return;
  try {
    const { databaseService: db } = await import('./databaseService');
    await db.upsertSession({
      sessionId,
      userId: session.userId,
      tenantId: session.tenantId ?? '',
      agentType: session.agentType,
      history: session.history,
      pendingConfirmationId: session.pendingConfirmationId,
      ttlMs: SESSION_TTL_MS,
    });
  } catch (err) {
    logger.warn('[SessionStore] DB upsert failed (continuando con cache):', err);
  }
}

async function dbDelete(sessionId: string): Promise<void> {
  if (!isDbEnabled()) return;
  try {
    const { databaseService: db } = await import('./databaseService');
    await db.deleteSession(sessionId);
  } catch (err) {
    logger.warn('[SessionStore] DB delete failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Warm restart — carga sesiones activas desde BD al arrancar
// ---------------------------------------------------------------------------

let warmStartDone = false;

export async function restoreSessionsFromDb(): Promise<void> {
  if (warmStartDone || !isDbEnabled()) return;
  warmStartDone = true;
  try {
    const { databaseService: db } = await import('./databaseService');
    const rows = await db.loadActiveSessions();
    let restored = 0;
    for (const row of rows) {
      if (!sessions.has(row.sessionId)) {
        sessions.set(row.sessionId, {
          history: row.history as OllamaMessage[],
          agentType: row.agentType as AgentType,
          lastActivity: row.lastActivity,
          userId: row.userId,
          tenantId: row.tenantId,
          pendingConfirmationId: row.pendingConfirmationId,
          // authContext no se restaura (tokens expirados/sensibles)
        });
        restored++;
      }
    }
    logger.info(`[SessionStore] Restauradas ${restored} sesiones desde BD`);
  } catch (err) {
    logger.warn('[SessionStore] No se pudieron restaurar sesiones:', err);
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function getOrCreateSession(
  sessionId: string,
  agentType: AgentType,
  userId: string,
  tenantId?: string,
): Session {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastActivity = new Date();
    // Actualiza BD de forma asíncrona (no bloquea el request)
    void dbUpsert(sessionId, existing);
    return existing;
  }

  const session: Session = {
    history: [],
    agentType,
    lastActivity: new Date(),
    userId,
    tenantId,
  };
  sessions.set(sessionId, session);
  void dbUpsert(sessionId, session);
  return session;
}

export function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
      void dbDelete(id);
    }
  }

  // Limpia también expiradas en BD (pueden quedar por reinicios)
  if (isDbEnabled()) {
    import('./databaseService')
      .then(({ databaseService: db }) => db.pruneExpiredSessions())
      .catch((err) => logger.warn('[SessionStore] DB prune failed:', err));
  }
}

// ---------------------------------------------------------------------------
// Cleanup automático cada 5 min
// ---------------------------------------------------------------------------

setInterval(pruneExpiredSessions, 5 * 60 * 1000).unref();
