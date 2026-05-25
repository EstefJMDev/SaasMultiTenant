export interface PersistedAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  status?: "pending" | "sent" | "error";
}

export interface PersistedAgentSession {
  sessionId: string;
  messages: PersistedAgentMessage[];
  updatedAt: string;
}

const STORAGE_PREFIX = "agent-chat-session";

const hasSessionStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

export const buildAgentSessionStorageKey = (
  userId: string,
  tenantId: string,
): string => `${STORAGE_PREFIX}:${tenantId}:${userId}`;

export const createAgentSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `session-${crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export const readPersistedAgentSession = (
  userId: string,
  tenantId: string,
): PersistedAgentSession | null => {
  if (!hasSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(
      buildAgentSessionStorageKey(userId, tenantId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAgentSession;
    if (!parsed?.sessionId || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const persistAgentSession = (
  userId: string,
  tenantId: string,
  session: PersistedAgentSession,
): void => {
  if (!hasSessionStorage()) return;

  window.sessionStorage.setItem(
    buildAgentSessionStorageKey(userId, tenantId),
    JSON.stringify(session),
  );
};

export const clearPersistedAgentSession = (
  userId: string,
  tenantId: string,
): void => {
  if (!hasSessionStorage()) return;

  window.sessionStorage.removeItem(buildAgentSessionStorageKey(userId, tenantId));
};
