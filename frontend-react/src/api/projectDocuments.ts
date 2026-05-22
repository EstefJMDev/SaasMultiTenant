import { apiClient } from "@shared/api/client";

export interface ProjectDocument {
  id: number;
  tenant_id?: number | null;
  project_id: number;
  doc_type: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  url: string;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchProjectDocuments(
  projectId: number,
  tenantId?: number,
): Promise<ProjectDocument[]> {
  const response = await apiClient.get<ProjectDocument[]>(
    `/api/v1/erp/projects/${projectId}/documents`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function uploadProjectDocument(
  projectId: number,
  file: File,
  docType: string,
  tenantId?: number,
): Promise<ProjectDocument> {
  const formData = new FormData();
  formData.append("doc_type", docType);
  formData.append("file", file);
  const response = await apiClient.post<ProjectDocument>(
    `/api/v1/erp/projects/${projectId}/documents`,
    formData,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

