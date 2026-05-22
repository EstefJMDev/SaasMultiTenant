import { apiClient } from "@shared/api/client";

export interface WorkSite {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  client_name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkSiteWriteInput {
  code: string;
  name: string;
  client_name: string;
}

export interface ProviderItem {
  id: string;
  cif: string;
  razon_social: string;
  empresa?: string | null;
  nombre_gerente?: string | null;
  nif_gerente?: string | null;
  direccion_empresa?: string | null;
  tipo_escritura?: string | null;
  fecha_escritura?: string | null;
  nombre_notario?: string | null;
  numero_protocolo?: string | null;
}

export interface ProviderWriteInput {
  cif: string;
  razon_social: string;
  empresa?: string | null;
  nombre_gerente?: string | null;
  nif_gerente?: string | null;
  direccion_empresa?: string | null;
  tipo_escritura?: string | null;
  fecha_escritura?: string | null;
  nombre_notario?: string | null;
  numero_protocolo?: string | null;
}

export interface ProviderListResponse {
  items: ProviderItem[];
  total: number;
}

const asWorkSites = (data: unknown): WorkSite[] => {
  if (Array.isArray(data)) return data as WorkSite[];
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { items?: unknown[] }).items)
  ) {
    return (data as { items: WorkSite[] }).items;
  }
  return [];
};

const asProviderListResponse = (data: unknown): ProviderListResponse => {
  if (data && typeof data === "object" && Array.isArray((data as any).items)) {
    return {
      items: ((data as any).items ?? []) as ProviderItem[],
      total: Number((data as any).total ?? ((data as any).items ?? []).length ?? 0),
    };
  }
  if (Array.isArray(data)) {
    return {
      items: data as ProviderItem[],
      total: data.length,
    };
  }
  return { items: [], total: 0 };
};

export async function fetchWorkSites(search = "", limit = 100): Promise<WorkSite[]> {
  const { data } = await apiClient.get<unknown>("/api/v1/work/catalog/worksites", {
    params: { search, limit },
  });
  return asWorkSites(data);
}

export async function fetchWorkSiteByCode(code: string): Promise<WorkSite | null> {
  const normalized = String(code || "").trim();
  if (!normalized) return null;
  const { data } = await apiClient.get<unknown>(
    `/api/v1/work/catalog/worksites/by-code/${encodeURIComponent(normalized)}`,
  );
  if (!data || Array.isArray(data) || typeof data !== "object") return null;
  return data as WorkSite;
}

export async function createWorkSite(payload: WorkSiteWriteInput): Promise<WorkSite> {
  const { data } = await apiClient.post<WorkSite>("/api/v1/work/catalog/worksites", payload);
  return data;
}

export async function updateWorkSite(id: number, payload: WorkSiteWriteInput): Promise<WorkSite> {
  const { data } = await apiClient.patch<WorkSite>(`/api/v1/work/catalog/worksites/${id}`, payload);
  return data;
}

export async function deleteWorkSite(id: number): Promise<void> {
  await apiClient.delete(`/api/v1/work/catalog/worksites/${id}`);
}

export async function fetchProviders(params: {
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<ProviderListResponse> {
  const { data } = await apiClient.get<unknown>("/api/v1/work/catalog/providers", {
    params,
  });
  return asProviderListResponse(data);
}

export async function createProvider(payload: ProviderWriteInput): Promise<ProviderItem> {
  const { data } = await apiClient.post<ProviderItem>("/api/v1/work/catalog/providers", payload);
  return data;
}

export async function updateProvider(id: string, payload: ProviderWriteInput): Promise<ProviderItem> {
  const { data } = await apiClient.patch<ProviderItem>(
    `/api/v1/work/catalog/providers/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteProvider(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/work/catalog/providers/${encodeURIComponent(id)}`);
}
