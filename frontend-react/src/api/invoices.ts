import { apiClient } from "@shared/api/client";

export type InvoiceStatus =
  | "uploaded"
  | "extracting"
  | "extracted"
  | "suggested"
  | "validated"
  | "pending"
  | "paid"
  | "failed";

export interface Invoice {
  id: number;
  tenant_id: number;
  created_by_id: number;
  project_id?: number | null;
  department_id?: number | null;
  status: InvoiceStatus;
  file_path: string;
  original_filename?: string | null;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount?: string | number | null;
  currency?: string | null;
  concept?: string | null;
  subsidizable?: boolean | null;
  expense_type?: string | null;
  milestone_id?: number | null;
  budget_milestone_id?: number | null;
  raw_text?: string | null;
  extraction_raw_json?: Record<string, unknown> | null;
  extraction_meta?: Record<string, unknown> | null;
  classification_suggestions?: Record<string, unknown> | null;
  extraction_error?: string | null;
  created_at: string;
  updated_at: string;
  extracted_at?: string | null;
  validated_at?: string | null;
  paid_at?: string | null;
}

export interface InvoiceUpdatePayload {
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  concept?: string | null;
  subsidizable?: boolean | null;
  expense_type?: string | null;
  milestone_id?: number | null;
  budget_milestone_id?: number | null;
  project_id?: number | null;
  department_id?: number | null;
  status?: InvoiceStatus;
}

export interface InvoiceFilters {
  projectId?: number | null;
  departmentId?: number | null;
  status?: InvoiceStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

const buildTenantHeaders = (tenantId?: number) =>
  tenantId
    ? {
        headers: {
          "X-Tenant-Id": tenantId.toString(),
        },
      }
    : undefined;

export async function fetchInvoices(
  tenantId?: number,
  filters: InvoiceFilters = {},
): Promise<Invoice[]> {
  const params: Record<string, string> = {};
  if (filters.projectId) params.project_id = String(filters.projectId);
  if (filters.departmentId) params.department_id = String(filters.departmentId);
  if (filters.status) params.status = String(filters.status);
  if (filters.dateFrom) params.date_from = filters.dateFrom;
  if (filters.dateTo) params.date_to = filters.dateTo;

  const response = await apiClient.get<Invoice[]>(
    "/api/v1/invoices",
    {
      params,
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data;
}

export async function fetchInvoice(
  invoiceId: number,
  tenantId?: number,
): Promise<Invoice> {
  const response = await apiClient.get<Invoice>(
    `/api/v1/invoices/${invoiceId}`,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function uploadInvoice(
  file: File,
  tenantId?: number,
  projectId?: number,
  subsidizable?: boolean | null,
  expenseType?: string | null,
  milestoneId?: number | null,
  budgetMilestoneId?: number | null,
): Promise<Invoice> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) {
    formData.append("project_id", String(projectId));
  }
  if (subsidizable !== null && subsidizable !== undefined) {
    formData.append("subsidizable", String(subsidizable));
  }
  if (expenseType) {
    formData.append("expense_type", expenseType);
  }
  if (milestoneId) {
    formData.append("milestone_id", String(milestoneId));
  }
  if (budgetMilestoneId) {
    formData.append("budget_milestone_id", String(budgetMilestoneId));
  }
  const response = await apiClient.post<Invoice>(
    "/api/v1/invoices",
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

export async function updateInvoice(
  invoiceId: number,
  payload: InvoiceUpdatePayload,
  tenantId?: number,
): Promise<Invoice> {
  const response = await apiClient.patch<Invoice>(
    `/api/v1/invoices/${invoiceId}`,
    payload,
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function markInvoicePaid(
  invoiceId: number,
  tenantId?: number,
): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(
    `/api/v1/invoices/${invoiceId}/mark-paid`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function deleteInvoice(
  invoiceId: number,
  tenantId?: number,
): Promise<void> {
  await apiClient.delete(`/api/v1/invoices/${invoiceId}`, buildTenantHeaders(tenantId));
}

export async function reprocessInvoice(
  invoiceId: number,
  tenantId?: number,
): Promise<Invoice> {
  const response = await apiClient.post<Invoice>(
    `/api/v1/invoices/${invoiceId}/reprocess`,
    {},
    buildTenantHeaders(tenantId),
  );
  return response.data;
}

export async function downloadInvoiceFile(
  invoiceId: number,
  tenantId?: number,
): Promise<Blob> {
  const response = await apiClient.get(
    `/api/v1/invoices/${invoiceId}/download`,
    {
      responseType: "blob",
      ...(buildTenantHeaders(tenantId) ?? {}),
    },
  );
  return response.data as Blob;
}

