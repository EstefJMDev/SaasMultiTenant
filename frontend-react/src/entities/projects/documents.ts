import type { ProjectDocument } from "@api/projectDocuments";
import {
  fetchProjectDocuments as fetchProjectDocumentsApi,
  uploadProjectDocument as uploadProjectDocumentApi,
} from "@api/projectDocuments";

export async function fetchProjectDocuments(
  projectId: number,
  tenantId?: number,
): Promise<ProjectDocument[]> {
  return fetchProjectDocumentsApi(projectId, tenantId);
}

export async function uploadProjectDocument(
  projectId: number,
  file: File,
  docType: string,
  tenantId?: number,
): Promise<ProjectDocument> {
  return uploadProjectDocumentApi(projectId, file, docType, tenantId);
}
