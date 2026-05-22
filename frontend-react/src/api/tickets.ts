import { apiClient } from "@shared/api/client";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Ticket {
  id: number;
  tenant_id: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  tool_slug: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  has_attachments: boolean;
  created_by_email: string;
  assigned_to_email: string | null;
}

export interface TicketMessage {
  id: number;
  author_email: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface TicketFilters {
  tenant_id?: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  tool_slug?: string;
  category?: string;
  mine_only?: boolean;
  limit?: number;
  offset?: number;
}

export async function fetchTickets(filters: TicketFilters = {}): Promise<Ticket[]> {
  const response = await apiClient.get<Ticket[]>("/api/v1/tickets", {
    params: filters,
  });
  return response.data;
}

export async function createTicket(payload: {
  subject: string;
  description: string;
  tool_slug?: string;
  category?: string;
  priority?: TicketPriority;
}): Promise<Ticket> {
  const response = await apiClient.post<Ticket>("/api/v1/tickets", payload);
  return response.data;
}

export async function updateTicket(
  ticketId: number,
  payload: { priority?: TicketPriority; status?: TicketStatus },
): Promise<Ticket> {
  const response = await apiClient.patch<Ticket>(
    `/api/v1/tickets/${ticketId}`,
    payload,
  );
  return response.data;
}

export async function fetchTicketMessages(ticketId: number): Promise<TicketMessage[]> {
  const response = await apiClient.get<TicketMessage[]>(
    `/api/v1/tickets/${ticketId}/messages`,
  );
  return response.data;
}

export async function addTicketMessage(params: {
  ticketId: number;
  body: string;
  is_internal?: boolean;
}): Promise<TicketMessage> {
  const response = await apiClient.post<TicketMessage>(
    `/api/v1/tickets/${params.ticketId}/messages`,
    {
      body: params.body,
      is_internal: params.is_internal ?? false,
    },
  );
  return response.data;
}

export async function closeTicket(ticketId: number): Promise<Ticket> {
  const response = await apiClient.post<Ticket>(
    `/api/v1/tickets/${ticketId}/close`,
  );
  return response.data;
}

export async function reopenTicket(ticketId: number): Promise<Ticket> {
  const response = await apiClient.post<Ticket>(
    `/api/v1/tickets/${ticketId}/reopen`,
  );
  return response.data;
}

export async function assignTicket(params: {
  ticketId: number;
  assigneeId: number;
}): Promise<Ticket> {
  const response = await apiClient.post<Ticket>(
    `/api/v1/tickets/${params.ticketId}/assign`,
    {
      assignee_id: params.assigneeId,
    },
  );
  return response.data;
}

