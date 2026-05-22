// Express server with Agent API endpoints

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express, { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { AgentType } from './types/index';
import {
  processMessage,
  executeConfirmedAction,
  clearSession,
  getSessionHistory,
  getSessionPendingConfirmations,
  rejectConfirmation,
  getAuditLogs,
  shutdown,
} from './orchestrator';
import { databaseService } from './services/databaseService';
import { sessions } from './services/sessionStore';
import { getOllamaClient } from './services/ollamaClient';
import { realApiClient, runWithApiAuthContext } from './services/realApiClient';
import { parseUploadedFile, generateFileSummary } from './services/fileParser';
import { logger } from './utils/logger';
import { requireAuth } from './middleware/requireAuth';
import type { ApiAuthContext } from './services/realApiClient';

const app = express();
const PORT = process.env.PORT || 3000;
const AGENT_REQUEST_TIMEOUT_MS =
  Number(process.env.AGENT_REQUEST_TIMEOUT_MS) || 45000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }) as Promise<T>;
}

function normalizeMessage(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseEmail(input: string): string | null {
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim().toLowerCase() : null;
}

function parseDepartment(input: string): string | null {
  const match = input.match(/departamento\s+de\s+([^,.;]+)/i);
  return match ? match[1].trim() : null;
}

function parseCreateEmployeeFields(input: string): {
  fullName: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
} {
  const email = parseEmail(input);
  const department = parseDepartment(input);
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean);

  const hasCommandPrefix =
    parts.length > 0 &&
    /(^|\s)(dar|da|crear|crea)\b.*\bempleado\b/i.test(parts[0]);

  const emailPartIndex = parts.findIndex((p) => /@/.test(p));
  const normalizedParts = parts.map((p) =>
    p.replace(/^(nombre\s*:\s*)/i, '').replace(/\s+/g, ' ').trim()
  );

  let fullName: string | null = null;
  if (hasCommandPrefix && normalizedParts.length >= 2) {
    fullName = normalizedParts[1] || null;
  } else {
    const firstPart = (normalizedParts[0] || '')
      .replace(/^(puedes\s+)?(dar|da|crear|crea)\s+(de\s+alta\s+(a\s+)?)?(un\s+)?empleado[\s,:-]*/i, '')
      .replace(/^(dar\s+de\s+alta\s+(a\s+)?)?(un\s+)?empleado[\s,:-]*/i, '')
      .trim();
    fullName = firstPart || null;
  }

  if (!fullName && email && emailPartIndex > 0) {
    fullName = normalizedParts[emailPartIndex - 1] || null;
  }

  let position: string | null = null;
  if (emailPartIndex >= 0) {
    for (let i = emailPartIndex + 1; i < normalizedParts.length; i++) {
      const candidate = normalizedParts[i];
      if (!candidate || /^departamento\b/i.test(candidate)) {
        continue;
      }
      position = candidate;
      break;
    }
  }
  if (!position && normalizedParts.length >= 3) {
    const fallback = normalizedParts[2];
    if (fallback && !/^departamento\b/i.test(fallback) && !/@/.test(fallback)) {
      position = fallback;
    }
  }

  return { fullName, email, position, department };
}

function extractEmployees(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data as Array<Record<string, unknown>>;
  }
  if (!data || typeof data !== 'object') {
    return [];
  }
  const obj = data as Record<string, unknown>;
  const candidates = [obj.items, obj.results, obj.people, obj.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items as Array<Record<string, unknown>>;
      if (Array.isArray(nested.results)) return nested.results as Array<Record<string, unknown>>;
      if (Array.isArray(nested.people)) return nested.people as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function buildRequestAuthContext(req: Request): ApiAuthContext | null {
  const authorizationHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization.trim()
      : '';
  const cookieHeader =
    typeof req.headers.cookie === 'string'
      ? req.headers.cookie.trim()
      : '';

  if (!authorizationHeader && !cookieHeader) {
    return null;
  }

  const context: ApiAuthContext = {};
  if (authorizationHeader) {
    context.authorizationHeader = authorizationHeader;
  }
  if (cookieHeader) {
    context.cookieHeader = cookieHeader;
  }
  return context;
}

async function tryHandleHrFastPath(
  userId: string,
  message: string,
  sessionId: string,
  tenantId: string,
  authContext: ApiAuthContext | null
): Promise<Record<string, unknown> | null> {
  const normalized = normalizeMessage(message);
  const isListEmployees =
    normalized.includes('lista de empleados') ||
    normalized.includes('listar empleados') ||
    normalized.includes('dame empleados') ||
    normalized.includes('lista empleados');

  if (isListEmployees) {
    const result = await runWithApiAuthContext(
      authContext,
      async () => realApiClient.listEmployees(tenantId)
    );
    if (!result.success) {
      return {
        success: false,
        message: `No pude obtener la lista de empleados: ${result.error || 'error desconocido'}`,
        sessionId,
        timestamp: new Date(),
      };
    }
    const rows = extractEmployees(result.data);
    if (rows.length === 0) {
      return {
        success: true,
        message: 'No hay empleados registrados en este tenant.',
        sessionId,
        data: result.data,
        timestamp: new Date(),
      };
    }
    const preview = rows.slice(0, 20).map((row, idx) => {
      const name = String(row.full_name || row.name || row.nombre || `Empleado ${idx + 1}`);
      const email = row.email ? ` | ${String(row.email)}` : '';
      const position = row.position ? ` | ${String(row.position)}` : '';
      return `${idx + 1}. ${name}${email}${position}`;
    });
    return {
      success: true,
      message:
        `Empleados (${rows.length}):\n` +
        preview.join('\n') +
        (rows.length > 20 ? '\n... (mostrando solo los 20 primeros)' : ''),
      sessionId,
      data: result.data,
      timestamp: new Date(),
    };
  }

  const isCreateEmployeeIntent =
    normalized.includes('dar de alta') ||
    normalized.includes('da de alta') ||
    normalized.includes('crear empleado') ||
    normalized.includes('crea empleado');

  if (isCreateEmployeeIntent && normalized.includes('empleado')) {
    const parsed = parseCreateEmployeeFields(message);
    if (!parsed.fullName || !parsed.email) {
      return {
        success: true,
        message:
          'Para dar de alta al empleado necesito al menos: nombre completo y email. Ejemplo: "Dar de alta empleado, Jose Perez, jose@empresa.com, arquitecto, departamento de I+D".',
        sessionId,
        timestamp: new Date(),
      };
    }

    const positionParts = [parsed.position, parsed.department ? `Depto: ${parsed.department}` : null]
      .filter(Boolean)
      .join(' | ')
      .trim();
    const payload: Record<string, unknown> = {
      full_name: parsed.fullName,
      email: parsed.email,
    };
    if (positionParts) {
      payload.position = positionParts;
    }

    const result = await runWithApiAuthContext(
      authContext,
      async () => realApiClient.createEmployee(tenantId, payload)
    );
    if (!result.success) {
      return {
        success: false,
        message: `No pude crear el empleado: ${result.error || 'error desconocido'}`,
        sessionId,
        timestamp: new Date(),
      };
    }

    const data =
      (result.data && typeof result.data === 'object'
        ? ((result.data as Record<string, unknown>).data as Record<string, unknown> | undefined) ||
          (result.data as Record<string, unknown>)
        : undefined) || {};
    const employeeId = data.id || data.person_id || data.employee_id;

    return {
      success: true,
      message: `Empleado dado de alta correctamente: ${parsed.fullName}${employeeId ? ` (ID: ${String(employeeId)})` : ''}.`,
      sessionId,
      data: result.data,
      timestamp: new Date(),
    };
  }

  return null;
}

// Multer setup for file uploads (memory storage, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

// Middleware
app.use(express.json());

// CORS middleware
app.use((req: Request, res: Response, next: express.NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Tenant-Id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging middleware
const requestLogger = (req: Request, res: Response, next: express.NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
};
app.use(requestLogger);

// ============ ENDPOINTS ============

/**
 * POST /agent/chat
 * Main endpoint for agent interaction
 *
 * Body:
 * {
 *   userId: string,
 *   message: string,
 *   sessionId?: string,
 *   tenantId: string
 * }
 */
app.post('/agent/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId, message, tenantId, sessionId: providedSessionId } = req.body;
    const authContext = buildRequestAuthContext(req);
    logger.info('[POST /agent/chat] Auth context', {
      hasAuthorization: Boolean(authContext?.authorizationHeader),
      hasCookie: Boolean(authContext?.cookieHeader),
      origin: req.headers.origin || null,
      host: req.headers.host || null,
    });

    // Validation
    if (!userId || !message || !tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, message, tenantId',
      });
    }

    // Generate or use provided session ID
    const sessionId = providedSessionId || uuidv4();

    // Fast-path deterministic HR actions (avoids LLM timeouts for common Telegram flows)
    const fastPath = await tryHandleHrFastPath(
      userId,
      message,
      sessionId,
      tenantId,
      authContext
    );
    if (fastPath) {
      return res.json(fastPath);
    }

    // Process message through orchestrator
    const response = await withTimeout(
      processMessage(userId, message, sessionId, tenantId, authContext ?? undefined),
      AGENT_REQUEST_TIMEOUT_MS,
      `Agent request timed out after ${AGENT_REQUEST_TIMEOUT_MS}ms`
    );

    // Return response
    res.json(response);
  } catch (error) {
    logger.error('[POST /agent/chat] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out');
    const status = isTimeout ? 504 : 500;
    res.status(status).json({
      success: false,
      error: isTimeout ? 'Tiempo de respuesta agotado' : 'No se pudo procesar el mensaje',
      message: errorMessage,
    });
  }
});

/**
 * POST /agent/upload
 * Upload and parse CSV/Excel file
 *
 * Form data:
 * - file: multipart file (CSV or Excel)
 * - userId: string
 * - tenantId: string
 * - sessionId?: string
 * - message?: string (optional message to send with file)
 */
app.post('/agent/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { userId, tenantId, sessionId: providedSessionId, message } = req.body;
    const authContext = buildRequestAuthContext(req);

    // Validation
    if (!userId || !tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, tenantId',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    // Parse the file
    const parsed = await parseUploadedFile(req.file.buffer, req.file.originalname);
    const summary = generateFileSummary(parsed);

    // Generate session ID
    const sessionId = providedSessionId || uuidv4();

    // If a message was provided, process it with the file context
    let response;
    if (message) {
      const fullMessage = `${message}\n\n${summary}`;
      response = await withTimeout(
        processMessage(userId, fullMessage, sessionId, tenantId, authContext ?? undefined),
        AGENT_REQUEST_TIMEOUT_MS,
        `Agent request timed out after ${AGENT_REQUEST_TIMEOUT_MS}ms`
      );
    } else {
      // Just return the file summary for user to confirm
      response = {
        success: true,
        message: summary,
        sessionId,
        data: {
          fileType: parsed.fileType,
          rowCount: parsed.rowCount,
          columns: parsed.headers,
          preview: parsed.preview,
          parsedData: parsed.rows,
        },
      };
    }

    res.json(response);
  } catch (error) {
    logger.error('[POST /agent/upload] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out');
    res.status(isTimeout ? 504 : 400).json({
      success: false,
      error: isTimeout
        ? `Tiempo de respuesta agotado: ${errorMessage}`
        : `Error al procesar el archivo: ${errorMessage}`,
    });
  }
});

/**
 * POST /agent/confirm
 * Confirm a pending write operation
 *
 * Body:
 * {
 *   confirmationId: string,
 *   userId: string
 * }
 */
app.post('/agent/confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const { confirmationId, userId } = req.body;
    const authContext = buildRequestAuthContext(req);

    if (!confirmationId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: confirmationId, userId',
      });
    }

    // Get the confirmation from DB to verify user has access
    const confirmation = await databaseService.getConfirmation(confirmationId);
    if (!confirmation) {
      return res.status(404).json({
        success: false,
        error: 'La confirmación no existe o ha caducado',
      });
    }

    // Verify user matches
    if (confirmation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para confirmar esta acción',
      });
    }

    // Execute the confirmed action
    const result = await executeConfirmedAction(
      confirmationId,
      userId,
      authContext ?? undefined
    );

    if (result.success) {
      return res.json({
        success: true,
        message: 'Acción confirmada y ejecutada correctamente.',
        data: result.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.message || 'No se pudo ejecutar la acción confirmada',
      });
    }
  } catch (error) {
    logger.error('[POST /agent/confirm] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo confirmar la acción',
      message: String(error),
    });
  }
});

/**
 * POST /agent/reject
 * Reject/cancel a pending confirmation
 */
app.post('/agent/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const { confirmationId, userId } = req.body;

    if (!confirmationId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos obligatorios: confirmationId, userId',
      });
    }

    const confirmation = await databaseService.getConfirmation(confirmationId);
    if (!confirmation) {
      return res.status(404).json({
        success: false,
        error: 'La confirmación no existe o ya fue procesada',
      });
    }

    if (confirmation.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para cancelar esta acción',
      });
    }

    await rejectConfirmation(confirmationId);
    res.json({
      success: true,
      message: 'Acción cancelada correctamente.',
    });
  } catch (error) {
    logger.error('[POST /agent/reject] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo cancelar la confirmación',
    });
  }
});

/**
 * GET /agent/session/:sessionId/history
 * Get conversation history for a session
 */
app.get('/agent/session/:sessionId/history', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Falta el parámetro obligatorio: userId',
      });
    }

    const session = sessions.get(sessionId);
    if (session && session.userId !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permiso para acceder a esta sesión',
      });
    }

    const history = getSessionHistory(sessionId);
    res.json({
      success: true,
      sessionId,
      history,
    });
  } catch (error) {
    logger.error('[GET /agent/session] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo obtener el historial de la sesión',
    });
  }
});

/**
 * DELETE /agent/session/:sessionId
 * Clear conversation state for a session
 */
app.delete('/agent/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const cleared = clearSession(sessionId);
    res.json({
      success: true,
      sessionId,
      cleared,
    });
  } catch (error) {
    logger.error('[DELETE /agent/session] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo limpiar la sesión',
    });
  }
});

/**
 * GET /agent/session/:sessionId/confirmations
 * Get pending confirmations for a session
 */
app.get('/agent/session/:sessionId/confirmations', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const confirmations = await getSessionPendingConfirmations(sessionId);
    res.json({
      success: true,
      sessionId,
      confirmations,
    });
  } catch (error) {
    logger.error('[GET /agent/session/confirmations] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener las confirmaciones pendientes',
    });
  }
});

/**
 * GET /audit/logs
 * Get audit logs (filtered by tenant/user/agent type)
 *
 * Query parameters:
 * - tenantId: string (required)
 * - userId?: string
 * - sessionId?: string
 * - agentType?: string
 * - limit?: number (default: 100)
 */
app.get('/audit/logs', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId, sessionId, agentType, limit = 100 } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Falta el parámetro obligatorio: tenantId',
      });
    }

    const logs = await getAuditLogs({
      tenantId: tenantId as string,
      userId: userId as string | undefined,
      sessionId: sessionId as string | undefined,
      agentType: agentType as AgentType | undefined,
      limit: Number(limit) || 100,
    });

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    logger.error('[GET /audit/logs] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener los registros de auditoría',
    });
  }
});

/**
 * GET /audit/logs/confirmed
 * Get only confirmed (executed) write operations
 */
app.get('/audit/logs/confirmed', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Falta el parámetro obligatorio: tenantId',
      });
    }

    const logs = await getAuditLogs({
      tenantId: tenantId as string,
    });

    // Filter for confirmed actions
    const confirmedLogs = logs.filter(
      (l) => l.requiresConfirmation && l.confirmedBy !== undefined
    );

    res.json({
      success: true,
      count: confirmedLogs.length,
      logs: confirmedLogs,
    });
  } catch (error) {
    logger.error('[GET /audit/logs/confirmed] Error:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudieron obtener las acciones confirmadas',
    });
  }
});

/**
 * GET /health
 * Health check endpoint (includes DB status)
 */
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await databaseService.healthCheck();
  const llmProvider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

  let llmStatus: { available: boolean; model: string; error?: string } = {
    available: false,
    model: 'unknown',
  };

  if (llmProvider === 'ollama') {
    try {
      llmStatus = await getOllamaClient().healthCheck();
    } catch {
      llmStatus = { available: false, model: process.env.OLLAMA_MODEL || 'gemma4:e4b', error: 'Health check failed' };
    }
  } else {
    // For Anthropic, just check if the key is set
    llmStatus = {
      available: !!process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      error: process.env.ANTHROPIC_API_KEY ? undefined : 'ANTHROPIC_API_KEY not set',
    };
  }

  const allHealthy = dbHealthy && llmStatus.available;
  const status = allHealthy ? 'ok' : 'degraded';
  const httpStatus = allHealthy ? 200 : 503;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'unreachable',
    llm: {
      provider: llmProvider,
      model: llmStatus.model,
      available: llmStatus.available,
      error: llmStatus.error,
    },
  });
});

// ============ ERROR HANDLING ============

app.use((err: Error, req: Request, res: Response, _next: express.NextFunction) => {
  logger.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// ============ GRACEFUL SHUTDOWN ============

function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// ============ START SERVER ============

app.listen(PORT, () => {
  const llmProvider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const model = llmProvider === 'ollama'
    ? (process.env.OLLAMA_MODEL || 'gemma4:e4b')
    : (process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514');

  logger.info(`Agent System running on http://localhost:${PORT}`);
  logger.info(`LLM Provider: ${llmProvider} | Model: ${model}`);
  logger.info(`POST /agent/chat - Chat with agents`);
  logger.info(`POST /agent/confirm - Confirm actions`);
  logger.info(`POST /agent/reject - Reject confirmations`);
  logger.info(`GET  /audit/logs - View audit logs`);
  logger.info(`GET  /health - Health check`);
});
