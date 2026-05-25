// Cliente HTTP base (axios) con configuración común
import { apiClient } from "@shared/api/client";

/**
 * Tipos y funciones para:
 * - Catálogo global de herramientas
 * - Herramientas habilitadas por tenant
 * - Lanzar herramientas con contexto de tenant
 */

/**
 * Representa una herramienta del catálogo global
 */
export interface Tool {
  id: number; // ID de la herramienta
  name: string; // Nombre visible
  slug: string; // Identificador corto (URL-safe)
  base_url: string; // URL base de la herramienta
  description?: string | null; // Descripción opcional
}

/**
 * Respuesta al lanzar una herramienta
 */
export interface ToolLaunchResponse {
  launch_url: string; // URL final para abrir la herramienta
  tool_id: number; // ID de la herramienta
  tool_name: string; // Nombre de la herramienta
}

//Obtiene el catálogo global de herramientas

export async function fetchToolCatalog(): Promise<Tool[]> {
  const response = await apiClient.get<Tool[]>("/api/v1/tools/catalog");
  return response.data;
}

//Obtiene las herramientas habilitadas para un tenant concreto

export async function fetchTenantTools(tenantId: number): Promise<Tool[]> {
  const response = await apiClient.get<Tool[]>("/api/v1/tools/by-tenant", {
    // Header para control multi-tenant
    headers: {
      "X-Tenant-Id": tenantId.toString(),
    },
  });
  return response.data;
}

/**
 * Lanza una herramienta para un tenant concreto
 *
 * El backend devuelve una URL ya firmada o contextualizada
 */
export async function launchTool(
  toolId: number,
  tenantId: number,
): Promise<ToolLaunchResponse> {
  const response = await apiClient.post<ToolLaunchResponse>(
    `/api/v1/tools/${toolId}/launch`,
    null, // No se envía body
    {
      // Header para identificar el tenant
      headers: {
        "X-Tenant-Id": tenantId.toString(),
      },
    },
  );
  return response.data;
}

//Habilita o deshabilita una herramienta para un tenant

export async function setTenantToolEnabled(
  tenantId: number,
  toolId: number,
  isEnabled: boolean,
): Promise<void> {
  await apiClient.put(`/api/v1/tools/${toolId}/by-tenant/${tenantId}`, {
    is_enabled: isEnabled, // Estado de activación
  });
}

