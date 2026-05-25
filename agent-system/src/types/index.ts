// Types for Agent System

export type AgentType = 'documents' | 'users' | 'finance' | 'analysis' | 'projects' | 'tasks' | 'resources';

export interface UserMessage {
  userId: string;
  message: string;
  sessionId: string;
  tenantId: string;
  file?: {
    buffer: Buffer;
    originalName: string;
    mimetype: string;
  };
}

export interface AgentAction {
  agentType: AgentType;
  toolName: string;
  inputParams: Record<string, unknown>;
  requiresConfirmation: boolean;
  description: string; // Human-readable summary
}

export interface ConfirmationRequest {
  id: string;
  userId: string;
  tenantId: string;
  sessionId: string;
  action: AgentAction;
  proposedAt: Date;
  expiresAt: Date;
  confirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: Date;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentLog {
  id: string;
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
  createdAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  agentType?: AgentType;
  action?: AgentAction;
  confirmationRequired?: boolean;
  confirmationId?: string;
  data?: unknown;
  conversationHistory?: ChatMessage[];
  sessionId: string;
  timestamp: Date;
}

// Tool definitions for Claude
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}
