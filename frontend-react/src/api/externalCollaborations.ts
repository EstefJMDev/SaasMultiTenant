import { apiClient } from "@shared/api/client";

export type ExternalCollaborationType =
  | "Universidades"
  | "Auditoria"
  | "Consultoras"
  | "Centros tecnologicos";

export interface ExternalCollaboration {
  id: number;
  collaboration_type: ExternalCollaborationType;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalCollaborationCreate {
  collaboration_type: ExternalCollaborationType;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
}

export type ExternalCollaborationUpdate = Partial<ExternalCollaborationCreate>;

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchExternalCollaborations(tenantId?: number) {
  const response = await apiClient.get<ExternalCollaboration[]>(
    "/api/v1/erp/external-collaborations",
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function createExternalCollaboration(
  payload: ExternalCollaborationCreate,
  tenantId?: number,
) {
  const response = await apiClient.post<ExternalCollaboration>(
    "/api/v1/erp/external-collaborations",
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function updateExternalCollaboration(
  collaborationId: number,
  payload: ExternalCollaborationUpdate,
  tenantId?: number,
) {
  const response = await apiClient.patch<ExternalCollaboration>(
    `/api/v1/erp/external-collaborations/${collaborationId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function deleteExternalCollaboration(
  collaborationId: number,
  tenantId?: number,
) {
  await apiClient.delete(
    `/api/v1/erp/external-collaborations/${collaborationId}`,
    buildTenantHeaders(tenantId),
  );
}

