// Orchestrator - Main agentic loop for AI agent system
// Manages conversation flow, tool execution, and confirmation handling
// Supports both Ollama (local) and Anthropic (cloud) backends

import {
  AgentType,
  AgentAction,
  AgentResponse,
  ChatMessage,
  ClaudeToolDefinition,
  ToolResult,
} from './types/index';
import { toolsByAgent, executeTool, writeOperations } from './tools/toolDefinitions';
import { classifyIntent, getAgentSystemPrompt } from './agents/agentRouter';
import { databaseService } from './services/databaseService';
import { logger } from './utils/logger';
import {
  getOllamaClient,
  toOllamaTools,
  OllamaMessage,
  NormalizedContentBlock,
} from './services/ollamaClient';
import {
  Session,
  getOrCreateSession,
  sessions,
} from './services/sessionStore';
import {
  runWithApiAuthContext,
  type ApiAuthContext,
} from './services/realApiClient';

// ---------------------------------------------------------------------------
// Constants (configurable via env)
// ---------------------------------------------------------------------------

const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOOL_ROUNDS = Number(process.env.MAX_AGENT_LOOP_ROUNDS) || 15;
const CONFIRMATION_EXPIRY_MINUTES =
  Number(process.env.CONFIRMATION_EXPIRY_MINUTES) || 5;

// ---------------------------------------------------------------------------
// Anthropic client (optional fallback)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let anthropicClient: any = null;

async function getAnthropicClient(): Promise<any> {
  if (!anthropicClient) {
    try {
      // Dynamic import - only loads if @anthropic-ai/sdk is installed
      const mod = await import('@anthropic-ai/sdk');
      const Anthropic = mod.default;
      anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    } catch {
      throw new Error(
        'Anthropic SDK not available. Install @anthropic-ai/sdk or switch to LLM_PROVIDER=ollama'
      );
    }
  }
  return anthropicClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a tool name represents a write (mutating) operation. */
function isWriteOperation(toolName: string): boolean {
  return writeOperations.has(toolName);
}

/** Build a human-readable description for a proposed write action. */
function describeAction(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'create_contract_from_template':
      return `Crear contrato desde la plantilla "${input.templateId}" con los campos: ${JSON.stringify(input.variables)}`;
    case 'patch_budget_line':
      return `Actualizar presupuesto "${input.budgetId}" con los cambios: ${JSON.stringify(input.updates)}`;
    default:
      return `Ejecutar "${toolName}" con los parámetros: ${JSON.stringify(input)}`;
  }
}

/** Extract final text from normalized content blocks. */
function extractTextFromContent(
  content: NormalizedContentBlock[]
): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Convert internal session history to simplified ChatMessage[] for the response. */
function toPublicHistory(history: OllamaMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      if (msg.content && typeof msg.content === 'string' && msg.content.trim()) {
        out.push({ role: msg.role, content: msg.content });
      }
    }
  }
  return out;
}

/** Detect short explicit approval messages without matching arbitrary substrings. */
function isExplicitConfirmationMessage(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .trim()
    .replace(/[¡!¿?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ');

  const confirmationPhrases = new Set([
    'si',
    'sí',
    'yes',
    'ok',
    'okay',
    'de acuerdo',
    'confirmar',
    'confirma',
    'adelante',
    'hazlo',
    'ejecuta',
    'procede',
    'acepto',
    'aprobado',
  ]);

  return confirmationPhrases.has(normalized);
}

function normalizeDateInput(raw: string): string | null {
  const value = raw.trim();
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return value;
  const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dmyMatch) return null;
  const day = Number(dmyMatch[1]);
  const month = Number(dmyMatch[2]);
  const year = Number(dmyMatch[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseProjectPayloadFromText(message: string): Record<string, unknown> | null {
  const source = message.trim();
  if (!source) return null;

  // Matches: "proyecto ECONOVA" OR "**Nombre del Proyecto**: ECONOVA" OR "Nombre: ECONOVA"
  const nameMatch =
    source.match(/proyecto\s+([A-Za-z0-9._+\-\s]{2,})/i) ||
    source.match(/\*{0,2}nombre(?:\s+del\s+proyecto)?\*{0,2}\s*[:\-]\s*\*{0,2}([A-Za-z0-9._+\-\s]{2,})\*{0,2}/i);
  const startMatch = source.match(/(?:fecha\s*(?:de\s*)?inicio|inicio|start_date)\s*[:\-*\s]\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  const endMatch = source.match(/(?:fecha\s*(?:de\s*)?fin(?:alizacion)?|fechafin|fin|end_date)\s*[:\-*\s]\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);

  const name = nameMatch?.[1]
    ?.split(/[,\n*]/)[0]
    ?.trim()
    ?.replace(/^["']|["']$/g, '');
  if (!name) return null;

  const payload: Record<string, unknown> = { name };
  if (startMatch?.[1]) {
    const normalizedStart = normalizeDateInput(startMatch[1]);
    if (normalizedStart) payload.start_date = normalizedStart;
  }
  if (endMatch?.[1]) {
    const normalizedEnd = normalizeDateInput(endMatch[1]);
    if (normalizedEnd) payload.end_date = normalizedEnd;
  }

  return payload;
}

async function tryRecoverAndExecuteProjectConfirmation(
  session: Session,
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<AgentResponse | null> {
  // Search both user and assistant messages for project data (newest first).
  // The assistant often echoes the project details clearly when asking for confirmation.
  for (let i = session.history.length - 1; i >= 0; i--) {
    const msg = session.history[i];
    if (!msg.content) continue;
    // Skip the "si/yes" confirmation message itself
    if (msg.role === 'user' && isExplicitConfirmationMessage(msg.content)) continue;

    const payload = parseProjectPayloadFromText(msg.content);
    if (!payload) continue;

    const result = await executeTool('create_project', payload, tenantId, userId);
    session.history.push({
      role: 'user',
      content: `[System] Recovery confirmation executed create_project with params: ${JSON.stringify(payload)}. Result: ${JSON.stringify(result)}`,
    });

    return {
      success: result.success,
      message: result.success
        ? `Proyecto "${String(payload.name)}" creado correctamente.`
        : `No pude crear el proyecto: ${result.error || 'error desconocido'}`,
      agentType: 'projects',
      data: result.data,
      confirmationRequired: false,
      conversationHistory: toPublicHistory(session.history),
      sessionId,
      timestamp: new Date(),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared tool-block handler
// ---------------------------------------------------------------------------

type LoopResult = {
  pendingConfirmation: { id: string; action: AgentAction } | null;
  collectedData: unknown;
  finalText: string;
  exhausted: boolean;
};

/**
 * Process a single tool-use block from the LLM response.
 * Handles both write operations (confirmation flow) and read operations (immediate execution).
 *
 * @param pushToolResult - Provider-specific callback to record the tool result.
 *   Ollama: pushes directly to session.history.
 *   Anthropic: pushes to a local toolResults array that is later fed back as a user message.
 */
async function processToolBlock(
  toolBlock: Extract<NormalizedContentBlock, { type: 'tool_use' }>,
  session: Session,
  sessionId: string,
  userId: string,
  tenantId: string,
  agentType: AgentType,
  assistantText: string,
  collectedData: unknown,
  pushToolResult: (toolId: string, content: string) => void
): Promise<{ shouldReturn: true; result: LoopResult } | { shouldReturn: false; collectedData: unknown }> {
  const toolName = toolBlock.name;
  const toolInput = toolBlock.input;

  if (isWriteOperation(toolName)) {
    if (session.pendingConfirmationId) {
      logger.info(
        `[Orchestrator] Session ${sessionId} already has pending confirmation ${session.pendingConfirmationId}; reusing instead of creating another one.`
      );
      return {
        shouldReturn: true,
        result: {
          pendingConfirmation: {
            id: session.pendingConfirmationId,
            action: {
              agentType,
              toolName,
              inputParams: toolInput,
              requiresConfirmation: true,
              description: describeAction(toolName, toolInput),
            },
          },
          collectedData,
          finalText:
            assistantText ||
            'Ya hay una acción pendiente de confirmación. Por favor, confírmala o cancélala antes de continuar.',
          exhausted: false,
        },
      };
    }

    const action: AgentAction = {
      agentType,
      toolName,
      inputParams: toolInput,
      requiresConfirmation: true,
      description: describeAction(toolName, toolInput),
    };

    let confirmationId: string;
    try {
      const confirmation = await databaseService.createConfirmation({
        userId,
        tenantId,
        sessionId,
        action,
        expirationMinutes: CONFIRMATION_EXPIRY_MINUTES,
      });
      confirmationId = confirmation.id;
    } catch (dbErr) {
      logger.error(
        '[Orchestrator] Cannot create confirmation for write action (DB unavailable):',
        dbErr
      );
      return {
        shouldReturn: true,
        result: {
          pendingConfirmation: null,
          collectedData,
          finalText:
            'No es posible registrar la operación en este momento porque la base de datos no está disponible. Por favor, inténtalo de nuevo en unos instantes.',
          exhausted: false,
        },
      };
    }

    const pendingConfirmation = { id: confirmationId, action };
    session.pendingConfirmationId = confirmationId;
    const confirmationPrompt =
      `Para ejecutar esta acción se requiere tu confirmación. ` +
      `ID de confirmación: ${confirmationId}. ` +
      `Responde "sí" para confirmar o "no" para cancelar.`;
    session.history.push({
      role: 'assistant',
      content: confirmationPrompt,
    });

    await databaseService
      .logAgentAction({
        userId,
        tenantId,
        sessionId,
        agentType,
        toolName,
        inputParams: toolInput,
        result: { confirmationId, status: 'pending_confirmation' },
        requiresConfirmation: true,
      })
      .catch((err) => {
        logger.warn('[Orchestrator] Failed to log pending confirmation:', err);
      });

    const toolResultContent = JSON.stringify({
      success: true,
      pending_confirmation: true,
      confirmation_id: confirmationId,
      message: `This write operation requires user confirmation before execution. Confirmation ID: ${confirmationId}. Please inform the user what will happen and that they need to confirm.`,
    });

    pushToolResult(toolBlock.id, toolResultContent);

    return {
      shouldReturn: true,
      result: {
        pendingConfirmation,
        collectedData,
        finalText: assistantText || confirmationPrompt,
        exhausted: false,
      },
    };
  } else {
    // Read operation — execute immediately
    const startMs = Date.now();
    const result: ToolResult = await executeTool(toolName, toolInput, tenantId, userId);
    const elapsedMs = Date.now() - startMs;

    await databaseService
      .logAgentAction({
        userId,
        tenantId,
        sessionId,
        agentType,
        toolName,
        inputParams: toolInput,
        result,
        requiresConfirmation: false,
      })
      .catch((err) => {
        logger.warn('[Orchestrator] Failed to log read action:', err);
      });

    await databaseService
      .recordToolUsage({
        tenantId,
        toolName,
        agentType,
        success: result.success,
        executionTimeMs: elapsedMs,
      })
      .catch((err) => {
        logger.warn('[Orchestrator] Failed to record tool usage:', err);
      });

    pushToolResult(toolBlock.id, JSON.stringify(result));

    return {
      shouldReturn: false,
      collectedData: result.success ? result.data : collectedData,
    };
  }
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

let dbInitPromise: Promise<void> | null = null;

/** Ensure the database schema is ready. Called once, lazily. */
async function ensureDbReady(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = databaseService.initialize().catch((err) => {
      // Allow retry on next call
      dbInitPromise = null;
      logger.error('[Orchestrator] Database initialisation failed:', err);
      throw err;
    });
  }
  return dbInitPromise;
}

// ---------------------------------------------------------------------------
// Ollama-based agentic loop
// ---------------------------------------------------------------------------

async function processWithOllama(
  session: Session,
  systemPrompt: string,
  tools: ClaudeToolDefinition[],
  agentType: AgentType,
  userId: string,
  tenantId: string,
  sessionId: string
): Promise<LoopResult> {
  const client = getOllamaClient();
  const ollamaTools = toOllamaTools(tools);

  let roundsUsed = 0;
  let pendingConfirmation: { id: string; action: AgentAction } | null = null;
  let collectedData: unknown = undefined;

  // Verify Ollama is available before entering the loop
  const health = await client.healthCheck();
  if (!health.available) {
    throw new Error(
      `Ollama is not available: ${health.error}. ` +
        `Make sure Ollama is running (ollama serve) and the model is pulled (ollama pull ${OLLAMA_MODEL}).`
    );
  }
  if (health.error) {
    // Model not found but Ollama is running
    logger.warn(`[Orchestrator] Ollama warning: ${health.error}`);
  }

  while (roundsUsed < MAX_TOOL_ROUNDS) {
    roundsUsed++;

    const response = await client.chat({
      model: OLLAMA_MODEL,
      system: systemPrompt,
      messages: session.history,
      tools: ollamaTools,
      temperature: 0.1,
    });

    // Append assistant message to history
    const assistantText = extractTextFromContent(response.content);
    const toolUseBlocks = response.content.filter(
      (b): b is Extract<NormalizedContentBlock, { type: 'tool_use' }> =>
        b.type === 'tool_use'
    );

    // Build the assistant message for history
    if (toolUseBlocks.length > 0) {
      // Store assistant message with tool_calls for context
      const assistantMsg: OllamaMessage = {
        role: 'assistant',
        content: assistantText || '',
        tool_calls: toolUseBlocks.map((tb) => ({
          id: tb.id,
          type: 'function' as const,
          function: {
            name: tb.name,
            arguments: tb.input,
          },
        })),
      };
      session.history.push(assistantMsg);
    } else {
      session.history.push({
        role: 'assistant',
        content: assistantText,
      });
    }

    // If done (no tool use), return final answer
    if (response.stop_reason === 'end_turn') {
      return {
        pendingConfirmation,
        collectedData,
        finalText: assistantText,
        exhausted: false,
      };
    }

    // Handle tool_use blocks
    if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
      for (const toolBlock of toolUseBlocks) {
        const handled = await processToolBlock(
          toolBlock,
          session,
          sessionId,
          userId,
          tenantId,
          agentType,
          assistantText,
          collectedData,
          (toolId, content) => {
            session.history.push({ role: 'tool', content, tool_call_id: toolId });
          }
        );

        if (handled.shouldReturn) {
          return handled.result;
        }
        collectedData = handled.collectedData;
      }

      // Continue the loop so the model can process tool results
      continue;
    }

    // Unknown stop reason -- break to avoid infinite loop
    break;
  }

  // Exhausted rounds
  const lastAssistant = session.history
    .filter((m) => m.role === 'assistant')
    .pop();

  return {
    pendingConfirmation,
    collectedData,
    finalText:
      lastAssistant?.content ||
      'The agent could not complete the request within the allowed number of steps.',
    exhausted: true,
  };
}

// ---------------------------------------------------------------------------
// Anthropic-based agentic loop (fallback)
// ---------------------------------------------------------------------------

async function processWithAnthropic(
  session: Session,
  systemPrompt: string,
  tools: ClaudeToolDefinition[],
  agentType: AgentType,
  userId: string,
  tenantId: string,
  sessionId: string
): Promise<LoopResult> {
  const client = await getAnthropicClient();

  // Convert tools to Anthropic format
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as { type: 'object'; properties: Record<string, unknown>; required: string[] },
  }));

  // Convert OllamaMessage[] to Anthropic MessageParam[]
  // (Anthropic uses a different message format)
  const anthropicMessages = session.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  let roundsUsed = 0;
  let pendingConfirmation: { id: string; action: AgentAction } | null = null;
  let collectedData: unknown = undefined;

  while (roundsUsed < MAX_TOOL_ROUNDS) {
    roundsUsed++;

    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    // Convert Anthropic response to normalized format
    const normalizedContent: NormalizedContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        normalizedContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        normalizedContent.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // Append assistant response to both tracking arrays
    const assistantText = extractTextFromContent(normalizedContent);
    session.history.push({ role: 'assistant', content: assistantText || '' });
    anthropicMessages.push({ role: 'assistant', content: response.content as any });

    if (response.stop_reason === 'end_turn') {
      return {
        pendingConfirmation,
        collectedData,
        finalText: assistantText,
        exhausted: false,
      };
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = normalizedContent.filter(
        (b): b is Extract<NormalizedContentBlock, { type: 'tool_use' }> =>
          b.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) break;

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

      for (const toolBlock of toolUseBlocks) {
        const handled = await processToolBlock(
          toolBlock,
          session,
          sessionId,
          userId,
          tenantId,
          agentType,
          assistantText,
          collectedData,
          (toolId, content) => {
            toolResults.push({ type: 'tool_result', tool_use_id: toolId, content });
          }
        );

        if (handled.shouldReturn) {
          return handled.result;
        }
        collectedData = handled.collectedData;
      }

      // Feed results back (Anthropic convention: tool results as user message)
      anthropicMessages.push({ role: 'user', content: toolResults as any });
      // Also update session history for public history
      for (const tr of toolResults) {
        session.history.push({ role: 'tool', content: tr.content, tool_call_id: tr.tool_use_id });
      }

      continue;
    }

    break;
  }

  const lastAssistant = session.history
    .filter((m) => m.role === 'assistant')
    .pop();

  return {
    pendingConfirmation,
    collectedData,
    finalText:
      lastAssistant?.content ||
      'The agent could not complete the request within the allowed number of steps.',
    exhausted: true,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Process an incoming user message through the full agentic loop.
 *
 * 1. Classify intent -> pick agent
 * 2. Build system prompt + tool set
 * 3. Call LLM in a loop, executing tools until it produces a final answer
 * 4. Intercept write operations -> create confirmation requests (persisted to DB)
 * 5. Log everything via databaseService
 */
export async function processMessage(
  userId: string,
  message: string,
  sessionId: string,
  tenantId: string,
  authContext?: ApiAuthContext
): Promise<AgentResponse> {
  const timestamp = new Date();

  try {
    // Ensure DB is initialised (no-op after first success)
    // Non-critical: if DB fails, chat still works
    try {
      await ensureDbReady();
    } catch (dbErr) {
      logger.warn('[Orchestrator] Database not available, continuing without audit logging:', dbErr);
    }

    // ---- 0. Check for natural language confirmation ----
    // If user says "si", "yes", "ok", "confirmar", etc., auto-confirm pending actions
    const isConfirmation = isExplicitConfirmationMessage(message);

    logger.info(`[Orchestrator] Message: "${message}" | isConfirmation: ${isConfirmation}`);

    if (isConfirmation) {
      // Get current session (will be created if not exists)
      const tempSession = sessions.get(sessionId);

      // Check if there's a pending confirmation in the session
      if (tempSession?.pendingConfirmationId) {
        if (authContext) {
          tempSession.authContext = authContext;
        }
        const confirmationId = tempSession.pendingConfirmationId;
        logger.info(`[Orchestrator] Auto-confirming action: ${confirmationId}`);

        try {
          // Execute the confirmed action
          const result = await executeConfirmedAction(
            confirmationId,
            userId,
            tempSession.authContext
          );
          logger.info(`[Orchestrator] Confirmation result: ${result.success}`);

          // Clear the pending confirmation
          tempSession.pendingConfirmationId = undefined;

          return result;
        } catch (err) {
          logger.error('[Orchestrator] Error executing confirmed action:', err);
          // Fall through to normal processing
        }
      } else {
        logger.info(`[Orchestrator] No pending confirmation found in session for: ${sessionId}`);
        if (tempSession) {
          const recovered = await runWithApiAuthContext(
            tempSession.authContext,
            async () => tryRecoverAndExecuteProjectConfirmation(tempSession, sessionId, userId, tenantId)
          );
          if (recovered) {
            return recovered;
          }
        }
        return {
          success: false,
          message: 'No hay ninguna acción pendiente de confirmación. Vuelve a solicitar la operación y confirma cuando se te indique.',
          sessionId,
          timestamp: new Date(),
        };
      }
    }

    // ---- 1. Intent classification ----
    const existingSession = sessions.get(sessionId);
    const classifiedAgentType = classifyIntent(message);
    const agentType =
      existingSession &&
      existingSession.agentType !== 'analysis' &&
      classifiedAgentType === 'analysis'
        ? existingSession.agentType
        : classifiedAgentType;
    const session = getOrCreateSession(sessionId, agentType, userId);
    if (authContext) {
      session.authContext = authContext;
    }

    // If the agent type changed mid-session, update it
    session.agentType = agentType;

    const systemPrompt = getAgentSystemPrompt(agentType);
    const tools = toolsByAgent[agentType];

    // ---- 2. Append user message to history ----
    session.history.push({
      role: 'user',
      content: message,
    });

    // ---- 3. Agentic loop (provider-dependent) ----
    logger.info(
      `[Orchestrator] Processing message with provider: ${LLM_PROVIDER} | agent: ${agentType}`
    );

    let loopResult: {
      pendingConfirmation: { id: string; action: AgentAction } | null;
      collectedData: unknown;
      finalText: string;
      exhausted: boolean;
    };

    loopResult = await runWithApiAuthContext(
      session.authContext,
      async () => {
        if (LLM_PROVIDER === 'anthropic') {
          return processWithAnthropic(
            session,
            systemPrompt,
            tools,
            agentType,
            userId,
            tenantId,
            sessionId
          );
        }
        // Default: Ollama (local)
        return processWithOllama(
          session,
          systemPrompt,
          tools,
          agentType,
          userId,
          tenantId,
          sessionId
        );
      }
    );

    return {
      success: true,
      message: loopResult.finalText,
      agentType,
      confirmationRequired: loopResult.pendingConfirmation !== null,
      confirmationId: loopResult.pendingConfirmation?.id,
      action: loopResult.pendingConfirmation?.action,
      data: loopResult.collectedData,
      conversationHistory: toPublicHistory(session.history),
      sessionId,
      timestamp,
    };
  } catch (error) {
    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    const errMessage = rawErrorMessage && rawErrorMessage.trim().length > 0
      ? rawErrorMessage
      : error instanceof Error && error.name
        ? error.name
        : 'Unknown backend error';

    logger.error(
      `[Orchestrator] Error processing message for session ${sessionId}: ${errMessage}`,
      error
    );
    console.error('[Orchestrator Full Error]', error);

    // Log the error to DB (best effort)
    try {
      await databaseService.logAgentAction({
        userId,
        tenantId,
        sessionId,
        agentType: 'analysis', // fallback agent type for error logging
        toolName: 'orchestrator_error',
        inputParams: { message },
        result: { error: errMessage },
        requiresConfirmation: false,
      });
    } catch (logErr) {
      logger.warn('[Orchestrator] Failed to log error to DB:', logErr);
    }

    return {
      success: false,
      message: `Se ha producido un error al procesar tu solicitud: ${errMessage}`,
      sessionId,
      timestamp: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Confirmation execution
// ---------------------------------------------------------------------------

/**
 * Execute a previously confirmed write operation.
 *
 * Called after the user approves a pending confirmation. Retrieves the
 * confirmation from DB, validates it, executes the tool, and logs the result.
 */
export async function executeConfirmedAction(
  confirmationId: string,
  confirmedBy: string,
  authContext?: ApiAuthContext
): Promise<AgentResponse> {
  const timestamp = new Date();

  try {
    await ensureDbReady();

    const confirmation = await databaseService.getConfirmation(confirmationId);
    if (!confirmation) {
      return {
        success: false,
        message: 'La confirmación no existe o ha caducado.',
        sessionId: '',
        timestamp,
      };
    }

    if (confirmation.confirmed) {
      return {
        success: false,
        message: 'Esta acción ya fue confirmada anteriormente.',
        sessionId: confirmation.sessionId,
        timestamp,
      };
    }

    // Mark as confirmed in DB
    const updated = await databaseService.updateConfirmation(confirmationId, {
      confirmed: true,
      confirmedBy,
      confirmedAt: new Date(),
    });

    if (!updated) {
      return {
        success: false,
        message: 'No fue posible confirmar la acción. Es posible que ya haya sido procesada o haya caducado.',
        sessionId: confirmation.sessionId,
        timestamp,
      };
    }

    const { action } = confirmation;

    const session = sessions.get(confirmation.sessionId);
    if (authContext && session) {
      session.authContext = authContext;
    }
    const effectiveAuthContext = authContext ?? session?.authContext;

    // Execute the tool
    const startMs = Date.now();
    const result = await runWithApiAuthContext(
      effectiveAuthContext,
      async () => executeTool(
        action.toolName,
        action.inputParams,
        confirmation.tenantId,
        confirmation.userId
      )
    );
    const elapsedMs = Date.now() - startMs;

    // Log the confirmed execution
    await databaseService.logAgentAction({
      userId: confirmation.userId,
      tenantId: confirmation.tenantId,
      sessionId: confirmation.sessionId,
      agentType: action.agentType,
      toolName: action.toolName,
      inputParams: action.inputParams,
      result,
      requiresConfirmation: true,
      confirmedBy,
      confirmedAt: new Date(),
    });

    // Record tool usage
    await databaseService.recordToolUsage({
      tenantId: confirmation.tenantId,
      toolName: action.toolName,
      agentType: action.agentType,
      success: result.success,
      executionTimeMs: elapsedMs,
    }).catch((err) => {
      logger.warn('[Orchestrator] Failed to record tool usage:', err);
    });

    // Update session history with the execution result
    if (session) {
      session.history.push({
        role: 'user',
        content: `[System] The user confirmed the action (${action.description}). Result: ${JSON.stringify(result)}`,
      });
    }

    return {
      success: result.success,
      message: result.success
        ? `Acción ejecutada correctamente: ${action.description}`
        : `La acción no se pudo completar: ${result.error || 'Error desconocido'}`,
      agentType: action.agentType,
      action,
      data: result.data,
      confirmationRequired: false,
      confirmationId,
      conversationHistory: session
        ? toPublicHistory(session.history)
        : undefined,
      sessionId: confirmation.sessionId,
      timestamp,
    };
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : String(error);

    logger.error(`[Orchestrator] Failed to execute confirmed action: ${errMessage}`);

    return {
      success: false,
      message: `No fue posible ejecutar la acción confirmada: ${errMessage}`,
      sessionId: '',
      timestamp,
    };
  }
}

// ---------------------------------------------------------------------------
// Session management utilities
// ---------------------------------------------------------------------------

/** Clear conversation history for a session. */
export function clearSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/** Get current conversation history for a session. */
export function getSessionHistory(sessionId: string): ChatMessage[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  return toPublicHistory(session.history);
}

/** Get the agent type currently assigned to a session. */
export function getSessionAgentType(sessionId: string): AgentType | null {
  const session = sessions.get(sessionId);
  return session?.agentType ?? null;
}

/** Get pending confirmations for a session (from DB). */
export async function getSessionPendingConfirmations(sessionId: string) {
  await ensureDbReady();
  return databaseService.getPendingConfirmationsBySession(sessionId);
}

/** Reject a pending confirmation (delete from DB). */
export async function rejectConfirmation(confirmationId: string): Promise<boolean> {
  await ensureDbReady();
  return databaseService.deleteConfirmation(confirmationId);
}

/** Get audit logs from DB. */
export async function getAuditLogs(filters: {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  agentType?: AgentType;
  limit?: number;
}) {
  await ensureDbReady();
  return databaseService.getAgentLogs(filters);
}

/** Graceful shutdown - close DB pool. */
export async function shutdown(): Promise<void> {
  await databaseService.close();
  logger.info('[Orchestrator] Shutdown complete');
}
