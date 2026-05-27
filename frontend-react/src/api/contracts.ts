import { apiClient, buildTenantHeaders, withTenant } from "@shared/api/client";
import {
  addDeletedContractId,
  getDeletedContractIds,
} from "@shared/storage/deletedContracts";

export type ContractStatus =
  | "DRAFT"
  | "PENDING_SUPPLIER"
  | "PENDING_JEFE_OBRA"
  | "PENDING_GERENCIA"
  | "PENDING_DEPARTAMENTOS"
  | "PENDING_ADMIN"
  | "PENDING_COMPRAS"
  | "PENDING_JURIDICO"
  | "IN_SIGNATURE"
  | "SIGNED"
  | "REJECTED"
  // FASE 3-8 (nuevo flujo)
  | "PENDING_TEMPLATE"
  | "PENDING_DATA_VALIDATION"
  | "PENDING_REVIEW"
  | "FULLY_APPROVED"
  | "SENT_FOR_SIGNATURE";

export type ComparativeStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "PENDING_MGMT_APPROVAL"
  | "NEEDS_CHANGES"
  | "APPROVED"
  | "REJECTED";

export type ContractType = "SUMINISTRO" | "SERVICIO" | "SUBCONTRATACION";

export interface Contract {
  id: number;
  tenant_id: number;
  created_by_id: number;
  project_id?: number | null;
  type: ContractType;
  status: ContractStatus;
  comparative_status?: ComparativeStatus;
  title?: string | null;
  description?: string | null;
  selected_offer_id?: number | null;
  assigned_admin_user_id?: number | null;
  assigned_admin_user_name?: string | null;
  supplier_name?: string | null;
  supplier_display_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  supplier_city?: string | null;
  supplier_postal_code?: string | null;
  supplier_country?: string | null;
  supplier_contact_name?: string | null;
  supplier_bank_iban?: string | null;
  supplier_bank_bic?: string | null;
  supplier_legal_rep_name?: string | null;
  supplier_legal_rep_dni?: string | null;
  total_amount?: string | number | null;
  insurance_amount?: string | number | null;
  currency?: string | null;
  milestones_text?: string | null;
  freight_responsible?: string | null;
  unloading_responsible?: string | null;
  project_number?: string | null;
  promoter?: string | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  duration_text?: string | null;
  payment_method?: string | null;
  payment_days?: number | null;
  payment_method_other_text?: string | null;
  deed_type?: string | null;
  deed_date?: string | null;
  notary_name?: string | null;
  notary_protocol?: string | null;
  warranty_text?: string | null;
  service_category?: string | null;
  min_workers?: number | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  signed_at?: string | null;
  deleted_at?: string | null;
  rejected_at?: string | null;
  rejected_by_id?: number | null;
  rejected_reason?: string | null;
  current_pending_department?: string | null;
  current_pending_department_id?: number | null;
  current_pending_step_order?: number | null;
  template_id?: number | null;
}

export interface ContractTemplate {
  id: number;
  tenant_id: number;
  name: string;
  subtype: string;
  original_filename: string;
  file_format: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
}

export interface ContractFieldValidation {
  missing: string[];
  is_complete: boolean;
}

export interface ReviewApproval {
  id: number;
  department_name: string;
  approver_role?:
    | "ADMIN"
    | "JURIDICO"
    | "JEFE_OBRA"
    | "DIRECTOR_TECNICO"
    | "GERENCIA"
    | "OBRA"
    | "COMPRAS"
    | string;
  step_order: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  cycle_number?: number | null;
  decided_by_id?: number | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
  comment?: string | null;
}

export interface ContractOffer {
  id: number;
  tenant_id: number;
  contract_id: number;
  created_by_id: number;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
  notes?: string | null;
  file_path?: string | null;
  original_filename?: string | null;
  created_at: string;
}

export interface ContractDocument {
  id: number;
  tenant_id: number;
  contract_id: number;
  doc_type: "COMPARATIVE" | "CONTRACT" | "SIGNED";
  path: string;
  created_by_id?: number | null;
  created_at: string;
}

export interface ContractFilters {
  status?: ContractStatus | null;
  pendingOnly?: boolean;
  assignedToMe?: boolean;
}

export interface ContractCreatePayload {
  type: ContractType;
  title?: string | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
}

export interface ContractUpdatePayload {
  type?: ContractType;
  title?: string | null;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_address?: string | null;
  supplier_city?: string | null;
  supplier_postal_code?: string | null;
  supplier_country?: string | null;
  supplier_contact_name?: string | null;
  supplier_bank_iban?: string | null;
  supplier_bank_bic?: string | null;
  supplier_legal_rep_name?: string | null;
  supplier_legal_rep_dni?: string | null;
  total_amount?: number | null;
  insurance_amount?: number | null;
  currency?: string | null;
  milestones_text?: string | null;
  freight_responsible?: string | null;
  unloading_responsible?: string | null;
  project_number?: string | null;
  promoter?: string | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  duration_text?: string | null;
  payment_method?: string | null;
  payment_days?: number | null;
  payment_method_other_text?: string | null;
  deed_type?: string | null;
  deed_date?: string | null;
  notary_name?: string | null;
  notary_protocol?: string | null;
  warranty_text?: string | null;
  service_category?: string | null;
  min_workers?: number | null;
  comparative_data?: Record<string, unknown> | null;
  contract_data?: Record<string, unknown> | null;
}

export interface ContractOfferCreatePayload {
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface ContractApprovalPayload {
  comment?: string | null;
}

export interface ContractWorkflowStep {
  id: number;
  tenant_id: number;
  department_id?: number | null;
  department_name: string;
  step_order: number;
  is_active: boolean;
}

export interface ContractWorkflowConfig {
  steps: ContractWorkflowStep[];
}

export interface ContractWorkflowApproval {
  id: number;
  tenant_id: number;
  contract_id: number;
  step_order: number;
  department_id?: number | null;
  department_name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decided_by_id?: number | null;
  decided_by_name?: string | null;
  decided_by_department?: string | null;
  decided_at?: string | null;
  comment?: string | null;
}

export interface ContractComparativeApproval {
  id: number;
  tenant_id: number;
  contract_id: number;
  department: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  cycle_number?: number;
  created_at?: string | null;
  decided_by_id?: number | null;
  decided_by_name?: string | null;
  decided_by_department?: string | null;
  decided_at?: string | null;
  comment?: string | null;
}

export interface ContractWorkflowConfigUpdatePayload {
  steps: Array<{
    department_id: number;
    step_order: number;
  }>;
}

export interface ContractRejectPayload {
  reason: string;
  back_to_status?: ContractStatus | null;
}

export interface Supplier {
  id: number;
  tenant_id: number;
  tax_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  contact_name?: string | null;
  bank_iban?: string | null;
  bank_bic?: string | null;
  legal_rep_name?: string | null;
  legal_rep_dni?: string | null;
  deed_type?: string | null;
  deed_date?: string | null;
  notary_name?: string | null;
  notary_protocol?: string | null;
  status: "PENDING" | "ACTIVE";
}

export interface SupplierLookupResponse {
  found: boolean;
  supplier?: Supplier | null;
}

export interface SupplierOnboardingValidateResponse {
  token: string;
  supplier: Supplier;
  contract_id?: number | null;
  tenant_id: number;
  contract_type?: ContractType | null;
  required_fields: string[];
  missing_fields: string[];
  prefill: Record<string, string | null>;
  is_valid: boolean;
  is_used: boolean;
  is_expired: boolean;
  message?: string | null;
}

export interface SupplierOnboardingLinkResponse {
  token: string;
  url: string;
  expires_at: string;
  recipient_email?: string | null;
  email_sent: boolean;
}

export interface SupplierDataRequestRead {
  id: number;
  contract_id: number;
  token: string;
  missing_fields?: string[] | null;
  expires_at: string;
  completed_at?: string | null;
  contract_type?: string | null;
}

export interface SignatureRequestValidateResponse {
  token: string;
  contract_id: number;
  tenant_id: number;
  status: "SENT" | "SIGNED" | "EXPIRED" | "CANCELLED";
  expires_at: string;
  signed_at?: string | null;
}

export async function fetchContracts(
  tenantId?: number,
  filters: ContractFilters = {},
): Promise<Contract[]> {
  const params: Record<string, string> = {};
  if (filters.status) params.status_filter = String(filters.status);
  if (filters.pendingOnly) params.pending_only = "true";
  if (filters.assignedToMe) params.assigned_to_me = "true";

  const response = await apiClient.get<Contract[]>("/api/v1/contracts", {
    params,
    ...(withTenant(tenantId) ?? {}),
  });
  const deleted = getDeletedContractIds();
  console.log(
    "[fetchContracts] Backend devolvió",
    response.data.length,
    "contratos. IDs:",
    response.data.map((c) => c.id),
    "| IDs eliminados localStorage:",
    [...deleted],
  );
  // Defensa contra soft-delete del backend:
  // 1) Filtramos contratos con `deleted_at` marcado (si el backend lo expone).
  // 2) Filtramos IDs registrados como eliminados en este cliente.
  return response.data.filter(
    (contract) => !contract.deleted_at && !deleted.has(contract.id),
  );
}

export async function fetchComparativesV2(
  tenantId?: number,
): Promise<Contract[]> {
  const response = await apiClient.get<Contract[]>(
    "/api/v1/comparativos",
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchContractById(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  try {
    const response = await apiClient.get<Contract>(
      `/api/v1/contracts/${contractId}`,
      withTenant(tenantId),
    );
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      try {
        return await fetchComparativeV2ById(contractId, tenantId);
      } catch {
        // sigue abajo con la lógica legacy de soft-delete
      }
    }
    // Si el backend responde 404 es porque el contrato fue soft-eliminado.
    // Lo marcamos para que no vuelva a aparecer en el listado.
    if (status === 404) {
      console.log(
        "[fetchContractById] 404 para contractId=",
        contractId,
        "→ marcado como eliminado localmente",
      );
      addDeletedContractId(contractId);
    }
    throw error;
  }
}

export async function fetchComparativeV2ById(
  comparativeId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.get<Contract>(
    `/api/v1/comparativos/${comparativeId}`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchComparativeOffers(
  contractId: number,
  tenantId?: number,
): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await apiClient.get<Array<Record<string, unknown>>>(
      `/api/v1/contracts/${contractId}/comparative-offers`,
      withTenant(tenantId),
    );
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      addDeletedContractId(contractId);
    }
    return fetchComparativeOffersV2(contractId, tenantId);
  }
}

export async function fetchComparativeOffersV2(
  comparativeId: number,
  tenantId?: number,
): Promise<Array<Record<string, unknown>>> {
  const response = await apiClient.get<Array<Record<string, unknown>>>(
    `/api/v1/comparativos/${comparativeId}/comparative-offers`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function syncComparativeOffers(
  contractId: number,
  tenantId?: number,
): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await apiClient.post<Array<Record<string, unknown>>>(
      `/api/v1/contracts/${contractId}/sync-comparative-offers`,
      {},
      withTenant(tenantId),
    );
    return response.data;
  } catch (error) {
    return syncComparativeOffersV2(contractId, tenantId);
  }
}

export async function fetchContractDocuments(
  contractId: number,
  tenantId?: number,
): Promise<ContractDocument[]> {
  const response = await apiClient.get<ContractDocument[]>(
    `/api/v1/contracts/${contractId}/documents`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function createContract(
  payload: ContractCreatePayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    "/api/v1/contracts",
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function importComparativeExcel(
  file: File,
  payload: {
    type: ContractType;
    title?: string | null;
    obra_numero?: string | null;
    obra_nombre?: string | null;
    jefe_obra?: string | null;
  },
  tenantId?: number,
): Promise<Contract> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", payload.type);
  if (payload.title) formData.append("title", payload.title);
  if (payload.obra_numero) formData.append("obra_numero", payload.obra_numero);
  if (payload.obra_nombre) formData.append("obra_nombre", payload.obra_nombre);
  if (payload.jefe_obra) formData.append("jefe_obra", payload.jefe_obra);

  const response = await apiClient.post<Contract>(
    "/api/v1/contracts/comparatives/import-excel",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(buildTenantHeaders(tenantId)?.headers ?? {}),
      },
    },
  );
  return response.data;
}

export async function importComparativeExcelV2(
  file: File,
  payload: {
    type: ContractType;
    title?: string | null;
    obra_numero?: string | null;
    obra_nombre?: string | null;
    jefe_obra?: string | null;
  },
  tenantId?: number,
): Promise<Contract> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", payload.type);
  if (payload.title) formData.append("title", payload.title);
  if (payload.obra_numero) formData.append("obra_numero", payload.obra_numero);
  if (payload.obra_nombre) formData.append("obra_nombre", payload.obra_nombre);
  if (payload.jefe_obra) formData.append("jefe_obra", payload.jefe_obra);
  const response = await apiClient.post<Contract>(
    "/api/v1/comparativos/import-excel",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(buildTenantHeaders(tenantId)?.headers ?? {}),
      },
    },
  );
  return response.data;
}

export async function syncComparativeOffersV2(
  comparativeId: number,
  tenantId?: number,
): Promise<Array<Record<string, unknown>>> {
  const response = await apiClient.post<Array<Record<string, unknown>>>(
    `/api/v1/comparativos/${comparativeId}/sync-comparative-offers`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function updateContract(
  contractId: number,
  payload: ContractUpdatePayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.patch<Contract>(
    `/api/v1/contracts/${contractId}`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function saveComparativeDraft(
  contractId: number,
  payload: {
    type?: ContractType;
    title?: string | null;
    comparative_data?: Record<string, unknown> | null;
  },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.patch<Contract>(
    `/api/v1/contracts/${contractId}/comparative-draft`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function createComparativeV2(
  payload: {
    type?: ContractType;
    title?: string | null;
    comparative_data?: Record<string, unknown> | null;
  },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    "/api/v1/comparativos",
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function saveComparativeDraftV2(
  comparativeId: number,
  payload: {
    type?: ContractType;
    title?: string | null;
    comparative_data?: Record<string, unknown> | null;
  },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.patch<Contract>(
    `/api/v1/comparativos/${comparativeId}`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function deleteContract(
  contractId: number,
  tenantId?: number,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/contracts/${contractId}`,
    withTenant(tenantId),
  );
  // Registramos localmente la eliminación porque el backend hace soft-delete
  // y el listado puede seguir devolviendo el contrato.
  addDeletedContractId(contractId);
}

export async function deleteComparativeV2(
  comparativeId: number,
  tenantId?: number,
): Promise<void> {
  await apiClient.delete(
    `/api/v1/comparativos/${comparativeId}`,
    withTenant(tenantId),
  );
  addDeletedContractId(comparativeId);
}

export async function addContractOffer(
  contractId: number,
  file: File,
  payload: ContractOfferCreatePayload,
  tenantId?: number,
): Promise<ContractOffer> {
  const formData = new FormData();
  formData.append("file", file);
  if (payload.supplier_name) formData.append("supplier_name", payload.supplier_name);
  if (payload.supplier_tax_id) formData.append("supplier_tax_id", payload.supplier_tax_id);
  if (payload.supplier_email) formData.append("supplier_email", payload.supplier_email);
  if (payload.supplier_phone) formData.append("supplier_phone", payload.supplier_phone);
  if (payload.total_amount != null) formData.append("total_amount", String(payload.total_amount));
  if (payload.currency) formData.append("currency", payload.currency);
  if (payload.notes) formData.append("notes", payload.notes);

  const response = await apiClient.post<ContractOffer>(
    `/api/v1/contracts/${contractId}/offers`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      ...(withTenant(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function selectContractOffer(
  contractId: number,
  offerId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/select-offer`,
    { offer_id: offerId },
    withTenant(tenantId),
  );
  return response.data;
}

export async function generateContractDocs(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/generate-docs`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function lookupSupplierByTaxId(
  taxId: string,
  contractType?: ContractType,
  tenantId?: number,
): Promise<Supplier | null> {
  const response = await apiClient.get<SupplierLookupResponse>(
    "/api/v1/contracts/suppliers/lookup",
    {
      params: { tax_id: taxId, ...(contractType ? { contract_type: contractType } : {}) },
      ...(withTenant(tenantId) ?? {}),
    },
  );
  return response.data.found ? response.data.supplier ?? null : null;
}

export async function validateSupplierOnboarding(
  token: string,
): Promise<SupplierOnboardingValidateResponse> {
  const response = await apiClient.get<SupplierOnboardingValidateResponse>(
    `/public/supplier-onboarding/${token}`,
  );
  return response.data;
}

export async function submitSupplierOnboarding(
  token: string,
  payload: {
    razon_social?: string;
    empresa?: string;
    cif?: string;
    nombre_gerente?: string;
    nif_gerente?: string;
    direccion_empresa?: string;
    tipo_escritura?: string;
    fecha_escritura?: string;
    nombre_notario?: string;
    num_protocolo?: string;
  },
): Promise<Supplier> {
  const response = await apiClient.post<Supplier>(
    `/public/supplier-onboarding/${token}`,
    { token, ...payload },
  );
  return response.data;
}

export interface SupplierOnboardingDocs {
  escritura_poderes: File[];
  dni_firmante: File[];
  rea?: File[];
  cert_hacienda?: File[];
  cert_ss?: File[];
}

export async function completeSupplierOnboarding(
  token: string,
  textPayload: {
    razon_social: string;
    nombre_gerente: string;
    nif_gerente: string;
    direccion_empresa: string;
    tipo_escritura?: string;
    fecha_escritura?: string;
    nombre_notario?: string;
    num_protocolo?: string;
  },
  docs: SupplierOnboardingDocs,
): Promise<Supplier> {
  const formData = new FormData();
  Object.entries(textPayload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });
  const appendFiles = (key: keyof SupplierOnboardingDocs) => {
    const files = docs[key];
    if (!files) return;
    files.forEach((file) => formData.append(String(key), file));
  };
  appendFiles("escritura_poderes");
  appendFiles("dni_firmante");
  appendFiles("rea");
  appendFiles("cert_hacienda");
  appendFiles("cert_ss");

  const response = await apiClient.post<Supplier>(
    `/public/supplier-onboarding/${token}/complete`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function regenerateSupplierOnboardingLink(
  contractId: number,
  payload?: {
    supplier_tax_id?: string;
    supplier_email?: string;
  },
  tenantId?: number,
): Promise<SupplierOnboardingLinkResponse> {
  const response = await apiClient.post<SupplierOnboardingLinkResponse>(
    `/api/v1/contracts/${contractId}/supplier-onboarding-link`,
    payload ?? {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchSupplierDataRequest(
  token: string,
): Promise<SupplierDataRequestRead> {
  const response = await apiClient.get<SupplierDataRequestRead>(
    `/public/supplier/complete/${token}`,
  );
  return response.data;
}

export async function submitSupplierDataRequest(
  token: string,
  payload: Record<string, string>,
): Promise<{ status: string; contract_status?: string; message?: string }> {
  const response = await apiClient.post<{
    status: string;
    contract_status?: string;
    message?: string;
  }>(`/public/supplier/complete/${token}`, payload);
  return response.data;
}

export function getContractDocumentDownloadUrl(
  contractId: number,
  docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
  tenantId?: number,
  inline = false,
): string {
  const base = (apiClient.defaults.baseURL as string | undefined) || window.location.origin;
  const params = new URLSearchParams();
  if (tenantId != null) params.set("tenant_id", String(tenantId));
  if (inline) params.set("inline", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `${base}/api/v1/contracts/${contractId}/documents/${docType}/download${suffix}`;
}

const parseFilenameFromContentDisposition = (
  contentDisposition?: string,
): string | undefined => {
  if (!contentDisposition) return undefined;
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1];
};

export async function fetchContractDocumentBlob(
  contractId: number,
  docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
  tenantId?: number,
  inline = false,
): Promise<{ blob: Blob; filename?: string }> {
  const response = await apiClient.get<Blob>(
    `/api/v1/contracts/${contractId}/documents/${docType}/download`,
    {
      responseType: "blob",
      params: inline ? { inline: "true" } : undefined,
      ...(withTenant(tenantId) ?? {}),
    },
  );

  const contentType =
    (response.headers["content-type"] as string | undefined) ??
    "application/octet-stream";
  const blob =
    response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType });
  const filename = parseFilenameFromContentDisposition(
    response.headers["content-disposition"] as string | undefined,
  );
  return { blob, filename };
}

export async function replaceComparativeSource(
  contractId: number,
  file: File,
  tenantId?: number,
): Promise<Contract> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await apiClient.post<Contract>(
      `/api/v1/contracts/${contractId}/comparative-source/replace`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(buildTenantHeaders(tenantId)?.headers ?? {}),
        },
      },
    );
    return response.data;
  } catch (error) {
    return replaceComparativeSourceV2(contractId, file, tenantId);
  }
}

export async function replaceComparativeSourceV2(
  comparativeId: number,
  file: File,
  tenantId?: number,
): Promise<Contract> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<Contract>(
    `/api/v1/comparativos/${comparativeId}/comparative-source/replace`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(buildTenantHeaders(tenantId)?.headers ?? {}),
      },
    },
  );
  return response.data;
}

export async function fetchComparativeSourceBlob(
  contractId: number,
  tenantId?: number,
): Promise<{ blob: Blob; filename?: string }> {
  try {
    const response = await apiClient.get<Blob>(
      `/api/v1/contracts/${contractId}/comparative-source/download`,
      {
        responseType: "blob",
        ...(withTenant(tenantId) ?? {}),
      },
    );
    const contentType =
      (response.headers["content-type"] as string | undefined) ??
      "application/octet-stream";
    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: contentType });
    const filename = parseFilenameFromContentDisposition(
      response.headers["content-disposition"] as string | undefined,
    );
    return { blob, filename };
  } catch (error) {
    return fetchComparativeSourceBlobV2(contractId, tenantId);
  }
}

export async function fetchComparativeSourceBlobV2(
  comparativeId: number,
  tenantId?: number,
): Promise<{ blob: Blob; filename?: string }> {
  const response = await apiClient.get<Blob>(
    `/api/v1/comparativos/${comparativeId}/comparative-source/download`,
    {
      responseType: "blob",
      ...(withTenant(tenantId) ?? {}),
    },
  );
  const contentType =
    (response.headers["content-type"] as string | undefined) ??
    "application/octet-stream";
  const blob =
    response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: contentType });
  const filename = parseFilenameFromContentDisposition(
    response.headers["content-disposition"] as string | undefined,
  );
  return { blob, filename };
}

export async function regenerateContractPdf(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/regenerate-contract`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function validateContractSignatureToken(
  token: string,
): Promise<SignatureRequestValidateResponse> {
  const response = await apiClient.get<SignatureRequestValidateResponse>(
    `/public/contracts/sign/${token}`,
  );
  return response.data;
}

export async function submitContractSignature(
  token: string,
  payload: {
    signer_name: string;
    signer_identifier?: string;
    signer_email?: string;
    signer_company?: string;
    accepted_terms: boolean;
    file?: File | null;
    signature_image?: File | null;
  },
): Promise<SignatureRequestValidateResponse> {
  const formData = new FormData();
  formData.append("signer_name", payload.signer_name);
  formData.append("accepted_terms", payload.accepted_terms ? "true" : "false");
  if (payload.signer_identifier) formData.append("signer_identifier", payload.signer_identifier);
  if (payload.signer_email) formData.append("signer_email", payload.signer_email);
  if (payload.signer_company) formData.append("signer_company", payload.signer_company);
  if (payload.file) {
    formData.append("file", payload.file);
  }
  if (payload.signature_image) {
    formData.append("signature_image", payload.signature_image);
  }
  const response = await apiClient.post<SignatureRequestValidateResponse>(
    `/public/contracts/sign/${token}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
}

export async function submitContractGerencia(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/submit-gerencia`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export interface ReaValidationResult {
  rea: {
    encontrada: boolean | null;
    estado:
      | "ALTA"
      | "NO_CONSTA"
      | "ERROR_VALIDACION"
      | "DESCONOCIDO"
      | "ERROR_RED"
      | "SKIPPED_NOT_SUBCONTRATACION"
      | "SKIPPED_FAST_TRACK";
    tipo_identificacion?: string;
    numero?: string;
    error?: string;
  };
  supplier_in_db: boolean;
  next_action: "send_to_approval" | "send_to_supplier";
}

export async function validateRea(
  contractId: number,
  tenantId?: number,
): Promise<ReaValidationResult> {
  const response = await apiClient.post<ReaValidationResult>(
    `/api/v1/contracts/${contractId}/validate-rea`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function validateReaV2(
  comparativeId: number,
  tenantId?: number,
): Promise<ReaValidationResult> {
  const response = await apiClient.post<ReaValidationResult>(
    `/api/v1/comparativos/${comparativeId}/validate-rea`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function submitComparative(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/submit-comparative`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function submitComparativeV2(
  comparativeId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/comparativos/${comparativeId}/enviar`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function sendSupplierForm(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/send-supplier-form`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function rebuildComparative(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  try {
    const response = await apiClient.post<Contract>(
      `/api/v1/contracts/${contractId}/rebuild-comparative`,
      {},
      withTenant(tenantId),
    );
    return response.data;
  } catch (error) {
    return rebuildComparativeV2(contractId, tenantId);
  }
}

export async function approveComparative(
  contractId: number,
  payload: ContractApprovalPayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/approve-comparative`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function approveComparativeV2(
  comparativeId: number,
  payload: ContractApprovalPayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/comparativos/${comparativeId}/aprobar`,
    { comentario: payload.comment ?? null },
    withTenant(tenantId),
  );
  return response.data;
}

export async function rebuildComparativeV2(
  comparativeId: number,
  tenantId?: number,
): Promise<Contract> {
  return fetchComparativeV2ById(comparativeId, tenantId);
}

export async function rejectComparative(
  contractId: number,
  payload: { reason: string },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/reject-comparative`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function rejectComparativeV2(
  comparativeId: number,
  payload: { reason: string },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/comparativos/${comparativeId}/rechazar`,
    { motivo: payload.reason, comentario: payload.reason },
    withTenant(tenantId),
  );
  return response.data;
}

export async function approveContract(
  contractId: number,
  payload: ContractApprovalPayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/approve`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function approveAllContractPhases(
  contractId: number,
  payload: ContractApprovalPayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/approve-all-phases`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function rejectContract(
  contractId: number,
  payload: ContractRejectPayload,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/reject`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchContractWorkflow(
  tenantId?: number,
): Promise<ContractWorkflowConfig> {
  const response = await apiClient.get<ContractWorkflowConfig>(
    "/api/v1/contracts/workflow",
    withTenant(tenantId),
  );
  return response.data;
}

export async function updateContractWorkflow(
  payload: ContractWorkflowConfigUpdatePayload,
  tenantId?: number,
): Promise<ContractWorkflowConfig> {
  const response = await apiClient.put<ContractWorkflowConfig>(
    "/api/v1/contracts/workflow",
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchContractWorkflowApprovals(
  contractId: number,
  tenantId?: number,
): Promise<ContractWorkflowApproval[]> {
  const response = await apiClient.get<ContractWorkflowApproval[]>(
    `/api/v1/contracts/${contractId}/workflow-approvals`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchContractComparativeApprovals(
  contractId: number,
  tenantId?: number,
): Promise<ContractComparativeApproval[]> {
  try {
    const response = await apiClient.get<ContractComparativeApproval[]>(
      `/api/v1/contracts/${contractId}/comparative-approvals`,
      withTenant(tenantId),
    );
    return response.data;
  } catch (error) {
    return fetchComparativeApprovalsV2(contractId, tenantId);
  }
}

export async function fetchComparativeApprovalsV2(
  comparativeId: number,
  tenantId?: number,
): Promise<ContractComparativeApproval[]> {
  const response = await apiClient.get<ContractComparativeApproval[]>(
    `/api/v1/comparativos/${comparativeId}/comparative-approvals`,
    withTenant(tenantId),
  );
  return response.data;
}

// ── FASE 2 extra ──────────────────────────────────────────────────────────────

export async function returnComparative(
  contractId: number,
  comment: string,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/return-comparative`,
    { comment },
    withTenant(tenantId),
  );
  return response.data;
}

export async function returnComparativeV2(
  comparativeId: number,
  comment: string,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/comparativos/${comparativeId}/devolver`,
    { comentario: comment },
    withTenant(tenantId),
  );
  return response.data;
}

// ── FASE 3-8 (nuevo flujo) ────────────────────────────────────────────────────

export async function fetchContractTemplates(
  tenantId?: number,
  subtype?: string,
): Promise<ContractTemplate[]> {
  const params: Record<string, string> = {};
  if (subtype) params.subtype = subtype;
  const response = await apiClient.get<ContractTemplate[]>(
    "/api/v1/contracts/templates",
    { params, ...(withTenant(tenantId) ?? {}) },
  );
  return response.data;
}

export async function activateContract(
  contractId: number,
  payload: { subtype?: string | null },
  tenantId?: number,
): Promise<Contract> {
  const normalizedSubtype =
    typeof payload.subtype === "string" && payload.subtype.trim().length > 0
      ? payload.subtype.trim().toLowerCase()
      : undefined;
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/activate`,
    { subtype: normalizedSubtype },
    withTenant(tenantId),
  );
  return response.data;
}

export async function selectContractTemplate(
  contractId: number,
  templateId: number,
  tenantId?: number,
): Promise<{ contract: Contract; validation: ContractFieldValidation }> {
  const response = await apiClient.post<{ contract: Contract; validation: ContractFieldValidation }>(
    `/api/v1/contracts/${contractId}/select-template`,
    { template_id: templateId },
    withTenant(tenantId),
  );
  return response.data;
}

export async function validateContractFields(
  contractId: number,
  tenantId?: number,
): Promise<ContractFieldValidation> {
  const response = await apiClient.get<ContractFieldValidation>(
    `/api/v1/contracts/${contractId}/validate-fields`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function generateContractDocument(
  contractId: number,
  tenantId?: number,
): Promise<Contract & { validation?: ContractFieldValidation; supplier_request_token?: string }> {
  const response = await apiClient.post<Contract & { validation?: ContractFieldValidation; supplier_request_token?: string }>(
    `/api/v1/contracts/${contractId}/generate-document`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function submitReviewDecision(
  contractId: number,
  payload: { approved: boolean; comment?: string | null },
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/review-decision`,
    payload,
    withTenant(tenantId),
  );
  return response.data;
}

export async function fetchReviewApprovals(
  contractId: number,
  tenantId?: number,
): Promise<ReviewApproval[]> {
  const response = await apiClient.get<ReviewApproval[]>(
    `/api/v1/contracts/${contractId}/review-approvals`,
    withTenant(tenantId),
  );
  return response.data;
}

export async function adminApproveDraft(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/admin-approve-draft`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}

export async function sendContractForSignature(
  contractId: number,
  tenantId?: number,
): Promise<Contract> {
  const response = await apiClient.post<Contract>(
    `/api/v1/contracts/${contractId}/send-for-signature`,
    {},
    withTenant(tenantId),
  );
  return response.data;
}
