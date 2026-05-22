import { apiClient } from "@shared/api/client";
import { parseApiResponse } from "@shared/api/parseResponse";
import {
  CurrentUserSchema,
  TenantUserSummarySchema,
  TenantOptionSchema,
  InvitationValidationSchema,
  type CurrentUser,
  type TenantUserSummary,
  type TenantOption,
  type InvitationValidation,
} from "@shared/api/schemas/user.schemas";
import { z } from "zod";

export type { CurrentUser, TenantUserSummary, TenantOption, InvitationValidation };

export interface UserInvitationCreate {
  email: string;
  full_name?: string | null;
  tenant_id?: number | null;
  role_name: string;
}

export interface InvitationAcceptPayload {
  token: string;
  full_name: string;
  password: string;
  password_confirm: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get("/api/v1/users/me");
  return parseApiResponse(CurrentUserSchema, response.data, "users/me");
}

export async function fetchUsersByTenant(
  tenantId: number,
  options?: { excludeAssigned?: boolean },
): Promise<TenantUserSummary[]> {
  const response = await apiClient.get(
    `/api/v1/users/by-tenant/${tenantId}`,
    {
      params: { exclude_assigned: options?.excludeAssigned ?? false },
      headers: { "X-Tenant-Id": tenantId.toString() },
    },
  );
  return parseApiResponse(z.array(TenantUserSummarySchema), response.data, "users/by-tenant");
}

export async function fetchAllTenants(): Promise<TenantOption[]> {
  const response = await apiClient.get("/api/v1/tenants/");
  return parseApiResponse(z.array(TenantOptionSchema), response.data, "tenants");
}

export async function createUserInvitation(payload: UserInvitationCreate): Promise<void> {
  await apiClient.post("/api/v1/invitations", payload);
}

export async function validateInvitation(token: string): Promise<InvitationValidation> {
  const response = await apiClient.get("/api/v1/invitations/validate", { params: { token } });
  return parseApiResponse(InvitationValidationSchema, response.data, "invitations/validate");
}

export async function acceptInvitation(payload: InvitationAcceptPayload): Promise<void> {
  await apiClient.post("/api/v1/invitations/accept", payload);
}



