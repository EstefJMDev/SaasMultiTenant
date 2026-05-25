import { apiClient } from "@shared/api/client";

export interface TimeSessionBlock {
  id: number;
  task_id: number | null;
  user_id: number;
  description?: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  is_active: boolean;
  created_at: string;
}

export interface TimeSessionCreatePayload {
  task_id?: number | null;
  description?: string | null;
  started_at: string;
  ended_at: string;
}

export interface TimeSessionUpdatePayload {
  task_id?: number | null;
  description?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export async function fetchTimeSessions(
  dateFrom: string,
  dateTo: string,
): Promise<TimeSessionBlock[]> {
  const response = await apiClient.get<TimeSessionBlock[]>(
    "/api/v1/erp/time-sessions",
    {
      params: {
        date_from: dateFrom,
        date_to: dateTo,
      },
    },
  );
  return response.data;
}

export async function createTimeSession(
  payload: TimeSessionCreatePayload,
): Promise<TimeSessionBlock> {
  const response = await apiClient.post<TimeSessionBlock>(
    "/api/v1/erp/time-sessions",
    payload,
  );
  return response.data;
}

export async function updateTimeSession(
  sessionId: number,
  payload: TimeSessionUpdatePayload,
): Promise<TimeSessionBlock> {
  const response = await apiClient.patch<TimeSessionBlock>(
    `/api/v1/erp/time-sessions/${sessionId}`,
    payload,
  );
  return response.data;
}

export async function deleteTimeSession(sessionId: number): Promise<void> {
  await apiClient.delete(`/api/v1/erp/time-sessions/${sessionId}`);
}

