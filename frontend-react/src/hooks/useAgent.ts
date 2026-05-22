import { useState, useCallback, useMemo } from 'react';
import {
  clearPersistedAgentSession,
  createAgentSessionId,
  readPersistedAgentSession,
} from './agentSessionStorage';
import { readAccessToken } from '@shared/auth/tokenStorage';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentAction {
  agentType: string;
  toolName: string;
  description: string;
  inputParams: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  agentType?: string;
  sessionId?: string;
  confirmationRequired?: boolean;
  confirmationId?: string;
  action?: AgentAction;
  conversationHistory?: AgentMessage[];
  timestamp?: string;
  error?: string;
  data?: unknown;
}

interface UseAgentConfig {
  baseUrl?: string;
  userId?: string;
  tenantId?: string;
}

interface SessionHistoryResponse {
  success: boolean;
  sessionId: string;
  history: AgentMessage[];
  error?: string;
}

const ENV_AGENT_BASE_URL =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_AGENT_BASE_URL as string | undefined)
    : undefined;
const IS_DEV =
  typeof import.meta !== 'undefined' ? Boolean(import.meta.env.DEV) : false;
const AGENT_TIMEOUT_MS =
  (typeof import.meta !== 'undefined'
    ? Number(import.meta.env.VITE_AGENT_TIMEOUT_MS)
    : Number.NaN) || 45000;

const normalizeBaseUrl = (value?: string): string => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const buildAgentUrl = (baseUrl: string, path: string): string => {
  if (!baseUrl) return path;
  return `${baseUrl}${path}`;
};

const getAgentCandidateUrls = (baseUrl: string, path: string): string[] => {
  const primary = buildAgentUrl(baseUrl, path);
  if (baseUrl) return [primary];
  if (IS_DEV) {
    const host =
      typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    // Prioritize same-origin proxy to preserve auth context/cookies.
    // Keep direct localhost backend only as local fallback.
    return isLocalHost
      ? [primary, `http://localhost:3000${path}`]
      : [primary];
  }
  return [primary];
};

const parseResponsePayload = async (
  response: Response
): Promise<AgentResponse> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return {
      success: false,
      message: '',
      error: `Respuesta vacia del servidor (${response.status})`,
    };
  }

  try {
    return JSON.parse(raw) as AgentResponse;
  } catch {
    return {
      success: false,
      message: '',
      error: `Respuesta no JSON del servidor (${response.status}): ${raw.slice(0, 180)}`,
    };
  }
};

const shouldRetryWithNextUrl = (
  response: Response,
  payload: AgentResponse
): boolean => {
  if (response.status < 500) return false;
  const message = (payload.error || payload.message || '').trim();
  return (
    message.length === 0 ||
    message.startsWith('Respuesta vacia del servidor') ||
    message.startsWith('Respuesta no JSON del servidor')
  );
};

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = AGENT_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const readStoredAuthToken = (): string | null => {
  return readAccessToken();
};

const buildJsonAgentHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = readStoredAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const buildUploadHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = readStoredAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export function useAgent(config: UseAgentConfig = {}) {
  const BASE_URL = normalizeBaseUrl(config.baseUrl || ENV_AGENT_BASE_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedUserId = useMemo(
    () => config.userId || localStorage.getItem('userId') || 'user123',
    [config.userId]
  );
  const resolvedTenantId = useMemo(
    () => config.tenantId || localStorage.getItem('tenantId') || '1',
    [config.tenantId]
  );
  const [sessionId, setSessionId] = useState<string>(() => {
    const persisted = readPersistedAgentSession(resolvedUserId, resolvedTenantId);
    return persisted?.sessionId || createAgentSessionId();
  });

  // Obtener datos del usuario actual
  const getCurrentUser = useCallback(() => {
    return {
      // ACTUALIZA ESTAS LÍNEAS CON TUS DATOS REALES:
      userId: resolvedUserId,
      tenantId: resolvedTenantId,
    };
  }, [resolvedTenantId, resolvedUserId]);

  // Enviar mensaje al agente
  const chat = useCallback(
    async (message: string): Promise<AgentResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const { userId, tenantId } = getCurrentUser();

        const payload = JSON.stringify({
          userId,
          tenantId,
          message,
          sessionId,
        });
        const candidateUrls = getAgentCandidateUrls(BASE_URL, '/agent/chat');
        let lastError = 'Error al procesar la solicitud';

        for (let i = 0; i < candidateUrls.length; i += 1) {
          const targetUrl = candidateUrls[i];
          let response: Response;
          try {
            response = await fetchWithTimeout(targetUrl, {
              method: 'POST',
              headers: buildJsonAgentHeaders(),
              credentials: 'include',
              body: payload,
            });
          } catch (fetchError) {
            const hasMoreCandidates = i < candidateUrls.length - 1;
            if (hasMoreCandidates) {
              continue;
            }
            throw fetchError;
          }

          const data = await parseResponsePayload(response);

          if (response.ok) {
            return data;
          }

          lastError =
            data.error || `Error HTTP ${response.status} al procesar la solicitud`;

          const hasMoreCandidates = i < candidateUrls.length - 1;
          if (hasMoreCandidates && shouldRetryWithNextUrl(response, data)) {
            continue;
          }

          setError(lastError);
          return null;
        }
        setError(lastError);
        return null;
      } catch (err) {
        const errorMsg =
          err instanceof DOMException && err.name === 'AbortError'
            ? `Timeout del agente tras ${Math.round(AGENT_TIMEOUT_MS / 1000)}s. El backend/LLM no respondio a tiempo.`
            : err instanceof TypeError
              ? `No se pudo conectar con el servicio del agente (${buildAgentUrl(BASE_URL, '/agent/chat')}). Verifica que el backend del agente este levantado.`
              : err instanceof Error
                ? err.message
                : 'Error desconocido';
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, getCurrentUser, BASE_URL]
  );

  // Confirmar una acción
  const confirmAction = useCallback(
    async (confirmationId: string): Promise<AgentResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const { userId } = getCurrentUser();

        const payload = JSON.stringify({
          confirmationId,
          userId,
        });
        const candidateUrls = getAgentCandidateUrls(BASE_URL, '/agent/confirm');
        let lastError = 'Error al confirmar';

        for (let i = 0; i < candidateUrls.length; i += 1) {
          const response = await fetchWithTimeout(candidateUrls[i], {
            method: 'POST',
            headers: buildJsonAgentHeaders(),
            credentials: 'include',
            body: payload,
          });

          const data = await parseResponsePayload(response);

          if (response.ok) {
            return data;
          }

          lastError = data.error || `Error HTTP ${response.status} al confirmar`;
          const hasMoreCandidates = i < candidateUrls.length - 1;
          if (hasMoreCandidates && shouldRetryWithNextUrl(response, data)) {
            continue;
          }

          setError(lastError);
          return null;
        }
        setError(lastError);
        return null;
      } catch (err) {
        const errorMsg =
          err instanceof DOMException && err.name === 'AbortError'
            ? `Timeout al confirmar tras ${Math.round(AGENT_TIMEOUT_MS / 1000)}s.`
            : err instanceof TypeError
              ? `No se pudo conectar con el servicio del agente (${buildAgentUrl(BASE_URL, '/agent/confirm')}).`
              : err instanceof Error
                ? err.message
                : 'Error desconocido';
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getCurrentUser, BASE_URL]
  );

  // Rechazar una acción
  const rejectAction = useCallback(
    async (confirmationId: string): Promise<boolean> => {
      setLoading(true);

      try {
        const { userId } = getCurrentUser();

        const payload = JSON.stringify({
          confirmationId,
          userId,
        });
        const candidateUrls = getAgentCandidateUrls(BASE_URL, '/agent/reject');

        for (let i = 0; i < candidateUrls.length; i += 1) {
          const response = await fetchWithTimeout(candidateUrls[i], {
            method: 'POST',
            headers: buildJsonAgentHeaders(),
            credentials: 'include',
            body: payload,
          });
          if (response.ok) return true;

          const data = await parseResponsePayload(response);
          const hasMoreCandidates = i < candidateUrls.length - 1;
          if (hasMoreCandidates && shouldRetryWithNextUrl(response, data)) {
            continue;
          }
          setError(data.error || `Error HTTP ${response.status} al rechazar`);
          return false;
        }
        return false;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError(`Timeout al rechazar tras ${Math.round(AGENT_TIMEOUT_MS / 1000)}s.`);
        } else {
          setError('Error al rechazar la acción');
        }
        return false;
      } finally {
        setLoading(false);
      }
    },
    [getCurrentUser, BASE_URL]
  );

  // Cargar archivo CSV/Excel
  const uploadFile = useCallback(
    async (file: File, message?: string): Promise<AgentResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const { userId, tenantId } = getCurrentUser();
        const formData = new FormData();

        formData.append('file', file);
        formData.append('userId', userId);
        formData.append('tenantId', tenantId);
        formData.append('sessionId', sessionId);
        if (message) {
          formData.append('message', message);
        }

        const candidateUrls = getAgentCandidateUrls(BASE_URL, '/agent/upload');
        let lastError = 'Error al cargar archivo';

        for (let i = 0; i < candidateUrls.length; i += 1) {
          const response = await fetchWithTimeout(candidateUrls[i], {
            method: 'POST',
            headers: buildUploadHeaders(),
            credentials: 'include',
            body: formData,
          });

          const data = await parseResponsePayload(response);
          if (response.ok) {
            return data;
          }

          lastError = data.error || `Error HTTP ${response.status} al cargar archivo`;
          const hasMoreCandidates = i < candidateUrls.length - 1;
          if (hasMoreCandidates && shouldRetryWithNextUrl(response, data)) {
            continue;
          }
          setError(lastError);
          return null;
        }
        setError(lastError);
        return null;
      } catch (err) {
        const errorMsg =
          err instanceof DOMException && err.name === 'AbortError'
            ? `Timeout al subir archivo tras ${Math.round(AGENT_TIMEOUT_MS / 1000)}s.`
            : err instanceof Error
              ? err.message
              : 'Error desconocido';
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, getCurrentUser, BASE_URL]
  );

  const getSessionHistory = useCallback(async (): Promise<AgentMessage[]> => {
    const { userId } = getCurrentUser();
    const candidateUrls = getAgentCandidateUrls(
      BASE_URL,
      `/agent/session/${encodeURIComponent(sessionId)}/history?userId=${encodeURIComponent(userId)}`
    );

    for (let i = 0; i < candidateUrls.length; i += 1) {
      try {
        const response = await fetchWithTimeout(candidateUrls[i], {
          method: 'GET',
          credentials: 'include',
        });
        const raw = (await response.json()) as SessionHistoryResponse;
        if (response.ok && raw.success && Array.isArray(raw.history)) {
          return raw.history;
        }
      } catch {
        const hasMoreCandidates = i < candidateUrls.length - 1;
        if (hasMoreCandidates) {
          continue;
        }
      }
    }

    return [];
  }, [BASE_URL, getCurrentUser, sessionId]);

  const resetSession = useCallback(async (): Promise<string> => {
    const { userId, tenantId } = getCurrentUser();
    const previousSessionId = sessionId;

    try {
      const candidateUrls = getAgentCandidateUrls(
        BASE_URL,
        `/agent/session/${encodeURIComponent(previousSessionId)}`
      );
      for (let i = 0; i < candidateUrls.length; i += 1) {
        try {
          await fetchWithTimeout(candidateUrls[i], {
            method: 'DELETE',
            credentials: 'include',
          });
          break;
        } catch {
          const hasMoreCandidates = i < candidateUrls.length - 1;
          if (!hasMoreCandidates) break;
        }
      }
    } catch {
      // Best effort only.
    }

    clearPersistedAgentSession(userId, tenantId);
    const nextSessionId = createAgentSessionId();
    setSessionId(nextSessionId);
    return nextSessionId;
  }, [BASE_URL, getCurrentUser, sessionId]);

  return {
    chat,
    confirmAction,
    rejectAction,
    uploadFile,
    getSessionHistory,
    resetSession,
    loading,
    error,
    sessionId,
    clearError: () => setError(null),
  };
}
