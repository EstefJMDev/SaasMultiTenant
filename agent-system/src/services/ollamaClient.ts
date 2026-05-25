// Ollama Client - Local LLM integration via Ollama API
// Replaces Anthropic Claude API with local model execution
// No external API calls - everything runs locally

import { ClaudeToolDefinition, ToolResult } from '../types/index';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';
const OLLAMA_REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120_000;
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 8192;
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE) || 0.1;

// ---------------------------------------------------------------------------
// Types - mirror Anthropic SDK shapes for compatibility
// ---------------------------------------------------------------------------

/** Message format for Ollama chat API */
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

/** Tool call as returned by Ollama */
export interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/** Ollama tool definition (OpenAI-compatible format) */
export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/** Raw response from Ollama /api/chat */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Normalized response matching Anthropic SDK shape */
export interface NormalizedResponse {
  content: NormalizedContentBlock[];
  stop_reason: 'end_turn' | 'tool_use';
}

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

/** Tool result to feed back into conversation */
export interface NormalizedToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let toolCallCounter = 0;

function generateToolCallId(): string {
  toolCallCounter++;
  return `toolu_ollama_${Date.now()}_${toolCallCounter}`;
}

/** Convert our ClaudeToolDefinition[] to Ollama's OpenAI-compatible format */
export function toOllamaTools(tools: ClaudeToolDefinition[]): OllamaTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: t.input_schema.type,
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    },
  }));
}

/** Parse tool call arguments - handles both string and object forms */
function parseToolArguments(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      logger.warn('[OllamaClient] Failed to parse tool arguments string:', args);
      return {};
    }
  }
  if (typeof args === 'object' && args !== null) {
    return args as Record<string, unknown>;
  }
  return {};
}

/**
 * Some local models embed tool calls as JSON in the text content
 * instead of using the structured tool_calls field.
 * This function attempts to extract them.
 */
function extractToolCallsFromText(
  text: string,
  availableTools: OllamaTool[]
): OllamaToolCall[] | null {
  const toolNames = new Set(availableTools.map((t) => t.function.name));

  // Pattern 1: {"name": "tool_name", "arguments": {...}}
  const jsonPattern = /\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
  const matches: OllamaToolCall[] = [];

  let match;
  while ((match = jsonPattern.exec(text)) !== null) {
    const name = match[1];
    if (toolNames.has(name)) {
      try {
        const args = JSON.parse(match[2]);
        matches.push({
          id: generateToolCallId(),
          type: 'function',
          function: { name, arguments: args },
        });
      } catch {
        // ignore parse errors
      }
    }
  }

  // Pattern 2: <tool_call> blocks (some models use XML-like tags)
  const xmlPattern = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  while ((match = xmlPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && toolNames.has(parsed.name)) {
        matches.push({
          id: generateToolCallId(),
          type: 'function',
          function: {
            name: parsed.name,
            arguments: parseToolArguments(parsed.arguments || parsed.parameters || {}),
          },
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  return matches.length > 0 ? matches : null;
}

// ---------------------------------------------------------------------------
// OllamaClient class
// ---------------------------------------------------------------------------

class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || OLLAMA_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Check if Ollama is running and the configured model is available.
   */
  async healthCheck(): Promise<{ available: boolean; model: string; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          available: false,
          model: OLLAMA_MODEL,
          error: `Ollama returned HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const modelNames = models.map((m) => m.name);

      // Check if model is available (partial match for tag variants)
      const modelBase = OLLAMA_MODEL.split(':')[0];
      const modelAvailable = modelNames.some(
        (name) => name === OLLAMA_MODEL || name.startsWith(`${modelBase}:`)
      );

      if (!modelAvailable) {
        return {
          available: true,
          model: OLLAMA_MODEL,
          error: `Model "${OLLAMA_MODEL}" not found. Available: ${modelNames.join(', ')}. Run: ollama pull ${OLLAMA_MODEL}`,
        };
      }

      return { available: true, model: OLLAMA_MODEL };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        model: OLLAMA_MODEL,
        error: `Cannot connect to Ollama at ${this.baseUrl}: ${errMsg}`,
      };
    }
  }

  /**
   * Send a chat completion request to Ollama.
   *
   * Accepts messages in our normalized format and returns a normalized
   * response that mirrors the Anthropic SDK shape used by the orchestrator.
   */
  async chat(params: {
    model?: string;
    system: string;
    messages: OllamaMessage[];
    tools?: OllamaTool[];
    temperature?: number;
  }): Promise<NormalizedResponse> {
    const model = params.model || OLLAMA_MODEL;

    // Build the messages array with system prompt as first message
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: params.system },
      ...params.messages,
    ];

    const requestBody: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_ctx: OLLAMA_NUM_CTX,
        temperature: params.temperature ?? OLLAMA_TEMPERATURE,
      },
    };

    // Only include tools if provided and non-empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    logger.debug(
      `[OllamaClient] Sending chat request to ${model} with ${params.messages.length} messages` +
        (params.tools ? ` and ${params.tools.length} tools` : '')
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_REQUEST_TIMEOUT_MS);

    try {
      const startMs = Date.now();

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const elapsedMs = Date.now() - startMs;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (HTTP ${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as OllamaChatResponse;

      logger.debug(
        `[OllamaClient] Response received in ${elapsedMs}ms` +
          (data.eval_count ? ` (${data.eval_count} tokens)` : '')
      );

      // Log token stats if available
      if (data.eval_count) {
        logger.info(
          `[OllamaClient] Model: ${model} | Tokens: ${data.eval_count} | Time: ${elapsedMs}ms`
        );
      }

      return this.normalizeResponse(data, params.tools || []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          `Ollama request timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms. ` +
            `The model may be loading or the request is too complex. ` +
            `Try increasing OLLAMA_TIMEOUT_MS or reducing context size.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalize Ollama's response into our standard format.
   */
  private normalizeResponse(
    data: OllamaChatResponse,
    availableTools: OllamaTool[]
  ): NormalizedResponse {
    const content: NormalizedContentBlock[] = [];
    const messageContent = data.message.content || '';
    const toolCalls = data.message.tool_calls;

    // Check for structured tool calls first
    if (toolCalls && toolCalls.length > 0) {
      // If there is text content alongside tool calls, include it
      if (messageContent.trim()) {
        content.push({ type: 'text', text: messageContent.trim() });
      }

      for (const tc of toolCalls) {
        const id = tc.id || generateToolCallId();
        content.push({
          type: 'tool_use',
          id,
          name: tc.function.name,
          input: parseToolArguments(tc.function.arguments),
        });
      }

      return { content, stop_reason: 'tool_use' };
    }

    // Fallback: try to extract tool calls from text content
    if (messageContent && availableTools.length > 0) {
      const extractedCalls = extractToolCallsFromText(messageContent, availableTools);

      if (extractedCalls && extractedCalls.length > 0) {
        logger.info(
          `[OllamaClient] Extracted ${extractedCalls.length} tool call(s) from text response`
        );

        // Remove the JSON/XML tool call text from the displayed content
        let cleanedText = messageContent
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
          .replace(/\{[\s\S]*?"name"\s*:[\s\S]*?"arguments"\s*:[\s\S]*?\}/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .trim();

        // Drop dangling syntax artifacts like "}" or leftover punctuation.
        const meaningfulText = cleanedText
          .replace(/[{}\[\]`"'.,:;()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (meaningfulText) {
          content.push({ type: 'text', text: cleanedText });
        }

        for (const tc of extractedCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: parseToolArguments(tc.function.arguments),
          });
        }

        return { content, stop_reason: 'tool_use' };
      }
    }

    // Plain text response - no tool calls
    content.push({
      type: 'text',
      text: messageContent || 'I could not generate a response. Please try again.',
    });

    return { content, stop_reason: 'end_turn' };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let ollamaClientInstance: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaClientInstance) {
    ollamaClientInstance = new OllamaClient();
  }
  return ollamaClientInstance;
}

export { OllamaClient };
