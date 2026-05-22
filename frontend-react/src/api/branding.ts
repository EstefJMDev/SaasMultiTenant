import { apiClient } from "@shared/api/client";

export interface BrandingResponse {
  logo: string | null;
  accent_color: string;
  color_palette: Record<string, string>;
  company_name?: string | null;
  company_subtitle?: string | null;
  show_company_name?: boolean | null;
  show_company_subtitle?: boolean | null;
  department_emails?: Record<string, string> | null;
  updated_at?: string | null;
}

export async function fetchBranding(tenantId: number): Promise<BrandingResponse> {
  const response = await apiClient.get<BrandingResponse>(
    `/api/v1/branding/${tenantId}`,
  );
  return response.data;
}

export async function updateBranding(
  tenantId: number,
  payload: {
    accentColor?: string;
    logoFile?: File | null;
    companyName?: string;
    companySubtitle?: string;
    showCompanyName?: boolean;
    showCompanySubtitle?: boolean;
    departmentEmails?: Record<string, string>;
  },
): Promise<BrandingResponse> {
  const formData = new FormData();
  if (payload.accentColor) {
    formData.append("accent_color", payload.accentColor);
  }
  if (payload.companyName !== undefined) {
    formData.append("company_name", payload.companyName);
  }
  if (payload.companySubtitle !== undefined) {
    formData.append("company_subtitle", payload.companySubtitle);
  }
  if (payload.showCompanyName !== undefined) {
    formData.append("show_company_name", String(payload.showCompanyName));
  }
  if (payload.showCompanySubtitle !== undefined) {
    formData.append("show_company_subtitle", String(payload.showCompanySubtitle));
  }
  if (payload.departmentEmails !== undefined) {
    formData.append(
      "department_emails",
      JSON.stringify(payload.departmentEmails ?? {}),
    );
  }
  if (payload.logoFile) {
    formData.append("logo", payload.logoFile);
  }
  const response = await apiClient.put<BrandingResponse>(
    `/api/v1/branding/${tenantId}`,
    formData,
  );
  return response.data;
}

