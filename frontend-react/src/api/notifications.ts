import { apiClient } from "@shared/api/client";

export type NotificationType =
  | "ticket_assigned"
  | "ticket_comment"
  | "ticket_status"
  | "generic";

export interface NotificationMeta {
  entity?: "contract" | "comparative" | "ticket" | "task" | "project" | string;
  contract_id?: number;
  ticket_id?: number;
  task_id?: number;
  project_id?: number;
  document_id?: number;
  view?: string;
  mode?: "ver" | "editar";
  doc?: string;
  event?: string;
  [k: string]: unknown;
}

export interface NotificationItem {
  id: number;
  tenant_id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  reference?: string | null;
  meta?: NotificationMeta | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_total: number;
}

export interface NotificationUnreadCountResponse {
  unread: number;
}

export async function fetchNotifications(
  onlyUnread = false,
  limit = 10,
): Promise<NotificationListResponse> {
  const response = await apiClient.get<NotificationListResponse>(
    "/api/v1/notifications",
    {
      params: {
        only_unread: onlyUnread,
        limit,
        offset: 0,
      },
    },
  );
  return response.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await apiClient.get<NotificationUnreadCountResponse>(
    "/api/v1/notifications/unread-count",
  );
  return response.data.unread ?? 0;
}

export async function markNotificationRead(
  notificationId: number,
): Promise<NotificationItem> {
  const response = await apiClient.post<NotificationItem>(
    `/api/v1/notifications/${notificationId}/read`,
  );
  return response.data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post("/api/v1/notifications/read-all");
}


